// Porte de legado/js/metrics-satisfacao.js (HUB_METRICS_SATISFACAO).
//
// Motor de cálculo da Pesquisa de Satisfação com o Suporte do Escritório
// (Indicadores → Pesquisa de Satisfação). Não acessa o banco nem o DOM.
//
// Entrada: linhas de satisfacao_dados() — { pesquisa, area, nota, melhorar[],
// extra, comentario, unidade, departamento, chave, triagem, loja_liberada } — e
// os ciclos (satisfacao_ciclo).
//
// SIGILO: o banco já devolve só as áreas liberadas no perfil, sem loja para quem
// não tem a visão completa. recortar() repete a mesma regra no navegador para o
// "Visualizar como" (a sessão real é do Administrador, que recebe tudo).
//
// Globais: HUB_PERMISSIONS → parâmetro opcional `permissoes` de acessoDe (sem ele,
// vale o fallback do legado, que é a mesma regra de hasPerm); HUB_METRICS_BOLETIM
// → import de metrics-boletim.ts (o módulo sempre existe, como no legado carregado).
import * as U from '@/lib/calculos/utils';
import type { Linha } from '@/lib/calculos/utils';
import * as MBoletim from '@/lib/calculos/metrics-boletim';

/** Parte de HUB_PERMISSIONS usada aqui (legado/js/permissions.js). */
export interface Permissoes { hasPerm(user: Linha | null | undefined, key: string): boolean }

/** Índice área → ciclo → linhas (resultado de indexar). */
export interface IndiceSatisfacao {
  porArea: Map<string, Map<string, Linha[]>>;
  ciclos: string[];
  areas: string[];
}

const N = (s: unknown): string => U.normalizeText(s == null ? '' : s);

export const PERM = 'indicadores.satisfacao';
export const PERM_COMPLETO = 'indicadores.satisfacao_completo';

// Nota média (0 a 10).
export const FAIXAS = [
  { min: 9, id: 'otimo', rotulo: 'Ótimo', cor: '#0f8a4c', fundo: '#DDF5E8' },
  { min: 8, id: 'bom', rotulo: 'Bom', cor: '#1baf7a', fundo: '#EEF9F3' },
  { min: 7, id: 'atencao', rotulo: 'Atenção', cor: '#c98500', fundo: '#FFF6E0' },
  { min: -Infinity, id: 'critico', rotulo: 'Crítico', cor: '#d03b3b', fundo: '#FDECEC' }
];
// NPS (% notas 9-10 − % notas 0-6), zonas usuais.
export const ZONAS_NPS = [
  { min: 75, rotulo: 'Excelência', cor: '#0f8a4c' },
  { min: 50, rotulo: 'Qualidade', cor: '#1baf7a' },
  { min: 0, rotulo: 'Aperfeiçoamento', cor: '#c98500' },
  { min: -Infinity, rotulo: 'Crítica', cor: '#d03b3b' }
];
// Opções do "O que melhorar?" no formulário.
export const MELHORAR = ['Tempo de resposta', 'Tempo para resolução', 'Qualidade da solução', 'Educação e cordialidade'];
export const NADA = 'Nada a melhorar';
// Ordem das áreas (a do formulário); área nova entra no fim, em ordem alfabética.
// Compras vem dividido pela operação de quem respondeu (parsers-boletim.js, areaDaResposta).
export const ORDEM_AREAS = ['Financeiro', 'Compras O Boticário', 'Compras Hering e Levis', 'Recrutamento e Seleção', 'DHO', 'T&D', 'DP', 'TI', 'Manutenção', 'Auditoria', 'Administrativo', 'Marketing', 'Jurídico', 'Suprimentos Indiretos'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export const mesISO = (v: unknown): string => String(v || '').slice(0, 7);
export const rotuloMes = (m: unknown): string => { const [a, n] = mesISO(m).split('-'); return MESES[Number(n) - 1] + '/' + a.slice(2); };
export const rotuloMesLongo = (m: unknown): string => { const [a, n] = mesISO(m).split('-'); return MESES_LONGOS[Number(n) - 1] + ' de ' + a; };
// A pesquisa aplicada num mês avalia o MÊS ANTERIOR (a de set/26 avalia agosto/26).
export const mesReferencia = (m: unknown): string => { const [a, n] = mesISO(m).split('-').map(Number); return n === 1 ? (a - 1) + '-12' : a + '-' + String(n - 1).padStart(2, '0'); };
export const rotuloCiclo = (m: unknown): string => rotuloMes(m) + ' (ref. ' + rotuloMes(mesReferencia(m)) + ')';
export const rotuloCicloLongo = (m: unknown): string => { const [a, n] = mesISO(m).split('-'); const r = mesReferencia(m).split('-'); return 'Pesquisa de ' + MESES[Number(n) - 1] + '/' + a + ' · avalia ' + MESES_LONGOS[Number(r[1]) - 1] + '/' + r[0]; };
export const faixa = (v: number | null | undefined) => v == null ? null : FAIXAS.find(f => v >= f.min);
export const zonaNps = (v: number | null | undefined) => v == null ? null : ZONAS_NPS.find(z => v >= z.min);
export const fmtNota = (v: number | null | undefined): string => v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const fmtNps = (v: number | null | undefined): string => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v));
export const fmtVarNota = (v: number | null | undefined): string => v == null ? '' : (Math.abs(v) < 0.05 ? '= 0,0' : (v > 0 ? '▲ ' : '▼ ') + fmtNota(Math.abs(v)));
export const fmtVarNps = (v: number | null | undefined): string => v == null ? '' : (Math.round(v) === 0 ? '= 0' : (v > 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(v)));

export function ordenarAreas(areas: string[]): string[] {
  return Array.from(new Set(areas)).sort((a, b) => {
    const ia = ORDEM_AREAS.indexOf(a), ib = ORDEM_AREAS.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b, 'pt-BR');
  });
}

// ------------------------------------------------------------------
// Acesso (mesma regra de satisfacao_dados() no banco)
// ------------------------------------------------------------------
export function acessoDe(user: Linha | null | undefined, permissoes?: Permissoes | null) {
  const P = permissoes;
  const tem = (k: string) => P ? P.hasPerm(user, k) : !!(user && (user.perfil === 'admin' || (user.permissoes || {})[k] === true));
  const completo = tem(PERM_COMPLETO);
  const modulo = completo || tem(PERM);
  return { modulo, completo, areas: completo ? null : ((user && user.satisfacao_areas) || []).slice() };
}

// Triagem dos comentários (exceções marcadas por quem tem a visão completa).
// Sem marca, o comentário vai para a área sem a loja.
export const TRIAGEM: Record<string, { rotulo: string; acao: string; escondeDaArea: boolean }> = {
  ocultar: { rotulo: 'Oculto da área', acao: 'Ocultar da área', escondeDaArea: true },
  individual: { rotulo: 'Tratar individualmente', acao: 'Tratar individualmente (não vai para a área)', escondeDaArea: true },
  loja: { rotulo: 'Loja liberada para a área', acao: 'Liberar a loja para a área', escondeDaArea: false }
};
export const triagemDe = (r: Linha | null | undefined): string | null => (r && r.triagem && TRIAGEM[r.triagem]) ? r.triagem : null;

// Sem a visão completa: só as áreas liberadas, sem loja; comentário marcado como
// "ocultar" ou "individual" some (a nota fica), e o marcado como "loja" leva o
// nome da loja em loja_liberada. Mesma regra de satisfacao_dados() no banco.
export function recortar(respostas: Linha[], acesso: Linha | null | undefined): Linha[] {
  if (!acesso || !acesso.modulo) return [];
  if (acesso.completo) return respostas;
  const ok = new Set((acesso.areas as unknown[]).map(N));
  return respostas.filter(r => ok.has(N(r.area))).map(r => {
    const t = triagemDe(r);
    return Object.assign({}, r, {
      unidade: null, departamento: null, chave: null, triagem: null,
      comentario: t && TRIAGEM[t].escondeDaArea ? null : r.comentario,
      loja_liberada: r.loja_liberada || (t === 'loja' ? (r.departamento || r.unidade || null) : null)
    });
  });
}

// ------------------------------------------------------------------
// Estatísticas de um conjunto de respostas
// ------------------------------------------------------------------
export function stats(rows: Linha[]) {
  const dist: number[] = new Array(11).fill(0);
  const melhorar: Record<string, number> = {};
  let n = 0, soma = 0, prom = 0, det = 0, comMelhorar = 0;
  for (const r of rows) {
    const v = r.nota == null || r.nota === '' ? null : Number(r.nota);
    if (v != null && !isNaN(v)) {
      n++; soma += v;
      dist[Math.max(0, Math.min(10, Math.round(v)))]++;
      if (v >= 9) prom++; else if (v <= 6) det++;
    }
    const ops = r.melhorar || [];
    if (ops.length) comMelhorar++;
    for (const o of ops) melhorar[o] = (melhorar[o] || 0) + 1;
  }
  const media = n ? soma / n : null;
  const nps = n ? (prom - det) / n * 100 : null;
  // Principal ponto a melhorar: a opção (fora "Nada a melhorar") mais marcada.
  const pontos = Object.entries(melhorar).filter(([k]) => N(k) !== N(NADA)).sort((a, b) => b[1] - a[1]);
  return {
    respostas: rows.length, n, soma, media, nps, promotores: prom, detratores: det, neutros: n - prom - det,
    pctPromotores: n ? prom / n : null, pctDetratores: n ? det / n : null,
    dist, melhorar, comMelhorar, principal: pontos.length ? pontos[0][0] : null,
    pctNada: comMelhorar ? (melhorar[NADA] || 0) / comMelhorar : null
  };
}

// ------------------------------------------------------------------
// Índice: área → ciclo → linhas
// ------------------------------------------------------------------
export function indexar(respostas: Linha[]): IndiceSatisfacao {
  const porArea = new Map<string, Map<string, Linha[]>>();
  const ciclos = new Set<string>();
  for (const r of respostas) {
    const m = mesISO(r.pesquisa);
    if (!m) continue;
    ciclos.add(m);
    if (!porArea.has(r.area)) porArea.set(r.area, new Map());
    const pa = porArea.get(r.area) as Map<string, Linha[]>;
    if (!pa.has(m)) pa.set(m, []);
    (pa.get(m) as Linha[]).push(r);
  }
  return { porArea, ciclos: Array.from(ciclos).sort(), areas: ordenarAreas(Array.from(porArea.keys())) };
}

// Ciclo anterior em que a área foi avaliada.
function anteriorDa(idx: IndiceSatisfacao, area: string, ciclo: string): string | null {
  const pa = idx.porArea.get(area);
  if (!pa) return null;
  const antes = Array.from(pa.keys()).filter(m => m < ciclo).sort();
  return antes.length ? antes[antes.length - 1] : null;
}

export function resumoArea(idx: IndiceSatisfacao, area: string, ciclo: string) {
  const pa = idx.porArea.get(area) || new Map<string, Linha[]>();
  const atual = pa.has(ciclo) ? stats(pa.get(ciclo) as Linha[]) : null;
  const mAnt = anteriorDa(idx, area, ciclo);
  const ant = mAnt ? stats(pa.get(mAnt) as Linha[]) : null;
  return {
    area, ciclo, atual, anterior: ant, cicloAnterior: mAnt,
    varNota: atual && ant && atual.media != null && ant.media != null ? atual.media - ant.media : null,
    varNps: atual && ant && atual.nps != null && ant.nps != null ? atual.nps - ant.nps : null
  };
}

export function serieArea(idx: IndiceSatisfacao, area: string, ciclos: string[]) {
  const pa = idx.porArea.get(area) || new Map<string, Linha[]>();
  return ciclos.map(m => ({ ciclo: m, s: pa.has(m) ? stats(pa.get(m) as Linha[]) : null }));
}

// Visão geral do ciclo: ranking das áreas e números consolidados.
export function visaoGeral(idx: IndiceSatisfacao, ciclo: string, ciclosTab?: Linha[] | null) {
  const areas = idx.areas.map(a => resumoArea(idx, a, ciclo)).filter(x => x.atual && x.atual.n);
  const todas: Linha[] = [];
  for (const a of idx.areas) { const pa = idx.porArea.get(a) as Map<string, Linha[]>; if (pa.has(ciclo)) todas.push(...(pa.get(ciclo) as Linha[])); }
  const ant = idx.ciclos.filter(m => m < ciclo).pop() || null;
  const todasAnt: Linha[] = [];
  if (ant) for (const a of idx.areas) { const pa = idx.porArea.get(a) as Map<string, Linha[]>; if (pa.has(ant)) todasAnt.push(...(pa.get(ant) as Linha[])); }
  const geral = stats(todas), geralAnt = ant ? stats(todasAnt) : null;
  const tab = new Map<string, Linha>((ciclosTab || []).map(c => [mesISO(c.pesquisa), c]));
  const cAt = tab.get(ciclo) || null, cAnt = ant ? tab.get(ant) || null : null;
  // O NPS é o indicador principal: o ranking segue ele (a nota desempata).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- atual existe (filtrado acima); nps/media nulos entram como no legado
  const ranking = areas.slice().sort((a, b) => (b.atual as any).nps - (a.atual as any).nps || (b.atual as any).media - (a.atual as any).media);
  return {
    ciclo, cicloAnterior: ant, areas: ranking, geral, geralAnterior: geralAnt,
    varNota: geralAnt && geral.media != null && geralAnt.media != null ? geral.media - geralAnt.media : null,
    varNps: geralAnt && geral.nps != null && geralAnt.nps != null ? geral.nps - geralAnt.nps : null,
    respondentes: cAt ? cAt.respondentes : null,
    respondentesAnt: cAnt ? cAnt.respondentes : null,
    aptos: cAt ? cAt.aptos : null,
    participacao: cAt && cAt.aptos ? Math.min(1, cAt.respondentes / cAt.aptos) : null,
    melhor: ranking[0] || null, pior: ranking.length > 1 ? ranking[ranking.length - 1] : null
  };
}

// Mapa de calor: área × ciclo (nota média e n).
export function mapaCalor(idx: IndiceSatisfacao, ciclos: string[]) {
  return idx.areas.map(a => ({ area: a, celulas: serieArea(idx, a, ciclos) }));
}

// ------------------------------------------------------------------
// Recortes da visão completa (exigem unidade/departamento)
// ------------------------------------------------------------------
function operacaoDe(r: Linha): { id: string; nome: string } {
  const MB = MBoletim;
  const id = MB ? MB.operacaoDe(r.unidade, r.departamento) : null;
  const op = id && MB.OP_POR_ID ? MB.OP_POR_ID.get(id) : null;
  return { id: id || 'outras', nome: op ? op.nome : (r.unidade || 'Sem unidade') };
}

// [{ id, nome, s }] por operação, para uma área (ou todas, area = null) no ciclo.
export function porOperacao(respostas: Linha[], ciclo: string, area: string | null | undefined) {
  const g = new Map<string, { id: string; nome: string; rows: Linha[] }>();
  for (const r of respostas) {
    if (mesISO(r.pesquisa) !== ciclo || (area && r.area !== area) || r.unidade == null) continue;
    const op = operacaoDe(r);
    if (!g.has(op.id)) g.set(op.id, { id: op.id, nome: op.nome, rows: [] });
    (g.get(op.id) as { rows: Linha[] }).rows.push(r);
  }
  const MB = MBoletim;
  const ordem: string[] = MB ? MB.OPERACOES.map(o => o.id) : [];
  return Array.from(g.values()).map(x => ({ id: x.id, nome: x.nome, s: stats(x.rows) }))
    .sort((a, b) => ((ordem.indexOf(a.id) + 1) || 99) - ((ordem.indexOf(b.id) + 1) || 99) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

// Matriz operação × área no ciclo (nota média e n).
export function matrizOperacoes(respostas: Linha[], ciclo: string, areas: string[]) {
  const ops = porOperacao(respostas, ciclo, null);
  return ops.map(o => ({
    id: o.id, nome: o.nome, total: o.s,
    areas: areas.map(a => stats(respostas.filter(r => mesISO(r.pesquisa) === ciclo && r.area === a && r.unidade != null && operacaoDe(r).id === o.id)))
  }));
}

export function porLoja(respostas: Linha[], ciclo: string, area: string) {
  const g = new Map<string, Linha>();
  for (const r of respostas) {
    if (mesISO(r.pesquisa) !== ciclo || r.area !== area || r.unidade == null) continue;
    const k = (r.unidade || '') + '\u0001' + (r.departamento || '');
    if (!g.has(k)) g.set(k, { unidade: r.unidade, departamento: r.departamento, operacao: operacaoDe(r).nome, rows: [] });
    (g.get(k) as Linha).rows.push(r);
  }
  return Array.from(g.values()).map(x => ({ unidade: x.unidade, departamento: x.departamento, operacao: x.operacao, s: stats(x.rows) }))
    .sort((a, b) => (a.s.media == null ? 99 : a.s.media) - (b.s.media == null ? 99 : b.s.media) || String(a.departamento).localeCompare(String(b.departamento), 'pt-BR'));
}

// ------------------------------------------------------------------
// Comentários
// ------------------------------------------------------------------
// "." / "ok" / "nada a declarar" / "sem comentários" e afins: sem conteúdo.
const VAZIO_RE = /^(nada|nenhum|nenhuma|sem|tudo ok|ok|bom|boa|bons|otimo|otima|otimos|otimas|n a|na|nao|nada de negativo|neutra|indiferente)( (a|de|para|ha|com))?( (declarar|comentar|comentario|comentarios|melhorar|melhoras|falar|reclamar|acrescentar|objecao|objecoes|ressalva|ressalvas|dizer))?$/;
export function comentarioVazio(s: unknown): boolean {
  const t = N(s).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.replace(/[^a-z]/g, '').length < 3) return true;
  return VAZIO_RE.test(t);
}

export function comentarios(respostas: Linha[], ciclo: string, area: string, opts?: Linha | null) {
  opts = opts || {};
  const o = opts;
  const busca = N(o.busca || '');
  return respostas
    .filter(r => mesISO(r.pesquisa) === ciclo && r.area === area && r.comentario)
    .filter(r => o.todos || !comentarioVazio(r.comentario))
    .filter(r => !busca || N(r.comentario).includes(busca))
    .filter(r => !o.soTriados || triagemDe(r))
    .map(r => ({
      nota: r.nota == null ? null : Number(r.nota), melhorar: r.melhorar || [], comentario: r.comentario,
      operacao: r.unidade != null ? operacaoDe(r).nome : null, sinal: sinalDe(r),
      // Visão completa: a loja de quem escreveu, a chave e a marca da triagem.
      // Responsável da área: a loja só quando o DHO liberou.
      loja: r.unidade != null || r.departamento != null ? (r.departamento || r.unidade) : (r.loja_liberada || null),
      lojaLiberada: r.unidade == null && r.departamento == null && !!r.loja_liberada,
      chave: r.chave || null, triagem: triagemDe(r)
    }))
    .sort((a, b) => o.ordem === 'maior'
      ? (b.nota == null ? -1 : b.nota) - (a.nota == null ? -1 : a.nota)
      : (a.nota == null ? 99 : a.nota) - (b.nota == null ? 99 : b.nota));
}

// Compras: "Quantas reuniões o time realizou com você este mês?"
export function distribuicaoExtra(rows: Linha[]): [string, number][] {
  const c: Record<string, number> = {};
  for (const r of rows) if (r.extra) c[r.extra] = (c[r.extra] || 0) + 1;
  const ordem = ['0 reuniões', '1 reunião', '2 reuniões', '3 reuniões ou mais', 'Não sei / Não se aplica'];
  return Object.entries(c).sort((a, b) => ((ordem.indexOf(a[0]) + 1) || 99) - ((ordem.indexOf(b[0]) + 1) || 99));
}

// ------------------------------------------------------------------
// NPS como indicador principal: leituras de apoio
// ------------------------------------------------------------------
export const CICLOS_ACUMULADO = 3;

// Quanto UMA resposta move o NPS: detrator → neutro (ou neutro → promotor) = 100/n
// pontos; detrator → promotor = 200/n. Variação menor que isso é uma loja só.
export function pesoResposta(n: number) { return n ? { umPasso: 100 / n, doisPassos: 200 / n } : null; }

// NPS acumulado: junta as respostas dos últimos k ciclos em que a área foi
// avaliada (até o ciclo escolhido). Com o triplo de respostas, oscila bem menos.
export function acumulado(idx: IndiceSatisfacao, area: string, ciclo: string, k?: number) {
  const pa = idx.porArea.get(area);
  if (!pa) return null;
  const ms = Array.from(pa.keys()).filter(m => m <= ciclo).sort().slice(-(k || CICLOS_ACUMULADO));
  return ms.length ? { ciclos: ms, s: stats(ms.flatMap(m => pa.get(m) as Linha[])) } : null;
}
export function acumuladoGeral(idx: IndiceSatisfacao, ciclo: string, k?: number) {
  const ms = idx.ciclos.filter(m => m <= ciclo).slice(-(k || CICLOS_ACUMULADO));
  if (!ms.length) return null;
  const rows: Linha[] = [];
  for (const a of idx.areas) { const pa = idx.porArea.get(a) as Map<string, Linha[]>; for (const m of ms) if (pa.has(m)) rows.push(...(pa.get(m) as Linha[])); }
  return { ciclos: ms, s: stats(rows) };
}

// Tendência: três variações seguidas do NPS na mesma direção (4 ciclos avaliados).
// Recebe os NPS em ordem cronológica (null = ciclo sem avaliação, ignorado).
export function tendencia(valores: (number | null | undefined)[] | null | undefined): string | null {
  const v = (valores || []).filter(x => x != null).map(x => Math.round(x as number)).slice(-4);
  if (v.length < 4) return null;
  const d = [v[1] - v[0], v[2] - v[1], v[3] - v[2]];
  return d.every(x => x > 0) ? 'subindo' : d.every(x => x < 0) ? 'caindo' : null;
}
export function tendenciaArea(idx: IndiceSatisfacao, area: string, ciclo: string): string | null {
  const pa = idx.porArea.get(area);
  if (!pa) return null;
  return tendencia(Array.from(pa.keys()).filter(m => m <= ciclo).sort().map(m => stats(pa.get(m) as Linha[]).nps));
}
export function tendenciaGeral(idx: IndiceSatisfacao, ciclo: string): string | null {
  return tendencia(idx.ciclos.filter(m => m <= ciclo).map(m => stats(idx.areas.flatMap(a => (idx.porArea.get(a) as Map<string, Linha[]>).get(m) || [])).nps));
}

// ------------------------------------------------------------------
// Mesmas lojas: comparação só com quem respondeu nos dois ciclos (visão completa)
// ------------------------------------------------------------------
const chaveLoja = (r: Linha): string | null => r.unidade == null && r.departamento == null ? null : N(r.unidade) + '\u0001' + N(r.departamento);

// area = null → todas as áreas. Devolve null sem loja (perfil sem a visão completa)
// ou sem nenhuma loja em comum.
export function mesmasLojas(respostas: Linha[], ciclo: string, cicloAnt: string | null | undefined, area: string | null | undefined) {
  if (!cicloAnt) return null;
  const at = new Set<string>(), an = new Set<string>(), rowsAt: Linha[] = [], rowsAn: Linha[] = [];
  for (const r of respostas) {
    if (area && r.area !== area) continue;
    const m = mesISO(r.pesquisa);
    if (m !== ciclo && m !== cicloAnt) continue;
    const k = chaveLoja(r);
    if (!k) continue;
    if (m === ciclo) { at.add(k); rowsAt.push(r); } else { an.add(k); rowsAn.push(r); }
  }
  const ambos = new Set(Array.from(at).filter(k => an.has(k)));
  if (!ambos.size) return null;
  const a = stats(rowsAt.filter(r => ambos.has(chaveLoja(r) as string))), b = stats(rowsAn.filter(r => ambos.has(chaveLoja(r) as string)));
  return {
    lojas: ambos.size, lojasAtual: at.size, lojasAnterior: an.size, entraram: at.size - ambos.size, sairam: an.size - ambos.size,
    atual: a, anterior: b,
    varNota: a.media != null && b.media != null ? a.media - b.media : null,
    varNps: a.nps != null && b.nps != null ? a.nps - b.nps : null
  };
}

// ------------------------------------------------------------------
// Respostas para conferir (a nota pode não medir o serviço)
// ------------------------------------------------------------------
export const SINAIS: Record<string, string> = {
  incoerente: 'Nota de 0 a 6 marcando só "Nada a melhorar"',
  pouco_contato: 'Diz ter pouco ou nenhum contato com a área'
};
const POUCO_CONTATO_RE = /(pouco|nenhum|quase nao tenho|nao tenho|nao tenho (muito|tanto)|nao tive|sem) contato|nao utiliz|nao uso\b|nunca (utilizei|usei|precisei)|nao (tive|tivemos|houve) necessidade|nao precisei|desconhec/;
const notaDe = (r: Linha): number | null => (r.nota == null || r.nota === '' || isNaN(Number(r.nota))) ? null : Number(r.nota);
export function sinalDe(r: Linha): string | null {
  const v = notaDe(r);
  const ops = r.melhorar || [];
  // O comentário explica mais que a nota: 'não utilizo' vem antes da incoerência.
  if (r.comentario && POUCO_CONTATO_RE.test(N(r.comentario))) return 'pouco_contato';
  if (v != null && v <= 6 && ops.length && ops.every((o: unknown) => N(o) === N(NADA))) return 'incoerente';
  return null;
}
// Avaliações sinalizadas no ciclo, menor nota primeiro. Com loja só na visão completa.
export function sinalizadas(respostas: Linha[], ciclo: string, area?: string | null) {
  const out: Linha[] = [];
  for (const r of respostas) {
    if (mesISO(r.pesquisa) !== ciclo || (area && r.area !== area)) continue;
    const sinal = sinalDe(r);
    if (!sinal) continue;
    out.push({
      area: r.area, nota: notaDe(r), sinal, motivo: SINAIS[sinal], comentario: r.comentario || null,
      loja: r.unidade != null || r.departamento != null ? (r.departamento || r.unidade) : null,
      operacao: r.unidade != null ? operacaoDe(r).nome : null
    });
  }
  return out.sort((a, b) => (a.nota == null ? 99 : a.nota) - (b.nota == null ? 99 : b.nota) || a.area.localeCompare(b.area, 'pt-BR'));
}
// Simulação: os mesmos dados sem as avaliações sinalizadas (em todos os ciclos, para a variação continuar comparável).
export function semSinalizadas(respostas: Linha[]): Linha[] { return respostas.filter(r => !sinalDe(r)); }

// ------------------------------------------------------------------
// Onde está a insatisfação: lojas que concentram as notas de 0 a 6 (visão completa)
// ------------------------------------------------------------------
export const LIMITE_LOJA = 6.5;       // média da loja em todas as áreas abaixo disso = loja crítica
const CICLOS_RECORRENTE = 3;   // crítica em 3 ou mais ciclos da janela = recorrente
const SUSPEITAS_LOJA = 3;      // 3+ avaliações sinalizadas na mesma loja = conferir as notas com ela

// ciclosJanela: ciclos (em ordem) para o histórico de cada loja, terminando no ciclo escolhido.
export function lojasInsatisfacao(respostas: Linha[], ciclo: string, ciclosJanela?: string[] | null) {
  const janela = (ciclosJanela && ciclosJanela.length ? ciclosJanela : [ciclo]).slice();
  const dentro = new Set(janela.concat([ciclo]));
  const mapa = new Map<string, Linha>();
  for (const r of respostas) {
    const m = mesISO(r.pesquisa);
    if (!dentro.has(m)) continue;
    const k = chaveLoja(r);
    if (!k) continue;
    if (!mapa.has(k)) mapa.set(k, { nome: r.departamento || r.unidade || '—', unidade: r.unidade, operacao: operacaoDe(r).nome, porCiclo: new Map() });
    const l = mapa.get(k) as Linha;
    if (!l.porCiclo.has(m)) l.porCiclo.set(m, []);
    l.porCiclo.get(m).push(r);
  }
  const mediaDe = (rows: Linha[] | undefined) => rows ? stats(rows).media : null;
  const anterior = janela.filter(m => m < ciclo).pop() || null;
  const lojas: Linha[] = [], ausentes: Linha[] = [];
  for (const l of mapa.values()) {
    const historico = janela.map(m => ({ ciclo: m, media: mediaDe(l.porCiclo.get(m)) }));
    if (!l.porCiclo.has(ciclo)) {
      // Loja crítica no ciclo anterior que não respondeu agora: o NPS pode subir só por isso.
      const ant = anterior ? mediaDe(l.porCiclo.get(anterior)) : null;
      if (ant != null && ant < LIMITE_LOJA) ausentes.push({ nome: l.nome, operacao: l.operacao, mediaAnterior: ant });
      continue;
    }
    const rows = l.porCiclo.get(ciclo), s = stats(rows);
    if (!s.n) continue;
    const respondidos = historico.filter(x => x.media != null);
    const ciclosBaixos = respondidos.filter(x => (x.media as number) < LIMITE_LOJA).length;
    const suspeitas = rows.filter((r: Linha) => sinalDe(r)).length;
    lojas.push({
      nome: l.nome, unidade: l.unidade, operacao: l.operacao, media: s.media, avaliacoes: s.n, detratores: s.detratores,
      zeros: rows.filter((r: Linha) => notaDe(r) === 0).length,
      areasZero: ordenarAreas(rows.filter((r: Linha) => notaDe(r) === 0).map((r: Linha) => r.area)),
      areasBaixas: ordenarAreas(rows.filter((r: Linha) => notaDe(r) != null && (notaDe(r) as number) <= 6).map((r: Linha) => r.area)),
      historico, ciclosRespondidos: respondidos.length, ciclosBaixos,
      recorrente: ciclosBaixos >= CICLOS_RECORRENTE, suspeitas, conferir: suspeitas >= SUSPEITAS_LOJA
    });
  }
  const totalDet = lojas.reduce((t, l) => t + l.detratores, 0);
  const criticas = lojas.filter(l => l.media < LIMITE_LOJA).sort((a, b) => a.media - b.media);
  const detCriticas = criticas.reduce((t, l) => t + l.detratores, 0);
  const outras = lojas.filter(l => l.media >= LIMITE_LOJA && l.detratores > 0);
  return {
    limite: LIMITE_LOJA, janela, lojas: lojas.length, totalDet, criticas, detCriticas,
    pctCriticas: totalDet ? detCriticas / totalDet : null,
    outras: { lojas: outras.length, detratores: outras.reduce((t, l) => t + l.detratores, 0) },
    ausentes: ausentes.sort((a, b) => a.mediaAnterior - b.mediaAnterior), cicloAnterior: anterior
  };
}

// ------------------------------------------------------------------
// Compras: lojas sem nenhuma reunião com o time no mês
// ------------------------------------------------------------------
export function semReuniao(rows: Linha[] | null | undefined) {
  const c = (rows || []).filter(r => r.extra);
  if (!c.length) return null;
  const zero = c.filter(r => /^0\b/.test(N(r.extra))).length;
  return { n: c.length, zero, pct: zero / c.length };
}

