// Porte de legado/js/conexao-profile.js (HUB_CONEXAO_PROFILE).
//
// Ficha do colaborador no Conexão RH: feedbacks e celebrações nominais do
// vínculo atual, humor e nota de engajamento do departamento. Módulo puro: as
// listas (colaboradores, feedbacks, celebrações, humor_mensal,
// engajamento_notas) já chegam como parâmetro, como no legado.
import * as C from '@/lib/calculos/conexao-core';
import type { Linha } from '@/lib/calculos/utils';

const same = (a: unknown, b: unknown) => !!C.norm(a) && C.norm(a) === C.norm(b);
const afterAdmission = (row: Linha, employee: Linha) => !!C.date(row.data) && row.data >= employee.admission;
const sameDepartment = (row: Linha, employee: Linha) => same(row.unidade, employee.unit) && same(row.departamento, employee.department);
const recipients = (value: unknown) => String(value || '').split(/[,;|\n]+/).map(C.norm).filter(Boolean);

export function personalActivity(employee: Linha, collaborators: Linha[] | null | undefined, feedbacks: Linha[] | null | undefined, celebrations: Linha[] | null | undefined): Linha {
  const names = new Set([employee.name].map(C.norm));
  const matches = (collaborators || []).filter(row => names.has(C.norm(row.nome_completo || row.nome)));
  const current = matches.find(row => String(row.id) === String(employee.id) && C.date(row.data_admissao) === employee.admission);
  if (!current) {
    return { ambiguous: true, receivedFeedback: [], sentFeedback: [], receivedCelebrations: [], sentCelebrations: [] };
  }
  const name = C.norm(employee.name);
  const feedback = (feedbacks || []).filter(row => afterAdmission(row, employee));
  const celebrationsAfter = (celebrations || []).filter(row => afterAdmission(row, employee));
  const byDate = (a: Linha, b: Linha) => String(b.data || '').localeCompare(String(a.data || ''));
  return {
    ambiguous: false,
    receivedFeedback: feedback.filter(row => C.norm(row.para) === name && sameDepartment(row, employee)).sort(byDate),
    sentFeedback: feedback.filter(row => C.norm(row.de) === name && sameDepartment(row, employee)).sort(byDate),
    receivedCelebrations: celebrationsAfter.filter(row => recipients(row.colaboradores_receberam).includes(name) && sameDepartment(row, employee)).sort(byDate),
    sentCelebrations: celebrationsAfter.filter(row => C.norm(row.colaborador_enviou) === name && sameDepartment(row, employee)).sort(byDate)
  };
}

export function departmentMood(employee: Linha, rows: Linha[] | null | undefined, period: Linha = {}): { people: number; records: number; average: number | null } | null {
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

export function departmentEngagementScore(employee: Linha, rows: Linha[] | null | undefined, period: Linha = {}): { answers: number; average: number | null } | null {
  const selected = (rows || []).filter(row => (!period.start || row.dia >= period.start) && (!period.end || row.dia <= period.end)
    && same(row.unidade, employee.unit) && same(row.departamento, employee.department) && C.norm(row.dimensao) !== 'nps');
  if (!selected.length) return null;
  const answers = selected.reduce((sum, row) => sum + (Number(row.n) || 0), 0);
  const total = selected.reduce((sum, row) => sum + (Number(row.soma) || 0), 0);
  const minimumRespondents = Math.max(...selected.map(row => Number(row.n) || 0));
  return { answers, average: minimumRespondents >= 3 && answers ? total / answers : null };
}
