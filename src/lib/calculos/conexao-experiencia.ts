// Porte de legado/js/conexao-experiencia.js (HUB_CONEXAO_EXPERIENCIA).
//
// Resultado da Avaliação da Experiência (AVE) na ficha do Conexão RH, casando
// CPF + admissão. As linhas da AVE e o motor (metrics-experiencia) chegam por
// parâmetro, como no legado.
//
// Mudança de assinatura: no legado, metrics.preparar() lia window.HUB_DATA
// (colaboradores) por dentro. Aqui summarize recebe `dados` (= HUB_DATA) no fim e
// repassa para metrics.preparar([row], cycle, dados).
import type { Linha } from '@/lib/calculos/utils';

/** Parte do motor da AVE (metrics-experiencia) usada aqui. */
export interface MotorExperiencia {
  preparar: (rows: Linha[], ciclo: number, dados: Linha | null | undefined) => unknown;
  MARTELO: Record<number, string>;
}

const cpfKey = (value: unknown): string | null => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length > 0 && digits.length <= 11 ? digits.padStart(11, '0') : null;
};
// The global period chooses Conexão stages, not the historical evidence
// inside a person's file. Always match the same CPF and admission.
export function summarize(rows: Linha[], identity: Linha, cycle: number, metrics: MotorExperiencia, dados?: Linha): Linha {
  const cpf = cpfKey(identity.cpf);
  if (!cpf || !identity.admission) return { state: 'identity' };
  const matches = rows.filter(row => cpfKey(row.cpf) === cpf && String(row.data_admissao || '').slice(0, 10) === identity.admission);
  if (matches.length !== 1) return { state: matches.length ? 'ambiguous' : 'missing' };
  const row: Linha = { ...matches[0] };
  metrics.preparar([row], cycle, dados);
  const d = row._d;
  const complete = row.status_gestor === 'concluida';
  return {
    state: 'found', cycle, complete,
    score: complete ? d.notaFinal : null,
    partial: complete && d.notaFinal !== null && d.notaFinalParcial,
    managerScore: row.status_gestor === 'concluida' ? d.mediaGestor : null,
    selfScore: row.status_auto === 'concluida' ? d.mediaAuto : null,
    decision: complete ? metrics.MARTELO[row.martelo] || 'Sem decisão registrada' : 'Decisão ainda não finalizada',
    managerStatus: row.status_gestor || '', selfStatus: row.status_auto || '',
    managerDate: row.data_avaliacao, selfDate: row.data_autoavaliacao
  };
}
