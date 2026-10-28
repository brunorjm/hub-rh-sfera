import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ipDoPedido } from "@/lib/limite-login";
import { consumirLimitePublico, PublicoBloqueado } from "@/lib/limite-publico";
import { mensagemDoBanco } from "@/server/hub/operacao";

// Links públicos SEM LOGIN (spec §9): parecer do gestor, entrevista de
// desligamento e NPS da Conexão RH. Cada página chama POST /api/publico/<pagina>
// com { acao: "ler" | "salvar", token, dados }. Aqui só se chamam as MESMAS
// funções do banco que o Supabase expunha ao anon (security definer: elas
// conferem o token, o status, o prazo e o uso único). Nada lê ou grava as
// tabelas direto. Roda como o dono do banco (prisma direto), sem sessão.
//
// O que sai para o navegador é recortado por lista: só os campos que a página
// usa, mesmo que a função passe a devolver mais. CPF, telefone e matrícula
// (celular) nunca saem daqui.

export type PaginaPublica = "parecer" | "entrevista-desligamento" | "conexao-nps";

// Corpo do pedido: o maior é o parecer (dados do formulário). Folga grande.
const MAX_CORPO = 256 * 1024;
const MAX_JSON_DADOS = 100_000;

// Tokens: parecer e desligamento são gerados pela tela logada com
// crypto.randomUUID() (36 caracteres) ou, em navegador sem ele, base 36
// (Date.now + Math.random); as funções exigem 16+ caracteres. O NPS é
// 32 bytes em hex (conexao_private.sync_nps), e a função exige ^[0-9a-f]{64}$.
const tokenLink = z.string().regex(/^[0-9a-z-]{16,64}$/, "Link inválido.");
const tokenNps = z.string().regex(/^[0-9a-f]{64}$/, "Link inválido.");

const objetoJson = z
  .record(z.string().max(200), z.unknown())
  .refine((v) => JSON.stringify(v).length <= MAX_JSON_DADOS, "Respostas grandes demais.");

const texto = (max: number) => z.string().max(max).nullable().optional();

const salvarParecer = z
  .object({
    dados: objetoJson,
    nivelRecomendacao: z.number().int().min(0).max(10).nullable().optional(),
    parecerFinal: texto(200),
    justificativa: texto(20_000),
    preenchidoPor: texto(300),
  })
  .strict();
const salvarEntrevista = z.object({ respostas: objetoJson }).strict();
const salvarNps = z.object({ nota: z.number().int().min(0).max(10), comentario: texto(2000) }).strict();

function pedido<T extends z.ZodTypeAny, D extends z.ZodTypeAny>(token: T, dados: D) {
  return z.discriminatedUnion("acao", [
    z.object({ acao: z.literal("ler"), token }).strict(),
    z.object({ acao: z.literal("salvar"), token, dados }).strict(),
  ]);
}

// Só as chaves listadas; o resto do que a função devolver fica no servidor.
function recortar(v: unknown, chaves: readonly string[]): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  return Object.fromEntries(chaves.map((k) => [k, o[k] ?? null]));
}

async function valor(sql: string, ...parametros: unknown[]): Promise<unknown> {
  const [r] = await prisma.$queryRawUnsafe<{ r: unknown }[]>(sql, ...parametros);
  return r?.r ?? null;
}

// Campos que cada página usa (js/*-publico.js).
const CAMPOS_PARECER = ["candidatoNome", "cargo", "modelo", "recrutador", "dados", "observacoesCandidato"] as const;
const CAMPOS_ENTREVISTA = [
  "colaboradorNome", "colaboradorEmail", "unidadeTrabalho", "local", "departamentoForms", "respostas",
] as const;
const CAMPOS_NPS = ["milestone", "date", "answered"] as const;

type Pagina = {
  entrada: z.ZodTypeAny;
  ler: (token: string) => Promise<unknown>;
  salvar: (token: string, dados: never) => Promise<unknown>;
};

const PAGINAS: Record<PaginaPublica, Pagina> = {
  // parecer-publico.js. null = token inválido, já usado (status ≠ Pendente).
  parecer: {
    entrada: pedido(tokenLink, salvarParecer),
    ler: async (token) => recortar(await valor("select public.parecer_publico_get($1) as r", token), CAMPOS_PARECER),
    salvar: async (token, d: z.infer<typeof salvarParecer>) =>
      (await valor(
        "select public.parecer_publico_salvar($1, $2::jsonb, $3::int, $4::text, $5::text, $6::text) as r",
        token, JSON.stringify(d.dados), d.nivelRecomendacao ?? null, d.parecerFinal ?? null,
        d.justificativa ?? null, d.preenchidoPor ?? null,
      )) === true,
  },
  // entrevista-desligamento-publico.js. null = inválido, respondido ou com mais de 30 dias.
  "entrevista-desligamento": {
    entrada: pedido(tokenLink, salvarEntrevista),
    ler: async (token) =>
      recortar(await valor("select public.entrevista_desligamento_publico_get($1) as r", token), CAMPOS_ENTREVISTA),
    salvar: async (token, d: z.infer<typeof salvarEntrevista>) =>
      (await valor("select public.entrevista_desligamento_publico_salvar($1, $2::jsonb) as r", token, JSON.stringify(d.respostas))) === true,
  },
  // conexao-nps-publico.js. Token inválido, revogado ou vencido: a função
  // recusa com mensagem (como no Supabase), e a página mostra a mensagem.
  "conexao-nps": {
    entrada: pedido(tokenNps, salvarNps),
    ler: async (token) =>
      recortar(await valor("select public.conexao_nps_public($1, null::int, null::text) as r", token), CAMPOS_NPS),
    salvar: async (token, d: z.infer<typeof salvarNps>) =>
      recortar(
        await valor("select public.conexao_nps_public($1, $2::int, $3::text) as r", token, d.nota, d.comentario ?? null),
        CAMPOS_NPS,
      ),
  },
};

const responder = (status: number, corpo: unknown, extra: Record<string, string> = {}) =>
  Response.json(corpo, { status, headers: { "Cache-Control": "no-store", ...extra } });
const erro = (status: number, mensagem: string, extra?: Record<string, string>) => responder(status, { erro: mensagem }, extra);

// Atende POST /api/publico/<pagina>. Separado da rota para os testes chamarem direto.
export async function atenderPublico(pagina: PaginaPublica, req: Request): Promise<Response> {
  // Só a própria origem chama (as páginas públicas são servidas pelo mesmo site).
  const origem = req.headers.get("origin");
  if (origem && origem !== new URL(req.url).origin) return erro(403, "Origem não permitida.");

  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > MAX_CORPO) return erro(413, "Pedido grande demais.");
  let corpo: unknown;
  try {
    const bruto = await req.text();
    if (bruto.length > MAX_CORPO) return erro(413, "Pedido grande demais.");
    corpo = JSON.parse(bruto);
  } catch {
    return erro(400, "Pedido inválido.");
  }

  const p = PAGINAS[pagina];
  const entrada = p.entrada.safeParse(corpo);
  if (!entrada.success) return erro(400, entrada.error.issues[0]?.message ?? "Pedido inválido.");
  const { acao, token, dados } = entrada.data as { acao: "ler" | "salvar"; token: string; dados?: never };

  try {
    await consumirLimitePublico(ipDoPedido(req.headers), acao);
  } catch (e) {
    if (e instanceof PublicoBloqueado) {
      return erro(429, "Muitas tentativas. Aguarde alguns minutos e tente de novo.", { "Retry-After": String(e.segundos) });
    }
    throw e;
  }

  try {
    const resultado = acao === "ler" ? await p.ler(token) : await p.salvar(token, dados as never);
    return responder(200, { dados: resultado ?? null });
  } catch (e) {
    // raise exception das funções ("Este link não é mais válido…", "Este
    // encontro já foi avaliado."): mensagens escritas para a página, como o
    // Supabase devolvia. Dado inválido (classe 22) também volta como 400.
    const banco = (e as { meta?: { code?: string; message?: string } })?.meta;
    if (banco?.code === "P0001" || banco?.code?.startsWith("22")) {
      return erro(400, mensagemDoBanco(banco.message, "Não foi possível concluir."));
    }
    // Sem token nem dados no log.
    console.error(`[publico] ${pagina}.${acao} falhou`, banco?.code ?? (e as Error)?.name ?? "erro");
    return erro(500, "Não foi possível concluir agora. Tente de novo em instantes.");
  }
}
