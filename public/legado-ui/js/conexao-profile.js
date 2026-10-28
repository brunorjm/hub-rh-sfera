(function (root) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./conexao-core.js') : root.HUB_CONEXAO_CORE;
  const same = (a, b) => !!C.norm(a) && C.norm(a) === C.norm(b);
  const afterAdmission = (row, employee) => !!C.date(row.data) && row.data >= employee.admission;
  const sameDepartment = (row, employee) => same(row.unidade, employee.unit) && same(row.departamento, employee.department);
  const recipients = value => String(value || '').split(/[,;|\n]+/).map(C.norm).filter(Boolean);

  function personalActivity(employee, collaborators, feedbacks, celebrations) {
    const names = new Set([employee.name].map(C.norm));
    const matches = (collaborators || []).filter(row => names.has(C.norm(row.nome_completo || row.nome)));
    const current = matches.find(row => String(row.id) === String(employee.id) && C.date(row.data_admissao) === employee.admission);
    if (!current) {
      return { ambiguous: true, receivedFeedback: [], sentFeedback: [], receivedCelebrations: [], sentCelebrations: [] };
    }
    const name = C.norm(employee.name);
    const feedback = (feedbacks || []).filter(row => afterAdmission(row, employee));
    const celebrationsAfter = (celebrations || []).filter(row => afterAdmission(row, employee));
    const byDate = (a, b) => String(b.data || '').localeCompare(String(a.data || ''));
    return {
      ambiguous: false,
      receivedFeedback: feedback.filter(row => C.norm(row.para) === name && sameDepartment(row, employee)).sort(byDate),
      sentFeedback: feedback.filter(row => C.norm(row.de) === name && sameDepartment(row, employee)).sort(byDate),
      receivedCelebrations: celebrationsAfter.filter(row => recipients(row.colaboradores_receberam).includes(name) && sameDepartment(row, employee)).sort(byDate),
      sentCelebrations: celebrationsAfter.filter(row => C.norm(row.colaborador_enviou) === name && sameDepartment(row, employee)).sort(byDate)
    };
  }

  function departmentMood(employee, rows, period = {}) {
    const monthStart = String(period.start || '0000-01-01').slice(0, 7);
    const monthEnd = String(period.end || '9999-12-31').slice(0, 7);
    const selected = (rows || []).filter(row => same(row.unidade, employee.unit) && same(row.departamento, employee.department)
      && String(row.mes || '').slice(0, 7) >= monthStart && String(row.mes || '').slice(0, 7) <= monthEnd);
    if (!selected.length) return null;
    // The same person may appear in more than one month. Summing monthly
    // counts would overstate the number of distinct people in the period.
    const people = Math.max(...selected.map(row => Number(row.pessoas) || 0));
    const records = selected.reduce((sum, row) => sum + (Number(row.registros) || 0), 0);
    const score = selected.reduce((sum, row) => sum + (Number(row.soma) || 0), 0);
    return { people, records, average: people >= 3 && records ? score / records : null };
  }

  function departmentEngagementScore(employee, rows, period = {}) {
    const selected = (rows || []).filter(row => (!period.start || row.dia >= period.start) && (!period.end || row.dia <= period.end)
      && same(row.unidade, employee.unit) && same(row.departamento, employee.department) && C.norm(row.dimensao) !== 'nps');
    if (!selected.length) return null;
    const answers = selected.reduce((sum, row) => sum + (Number(row.n) || 0), 0);
    const total = selected.reduce((sum, row) => sum + (Number(row.soma) || 0), 0);
    const minimumRespondents = Math.max(...selected.map(row => Number(row.n) || 0));
    return { answers, average: minimumRespondents >= 3 && answers ? total / answers : null };
  }

  const api = { personalActivity, departmentMood, departmentEngagementScore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HUB_CONEXAO_PROFILE = api;
})(typeof window !== 'undefined' ? window : globalThis);
