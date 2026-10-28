// Porte de legado/js/utils.js (HUB_UTILS): datas, texto, filtros, paleta de cores.
// Nada aqui conhece o formato de nenhuma planilha específica nem de nenhuma tela —
// isso fica em parsers*.ts (leitura) e em metrics-*.ts (indicadores por menu).
//
// Fora do porte: wireTableTopScroll (mexe no DOM; é tela).

/** Linha de planilha ou de tabela: o formato é dinâmico (vem do cabeçalho ou do banco), como no legado. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dado dinâmico, igual ao legado
export type Linha = Record<string, any>;

// Paleta categórica validada (ordem fixa, não ciclar hue-a-hue) — slot 1
// ajustado para o azul da marca Sfera; slots 2-8 mantidos do conjunto
// validado (ver skill de dataviz: passa lightness band, chroma floor,
// separação CVD e piso de visão normal em modo claro).
export const CHART_COLORS = [
  '#1C7CEC', '#eb6834', '#1baf7a', '#eda100',
  '#e87ba4', '#008300', '#4a3aa7', '#e34948'
];

export const STATUS_COLORS = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' };

export function color(i: number): string { return CHART_COLORS[i % CHART_COLORS.length]; }

export function todayISO(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function fmtDateBR(iso: unknown): string {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

// Soma dias a uma data ISO (YYYY-MM-DD), devolvendo outra data ISO — usa
// meio-dia UTC pra não escorregar de dia por causa de fuso horário.
export function addDays(iso: unknown, days: number): string | null {
  if (!iso) return null;
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  if (isNaN(d as unknown as number)) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function fmtInt(n: unknown): string {
  if (n === null || n === undefined || isNaN(n as number)) return '0';
  return Number(n).toLocaleString('pt-BR');
}

export function fmtPct(n: number | null | undefined, digits?: number | null): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return (n * 100).toFixed(digits == null ? 1 : digits).replace('.', ',') + '%';
}

export function fmt1(n: unknown): string {
  if (n === null || n === undefined || isNaN(n as number)) return '—';
  return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}

export function inRange(iso: string | null | undefined, start?: string | null, end?: string | null): boolean {
  if (!iso) return false;
  if (start && iso < start) return false;
  if (end && iso > end) return false;
  return true;
}

export function monthKey(iso: unknown): string | null {
  if (!iso) return null;
  return String(iso).slice(0, 7); // yyyy-mm
}

export function monthLabel(key: string | null | undefined): string {
  if (!key) return '';
  const [y, m] = key.split('-');
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return meses[parseInt(m, 10) - 1] + '/' + y.slice(2);
}

export function monthsBetween(start: string | null | undefined, end: string | null | undefined): string[] {
  const out: string[] = [];
  if (!start || !end) return out;
  let [y, m] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

export function ageYears(birthIso: string | null | undefined, atIso?: string | null): number | null {
  if (!birthIso) return null;
  const b = new Date(birthIso + 'T00:00:00Z');
  const a = new Date((atIso || todayISO()) + 'T00:00:00Z');
  let age = a.getUTCFullYear() - b.getUTCFullYear();
  const m = a.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && a.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

export function tenureMonths(startIso: string | null | undefined, endIso?: string | null): number | null {
  if (!startIso) return null;
  const s = new Date(startIso + 'T00:00:00Z');
  const e = new Date((endIso || todayISO()) + 'T00:00:00Z');
  return (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth());
}

export function tenureLabel(months: number | null | undefined): string {
  if (months === null || months === undefined) return '—';
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y <= 0) return `${m}m`;
  return `${y}a ${m}m`;
}

export function uniqueSorted<T>(arr: T[]): T[] {
  return Array.from(new Set(arr.filter(v => v !== null && v !== undefined && (v as unknown) !== ''))).sort((a, b) =>
    String(a).localeCompare(String(b), 'pt-BR')
  );
}

export function normalizeText(s: unknown): string {
  return String(s || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ').trim()
    .toLowerCase();
}

// Comparação de valores vindos de planilhas/telas diferentes: mesmo texto
// pode ter espaços/maiúsculas/acentos inconsistentes entre uma origem e
// outra (ex.: "Hering " com espaço sobrando numa e "Hering" na outra).
export function normEq(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (a === '' || b === '') return false;
  return normalizeText(a) === normalizeText(b);
}

// Usado pelos filtros de texto livre (unidade/departamento/gestor/
// colaborador): "contém", não igualdade exata — assim funciona mesmo se a
// pessoa não clicar exatamente na sugestão da lista, só digitar um trecho.
export function normIncludes(rowValue: unknown, filterValue: unknown): boolean {
  if (rowValue === null || rowValue === undefined || !filterValue) return false;
  return normalizeText(rowValue).includes(normalizeText(filterValue));
}

// Filtro de seleção múltipla (Unidade/Departamento): lista vazia = sem
// filtro, passa tudo. Com itens selecionados, casa por igualdade exata
// (não "contém") — a lista vem de valores reais já existentes nos dados,
// então igualdade é o comportamento certo aqui, diferente do campo de
// busca por texto livre (normIncludes).
export function matchesAny(rowValue: unknown, selected: unknown[] | null | undefined): boolean {
  if (!selected || !selected.length) return true;
  if (rowValue === null || rowValue === undefined) return false;
  const nv = normalizeText(rowValue);
  return selected.some(s => normalizeText(s) === nv);
}

// Deduplica valores que só diferem por espaço/caixa/acento, mantendo a
// primeira grafia encontrada como rótulo de exibição.
export function uniqueSortedNormalized(arr: unknown[]): string[] {
  const seen = new Map<string, string>();
  for (const v of arr) {
    if (v === null || v === undefined) continue;
    const s = String(v).replace(/\s+/g, ' ').trim();
    if (!s) continue;
    const key = normalizeText(s);
    if (!seen.has(key)) seen.set(key, s);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function escapeHtml(s: unknown): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ------------------------------------------------------------------
// Mineração de texto livre (menções a pessoas)
// ------------------------------------------------------------------
// Extrai pessoas citadas em textos livres cruzando com a base de nomes
// completos de colaboradores (comparação sem acento/caixa).
export function extractMentions(texts: unknown[], knownFullNames: string[]): { nome: string; count: number }[] {
  const names = knownFullNames.filter(n => n && n.trim().split(/\s+/).length >= 2);
  const normNames = names.map(n => ({ original: n, norm: normalizeText(n) }));
  const counts = new Map<string, number>();
  for (const t of texts) {
    if (!t) continue;
    const nt = normalizeText(t);
    for (const { original, norm } of normNames) {
      if (nt.includes(norm)) counts.set(original, (counts.get(original) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([nome, count]) => ({ nome, count }));
}

// Gera um id legível com prefixo + ano + sequência (ex.: VAG-2026-001),
// usado pelas tabelas operacionais do Recrutamento (vagas/candidatos) que
// preferem um código de negócio em vez de um uuid puro.
export function nextCode(prefix: string, existingCodes: (string | null | undefined)[] | null | undefined): string {
  const year = new Date().getFullYear();
  const re = new RegExp('^' + prefix + '-' + year + '-(\\d+)$');
  let max = 0;
  for (const c of existingCodes || []) {
    const m = re.exec(c || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${year}-${String(max + 1).padStart(3, '0')}`;
}

// nextCode() calcula o próximo id a partir de uma lista carregada no
// cliente — se duas pessoas (ou duas abas) salvarem quase ao mesmo tempo,
// as duas podem calcular o MESMO "próximo" id antes que a primeira grave,
// e a segunda gravação falha com "duplicate key" (constraint de chave
// primária). insertWithRetryId tenta gravar com o id calculado e, se vier
// esse erro específico, soma o id que já falhou à lista de existentes e
// tenta de novo — sem precisar buscar dados novos do banco a cada vez.
export async function insertWithRetryId<T>(
  prefix: string,
  existingCodes: string[] | null | undefined,
  buildAndInsert: (id: string) => Promise<T>,
  maxAttempts?: number
): Promise<T | undefined> {
  maxAttempts = maxAttempts || 5;
  const ids = (existingCodes || []).slice();
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const id = nextCode(prefix, ids);
    try {
      return await buildAndInsert(id);
    } catch (err) {
      const e = err as { code?: string; message?: string } | null;
      const isDupKey = e && (e.code === '23505' || /duplicate key/i.test(e.message || ''));
      if (!isDupKey || attempt === maxAttempts - 1) throw err;
      ids.push(id);
    }
  }
  return undefined;
}

// Escala de cores do % FIT (Cultural/vaga), usada em vagas.js e
// candidatos.js — faixas definidas pelo usuário: quanto mais próximo de
// 100%, mais escuro o verde; abaixo de 65% já é vermelho/laranja.
export function fitColor(pct: number | null | undefined): string {
  const v = Math.max(0, Math.min(100, pct || 0));
  if (v >= 95) return '#1B5E20';
  if (v >= 80) return '#4CAF50';
  if (v >= 70) return '#8BC34A';
  if (v >= 65) return '#FF9800';
  if (v >= 60) return '#EF6C60';
  return '#E53935';
}
