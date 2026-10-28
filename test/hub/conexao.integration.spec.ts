// Conexão RH (src/server/hub/conexao.ts) no hub_test, com dados inventados.
// Os PDFs do Fit vão para um diretório temporário (nunca _local/arquivos).
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { storageLocal, type Storage } from "@/lib/storage";
import { gravarFit, lerFit } from "@/server/hub/conexao";
import { criarConta, executar, limpar, prisma } from "../helpers/hub";

type Linha = Record<string, unknown>;
const dados = (r: { status: number }) => ("dados" in r ? r.dados : undefined);
const erro = (r: { status: number }) => ("erro" in r ? (r as { erro: string }).erro : "");

const ACOMPANHAR = { "conexao_rh.acompanhar": true };
const GERIR = { ...ACOMPANHAR, "conexao_rh.gerir": true };
const DOCS = { ...ACOMPANHAR, "conexao_rh.documentos": true };

let raiz: string;
let storage: Storage;
let norte: string; // chave "<id>@<admissão>" de um vínculo da unidade Norte
let sul: string;
let idNorte: number;

async function colaborador(nome: string, unidade: string): Promise<{ id: number; chave: string }> {
  const [r] = await prisma.$queryRawUnsafe<{ id: bigint }[]>(
    `insert into public.colaboradores (nome, unidade, departamento, situacao, cpf, matricula, data_admissao)
     values ($1, $2, 'Loja 1', 'Ativo', '00000000191', '11999990000', '2025-12-01') returning id`,
    nome, unidade,
  );
  const id = Number(r!.id);
  return { id, chave: `${id}@2025-12-01` };
}

const observacao = (employee: string, texto = "Acompanhamento inventado", id = randomUUID()) => ({
  kind: "observations", id, revision: 0,
  data: { id, employee, text: texto, created: "2026-10-01T12:00:00.000Z", author: "Pessoa Teste" },
});

const fit = (employee: string, id: string, revision = 0) => ({
  kind: "fits", id, revision,
  data: { id, employee, path: `${employee}/${id}.pdf`, fileSize: 20, hash: "ab", created: "2026-10-01T12:00:00.000Z" },
});

const PDF = new TextEncoder().encode("%PDF-1.4 inventado");

beforeEach(async () => {
  await prisma.$executeRawUnsafe("truncate conexao_private.records, conexao_private.audit, conexao_private.nps restart identity");
  await limpar("colaboradores");
  ({ chave: norte, id: idNorte } = await colaborador("Pessoa Norte", "Norte"));
  ({ chave: sul } = await colaborador("Pessoa Sul", "Sul"));
  raiz = await mkdtemp(path.join(tmpdir(), "hub-conexao-"));
  storage = storageLocal(raiz);
});

afterEach(async () => {
  await rm(raiz, { recursive: true, force: true });
});

afterAll(async () => {
  await prisma.$executeRawUnsafe("truncate conexao_private.records, conexao_private.audit, conexao_private.nps restart identity");
  await limpar("colaboradores");
  await prisma.$disconnect();
});

describe("conexao.estado e conexao.salvar", () => {
  it("grava pela função do banco e devolve o estado no formato da RPC", async () => {
    const rh = await criarConta({ perfil: "rh", permissoes: GERIR });
    expect(dados(await executar("conexao.estado", {}, rh))).toEqual([]);
    const obs = observacao(norte);
    const r = await executar("conexao.salvar", { changes: [obs] }, rh);
    expect(r.status).toBe(200);
    expect(dados(r)).toEqual([{ kind: "observations", id: obs.id, data: obs.data, revision: 1 }]);
    expect(dados(await executar("conexao.estado", {}, rh))).toEqual(dados(r));
    const [a] = await prisma.$queryRawUnsafe<{ actor: string }[]>("select actor::text from conexao_private.audit");
    expect(a!.actor).toBe(rh.id);
  });

  it("sem conexao_rh.acompanhar: 403", async () => {
    const outro = await criarConta({ perfil: "rh", permissoes: { "indicadores.headcount": true } });
    expect((await executar("conexao.estado", {}, outro)).status).toBe(403);
    expect((await executar("conexao.salvar", { changes: [observacao(norte)] }, outro)).status).toBe(403);
  });

  it("só consulta (acompanhar): não grava; tipo sem a permissão vem recusado pelo banco", async () => {
    const leitor = await criarConta({ perfil: "rh", permissoes: ACOMPANHAR });
    expect((await executar("conexao.salvar", { changes: [observacao(norte)] }, leitor)).status).toBe(403);
    const docs = await criarConta({ perfil: "rh", permissoes: DOCS });
    const r = await executar("conexao.salvar", { changes: [observacao(norte)] }, docs);
    expect(r.status).toBe(403);
    expect(erro(r)).toMatch(/não pode alterar este registro/);
  });

  it("recorte por unidade: não vê nem grava vínculo fora do escopo", async () => {
    const rh = await criarConta({ perfil: "rh", permissoes: GERIR });
    await executar("conexao.salvar", { changes: [observacao(norte), observacao(sul)] }, rh);
    const gestor = await criarConta({ perfil: "gestor", permissoes: GERIR, unidades: ["Norte"] });
    const visiveis = dados(await executar("conexao.estado", {}, gestor)) as Linha[];
    expect(visiveis.map((x) => (x.data as Linha).employee)).toEqual([norte]);
    const r = await executar("conexao.salvar", { changes: [observacao(sul)] }, gestor);
    expect(r.status).toBe(403);
    expect(erro(r)).toMatch(/fora do seu escopo/);
  });

  it("revisão desatualizada: { conflito: true } e nada muda", async () => {
    const rh = await criarConta({ perfil: "rh", permissoes: { ...GERIR, "conexao_rh.documentos": true } });
    const id = randomUUID();
    expect((await executar("conexao.salvar", { changes: [fit(norte, id)] }, rh)).status).toBe(200);
    const alterado = fit(norte, id);
    (alterado.data as Linha).notes = "revisado";
    const r = await executar("conexao.salvar", { changes: [observacao(norte), alterado] }, rh);
    expect(r.status).toBe(200);
    expect(dados(r)).toEqual({ conflito: true });
    const estado = dados(await executar("conexao.estado", {}, rh)) as Linha[];
    expect(estado).toHaveLength(1);
    expect(estado[0]).toMatchObject({ kind: "fits", revision: 1 });
    // Com a revisão certa grava.
    expect((await executar("conexao.salvar", { changes: [{ ...alterado, revision: 1 }] }, rh)).status).toBe(200);
  });

  it("regra do banco volta como mensagem (400) e entrada inválida é recusada", async () => {
    const rh = await criarConta({ perfil: "rh", permissoes: GERIR });
    const r = await executar("conexao.salvar", { changes: [observacao(norte, "   ")] }, rh);
    expect(r.status).toBe(400);
    expect(erro(r)).toMatch(/Observação inválida/);
    expect((await executar("conexao.salvar", { changes: [{ ...observacao(norte), kind: "outro" }] }, rh)).status).toBe(400);
    expect((await executar("conexao.salvar", { changes: [] }, rh)).status).toBe(400);
  });

  it("Visualizar como: lê como a conta simulada e recusa a gravação", async () => {
    const admin = await criarConta({ perfil: "admin" });
    await executar("conexao.salvar", { changes: [observacao(norte), observacao(sul)] }, admin);
    const gestor = await criarConta({ perfil: "gestor", permissoes: GERIR, unidades: ["Sul"] });
    const vistas = dados(await executar("conexao.estado", {}, admin, gestor)) as Linha[];
    expect(vistas.map((x) => (x.data as Linha).employee)).toEqual([sul]);
    expect((await executar("conexao.salvar", { changes: [observacao(sul)] }, admin, gestor)).status).toBe(403);
  });
});

describe("conexao.npsSync", () => {
  it("gera o link de quem participou de encontro finalizado e devolve a lista", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const sessao = randomUUID();
    const base = { date: "2026-01-10", time: "10:00", duration: 60, milestone: 30, facilitator: "Facilitadora Teste" };
    const turma = { kind: "sessions", id: sessao, revision: 0, data: { id: sessao, ...base, participants: [norte], importedPilot: true } };
    const execucao = {
      kind: "executions", id: sessao, revision: 0,
      data: { session: sessao, ...base, status: "final", summary: "Síntese inventada", roster: [{ key: norte, attendance: "presente" }] },
    };
    const s = await executar("conexao.salvar", { changes: [turma, execucao] }, admin);
    expect(s.status).toBe(200);
    const r = await executar("conexao.npsSync", {}, admin);
    expect(r.status).toBe(200);
    const [link] = dados(r) as Linha[];
    expect(link).toMatchObject({ session: sessao, employee: norte, milestone: 30, date: "2026-01-10", revoked: false, respondedAt: null });
    expect(link!.token).toMatch(/^[0-9a-f]{64}$/);

    // Só consulta: sem gerar e sem token.
    const leitor = await criarConta({ perfil: "rh", permissoes: ACOMPANHAR });
    const [semToken] = dados(await executar("conexao.npsSync", {}, leitor)) as Linha[];
    expect(semToken!.token).toBeNull();
  });

  it("sem acompanhar: 403; no Visualizar como: 403 (grava tokens)", async () => {
    const outro = await criarConta({ perfil: "rh", permissoes: { "indicadores.headcount": true } });
    expect((await executar("conexao.npsSync", {}, outro)).status).toBe(403);
    const admin = await criarConta({ perfil: "admin" });
    const gestor = await criarConta({ perfil: "gestor", permissoes: GERIR });
    expect((await executar("conexao.npsSync", {}, admin, gestor)).status).toBe(403);
  });
});

describe("conexao.contato", () => {
  const COM = { ...DOCS, "indicadores.headcount": true };

  it("devolve só as colunas que a tela antiga buscava", async () => {
    const rh = await criarConta({ perfil: "rh", permissoes: COM });
    const r = await executar("conexao.contato", { id: idNorte }, rh);
    expect(r.status).toBe(200);
    expect(dados(r)).toEqual([{ id: idNorte, cpf: "00000000191", data_admissao: "2025-12-01", matricula: "11999990000" }]);
  });

  it("sem conexao_rh.documentos ou sem indicadores.headcount: 403", async () => {
    const soHeadcount = await criarConta({ perfil: "rh", permissoes: { ...ACOMPANHAR, "indicadores.headcount": true } });
    expect((await executar("conexao.contato", { id: idNorte }, soHeadcount)).status).toBe(403);
    const soDocs = await criarConta({ perfil: "rh", permissoes: DOCS });
    expect((await executar("conexao.contato", { id: idNorte }, soDocs)).status).toBe(403);
  });

  it("recorte: vínculo de outra unidade não vem", async () => {
    const gestor = await criarConta({ perfil: "gestor", permissoes: COM, unidades: ["Sul"] });
    expect(dados(await executar("conexao.contato", { id: idNorte }, gestor))).toEqual([]);
    expect((await executar("conexao.contato", { id: "1; drop table x" }, gestor)).status).toBe(400);
  });
});

describe("PDF do Fit Cultural (gravarFit/lerFit)", () => {
  it("anexa, registra e baixa; o original não é sobrescrito", async () => {
    const rh = await criarConta({ perfil: "rh", permissoes: DOCS });
    const id = randomUUID();
    expect(await gravarFit(id, norte, PDF, rh, storage)).toEqual({ status: 200, gravado: true });
    expect(await gravarFit(id, norte, new TextEncoder().encode("%PDF-outro"), rh, storage)).toEqual({ status: 200, gravado: false });
    expect(await storage.existe(`conexao-fit/${norte}/${id}.pdf`)).toBe(true);

    // Sem o registro no estado ainda: não sai.
    expect((await lerFit(id, rh, storage)).status).toBe(404);
    expect((await executar("conexao.salvar", { changes: [fit(norte, id)] }, rh)).status).toBe(200);
    const r = await lerFit(id, rh, storage);
    expect(r.status).toBe(200);
    expect(Buffer.from((r as { bytes: Uint8Array }).bytes).toString()).toBe("%PDF-1.4 inventado");
  });

  it("recusa o que não é PDF, o grande demais, o caminho fora do padrão e o colaborador fora do escopo", async () => {
    const gestor = await criarConta({ perfil: "gestor", permissoes: DOCS, unidades: ["Norte"] });
    const id = randomUUID();
    expect((await gravarFit(id, norte, new TextEncoder().encode("<html>"), gestor, storage)).status).toBe(400);
    const grande = new Uint8Array(10 * 1024 * 1024 + 1);
    grande.set(PDF);
    expect((await gravarFit(id, norte, grande, gestor, storage)).status).toBe(413);
    expect((await gravarFit(id, "../../x", PDF, gestor, storage)).status).toBe(400);
    expect((await gravarFit("../" + id.slice(3), norte, PDF, gestor, storage)).status).toBe(400);
    expect((await gravarFit(id, `${norte}/../x`, PDF, gestor, storage)).status).toBe(400);
    expect((await gravarFit(id, sul, PDF, gestor, storage)).status).toBe(403);
    expect(await storage.existe(`conexao-fit/${sul}/${id}.pdf`)).toBe(false);
  });

  it("sem conexao_rh.documentos: 403 no upload e no download", async () => {
    const dono = await criarConta({ perfil: "rh", permissoes: DOCS });
    const id = randomUUID();
    await gravarFit(id, norte, PDF, dono, storage);
    await executar("conexao.salvar", { changes: [fit(norte, id)] }, dono);
    const gerente = await criarConta({ perfil: "rh", permissoes: GERIR });
    expect((await gravarFit(randomUUID(), norte, PDF, gerente, storage)).status).toBe(403);
    expect((await lerFit(id, gerente, storage)).status).toBe(403);
  });

  it("download recortado: registro de vínculo fora do escopo não sai; arquivo ausente é 404", async () => {
    const rh = await criarConta({ perfil: "rh", permissoes: DOCS });
    const id = randomUUID();
    await gravarFit(id, sul, PDF, rh, storage);
    await executar("conexao.salvar", { changes: [fit(sul, id)] }, rh);
    const gestor = await criarConta({ perfil: "gestor", permissoes: DOCS, unidades: ["Norte"] });
    expect((await lerFit(id, gestor, storage)).status).toBe(404);
    expect((await lerFit("nao-e-um-id", rh, storage)).status).toBe(400);

    const semArquivo = randomUUID();
    await executar("conexao.salvar", { changes: [fit(norte, semArquivo)] }, rh);
    expect(await lerFit(semArquivo, rh, storage)).toEqual({ status: 404, erro: "Arquivo do documento não encontrado." });
  });

  it("Visualizar como: baixa como a conta simulada e recusa o upload", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const id = randomUUID();
    await gravarFit(id, norte, PDF, admin, storage);
    await executar("conexao.salvar", { changes: [fit(norte, id)] }, admin);
    const comDocs = await criarConta({ perfil: "gestor", permissoes: DOCS, unidades: ["Norte"] });
    const foraDoEscopo = await criarConta({ perfil: "gestor", permissoes: DOCS, unidades: ["Sul"] });
    expect((await lerFit(id, admin, storage, comDocs)).status).toBe(200);
    expect((await lerFit(id, admin, storage, foraDoEscopo)).status).toBe(404);
    expect((await gravarFit(randomUUID(), norte, PDF, admin, storage, comDocs)).status).toBe(403);
  });
});
