import { criarConta, executar, limpar, prisma } from "../helpers/hub";

type Linha = Record<string, unknown>;
const dados = (r: { status: number }) => ("dados" in r ? r.dados : undefined);
const linhas = (r: { status: number }) => (dados(r) as Linha[] | undefined) ?? [];

const TABELAS = ["colaboradores", "controle_desligamento", "entrevista_pesquisa", "entrevista_pesquisa_perguntas"];
const CONTROLE = { "indicadores.controle_desligamento": true };

let fichaCentro = 0;
let fichaNorte = 0;

beforeEach(async () => {
  await limpar(...TABELAS);
  // Pessoas inventadas. "matricula" é o CELULAR (vem da Feedz).
  await prisma.$executeRawUnsafe(`
    insert into public.colaboradores (external_id, nome, nome_completo, email, cargo, unidade, departamento, gestor_direto, situacao,
                                      grupos, data_admissao, matricula)
    values ('C1', 'Chefe', 'Chefe Inventada', 'chefe@exemplo.test', 'Diretora', 'Escritório', 'Diretoria', null, 'Ativo', 'G1', '2020-01-01', '11999990001'),
           ('E1', 'Eu', 'Eu Inventada', 'eu@exemplo.test', 'Gerente', 'Loja Centro', 'Vendas', 'Chefe', 'Ativo', 'G2', '2022-01-01', '11999990002'),
           ('S1', 'Equipe', 'Equipe Inventada', 'equipe@exemplo.test', 'Consultora', 'Loja Centro', 'Vendas', 'Eu', 'Ativo', 'G3', '2024-01-01', '11999990003'),
           ('O1', 'Outra', 'Outra Inventada', 'outra@exemplo.test', 'Consultora', 'Loja Norte', 'Vendas', 'Fulana', 'Ativo', 'G4', '2024-02-01', '11999990004'),
           ('X1', 'Sem Celular', 'Sem Celular', 'x@exemplo.test', 'Caixa', 'Loja Norte', 'Caixa', null, 'Desligado', null, '2023-01-01', '  ')`);
  const fichas = await prisma.$queryRawUnsafe<{ id: bigint; unidade: string }[]>(`
    insert into public.controle_desligamento (id_desligamento, colaborador_nome, unidade, departamento, contato)
    values ('D1', 'Pessoa Desligada Um', 'Loja Centro', 'Vendas', '11988880001'),
           ('D2', 'Pessoa Desligada Dois', 'Loja Norte', 'Vendas', '11988880002')
    returning id, unidade`);
  fichaCentro = Number(fichas.find((f) => f.unidade === "Loja Centro")!.id);
  fichaNorte = Number(fichas.find((f) => f.unidade === "Loja Norte")!.id);
  await prisma.$executeRawUnsafe(`
    insert into public.entrevista_pesquisa (planilha_id, data_conclusao, controle_id, repetida, respostas)
    values ('P34-1', '2026-09-01', $1, false, '{"Nome": "Pessoa Desligada Um", "Digite seu CPF": "00000000001", "Como foi?": "Bom", "Nota": 8}'),
           ('P34-2', '2026-09-02', $1, true,  '{"Como foi?": "Repetida"}'),
           ('P30-1', '2025-01-10', $2, false, '{"Seu telefone": "11977770000", "Como foi?": "Regular"}')`,
    fichaCentro, fichaNorte);
  await prisma.$executeRawUnsafe(`
    insert into public.entrevista_pesquisa_perguntas (origem, ordem, pergunta)
    values ('p34', 2, 'Nota'), ('p34', 1, 'Como foi?'), ('p30', 1, 'Como foi?')`);
});

afterAll(async () => {
  await limpar(...TABELAS);
  await prisma.$disconnect();
});

describe("desligamento.contatoFeedz", () => {
  it("devolve só o telefone do colaborador pedido (ou null)", async () => {
    const rh = await criarConta({ perfil: "rh", permissoes: CONTROLE });
    expect(await executar("desligamento.contatoFeedz", { externalId: "S1" }, rh)).toEqual({ status: 200, dados: "11999990003" });
    expect(await executar("desligamento.contatoFeedz", { externalId: "X1" }, rh)).toEqual({ status: 200, dados: null });
    expect(await executar("desligamento.contatoFeedz", { externalId: "NAO-EXISTE" }, rh)).toEqual({ status: 200, dados: null });
  });

  it("sem indicadores.controle_desligamento: 403 (nem o RH com headcount completo)", async () => {
    const outro = await criarConta({ perfil: "rh", permissoes: { "indicadores.headcount": true, "indicadores.headcount_completo": true, "indicadores.desligamento": true } });
    expect((await executar("desligamento.contatoFeedz", { externalId: "S1" }, outro)).status).toBe(403);
    expect((await executar("desligamento.contatoFeedz", { externalId: "" }, await criarConta({ perfil: "admin" }))).status).toBe(400);
  });
});

describe("desligamento.respostasForms", () => {
  it("respostas de uma ficha, sem nome/CPF e sem a repetida", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const r = await executar("desligamento.respostasForms", { controleId: fichaCentro }, admin);
    expect(r.status).toBe(200);
    expect(linhas(r)).toEqual([
      { planilha_id: "P34-1", data_conclusao: "2026-09-01", questionario_antigo: false, ordem: 1, pergunta: "Como foi?", resposta: "Bom" },
      { planilha_id: "P34-1", data_conclusao: "2026-09-01", questionario_antigo: false, ordem: 2, pergunta: "Nota", resposta: "8" },
    ]);
  });

  it("ficha fora do recorte vem vazia; sem a permissão: 403", async () => {
    const rh = await criarConta({ perfil: "rh", permissoes: CONTROLE, unidades: ["Loja Norte"] });
    expect(linhas(await executar("desligamento.respostasForms", { controleId: fichaCentro }, rh))).toEqual([]);
    expect(linhas(await executar("desligamento.respostasForms", { controleId: fichaNorte }, rh))).toHaveLength(1);
    const outro = await criarConta({ perfil: "rh", permissoes: { "indicadores.desligamento": true } });
    expect((await executar("desligamento.respostasForms", { controleId: fichaCentro }, outro)).status).toBe(403);
  });
});

describe("desligamento.respostasFormsExportar", () => {
  it("todas as respostas do recorte, sem dado pessoal, em páginas", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const ls = linhas(await executar("desligamento.respostasFormsExportar", {}, admin));
    expect(ls.map((l) => l.planilha_id)).toEqual(
      fichaCentro < fichaNorte ? ["P34-1", "P30-1"] : ["P30-1", "P34-1"],
    );
    const p34 = ls.find((l) => l.planilha_id === "P34-1")!;
    expect(p34).toMatchObject({ controle_id: fichaCentro, questionario_antigo: false, respostas: { "Como foi?": "Bom", Nota: 8 } });
    expect(JSON.stringify(ls)).not.toMatch(/00000000001|11977770000|Pessoa Desligada/);
    expect(linhas(await executar("desligamento.respostasFormsExportar", { de: 1, limite: 1 }, admin))).toHaveLength(1);
    expect(linhas(await executar("desligamento.respostasFormsExportar", { de: 2 }, admin))).toEqual([]);
  });

  it("gestor com recorte só exporta a sua unidade; sem a permissão: 403", async () => {
    const gestor = await criarConta({ perfil: "gestor", permissoes: CONTROLE, unidades: ["Loja Centro"] });
    expect(linhas(await executar("desligamento.respostasFormsExportar", {}, gestor)).map((l) => l.planilha_id)).toEqual(["P34-1"]);
    expect((await executar("desligamento.respostasFormsExportar", {}, await criarConta({ permissoes: { "indicadores.desligamento": true } }))).status).toBe(403);
  });
});

describe("desligamento.perguntas", () => {
  it("ordem das perguntas do questionário; só com a permissão do Controle", async () => {
    const rh = await criarConta({ perfil: "rh", permissoes: CONTROLE });
    const ls = linhas(await executar("desligamento.perguntas", {}, rh));
    expect(ls.map((l) => l.ordem)).toEqual([1, 1, 2]);
    expect(ls[2]).toEqual({ origem: "p34", ordem: 2, pergunta: "Nota" });
    expect((await executar("desligamento.perguntas", {}, await criarConta({ permissoes: { "indicadores.headcount": true } }))).status).toBe(403);
  });
});

describe("desligamento.meuGalho", () => {
  it("devolve só o galho da própria pessoa: liderança acima (enxuta), ela e a equipe abaixo", async () => {
    const eu = await criarConta({ perfil: "gestor", permissoes: { "indicadores.organograma": true } });
    await prisma.profiles.update({ where: { id: eu.id }, data: { colaborador_external_id: "E1" } });
    const r = await executar("desligamento.meuGalho", {}, eu);
    expect(r.status).toBe(200);
    const ls = linhas(r);
    const porId = Object.fromEntries(ls.map((l) => [l.external_id, l]));
    expect(Object.keys(porId).sort()).toEqual(["C1", "E1", "S1"]);
    expect(porId.E1).toMatchObject({ relacao: "eu", grupos: "G2", data_admissao: "2022-01-01" });
    expect(porId.S1).toMatchObject({ relacao: "abaixo", nome: "Equipe" });
    expect(porId.C1).toMatchObject({ relacao: "acima", grupos: null, data_admissao: null });
    for (const l of ls) expect(l).not.toHaveProperty("matricula");
  });

  it("sem colaborador ligado ao login: lista vazia (a tela explica)", async () => {
    const sem = await criarConta({ perfil: "gestor" });
    expect(await executar("desligamento.meuGalho", {}, sem)).toEqual({ status: 200, dados: [] });
  });

  it("no Visualizar como devolve o galho da conta simulada, não o do Administrador", async () => {
    const admin = await criarConta({ perfil: "admin" });
    await prisma.profiles.update({ where: { id: admin.id }, data: { colaborador_external_id: "C1" } });
    const equipe = await criarConta({ perfil: "gestor" });
    await prisma.profiles.update({ where: { id: equipe.id }, data: { colaborador_external_id: "S1" } });
    const ls = linhas(await executar("desligamento.meuGalho", {}, admin, equipe));
    expect(ls.find((l) => l.relacao === "eu")?.external_id).toBe("S1");
    expect(ls.filter((l) => l.relacao === "abaixo")).toEqual([]);
    expect(ls.filter((l) => l.relacao === "acima").map((l) => l.external_id).sort()).toEqual(["C1", "E1"]);
  });

  it("não aceita pedir o galho de outra pessoa", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const outro = await criarConta({ perfil: "gestor" });
    expect((await executar("desligamento.meuGalho", { p_target_profile_id: outro.id }, admin)).status).toBe(400);
  });
});
