// legado/test/conexao-store.test.cjs NÃO foi portado: as 11 verificações de lá
// exercitam load()/mutate() contra um sb.rpc falso (confirmação remota, falha
// de gravação, trava de concorrência, conflito 40001 com recarga, troca de
// sessão) — é o acesso a dados que fica para a server action.
//
// Os casos abaixo são NOVOS (não vêm do legado): cobrem só a parte pura que
// foi extraída de accept()/mutate() para conexao-store.ts.
import assert from 'node:assert/strict';
import * as S from '@/lib/calculos/conexao-store';
import { settings } from '@/lib/calculos/conexao-core';

const remoto: S.RegistroConexao[] = [
  { kind: 'actions', id: 'action-a', data: { id: 'action-a', title: 'Original' }, revision: 2 },
  { kind: 'config', id: 'global', data: { capacity: 6 }, revision: 1 },
  { kind: 'desconhecido', id: 'x', data: { id: 'x' }, revision: 1 }
];

test('estado montado a partir das linhas da RPC, com revisões e configuração validada', () => {
  const { state, versions } = S.estadoDe(remoto);
  assert.deepEqual(state.actions, [{ id: 'action-a', title: 'Original' }]);
  assert.deepEqual(state.config, settings({ capacity: 6 }));
  assert.equal(state.desconhecido, undefined);
  assert.equal(versions.get('actions:action-a'), 2);
  assert.equal(state.savedAt, JSON.stringify([['actions', 'action-a', 2], ['config', 'global', 1], ['desconhecido', 'x', 1]]));
});

test('mudança leva a revisão que o cliente viu; registro novo vai com 0', () => {
  const { state, versions } = S.estadoDe(remoto);
  const next = structuredClone(state);
  next.actions[0].title = 'Alterado';
  next.events.push({ id: 'ev-1' });
  // Ordem do lote = ordem de `kinds` (events vem antes de actions). Compara por
  // JSON: structuredClone cria objetos de outro realm dentro do Jest.
  assert.equal(JSON.stringify(S.mudancas(state, next, versions)), JSON.stringify([
    { kind: 'events', id: 'ev-1', data: { id: 'ev-1' }, revision: 0 },
    { kind: 'actions', id: 'action-a', data: { id: 'action-a', title: 'Alterado' }, revision: 2 }
  ]));
  assert.deepEqual(S.mudancas(state, structuredClone(state), versions), []);
});

test('excluir histórico ou repetir id é recusado; execução usa a turma como id', () => {
  const { state, versions } = S.estadoDe(remoto);
  assert.throws(() => S.mudancas(state, { ...structuredClone(state), actions: [] }, versions), /histórico/);
  const dup = structuredClone(state); dup.events.push({ id: 'e' }, { id: 'e' });
  assert.throws(() => S.mudancas(state, dup, versions), /identificação única/);
  assert.equal(S.recordId('executions', { id: 'x', session: 'turma-1' }), 'turma-1');
});
