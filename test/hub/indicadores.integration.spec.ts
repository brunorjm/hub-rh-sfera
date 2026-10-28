import { criarConta, executar, limpar, prisma } from "../helpers/hub";

const linhas = (r: { status: number }) => ("dados" in r ? (r.dados as Record<string, unknown>[]) : []);

beforeEach(async () => {
  await limpar("colaboradores");
  await prisma.$executeRawUnsafe(`
    insert into public.colaboradores (external_id, nome, unidade, departamento, situacao, matricula, data_admissao)
    values ('1','Ana','Loja Centro','Vendas','Ativo','11999990000','2026-01-10'),
           ('2','Bia','Loja Norte','Vendas','Ativo','11999990001','2026-02-11'),
           ('3','Caio','Loja Centro','Estoque','Ativo','11999990002','2026-03-12')`);
});

afterAll(async () => {
  await limpar("colaboradores");
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
