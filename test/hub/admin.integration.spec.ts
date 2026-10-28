import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { comUsuarioRls } from "@/lib/rls";
import { carregarConta, definirVerComo } from "@/lib/sessao";
import { revogarSessoesDoUsuario } from "@/lib/sessao-revogacao";
import { encerrarVerComo } from "@/server/hub/admin";
import { criarConta, executar, limpar, prisma } from "../helpers/hub";

// Sessões e "Visualizar como" ficam no Redis: aqui só conferimos as chamadas.
jest.mock("@/lib/sessao", () => ({ ...jest.requireActual("@/lib/sessao"), definirVerComo: jest.fn(async () => {}) }));
jest.mock("@/lib/sessao-revogacao", () => ({
  ...jest.requireActual("@/lib/sessao-revogacao"),
  revogarSessoesDoUsuario: jest.fn(async () => {}),
  jtiRevogado: jest.fn(async () => false),
}));

type Linha = Record<string, unknown>;
const dados = (r: { status: number }) => ("dados" in r ? r.dados : undefined);
const linhas = (r: { status: number }) => (dados(r) as Linha[] | undefined) ?? [];
const erro = (r: { status: number }) => ("erro" in r ? (r as { erro: string }).erro : "");

const TABELAS = [
  "colaboradores", "twygo_participantes", "upload_log", "upload_preparo", "viewas_log", "acesso_log", "cadastro_autorizado",
];

const UPLOAD = { "admin.upload": true };
const USUARIOS = { "admin.usuarios": true };

beforeEach(async () => {
  await limpar(...TABELAS);
});

afterAll(async () => {
  await limpar(...TABELAS);
  await prisma.$disconnect();
});

async function colaboradoresAntigos() {
  await prisma.$executeRawUnsafe(`
    insert into public.colaboradores (nome, nome_completo, unidade, departamento, situacao, matricula)
    values ('Antiga A', 'Antiga A', 'Loja Norte', 'Vendas', 'Ativo', '000'),
           ('Antiga B', 'Antiga B', 'Loja Sul', 'Caixa', 'Ativo', '000')`);
}
// O helper só cria conta ativa; o status muda depois, direto no banco.
async function contaComStatus(status: string, perfil: "gestor" | "rh" = "gestor") {
  const c = await criarConta({ perfil });
  await prisma.profiles.update({ where: { id: c.id }, data: { status } });
  return c;
}

const nomesColaboradores = async () =>
  (await prisma.$queryRawUnsafe<{ nome: string }[]>("select nome from public.colaboradores order by id")).map((r) => r.nome);

const pessoa = (n: number, extra: Linha = {}) => ({
  nome: `Pessoa ${n}`, nome_completo: `Pessoa ${n} Inventada`, unidade: n % 2 ? "Loja Norte" : "Loja Sul",
  departamento: "Vendas", situacao: "Ativo", data_admissao: "2026-01-10", ...extra,
});

// ---- Upload ------------------------------------------------------------------

describe("admin.uploadLote + admin.uploadConcluir", () => {
  it("troca a tabela inteira numa transação, na ordem do arquivo, e grava o upload_log", async () => {
    await colaboradoresAntigos();
    const rh = await criarConta({ perfil: "rh", permissoes: UPLOAD });
    const lote = randomUUID();
    expect(await executar("admin.uploadLote", { lote, tabela: "colaboradores", ordem: 0, linhas: [pessoa(1), pessoa(2)] }, rh))
      .toEqual({ status: 200, dados: null });
    expect((await executar("admin.uploadLote", { lote, tabela: "colaboradores", ordem: 1, linhas: [pessoa(3)] }, rh)).status).toBe(200);
    // Até a conclusão, a tabela real não muda.
    expect(await nomesColaboradores()).toEqual(["Antiga A", "Antiga B"]);

    const r = await executar("admin.uploadConcluir", { lote, tabela: "colaboradores", total: 3, arquivo: "Colaboradores.xlsx" }, rh);
    expect(r).toEqual({ status: 200, dados: { linhas: 3 } });
    expect(await nomesColaboradores()).toEqual(["Pessoa 1", "Pessoa 2", "Pessoa 3"]);
    const [primeiro] = await prisma.$queryRawUnsafe<{ id: bigint; data_admissao: Date }[]>(
      "select id, data_admissao from public.colaboradores order by id limit 1");
    expect(Number(primeiro!.id)).toBe(1); // restart identity, como o admin_truncate fazia
    const log = await prisma.upload_log.findMany();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ tabela: "colaboradores", arquivo: "Colaboradores.xlsx", linhas: 3, status: "ok", usuario_id: rh.id, usuario_nome: rh.nome });
    expect(await prisma.upload_preparo.count()).toBe(0);
  });

  it("falha no meio: lote faltando ou valor inválido mantém os dados antigos", async () => {
    await colaboradoresAntigos();
    const rh = await criarConta({ perfil: "rh", permissoes: UPLOAD });
    const lote = randomUUID();
    await executar("admin.uploadLote", { lote, tabela: "colaboradores", ordem: 0, linhas: [pessoa(1), pessoa(2)] }, rh);
    const faltando = await executar("admin.uploadConcluir", { lote, tabela: "colaboradores", total: 3 }, rh);
    expect(faltando.status).toBe(400);
    expect(erro(faltando)).toMatch(/chegaram 2 de 3/);

    // Lote 1 pulado (0 e 2): incompleto.
    await executar("admin.uploadLote", { lote, tabela: "colaboradores", ordem: 2, linhas: [pessoa(3)] }, rh);
    expect(erro(await executar("admin.uploadConcluir", { lote, tabela: "colaboradores", total: 3 }, rh))).toMatch(/faltou um lote/);

    // Data inválida só aparece na troca: o Postgres recusa e nada muda.
    const lote2 = randomUUID();
    await executar("admin.uploadLote", { lote: lote2, tabela: "colaboradores", ordem: 0, linhas: [pessoa(1), pessoa(2, { data_admissao: "31/02/2026" })] }, rh);
    const invalida = await executar("admin.uploadConcluir", { lote: lote2, tabela: "colaboradores", total: 2 }, rh);
    expect(invalida.status).toBe(400);
    expect(await nomesColaboradores()).toEqual(["Antiga A", "Antiga B"]);
    expect(await prisma.upload_log.count()).toBe(0);

    // O navegador descarta o preparo que sobrou.
    expect((await executar("admin.uploadDescartar", { lote: lote2 }, rh)).status).toBe(200);
    expect(await prisma.upload_preparo.count({ where: { lote: lote2 } })).toBe(0);
  });

  it("valida tabela, colunas e tamanho do lote", async () => {
    const rh = await criarConta({ perfil: "rh", permissoes: UPLOAD });
    const lote = randomUUID();
    expect((await executar("admin.uploadLote", { lote, tabela: "profiles", ordem: 0, linhas: [{ nome: "x" }] }, rh)).status).toBe(400);
    const coluna = await executar("admin.uploadLote", { lote, tabela: "colaboradores", ordem: 0, linhas: [{ nome: "x", id: 5 }] }, rh);
    expect(coluna.status).toBe(400);
    expect(erro(coluna)).toMatch(/Coluna desconhecida/);
    const grande = Array.from({ length: 1001 }, (_, i) => pessoa(i));
    expect((await executar("admin.uploadLote", { lote, tabela: "colaboradores", ordem: 0, linhas: grande }, rh)).status).toBe(400);
    expect((await executar("admin.uploadConcluir", { lote, tabela: "colaboradores", total: 200_001 }, rh)).status).toBe(400);
  });

  it("o lote de uma pessoa não serve para outra (RLS do preparo)", async () => {
    await colaboradoresAntigos();
    const a = await criarConta({ perfil: "rh", permissoes: UPLOAD });
    const b = await criarConta({ perfil: "rh", permissoes: UPLOAD });
    const lote = randomUUID();
    await executar("admin.uploadLote", { lote, tabela: "colaboradores", ordem: 0, linhas: [pessoa(1)] }, a);
    expect((await executar("admin.uploadConcluir", { lote, tabela: "colaboradores", total: 1 }, b)).status).toBe(400);
    expect(await nomesColaboradores()).toEqual(["Antiga A", "Antiga B"]);
  });

  it("sem admin.upload: 403; no Visualizar como: 403", async () => {
    const gestor = await criarConta({ perfil: "gestor", permissoes: { "indicadores.headcount": true } });
    const lote = randomUUID();
    expect((await executar("admin.uploadLote", { lote, tabela: "colaboradores", ordem: 0, linhas: [pessoa(1)] }, gestor)).status).toBe(403);
    expect((await executar("admin.uploadConcluir", { lote, tabela: "colaboradores", total: 1 }, gestor)).status).toBe(403);
    const admin = await criarConta({ perfil: "admin" });
    const outroAdmin = await criarConta({ perfil: "admin" });
    expect((await executar("admin.uploadLote", { lote, tabela: "colaboradores", ordem: 0, linhas: [pessoa(1)] }, admin, outroAdmin)).status).toBe(403);
  });

  it("Twygo com 60 mil linhas em lotes de 1000 cabe numa troca só", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const lote = randomUUID();
    const TOTAL = 60_000;
    for (let ordem = 0; ordem * 1000 < TOTAL; ordem++) {
      const ls = Array.from({ length: 1000 }, (_, i) => ({
        content_id: String(ordem), content_title: `Curso ${ordem}`, nome_completo: `Pessoa ${ordem * 1000 + i}`,
        email: `p${ordem * 1000 + i}@exemplo.test`, unidade: "Loja Norte", departamento: "Vendas",
        situacao: "Concluído", progresso: 100, nota: 9.5, data_inscricao: "2026-03-01",
      }));
      const r = await executar("admin.uploadLote", { lote, tabela: "twygo_participantes", ordem, linhas: ls }, admin);
      expect(r.status).toBe(200);
    }
    const inicio = Date.now();
    expect(await executar("admin.uploadConcluir", { lote, tabela: "twygo_participantes", total: TOTAL, arquivo: "Twygo.xlsx" }, admin))
      .toEqual({ status: 200, dados: { linhas: TOTAL } });
    expect(Date.now() - inicio).toBeLessThan(20_000);
    expect(await prisma.twygo_participantes.count()).toBe(TOTAL);
  }, 180_000);
});

describe("admin.registrarUpload / admin.listarUploads", () => {
  it("grava o envio com o autor da sessão e lista do mais recente", async () => {
    const rh = await criarConta({ perfil: "rh", permissoes: UPLOAD });
    expect((await executar("admin.registrarUpload", { tabela: "humor_mensal", arquivo: "36. Humor.xlsx", linhas: 10, status: "ok" }, rh)).status).toBe(200);
    expect((await executar("admin.registrarUpload", { tabela: "colaboradores", arquivo: "C.xlsx", status: "erro", erro: "x".repeat(5000) }, rh)).status).toBe(200);
    // Autor não vem do navegador.
    expect((await executar("admin.registrarUpload", { tabela: "colaboradores", status: "ok", usuario_id: randomUUID() }, rh)).status).toBe(400);
    const ls = linhas(await executar("admin.listarUploads", {}, rh));
    expect(ls.map((l) => l.tabela)).toEqual(["colaboradores", "humor_mensal"]);
    expect(ls[0]).toMatchObject({ status: "erro", usuario_id: rh.id, usuario_nome: rh.nome });
    expect((ls[0]!.erro as string).length).toBe(2000);
    expect(typeof ls[0]!.created_at).toBe("string");
  });

  it("sem admin.upload: 403", async () => {
    const gestor = await criarConta({ perfil: "gestor" });
    expect((await executar("admin.listarUploads", {}, gestor)).status).toBe(403);
    expect((await executar("admin.registrarUpload", { tabela: "colaboradores", status: "ok" }, gestor)).status).toBe(403);
  });
});

// ---- Cadastro de Acessos -------------------------------------------------------

const novoAcesso = (extra: Linha = {}) => ({
  email: `Nova.${randomUUID().slice(0, 6)}@Exemplo.test`, senha: "provisoria123", nome: "Pessoa Nova", perfil: "gestor",
  unidades: ["Loja Norte"], departamentos: [], permissoes: { "indicadores.headcount": true }, ...extra,
});

describe("admin.listarPerfis", () => {
  it("quem administra acessos vê todas as contas, por nome", async () => {
    const admin = await criarConta({ perfil: "admin" });
    await criarConta({ perfil: "gestor" });
    const ls = linhas(await executar("admin.listarPerfis", {}, admin));
    expect(ls).toHaveLength(2);
    expect(Object.keys(ls[0]!).sort()).toEqual([
      "colaborador_external_id", "created_at", "departamentos", "email", "id", "nome", "perfil", "permissoes",
      "satisfacao_areas", "status", "status_em", "status_por", "unidades",
    ]);
  });

  it("sem admin.usuarios: 403", async () => {
    const logs = await criarConta({ perfil: "rh", permissoes: { "admin.log_acessos": true } });
    expect((await executar("admin.listarPerfis", {}, logs)).status).toBe(403);
  });
});

describe("admin.criarAcesso", () => {
  it("cria login (bcrypt, troca obrigatória) e perfil numa transação, sem devolver a senha", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const pedido = novoAcesso({ colaborador_external_id: "123", satisfacao_areas: ["Financeiro"] });
    const r = await executar("admin.criarAcesso", pedido, admin);
    expect(r.status).toBe(200);
    const { id } = dados(r) as { id: string };
    expect(Object.keys(dados(r) as object)).toEqual(["id"]);
    const login = await prisma.usuarios.findUnique({ where: { id } });
    expect(login!.email).toBe(pedido.email.toLowerCase());
    expect(login!.trocar_senha).toBe(true);
    expect(login!.senha_hash).not.toBe(pedido.senha);
    expect(await bcrypt.compare(pedido.senha, login!.senha_hash!)).toBe(true);
    const perfil = await prisma.profiles.findUnique({ where: { id } });
    expect(perfil).toMatchObject({ nome: "Pessoa Nova", perfil: "gestor", unidades: ["Loja Norte"], status: "ativo",
      colaborador_external_id: "123", satisfacao_areas: ["Financeiro"] });
    // A autorização do e-mail foi usada e consumida pela trigger.
    expect(await prisma.cadastro_autorizado.count()).toBe(0);
  });

  it("e-mail que já tem login: 409; senha curta: 400; permissão fora do catálogo: 400", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const pedido = novoAcesso();
    expect((await executar("admin.criarAcesso", pedido, admin)).status).toBe(200);
    expect((await executar("admin.criarAcesso", { ...pedido, email: pedido.email.toUpperCase() }, admin)).status).toBe(409);
    expect((await executar("admin.criarAcesso", novoAcesso({ senha: "1234567" }), admin)).status).toBe(400);
    expect((await executar("admin.criarAcesso", novoAcesso({ permissoes: { "inventada.chave": true } }), admin)).status).toBe(400);
  });

  it("quem não é Administrador não dá perfil Administrador nem permissões admin.*", async () => {
    const rh = await criarConta({ perfil: "rh", permissoes: { ...USUARIOS, "indicadores.headcount": true } });
    expect((await executar("admin.criarAcesso", novoAcesso({ perfil: "admin" }), rh)).status).toBe(403);
    expect((await executar("admin.criarAcesso", novoAcesso({ permissoes: { "admin.upload": true } }), rh)).status).toBe(403);
    expect((await executar("admin.criarAcesso", novoAcesso({ permissoes: { "admin.upload": false, "indicadores.headcount": true } }), rh)).status).toBe(200);
    expect(await prisma.usuarios.count()).toBe(2);
  });

  it("sem admin.usuarios ou no Visualizar como: 403", async () => {
    const gestor = await criarConta({ perfil: "gestor" });
    expect((await executar("admin.criarAcesso", novoAcesso(), gestor)).status).toBe(403);
    const admin = await criarConta({ perfil: "admin" });
    const outroAdmin = await criarConta({ perfil: "admin" });
    expect((await executar("admin.criarAcesso", novoAcesso(), admin, outroAdmin)).status).toBe(403);
  });

  it("a trigger do banco continua barrando login sem autorização (ou vencida) e o perfil admin dado por não-admin", async () => {
    const rh = await criarConta({ perfil: "rh", permissoes: USUARIOS });
    const criarDireto = (email: string) => comUsuarioRls(rh.id, (tx) =>
      tx.$executeRaw`insert into public.usuarios (id, email, senha_hash) values (${randomUUID()}::uuid, ${email}, 'x')`);
    await expect(criarDireto("sem.autorizacao@exemplo.test")).rejects.toThrow(/Cadastro não autorizado/);
    await prisma.cadastro_autorizado.create({ data: { email: "vencida@exemplo.test", criado_em: new Date(Date.now() - 2 * 86_400_000) } });
    await expect(criarDireto("vencida@exemplo.test")).rejects.toThrow(/Cadastro não autorizado/);

    const admin = await criarConta({ perfil: "admin" });
    await expect(comUsuarioRls(rh.id, (tx) =>
      tx.$executeRaw`update public.profiles set nome = 'Outro' where id = ${admin.id}::uuid`)).rejects.toThrow(/Só um Administrador/);
  });
});

describe("admin.salvarPerfil", () => {
  const edicao = (id: string, extra: Linha = {}) => ({
    id, email: "ignorado@exemplo.test", nome: "Nome Editado", perfil: "rh", unidades: ["Loja Sul"], departamentos: ["Caixa"],
    permissoes: { "indicadores.headcount": true, "indicadores.feedbacks": true }, ...extra,
  });

  it("grava nome, perfil, recorte e permissões; e-mail não muda", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const alvo = await criarConta({ perfil: "gestor", satisfacaoAreas: ["Financeiro"] });
    expect((await executar("admin.salvarPerfil", edicao(alvo.id), admin)).status).toBe(200);
    const p = await prisma.profiles.findUnique({ where: { id: alvo.id } });
    expect(p).toMatchObject({ nome: "Nome Editado", perfil: "rh", unidades: ["Loja Sul"], departamentos: ["Caixa"],
      email: alvo.email, satisfacao_areas: ["Financeiro"] });
    expect(p!.permissoes).toEqual({ "indicadores.headcount": true, "indicadores.feedbacks": true });
    await executar("admin.salvarPerfil", edicao(alvo.id, { satisfacao_areas: [], colaborador_external_id: null }), admin);
    expect((await prisma.profiles.findUnique({ where: { id: alvo.id } }))!.satisfacao_areas).toEqual([]);
  });

  it("proteção do Administrador e cadastro desligado", async () => {
    const rh = await criarConta({ perfil: "rh", permissoes: USUARIOS });
    const admin = await criarConta({ perfil: "admin" });
    const comum = await criarConta({ perfil: "gestor", permissoes: { "admin.upload": true } });
    expect((await executar("admin.salvarPerfil", edicao(admin.id), rh)).status).toBe(403);
    // Retirar admin.upload também é só do Administrador.
    expect((await executar("admin.salvarPerfil", edicao(comum.id), rh)).status).toBe(403);
    expect((await executar("admin.salvarPerfil", edicao(comum.id, { permissoes: { "admin.upload": true } }), rh)).status).toBe(200);
    const desligado = await contaComStatus("desligado");
    const r = await executar("admin.salvarPerfil", edicao(desligado.id), admin);
    expect(r.status).toBe(400);
    expect(erro(r)).toMatch(/desligado não pode ser editado/);
    expect((await executar("admin.salvarPerfil", edicao(randomUUID()), admin)).status).toBe(404);
  });
});

describe("admin.alterarStatus", () => {
  it("inativar grava quem/quando e derruba as sessões; reativar limpa", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const alvo = await criarConta({ perfil: "gestor" });
    expect((await executar("admin.alterarStatus", { id: alvo.id, status: "inativo" }, admin)).status).toBe(200);
    let p = await prisma.profiles.findUnique({ where: { id: alvo.id } });
    expect(p).toMatchObject({ status: "inativo", status_por: admin.nome });
    expect(p!.status_em).toBeInstanceOf(Date);
    expect(revogarSessoesDoUsuario).toHaveBeenCalledWith(alvo.id);

    jest.mocked(revogarSessoesDoUsuario).mockClear();
    expect((await executar("admin.alterarStatus", { id: alvo.id, status: "ativo" }, admin)).status).toBe(200);
    p = await prisma.profiles.findUnique({ where: { id: alvo.id } });
    expect(p).toMatchObject({ status: "ativo", status_em: null, status_por: null });
    expect(revogarSessoesDoUsuario).not.toHaveBeenCalled();

    expect((await executar("admin.alterarStatus", { id: alvo.id, status: "desligado" }, admin)).status).toBe(200);
    expect(revogarSessoesDoUsuario).toHaveBeenCalledWith(alvo.id);
  });

  it("não altera o próprio acesso; não-admin não mexe em Administrador", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const rh = await criarConta({ perfil: "rh", permissoes: USUARIOS });
    expect((await executar("admin.alterarStatus", { id: admin.id, status: "inativo" }, admin)).status).toBe(403);
    expect((await executar("admin.alterarStatus", { id: admin.id, status: "inativo" }, rh)).status).toBe(403);
    expect((await prisma.profiles.findUnique({ where: { id: admin.id } }))!.status).toBe("ativo");
  });
});

describe("admin.redefinirSenha", () => {
  it("senha provisória com troca obrigatória e sessões derrubadas", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const alvo = await criarConta({ perfil: "gestor" });
    const r = await executar("admin.redefinirSenha", { id: alvo.id, senha: "novaProvisoria9" }, admin);
    expect(r).toEqual({ status: 200, dados: null });
    const login = await prisma.usuarios.findUnique({ where: { id: alvo.id } });
    expect(login!.trocar_senha).toBe(true);
    expect(await bcrypt.compare("novaProvisoria9", login!.senha_hash!)).toBe(true);
    expect(revogarSessoesDoUsuario).toHaveBeenCalledWith(alvo.id);
  });

  it("própria senha: 400; não-admin com alvo que tem Administração: 403; desligado: 400", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const rh = await criarConta({ perfil: "rh", permissoes: USUARIOS });
    const comUpload = await criarConta({ perfil: "gestor", permissoes: { "admin.upload": true } });
    const desligado = await contaComStatus("desligado");
    expect((await executar("admin.redefinirSenha", { id: admin.id, senha: "novaProvisoria9" }, admin)).status).toBe(400);
    expect((await executar("admin.redefinirSenha", { id: admin.id, senha: "novaProvisoria9" }, rh)).status).toBe(403);
    expect((await executar("admin.redefinirSenha", { id: comUpload.id, senha: "novaProvisoria9" }, rh)).status).toBe(403);
    expect((await executar("admin.redefinirSenha", { id: desligado.id, senha: "novaProvisoria9" }, admin)).status).toBe(400);
    expect(revogarSessoesDoUsuario).not.toHaveBeenCalled();
  });
});

// ---- Visualizar como -----------------------------------------------------------

describe("Visualizar como", () => {
  it("iniciar grava o viewas_log e guarda a conta vista na sessão", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const alvo = await criarConta({ perfil: "gestor", unidades: ["Loja Norte"] });
    const r = await executar("admin.verComoIniciar", { alvoId: alvo.id }, admin);
    expect(r.status).toBe(200);
    expect(definirVerComo).toHaveBeenCalledWith(admin.jti, alvo.id);
    const log = await prisma.viewas_log.findMany();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ usuario_id: admin.id, usuario_nome: admin.nome, alvo_profile_id: alvo.id, alvo_perfil: "gestor", encerrado_em: null });
    expect((dados(r) as { id: number }).id).toBe(Number(log[0]!.id));

    const lista = linhas(await executar("admin.listarVerComo", {}, admin));
    expect(lista.map((l) => l.alvo_nome)).toEqual([alvo.nome]);
  });

  it("não-admin não inicia; nem a própria conta, conta inativa ou (sem ser Administrador) uma conta com mais Administração", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const gestor = await criarConta({ perfil: "gestor" });
    const inativo = await contaComStatus("inativo");
    const rh = await criarConta({ perfil: "rh", permissoes: USUARIOS });
    expect((await executar("admin.verComoIniciar", { alvoId: admin.id }, gestor)).status).toBe(403);
    expect((await executar("admin.verComoIniciar", { alvoId: admin.id }, admin)).status).toBe(400);
    expect((await executar("admin.verComoIniciar", { alvoId: inativo.id }, admin)).status).toBe(400);
    expect((await executar("admin.verComoIniciar", { alvoId: admin.id }, rh)).status).toBe(403);
    expect((await executar("admin.verComoIniciar", { alvoId: gestor.id }, rh)).status).toBe(200);
    expect(definirVerComo).toHaveBeenCalledTimes(1);
  });

  it("leitura usa o recorte da conta vista; escrita e Administração dão 403", async () => {
    await colaboradoresAntigos();
    const admin = await criarConta({ perfil: "admin" });
    const gestor = await criarConta({ perfil: "gestor", permissoes: { "indicadores.headcount": true }, unidades: ["Loja Sul"] });
    const r = await executar("indicadores.lerPagina", { tabela: "colaboradores", aposId: 0 }, admin, gestor);
    expect(r.status).toBe(200);
    expect(linhas(r).map((l) => l.nome)).toEqual(["Antiga B"]);
    expect(linhas(await executar("indicadores.lerPagina", { tabela: "colaboradores", aposId: 0 }, admin)).map((l) => l.nome)).toEqual(["Antiga A", "Antiga B"]);

    expect((await executar("admin.listarPerfis", {}, admin, gestor)).status).toBe(403);
    expect((await executar("admin.alterarStatus", { id: gestor.id, status: "inativo" }, admin, gestor)).status).toBe(403);
    expect((await executar("admin.registrarModulo", { modulo: "dashboard" }, admin, gestor)).status).toBe(403);
    // Mesmo vendo como outro Administrador, nada grava.
    const outroAdmin = await criarConta({ perfil: "admin" });
    expect((await executar("admin.verComoIniciar", { alvoId: gestor.id }, admin, outroAdmin)).status).toBe(403);
    expect((await executar("admin.salvarPerfil", {
      id: gestor.id, nome: "X", perfil: "gestor", permissoes: {},
    }, admin, outroAdmin)).status).toBe(403);
  });

  it("encerrar fecha o registro com a identidade real e limpa a sessão", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const alvo = await criarConta({ perfil: "gestor" });
    await executar("admin.verComoIniciar", { alvoId: alvo.id }, admin);
    await encerrarVerComo({ ...admin, verComo: alvo });
    const [log] = await prisma.viewas_log.findMany();
    expect(log!.encerrado_em).toBeInstanceOf(Date);
    expect(definirVerComo).toHaveBeenLastCalledWith(admin.jti, null);
  });
});

// ---- Quem administra acessos sem ser Administrador --------------------------------

describe("Cadastro de Acessos por quem não é Administrador", () => {
  const editar = (id: string, extra: Linha = {}) => ({
    id, nome: "Nome Editado", perfil: "gestor", unidades: ["Loja Norte"], departamentos: [], permissoes: {}, ...extra,
  });

  it("(a) não altera o próprio perfil, status nem senha", async () => {
    const rh = await criarConta({ perfil: "rh", permissoes: { ...USUARIOS, "indicadores.headcount": true } });
    const r = await executar("admin.salvarPerfil", editar(rh.id, { perfil: "rh", unidades: [], permissoes: { ...USUARIOS, "indicadores.headcount": true } }), rh);
    expect(r.status).toBe(403);
    expect(erro(r)).toMatch(/próprio cadastro/);
    expect((await executar("admin.alterarStatus", { id: rh.id, status: "ativo" }, rh)).status).toBe(403);
    expect((await executar("admin.redefinirSenha", { id: rh.id, senha: "novaProvisoria9" }, rh)).status).toBe(403);
    // Administrador segue podendo editar o próprio cadastro.
    const admin = await criarConta({ perfil: "admin" });
    expect((await executar("admin.salvarPerfil", editar(admin.id, { perfil: "admin" }), admin)).status).toBe(200);
  });

  it("(b) só concede permissão que já tem ou que o alvo já tinha", async () => {
    const rh = await criarConta({ perfil: "rh", permissoes: { ...USUARIOS, "indicadores.headcount": true } });
    const semMinha = await executar("admin.criarAcesso", novoAcesso({ permissoes: { "indicadores.headcount": true, "indicadores.pesquisa_clima": true } }), rh);
    expect(semMinha.status).toBe(403);
    expect(erro(semMinha)).toMatch(/indicadores.pesquisa_clima/);
    expect((await executar("admin.criarAcesso", novoAcesso({ permissoes: { "indicadores.headcount": true, "indicadores.pesquisa_clima": false } }), rh)).status).toBe(200);

    const alvo = await criarConta({ perfil: "gestor", permissoes: { "indicadores.pesquisa_clima": true } });
    // Manter o que o alvo já tinha pode; acrescentar o que o ator não tem, não.
    expect((await executar("admin.salvarPerfil", editar(alvo.id, { permissoes: { "indicadores.pesquisa_clima": true, "indicadores.headcount": true } }), rh)).status).toBe(200);
    expect((await executar("admin.salvarPerfil", editar(alvo.id, { permissoes: { "indicadores.pesquisa_clima": true, "indicadores.satisfacao": true } }), rh)).status).toBe(403);
    expect((await prisma.profiles.findUnique({ where: { id: alvo.id } }))!.permissoes).toEqual({
      "indicadores.pesquisa_clima": true, "indicadores.headcount": true,
    });
  });

  it("(c) recorte do alvo não pode ser mais amplo que o do ator", async () => {
    const rh = await criarConta({
      perfil: "rh", permissoes: USUARIOS, unidades: ["Loja Norte", "Loja Sul"], departamentos: [], satisfacaoAreas: ["Financeiro"],
    });
    // Unidades: vazia (= todas) ou fora da lista do ator, não.
    expect((await executar("admin.criarAcesso", novoAcesso({ permissoes: {}, unidades: [], satisfacao_areas: ["Financeiro"] }), rh)).status).toBe(403);
    expect((await executar("admin.criarAcesso", novoAcesso({ permissoes: {}, unidades: ["Loja Centro"], satisfacao_areas: ["Financeiro"] }), rh)).status).toBe(403);
    // Áreas da Satisfação: o ator tem lista, então a do alvo não pode ser vazia nem maior.
    const semAreas = await executar("admin.criarAcesso", novoAcesso({ permissoes: {}, unidades: ["Loja Sul"] }), rh);
    expect(semAreas.status).toBe(403);
    expect(erro(semAreas)).toMatch(/áreas da Satisfação/);
    expect((await executar("admin.criarAcesso", novoAcesso({ permissoes: {}, unidades: ["Loja Sul"], satisfacao_areas: ["RH"] }), rh)).status).toBe(403);
    // Departamentos: ator sem restrição, alvo com qualquer lista.
    expect((await executar("admin.criarAcesso", novoAcesso({
      permissoes: {}, unidades: ["Loja Sul"], departamentos: ["Vendas"], satisfacao_areas: ["Financeiro"],
    }), rh)).status).toBe(200);

    // Editar sem mandar satisfacao_areas: vale a que o alvo já tem.
    const alvo = await criarConta({ perfil: "gestor", unidades: ["Loja Norte"], satisfacaoAreas: ["Financeiro"] });
    expect((await executar("admin.salvarPerfil", editar(alvo.id), rh)).status).toBe(200);
    expect((await executar("admin.salvarPerfil", editar(alvo.id, { unidades: [] }), rh)).status).toBe(403);
    const amplo = await criarConta({ perfil: "gestor", unidades: ["Loja Norte"] });
    expect((await executar("admin.salvarPerfil", editar(amplo.id), rh)).status).toBe(403);
  });

  it("(d) redefinir senha e Visualizar como só sobre conta com acesso contido no do ator", async () => {
    const rh = await criarConta({ perfil: "rh", permissoes: { ...USUARIOS, "indicadores.headcount": true }, unidades: ["Loja Norte"] });
    const contido = await criarConta({ perfil: "gestor", permissoes: { "indicadores.headcount": true }, unidades: ["Loja Norte"] });
    const maisPermissao = await criarConta({ perfil: "gestor", permissoes: { "indicadores.pesquisa_clima": true }, unidades: ["Loja Norte"] });
    const maisRecorte = await criarConta({ perfil: "gestor", permissoes: { "indicadores.headcount": true }, unidades: [] });
    for (const alvo of [maisPermissao, maisRecorte]) {
      expect((await executar("admin.redefinirSenha", { id: alvo.id, senha: "novaProvisoria9" }, rh)).status).toBe(403);
      expect((await executar("admin.verComoIniciar", { alvoId: alvo.id }, rh)).status).toBe(403);
    }
    expect(revogarSessoesDoUsuario).not.toHaveBeenCalled();
    expect(definirVerComo).not.toHaveBeenCalled();
    expect((await executar("admin.redefinirSenha", { id: contido.id, senha: "novaProvisoria9" }, rh)).status).toBe(200);
    expect((await executar("admin.verComoIniciar", { alvoId: contido.id }, rh)).status).toBe(200);
    // Administrador segue livre.
    const admin = await criarConta({ perfil: "admin" });
    expect((await executar("admin.redefinirSenha", { id: maisPermissao.id, senha: "novaProvisoria9" }, admin)).status).toBe(200);
  });
});

// ---- Revogação de sessão no banco ---------------------------------------------------

describe("sessoes_validas_desde (revogação sem Redis)", () => {
  it("redefinir senha recusa a sessão emitida antes; a emitida depois vale", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const alvo = await criarConta({ perfil: "gestor" });
    const antes = Date.now() - 5_000;
    expect(await carregarConta(alvo.id, "j", antes)).not.toBeNull();
    expect((await executar("admin.redefinirSenha", { id: alvo.id, senha: "novaProvisoria9" }, admin)).status).toBe(200);
    const login = await prisma.usuarios.findUnique({ where: { id: alvo.id } });
    expect(login!.sessoes_validas_desde).toBeInstanceOf(Date);
    expect(await carregarConta(alvo.id, "j", antes)).toBeNull();
    expect(await carregarConta(alvo.id, "j", Date.now() + 1_000)).not.toBeNull();
    // Sem iat (leitura de conta para o "Visualizar como") não há sessão a conferir.
    expect(await carregarConta(alvo.id)).not.toBeNull();
  });

  it("inativar e desligar gravam sessoes_validas_desde; reativar não mexe", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const alvo = await criarConta({ perfil: "gestor" });
    expect((await executar("admin.alterarStatus", { id: alvo.id, status: "inativo" }, admin)).status).toBe(200);
    const d1 = (await prisma.usuarios.findUnique({ where: { id: alvo.id } }))!.sessoes_validas_desde;
    expect(d1).toBeInstanceOf(Date);
    expect((await executar("admin.alterarStatus", { id: alvo.id, status: "ativo" }, admin)).status).toBe(200);
    expect((await prisma.usuarios.findUnique({ where: { id: alvo.id } }))!.sessoes_validas_desde).toEqual(d1);
    // Reativada, a sessão de antes da inativação continua recusada.
    expect(await carregarConta(alvo.id, "j", d1!.getTime() - 1)).toBeNull();
    expect(await carregarConta(alvo.id, "j", d1!.getTime() + 1)).not.toBeNull();
    expect((await executar("admin.alterarStatus", { id: alvo.id, status: "desligado" }, admin)).status).toBe(200);
    const d2 = (await prisma.usuarios.findUnique({ where: { id: alvo.id } }))!.sessoes_validas_desde;
    expect(d2!.getTime()).toBeGreaterThanOrEqual(d1!.getTime());
  });
});

// ---- Log de Acessos --------------------------------------------------------------

describe("admin.registrarModulo / admin.lerAcessos", () => {
  it("qualquer conta registra o módulo aberto, em nome da sessão", async () => {
    const gestor = await criarConta({ perfil: "gestor" });
    expect((await executar("admin.registrarModulo", { modulo: "ind-headcount", dispositivo: "celular" }, gestor)).status).toBe(200);
    expect((await executar("admin.registrarModulo", { modulo: "<script>" }, gestor)).status).toBe(400);
    expect((await executar("admin.registrarModulo", { modulo: "dashboard", evento: "login" }, gestor)).status).toBe(400);
    const ls = await prisma.acesso_log.findMany();
    expect(ls).toHaveLength(1);
    expect(ls[0]).toMatchObject({ usuario_id: gestor.id, usuario_nome: gestor.nome, evento: "modulo", modulo: "ind-headcount", dispositivo: "celular" });
  });

  it("lê o período, do mais recente ao mais antigo, em páginas; sem admin.log_acessos: 403", async () => {
    const leitor = await criarConta({ perfil: "rh", permissoes: { "admin.log_acessos": true } });
    await prisma.$executeRawUnsafe(`
      insert into public.acesso_log (usuario_id, usuario_nome, evento, modulo, criado_em) values
        ('${leitor.id}', 'L', 'login', null, '2026-10-01T12:00:00Z'),
        ('${leitor.id}', 'L', 'modulo', 'dashboard', '2026-10-02T12:00:00Z'),
        ('${leitor.id}', 'L', 'modulo', 'ind-headcount', '2026-10-03T12:00:00Z'),
        ('${leitor.id}', 'L', 'logout', null, '2026-11-01T12:00:00Z')`);
    const periodo = { inicio: "2026-10-01T00:00:00.000Z", fim: "2026-10-31T00:00:00.000Z" };
    const ls = linhas(await executar("admin.lerAcessos", periodo, leitor));
    expect(ls.map((l) => l.modulo ?? l.evento)).toEqual(["ind-headcount", "dashboard", "login"]);
    expect(ls[0]!.criado_em).toMatch(/^2026-10-03T12:00:00/);
    expect(linhas(await executar("admin.lerAcessos", { ...periodo, de: 1, limite: 1 }, leitor)).map((l) => l.modulo)).toEqual(["dashboard"]);
    const gestor = await criarConta({ perfil: "gestor" });
    expect((await executar("admin.lerAcessos", periodo, gestor)).status).toBe(403);
  });
});
