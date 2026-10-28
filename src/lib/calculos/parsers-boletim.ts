// Porte de legado/js/parsers-boletim.js (HUB_PARSERS_BOLETIM).
//
// Leitura das 3 planilhas que alimentam só o Boletim da Liderança. Nenhuma
// delas guarda linha individual no banco: tudo é AGREGADO aqui no navegador
// antes de gravar (sem nome, CPF, e-mail nem comentário), por mês/dia e por
// unidade + departamento:
//   • "36. Humor.xlsx"                      → parseHumor
//   • Notas da Pesquisa de Engajamento      → parseEngajamentoNotas
//       (aba "Respostas" da planilha 33 ou aba "pesquisa_engajamento" do export do Feedz)
//   • "16. Base Pesquisa Feedz.xlsx"        → parseSatisfacao (Pesquisa de Satisfação)
//
// Nada ficou fora do porte.
import * as XLSX from 'xlsx';
import { _internal as I, type PastaDeTrabalho } from '@/lib/calculos/parsers';
import type { Linha } from '@/lib/calculos/utils';

export const norm = (h: unknown): string => String(h == null ? '' : h).normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- aba do SheetJS (ou falsa nos testes)
function linhas(ws: any): Linha[] { return XLSX.utils.sheet_to_json<Linha>(ws, { defval: '', raw: true }); }

// Aba pelo nome (sem acento/caixa) ou, se não houver, a que tem mais cabeçalhos esperados.
function escolherAba(wb: PastaDeTrabalho, nomes: string[], esperados: string[], minimo: number, rotulo: string): Linha[] {
  for (const n of nomes) {
    const real = wb.SheetNames.find(s => norm(s) === norm(n));
    if (real) {
      const rows = linhas(wb.Sheets[real]);
      if (rows.length) return rows;
    }
  }
  let melhor: Linha[] | null = null, nota = -1;
  for (const s of wb.SheetNames) {
    const rows = linhas(wb.Sheets[s]);
    if (!rows.length) continue;
    const hs = Object.keys(rows[0]).map(norm);
    const n = esperados.filter(e => hs.includes(norm(e))).length;
    if (n > nota) { nota = n; melhor = rows; }
  }
  if (!melhor || nota < minimo) throw new Error(`Este arquivo não parece ser a planilha "${rotulo}" (colunas esperadas: ${esperados.join(', ')}).`);
  return melhor;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- devolve o valor bruto da célula
function leitor(row: Linha): (...nomes: string[]) => any {
  const idx: Record<string, string> = {};
  for (const k of Object.keys(row)) { const n = norm(k); if (!(n in idx)) idx[n] = k; }
  return (...nomes: string[]) => {
    for (const n of nomes) {
      const k = idx[norm(n)];
      if (k !== undefined && row[k] !== '' && row[k] != null) return row[k];
    }
    return null;
  };
}

// Datas do Feedz em texto vêm como DIA/MÊS/ANO ("25/09/2026 07:40:17").
export function dataBR(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date || typeof v === 'number') return I.toISODate(v);
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return I.toISODate(s);
}
const mesDe = (d: string | null): string | null => d ? d.slice(0, 7) + '-01' : null;

// Coluna PESQUISA da Pesquisa de Satisfação: texto "set/26" (ou "setembro/2026"), às vezes data.
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export function mesBR(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date || typeof v === 'number') return mesDe(dataBR(v));
  const m = /^([a-z]{3})[a-z]*\.?\s*[\/\- ]\s*(\d{2}|\d{4})$/.exec(norm(v));
  if (m) {
    const i = MESES_ABREV.indexOf(m[1]);
    if (i < 0) return null;
    const ano = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    return `${ano}-${String(i + 1).padStart(2, '0')}-01`;
  }
  return mesDe(dataBR(v));
}
export const txt = (v: unknown): string | null => { const s = I.str(v); return s ? s.replace(/\s+/g, ' ') : null; };

// ---------------------------------------------------------------------
// 36. Humor.xlsx → humor_mensal (mês × unidade × departamento)
// ---------------------------------------------------------------------
export function parseHumor(wb: PastaDeTrabalho) {
  const rows = escolherAba(wb, ['Worksheet', 'Humor'], ['Nome', 'Unidade', 'Departamento', 'Nota do Humor', 'Data'], 4, '36. Humor');
  const grupos = new Map<string, Linha>();
  let ignoradas = 0;
  for (const row of rows) {
    const g = leitor(row);
    const dia = dataBR(g('Data'));
    const nota = I.num(g('Nota do Humor', 'Nota'));
    if (!dia || nota == null || nota < 1 || nota > 5) { ignoradas++; continue; }
    const unidade = txt(g('Unidade')), departamento = txt(g('Departamento'));
    const k = mesDe(dia) + '\u0001' + norm(unidade) + '\u0001' + norm(departamento);
    if (!grupos.has(k)) grupos.set(k, { mes: mesDe(dia), unidade, departamento, registros: 0, soma: 0, _p: new Set(), dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
    const x = grupos.get(k) as Linha;
    x.registros++; x.soma += nota; x.dist[Math.round(nota)]++;
    x._p.add(norm(g('Nome')));
  }
  const out = Array.from(grupos.values()).map(x => ({ mes: x.mes, unidade: x.unidade, departamento: x.departamento, registros: x.registros, soma: x.soma, pessoas: x._p.size, dist: x.dist }));
  if (!out.length) throw new Error('Não encontrei nenhum registro de humor com data e nota (1 a 5).');
  const meses = out.map(x => x.mes).sort();
  return { linhas: out, avisos: ignoradas ? [`${ignoradas} linha(s) sem data ou nota válida foram ignoradas.`] : [], resumo: { inicio: meses[0], fim: meses[meses.length - 1], registros: out.reduce((s, x) => s + x.registros, 0) } };
}

// ---------------------------------------------------------------------
// Notas da Pesquisa de Engajamento → engajamento_notas (dia × unidade × departamento × dimensão)
// ---------------------------------------------------------------------
export function parseEngajamentoNotas(wb: PastaDeTrabalho) {
  const rows = escolherAba(wb, ['Respostas', 'pesquisa_engajamento'], ['Unidade', 'Departamento', 'Dimensão', 'Resposta', 'Data'], 4, 'Pesquisa de Engajamento — respostas');
  const grupos = new Map<string, Linha>();
  let ignoradas = 0;
  for (const row of rows) {
    const g = leitor(row);
    const dia = dataBR(g('Data', 'Data da resposta'));
    const nota = I.num(g('Resposta', 'Nota'));
    let dim = txt(g('Dimensão', 'Dimensao'));
    const pergunta = norm(g('Pergunta'));
    if (!dim && pergunta.includes('recomendaria')) dim = 'NPS';
    if (!dia || nota == null || !dim) { ignoradas++; continue; }
    const nps = norm(dim) === 'nps';
    if (!nps && (nota < 1 || nota > 5)) { ignoradas++; continue; }
    const unidade = txt(g('Unidade')), departamento = txt(g('Departamento'));
    const k = [dia, norm(unidade), norm(departamento), norm(dim)].join('\u0001');
    if (!grupos.has(k)) grupos.set(k, { dia, unidade, departamento, dimensao: nps ? 'NPS' : dim, soma: 0, n: 0, promotores: 0, detratores: 0 });
    const x = grupos.get(k) as Linha;
    x.soma += nota; x.n++;
    if (nps) { if (nota >= 9) x.promotores++; else if (nota <= 6) x.detratores++; }
  }
  const out = Array.from(grupos.values());
  if (!out.length) throw new Error('Não encontrei respostas com data, dimensão e nota.');
  const dias = out.map(x => x.dia).sort();
  return { inicio: dias[0], fim: dias[dias.length - 1], linhas: out, avisos: ignoradas ? [`${ignoradas} linha(s) sem data, dimensão ou nota válida foram ignoradas.`] : [] };
}

// ---------------------------------------------------------------------
// Pesquisa de Satisfação → satisfacao_suporte (pesquisa × unidade × departamento)
// Fonte oficial: "16. Base Pesquisa Feedz.xlsx", aba "Worksheet" (export do
// Feedz). Lê também o modelo antigo "61. Pesquisa de Satisfação" (aba "Base Original").
// ---------------------------------------------------------------------
const AREA_NOME: Record<string, string> = {
  'financeiro': 'Financeiro', 'compras': 'Compras', 'recrutamento e selecao': 'Recrutamento e Seleção',
  'dp': 'DP', 'departamento pessoal': 'DP', 'ti': 'TI', 'tecnologia da informacao': 'TI', 'manutencao': 'Manutenção', 'auditoria': 'Auditoria', 'administrativo': 'Administrativo',
  'marketing': 'Marketing', 'juridico': 'Jurídico', 'dho': 'DHO', 'desenvolvimento humano organizacional': 'DHO',
  't&d': 'T&D', 'treinamento e desenvolvimento': 'T&D', 'suprimentos indiretos': 'Suprimentos Indiretos'
};
// Colunas de área sem título no fim da planilha (o SheetJS chama de __EMPTY,
// __EMPTY_1...): na planilha 61 eram as de Suprimentos Indiretos (nota, o que
// melhorar, comentários), incluídas em jun/2026 sem título.
const AREAS_SEM_CABECALHO = ['Suprimentos Indiretos'];
function nomeArea(bruto: string): string {
  const n = norm(bruto).replace(/\s*\([^)]*\)\s*$/, '');   // "... ORGANIZACIONAL (DHO)" → sem a sigla
  return AREA_NOME[n] || AREA_NOME[norm(bruto)] || String(bruto).trim().toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
}

// Compras é dividido em dois times: um atende O Boticário (lojas, VD, Quem disse,
// Berenice? e o Comercial O Boticário) e outro Hering e Levi's. A pergunta é
// uma só no formulário, então a área avaliada sai da operação de quem respondeu.
export const COMPRAS_BOTI = 'Compras O Boticário', COMPRAS_HL = 'Compras Hering e Levis';
export function areaDaResposta(area: string, unidade: unknown, departamento: unknown): string {
  if (area !== 'Compras') return area;
  const t = norm((unidade || '') + ' ' + (departamento || ''));
  if (/hering|levi/.test(t)) return COMPRAS_HL;
  if (/boticario|berenice|qdb/.test(t)) return COMPRAS_BOTI;
  return 'Compras (operação não identificada)';
}

export function linhasSatisfacao(wb: PastaDeTrabalho): Linha[] {
  return escolherAba(wb, ['Worksheet', 'Base Original'], ['PESQUISA', 'Unidade', 'Departamento', 'Posição na empresa', 'Financeiro - 0 a 10'], 3, '16. Base Pesquisa Feedz (Pesquisa de Satisfação)');
}

export interface ColunaArea {
  area: string;
  k: string;
  melhorar: string | null;
  comentario: string | null;
  extra: string | null;
  semCabecalho: boolean;
}

// Colunas de cada área avaliada: { area, k (nota 0 a 10), melhorar, comentario,
// extra (Compras: reuniões no mês), semCabecalho }. Dois formatos de título:
//   "TI - 0 a 10" / "TI - O que melhorar?" / "TI - Comentários"
//   "Pergunta: Sobre o setor DESENVOLVIMENTO HUMANO ORGANIZACIONAL (DHO), em uma
//    escala de 0 a 10..." seguido das perguntas genéricas "Em quais pontos..." e
//    "Pensando nas suas respostas anteriores..." (lidas pela posição).
export function colunasSatisfacao(rows: Linha[]): ColunaArea[] {
  const keys = Object.keys(rows[0] || {});
  const out: ColunaArea[] = [];
  let ultima = -1;
  keys.forEach((k, i) => {
    const t = String(k).replace(/\s+/g, ' ').trim();
    const m = /^(.*?)\s*-\s*0 a 10$/i.exec(t);
    if (m) {
      const pre = norm(m[1]) + ' -';
      const acha = (re: RegExp) => keys.find(x => x !== k && norm(x).startsWith(pre) && re.test(norm(x))) || null;
      out.push({ area: nomeArea(m[1]), k, melhorar: acha(/melhorar/), comentario: acha(/coment/), extra: acha(/reuni/), semCabecalho: false });
      ultima = i;
      return;
    }
    const p = /^pergunta:\s*sobre o setor (?:de |da |do )?(.+?),\s*em uma escala de 0 a 10/i.exec(t);
    if (p) {
      const prox = (j: number, re: RegExp) => keys[j] && re.test(norm(keys[j])) ? keys[j] : null;
      out.push({ area: nomeArea(p[1]), k, melhorar: prox(i + 1, /melhorar/), comentario: prox(i + 2, /coment|feedback/), extra: null, semCabecalho: false });
      ultima = i;
    }
  });
  // Trios sem título depois da última área: nota, o que melhorar, comentários.
  // Só conta se a maioria dos valores preenchidos for nota de 0 a 10 (na 16 há
  // uma coluna sem título que só repete comentários).
  const vazias = keys.slice(ultima + 1).filter(k => /^__EMPTY(_\d+)?$/.test(k));
  for (let j = 0, n = 0; j < vazias.length; j += 3) {
    const k = vazias[j];
    const cheios = rows.filter(r => r[k] !== '' && r[k] != null);
    const notas = cheios.filter(r => { const v = I.num(r[k]); return v != null && v >= 0 && v <= 10; });
    if (!notas.length || notas.length < cheios.length / 2) continue;
    out.push({ area: AREAS_SEM_CABECALHO[n] || `Área sem título ${n + 1}`, k, melhorar: vazias[j + 1] || null, comentario: vazias[j + 2] || null, extra: null, semCabecalho: true });
    n++;
  }
  return out;
}

export function parseSatisfacao(wb: PastaDeTrabalho) {
  const rows = linhasSatisfacao(wb);
  const colunasArea = colunasSatisfacao(rows);
  if (!colunasArea.length) throw new Error('Não encontrei as colunas de nota das áreas ("Financeiro - 0 a 10", "Pergunta: Sobre o setor ...").');
  const grupos = new Map<string, Linha>();
  let ignoradas = 0;
  for (const row of rows) {
    const g = leitor(row);
    const pesquisa = mesBR(g('PESQUISA'));
    if (!pesquisa) { ignoradas++; continue; }
    const unidade = txt(g('Unidade')), departamento = txt(g('Departamento'));
    const k = pesquisa + '\u0001' + norm(unidade) + '\u0001' + norm(departamento);
    if (!grupos.has(k)) grupos.set(k, { pesquisa, unidade, departamento, respondentes: 0, areas: {} });
    const x = grupos.get(k) as Linha;
    x.respondentes++;
    for (const c of colunasArea) {
      const v = I.num(row[c.k]);
      if (v == null || v < 0 || v > 10) continue;
      const nome = areaDaResposta(c.area, unidade, departamento);
      const a = x.areas[nome] || (x.areas[nome] = { soma: 0, n: 0 });
      a.soma += v; a.n++;
    }
  }
  const out = Array.from(grupos.values());
  if (!out.length) throw new Error('Não encontrei respostas com a coluna PESQUISA preenchida.');
  const meses = out.map(x => x.pesquisa).sort();
  const avisos = ignoradas ? [`${ignoradas} linha(s) sem a data da PESQUISA foram ignoradas.`] : [];
  const sem = colunasArea.filter(c => c.semCabecalho).map(c => c.area);
  if (sem.length) avisos.push(`Colunas de nota sem título no fim da planilha lidas como: ${sem.join(', ')}. Coloque o título (ex.: "SUPRIMENTOS INDIRETOS - 0 a 10") para não depender disso.`);
  return { linhas: out, avisos, resumo: { inicio: meses[0], fim: meses[meses.length - 1], respondentes: out.reduce((s, x) => s + x.respondentes, 0) } };
}

/** Equivalente a HUB_PARSERS_BOLETIM._internal do legado (usado por parsers-satisfacao). */
export const _internal = { dataBR, mesBR, norm, txt, linhasSatisfacao, colunasSatisfacao, areaDaResposta, COMPRAS_BOTI, COMPRAS_HL };
