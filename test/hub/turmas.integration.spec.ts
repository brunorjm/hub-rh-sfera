import { criarConta, executar, limpar, prisma } from "../helpers/hub";

type Linha = Record<string, unknown>;
const dados = (r: { status: number }) => ("dados" in r ? r.dados : undefined);
const linhas = (r: { status: number }) => (dados(r) as Linha[] | undefined) ?? [];
const erro = (r: { status: number }) => ("erro" in r ? (r as { erro: string }).erro : "");

const TABELAS = ["treinamento_turmas", "treinamento_turmas_log", "fechamento_periodo", "unibe_pdv", "unibe_pessoas", "academia_hering"];

const GESTOR = { "treinamento_dev.turmas_gestor": true };
const LANCAR = { "treinamento_dev.turmas_lancar": true };
const LEITURA = { "treinamento_dev.turmas": true };

// Turma inventada que passa nas validações de treinamento_turma_salvar.
const turma = (extra: Linha = {}) => ({
  data: "2026-10-05", tema: "Atendimento", categoria: "Comportamental", modalidade: "Presencial", local: "Loja Centro",
  hora_inicio: "09:00", hora_fim: "11:00", horas: 2, publico: "Consultoras", canal: "Loja",
  convocados: 10, presentes: 8, marcas: ["Marca A"], marca_original: "Marca A",
  multiplicadoras: ["Multiplicadora Um"], multiplicador_original: "Multiplicadora Um", planilha: "Multiplicadora Um",
  observacao: "", justificativa: "", ...extra,
});

async function turmaDe(dono: string, extra: Linha = {}): Promise<number> {
  const [r] = await prisma.$queryRawUnsafe<{ id: bigint }[]>(
    `insert into public.treinamento_turmas (origem, planilha, data, tema, horas, convocados, presentes, criado_por, justificativa)
     values ('hub', 'Planilha', $1::date, 'Tema inventado', 2, 10, 8, $2::uuid, $3) returning id`,
    (extra.data as string) ?? "2026-10-05", dono, (extra.justificativa as string) ?? null,
  );
  return Number(r!.id);
}

const fecharMes = (n: number) =>
  prisma.$executeRawUnsafe(
    `insert into public.fechamento_periodo (id, tipo, ano, n, status, snapshot) values ($1, 'mensal', 2026, $2, 'fechado', '[]')`,
    `mensal-2026-${n}`, n,
  );

beforeEach(async () => {
  await limpar(...TABELAS);
});

afterAll(async () => {
  await limpar(...TABELAS);
  await prisma.$disconnect();
});

describe("turmas.salvar", () => {
  it("multiplicadora lança: dona e nome vêm da sessão; edita a própria", async () => {
    const multi = await criarConta({ perfil: "gestor", permissoes: LANCAR });
    const r = await executar("turmas.salvar", { id: null, dados: turma() }, multi);
    expect(r.status).toBe(200);
    const id = dados(r) as number;
    expect(typeof id).toBe("number");
    const t = await prisma.treinamento_turmas.findUnique({ where: { id: BigInt(id) } });
    expect(t).toMatchObject({ criado_por: multi.id, criado_por_nome: multi.nome, origem: "hub", tema: "Atendimento" });

    expect((await executar("turmas.salvar", { id, dados: turma({ tema: "Vendas" }) }, multi)).status).toBe(200);
    const t2 = await prisma.treinamento_turmas.findUnique({ where: { id: BigInt(id) } });
    expect(t2).toMatchObject({ tema: "Vendas", atualizado_por: multi.nome });
  });

  it("recusa o nome de quem lançou vindo do navegador", async () => {
    const multi = await criarConta({ perfil: "gestor", permissoes: LANCAR });
    expect((await executar("turmas.salvar", { id: null, dados: turma({ usuario: "Outra pessoa" }) }, multi)).status).toBe(400);
  });

  it("multiplicadora não edita turma de outra pessoa nem mês fechado; o gestor pode", async () => {
    const multi = await criarConta({ perfil: "gestor", permissoes: LANCAR });
    const gestor = await criarConta({ perfil: "rh", permissoes: GESTOR });
    const alheia = await turmaDe(gestor.id);
    const r = await executar("turmas.salvar", { id: alheia, dados: turma() }, multi);
    expect(r.status).toBe(400);
    expect(erro(r)).toMatch(/só pode editar as turmas que lançou/);

    await fecharMes(10);
    const fechado = await executar("turmas.salvar", { id: null, dados: turma() }, multi);
    expect(fechado.status).toBe(400);
    expect(erro(fechado)).toMatch(/mês já foi fechado/);
    expect((await executar("turmas.salvar", { id: alheia, dados: turma({ tema: "Ajuste do gestor" }) }, gestor)).status).toBe(200);
  });

  it("validações do banco voltam como 400 com a mensagem", async () => {
    const multi = await criarConta({ perfil: "gestor", permissoes: LANCAR });
    const r = await executar("turmas.salvar", { id: null, dados: turma({ presentes: 12, justificativa: "" }) }, multi);
    expect(r.status).toBe(400);
    expect(erro(r)).toMatch(/Vieram mais pessoas/);
  });

  it("só leitura: 403; no Visualizar como: 403", async () => {
    const leitura = await criarConta({ perfil: "gestor", permissoes: LEITURA });
    expect((await executar("turmas.salvar", { id: null, dados: turma() }, leitura)).status).toBe(403);
    const admin = await criarConta({ perfil: "admin" });
    const multi = await criarConta({ perfil: "gestor", permissoes: LANCAR });
    expect((await executar("turmas.salvar", { id: null, dados: turma() }, admin, multi)).status).toBe(403);
    expect(await prisma.treinamento_turmas.count()).toBe(0);
  });
});

describe("turmas.justificar", () => {
  it("multiplicadora justifica a própria (pendente); quem justificou vem da sessão", async () => {
    const multi = await criarConta({ perfil: "gestor", permissoes: LANCAR });
    const id = await turmaDe(multi.id);
    expect((await executar("turmas.justificar", { id, texto: "Motivo inventado" }, multi)).status).toBe(200);
    const t = await prisma.treinamento_turmas.findUnique({ where: { id: BigInt(id) } });
    expect(t).toMatchObject({ justificativa: "Motivo inventado", justificado_por: multi.nome, validacao: "pendente" });
  });

  it("multiplicadora não justifica a de outra; o gestor justifica e já valida", async () => {
    const multi = await criarConta({ perfil: "gestor", permissoes: LANCAR });
    const gestor = await criarConta({ perfil: "rh", permissoes: GESTOR });
    const id = await turmaDe(gestor.id);
    const r = await executar("turmas.justificar", { id, texto: "x" }, multi);
    expect(r.status).toBe(400);
    expect(erro(r)).toMatch(/só pode justificar/);
    expect((await executar("turmas.justificar", { id, texto: "Do gestor" }, gestor)).status).toBe(200);
    const t = await prisma.treinamento_turmas.findUnique({ where: { id: BigInt(id) } });
    expect(t).toMatchObject({ validacao: "validada", validado_por: gestor.nome, justificado_por: gestor.nome });
  });

  it("só leitura: 403; no Visualizar como: 403", async () => {
    const multi = await criarConta({ perfil: "gestor", permissoes: LANCAR });
    const id = await turmaDe(multi.id);
    const leitura = await criarConta({ perfil: "gestor", permissoes: LEITURA });
    expect((await executar("turmas.justificar", { id, texto: "x" }, leitura)).status).toBe(403);
    const admin = await criarConta({ perfil: "admin" });
    expect((await executar("turmas.justificar", { id, texto: "x" }, admin, multi)).status).toBe(403);
  });
});

describe("turmas.excluir", () => {
  it("só o gestor exclui", async () => {
    const multi = await criarConta({ perfil: "gestor", permissoes: LANCAR });
    const gestor = await criarConta({ perfil: "rh", permissoes: GESTOR });
    const leitura = await criarConta({ perfil: "gestor", permissoes: LEITURA });
    const id = await turmaDe(multi.id);
    expect((await executar("turmas.excluir", { id }, multi)).status).toBe(403);
    expect((await executar("turmas.excluir", { id }, leitura)).status).toBe(403);
    const admin = await criarConta({ perfil: "admin" });
    expect((await executar("turmas.excluir", { id }, admin, gestor)).status).toBe(403);
    expect(await prisma.treinamento_turmas.count()).toBe(1);
    expect(await executar("turmas.excluir", { id }, gestor)).toEqual({ status: 200, dados: null });
    expect(await prisma.treinamento_turmas.count()).toBe(0);
    const de_novo = await executar("turmas.excluir", { id }, gestor);
    expect(de_novo.status).toBe(400);
    expect(erro(de_novo)).toMatch(/não encontrada/);
  });
});

describe("turmas.gestao", () => {
  it("gestor devolve com comentário; quem decidiu vem da sessão", async () => {
    const multi = await criarConta({ perfil: "gestor", permissoes: LANCAR });
    const gestor = await criarConta({ perfil: "rh", permissoes: GESTOR });
    const id = await turmaDe(multi.id, { justificativa: "Motivo" });
    expect((await executar("turmas.gestao", { id, acao: "devolver", comentario: "Detalhe melhor" }, gestor)).status).toBe(200);
    const t = await prisma.treinamento_turmas.findUnique({ where: { id: BigInt(id) } });
    expect(t).toMatchObject({ validacao: "devolvida", validado_por: gestor.nome, gestor_comentario: "Detalhe melhor" });
    expect((await executar("turmas.gestao", { id, acao: "pedir_ajuste", comentario: "" }, gestor)).status).toBe(400);
    expect((await executar("turmas.gestao", { id, acao: "apagar" }, gestor)).status).toBe(400);
  });

  it("multiplicadora e só leitura: 403; no Visualizar como: 403", async () => {
    const multi = await criarConta({ perfil: "gestor", permissoes: LANCAR });
    const gestor = await criarConta({ perfil: "rh", permissoes: GESTOR });
    const id = await turmaDe(multi.id, { justificativa: "Motivo" });
    expect((await executar("turmas.gestao", { id, acao: "validar" }, multi)).status).toBe(403);
    expect((await executar("turmas.gestao", { id, acao: "validar" }, await criarConta({ permissoes: LEITURA }))).status).toBe(403);
    expect((await executar("turmas.gestao", { id, acao: "validar" }, await criarConta({ perfil: "admin" }), gestor)).status).toBe(403);
  });
});

describe("turmas.mesesFechados", () => {
  it("os três papéis leem a lista de meses fechados", async () => {
    await fecharMes(9);
    await prisma.$executeRawUnsafe(
      "insert into public.fechamento_periodo (id, tipo, ano, n, status) values ('bimestral-2026-6', 'bimestral', 2026, 6, 'rascunho')",
    );
    for (const p of [LEITURA, LANCAR, GESTOR]) {
      expect(await executar("turmas.mesesFechados", {}, await criarConta({ permissoes: p }))).toEqual({ status: 200, dados: ["2026-09"] });
    }
  });

  it("sem nenhum papel de Turmas: 403", async () => {
    const outro = await criarConta({ permissoes: { "indicadores.treinamentos": true } });
    expect((await executar("turmas.mesesFechados", {}, outro)).status).toBe(403);
  });
});

describe("turmas.historico", () => {
  it("gestor lê o histórico da turma, mais recente primeiro", async () => {
    const multi = await criarConta({ perfil: "gestor", permissoes: LANCAR });
    const gestor = await criarConta({ perfil: "rh", permissoes: GESTOR });
    const id = dados(await executar("turmas.salvar", { id: null, dados: turma() }, multi)) as number;
    await executar("turmas.salvar", { id, dados: turma({ tema: "Vendas" }) }, multi);
    const log = linhas(await executar("turmas.historico", { id }, gestor));
    expect(log.map((l) => l.acao)).toEqual(["alteração", "inclusão"]);
    expect(log[0]).toMatchObject({ turma_id: id, usuario_nome: multi.nome });
    expect((log[0]!.depois as Linha).tema).toBe("Vendas");
  });

  it("multiplicadora e só leitura: 403", async () => {
    const multi = await criarConta({ perfil: "gestor", permissoes: LANCAR });
    expect((await executar("turmas.historico", { id: 1 }, multi)).status).toBe(403);
    expect((await executar("turmas.historico", { id: 1 }, await criarConta({ permissoes: LEITURA }))).status).toBe(403);
  });
});

describe("turmas.salvarUnibe / salvarAcademia", () => {
  it("admin.upload grava o mês (e substitui o anterior)", async () => {
    const upload = await criarConta({ perfil: "rh", permissoes: { "admin.upload": true } });
    const ac = [{ nome: "Pessoa Um", loja: "Loja Centro", horas: 3, unidade: "Loja Centro" }, { nome: "Pessoa Dois", horas: 1 }];
    expect(await executar("turmas.salvarAcademia", { mes: "2026-09-01", linhas: ac }, upload)).toEqual({ status: 200, dados: 2 });
    expect(await executar("turmas.salvarAcademia", { mes: "2026-09-01", linhas: ac.slice(0, 1) }, upload)).toEqual({ status: 200, dados: 1 });
    expect(await prisma.academia_hering.count()).toBe(1);

    const u = await executar("turmas.salvarUnibe", {
      mes: "2026-09-01",
      pdvs: [{ pdv: "PDV1", nome_pdv: "Loja Centro", adesao: 0.8, unidade: "Loja Centro" }],
      pessoas: [{ nome: "Pessoa Um", pdv: "PDV1", adesao: 1, unidade: "Loja Centro" }],
    }, upload);
    expect(u.status).toBe(200);
    expect(await prisma.unibe_pdv.count()).toBe(1);
    expect(await prisma.unibe_pessoas.count()).toBe(1);

  });

  it("sem admin.upload: 403; no Visualizar como: 403", async () => {
    const gestor = await criarConta({ perfil: "rh", permissoes: GESTOR });
    expect((await executar("turmas.salvarAcademia", { mes: "2026-09-01", linhas: [] }, gestor)).status).toBe(403);
    const upload = await criarConta({ perfil: "rh", permissoes: { "admin.upload": true } });
    const admin = await criarConta({ perfil: "admin" });
    expect((await executar("turmas.salvarUnibe", { mes: "2026-09-01", pdvs: [], pessoas: [] }, admin, upload)).status).toBe(403);
  });
});
