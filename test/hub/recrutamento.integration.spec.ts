import { criarConta, executar, limpar, prisma } from "../helpers/hub";

type Linha = Record<string, unknown>;
const dados = (r: { status: number }) => ("dados" in r ? r.dados : undefined);
const linhas = (r: { status: number }) => (dados(r) as Linha[] | undefined) ?? [];

const TABELAS = [
  "historico", "solicitacoes", "entrevistas", "onboarding", "pareceres_gestor", "visitas_loja", "candidatos", "vagas",
  "unidades", "recrutamento_departamentos",
];

beforeEach(async () => {
  await limpar(...TABELAS);
  await prisma.$executeRawUnsafe(`
    insert into public.vagas (id, data_abertura, unidade, departamento, cargo, status, portais_ativos)
    values ('VAGA-1','2026-01-10','Loja Centro','Vendas','Consultora','Aberta','{Indeed}'),
           ('VAGA-2','2026-02-11','Loja Norte','Vendas','Gerente','Aberta','{}'),
           ('VAGA-3','2026-03-12','Loja Centro','Estoque','Estoquista','Fechada','{}')`);
  await prisma.$executeRawUnsafe(`
    insert into public.candidatos (id, vaga_id, nome, unidade, departamento)
    values ('CAND-1','VAGA-1','Candidata Um','Loja Centro','Vendas'),
           ('CAND-2','VAGA-2','Candidato Dois','Loja Norte','Vendas')`);
  await prisma.$executeRawUnsafe(`
    insert into public.unidades (nome, ativo) values ('Loja Norte', true), ('Loja Centro', false)`);
});

afterAll(async () => {
  await limpar(...TABELAS);
  await prisma.$disconnect();
});

describe("recrutamento.lerPagina", () => {
  it("gestor só recebe as vagas da própria unidade e no formato do Supabase", async () => {
    const gestor = await criarConta({ perfil: "gestor", permissoes: { "recrutamento.vagas": true }, unidades: ["Loja Centro"] });
    const r = await executar("recrutamento.lerPagina", { tabela: "vagas" }, gestor);
    expect(r.status).toBe(200);
    const vs = linhas(r);
    expect(vs.map((v) => v.id)).toEqual(["VAGA-1", "VAGA-3"]);
    expect(vs[0]!.data_abertura).toBe("2026-01-10");
    expect(vs[0]!.portais_ativos).toEqual(["Indeed"]);
    expect(vs[0]).toHaveProperty("hub_alterado_em");
  });

  it("tabela sem a permissão dela vem vazia (RLS), como no Supabase", async () => {
    const so = await criarConta({ perfil: "gestor", permissoes: { "treinamento_dev.visita_loja": true } });
    const r = await executar("recrutamento.lerPagina", { tabela: "vagas" }, so);
    expect(r.status).toBe(200);
    expect(linhas(r)).toEqual([]);
  });

  it("RH com recorte de departamento fica preso a ele", async () => {
    const rh = await criarConta({ perfil: "rh", permissoes: { "recrutamento.candidatos": true }, departamentos: ["Estoque"] });
    expect(linhas(await executar("recrutamento.lerPagina", { tabela: "vagas" }, rh)).map((v) => v.id)).toEqual(["VAGA-3"]);
  });

  it("pagina por id, devolve só ids e filtra pelo que mudou", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const p1 = linhas(await executar("recrutamento.lerPagina", { tabela: "vagas", limite: 2 }, admin));
    const p2 = linhas(await executar("recrutamento.lerPagina", { tabela: "vagas", limite: 2, aposId: p1[1]!.id }, admin));
    expect(p1.map((v) => v.id)).toEqual(["VAGA-1", "VAGA-2"]);
    expect(p2.map((v) => v.id)).toEqual(["VAGA-3"]);

    const ids = linhas(await executar("recrutamento.lerPagina", { tabela: "candidatos", soIds: true }, admin));
    expect(ids).toEqual([{ id: "CAND-1" }, { id: "CAND-2" }]);

    // hub_alterado_em é posto pelo gatilho do banco: marca o instante e altera uma vaga depois dele.
    const [{ agora }] = await prisma.$queryRawUnsafe<{ agora: Date }[]>(`select clock_timestamp() as agora`);
    await prisma.$executeRawUnsafe(`update public.vagas set status = 'Congelada' where id = 'VAGA-2'`);
    const novas = linhas(await executar("recrutamento.lerPagina", { tabela: "vagas", desde: agora.toISOString() }, admin));
    expect(novas.map((v) => v.id)).toEqual(["VAGA-2"]);
  });

  it("pagina tabela de id uuid", async () => {
    const admin = await criarConta({ perfil: "admin", permissoes: {} });
    await prisma.$executeRawUnsafe(`insert into public.entrevistas (candidato_id, vaga_id, unidade) values ('CAND-1','VAGA-1','Loja Centro'), ('CAND-2','VAGA-2','Loja Norte')`);
    const p1 = linhas(await executar("recrutamento.lerPagina", { tabela: "entrevistas", limite: 1 }, admin));
    const p2 = linhas(await executar("recrutamento.lerPagina", { tabela: "entrevistas", limite: 1, aposId: p1[0]!.id }, admin));
    expect(p1).toHaveLength(1);
    expect(p2).toHaveLength(1);
    expect(p2[0]!.id).not.toBe(p1[0]!.id);
  });

  it("recusa tabela fora da lista, delta sem controle e conta sem nenhuma permissão do módulo", async () => {
    const admin = await criarConta({ perfil: "admin" });
    expect((await executar("recrutamento.lerPagina", { tabela: "profiles" }, admin)).status).toBe(400);
    expect((await executar("recrutamento.lerPagina", { tabela: "onboarding", desde: "2025-01-01T00:00:00Z" }, admin)).status).toBe(400);
    const nada = await criarConta({ perfil: "gestor", permissoes: { "indicadores.headcount": true } });
    expect((await executar("recrutamento.lerPagina", { tabela: "vagas" }, nada)).status).toBe(403);
  });

  it("Visualizar como: lê com o recorte da pessoa vista", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const gestor = await criarConta({ perfil: "gestor", permissoes: { "recrutamento.vagas": true }, unidades: ["Loja Norte"] });
    const r = await executar("recrutamento.lerPagina", { tabela: "vagas" }, admin, gestor);
    expect(linhas(r).map((v) => v.id)).toEqual(["VAGA-2"]);
  });
});

describe("recrutamento.versoes e recrutamento.resumo", () => {
  it("versões trazem o contador das tabelas", async () => {
    const gestor = await criarConta({ perfil: "gestor", permissoes: { "recrutamento.vagas": true } });
    const r = await executar("recrutamento.versoes", {}, gestor);
    expect(r.status).toBe(200);
    const vagas = linhas(r).find((v) => v.tabela === "vagas");
    expect(typeof vagas?.versao).toBe("number");
  });

  it("resumo chama a função do banco (sem permissão dentro dela, vem vazio)", async () => {
    const gestor = await criarConta({ perfil: "gestor", permissoes: { "recrutamento.vagas": true } });
    for (const funcao of ["controle_desligamento_indicadores", "entrevistas_desligamento_indicadores", "controle_desligamento_respostas_forms_resumo"]) {
      const r = await executar("recrutamento.resumo", { funcao }, gestor);
      expect(r.status).toBe(200);
      expect(linhas(r)).toEqual([]);
    }
    expect((await executar("recrutamento.resumo", { funcao: "admin_truncate" }, gestor)).status).toBe(400);
  });

  it("sem nenhuma permissão do módulo: 403", async () => {
    const nada = await criarConta({ perfil: "gestor", permissoes: { "indicadores.headcount": true } });
    expect((await executar("recrutamento.versoes", {}, nada)).status).toBe(403);
    expect((await executar("recrutamento.resumo", { funcao: "controle_desligamento_indicadores" }, nada)).status).toBe(403);
  });
});

describe("recrutamento.listarCadastro e recrutamento.salvarCadastro", () => {
  it("lista ordenada por nome", async () => {
    const gestor = await criarConta({ perfil: "gestor", permissoes: { "recrutamento.vagas": true } });
    const r = await executar("recrutamento.listarCadastro", { tabela: "unidades" }, gestor);
    expect(linhas(r).map((u) => [u.nome, u.ativo])).toEqual([["Loja Centro", false], ["Loja Norte", true]]);
    const nada = await criarConta({ perfil: "gestor", permissoes: { "indicadores.headcount": true } });
    expect((await executar("recrutamento.listarCadastro", { tabela: "unidades" }, nada)).status).toBe(403);
  });

  it("cria e edita (upsert por id) com admin.cadastros_recrutamento", async () => {
    const conta = await criarConta({ perfil: "rh", permissoes: { "admin.cadastros_recrutamento": true } });
    const novo = await executar("recrutamento.salvarCadastro", { tabela: "recrutamento_departamentos", linha: { nome: "Caixa", ativo: true, unidade: "Loja Norte" } }, conta);
    expect(novo.status).toBe(200);
    const [{ id }] = await prisma.$queryRawUnsafe<{ id: bigint }[]>(`select id from public.recrutamento_departamentos where nome = 'Caixa'`);
    const ed = await executar("recrutamento.salvarCadastro", { tabela: "recrutamento_departamentos", linha: { id: Number(id), nome: "Caixa", ativo: false, unidade: "Loja Norte" } }, conta);
    expect(ed.status).toBe(200);
    const linhasBanco = await prisma.$queryRawUnsafe<{ ativo: boolean }[]>(`select ativo from public.recrutamento_departamentos`);
    expect(linhasBanco).toEqual([{ ativo: false }]);
    expect((await executar("recrutamento.salvarCadastro", { tabela: "unidades", linha: { nome: "X", unidade: "Y" } }, conta)).status).toBe(400);
  });

  it("sem a permissão e no Visualizar como: 403", async () => {
    const gestor = await criarConta({ perfil: "gestor", permissoes: { "recrutamento.vagas": true } });
    expect((await executar("recrutamento.salvarCadastro", { tabela: "unidades", linha: { nome: "Nova" } }, gestor)).status).toBe(403);
    const admin = await criarConta({ perfil: "admin" });
    expect((await executar("recrutamento.salvarCadastro", { tabela: "unidades", linha: { nome: "Nova" } }, admin, gestor)).status).toBe(403);
    const n = await prisma.$queryRawUnsafe<{ n: number }[]>(`select count(*)::int n from public.unidades where nome = 'Nova'`);
    expect(n[0]!.n).toBe(0);
  });
});

describe("recrutamento.inserir / atualizar / excluir", () => {
  it("insere vaga e devolve a linha gravada (datas, arrays e null)", async () => {
    const gestor = await criarConta({ perfil: "gestor", permissoes: { "recrutamento.vagas": true }, unidades: ["Loja Centro"] });
    const r = await executar("recrutamento.inserir", {
      tabela: "vagas",
      linha: { id: "VAGA-9", unidade: "Loja Centro", departamento: "Vendas", data_abertura: "2026-10-01", data_fechamento: null, portais_ativos: ["LinkedIn"], fit_pct: 80.5, num_inscricoes: 3 },
    }, gestor);
    expect(r.status).toBe(200);
    const v = dados(r) as Linha;
    expect(v).toMatchObject({ id: "VAGA-9", data_abertura: "2026-10-01", data_fechamento: null, portais_ativos: ["LinkedIn"], fit_pct: 80.5, num_inscricoes: 3 });
    expect(v.criado_em).toBeTruthy();
  });

  it("insere em tabela de id gerado pelo banco (onboarding)", async () => {
    const conta = await criarConta({ perfil: "rh", permissoes: { "recrutamento.candidatos": true } });
    const r = await executar("recrutamento.inserir", { tabela: "onboarding", linha: { candidato_id: "CAND-1", vaga_id: "VAGA-1", unidade: "Loja Centro", departamento: "Vendas" } }, conta);
    expect(r.status).toBe(200);
    expect((dados(r) as Linha).status).toBe("Pendente");
    expect(typeof (dados(r) as Linha).id).toBe("string");
  });

  it("gestor não grava vaga fora do próprio recorte (RLS)", async () => {
    const gestor = await criarConta({ perfil: "gestor", permissoes: { "recrutamento.vagas": true }, unidades: ["Loja Centro"] });
    const r = await executar("recrutamento.inserir", { tabela: "vagas", linha: { id: "VAGA-8", unidade: "Loja Norte", departamento: "Vendas" } }, gestor);
    expect(r.status).toBe(403);
  });

  it("recusa coluna desconhecida, tabela sem esse tipo de escrita e falta de permissão", async () => {
    const admin = await criarConta({ perfil: "admin" });
    expect((await executar("recrutamento.inserir", { tabela: "vagas", linha: { id: "V", matricula: "1" } }, admin)).status).toBe(400);
    expect((await executar("recrutamento.excluir", { tabela: "onboarding", id: "x" }, admin)).status).toBe(400);
    const agenda = await criarConta({ perfil: "gestor", permissoes: { "recrutamento.agenda": true } });
    expect((await executar("recrutamento.inserir", { tabela: "vagas", linha: { id: "V" } }, agenda)).status).toBe(403);
    const nada = await criarConta({ perfil: "gestor", permissoes: { "indicadores.headcount": true } });
    expect((await executar("recrutamento.inserir", { tabela: "vagas", linha: { id: "V" } }, nada)).status).toBe(403);
  });

  it("atualiza e devolve a linha; linha escondida pela RLS dá 404", async () => {
    const gestor = await criarConta({ perfil: "gestor", permissoes: { "recrutamento.vagas": true }, unidades: ["Loja Centro"] });
    const r = await executar("recrutamento.atualizar", { tabela: "vagas", id: "VAGA-1", linha: { status: "Congelada", data_congelamento: "2026-10-20" } }, gestor);
    expect(r.status).toBe(200);
    expect(dados(r)).toMatchObject({ id: "VAGA-1", status: "Congelada", data_congelamento: "2026-10-20", cargo: "Consultora" });
    const fora = await executar("recrutamento.atualizar", { tabela: "vagas", id: "VAGA-2", linha: { status: "Congelada" } }, gestor);
    expect(fora.status).toBe(404);
    const [v2] = await prisma.$queryRawUnsafe<{ status: string }[]>(`select status from public.vagas where id = 'VAGA-2'`);
    expect(v2!.status).toBe("Aberta");
  });

  it("Parecer do Gestor atualiza candidato (policy permite parecer_gestor)", async () => {
    const conta = await criarConta({ perfil: "gestor", permissoes: { "recrutamento.parecer_gestor": true } });
    const r = await executar("recrutamento.atualizar", { tabela: "candidatos", id: "CAND-1", linha: { resultado_gestor: "Aprovado" } }, conta);
    expect(r.status).toBe(200);
  });

  it("exclui dentro do recorte; fora dele não apaga nada", async () => {
    const gestor = await criarConta({ perfil: "gestor", permissoes: { "recrutamento.candidatos": true }, unidades: ["Loja Centro"] });
    expect((await executar("recrutamento.excluir", { tabela: "candidatos", id: "CAND-1" }, gestor)).status).toBe(200);
    expect((await executar("recrutamento.excluir", { tabela: "candidatos", id: "CAND-2" }, gestor)).status).toBe(200);
    const restam = await prisma.$queryRawUnsafe<{ id: string }[]>(`select id from public.candidatos order by id`);
    expect(restam).toEqual([{ id: "CAND-2" }]);
  });

  it("Controle de Desligamento grava pelo mesmo caminho só com a permissão dele", async () => {
    const controle = await criarConta({ perfil: "rh", permissoes: { "indicadores.controle_desligamento": true } });
    const r = await executar("recrutamento.inserir", { tabela: "controle_desligamento", linha: { id_desligamento: "TESTE-REC-1", colaborador_nome: "Pessoa Inventada", unidade: "Loja Centro", data_demissao: "2026-10-01" } }, controle);
    expect(r.status).toBe(200);
    const id = (dados(r) as Linha).id;
    expect(typeof id).toBe("number");
    const u = await executar("recrutamento.atualizar", { tabela: "controle_desligamento", id, linha: { status_feedz: "Feito" } }, controle);
    expect(dados(u)).toMatchObject({ id, status_feedz: "Feito", data_demissao: "2026-10-01" });
    await prisma.$executeRawUnsafe(`delete from public.controle_desligamento where id_desligamento = 'TESTE-REC-1'`);
    const vagas = await criarConta({ perfil: "rh", permissoes: { "recrutamento.vagas": true } });
    expect((await executar("recrutamento.inserir", { tabela: "controle_desligamento", linha: { id_desligamento: "TESTE-REC-2" } }, vagas)).status).toBe(403);
  });

  it("Visualizar como recusa as três escritas", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const outra = await criarConta({ perfil: "admin" });
    expect((await executar("recrutamento.inserir", { tabela: "vagas", linha: { id: "V" } }, admin, outra)).status).toBe(403);
    expect((await executar("recrutamento.atualizar", { tabela: "vagas", id: "VAGA-1", linha: { status: "X" } }, admin, outra)).status).toBe(403);
    expect((await executar("recrutamento.excluir", { tabela: "vagas", id: "VAGA-1" }, admin, outra)).status).toBe(403);
    const n = await prisma.$queryRawUnsafe<{ n: number }[]>(`select count(*)::int n from public.vagas`);
    expect(n[0]!.n).toBe(3);
  });
});

describe("recrutamento.registrarAcao / listarHistorico", () => {
  it("grava com o autor da sessão e lista do mais novo para o mais antigo", async () => {
    const conta = await criarConta({ perfil: "rh", permissoes: { "recrutamento.vagas": true, "recrutamento.historico": true } });
    expect((await executar("recrutamento.registrarAcao", { acao: "Criação de Vaga", vaga_id: "VAGA-1", detalhes: "Vaga criada" }, conta)).status).toBe(200);
    await prisma.$executeRawUnsafe(`update public.historico set "timestamp" = '2026-01-01'`);
    expect((await executar("recrutamento.registrarAcao", { acao: "Edição de Vaga", vaga_id: "VAGA-1", campo: "Status", valor_anterior: "Aberta", valor_novo: null }, conta)).status).toBe(200);
    const r = linhas(await executar("recrutamento.listarHistorico", {}, conta));
    expect(r.map((h) => h.acao)).toEqual(["Edição de Vaga", "Criação de Vaga"]);
    expect(r[0]!.usuario).toBe(conta.nome);
    expect(r[1]!.timestamp).toMatch(/^2026-01-01T/);
  });

  it("autor não pode vir do navegador; sem permissão e no Visualizar como: 403", async () => {
    const conta = await criarConta({ perfil: "rh", permissoes: { "recrutamento.vagas": true } });
    expect((await executar("recrutamento.registrarAcao", { acao: "X", usuario: "Outra Pessoa" }, conta)).status).toBe(400);
    expect((await executar("recrutamento.listarHistorico", {}, conta)).status).toBe(403);
    const so = await criarConta({ perfil: "rh", permissoes: { "recrutamento.historico": true } });
    expect((await executar("recrutamento.registrarAcao", { acao: "X" }, so)).status).toBe(403);
    const admin = await criarConta({ perfil: "admin" });
    expect((await executar("recrutamento.registrarAcao", { acao: "X" }, admin, conta)).status).toBe(403);
    const n = await prisma.$queryRawUnsafe<{ n: number }[]>(`select count(*)::int n from public.historico`);
    expect(n[0]!.n).toBe(0);
  });
});

describe("recrutamento.criarSolicitacao / listarSolicitacoes / decidirSolicitacao", () => {
  it("cria pendente com o solicitante da sessão, lista e decide", async () => {
    const pede = await criarConta({ perfil: "gestor", permissoes: { "recrutamento.vagas": true } });
    const aprova = await criarConta({ perfil: "rh", permissoes: { "recrutamento.aprovacoes": true } });
    const c = await executar("recrutamento.criarSolicitacao", { tipo: "excluir-vaga", payload: { vagaId: "VAGA-1", cargo: "Consultora" }, descricao: "Excluir vaga VAGA-1" }, pede);
    expect(c.status).toBe(200);

    const lista = linhas(await executar("recrutamento.listarSolicitacoes", {}, aprova));
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ tipo: "excluir-vaga", status: "Pendente", solicitante: pede.nome, perfil_solicitante: "gestor", payload: { vagaId: "VAGA-1", cargo: "Consultora" } });

    const d = await executar("recrutamento.decidirSolicitacao", { id: lista[0]!.id, status: "Aprovada", observacao: "ok" }, aprova);
    expect(d.status).toBe(200);
    const [depois] = linhas(await executar("recrutamento.listarSolicitacoes", {}, aprova));
    expect(depois).toMatchObject({ status: "Aprovada", aprovado_por: aprova.nome, observacao_admin: "ok" });
    expect(depois!.data_decisao).toBeTruthy();
  });

  it("sem permissão e no Visualizar como: 403", async () => {
    const pede = await criarConta({ perfil: "gestor", permissoes: { "recrutamento.vagas": true } });
    expect((await executar("recrutamento.listarSolicitacoes", {}, pede)).status).toBe(403);
    expect((await executar("recrutamento.decidirSolicitacao", { id: "00000000-0000-0000-0000-000000000000", status: "Aprovada" }, pede)).status).toBe(403);
    const so = await criarConta({ perfil: "gestor", permissoes: { "recrutamento.banco_talentos": true } });
    expect((await executar("recrutamento.criarSolicitacao", { tipo: "x", payload: {} }, so)).status).toBe(403);
    const admin = await criarConta({ perfil: "admin" });
    expect((await executar("recrutamento.criarSolicitacao", { tipo: "x", payload: {} }, admin, pede)).status).toBe(403);
    const n = await prisma.$queryRawUnsafe<{ n: number }[]>(`select count(*)::int n from public.solicitacoes`);
    expect(n[0]!.n).toBe(0);
  });
});

describe("token de link público e autoria vêm do servidor", () => {
  it("link_token enviado é trocado por 64 hex do servidor (inserir e atualizar)", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const ins = await executar("recrutamento.inserir", {
      tabela: "pareceres_gestor",
      linha: { id: "PG-T", candidato_id: "CAND-1", vaga_id: "VAGA-1", modelo: "hering", status: "Pendente", link_token: "token-escolhido-pelo-navegador" },
    }, admin);
    expect(ins.status).toBe(200);
    const t1 = (dados(ins) as Linha).link_token as string;
    expect(t1).toMatch(/^[0-9a-f]{64}$/);

    const upd = await executar("recrutamento.atualizar", {
      tabela: "pareceres_gestor", id: "PG-T", linha: { link_token: "00000000-0000-4000-8000-000000000000" },
    }, admin);
    const t2 = (dados(upd) as Linha).link_token as string;
    expect(t2).toMatch(/^[0-9a-f]{64}$/);
    expect(t2).not.toBe(t1);
    const [g] = await prisma.$queryRawUnsafe<Linha[]>("select link_token from public.pareceres_gestor where id = 'PG-T'");
    expect(g!.link_token).toBe(t2);

    // Sem link (null) continua sem link.
    const sem = await executar("recrutamento.atualizar", { tabela: "pareceres_gestor", id: "PG-T", linha: { link_token: null } }, admin);
    expect((dados(sem) as Linha).link_token).toBeNull();
  });

  it("autoria: criar grava o usuário da sessão; editar sobrescreve atualizado_por e mantém quem criou/enviou", async () => {
    const rh = await criarConta({
      perfil: "rh",
      permissoes: { "recrutamento.candidatos": true, "treinamento_dev.onboarding": true, "treinamento_dev.visita_loja": true },
    });
    const forjado = "Outra Pessoa (forjado)";

    const cand = await executar("recrutamento.atualizar", { tabela: "candidatos", id: "CAND-1", linha: { nome: "Candidata Um", atualizado_por: forjado } }, rh);
    expect((dados(cand) as Linha).atualizado_por).toBe(rh.nome);
    const novo = await executar("recrutamento.inserir", { tabela: "candidatos", linha: { id: "CAND-9", vaga_id: "VAGA-1", nome: "Nova", atualizado_por: forjado } }, rh);
    expect((dados(novo) as Linha).atualizado_por).toBe(rh.nome);

    const onb = await executar("recrutamento.inserir", { tabela: "onboarding", linha: { candidato_id: "CAND-1", vaga_id: "VAGA-1", enviado_por: forjado } }, rh);
    const onbId = (dados(onb) as Linha).id as string;
    expect((dados(onb) as Linha).enviado_por).toBe(rh.nome);
    // A tela de Onboarding devolve a linha inteira ao editar: enviado_por do navegador é descartado.
    const onb2 = await executar("recrutamento.atualizar", { tabela: "onboarding", id: onbId, linha: { status: "Realizado", enviado_por: forjado } }, rh);
    expect(dados(onb2)).toMatchObject({ status: "Realizado", enviado_por: rh.nome });

    const vis = await executar("recrutamento.inserir", { tabela: "visitas_loja", linha: { id: "VL-1", loja: "Loja Centro", criado_por: forjado } }, rh);
    expect((dados(vis) as Linha).criado_por).toBe(rh.nome);
  });

  it("autoria no Controle e na Entrevista de Desligamento; solicitante (gestor do pedido) fica como veio", async () => {
    const rh = await criarConta({ perfil: "rh", permissoes: { "indicadores.controle_desligamento": true } });
    const outra = await criarConta({ perfil: "rh", permissoes: { "indicadores.controle_desligamento": true } });
    const forjado = "Outra Pessoa (forjado)";
    try {
      const c = await executar("recrutamento.inserir", {
        tabela: "controle_desligamento",
        linha: { id_desligamento: "TESTE-AUT-1", colaborador_nome: "Pessoa Inventada", unidade: "Loja Centro", solicitante: "Gestora Inventada", criado_por: forjado, atualizado_por: forjado },
      }, rh);
      expect(c).toMatchObject({ status: 200 });
      expect(dados(c)).toMatchObject({ solicitante: "Gestora Inventada", criado_por: rh.nome, atualizado_por: rh.nome });
      const id = (dados(c) as Linha).id;
      const u = await executar("recrutamento.atualizar", {
        tabela: "controle_desligamento", id, linha: { status_feedz: "Feito", criado_por: forjado, atualizado_por: forjado },
      }, outra);
      expect(dados(u)).toMatchObject({ criado_por: rh.nome, atualizado_por: outra.nome });

      const e = await executar("recrutamento.inserir", {
        tabela: "entrevistas_desligamento",
        linha: { id: "ED-AUT", colaborador_nome: "Pessoa Inventada", respostas: {}, status: "Pendente", link_token: "x".repeat(20), gerado_por: forjado },
      }, rh);
      expect(e.status).toBe(200);
      expect((dados(e) as Linha).gerado_por).toBe(rh.nome);
      expect((dados(e) as Linha).link_token).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await prisma.$executeRawUnsafe(`delete from public.controle_desligamento where id_desligamento = 'TESTE-AUT-1'`);
      await prisma.$executeRawUnsafe(`delete from public.entrevistas_desligamento where id = 'ED-AUT'`);
    }
  });
});
