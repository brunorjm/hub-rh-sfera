// Porte de legado/test/conexao-launch.test.cjs (mesmos casos, dados e valores).
import assert from 'node:assert/strict';
import * as C from '@/lib/calculos/conexao-core';
import type { Linha } from '@/lib/calculos/utils';

let registradas = 0;
const verificacao = (nome: string, fn: () => void) => { registradas++; test(nome, fn); };

const launch = '2026-10-21';
const config = { milestones: [30, 75, 120], launchDate: launch, maxEligibleAge: 140 };
const row = (age: number, id = 1) => ({ id, nome: 'Pessoa de teste', situacao: 'Ativo', data_admissao: C.add(launch, -age) });
function queue(age: number, options: Linha = {}, events: Linha[] = [], reference = launch, filters: Linha = {}) { return C.launchQueue(C.build([row(age)], { ...config, ...options }, reference, events), filters); }
for (const [age, milestone] of [[20, 30], [30, 30], [40, 30], [65, 30], [75, 30], [85, 30], [110, 30], [120, 30], [130, 120]]) verificacao(`${age} dias: uma etapa no marco ${milestone}`, () => { const q = queue(age).queue; assert.equal(q.length, 1); assert.equal(q[0].milestone, milestone); assert.equal(q[0].timing, 'apto'); assert.equal(q[0].operation, 'convocar'); });
verificacao('marco antigo ultrapassado entra no 30 inicial sem dívida retroativa', () => { const q = queue(50).queue; assert.equal(q.length, 1); assert.equal(q[0].milestone, 30); assert.notEqual(q[0].timing, 'atrasado'); });
verificacao('a entrada inicial de 30 prevalece sobre marcos adicionais', () => assert.equal(queue(36, { milestones: [30, 38, 120] }).queue[0].milestone, 30));
verificacao('turma anterior é preservada e sinalizada para revisão', () => { const e = row(130), session = { id: 'old', milestone: 30, date: C.add(launch, 2), participants: [e.id + '@' + e.data_admissao] }; const model = C.build([e], config, launch, [], [session]); const q = C.launchQueue(model).queue; assert.equal(q[0].milestone, 120); assert.equal(q[0].previousSession.id, 'old'); assert.equal(model.sessions.length, 1); });
verificacao('antes do primeiro marco exibe aproximação', () => assert.equal(queue(18).queue[0].timing, 'proximo'));
for (const age of [131, 135, 140]) verificacao(`${age} dias: recuperação inicial no marco 120`, () => { const q = queue(age).queue; assert.equal(q.length, 1); assert.equal(q[0].milestone, 120); assert.equal(q[0].initialRecovery, true); assert.equal(q[0].timing, 'apto'); });
verificacao('141 dias não é elegível', () => { const q = queue(141); assert.equal(q.queue.length, 0); assert.equal(q.excluded.length, 1); });
verificacao('vínculo antigo continua fora ao consultar passado', () => assert.equal(queue(200, {}, [], launch, { start: '2026-01-01', end: '2026-10-31' }).queue.length, 0));
verificacao('recuperação só existe para a coorte inicial', () => assert.equal(queue(130, {}, [], C.add(launch, 5)).queue[0].initialRecovery, false));
verificacao('ultrapassou 140 dias depois do lançamento: sai da elegibilidade', () => assert.equal(queue(140, {}, [], C.add(launch, 1)).queue.length, 0));
verificacao('janela aberta cruza o período mesmo que data-alvo seja anterior', () => assert.equal(queue(35, {}, [], launch, { start: launch, end: launch }).queue.length, 1));
verificacao('período anterior ao lançamento não gera fila histórica', () => assert.equal(queue(35, {}, [], launch, { start: '2026-01-01', end: '2026-10-20' }).queue.length, 0));
verificacao('participação avança para o próximo marco, sem cobrar anteriores', () => { const e = row(30), key = e.id + '@' + e.data_admissao + ':30'; const q = queue(30, {}, [{ stage: key, date: launch, type: 'presente', created: launch + 'T14:00:00Z' }]).queue; assert.equal(q.length, 1); assert.equal(q[0].milestone, 75); });
verificacao('sem recuperação, 131 dias fica fora das janelas', () => assert.equal(queue(131, { initialRecovery: false }).queue.length, 0));
verificacao('filtro por operação continua aplicado à implantação', () => assert.equal(queue(30, {}, [], launch, { unidade: ['Hering'] }).queue.length, 0));
verificacao('agendamento respeita corte de 140 na data da turma', () => { const employee = C.build([row(135)], config, launch).employees[0]; const errors = C.sessionConflicts({ id: 'test', milestone: 120, date: C.add(launch, 7), time: '14:00', duration: 45, facilitator: 'RH teste', participants: [employee.key] }, [], config, [employee]); assert.ok(errors.some(x => x.includes('140'))); });
const person = { key: 'employee', unit: 'Hering', department: 'Loja teste', manager: 'Gestor teste', name: 'Pessoa teste' };
const future = { id: 'future', date: '2026-10-28', participants: ['employee'] };
verificacao('turma futura aparece como fora do período, não como inexistente', () => { const s = C.scopeSessions([future], [person], { start: '2026-10-01', end: '2026-10-21' }); assert.equal(s.visible.length, 0); assert.equal(s.outsidePeriod.length, 1); assert.equal(s.matching.length, 1); });
verificacao('ampliar o período revela a turma preservada', () => assert.equal(C.scopeSessions([future], [person], { end: '2026-10-28' }).visible[0].id, 'future'));
verificacao('alerta de fora do período respeita a unidade selecionada', () => assert.equal(C.scopeSessions([future], [person], { unidade: ['Levis'], end: '2026-10-21' }).outsidePeriod.length, 0));
verificacao('turma sem colaborador no cadastro atual não aparece na agenda nem no alerta de período', () => { const result = C.scopeSessions([future], [], { end: '2026-10-21' }); assert.equal(result.visible.length, 0); assert.equal(result.matching.length, 0); assert.equal(result.outsidePeriod.length, 0); });
verificacao('turma com lista vazia não aparece, mesmo sem filtro pessoal', () => assert.equal(C.scopeSessions([{ ...future, participants: [] }], [person], { end: '2026-10-31' }).visible.length, 0));
verificacao('turma com parte dos colaboradores no cadastro continua visível', () => assert.equal(C.scopeSessions([{ ...future, participants: ['missing', person.key] }], [person], { end: '2026-10-31' }).visible.length, 1));

test('32 verificações (mesma contagem do legado)', () => expect(registradas).toBe(32));
