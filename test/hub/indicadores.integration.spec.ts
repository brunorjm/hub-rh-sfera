import { criarConta, executar, limpar, prisma } from "../helpers/hub";

const linhas = (r: { status: number }) => ("dados" in r ? (r.dados as Record<string, unknown>[]) : []);

beforeEach(async () => {
  await limpar("colaboradores", "one_on_one", "twygo_usuarios");
  await prisma.$executeRawUnsafe(`
    insert into public.colaboradores (external_id, nome, unidade, departamento, situacao, matricula, data_admissao)
    values ('1','Ana','Loja Centro','Vendas','Ativo','11999990000','2026-01-10'),
           ('2','Bia','Loja Norte','Vendas','Ativo','11999990001','2026-02-11'),
           ('3','Caio','Loja Centro','Estoque','Ativo','11999990002','2026-03-12')`);
});

afterAll(async () => {
  await limpar("colaboradores", "one_on_one", "twygo_usuarios");
  await prisma.$disconnect();
});

describe("indicadores.lerPagina", () => {
  it("gestor só recebe as linhas da própria unidade (RLS original)", async () => {
    const gestor = await criarConta({ perfil: "gestor", permissoes: { "indicadores.headcount": true }, unidades: ["Loja Centro"] });
    const r = await executar("indicadores.lerPagina", { tabela: "colaboradores", aposId: 0 }, gestor);
    expect(r.status).toBe(200);
    expect(linhas(r).map((l) => l.nome).sort()).toEqual(["Ana", "Caio"]);
  });

  it("RH com recorte de departamento também fica preso a ele", async () => {
    const rh = await criarConta({ perfil: "rh", permissoes: { "indicadores.headcount": true }, departamentos: ["Vendas"] });
    const r = await executar("indicadores.lerPagina", { tabela: "colaboradores", aposId: 0 }, rh);
    expect(linhas(r).map((l) => l.nome).sort()).toEqual(["Ana", "Bia"]);
  });

  it("matricula (celular) nunca sai e as datas vêm no formato do Supabase", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const r = linhas(await executar("indicadores.lerPagina", { tabela: "colaboradores", aposId: 0 }, admin));
    expect(r).toHaveLength(3);
    expect(r[0]).not.toHaveProperty("matricula");
    expect(r[0]!.data_admissao).toBe("2026-01-10");
    expect(typeof r[0]!.id).toBe("number");
  });

  it("one_on_one sem matrícula (celular), anotações e tópicos; twygo_usuarios sem CPF", async () => {
    await prisma.$executeRawUnsafe(`
      insert into public.one_on_one (lider, liderado, liderado_matricula, unidade, departamento, status,
        topicos_lider, topicos_liderado, anotacoes_lider, anotacoes_liderado, acoes_ativas_lider)
      values ('Líder Inventada', 'Liderado Inventado', '11999990000', 'Loja Centro', 'Vendas', 'Realizado',
        'tópico', 'tópico', 'anotação sigilosa', 'anotação sigilosa', '2')`);
    await prisma.$executeRawUnsafe(`
      insert into public.twygo_usuarios (twygo_id, nome_completo, email, cpf, situacao, unidade, departamento)
      values ('T1', 'Pessoa Inventada', 'pessoa@exemplo.test', '00000000191', 'Ativo', 'Loja Centro', 'Vendas')`);
    const admin = await criarConta({ perfil: "admin" });
    const [o] = linhas(await executar("indicadores.lerPagina", { tabela: "one_on_one", aposId: 0 }, admin));
    expect(o).toMatchObject({ lider: "Líder Inventada", liderado: "Liderado Inventado", status: "Realizado", acoes_ativas_lider: "2" });
    for (const c of ["liderado_matricula", "topicos_lider", "topicos_liderado", "anotacoes_lider", "anotacoes_liderado"]) {
      expect(o).not.toHaveProperty(c);
    }
    expect(JSON.stringify(o)).not.toMatch(/11999990000|sigilosa|tópico/);
    const [t] = linhas(await executar("indicadores.lerPagina", { tabela: "twygo_usuarios", aposId: 0 }, admin));
    expect(t).toMatchObject({ nome_completo: "Pessoa Inventada", situacao: "Ativo" });
    expect(t).not.toHaveProperty("cpf");
  });

  it("toda tabela da lista tem colunas explícitas que existem no banco", async () => {
    const admin = await criarConta({ perfil: "admin" });
    for (const tabela of [
      "colaboradores", "feedbacks", "one_on_one", "celebracoes", "entrevista_pesquisa", "entrevista_solicitacao",
      "twygo_participantes", "twygo_usuarios", "twygo_conteudos", "unibe_pdv", "unibe_pessoas", "academia_hering",
      "treinamento_turmas",
    ]) {
      const r = await executar("indicadores.lerPagina", { tabela, aposId: 0, limite: 1 }, admin);
      expect([tabela, r.status]).toEqual([tabela, 200]);
    }
  });

  it("pagina por id e respeita o limite", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const p1 = linhas(await executar("indicadores.lerPagina", { tabela: "colaboradores", aposId: 0, limite: 2 }, admin));
    const p2 = linhas(await executar("indicadores.lerPagina", { tabela: "colaboradores", aposId: p1[1]!.id, limite: 2 }, admin));
    expect(p1).toHaveLength(2);
    expect(p2.map((l) => l.nome)).toEqual(["Caio"]);
  });

  it("tabela fora da lista é recusada antes do banco", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const r = await executar("indicadores.lerPagina", { tabela: "profiles", aposId: 0 }, admin);
    expect(r.status).toBe(400);
  });

  it("operação desconhecida não existe", async () => {
    const admin = await criarConta({ perfil: "admin" });
    expect((await executar("indicadores.apagarTudo", {}, admin)).status).toBe(404);
  });

  it("Visualizar como: lê com o recorte da pessoa vista", async () => {
    const admin = await criarConta({ perfil: "admin", permissoes: { "admin.usuarios": true } });
    const gestor = await criarConta({ perfil: "gestor", permissoes: { "indicadores.headcount": true }, unidades: ["Loja Norte"] });
    const r = await executar("indicadores.lerPagina", { tabela: "colaboradores", aposId: 0 }, admin, gestor);
    expect(linhas(r).map((l) => l.nome)).toEqual(["Bia"]);
  });
});
