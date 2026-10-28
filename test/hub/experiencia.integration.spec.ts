import { criarConta, executar, limpar, prisma } from "../helpers/hub";

type Linha = Record<string, unknown>;
const dados = (r: { status: number }) => ("dados" in r ? r.dados : undefined);
const linhas = (r: { status: number }) => (dados(r) as Linha[] | undefined) ?? [];

const TABELAS = ["avaliacao_experiencia_45", "avaliacao_experiencia_90", "vagas"];

beforeEach(async () => {
  await limpar(...TABELAS);
  // Pessoas inventadas. "matricula" (celular) e os comentários nunca descem na carga.
  await prisma.$executeRawUnsafe(`
    insert into public.avaliacao_experiencia_45
      (ciclo, pessoa_key, cpf, matricula, nome, cargo, unidade, departamento, data_admissao, status_gestor,
       notas_gestor, comentarios_gestor, comentarios_auto)
    values (45, 'p1', '00000000001', '11999990001', 'Pessoa Um', 'Consultora', 'Loja Centro', 'Vendas', '2026-08-01', 'concluida',
            '{"comportamento": 3}', '{"comportamento": "texto inventado do gestor"}', '{"comportamento": "texto inventado da pessoa"}'),
           (45, 'p2', '00000000002', '11999990002', 'Pessoa Dois', 'Gerente', 'Loja Norte', 'Vendas', '2026-08-02', 'pendente',
            '{}', '{}', '{}'),
           (45, 'p3', '00000000003', '11999990003', 'Pessoa Tres', 'Caixa', 'Loja Centro', 'Caixa', '2026-08-03', 'pendente',
            '{}', '{}', '{}')`);
  await prisma.$executeRawUnsafe(`
    insert into public.avaliacao_experiencia_90 (ciclo, pessoa_key, nome, unidade, departamento)
    values (90, 'p1', 'Pessoa Um', 'Loja Centro', 'Vendas')`);
  await prisma.$executeRawUnsafe(`
    insert into public.vagas (id, data_abertura, unidade, departamento, cargo, status, tipo_movimentacao, observacoes)
    values ('VAGA-1','2026-01-10','Loja Centro','Vendas','Consultora','Aberta','Substituição','obs inventada'),
           ('VAGA-2','2026-02-11','Loja Norte','Vendas','Gerente','Aberta','Aumento de quadro', null)`);
});

afterAll(async () => {
  await limpar(...TABELAS);
  await prisma.$disconnect();
});

describe("experiencia.lerPagina", () => {
  it("devolve as colunas leves, sem matricula nem comentários, no formato do Supabase", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const r = await executar("experiencia.lerPagina", { ciclo: 45 }, admin);
    expect(r.status).toBe(200);
    const ls = linhas(r);
    expect(ls.map((l) => l.nome)).toEqual(["Pessoa Um", "Pessoa Dois", "Pessoa Tres"]);
    expect(ls[0]!.data_admissao).toBe("2026-08-01");
    expect(ls[0]!.notas_gestor).toEqual({ comportamento: 3 });
    expect(typeof ls[0]!.id).toBe("number");
    for (const l of ls) {
      expect(l).not.toHaveProperty("matricula");
      expect(l).not.toHaveProperty("comentarios_gestor");
      expect(l).not.toHaveProperty("comentarios_auto");
    }
    expect(linhas(await executar("experiencia.lerPagina", { ciclo: 90 }, admin)).map((l) => l.nome)).toEqual(["Pessoa Um"]);
  });

  it("pagina por id", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const p1 = linhas(await executar("experiencia.lerPagina", { ciclo: 45, limite: 2 }, admin));
    const p2 = linhas(await executar("experiencia.lerPagina", { ciclo: 45, limite: 2, aposId: p1[1]!.id }, admin));
    expect(p1).toHaveLength(2);
    expect(p2.map((l) => l.nome)).toEqual(["Pessoa Tres"]);
  });

  it("gestor e RH ficam presos ao recorte de unidade/departamento", async () => {
    const gestor = await criarConta({ perfil: "gestor", permissoes: { "indicadores.experiencia": true }, unidades: ["Loja Centro"] });
    expect(linhas(await executar("experiencia.lerPagina", { ciclo: 45 }, gestor)).map((l) => l.nome)).toEqual(["Pessoa Um", "Pessoa Tres"]);
    const rh = await criarConta({ perfil: "rh", permissoes: { "indicadores.boletim": true }, departamentos: ["Caixa"] });
    expect(linhas(await executar("experiencia.lerPagina", { ciclo: 45 }, rh)).map((l) => l.nome)).toEqual(["Pessoa Tres"]);
  });

  it("sem indicadores.experiencia nem indicadores.boletim: 403", async () => {
    const outro = await criarConta({ perfil: "gestor", permissoes: { "indicadores.headcount": true } });
    expect((await executar("experiencia.lerPagina", { ciclo: 45 }, outro)).status).toBe(403);
  });

  it("recusa ciclo fora da lista", async () => {
    const admin = await criarConta({ perfil: "admin" });
    expect((await executar("experiencia.lerPagina", { ciclo: 60 }, admin)).status).toBe(400);
  });
});

describe("experiencia.comentarios", () => {
  it("devolve só os comentários da linha pedida (objeto) e null quando não existe", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const [p] = linhas(await executar("experiencia.lerPagina", { ciclo: 45, limite: 1 }, admin));
    const r = await executar("experiencia.comentarios", { ciclo: 45, id: p!.id }, admin);
    expect(r.status).toBe(200);
    expect(dados(r)).toEqual({
      comentarios_gestor: { comportamento: "texto inventado do gestor" },
      comentarios_auto: { comportamento: "texto inventado da pessoa" },
    });
    const nada = await executar("experiencia.comentarios", { ciclo: 45, id: 999999 }, admin);
    expect(nada).toEqual({ status: 200, dados: null });
  });

  it("linha fora do recorte vem null; sem a permissão: 403", async () => {
    const todas = linhas(await executar("experiencia.lerPagina", { ciclo: 45 }, await criarConta({ perfil: "admin" })));
    const norte = todas.find((l) => l.nome === "Pessoa Dois")!;
    const gestor = await criarConta({ perfil: "gestor", permissoes: { "indicadores.experiencia": true }, unidades: ["Loja Centro"] });
    expect(dados(await executar("experiencia.comentarios", { ciclo: 45, id: norte.id }, gestor))).toBeNull();
    const outro = await criarConta({ perfil: "gestor", permissoes: { "indicadores.headcount": true } });
    expect((await executar("experiencia.comentarios", { ciclo: 45, id: norte.id }, outro)).status).toBe(403);
  });
});

describe("experiencia.vagasReposicao", () => {
  it("devolve só as colunas do cruzamento, por id, com recorte", async () => {
    const gestor = await criarConta({ perfil: "gestor", permissoes: { "recrutamento.vagas": true }, unidades: ["Loja Centro"] });
    const r = await executar("experiencia.vagasReposicao", {}, gestor);
    expect(r.status).toBe(200);
    expect(linhas(r)).toEqual([{
      id: "VAGA-1", data_abertura: "2026-01-10", unidade: "Loja Centro", departamento: "Vendas", cargo: "Consultora",
      status: "Aberta", tipo_movimentacao: "Substituição",
    }]);
  });

  it("pagina por id", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const p1 = linhas(await executar("experiencia.vagasReposicao", { limite: 1 }, admin));
    const p2 = linhas(await executar("experiencia.vagasReposicao", { limite: 1, aposId: p1[0]!.id }, admin));
    expect([p1[0]!.id, p2[0]!.id]).toEqual(["VAGA-1", "VAGA-2"]);
  });

  it("sem acesso ao Recrutamento: 403", async () => {
    const so = await criarConta({ perfil: "gestor", permissoes: { "indicadores.experiencia": true } });
    expect((await executar("experiencia.vagasReposicao", {}, so)).status).toBe(403);
  });
});

describe("Visualizar como", () => {
  it("leitura roda com o recorte da conta simulada", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const alvo = await criarConta({ perfil: "gestor", permissoes: { "indicadores.experiencia": true }, unidades: ["Loja Norte"] });
    const r = await executar("experiencia.lerPagina", { ciclo: 45 }, admin, alvo);
    expect(linhas(r).map((l) => l.nome)).toEqual(["Pessoa Dois"]);
  });
});
