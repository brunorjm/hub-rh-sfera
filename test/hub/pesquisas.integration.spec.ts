import { criarConta, executar, limpar, prisma } from "../helpers/hub";

type Linha = Record<string, unknown>;
const dados = (r: { status: number }) => ("dados" in r ? r.dados : undefined);
const linhas = (r: { status: number }) => (dados(r) as Linha[] | undefined) ?? [];
const erro = (r: { status: number }) => ("erro" in r ? (r as { erro: string }).erro : "");

const TABELAS = [
  "pesquisa_clima", "pesquisa_clima_hc", "engajamento_pulso", "engajamento_participacao", "humor_mensal",
  "engajamento_notas", "satisfacao_suporte", "boletim_entradas", "boletim_fechamento", "satisfacao_ciclo",
  "satisfacao_respostas", "satisfacao_triagem", "colaboradores",
];

// Todos os dados são inventados.
beforeEach(async () => {
  await limpar(...TABELAS);
  await prisma.$executeRawUnsafe(`
    insert into public.pesquisa_clima (dimensao, pergunta, nota, comentario, data_resposta, unidade, departamento)
    values ('lideranca', 'Pergunta A', 4, 'comentário inventado 1', '2026-05-02', 'Loja Centro', 'Vendas'),
           ('lideranca', 'Pergunta A', 2, null, '2026-05-03', 'Loja Norte', 'Vendas')`);
  await prisma.$executeRawUnsafe(`
    insert into public.pesquisa_clima_hc (unidade, departamento, papel, situacao)
    values ('Loja Centro', 'Vendas', 'Colaborador', 'Ativo'), ('Loja Norte', 'Vendas', 'Lider', 'Ativo')`);
  await prisma.$executeRawUnsafe(`
    insert into public.engajamento_pulso (inicio, fim, numero, convidados, respondentes)
    values ('2026-09-01', '2026-09-15', 1, 10, 7)`);
  await prisma.$executeRawUnsafe(`
    insert into public.engajamento_participacao (pulso_inicio, unidade, departamento, convidados, respondentes)
    values ('2026-09-01', 'Loja Centro', 'Vendas', 5, 4), ('2026-09-01', 'Loja Norte', 'Vendas', 5, 3)`);
  await prisma.$executeRawUnsafe(`
    insert into public.humor_mensal (mes, unidade, departamento, registros, soma, pessoas, dist)
    values ('2026-09-01', 'Loja Centro', 'Vendas', 10, 40, 5, '{"4": 10}'),
           ('2026-09-01', 'Loja Norte', 'Estoque', 8, 24, 4, '{}')`);
  await prisma.$executeRawUnsafe(`
    insert into public.satisfacao_respostas (pesquisa, unidade, departamento, area, nota, melhorar, comentario)
    values ('2026-09-01', 'Loja Centro', 'Vendas', 'TI', 9, '{Prazo}', 'comentário TI inventado'),
           ('2026-09-01', 'Loja Norte', 'Vendas', 'TI', 7, '{}', 'comentário TI oculto inventado'),
           ('2026-09-01', 'Loja Centro', 'Vendas', 'Financeiro', 5, '{}', 'comentário Financeiro inventado')`);
  await prisma.$executeRawUnsafe(`
    insert into public.satisfacao_ciclo (pesquisa, respondentes, aptos, areas)
    values ('2026-09-01', 3, 10, '{TI,Financeiro}')`);
});

afterAll(async () => {
  await limpar(...TABELAS);
  await prisma.$disconnect();
});

describe("pesquisas.climaLerPagina", () => {
  it("devolve as linhas como o select('*') e com recorte", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const r = await executar("pesquisas.climaLerPagina", { tabela: "pesquisa_clima" }, admin);
    expect(r.status).toBe(200);
    expect(linhas(r)[0]).toMatchObject({ comentario: "comentário inventado 1", nota: 4, data_resposta: "2026-05-02" });
    const gestor = await criarConta({ perfil: "gestor", permissoes: { "indicadores.pesquisa_clima": true }, unidades: ["Loja Norte"] });
    expect(linhas(await executar("pesquisas.climaLerPagina", { tabela: "pesquisa_clima" }, gestor)).map((l) => l.unidade)).toEqual(["Loja Norte"]);
    expect(linhas(await executar("pesquisas.climaLerPagina", { tabela: "pesquisa_clima_hc" }, gestor)).map((l) => l.papel)).toEqual(["Lider"]);
  });

  it("pagina por id e recusa tabela fora da lista", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const p1 = linhas(await executar("pesquisas.climaLerPagina", { tabela: "pesquisa_clima", limite: 1 }, admin));
    const p2 = linhas(await executar("pesquisas.climaLerPagina", { tabela: "pesquisa_clima", limite: 1, aposId: p1[0]!.id }, admin));
    expect(p2.map((l) => l.unidade)).toEqual(["Loja Norte"]);
    expect((await executar("pesquisas.climaLerPagina", { tabela: "colaboradores" }, admin)).status).toBe(400);
  });

  it("sem indicadores.pesquisa_clima: 403", async () => {
    const outro = await criarConta({ perfil: "gestor", permissoes: { "indicadores.engajamento": true } });
    expect((await executar("pesquisas.climaLerPagina", { tabela: "pesquisa_clima" }, outro)).status).toBe(403);
  });
});

describe("pesquisas.engajamentoLerPagina", () => {
  it("pulsos sem recorte; participação recortada; também pelo Boletim", async () => {
    const gestor = await criarConta({ perfil: "gestor", permissoes: { "indicadores.engajamento": true }, unidades: ["Loja Centro"] });
    const pulsos = linhas(await executar("pesquisas.engajamentoLerPagina", { tabela: "engajamento_pulso" }, gestor));
    expect(pulsos).toEqual([expect.objectContaining({ inicio: "2026-09-01", fim: "2026-09-15", convidados: 10, parcial: false })]);
    const part = linhas(await executar("pesquisas.engajamentoLerPagina", { tabela: "engajamento_participacao" }, gestor));
    expect(part.map((l) => l.unidade)).toEqual(["Loja Centro"]);
    const boletim = await criarConta({ perfil: "rh", permissoes: { "indicadores.boletim": true } });
    expect(linhas(await executar("pesquisas.engajamentoLerPagina", { tabela: "engajamento_participacao" }, boletim))).toHaveLength(2);
  });

  it("sem a permissão: 403", async () => {
    const outro = await criarConta({ perfil: "gestor", permissoes: { "indicadores.pesquisa_clima": true } });
    expect((await executar("pesquisas.engajamentoLerPagina", { tabela: "engajamento_pulso" }, outro)).status).toBe(403);
  });
});

describe("pesquisas.engajamentoSalvarBase", () => {
  const corpo = {
    pulsos: [{ inicio: "2026-10-01", fim: "2026-10-15", numero: 2, convidados: 20, respondentes: 12, auto: false }],
    linhas: [{ pulso_inicio: "2026-10-01", unidade: "Loja Sul", departamento: "Vendas", gestor: null, convidados: 20, respondentes: 12 }],
    hoje: "2026-10-28",
  };

  it("grava a base inteira pela função do banco", async () => {
    const up = await criarConta({ perfil: "rh", permissoes: { "admin.upload": true } });
    const r = await executar("pesquisas.engajamentoSalvarBase", corpo, up);
    expect(r).toEqual({ status: 200, dados: { pulsos: 1, linhas: 1 } });
    const [{ n }] = await prisma.$queryRawUnsafe<{ n: number }[]>(`select count(*)::int as n from public.engajamento_participacao where unidade = 'Loja Sul'`);
    expect(n).toBe(1);
  });

  it("sem admin.upload: 403; no Visualizar como: 403", async () => {
    const so = await criarConta({ perfil: "rh", permissoes: { "indicadores.engajamento": true } });
    expect((await executar("pesquisas.engajamentoSalvarBase", corpo, so)).status).toBe(403);
    const admin = await criarConta({ perfil: "admin" });
    expect((await executar("pesquisas.engajamentoSalvarBase", corpo, admin, so)).status).toBe(403);
  });
});

describe("Boletim da Liderança", () => {
  it("boletimLerPagina: só com indicadores.boletim, recortado", async () => {
    const rh = await criarConta({ perfil: "rh", permissoes: { "indicadores.boletim": true }, departamentos: ["Estoque"] });
    const r = await executar("pesquisas.boletimLerPagina", { tabela: "humor_mensal" }, rh);
    expect(r.status).toBe(200);
    expect(linhas(r)).toEqual([expect.objectContaining({ mes: "2026-09-01", departamento: "Estoque", dist: {} })]);
    const outro = await criarConta({ perfil: "rh", permissoes: { "indicadores.engajamento": true } });
    expect((await executar("pesquisas.boletimLerPagina", { tabela: "humor_mensal" }, outro)).status).toBe(403);
  });

  it("uploads em lote gravam pelas funções e são recusados no Visualizar como", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const humor = { meses: ["2026-09-01"], linhas: [{ mes: "2026-09-01", unidade: "Loja Sul", departamento: "Vendas", registros: 3, soma: 9, pessoas: 2, dist: { 3: 3 } }], limpar: true };
    expect(await executar("pesquisas.boletimSalvarHumor", humor, admin)).toEqual({ status: 200, dados: 1 });
    // limpar: o mês foi substituído (as duas linhas do beforeEach saíram).
    expect(linhas(await executar("pesquisas.boletimLerPagina", { tabela: "humor_mensal" }, admin)).map((l) => l.unidade)).toEqual(["Loja Sul"]);

    const notas = { inicio: "2026-10-01", fim: "2026-10-31", linhas: [{ dia: "2026-10-02", unidade: "Loja Sul", departamento: "Vendas", dimensao: "enps", soma: 9, n: 1, promotores: 1 }], limpar: true };
    expect(await executar("pesquisas.boletimSalvarEngNotas", notas, admin)).toEqual({ status: 200, dados: 1 });
    const sat = { meses: ["2026-09-01"], linhas: [{ pesquisa: "2026-09-01", unidade: "Loja Sul", departamento: "Vendas", respondentes: 2, areas: { TI: { n: 2 } } }], limpar: true };
    expect(await executar("pesquisas.boletimSalvarSatisfacao", sat, admin)).toEqual({ status: 200, dados: 1 });

    const alvo = await criarConta({ perfil: "rh", permissoes: { "admin.upload": true } });
    expect((await executar("pesquisas.boletimSalvarHumor", humor, admin, alvo)).status).toBe(403);
  });

  it("período inválido volta com a mensagem da função (400)", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const r = await executar("pesquisas.boletimSalvarEngNotas", { inicio: "2026-10-31", fim: "2026-10-01", linhas: [], limpar: true }, admin);
    expect(r.status).toBe(400);
    expect(erro(r)).toMatch(/Período inválido/);
  });

  it("valor manual, fechar e reabrir: autor vem da sessão; mês fechado recusa edição", async () => {
    const up = await criarConta({ perfil: "rh", permissoes: { "admin.upload": true, "indicadores.boletim": true } });
    const entrada = { mes: "2026-09-01", operacao: "boticario", loja: null, indicador: "vendas", valor: 0.85 };
    expect(await executar("pesquisas.boletimSalvarEntrada", entrada, up)).toEqual({ status: 200, dados: null });
    const ents = linhas(await executar("pesquisas.boletimLerPagina", { tabela: "boletim_entradas" }, up));
    expect(ents).toEqual([expect.objectContaining({ mes: "2026-09-01", loja: null, valor: 0.85, atualizado_por: up.nome })]);

    const itens = [{ operacao: "boticario", dados: { ind: { x: 1 }, base: {}, lojas: [] } }];
    expect(await executar("pesquisas.boletimFechar", { mes: "2026-09-01", itens }, up)).toEqual({ status: 200, dados: 1 });
    const fech = linhas(await executar("pesquisas.boletimLerPagina", { tabela: "boletim_fechamento" }, up));
    expect(fech).toEqual([expect.objectContaining({ operacao: "boticario", dados: itens[0]!.dados, fechado_por: up.nome })]);

    const recusado = await executar("pesquisas.boletimSalvarEntrada", { ...entrada, valor: 1 }, up);
    expect(recusado.status).toBe(400);
    expect(erro(recusado)).toMatch(/mês está fechado/);

    expect(await executar("pesquisas.boletimReabrir", { mes: "2026-09-01" }, up)).toEqual({ status: 200, dados: null });
    expect(linhas(await executar("pesquisas.boletimLerPagina", { tabela: "boletim_fechamento" }, up))).toEqual([]);
  });

  it("escritas do boletim: sem admin.upload 403; no Visualizar como 403", async () => {
    const so = await criarConta({ perfil: "rh", permissoes: { "indicadores.boletim": true } });
    expect((await executar("pesquisas.boletimReabrir", { mes: "2026-09-01" }, so)).status).toBe(403);
    expect((await executar("pesquisas.boletimFechar", { mes: "2026-09-01", itens: [] }, so)).status).toBe(403);
    const admin = await criarConta({ perfil: "admin" });
    expect((await executar("pesquisas.boletimReabrir", { mes: "2026-09-01" }, admin, so)).status).toBe(403);
    expect((await executar("pesquisas.boletimSalvarEntrada", { mes: "2026-09-01", operacao: "x", indicador: "y", valor: 1 }, admin, so)).status).toBe(403);
  });
});

describe("pesquisas.boletimResumoPublicado", () => {
  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`
      insert into public.colaboradores (nome, unidade, departamento)
      values ('Pessoa Um', 'Unidade A', 'Loja 1'), ('Pessoa Dois', 'Unidade B', 'Loja 2')`);
    await prisma.$executeRawUnsafe(`
      insert into public.boletim_fechamento (mes, operacao, dados)
      values ('2026-09-01', 'boticario', '{"ind": {"v": 1}, "lojas": [{"departamento": "Loja 1"}, {"departamento": "Loja 2"}]}'),
             ('2026-09-01', 'empresa', '{"ind": {"v": 2}, "lojas": []}')`);
  });

  it("qualquer conta ativa recebe, recortado pelo acesso", async () => {
    const semRecorte = await criarConta({ perfil: "gestor" });
    const tudo = linhas(await executar("pesquisas.boletimResumoPublicado", {}, semRecorte));
    expect(tudo.map((l) => l.operacao).sort()).toEqual(["boticario", "empresa"]);
    expect(tudo[0]!.mes).toBe("2026-09-01");

    const gestor = await criarConta({ perfil: "gestor", unidades: ["Unidade A"] });
    const parcial = linhas(await executar("pesquisas.boletimResumoPublicado", {}, gestor));
    expect(parcial).toEqual([{ mes: "2026-09-01", operacao: "boticario", dados: { parcial: true, lojas: [{ departamento: "Loja 1" }] } }]);
  });

  it("no Visualizar como devolve o resumo da conta simulada", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const alvo = await criarConta({ perfil: "gestor", unidades: ["Unidade B"] });
    const r = linhas(await executar("pesquisas.boletimResumoPublicado", {}, admin, alvo));
    expect(r).toEqual([{ mes: "2026-09-01", operacao: "boticario", dados: { parcial: true, lojas: [{ departamento: "Loja 2" }] } }]);
  });
});

describe("pesquisas.satisfacaoDados (só pela função satisfacao_dados)", () => {
  it("sem indicadores.satisfacao nem satisfacao_completo: 403", async () => {
    const outro = await criarConta({ perfil: "rh", permissoes: { "indicadores.satisfacao_participacao": true, "indicadores.boletim": true } });
    expect((await executar("pesquisas.satisfacaoDados", {}, outro)).status).toBe(403);
  });

  it("recorta pelas áreas do perfil e esconde unidade/departamento sem a visão completa", async () => {
    const ti = await criarConta({ perfil: "rh", permissoes: { "indicadores.satisfacao": true }, satisfacaoAreas: ["TI"] });
    const r = await executar("pesquisas.satisfacaoDados", {}, ti);
    expect(r.status).toBe(200);
    const ls = linhas(r);
    expect(ls.map((l) => l.area)).toEqual(["TI", "TI"]);
    for (const l of ls) {
      expect(l.unidade).toBeNull();
      expect(l.departamento).toBeNull();
      expect(l.chave).toBeNull();
      expect(l.triagem).toBeNull();
    }
    expect(ls[0]).toMatchObject({ pesquisa: "2026-09-01", nota: 7 });
    const nenhuma = await criarConta({ perfil: "rh", permissoes: { "indicadores.satisfacao": true } });
    expect(linhas(await executar("pesquisas.satisfacaoDados", {}, nenhuma))).toEqual([]);
  });

  it("visão completa vê todas as áreas com a loja e tria; o comentário triado some para a área", async () => {
    const completo = await criarConta({ perfil: "rh", permissoes: { "indicadores.satisfacao_completo": true } });
    const ls = linhas(await executar("pesquisas.satisfacaoDados", {}, completo));
    expect(ls.map((l) => l.area).sort()).toEqual(["Financeiro", "TI", "TI"]);
    const oculto = ls.find((l) => l.comentario === "comentário TI oculto inventado")!;
    expect(oculto.unidade).toBe("Loja Norte");
    expect(typeof oculto.chave).toBe("string");

    const t = await executar("pesquisas.satisfacaoTriar", { chave: oculto.chave, acao: "ocultar" }, completo);
    expect(t).toEqual({ status: 200, dados: "ocultar" });
    const ti = await criarConta({ perfil: "rh", permissoes: { "indicadores.satisfacao": true }, satisfacaoAreas: ["TI"] });
    const daArea = linhas(await executar("pesquisas.satisfacaoDados", {}, ti)).map((l) => l.comentario);
    expect(daArea).toContain("comentário TI inventado");
    expect(daArea).not.toContain("comentário TI oculto inventado");

    expect(await executar("pesquisas.satisfacaoTriar", { chave: oculto.chave, acao: "" }, completo)).toEqual({ status: 200, dados: null });
  });

  it("pagina por ord", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const p1 = linhas(await executar("pesquisas.satisfacaoDados", { limite: 2 }, admin));
    const p2 = linhas(await executar("pesquisas.satisfacaoDados", { limite: 2, aposOrd: p1[1]!.ord }, admin));
    expect(p1.map((l) => l.ord)).toEqual([1, 2]);
    expect(p2.map((l) => l.ord)).toEqual([3]);
  });

  it("Visualizar como usa as áreas da conta simulada", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const fin = await criarConta({ perfil: "rh", permissoes: { "indicadores.satisfacao": true }, satisfacaoAreas: ["Financeiro"] });
    expect(linhas(await executar("pesquisas.satisfacaoDados", {}, admin, fin)).map((l) => l.area)).toEqual(["Financeiro"]);
  });
});

describe("Satisfação: ciclos, upload e triagem", () => {
  it("ciclos: com a pesquisa ou com admin.usuarios; senão 403", async () => {
    const sat = await criarConta({ perfil: "rh", permissoes: { "indicadores.satisfacao": true } });
    expect(linhas(await executar("pesquisas.satisfacaoCiclos", {}, sat))).toEqual([
      expect.objectContaining({ pesquisa: "2026-09-01", respondentes: 3, aptos: 10, areas: ["TI", "Financeiro"] }),
    ]);
    const usuarios = await criarConta({ perfil: "rh", permissoes: { "admin.usuarios": true } });
    expect(linhas(await executar("pesquisas.satisfacaoCiclos", {}, usuarios))).toHaveLength(1);
    const outro = await criarConta({ perfil: "rh", permissoes: { "indicadores.boletim": true } });
    expect((await executar("pesquisas.satisfacaoCiclos", {}, outro)).status).toBe(403);
  });

  it("upload grava respostas e ciclos; recusado sem admin.upload e no Visualizar como", async () => {
    const up = await criarConta({ perfil: "rh", permissoes: { "admin.upload": true } });
    const corpo = {
      meses: ["2026-10-01"],
      linhas: [{ pesquisa: "2026-10-01", unidade: "Loja Sul", departamento: "Vendas", area: "TI", nota: 8, melhorar: ["Prazo"], extra: null, comentario: null }],
      limpar: true,
    };
    expect(await executar("pesquisas.satisfacaoSalvar", corpo, up)).toEqual({ status: 200, dados: 1 });
    const ciclos = { ciclos: [{ pesquisa: "2026-10-01", respondentes: 1, aptos: 5, areas: ["TI"] }] };
    expect(await executar("pesquisas.satisfacaoSalvarCiclos", ciclos, up)).toEqual({ status: 200, dados: 1 });
    const [{ n }] = await prisma.$queryRawUnsafe<{ n: number }[]>(`select count(*)::int as n from public.satisfacao_respostas where pesquisa = '2026-10-01'`);
    expect(n).toBe(1);

    const so = await criarConta({ perfil: "rh", permissoes: { "indicadores.satisfacao_completo": true } });
    expect((await executar("pesquisas.satisfacaoSalvar", corpo, so)).status).toBe(403);
    expect((await executar("pesquisas.satisfacaoSalvarCiclos", ciclos, so)).status).toBe(403);
    const admin = await criarConta({ perfil: "admin" });
    expect((await executar("pesquisas.satisfacaoSalvar", corpo, admin, up)).status).toBe(403);
  });

  it("triagem: só a visão completa; chave desconhecida volta com a mensagem da função", async () => {
    const sat = await criarConta({ perfil: "rh", permissoes: { "indicadores.satisfacao": true }, satisfacaoAreas: ["TI"] });
    expect((await executar("pesquisas.satisfacaoTriar", { chave: "x", acao: "ocultar" }, sat)).status).toBe(403);
    const completo = await criarConta({ perfil: "rh", permissoes: { "indicadores.satisfacao_completo": true } });
    const r = await executar("pesquisas.satisfacaoTriar", { chave: "nao-existe", acao: "loja" }, completo);
    expect(r.status).toBe(400);
    expect(erro(r)).toMatch(/Comentário não encontrado/);
    expect((await executar("pesquisas.satisfacaoTriar", { chave: "x", acao: "apagar" }, completo)).status).toBe(400);
    const admin = await criarConta({ perfil: "admin" });
    expect((await executar("pesquisas.satisfacaoTriar", { chave: "x", acao: "ocultar" }, admin, completo)).status).toBe(403);
  });
});
