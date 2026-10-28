// Porte da parte pura de legado/js/conexao-store.js (HUB_CONEXAO_STORE).
//
// Fica aqui: o estado vazio (blank), a montagem do estado a partir das linhas
// que a RPC conexao_state/conexao_save devolve (trecho puro de accept) e o
// cálculo do lote de mudanças com a revisão de cada registro (trecho puro de
// mutate). As expressões são as do legado; só foram tiradas de dentro de
// accept()/mutate() para funções próprias.
//
// Fora do porte (acesso a dados/estado de sessão — ver ACESSO-A-DADOS.md):
// load() e mutate() (sb.rpc 'conexao_state' e 'conexao_save', tratamento do
// erro 40001, trava `busy`, `pending`), a checagem de troca de usuário
// (window.HUB_USER), o cache em memória (cache/owner/revisions/loadedAt), read(),
// ready() e o recarregamento no evento focus (document/window).
import { settings } from '@/lib/calculos/conexao-core';
import type { Linha } from '@/lib/calculos/utils';

export const kinds = ['sessions', 'events', 'executions', 'reports', 'committees', 'actions', 'observations', 'fits'];

export const blank = (): Linha => ({ version: 1, windowPolicy: 2, launchPolicy: 1, cohortPolicy: 1, config: settings(), ...Object.fromEntries(kinds.map(k => [k, []])) });

/** Linha devolvida por conexao_state/conexao_save: { kind, id, data, revision }. */
export interface RegistroConexao { kind: string; id: string; data: Linha; revision: number }

/** Mudança enviada a conexao_save: revisão que o cliente viu (0 = registro novo). */
export interface MudancaConexao { kind: string; id: string; data: Linha; revision: number }

// Trecho puro de accept(rows, user): monta o estado e o mapa de revisões.
// (O accept do legado também conferia window.HUB_USER e gravava o cache.)
export function estadoDe(rows: RegistroConexao[]): { state: Linha; versions: Map<string, number> } {
  const state = blank(), versions = new Map<string, number>();
  for (const row of rows) { versions.set(row.kind + ':' + row.id, row.revision); if (row.kind === 'config') state.config = settings(row.data); else if (kinds.includes(row.kind)) state[row.kind].push(row.data); }
  state.savedAt = JSON.stringify(rows.map(r => [r.kind, r.id, r.revision]));
  return { state, versions };
}

export const recordId = (kind: string, row: Linha): string => kind === 'executions' ? row.session : row.id;

// Trecho puro de mutate(fn): compara o estado anterior com o novo (já alterado
// por fn) e devolve o lote de mudanças. Lança os mesmos erros do legado.
export function mudancas(previous: Linha, next: Linha, revisions: Map<string, number>): MudancaConexao[] {
  const changes: MudancaConexao[] = [];
  if (JSON.stringify(previous.config) !== JSON.stringify(next.config)) changes.push({ kind: 'config', id: 'global', data: next.config, revision: revisions.get('config:global') || 0 });
  for (const kind of kinds) {
    const old = new Map<string, Linha>((previous[kind] as Linha[]).map(r => [recordId(kind, r), r])), ids = new Set<string>();
    for (const row of next[kind] as Linha[]) { const id = recordId(kind, row); if (!id || ids.has(id)) throw Error('Registro sem identificação única.'); ids.add(id); if (JSON.stringify(old.get(id)) !== JSON.stringify(row)) changes.push({ kind, id, data: row, revision: revisions.get(kind + ':' + id) || 0 }); }
    if ([...old.keys()].some(id => !ids.has(id))) throw Error('O histórico não pode ser excluído. Cancele ou retifique o registro.');
  }
  return changes;
}

export const id = (): string => crypto.randomUUID();
