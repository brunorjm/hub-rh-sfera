import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { comUsuarioRls } from "@/lib/rls";
import { gerarHashSenha } from "@/lib/login";
import { carregarConta, definirVerComo, type UsuarioHub } from "@/lib/sessao";
import { revogarSessoesDoUsuario } from "@/lib/sessao-revogacao";
import { TODAS_AS_CHAVES } from "@/lib/rbac/catalogo";
import { ErroOperacao, linhasJson, operacao, type ContextoOperacao, type Operacao } from "@/server/hub/operacao";

// Operações de: Administração — Upload de Planilhas (admin/upload.js e
// dal-indicadores.js), Cadastro de Acessos (admin/usuarios.js), Log de Acessos
// (admin/log-acessos.js) e "Visualizar como" (view-as.js).
// Nome de cada operação: "admin.<função>".
//
// Tudo roda dentro das RLS originais: upload_log e as tabelas da planilha pedem
// admin.upload; profiles, viewas_log e cadastro_autorizado pedem admin.usuarios;
// acesso_log pede admin.log_acessos. As triggers profiles_protege_admin e
// profiles_bloqueia_edicao_desligado continuam valendo no banco; as regras
// delas são repetidas aqui para devolver 403/400 com mensagem clara.
// Quem fez (autor do log, status_por) vem sempre da sessão, nunca do navegador.

const quem = (u: ContextoOperacao["usuario"]) => u.nome || u.email || null;
const aspas = (nome: string) => `"${nome}"`; // só nomes das listas fixas abaixo

// ---- Upload de Planilhas -----------------------------------------------------

// Tabelas que a tela de upload substitui por inteiro (replaceTable) e as
// colunas que os parsers mandam (todas menos o id). Mesma lista de admin_truncate.
const AVE = [
  "ciclo", "pessoa_key", "cpf", "matricula", "nome", "cargo", "papel", "unidade", "departamento", "gestor",
  "gestor_direto", "gestor_avaliador", "data_admissao", "data_avaliacao", "data_autoavaliacao", "status_gestor",
  "status_auto", "martelo", "martelo_comentario", "notas_gestor", "notas_auto", "comentarios_gestor",
  "comentarios_auto", "updated_at",
] as const;
const COLUNAS_UPLOAD: Record<string, readonly string[]> = {
  colaboradores: [
    "external_id", "nome", "nome_completo", "matricula", "email", "cpf", "cargo", "cargo_visivel", "unidade",
    "departamento", "grupos", "papel", "gestor_direto", "gestor_email", "etnia", "sexo", "genero", "data_nascimento",
    "data_admissao", "data_cadastro", "situacao", "ultimo_acesso", "origem_cadastro", "participa_gamificacao",
    "desligamento_tipo", "desligamento_motivo", "ultimo_dia_trabalhado", "idioma", "updated_at",
  ],
  feedbacks: [
    "de", "para", "unidade", "departamento", "cargo", "anonimo", "template", "feedback", "avaliacao", "data",
    "data_visualizacao", "respostas",
  ],
  one_on_one: [
    "lider", "lider_email", "lider_departamento", "lider_papel", "liderado", "liderado_email", "liderado_matricula",
    "unidade", "departamento", "liderado_papel", "relacao", "categoria", "data_agendada", "data_realizada", "status",
    "topicos_lider", "topicos_liderado", "anotacoes_lider", "anotacoes_liderado", "acoes_ativas_lider",
    "acoes_concluidas_lider", "acoes_ativas_liderado", "acoes_concluidas_liderado",
  ],
  celebracoes: [
    "codigo", "colaborador_enviou", "unidade", "departamento", "papel", "cargo_enviou", "colaboradores_receberam",
    "cargo_recebeu", "mensagem", "curtidas", "comentarios", "data",
  ],
  twygo_participantes: [
    "content_id", "content_title", "content_type", "nome_completo", "email", "unidade", "departamento", "cargo",
    "data_inscricao", "ultimo_acesso", "situacao_inscricao", "situacao", "situacao_ambiente", "progresso", "nota",
    "frequencia", "pontuacao", "carga_horaria", "emitido_em", "concluido_em", "aprovado_em",
  ],
  avaliacao_experiencia_45: AVE,
  avaliacao_experiencia_90: AVE,
};
const TABELAS_UPLOAD = [
  "colaboradores", "feedbacks", "one_on_one", "celebracoes", "twygo_participantes",
  "avaliacao_experiencia_45", "avaliacao_experiencia_90",
] as const;
// Todas as planilhas da tela (inclusive as gravadas por outros módulos), para o upload_log.
const TABELAS_LOG = [
  ...TABELAS_UPLOAD, "unibe_pdv", "academia_hering", "engajamento_pulso", "humor_mensal", "satisfacao_suporte",
  "controle_vagas",
] as const;

// Limites: um lote por chamada (o navegador manda 500 linhas), no máximo
// 400 lotes e 200 mil linhas por planilha (Twygo tem ~60 mil).
const LINHAS_POR_LOTE = 1000;
const MAX_LOTES = 400;
const MAX_LINHAS = 200_000;

const lote = z.string().uuid();

// Um lote vai para a área de preparo (upload_preparo); a tabela real não muda.
const uploadLote = operacao({
  permissao: "admin.upload",
  escrita: true,
  entrada: z.object({
    lote,
    tabela: z.enum(TABELAS_UPLOAD),
    ordem: z.number().int().min(0).max(MAX_LOTES - 1),
    linhas: z.array(z.record(z.string().max(63), z.unknown())).min(1).max(LINHAS_POR_LOTE)
      .refine((l) => JSON.stringify(l).length <= 4_000_000, "Lote grande demais."),
  }).strict(),
  async executar({ lote: id, tabela, ordem, linhas }, { tx }) {
    const permitidas = COLUNAS_UPLOAD[tabela]!;
    const colunas = new Set<string>();
    for (const l of linhas) {
      for (const k of Object.keys(l)) {
        if (!permitidas.includes(k)) throw new ErroOperacao(400, `Coluna desconhecida em ${tabela}: ${k}.`);
        colunas.add(k);
      }
    }
    // Começo de um upload: lotes esquecidos da própria pessoa (upload que caiu) saem.
    if (ordem === 0) {
      await tx.$executeRaw`delete from public.upload_preparo
        where usuario_id = auth.uid() and criado_em < now() - interval '1 day'`;
    }
    await tx.$executeRawUnsafe(
      `insert into public.upload_preparo (lote, tabela, ordem, colunas, linhas, qtd)
       values ($1::uuid, $2, $3, $4::text[], $5::jsonb, $6)`,
      id, tabela, ordem, [...colunas], JSON.stringify(linhas), linhas.length,
    );
    return null;
  },
});

// Troca a tabela pelo que está no preparo, numa transação só: se algo falhar,
// nada muda e os dados antigos ficam. Grava o upload_log (status ok).
const uploadConcluir = operacao({
  permissao: "admin.upload",
  escrita: true,
  entrada: z.object({
    lote,
    tabela: z.enum(TABELAS_UPLOAD),
    total: z.number().int().min(0).max(MAX_LINHAS),
    arquivo: z.string().max(300).nullable().optional(),
  }).strict(),
  async executar({ lote: id, tabela, total, arquivo }, { tx, usuario }) {
    const grupos = await tx.$queryRawUnsafe<{ tabela: string; lotes: number; linhas: number; ultima: number; colunas: string[] }[]>(
      `select tabela, count(*)::int as lotes, sum(qtd)::int as linhas, max(ordem)::int as ultima,
              array(select distinct c from public.upload_preparo p2, unnest(p2.colunas) c
                    where p2.lote = $1::uuid and p2.tabela = p.tabela) as colunas
       from public.upload_preparo p where lote = $1::uuid group by tabela`,
      id,
    );
    const g = grupos[0];
    if (grupos.length > 1 || (g && g.tabela !== tabela)) throw new ErroOperacao(400, "Lote de outra planilha.");
    const recebidas = g?.linhas ?? 0;
    if (g && g.lotes !== g.ultima + 1) throw new ErroOperacao(400, "Upload incompleto: faltou um lote. Envie o arquivo de novo.");
    if (recebidas !== total) {
      throw new ErroOperacao(400, `Upload incompleto: chegaram ${recebidas} de ${total} linhas. Envie o arquivo de novo.`);
    }

    const t = `public.${aspas(tabela)}`;
    // admin_truncate confere admin.upload e a lista de tabelas por dentro.
    await tx.$executeRaw`select public.admin_truncate(${tabela})`;
    if (g && total > 0) {
      const cols = COLUNAS_UPLOAD[tabela]!.filter((c) => g.colunas.includes(c));
      await tx.$executeRawUnsafe(
        `insert into ${t} (${cols.map(aspas).join(", ")})
         select ${cols.map((c) => `r.${aspas(c)}`).join(", ")}
         from public.upload_preparo p
         cross join lateral jsonb_populate_recordset(null::${t}, p.linhas) with ordinality as r
         where p.lote = $1::uuid
         order by p.ordem, r.ordinality`,
        id,
      );
    }
    await tx.$executeRaw`delete from public.upload_preparo where lote = ${id}::uuid`;
    await tx.$executeRaw`insert into public.upload_log (tabela, arquivo, usuario_id, usuario_nome, linhas, status)
      values (${tabela}, ${arquivo ?? null}, ${usuario.id}::uuid, ${quem(usuario)}, ${total}, 'ok')`;
    return { linhas: total };
  },
});

// Upload que falhou: o navegador descarta o próprio preparo (melhor esforço).
const uploadDescartar = operacao({
  permissao: "admin.upload",
  escrita: true,
  entrada: z.object({ lote }).strict(),
  async executar({ lote: id }, { tx }) {
    await tx.$executeRaw`delete from public.upload_preparo where lote = ${id}::uuid`;
    return null;
  },
});

// logUpload: o registro de cada envio (os cards que gravam por outros módulos
// e as falhas). Quem enviou vem da sessão.
const registrarUpload = operacao({
  permissao: "admin.upload",
  escrita: true,
  entrada: z.object({
    tabela: z.enum(TABELAS_LOG),
    arquivo: z.string().max(300).nullable().optional(),
    linhas: z.number().int().min(0).max(10_000_000).nullable().optional(),
    status: z.enum(["ok", "erro"]),
    erro: z.string().max(100_000).nullable().optional(),
  }).strict(),
  async executar(d, { tx, usuario }) {
    await tx.$executeRaw`insert into public.upload_log (tabela, arquivo, usuario_id, usuario_nome, linhas, status, erro)
      values (${d.tabela}, ${d.arquivo ?? null}, ${usuario.id}::uuid, ${quem(usuario)}, ${d.linhas ?? null},
              ${d.status}, ${d.erro ? d.erro.slice(0, 2000) : null})`;
    return null;
  },
});

const listarUploads = operacao({
  permissao: "admin.upload",
  escrita: false,
  entrada: z.object({ limite: z.number().int().min(1).max(1000).default(300) }).strict(),
  async executar({ limite }, { tx }) {
    return linhasJson(
      tx,
      `select id, tabela, arquivo, usuario_id, usuario_nome, linhas, status, erro, created_at
       from public.upload_log order by created_at desc limit $1`,
      limite,
    );
  },
});

// ---- Cadastro de Acessos -----------------------------------------------------

const COLUNAS_PERFIL =
  "id, email, nome, perfil, unidades, departamentos, permissoes, created_at, status, status_em, status_por, " +
  "colaborador_external_id, satisfacao_areas";

type PerfilBanco = {
  id: string; perfil: string; status: string; permissoes: Record<string, unknown> | null;
  unidades: string[] | null; departamentos: string[] | null; satisfacao_areas: string[] | null;
};

const chavesAdmin = (p: Record<string, unknown> | null | undefined) =>
  Object.keys(p ?? {}).filter((k) => k.startsWith("admin.") && p![k] === true).sort();
const ehAdmin = (u: { perfil: string }) => u.perfil === "admin";

// Segurança Fase 1, item 3 (trigger profiles_protege_admin): só Administrador
// dá perfil Administrador, mexe no cadastro de outro Administrador ou concede/
// retira permissões admin.*. "antes" null = cadastro novo; "depois" null = só status.
function exigirProtecaoAdmin(
  ator: UsuarioHub,
  antes: Pick<PerfilBanco, "perfil" | "permissoes"> | null,
  depois: { perfil: string; permissoes: Record<string, unknown> } | null,
) {
  if (ehAdmin(ator)) return;
  if (antes?.perfil === "admin") throw new ErroOperacao(403, "Só um Administrador pode alterar o cadastro de outro Administrador.");
  if (depois?.perfil === "admin") throw new ErroOperacao(403, "Só um Administrador pode dar o perfil Administrador.");
  if (depois && chavesAdmin(depois.permissoes).join() !== chavesAdmin(antes?.permissoes).join()) {
    throw new ErroOperacao(
      403,
      "Só um Administrador pode conceder ou retirar permissões da Administração (Upload, Cadastros, Cadastro de Acessos, Log de Acessos).",
    );
  }
}

async function perfilDe(ctx: ContextoOperacao, id: string): Promise<PerfilBanco & { nome: string; email: string }> {
  const [p] = await linhasJson(
    ctx.tx,
    `select id, nome, email, perfil, status, permissoes, unidades, departamentos, satisfacao_areas
     from public.profiles where id = $1::uuid`,
    id,
  );
  if (!p) throw new ErroOperacao(404, "Conta não encontrada.");
  return p as PerfilBanco & { nome: string; email: string };
}

// ---- Quem administra acessos sem ser Administrador ------------------------------
// Uma conta com admin.usuarios que não é Administrador só distribui o que ela
// mesma tem: não concede permissão que não tem, não dá recorte (unidades,
// departamentos, áreas da Satisfação) mais amplo que o dela, não mexe no
// próprio cadastro/senha/status e não redefine senha nem "veste" conta que
// tem mais acesso que ela. Administrador segue livre.

const concedidas = (p: Record<string, unknown> | null | undefined) =>
  Object.keys(p ?? {}).filter((k) => p![k] === true);

type Recorte = { unidades?: string[] | null; departamentos?: string[] | null; satisfacao_areas?: string[] | null };
const RECORTES = [
  ["unidades", "unidades"],
  ["departamentos", "departamentos"],
  ["satisfacao_areas", "áreas da Satisfação"],
] as const;

// Lista vazia = sem restrição. Ator com lista: a do alvo tem de ser não vazia e caber nela.
function recorteMaisAmplo(ator: string[], alvo: string[]): boolean {
  if (!ator.length) return false;
  if (!alvo.length) return true;
  const meu = new Set(ator);
  return alvo.some((x) => !meu.has(x));
}

function exigirRecorteContido(ator: UsuarioHub, alvo: Recorte, acao: string) {
  const doAtor: Recorte = { unidades: ator.unidades, departamentos: ator.departamentos, satisfacao_areas: ator.satisfacaoAreas };
  for (const [campo, nome] of RECORTES) {
    if (recorteMaisAmplo(doAtor[campo] ?? [], alvo[campo] ?? [])) {
      throw new ErroOperacao(403, `Você não pode ${acao} com ${nome} além das suas.`);
    }
  }
}

// Criar/salvar perfil: toda permissão =true precisa já ser do ator ou já estar =true no alvo.
function exigirConcessaoPermitida(
  ator: UsuarioHub,
  antes: Pick<PerfilBanco, "permissoes"> | null,
  depois: { permissoes: Record<string, unknown> } & Recorte,
) {
  if (ehAdmin(ator)) return;
  const jaTinha = new Set(concedidas(antes?.permissoes));
  const minhas = new Set(concedidas(ator.permissoes));
  const fora = concedidas(depois.permissoes).filter((k) => !minhas.has(k) && !jaTinha.has(k));
  if (fora.length) {
    throw new ErroOperacao(403, `Você não pode conceder permissões que não tem: ${fora.slice(0, 5).join(", ")}.`);
  }
  exigirRecorteContido(ator, depois, "dar acesso");
}

// Redefinir senha / "Visualizar como": o alvo não pode ter mais acesso que o ator.
function exigirAlvoContido(ator: UsuarioHub, alvo: PerfilBanco, acao: string) {
  if (ehAdmin(ator)) return;
  const minhas = new Set(concedidas(ator.permissoes));
  if (ehAdmin(alvo) || concedidas(alvo.permissoes).some((k) => !minhas.has(k))) {
    throw new ErroOperacao(403, `Só um Administrador pode ${acao} uma conta com permissões que você não tem.`);
  }
  exigirRecorteContido(ator, alvo, `${acao} uma conta`);
}

const CHAVES = new Set(TODAS_AS_CHAVES);
const textos = z.array(z.string().max(200)).max(500);
const senha = z.string().min(8, "A senha provisória precisa de pelo menos 8 caracteres.").max(200, "Senha longa demais.");
const camposPerfil = {
  nome: z.string().trim().min(1, "Informe o nome.").max(200),
  perfil: z.enum(["admin", "rh", "gestor"]),
  unidades: textos.default([]),
  departamentos: textos.default([]),
  permissoes: z.record(z.string().max(100), z.boolean())
    .refine((p) => Object.keys(p).every((k) => CHAVES.has(k)), "Permissão desconhecida."),
  // Só vêm quando há algo a gravar ou a limpar (como a tela antiga mandava).
  colaborador_external_id: z.string().trim().max(100).nullable().optional(),
  satisfacao_areas: textos.optional(),
};

const listarPerfis = operacao({
  permissao: "admin.usuarios",
  escrita: false,
  entrada: z.object({}).strict(),
  async executar(_d, { tx }) {
    return linhasJson(tx, `select ${COLUNAS_PERFIL} from public.profiles order by nome`);
  },
});

// Edição (upsertProfile com id existente). O e-mail é o login e não muda aqui
// (o campo fica travado na tela); a tela ainda manda, e ele é ignorado.
const salvarPerfil = operacao({
  permissao: "admin.usuarios",
  escrita: true,
  entrada: z.object({ id: z.string().uuid(), email: z.string().max(254).optional(), ...camposPerfil }).strict(),
  async executar(d, ctx) {
    if (d.id === ctx.usuario.id && !ehAdmin(ctx.usuario)) {
      throw new ErroOperacao(403, "Você não pode alterar o próprio cadastro. Peça a um Administrador.");
    }
    const antes = await perfilDe(ctx, d.id);
    exigirProtecaoAdmin(ctx.usuario, antes, d);
    // Áreas da Satisfação que não vêm no pedido ficam como estão.
    exigirConcessaoPermitida(ctx.usuario, antes, { ...d, satisfacao_areas: d.satisfacao_areas ?? antes.satisfacao_areas });
    const temColab = d.colaborador_external_id !== undefined;
    const temAreas = d.satisfacao_areas !== undefined;
    // Desligado não é editado: a trigger profiles_bloqueia_edicao_desligado recusa (400).
    await ctx.tx.$executeRaw`update public.profiles set
        nome = ${d.nome}, perfil = ${d.perfil}, unidades = ${d.unidades}::text[], departamentos = ${d.departamentos}::text[],
        permissoes = ${JSON.stringify(d.permissoes)}::jsonb,
        colaborador_external_id = case when ${temColab} then ${d.colaborador_external_id || null} else colaborador_external_id end,
        satisfacao_areas = case when ${temAreas} then ${d.satisfacao_areas ?? []}::text[] else satisfacao_areas end
      where id = ${d.id}::uuid`;
    return null;
  },
});

// Criar acesso: antes, cadastro_autorizado + auth.signUp num cliente isolado +
// upsert do perfil. Agora tudo no servidor, numa transação: autoriza o e-mail
// (a trigger usuarios_cadastro_so_autorizado consome a autorização), cria o
// login com a senha provisória (troca obrigatória no primeiro acesso) e o perfil.
// Nunca devolve a senha nem o hash.
const criarAcesso = operacao({
  permissao: "admin.usuarios",
  escrita: true,
  entrada: z.object({
    email: z.string().trim().toLowerCase().email("E-mail inválido.").max(254),
    senha,
    ...camposPerfil,
  }).strict(),
  async executar(d, ctx) {
    exigirProtecaoAdmin(ctx.usuario, null, d);
    exigirConcessaoPermitida(ctx.usuario, null, d);
    const { tx } = ctx;
    const [ja] = await linhasJson(
      tx,
      `select 1 as x from public.usuarios where lower(email) = $1
       union all select 1 from public.profiles where lower(email) = $1 limit 1`,
      d.email,
    );
    if (ja) throw new ErroOperacao(409, "Já existe um login com este e-mail.");

    await tx.$executeRaw`insert into public.cadastro_autorizado (email) values (${d.email})
      on conflict (email) do update set criado_em = now(), autorizado_por = excluded.autorizado_por`;
    const id = randomUUID();
    const hash = await gerarHashSenha(d.senha);
    await tx.$executeRaw`insert into public.usuarios (id, email, senha_hash, trocar_senha)
      values (${id}::uuid, ${d.email}, ${hash}, true)`;
    await tx.$executeRaw`insert into public.profiles
        (id, email, nome, perfil, unidades, departamentos, permissoes, colaborador_external_id, satisfacao_areas)
      values (${id}::uuid, ${d.email}, ${d.nome}, ${d.perfil}, ${d.unidades}::text[], ${d.departamentos}::text[],
              ${JSON.stringify(d.permissoes)}::jsonb, ${d.colaborador_external_id || null}, ${d.satisfacao_areas ?? []}::text[])`;
    return { id };
  },
});

// Ativo / inativo / desligado (supabase-usuarios-inativar.sql): nada é apagado,
// só o status e quem/quando mudou. Inativar ou desligar derruba as sessões na hora.
const alterarStatus = operacao({
  permissao: "admin.usuarios",
  escrita: true,
  entrada: z.object({ id: z.string().uuid(), status: z.enum(["ativo", "inativo", "desligado"]) }).strict(),
  async executar({ id, status }, ctx) {
    if (id === ctx.usuario.id) throw new ErroOperacao(403, "Você não pode alterar o próprio acesso.");
    exigirProtecaoAdmin(ctx.usuario, await perfilDe(ctx, id), null);
    const ativo = status === "ativo";
    await ctx.tx.$executeRaw`update public.profiles set status = ${status},
        status_em = ${ativo ? null : new Date()}, status_por = ${ativo ? null : quem(ctx.usuario)}
      where id = ${id}::uuid`;
    if (!ativo) {
      // Sessões abertas caem pelo banco (usuarioAtual) e, se houver Redis, também por lá.
      await ctx.tx.$executeRaw`update public.usuarios set sessoes_validas_desde = now() where id = ${id}::uuid`;
      await revogarSessoesDoUsuario(id);
    }
    return null;
  },
});

// Redefinir a senha de alguém (antes: painel do Supabase). Senha provisória,
// troca obrigatória no próximo acesso, sessões abertas derrubadas. Quem não é
// Administrador não redefine a senha de quem tem acesso à Administração (seria
// entrar com um acesso que ela não pode conceder).
const redefinirSenha = operacao({
  permissao: "admin.usuarios",
  escrita: true,
  entrada: z.object({ id: z.string().uuid(), senha }).strict(),
  async executar(d, ctx) {
    if (d.id === ctx.usuario.id) {
      throw new ErroOperacao(ehAdmin(ctx.usuario) ? 400 : 403, "Para trocar a própria senha, use \"Trocar senha\".");
    }
    const alvo = await perfilDe(ctx, d.id);
    if (!ehAdmin(ctx.usuario) && (ehAdmin(alvo) || chavesAdmin(alvo.permissoes).length)) {
      throw new ErroOperacao(403, "Só um Administrador pode redefinir a senha de quem tem acesso à Administração.");
    }
    exigirAlvoContido(ctx.usuario, alvo, "redefinir a senha de");
    if (alvo.status === "desligado") throw new ErroOperacao(400, "Usuário desligado não pode ser editado. Reative o acesso primeiro.");
    const n = await ctx.tx.$executeRaw`update public.usuarios
      set senha_hash = ${await gerarHashSenha(d.senha)}, trocar_senha = true, sessoes_validas_desde = now()
      where id = ${d.id}::uuid`;
    if (!n) throw new ErroOperacao(404, "Esta conta não tem login.");
    await revogarSessoesDoUsuario(d.id);
    return null;
  },
});

// ---- Visualizar como ---------------------------------------------------------

const listarVerComo = operacao({
  permissao: "admin.usuarios",
  escrita: false,
  entrada: z.object({ limite: z.number().int().min(1).max(1000).default(300) }).strict(),
  async executar({ limite }, { tx }) {
    return linhasJson(
      tx,
      `select id, usuario_id, usuario_nome, alvo_profile_id, alvo_nome, alvo_email, alvo_perfil, iniciado_em, encerrado_em
       from public.viewas_log order by iniciado_em desc limit $1`,
      limite,
    );
  },
});

// Inicia o "Visualizar como": grava o viewas_log e guarda a conta vista na
// sessão (Redis, por jti). A partir daí o servidor roda toda leitura como ela
// (permissões, recorte e RLS dela) e recusa escrita (executar.ts); a tela recarrega.
// Quem não é Administrador não "veste" conta com acesso à Administração que
// ela mesma não tem (leria dados que não pode ler).
const verComoIniciar = operacao({
  permissao: "admin.usuarios",
  escrita: true,
  entrada: z.object({ alvoId: z.string().uuid() }).strict(),
  async executar({ alvoId }, ctx) {
    const { tx, usuario } = ctx;
    if (alvoId === usuario.id) throw new ErroOperacao(400, "Você não pode visualizar como a própria conta.");
    const alvo = await perfilDe(ctx, alvoId);
    if (alvo.status !== "ativo" || !(await carregarConta(alvoId))) {
      throw new ErroOperacao(400, "Só é possível visualizar como uma conta ativa.");
    }
    exigirAlvoContido(usuario, alvo, "visualizar como");
    if (!usuario.jti) throw new ErroOperacao(400, "Sessão sem identificador. Entre de novo.");
    // Visualização anterior que ficou aberta (aba fechada sem "Sair") é encerrada.
    await tx.$executeRaw`update public.viewas_log set encerrado_em = now()
      where usuario_id = ${usuario.id}::uuid and encerrado_em is null`;
    const [log] = await tx.$queryRaw<{ id: number }[]>`insert into public.viewas_log
        (usuario_id, usuario_nome, alvo_profile_id, alvo_nome, alvo_email, alvo_perfil)
      values (${usuario.id}::uuid, ${quem(usuario)}, ${alvo.id}::uuid, ${alvo.nome}, ${alvo.email}, ${alvo.perfil})
      returning id::int as id`;
    await definirVerComo(usuario.jti, alvoId);
    return { id: log?.id ?? null };
  },
});

// Encerra o "Visualizar como" (chamado por POST /hub, porque durante a
// visualização as operações rodam como a conta vista e não gravam): fecha o
// viewas_log com a identidade real e tira a conta vista da sessão.
export async function encerrarVerComo(usuario: UsuarioHub): Promise<void> {
  const alvo = usuario.verComo;
  if (alvo) {
    try {
      await comUsuarioRls(usuario.id, (tx) => tx.$executeRaw`update public.viewas_log set encerrado_em = now()
        where usuario_id = ${usuario.id}::uuid and alvo_profile_id = ${alvo.id}::uuid and encerrado_em is null`);
    } catch (err) {
      console.error("[viewas_log] não fechou o registro", String(err));
    }
  }
  await definirVerComo(usuario.jti, null);
}

// ---- Log de Acessos ------------------------------------------------------------

// Módulo aberto (app.js → HUB_LOG_ACESSO.registrar). Login, sessão e saída o
// servidor já grava. A função do banco grava só para auth.uid() e corta os textos.
const registrarModulo = operacao({
  permissao: "autenticado",
  escrita: true,
  entrada: z.object({
    modulo: z.string().regex(/^[a-z0-9-]{1,60}$/, "Módulo inválido."),
    dispositivo: z.enum(["celular", "computador"]).nullable().optional(),
  }).strict(),
  async executar({ modulo, dispositivo }, { tx }) {
    await tx.$executeRaw`select public.registrar_acesso('modulo', ${modulo}, ${dispositivo ?? null})`;
    return null;
  },
});

// Tela do Log de Acessos: um período, do mais recente ao mais antigo, em páginas.
const lerAcessos = operacao({
  permissao: "admin.log_acessos",
  escrita: false,
  entrada: z.object({
    inicio: z.string().datetime({ offset: true }),
    fim: z.string().datetime({ offset: true }),
    de: z.number().int().min(0).max(100_000).default(0),
    limite: z.number().int().min(1).max(1000).default(1000),
  }).strict(),
  async executar({ inicio, fim, de, limite }, { tx }) {
    return linhasJson(
      tx,
      `select id, usuario_id, usuario_nome, usuario_email, perfil, evento, modulo, dispositivo, criado_em
       from public.acesso_log where criado_em >= $1::timestamptz and criado_em < $2::timestamptz
       order by criado_em desc, id desc offset $3 limit $4`,
      inicio, fim, de, limite,
    );
  },
});

export const operacoes: Record<string, Operacao> = {
  "admin.uploadLote": uploadLote,
  "admin.uploadConcluir": uploadConcluir,
  "admin.uploadDescartar": uploadDescartar,
  "admin.registrarUpload": registrarUpload,
  "admin.listarUploads": listarUploads,
  "admin.listarPerfis": listarPerfis,
  "admin.salvarPerfil": salvarPerfil,
  "admin.criarAcesso": criarAcesso,
  "admin.alterarStatus": alterarStatus,
  "admin.redefinirSenha": redefinirSenha,
  "admin.listarVerComo": listarVerComo,
  "admin.verComoIniciar": verComoIniciar,
  "admin.registrarModulo": registrarModulo,
  "admin.lerAcessos": lerAcessos,
};
