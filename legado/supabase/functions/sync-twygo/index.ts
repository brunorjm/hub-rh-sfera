// Sincroniza public.twygo_participantes com a API 2.0 do Twygo, substituindo
// a tabela por completo a cada execução — mesmo comportamento do upload
// manual da planilha "27. Twygo.xlsx" (HUB_DAL.replaceTable), só que
// automático. Isso é só a tabela "Inscrições" (twygo_participantes) — ela
// sozinha já sustenta todo o indicador de Treinamentos do Hub Sfera
// (ver js/metrics-indicadores.js, agregarPessoasDeParticipantes). As
// planilhas opcionais twygo_usuarios/twygo_conteudos continuam por upload
// manual, sem mudança.
//
// Variáveis de ambiente (Project Settings → Edge Functions → Secrets):
//   TWYGO_API_TOKEN — token gerado em Configurações > Integrações > API,
//                     dentro do próprio Twygo (não é o mesmo token/senha do
//                     seu login). NUNCA cole esse token em código-fonte.
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem automaticamente no
// ambiente de toda Edge Function — não precisa configurar.
//
// MAPEAMENTO DE CAMPOS — conferido contra um export real do relatório
// "Participantes" (modelo Inscrições, 67.932 linhas) em 2026-09. Os 3
// campos de situação são os que mais importam (o indicador de Treinamentos
// só considera quem está "Ativo" em situacao_ambiente — ver
// js/metrics-indicadores.js, treinamentosMetrics):
//   - situacao_inscricao ("Situação da Inscrição"): valores reais só
//     Confirmado/Cancelada/Pendente — mapeado a partir de attendee.status.
//   - situacao ("Situação"): valores reais só Em Andamento/Aprovado —
//     sem campo equivalente direto documentado; deduzido de
//     attendee.approved_at (setado = Aprovado).
//   - situacao_ambiente ("Situação no ambiente"): valores reais só
//     Ativo/Inativo — mapeado de user.situation (active/inactive). Este é
//     o campo crítico do filtro "só Ativo" — CUIDADO ao mexer aqui.
// "Nota"/"Frequência"/"Pontuação" continuam sendo a melhor suposição
// (questionary_average/attendance_score/score) — ainda não confirmados
// contra o export real. "Último Acesso" fica null — não há campo
// equivalente documentado em /attendees nem /users.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TWYGO_BASE = 'https://api.twygo.com/api/v2';

async function twygoFetchAll(path: string, token: string, itemsKey: string): Promise<any[]> {
  let all: any[] = [];
  let page = 1;
  const perPage = 100;
  for (;;) {
    const res = await fetch(`${TWYGO_BASE}${path}?page=${page}&per_page=${perPage}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Accept-Language': 'pt-BR' }
    });
    if (!res.ok) throw new Error(`Twygo API ${path} falhou (HTTP ${res.status}): ${await res.text()}`);
    const body = await res.json();
    const items = body?.data?.[itemsKey] || [];
    all = all.concat(items);
    if (!body?.data?.pagination?.next_page || !items.length) break;
    page++;
  }
  return all;
}

// "hours" do Twygo vem como texto de duração "HHHH:MM:SS" (ex.: "0000:30:00")
// — mesma ideia de parseDuracaoTexto em js/parsers.js, convertendo pra horas
// decimais.
function parseHoras(v: unknown): number | null {
  if (!v) return null;
  const m = String(v).trim().match(/^(\d+):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) + parseInt(m[2], 10) / 60 + parseInt(m[3], 10) / 3600;
}

// Tradução do status do participante (API) pro texto em português real de
// "Situação da Inscrição" — o export confirmou só 3 valores em uso
// (Confirmado/Cancelada/Pendente), então qualquer status de
// pagamento/reembolso que não avança a inscrição some pro genérico
// "Cancelada".
const STATUS_MAP: Record<string, string> = {
  pending: 'Pendente', confirmed: 'Confirmado',
  rejected: 'Cancelada', reversed: 'Cancelada', payment_overdue: 'Cancelada',
  refund_failed: 'Cancelada', refund_solicitation: 'Cancelada', refund_sent: 'Cancelada'
};

Deno.serve(async (_req: Request) => {
  try {
    const token = Deno.env.get('TWYGO_API_TOKEN');
    if (!token) throw new Error('TWYGO_API_TOKEN não configurado nos Secrets da function.');
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const [attendees, users, contents] = await Promise.all([
      twygoFetchAll('/attendees', token, 'attendees'),
      twygoFetchAll('/users', token, 'users'),
      twygoFetchAll('/contents', token, 'contents')
    ]);

    const usersById = new Map(users.map((u: any) => [u.user_id, u]));
    const contentsById = new Map(contents.map((c: any) => [c.content_id, c]));

    const rows = attendees.map((a: any) => {
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
        data_inscricao: a.created_at ? String(a.created_at).slice(0, 10) : null,
        ultimo_acesso: null, // sem equivalente documentado em /attendees ou /users
        situacao_inscricao: STATUS_MAP[a.status] ?? a.status ?? null,
        // "Situação": só Em Andamento/Aprovado no export real — sem campo
        // direto documentado, deduzido de approved_at.
        situacao: a.approved_at ? 'Aprovado' : 'Em Andamento',
        // "Situação no ambiente" — É ESTE o campo que o indicador de
        // Treinamentos usa pra excluir Inativo (não o `situacao` acima).
        situacao_ambiente: u.situation === 'active' ? 'Ativo' : (u.situation === 'inactive' ? 'Inativo' : null),
        // A planilha guarda progresso em 0-1 (ex.: "45%" -> 0.45, ver num()
        // em js/parsers.js) — a API descreve "progress" como percentual
        // (0-100), então divide por 100 aqui pra manter a mesma escala.
        progresso: (a.progress ?? null) !== null ? Number(a.progress) / 100 : null,
        nota: a.questionary_average ?? null, // suposição: "Nota / Média Geral" = média dos questionários
        frequencia: a.attendance_score ?? null, // suposição: "Frequência" = pontuação de presença
        pontuacao: a.score ?? null, // suposição: "Pontuação" = pontuação total ponderada
        carga_horaria: parseHoras(c.hours),
        emitido_em: cert?.certificate_issuing_date ? String(cert.certificate_issuing_date).slice(0, 10) : null,
        // "Conclusão 100%" não tem campo documentado na API: fica vazio e o Hub
        // usa a data de aprovação no lugar (ver js/metrics-treinamentos.js).
        concluido_em: null,
        aprovado_em: a.approved_at ? String(a.approved_at).slice(0, 10) : null
      };
    }).filter(r => r.nome_completo || r.email);

    // Substitui a tabela inteira (mesmo efeito do upload manual). Roda com a
    // service role key — já ignora RLS, não precisa da RPC admin_truncate
    // (que exige auth.uid() de um usuário logado, algo que uma Edge Function
    // não tem).
    const { error: delErr } = await sb.from('twygo_participantes').delete().gt('id', 0);
    if (delErr) throw new Error('Erro ao limpar twygo_participantes: ' + delErr.message);

    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await sb.from('twygo_participantes').insert(rows.slice(i, i + BATCH));
      if (error) throw new Error('Erro ao gravar (lote ' + i + '): ' + error.message);
    }

    return new Response(JSON.stringify({ ok: true, linhas: rows.length }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, erro: String((err as Error)?.message || err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
});
