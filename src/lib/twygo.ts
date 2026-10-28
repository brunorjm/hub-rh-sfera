// Sincronização de twygo_participantes com a API 2.0 do Twygo. Porte da Edge
// Function do Supabase (legado/supabase/functions/sync-twygo/index.ts): mesmo
// mapeamento de campos, conferido contra um export real do relatório
// "Participantes" em 2026-09 — leia os comentários de lá antes de mexer nos
// campos de situação (situacao_ambiente é o que o indicador de Treinamentos usa).
//
// Código puro (sem banco): o job em prisma/jobs/sync-twygo.ts grava o resultado.

export const TWYGO_BASE = "https://api.twygo.com/api/v2";

type Busca = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<Response>;

// Segurança contra laço infinito se a API devolver next_page para sempre.
const MAX_PAGINAS = 2000;

export async function twygoBuscarTudo(
  caminho: string,
  token: string,
  chaveItens: string,
  buscar: Busca = fetch,
): Promise<Record<string, unknown>[]> {
  let todos: Record<string, unknown>[] = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const r = await buscar(`${TWYGO_BASE}${caminho}?page=${pagina}&per_page=100`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Accept-Language": "pt-BR" },
      signal: AbortSignal.timeout(60_000),
    });
    // Sem o corpo da resposta na mensagem: pode ecoar dados da conta.
    if (!r.ok) throw new Error(`Twygo API ${caminho} falhou (HTTP ${r.status}).`);
    const corpo = (await r.json()) as { data?: Record<string, unknown> };
    const itens = (corpo?.data?.[chaveItens] as Record<string, unknown>[] | undefined) ?? [];
    todos = todos.concat(itens);
    const paginacao = corpo?.data?.pagination as { next_page?: unknown } | undefined;
    if (!paginacao?.next_page || !itens.length) return todos;
  }
  throw new Error(`Twygo API ${caminho}: mais de ${MAX_PAGINAS} páginas, interrompido.`);
}

// "hours" vem como "HHHH:MM:SS" (ex.: "0000:30:00") → horas decimais.
export function parseHoras(v: unknown): number | null {
  if (!v) return null;
  const m = String(v).trim().match(/^(\d+):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1]!, 10) + parseInt(m[2]!, 10) / 60 + parseInt(m[3]!, 10) / 3600;
}

// Status da API → "Situação da Inscrição" (o export só tem Confirmado/Cancelada/Pendente).
export const STATUS_MAP: Record<string, string> = {
  pending: "Pendente", confirmed: "Confirmado",
  rejected: "Cancelada", reversed: "Cancelada", payment_overdue: "Cancelada",
  refund_failed: "Cancelada", refund_solicitation: "Cancelada", refund_sent: "Cancelada",
};

/* eslint-disable @typescript-eslint/no-explicit-any -- formato da API do Twygo, sem tipos publicados */
const dia = (v: unknown) => (v ? String(v).slice(0, 10) : null);

export function montarLinhas(attendees: any[], users: any[], contents: any[]) {
  const usersById = new Map(users.map((u) => [u.user_id, u]));
  const contentsById = new Map(contents.map((c) => [c.content_id, c]));
  return attendees
    .map((a) => {
      const u = usersById.get(a.user_id) || {};
      const c = contentsById.get(a.content_id) || {};
      const cert = Array.isArray(a.certificates) && a.certificates.length ? a.certificates[0] : null;
      return {
        content_id: a.content_id != null ? String(a.content_id) : null,
        content_title: c.name ?? null,
        content_type: c.content_type ?? null,
        nome_completo: u.name ?? null,
        email: u.email ?? null,
        unidade: u.enterprise ?? null,
        departamento: u.department ?? null,
        cargo: u.role ?? null,
        data_inscricao: dia(a.created_at),
        ultimo_acesso: null,
        situacao_inscricao: STATUS_MAP[a.status] ?? a.status ?? null,
        situacao: a.approved_at ? "Aprovado" : "Em Andamento",
        situacao_ambiente: u.situation === "active" ? "Ativo" : u.situation === "inactive" ? "Inativo" : null,
        progresso: (a.progress ?? null) !== null ? Number(a.progress) / 100 : null,
        nota: a.questionary_average ?? null,
        frequencia: a.attendance_score ?? null,
        pontuacao: a.score ?? null,
        carga_horaria: parseHoras(c.hours),
        emitido_em: dia(cert?.certificate_issuing_date),
        concluido_em: null,
        aprovado_em: dia(a.approved_at),
      };
    })
    .filter((r) => r.nome_completo || r.email);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const COLUNAS = [
  "content_id", "content_title", "content_type", "nome_completo", "email", "unidade", "departamento", "cargo",
  "data_inscricao", "ultimo_acesso", "situacao_inscricao", "situacao", "situacao_ambiente", "progresso", "nota",
  "frequencia", "pontuacao", "carga_horaria", "emitido_em", "concluido_em", "aprovado_em",
].join(", ");

type ComTransacao = {
  $transaction<T>(fn: (tx: { $executeRawUnsafe(sql: string, ...p: unknown[]): Promise<number> }) => Promise<T>,
    opcoes?: { timeout?: number; maxWait?: number }): Promise<T>;
};

// Troca a tabela inteira numa transação só: se falhar no meio, os dados
// anteriores continuam (a Edge Function antiga apagava antes e inseria em lotes).
export async function gravarParticipantes(prisma: ComTransacao, linhas: ReturnType<typeof montarLinhas>, lote = 2000): Promise<number> {
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("delete from public.twygo_participantes");
      for (let i = 0; i < linhas.length; i += lote) {
        // json_populate_recordset converte os tipos como o PostgREST fazia.
        await tx.$executeRawUnsafe(
          `insert into public.twygo_participantes (${COLUNAS})
           select ${COLUNAS} from json_populate_recordset(null::public.twygo_participantes, $1::json)`,
          JSON.stringify(linhas.slice(i, i + lote)),
        );
      }
    },
    { timeout: 10 * 60_000, maxWait: 30_000 },
  );
  return linhas.length;
}
