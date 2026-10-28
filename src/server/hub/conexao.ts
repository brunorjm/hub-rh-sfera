import "server-only";
import { z } from "zod";
import { comUsuarioRls } from "@/lib/rls";
import { temPermissao } from "@/lib/rbac/permissoes";
import type { UsuarioHub } from "@/lib/sessao";
import type { Storage } from "@/lib/storage";
import { ErroOperacao, linhasJson, mensagemDoBanco, operacao, type ContextoOperacao, type Operacao } from "@/server/hub/operacao";

// Operações de: Conexão RH (conexao-store.js, conexao-nps.js, conexao-fit.js e
// a ficha do colaborador em sections/conexao-rh.js).
// Nome de cada operação: "conexao.<função>".
//
// Os registros ficam em conexao_private, que o hub_app não lê direto (policies
// *_no_direct_access): tudo passa pelas funções security definer do banco, como
// no Supabase (legado/supabase-conexao-rh.sql). Elas conferem permissão por
// tipo de registro, escopo (allowed_scope), revisão e regras da turma; as
// permissões abaixo só devolvem 403 claro antes de chegar lá.

const ACOMPANHAR = "conexao_rh.acompanhar";
const DOCUMENTOS = "conexao_rh.documentos";

type ErroBanco = { code?: string; message?: string };
const erroBanco = (e: unknown): ErroBanco | undefined => (e as { meta?: ErroBanco })?.meta;

// Recusa por permissão/escopo das funções do Conexão (errcode 42501): a tela
// antiga mostrava a mensagem ("Registro fora do seu escopo."...).
function recusaDoBanco(e: unknown): never {
  const b = erroBanco(e);
  if (b?.code === "42501") {
    const msg = b.message && !/permission denied/i.test(b.message) ? mensagemDoBanco(b.message, "Sem permissão para estes dados.") : "Sem permissão para estes dados.";
    throw new ErroOperacao(403, msg);
  }
  throw e;
}

async function valor<T>(ctx: ContextoOperacao, sql: string, ...parametros: unknown[]): Promise<T> {
  try {
    const [r] = await ctx.tx.$queryRawUnsafe<{ v: T }[]>(`select ${sql} as v`, ...parametros);
    return r!.v;
  } catch (e) {
    recusaDoBanco(e);
  }
}

// conexao-store.js → load(): estado completo visível à pessoa
// ([{ kind, id, data, revision }], o "data" da RPC conexao_state).
const estado = operacao({
  permissao: ACOMPANHAR,
  escrita: false,
  entrada: z.object({}).strict(),
  async executar(_d, ctx) {
    return valor<unknown[]>(ctx, "public.conexao_state()");
  },
});

const KINDS = ["config", "sessions", "events", "executions", "reports", "committees", "actions", "observations", "fits"] as const;

// conexao-store.js → mutate(): lote de mudanças com a revisão que a tela viu.
// Devolve o estado completo (como conexao_save) ou { conflito: true } quando
// outra pessoa gravou antes (errcode 40001): a tela recarrega e avisa, como
// fazia com error.code === '40001'.
const salvar = operacao({
  // O banco exige ainda conexao_rh.acompanhar e a permissão de cada tipo:
  // config → configurar, fits → documentos, demais → gerir.
  permissao: ["conexao_rh.gerir", "conexao_rh.configurar", DOCUMENTOS],
  escrita: true,
  entrada: z.object({
    changes: z.array(z.object({
      kind: z.enum(KINDS),
      id: z.string().min(1).max(200),
      data: z.record(z.string(), z.unknown()),
      revision: z.number().int().min(0),
    }).strict()).min(1).max(2000),
  }).strict().refine((d) => JSON.stringify(d.changes).length <= 8_000_000, "Lote inválido ou muito grande."),
  async executar({ changes }, ctx) {
    // Ponto de retorno: no conflito a transação continua utilizável e nada foi gravado.
    await ctx.tx.$executeRawUnsafe("savepoint conexao_salvar");
    try {
      const [r] = await ctx.tx.$queryRawUnsafe<{ v: unknown[] }[]>(
        "select public.conexao_save($1::jsonb) as v", JSON.stringify(changes),
      );
      return r!.v;
    } catch (e) {
      if (erroBanco(e)?.code === "40001") {
        await ctx.tx.$executeRawUnsafe("rollback to savepoint conexao_salvar");
        return { conflito: true };
      }
      recusaDoBanco(e);
    }
  },
});

// conexao-nps.js → sync(): gera os links de NPS que faltam (quem tem
// conexao_rh.gerir) e devolve a lista visível. Grava (insere tokens), por isso
// é escrita: no "Visualizar como" fica recusada, como no hub antigo (o
// view-as.js bloqueava toda RPC fora da lista de leitura).
const npsSync = operacao({
  permissao: ACOMPANHAR,
  escrita: true,
  entrada: z.object({}).strict(),
  async executar(_d, ctx) {
    return valor<unknown[]>(ctx, "public.conexao_nps_sync()");
  },
});

// sections/conexao-rh.js → ficha do colaborador, "Contato": a mesma consulta
// da tela antiga (id, cpf, data_admissao, matricula de um vínculo).
// matricula é o CELULAR (vem da Feedz): única exceção do hub, só com
// conexao_rh.documentos (AGENTS.md) e, como a tela antiga, indicadores.headcount.
// O recorte por unidade/departamento é a policy colaboradores_select.
const contato = operacao({
  permissao: DOCUMENTOS,
  escrita: false,
  entrada: z.object({ id: z.union([z.number().int().positive(), z.string().regex(/^\d{1,18}$/)]) }).strict(),
  async executar({ id }, ctx) {
    if (!temPermissao(ctx.usuario, "indicadores.headcount")) throw new ErroOperacao(403, "Sem permissão para estes dados.");
    return linhasJson(
      ctx.tx,
      "select id, cpf, data_admissao, matricula from public.colaboradores where id = $1::bigint limit 1",
      String(id),
    );
  },
});

export const operacoes: Record<string, Operacao> = {
  "conexao.estado": estado,
  "conexao.salvar": salvar,
  "conexao.npsSync": npsSync,
  "conexao.contato": contato,
};

// ---- PDFs do Fit Cultural ---------------------------------------------------
// Rotas /api/arquivos/conexao-fit/<id> (src/app/api/arquivos/conexao-fit/[id]).
// No Supabase: bucket privado "conexao-fit", objeto <colaborador>/<id>.pdf,
// leitura e gravação só se conexao_private.allowed_pdf(caminho) (documentos +
// colaborador no escopo); o PDF original é imutável (upsert: false).
// Aqui o objeto fica em "conexao-fit/<colaborador>/<id>.pdf" no storage.

export const FIT_LIMITE_BYTES = 10 * 1024 * 1024;
const FIT_ID = /^[0-9a-f-]{36}$/;
// Mesmo padrão de conexao_private.allowed_pdf.
const FIT_CAMINHO = /^[0-9]+@[0-9]{4}-[0-9]{2}-[0-9]{2}\/[0-9a-f-]{36}\.pdf$/;
export const caminhoFitNoStorage = (caminho: string) => `conexao-fit/${caminho}`;

export type ResultadoArquivo =
  | { status: 200; bytes: Uint8Array }
  | { status: 200; gravado: boolean }
  | { status: number; erro: string };

const ehPdf = (b: Uint8Array) => b.length >= 5 && Buffer.from(b.subarray(0, 5)).toString("latin1") === "%PDF-";
// allowed_pdf e conexao_state exigem também conexao_rh.acompanhar.
const podeDocumentos = (u: UsuarioHub) => temPermissao(u, ACOMPANHAR) && temPermissao(u, DOCUMENTOS);
const SEM_DOCUMENTOS = { status: 403, erro: "Seu perfil não tem acesso aos documentos de Fit Cultural." } as const;

async function comRecusa403<T>(fn: () => Promise<T>): Promise<T | typeof SEM_DOCUMENTOS> {
  try {
    return await fn();
  } catch (e) {
    if (erroBanco(e)?.code === "42501") return SEM_DOCUMENTOS;
    throw e;
  }
}

// Download: o registro "fits" precisa estar no estado que a pessoa enxerga
// (conexao_state, a mesma função que a tela usava para listar) e o caminho
// precisa passar em allowed_pdf. No "Visualizar como", com a conta simulada.
export async function lerFit(id: string, usuario: UsuarioHub, storage: Storage, verComo?: UsuarioHub | null): Promise<ResultadoArquivo> {
  const efetivo = verComo ?? usuario;
  if (!podeDocumentos(efetivo)) return SEM_DOCUMENTOS;
  if (!FIT_ID.test(id)) return { status: 400, erro: "Documento inválido." };
  const caminho = await comRecusa403(() => comUsuarioRls(efetivo.id, async (tx) => {
    const [r] = await tx.$queryRawUnsafe<{ caminho: string | null; ok: boolean | null }[]>(
      `select f.caminho, conexao_private.allowed_pdf(f.caminho) as ok
         from (select e->'data'->>'path' as caminho
                 from jsonb_array_elements(public.conexao_state()) e
                where e->>'kind' = 'fits' and e->>'id' = $1
                limit 1) f`,
      id,
    );
    return r?.ok && r.caminho && FIT_CAMINHO.test(r.caminho) ? r.caminho : null;
  }, { somenteLeitura: !!verComo }));
  if (typeof caminho === "object" && caminho) return caminho;
  if (!caminho) return { status: 404, erro: "Documento não encontrado." };
  const bytes = await storage.ler(caminhoFitNoStorage(caminho));
  if (!bytes) return { status: 404, erro: "Arquivo do documento não encontrado." };
  return { status: 200, bytes };
}

// Upload: antes do registro existir (a tela grava o PDF e depois o registro,
// via conexao.salvar, que confere path = <colaborador>/<id>.pdf). Recusado no
// "Visualizar como". Arquivo que já existe não é sobrescrito (imutável).
export async function gravarFit(
  id: string, colaborador: string, bytes: Uint8Array, usuario: UsuarioHub, storage: Storage, verComo?: UsuarioHub | null,
): Promise<ResultadoArquivo> {
  if (verComo) return { status: 403, erro: "No \"Visualizar como\" nada pode ser alterado." };
  if (!podeDocumentos(usuario)) return SEM_DOCUMENTOS;
  const caminho = `${colaborador}/${id}.pdf`;
  if (!FIT_ID.test(id) || !FIT_CAMINHO.test(caminho)) return { status: 400, erro: "Documento inválido." };
  if (bytes.length > FIT_LIMITE_BYTES) return { status: 413, erro: "Selecione um PDF de até 10 MB." };
  if (!ehPdf(bytes)) return { status: 400, erro: "O arquivo selecionado não é um PDF válido." };
  const ok = await comRecusa403(() => comUsuarioRls(usuario.id, async (tx) => {
    const [r] = await tx.$queryRawUnsafe<{ ok: boolean | null }[]>("select conexao_private.allowed_pdf($1) as ok", caminho);
    return !!r?.ok;
  }, { somenteLeitura: true }));
  if (typeof ok === "object") return ok;
  if (!ok) return { status: 403, erro: "Colaborador não encontrado ou fora do seu escopo." };
  const destino = caminhoFitNoStorage(caminho);
  if (await storage.existe(destino)) return { status: 200, gravado: false };
  await storage.gravar(destino, bytes, "application/pdf");
  return { status: 200, gravado: true };
}
