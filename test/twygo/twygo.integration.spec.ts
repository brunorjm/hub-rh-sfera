import { prisma } from "../helpers/hub";
import { gravarParticipantes, montarLinhas } from "@/lib/twygo";

const linhas = montarLinhas(
  [
    { user_id: 1, content_id: 5, status: "confirmed", approved_at: "2026-09-10T12:00:00Z", progress: 50, created_at: "2026-09-01T08:00:00Z" },
    { user_id: 2, content_id: 5, status: "pending" },
  ],
  [{ user_id: 1, name: "Pessoa Um", situation: "active" }, { user_id: 2, name: "Pessoa Dois", situation: "inactive" }],
  [{ content_id: 5, name: "Atendimento", hours: "0001:00:00" }],
);

beforeEach(async () => {
  await prisma.$executeRawUnsafe("truncate public.twygo_participantes restart identity");
  await prisma.$executeRawUnsafe("insert into public.twygo_participantes (nome_completo) values ('Dado de Ontem')");
});

afterAll(async () => {
  await prisma.$executeRawUnsafe("truncate public.twygo_participantes restart identity");
  await prisma.$disconnect();
});

it("troca a tabela inteira e converte os tipos", async () => {
  expect(await gravarParticipantes(prisma, linhas)).toBe(2);
  const r = await prisma.$queryRawUnsafe<{ nome_completo: string; aprovado_em: Date | null; progresso: string | null; carga_horaria: string | null }[]>(
    "select nome_completo, aprovado_em, progresso::text, carga_horaria::text from public.twygo_participantes order by nome_completo");
  expect(r.map((l) => l.nome_completo)).toEqual(["Pessoa Dois", "Pessoa Um"]);
  expect(r[1]!.aprovado_em?.toISOString().slice(0, 10)).toBe("2026-09-10");
  expect(r[1]!.progresso).toBe("0.5");
  expect(r[1]!.carga_horaria).toBe("1");
});

it("se falhar no meio, os dados anteriores continuam", async () => {
  const quebradas = [...linhas, { ...linhas[0]!, data_inscricao: "não é data" }];
  await expect(gravarParticipantes(prisma, quebradas, 1)).rejects.toThrow();
  const r = await prisma.$queryRawUnsafe<{ nome_completo: string }[]>("select nome_completo from public.twygo_participantes");
  expect(r.map((l) => l.nome_completo)).toEqual(["Dado de Ontem"]);
});
