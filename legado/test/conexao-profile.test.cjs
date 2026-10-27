const assert = require('node:assert/strict');
const P = require('../js/conexao-profile.js');
const employee = { id: 1, key: '1@2026-09-01', admission: '2026-09-01', name: 'Ana Beatriz da Silva', unit: 'Boticário - Rio de Janeiro', department: 'Loja Norte' };
const collaborators = [{ id: 1, nome_completo: employee.name, data_admissao: employee.admission, cpf: '12345678901' }];
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('OK ' + name); }

test('feedback recebido exige vínculo no Headcount, unidade e departamento', () => {
  const rows = [
    { para: employee.name, de: 'Gestora', data: '2026-10-01', unidade: employee.unit, departamento: employee.department },
    { para: employee.name, de: 'Outra pessoa', data: '2026-10-02', unidade: employee.unit, departamento: 'Outra loja' },
    { para: employee.name, de: 'Gestora', data: '2026-08-01', unidade: employee.unit, departamento: employee.department }
  ];
  const result = P.personalActivity(employee, collaborators, rows, []);
  assert.equal(result.ambiguous, false);
  assert.equal(result.receivedFeedback.length, 1);
});
test('nome no Headcount atual, unidade e data delimitam o registro nominal', () => {
  const duplicated = collaborators.concat({ id: 2, nome_completo: employee.name, data_admissao: '2026-10-01', cpf: '99999999999' });
  const result = P.personalActivity(employee, duplicated, [
    { para: employee.name, data: '2026-10-01', unidade: employee.unit, departamento: employee.department },
    { para: employee.name, data: '2026-10-01', unidade: 'Outra unidade', departamento: employee.department }
  ], []);
  assert.equal(result.ambiguous, false);
  assert.equal(result.receivedFeedback.length, 1);
});
test('vínculos históricos não bloqueiam a ficha atual', () => {
  const history = collaborators.concat({ id: 2, nome_completo: employee.name, data_admissao: '2025-01-01', cpf: '123.456.789-01' });
  const result = P.personalActivity(employee, history, [{ para: employee.name, data: '2026-10-01', unidade: employee.unit, departamento: employee.department }], []);
  assert.equal(result.ambiguous, false);
  assert.equal(result.receivedFeedback.length, 1);
});
test('vínculo ausente do Headcount não recebe registros por nome', () => {
  const result = P.personalActivity(employee, [], [{ para: employee.name, data: '2026-10-01' }], []);
  assert.equal(result.ambiguous, true);
  assert.equal(result.receivedFeedback.length, 0);
});
test('celebração para todos não vira celebração individual', () => {
  const rows = [
    { colaboradores_receberam: '@todos', colaborador_enviou: 'Gestora', data: '2026-10-01', unidade: employee.unit, departamento: employee.department },
    { colaboradores_receberam: 'Ana Beatriz da Silva; Outra Pessoa', colaborador_enviou: 'Gestora', data: '2026-10-02', unidade: employee.unit, departamento: employee.department }
  ];
  assert.equal(P.personalActivity(employee, collaborators, [], rows).receivedCelebrations.length, 1);
});
test('humor agrega meses do filtro e exige três pessoas ou mais', () => {
  const base = { mes: '2026-10-01', unidade: employee.unit, departamento: employee.department, registros: 8, soma: 32 };
  const older = { ...base, mes: '2026-09-01', registros: 2, soma: 2, pessoas: 4 };
  assert.equal(P.departmentMood(employee, [{ ...base, pessoas: 2 }], { start: '2026-10-01', end: '2026-10-31' }).average, null);
  assert.equal(P.departmentMood(employee, [{ ...base, pessoas: 4 }, older], { start: '2026-10-01', end: '2026-10-31' }).average, 4);
});
test('nota de engajamento pondera todas as respostas do período, sem dividir por pulso', () => {
  const period = { start: '2026-10-01', end: '2026-10-31' };
  const row = { dia: '2026-10-03', unidade: employee.unit, departamento: employee.department, dimensao: 'Cultura', soma: 12, n: 3 };
  const rows = [row, { ...row, dia: '2026-10-24', soma: 6, n: 3 }, { ...row, departamento: 'Outra loja', soma: 2 }, { ...row, dia: '2026-09-15', soma: 2 }, { ...row, dimensao: 'NPS', soma: 30 }];
  assert.equal(P.departmentEngagementScore(employee, [{ ...row, n: 2, soma: 8 }], period).average, null);
  assert.equal(P.departmentEngagementScore(employee, rows, period).average, 3);
});
console.log(`${passed} verificações da ficha aprovadas.`);
