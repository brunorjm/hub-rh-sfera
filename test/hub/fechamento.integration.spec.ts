import { criarConta, executar, limpar, prisma } from "../helpers/hub";

type Linha = Record<string, unknown>;
const dados = (r: { status: number }) => ("dados" in r ? r.dados : undefined);
const linhas = (r: { status: number }) => (dados(r) as Linha[] | undefined) ?? [];
const erro = (r: { status: number }) => ("erro" in r ? (r as { erro: string }).erro : "");

const TABELAS = ["controle_vagas", "metas_vagas", "fechamento_periodo"];

beforeEach(async () => {
  await limpar(...TABELAS);
  // Vagas inventadas, fora da ordem de linha para conferir a ordenação.
  await prisma.$executeRawUnsafe(`
    insert into public.controle_vagas (linha, data_abertura, unidade, departamento, cargo, status_vaga, sigilosa)
    values (3, '2026-03-01', 'Loja Norte', 'Vendas', 'Gerente', 'Aberta', false),
           (1, '2026-01-01', 'Loja Centro', 'Vendas', 'Consultora', 'Fechada', false),
           (2, '2026-02-01', 'Loja Centro', 'Caixa', 'Caixa', 'Aberta', true)`);
  await prisma.$executeRawUnsafe(`
    insert into public.metas_vagas (ano, mes, meta_abertas, meta_fechadas)
    values (2026, 2, 10, 8), (2025, 12, 5, 5), (2026, 1, 7, 6)`);
});

afterAll(async () => {
  await limpar(...TABELAS);
  await prisma.$disconnect();
});

describe("fechamento.vagasPagina", () => {
  it("devolve a base na ordem da planilha, no formato do Supabase, e pagina", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const r = await executar("fechamento.vagasPagina", {}, admin);
    expect(r.status).toBe(200);
    const ls = linhas(r);
    expect(ls.map((l) => l.linha)).toEqual([1, 2, 3]);
    expect(ls[0]!.data_abertura).toBe("2026-01-01");
    expect(typeof ls[0]!.id).toBe("number");
    expect(ls[1]!.sigilosa).toBe(true);
    const p2 = linhas(await executar("fechamento.vagasPagina", { de: 2, limite: 2 }, admin));
    expect(p2.map((l) => l.linha)).toEqual([3]);
  });

  it("com a permissão e recorte de unidade, só as vagas da unidade", async () => {
    const rh = await criarConta({ perfil: "rh", permissoes: { "indicadores.fechamento": true }, unidades: ["Loja Centro"] });
    expect(linhas(await executar("fechamento.vagasPagina", {}, rh)).map((l) => l.linha)).toEqual([1, 2]);
  });

  it("sem indicadores.fechamento: 403", async () => {
    const outro = await criarConta({ perfil: "rh", permissoes: { "indicadores.headcount": true, "recrutamento.vagas": true } });
    expect((await executar("fechamento.vagasPagina", {}, outro)).status).toBe(403);
  });
});

describe("fechamento.metas", () => {
  it("devolve as metas por ano e mês", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const ls = linhas(await executar("fechamento.metas", {}, admin));
    expect(ls.map((l) => [l.ano, l.mes])).toEqual([[2025, 12], [2026, 1], [2026, 2]]);
    expect(ls[2]).toMatchObject({ meta_abertas: 10, meta_fechadas: 8 });
  });

  it("sem indicadores.fechamento: 403", async () => {
    const outro = await criarConta({ perfil: "gestor", permissoes: { "admin.upload": true } });
    expect((await executar("fechamento.metas", {}, outro)).status).toBe(403);
  });
});

describe("fechamento.salvarVagas", () => {
  const lote = [
    { linha: 1, data_abertura: "2026-05-01", unidade: "Loja Sul", departamento: "Vendas", cargo: "Consultora", status_vaga: "Aberta" },
    { linha: 2, data_abertura: "2026-05-02", unidade: "Loja Sul", departamento: "Vendas", cargo: "Gerente", status_vaga: "Aberta" },
  ];

  it("o primeiro lote limpa a base; os demais só inserem", async () => {
    const upload = await criarConta({ perfil: "rh", permissoes: { "admin.upload": true } });
    const r = await executar("fechamento.salvarVagas", { linhas: lote, limpar: true }, upload);
    expect(r).toEqual({ status: 200, dados: 2 });
    await executar("fechamento.salvarVagas", { linhas: [{ linha: 3, data_abertura: "2026-05-03", unidade: "Loja Sul" }], limpar: false }, upload);
    const todas = await prisma.$queryRawUnsafe<{ unidade: string }[]>("select unidade from public.controle_vagas order by linha");
    expect(todas.map((t) => t.unidade)).toEqual(["Loja Sul", "Loja Sul", "Loja Sul"]);
  });

  it("sem admin.upload: 403; no Visualizar como: 403", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const fech = await criarConta({ perfil: "rh", permissoes: { "indicadores.fechamento": true } });
    expect((await executar("fechamento.salvarVagas", { linhas: lote, limpar: true }, fech)).status).toBe(403);
    const upload = await criarConta({ perfil: "rh", permissoes: { "admin.upload": true } });
    expect((await executar("fechamento.salvarVagas", { linhas: lote, limpar: true }, admin, upload)).status).toBe(403);
    expect(await prisma.controle_vagas.count()).toBe(3);
  });
});

describe("fechamento.*Periodo", () => {
  const p = { tipo: "mensal", ano: 2026, n: 9 };

  it("grava, lê e lista o período; o id e quem alterou vêm do servidor", async () => {
    const admin = await criarConta({ perfil: "admin" });
    expect(dados(await executar("fechamento.buscarPeriodo", { id: "mensal-2026-9" }, admin))).toBeNull();
    const r = await executar("fechamento.salvarPeriodo", { ...p, textos: { capa: "Texto inventado" }, ocultos: ["s1"] }, admin);
    expect(r.status).toBe(200);
    expect(dados(r)).toMatchObject({
      id: "mensal-2026-9", tipo: "mensal", ano: 2026, n: 9, status: "rascunho",
      textos: { capa: "Texto inventado" }, ocultos: ["s1"], manuais: {}, atualizado_por: admin.nome,
    });
    // Só as colunas enviadas mudam (upsert do PostgREST).
    await executar("fechamento.salvarPeriodo", { ...p, manuais: { m1: { titulo: "Slide do RH" } } }, admin);
    const reg = dados(await executar("fechamento.buscarPeriodo", { id: "mensal-2026-9" }, admin)) as Linha;
    expect(reg).toMatchObject({ textos: { capa: "Texto inventado" }, manuais: { m1: { titulo: "Slide do RH" } }, ocultos: ["s1"] });

    await executar("fechamento.salvarPeriodo", { tipo: "anual", ano: 2025, n: 7 }, admin);
    const lista = linhas(await executar("fechamento.listarPeriodos", {}, admin));
    expect(lista.map((l) => l.id)).toEqual(["mensal-2026-9", "anual-2025-1"]);
    expect(lista[0]).not.toHaveProperty("textos");
    expect(lista[0]).not.toHaveProperty("snapshot");
  });

  it("fechar: quem e quando vêm da sessão; fechado não aceita edição; reabrir limpa a foto", async () => {
    const admin = await criarConta({ perfil: "admin" });
    await executar("fechamento.salvarPeriodo", { ...p, textos: { a: "1" } }, admin);
    const f = dados(await executar("fechamento.salvarPeriodo", { ...p, status: "fechado", snapshot: [{ id: "s1" }] }, admin)) as Linha;
    expect(f).toMatchObject({ status: "fechado", snapshot: [{ id: "s1" }], fechado_por: admin.nome });
    expect(typeof f.fechado_em).toBe("string");

    const trava = await executar("fechamento.salvarPeriodo", { ...p, textos: { a: "2" } }, admin);
    expect(trava.status).toBe(400);
    expect(erro(trava)).toMatch(/período está fechado/);

    const ab = dados(await executar("fechamento.salvarPeriodo", { ...p, status: "rascunho", snapshot: null }, admin)) as Linha;
    expect(ab).toMatchObject({ status: "rascunho", snapshot: null, fechado_em: null, fechado_por: null, textos: { a: "1" } });
  });

  it("recusa quem fechou vindo do navegador e período inválido", async () => {
    const admin = await criarConta({ perfil: "admin" });
    expect((await executar("fechamento.salvarPeriodo", { ...p, status: "fechado", snapshot: [], fechado_por: "Outra pessoa" }, admin)).status).toBe(400);
    expect((await executar("fechamento.salvarPeriodo", { tipo: "bimestral", ano: 2026, n: 7 }, admin)).status).toBe(400);
    expect((await executar("fechamento.salvarPeriodo", { tipo: "trimestral", ano: 2026, n: 1 }, admin)).status).toBe(400);
  });

  it("sem indicadores.fechamento: 403 nas quatro; no Visualizar como, lê mas não grava", async () => {
    const admin = await criarConta({ perfil: "admin" });
    await executar("fechamento.salvarPeriodo", p, admin);
    const outro = await criarConta({ perfil: "rh", permissoes: { "indicadores.boletim": true } });
    expect((await executar("fechamento.buscarPeriodo", { id: "mensal-2026-9" }, outro)).status).toBe(403);
    expect((await executar("fechamento.listarPeriodos", {}, outro)).status).toBe(403);
    expect((await executar("fechamento.salvarPeriodo", p, outro)).status).toBe(403);

    const rh = await criarConta({ perfil: "rh", permissoes: { "indicadores.fechamento": true } });
    expect(linhas(await executar("fechamento.listarPeriodos", {}, admin, rh))).toHaveLength(1);
    expect((await executar("fechamento.salvarPeriodo", { ...p, textos: { x: "y" } }, admin, rh)).status).toBe(403);
    const reg = await prisma.fechamento_periodo.findUnique({ where: { id: "mensal-2026-9" } });
    expect(reg?.textos).toEqual({});
  });
});
