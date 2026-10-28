// Porte de legado/test/conexao-experiencia.test.cjs (mesmos casos, dados e valores).
// O legado rodava metrics-experiencia.js com window.HUB_DATA = { colaboradores: [] };
// aqui o mesmo HUB_DATA vai como parâmetro `dados`.
import assert from 'node:assert/strict';
import * as X from '@/lib/calculos/conexao-experiencia';
import * as M from '@/lib/calculos/metrics-experiencia';
import type { Linha } from '@/lib/calculos/utils';

let registradas = 0;
const verificacao = (nome: string, fn: () => void) => { registradas++; test(nome, fn); };

const dados = { colaboradores: [] };
const notes = (n: number) => Object.fromEntries(M.CORE.map(c => [c, n]));
const identity = { cpf: '01234567890', admission: '2026-01-01' };
const row: Linha = { cpf: '01234567890', data_admissao: '2026-01-01', status_gestor: 'concluida', status_auto: 'concluida', notas_gestor: notes(3), notas_auto: notes(4), martelo: 4, data_avaliacao: '2026-02-10' };
verificacao('nota final usa exatamente os pesos do módulo AVE', () => { const r = X.summarize([row], identity, 45, M, dados); assert.ok(Math.abs(r.score - 3.15) < 1e-10); assert.equal(r.decision, 'Aprovado SEM ressalvas'); });
verificacao('sem autoavaliação usa somente nota do gestor e informa limitação', () => { const r = X.summarize([{ ...row, notas_auto: {}, status_auto: 'pendente' }], identity, 45, M, dados); assert.equal(r.score, 3); assert.equal(r.partial, true); });
verificacao('sem nota do gestor não inventa resultado com autoavaliação', () => assert.equal(X.summarize([{ ...row, notas_gestor: {} }], identity, 45, M, dados).score, null));
verificacao('rascunho do gestor não aparece como resultado final', () => { const r = X.summarize([{ ...row, status_gestor: 'rascunho' }], identity, 45, M, dados); assert.equal(r.score, null); assert.equal(r.decision, 'Decisão ainda não finalizada'); });
verificacao('marcador inválido não vira nota', () => { const r = X.summarize([{ ...row, notas_gestor: notes(-4334) }], identity, 45, M, dados); assert.equal(r.score, null); });
verificacao('readmissão não mistura avaliações', () => assert.equal(X.summarize([{ ...row, data_admissao: '2025-01-01' }], identity, 45, M, dados).state, 'missing'));
verificacao('duplicidade exige validação', () => assert.equal(X.summarize([row, { ...row }], identity, 45, M, dados).state, 'ambiguous'));
verificacao('CPF vazio não associa por nome', () => assert.equal(X.summarize([row], { ...identity, cpf: null }, 45, M, dados).state, 'identity'));
verificacao('histórico antigo independe de qualquer período da tela', () => { const r = X.summarize([row], { ...identity, start: '2026-10-01', end: '2026-10-31' }, 45, M, dados); assert.equal(r.state, 'found'); assert.equal(r.managerDate, '2026-02-10'); });
verificacao('cálculo não modifica registro original da integração', () => { const source: Linha = { ...row }; X.summarize([source], identity, 45, M, dados); assert.equal(source._d, undefined); });

test('10 verificações (mesma contagem do legado)', () => expect(registradas).toBe(10));
