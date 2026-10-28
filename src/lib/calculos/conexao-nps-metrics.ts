// Porte de legado/js/conexao-nps-metrics.js (HUB_CONEXAO_NPS_METRICS).
//
// Resumo do NPS das turmas do Conexão RH. Módulo puro; nada ficou fora do porte.
import type { Linha } from '@/lib/calculos/utils';

export function summarize(rows: Linha[]): { count: number; promoters: number; detractors: number; passives: number; average: number | null; nps: number | null } {
  const valid = rows.filter(r => r.eligible !== false && Number.isInteger(r.score) && r.score >= 0 && r.score <= 10);
  const count = valid.length, promoters = valid.filter(r => r.score >= 9).length, detractors = valid.filter(r => r.score <= 6).length;
  return { count, promoters, detractors, passives: count - promoters - detractors, average: count ? valid.reduce((s, r) => s + r.score, 0) / count : null, nps: count ? (promoters - detractors) / count * 100 : null };
}
