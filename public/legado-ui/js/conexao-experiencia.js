(function (root) {
  'use strict';
  const cpfKey = value => {
    const digits = String(value ?? '').replace(/\D/g, '');
    return digits.length > 0 && digits.length <= 11 ? digits.padStart(11, '0') : null;
  };
  // The global period chooses Conexão stages, not the historical evidence
  // inside a person's file. Always match the same CPF and admission.
  function summarize(rows, identity, cycle, metrics) {
    const cpf = cpfKey(identity.cpf);
    if (!cpf || !identity.admission) return { state: 'identity' };
    const matches = rows.filter(row => cpfKey(row.cpf) === cpf && String(row.data_admissao || '').slice(0, 10) === identity.admission);
    if (matches.length !== 1) return { state: matches.length ? 'ambiguous' : 'missing' };
    const row = { ...matches[0] };
    metrics.preparar([row], cycle);
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
  const api = { summarize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HUB_CONEXAO_EXPERIENCIA = api;
})(typeof window !== 'undefined' ? window : globalThis);
