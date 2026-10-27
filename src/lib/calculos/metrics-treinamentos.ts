// Porte de legado/js/metrics-treinamentos.js (HUB_METRICS_TREINAMENTOS). Nada ficou fora.
// HUB_DATA virou o parâmetro `dados` (último da assinatura); HUB_METRICS e
// HUB_METRICS_BOLETIM viraram import (o `MB() ?` do legado some: o módulo sempre existe).
//
// Indicadores → Treinamentos: contas das abas Visão geral, Twygo (complemento),
// Unibê e Academia Hering. A aba Twygo continua usando treinamentosMetrics()
// de metrics-indicadores para a carteira atual; aqui ficam o histórico de
// conclusões por mês, as pendências e as duas plataformas parceiras.
//
// Unibê e Academia Hering são FOTOS mensais (o mês é escolhido no upload): a
// tela mostra uma foto por vez — a mais recente dentro do período do filtro,
// ou a escolhida no seletor da aba — e a evolução usa uma foto por mês.
import { OPERACOES, OP_POR_ID, operacaoDe } from '@/lib/calculos/metrics-boletim';
import { treinamentosMetrics } from '@/lib/calculos/metrics-indicadores';
import { inRange, matchesAny, monthLabel, normalizeText, normIncludes, type Linha } from '@/lib/calculos/utils';

const N = (s: unknown) => normalizeText(s == null ? '' : s);

// Mesmas metas do Boletim da Liderança.
export const META_UNIBE = 0.9;
export const META_TWYGO = 0.9;
export const DIAS_SEM_ACESSO = 30;

const mesDe = (d: unknown) => (d ? String(d).slice(0, 7) : null);
const media = (arr: unknown[]): number | null => { const v = arr.filter(x => x != null && !isNaN(x as number)); return v.length ? v.reduce((s: number, x) => s + Number(x), 0) / v.length : null; };
const soma = (arr: Linha[], k: string) => arr.reduce((s: number, r) => s + (Number(r[k]) || 0), 0);
function fimDoMes(mes: string): string { const [y, m] = mes.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); }
function diasEntre(a: string, b: string): number { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }

// Operação do Boletim (Boti RJ, SG, ..., Hering, Levi's, Escritório) de uma linha.
function operacao(unidade: unknown, departamento: unknown): string | null {
  return operacaoDe(unidade, departamento);
}
function nomeOperacao(id: unknown): unknown { const o = OP_POR_ID.get(id as string); return o ? o.nome : id; }

function passaLocal(r: Linha, f: Linha): boolean {
  if (!matchesAny(r.unidade, f.unidade)) return false;
  if (!matchesAny(r.departamento, f.departamento)) return false;
  return true;
}

// Meses com foto, do mais antigo ao mais recente.
export function mesesDe(rows: Linha[] | null | undefined): string[] { return Array.from(new Set((rows || []).map(r => mesDe(r.mes)).filter(Boolean) as string[])).sort(); }
// Fotos dentro do período do filtro (mês inteiro conta se cruzar o período).
function mesesNoPeriodo(meses: string[], f: Linha): string[] {
  return meses.filter(m => (!f.end || m + '-01' <= f.end) && (!f.start || fimDoMes(m) >= f.start));
}
export function escolherMes(meses: string[], f: Linha, escolhido?: string | null): string | null {
  const noPeriodo = mesesNoPeriodo(meses, f);
  if (escolhido && noPeriodo.includes(escolhido)) return escolhido;
  return noPeriodo[noPeriodo.length - 1] || null;
}

interface Grupo { label: string; n: number; valor: number | null; lista: Linha[] }

function agrupar(rows: Linha[], chave: string | ((r: Linha) => unknown), valor: (lista: Linha[]) => number | null): Grupo[] {
  const m = new Map<string, Linha[]>();
  for (const r of rows) {
    const k = typeof chave === 'function' ? chave(r) : r[chave];
    if (!k) continue;
    if (!m.has(k as string)) m.set(k as string, []);
    (m.get(k as string) as Linha[]).push(r);
  }
  return Array.from(m.entries()).map(([label, lista]) => ({ label, n: lista.length, valor: valor(lista), lista }));
}

// ==================================================================
// UNIBÊ
// ==================================================================
export function unibeMetrics(f: Linha, escolhido?: string | null, dados?: Linha | null): Linha {
  const D = dados || {};
  const pdvTodos = (D.unibe_pdv || [] as Linha[]).filter((r: Linha) => passaLocal(r, f));
  const pesTodos = (D.unibe_pessoas || [] as Linha[]).filter((r: Linha) => passaLocal(r, f) && (!f.colaborador || normIncludes(r.nome, f.colaborador) || normIncludes(r.nome_cadastro, f.colaborador)));
  const meses = mesesDe(D.unibe_pdv);
  const mesesFiltro = mesesNoPeriodo(meses, f);
  const mes = escolherMes(meses, f, escolhido);
  const base = { meses: mesesFiltro, mes, meta: META_UNIBE, temDados: meses.length > 0 };
  if (!mes) return base;

  const pdvs: Linha[] = pdvTodos.filter((r: Linha) => mesDe(r.mes) === mes);
  const pessoas: Linha[] = pesTodos.filter((r: Linha) => mesDe(r.mes) === mes);
  const adesaoMedia = media(pdvs.map(p => p.adesao));
  const ant = meses[meses.indexOf(mes) - 1];
  const adesaoAnterior = ant ? media(pdvTodos.filter((r: Linha) => mesDe(r.mes) === ant).map((p: Linha) => p.adesao)) : null;

  const porPdv = pdvs.slice().sort((a, b) => (b.adesao || 0) - (a.adesao || 0)).map(p => ({
    label: p.nome_pdv || p.pdv, pdv: p.pdv, adesao: p.adesao, regiao: p.regiao, segmento: p.segmento,
    supervisao: p.supervisao, multi: p.multi, gerente: p.gerente, pessoas: p.pessoas, departamento: p.departamento
  }));
  const grupo = (campo: string) => agrupar(pdvs, campo, l => media(l.map(x => x.adesao)))
    .map(g => ({ label: g.label, pdvs: g.n, adesao: g.valor, naMeta: g.lista.filter(x => x.adesao >= META_UNIBE).length }))
    .sort((a, b) => (b.adesao || 0) - (a.adesao || 0));
  const porOperacao = agrupar(pdvs, r => operacao(r.unidade, r.departamento), l => media(l.map(x => x.adesao)))
    .map(g => ({ id: g.label, label: nomeOperacao(g.label), pdvs: g.n, adesao: g.valor }))
    .sort((a, b) => (b.adesao || 0) - (a.adesao || 0));
  const porCargo = agrupar(pessoas, 'cargo', l => media(l.map(x => x.adesao)))
    .map(g => ({ label: g.label, pessoas: g.n, adesao: g.valor, abaixo: g.lista.filter(x => x.adesao < META_UNIBE).length }))
    .sort((a, b) => b.pessoas - a.pessoas);
  const abaixo = pessoas.filter(p => p.adesao != null && p.adesao < META_UNIBE)
    .sort((a, b) => a.adesao - b.adesao || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

  const serie = mesesFiltro.map(m => {
    const l: Linha[] = pdvTodos.filter((r: Linha) => mesDe(r.mes) === m);
    return { mes: m, label: monthLabel(m), adesao: media(l.map(x => x.adesao)), pdvs: l.length };
  }).filter(x => x.pdvs);

  return Object.assign(base, {
    mesAnterior: ant || null, adesaoMedia, adesaoAnterior,
    totalPdvs: pdvs.length, pdvsNaMeta: pdvs.filter(p => p.adesao >= META_UNIBE).length,
    totalPessoas: pessoas.length, pessoasAbaixo: abaixo.length, pessoasZeradas: pessoas.filter(p => p.adesao === 0).length,
    adesaoPessoas: media(pessoas.map(p => p.adesao)),
    porPdv, porRegiao: grupo('regiao'), porSegmento: grupo('segmento'), porSupervisao: grupo('supervisao'), porMulti: grupo('multi'),
    porOperacao, porCargo, abaixo, serie
  });
}

// ==================================================================
// ACADEMIA HERING
// ==================================================================
// Nome curto da loja: "HERING STORE - RUA DO CATETE" → "Rua do Catete".
export function lojaCurta(loja: unknown): string {
  const s = String(loja || '').replace(/^hering\s+(mega\s+)?store\s*-\s*/i, '').trim();
  return s.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (_m, a, b) => a + b.toUpperCase()).replace(/\b(Do|Da|De|Dos|Das)\b/g, x => x.toLowerCase()) || (loja as string);
}

export function academiaMetrics(f: Linha, escolhido?: string | null, dados?: Linha | null): Linha {
  const D = dados || {};
  const todos: Linha[] = (D.academia_hering || [] as Linha[]).filter((r: Linha) => passaLocal(r, f) && (!f.colaborador || normIncludes(r.nome, f.colaborador) || normIncludes(r.nome_cadastro, f.colaborador)));
  const meses = mesesDe(D.academia_hering);
  const mesesFiltro = mesesNoPeriodo(meses, f);
  const mes = escolherMes(meses, f, escolhido);
  const base = { meses: mesesFiltro, mes, diasSemAcesso: DIAS_SEM_ACESSO, temDados: meses.length > 0 };
  if (!mes) return base;

  const pessoas = todos.filter(r => mesDe(r.mes) === mes);
  // Referência do "sem acesso": o dia mais recente de acesso na foto (≈ dia da
  // exportação); sem nenhum, o fim do mês.
  const ref = pessoas.map(p => p.ultimo_acesso).filter(Boolean).sort().pop() || fimDoMes(mes);
  const semAcesso = (p: Linha) => !p.ultimo_acesso || diasEntre(p.ultimo_acesso, ref) > DIAS_SEM_ACESSO;
  const ant = meses[meses.indexOf(mes) - 1];
  const anteriores = ant ? todos.filter(r => mesDe(r.mes) === ant) : [];

  const porLoja = agrupar(pessoas, r => r.loja || r.departamento, _l => null).map(g => ({
    label: lojaCurta(g.label), loja: g.label, pessoas: g.n,
    horas: soma(g.lista, 'horas'), horasMedia: media(g.lista.map(x => x.horas)), performanceMedia: media(g.lista.map(x => x.performance)),
    semAcesso: g.lista.filter(semAcesso).length
  })).sort((a, b) => (b.performanceMedia || 0) - (a.performanceMedia || 0));
  const porCargo = agrupar(pessoas, 'cargo', () => null).map(g => ({
    label: g.label, pessoas: g.n, horasMedia: media(g.lista.map(x => x.horas)), performanceMedia: media(g.lista.map(x => x.performance))
  })).sort((a, b) => b.pessoas - a.pessoas);
  const ranking = pessoas.slice().sort((a, b) => (b.performance || 0) - (a.performance || 0));

  const serie = mesesFiltro.map(m => {
    const l = todos.filter(r => mesDe(r.mes) === m);
    return { mes: m, label: monthLabel(m), pessoas: l.length, horasMedia: media(l.map(x => x.horas)), performanceMedia: media(l.map(x => x.performance)) };
  }).filter(x => x.pessoas);

  return Object.assign(base, {
    mesAnterior: ant || null, referencia: ref,
    totalPessoas: pessoas.length, horasTotais: soma(pessoas, 'horas'), horasMedia: media(pessoas.map(p => p.horas)),
    performanceMedia: media(pessoas.map(p => p.performance)),
    performanceAnterior: anteriores.length ? media(anteriores.map(p => p.performance)) : null,
    horasMediaAnterior: anteriores.length ? media(anteriores.map(p => p.horas)) : null,
    semAcesso: pessoas.filter(semAcesso).length,
    nuncaAcessou: pessoas.filter(p => !p.ultimo_acesso).length,
    porLoja, porCargo, top: ranking.slice(0, 10),
    listaSemAcesso: pessoas.filter(semAcesso).sort((a, b) => String(a.ultimo_acesso || '').localeCompare(String(b.ultimo_acesso || '')) || String(a.nome).localeCompare(String(b.nome), 'pt-BR')),
    serie
  });
}

// ==================================================================
// TWYGO — histórico de conclusões e pendências
// ==================================================================
const confirmada = (r: Linha) => N(r.situacao_inscricao).includes('confirmad');
// Mesma regra da aba Twygo (treinamentosMetrics): 100% de progresso.
const concluida = (r: Linha) => N(r.situacao).includes('conclu') || (r.progresso != null && r.progresso >= 1);
// Data da conclusão: "Conclusão 100%"; sem ela, a data de aprovação.
export const dataConclusao = (r: Linha) => r.concluido_em || r.aprovado_em || null;

function filtroTwygo(r: Linha, f: Linha): boolean {
  if (!passaLocal(r, f)) return false;
  if (f.colaborador && !normIncludes(r.nome_completo, f.colaborador)) return false;
  if (f.trilha && !normIncludes(r.content_type, f.trilha)) return false;
  if (f.conteudo && !normIncludes(r.content_title, f.conteudo)) return false;
  return true;
}

// Conclusões por mês, pela DATA DA CONCLUSÃO (não da inscrição). Entra quem já
// saiu da empresa (ambiente inativo): o curso foi feito quando a pessoa estava aqui.
export function twygoHistorico(f: Linha, dados?: Linha | null): Linha {
  const rows: Linha[] = (dados && dados.twygo_participantes) || [];
  const temDatas = rows.some(r => r.concluido_em || r.aprovado_em);
  const feitas = rows.filter(r => confirmada(r) && concluida(r) && dataConclusao(r) && filtroTwygo(r, f));
  const noPeriodo = feitas.filter(r => inRange(dataConclusao(r), f.start, f.end));
  const m = new Map<string, { conclusoes: number; horas: number; pessoas: Set<string> }>();
  for (const r of noPeriodo) {
    const k = mesDe(dataConclusao(r)) as string;
    if (!m.has(k)) m.set(k, { conclusoes: 0, horas: 0, pessoas: new Set() });
    const x = m.get(k) as { conclusoes: number; horas: number; pessoas: Set<string> };
    x.conclusoes++;
    x.horas += Number(r.carga_horaria) || 0;
    x.pessoas.add(N(r.email || r.nome_completo));
  }
  // Sem período no filtro: os últimos 12 meses com conclusão.
  let serie = Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, x]) => ({ mes, label: monthLabel(mes), conclusoes: x.conclusoes, horas: x.horas, pessoas: x.pessoas.size }));
  if (!f.start && !f.end) serie = serie.slice(-12);
  const doPeriodo = !f.start && !f.end ? noPeriodo.filter(r => serie.length && (mesDe(dataConclusao(r)) as string) >= serie[0].mes) : noPeriodo;
  const pessoas = new Set(doPeriodo.map(r => N(r.email || r.nome_completo)));
  const horas = soma(doPeriodo, 'carga_horaria');
  const porOperacao = agrupar(doPeriodo, r => operacao(r.unidade, r.departamento), () => null)
    .map(g => ({ id: g.label, label: nomeOperacao(g.label), conclusoes: g.n, horas: soma(g.lista, 'carga_horaria'), pessoas: new Set(g.lista.map(r => N(r.email || r.nome_completo))).size }))
    .sort((a, b) => b.horas - a.horas);
  const porCurso = agrupar(doPeriodo, 'content_title', () => null)
    .map(g => ({ label: g.label, conclusoes: g.n, horas: soma(g.lista, 'carga_horaria') }))
    .sort((a, b) => b.conclusoes - a.conclusoes);
  // Por loja/área (departamento do Twygo), com a operação do Boletim para o nome curto.
  const porDepartamento = agrupar(doPeriodo, 'departamento', () => null)
    .map(g => ({ label: g.label, op: operacao(g.lista[0].unidade, g.label), conclusoes: g.n, horas: soma(g.lista, 'carga_horaria'), pessoas: new Set(g.lista.map(r => N(r.email || r.nome_completo))).size }))
    .sort((a, b) => b.conclusoes - a.conclusoes);
  return {
    temDatas, serie, conclusoes: doPeriodo.length, horas, pessoas: pessoas.size,
    horasPorPessoa: pessoas.size ? horas / pessoas.size : null,
    janela: !f.start && !f.end && serie.length ? `${serie[0].label} a ${serie[serie.length - 1].label}` : null,
    porOperacao, porCurso, porDepartamento
  };
}

// Pendências da carteira atual (mesmo recorte da aba Twygo: ambiente ativo,
// inscrição confirmada, período pela data de inscrição).
export function twygoPendencias(f: Linha, dados?: Linha | null): Linha {
  const rows = (((dados && dados.twygo_participantes) || []) as Linha[])
    .filter(r => N(r.situacao_ambiente) !== 'inativo' && confirmada(r) && filtroTwygo(r, f) && (!(f.start || f.end) || (r.data_inscricao && inRange(r.data_inscricao, f.start, f.end))));
  const pend = rows.filter(r => !concluida(r));
  const chave = (r: Linha) => N(r.email || r.nome_completo);
  const inscricoesDe = new Map<string, Linha[]>();
  for (const r of rows) { const k = chave(r); if (!inscricoesDe.has(k)) inscricoesDe.set(k, []); (inscricoesDe.get(k) as Linha[]).push(r); }
  const porPessoa = agrupar(pend, chave, () => null).map(g => {
    const r0 = g.lista[0];
    const todas = inscricoesDe.get(g.label) || [];
    return {
      nome: r0.nome_completo, cargo: r0.cargo, departamento: r0.departamento, unidade: r0.unidade,
      pendentes: g.n, naoIniciados: g.lista.filter(r => !(r.progresso > 0)).length, inscricoes: todas.length,
      conclusao: todas.length ? todas.filter(concluida).length / todas.length : null,
      maisAntiga: g.lista.map(r => r.data_inscricao).filter(Boolean).sort()[0] || null,
      ultimoAcesso: todas.map(r => r.ultimo_acesso).filter(Boolean).sort().pop() || null
    };
  }).sort((a, b) => b.pendentes - a.pendentes || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  const porCurso = agrupar(rows, 'content_title', () => null).map(g => {
    const ok = g.lista.filter(concluida).length;
    return { label: g.label, inscritos: g.n, concluidos: ok, pendentes: g.n - ok, naoIniciados: g.lista.filter(r => !concluida(r) && !(r.progresso > 0)).length, taxa: g.n ? ok / g.n : null };
  }).filter(c => c.pendentes).sort((a, b) => b.pendentes - a.pendentes);
  // Lojas/áreas com menor conclusão (com pelo menos 5 inscrições, para não
  // destacar área com 1 ou 2 pessoas).
  const porDepartamento = agrupar(rows, 'departamento', () => null).map(g => {
    const ok = g.lista.filter(concluida).length;
    return { label: g.label, unidade: g.lista[0].unidade, inscritos: g.n, pessoas: new Set(g.lista.map(r => N(r.email || r.nome_completo))).size, taxa: ok / g.n, progresso: media(g.lista.map(r => r.progresso || 0)), pendentes: g.n - ok };
  }).filter(d => d.inscritos >= 5).sort((a, b) => a.taxa - b.taxa || b.pendentes - a.pendentes);
  return { porPessoa, porCurso, piores: porDepartamento.slice(0, 10), pessoasComPendencia: porPessoa.length, totalPendentes: pend.length };
}

// Carteira atual do Twygo por operação: progresso médio e conclusão.
export function twygoPorOperacao(f: Linha, dados?: Linha | null): Record<string, { progresso: number; conclusao: number; inscricoes: number }> {
  const rows = (((dados && dados.twygo_participantes) || []) as Linha[])
    .filter(r => N(r.situacao_ambiente) !== 'inativo' && confirmada(r) && filtroTwygo(r, f) && (!(f.start || f.end) || (r.data_inscricao && inRange(r.data_inscricao, f.start, f.end))));
  const m = new Map<string, { insc: number; prog: number; ok: number }>();
  for (const r of rows) {
    const op = operacao(r.unidade, r.departamento);
    if (!op) continue;
    if (!m.has(op)) m.set(op, { insc: 0, prog: 0, ok: 0 });
    const x = m.get(op) as { insc: number; prog: number; ok: number };
    x.insc++; x.prog += Number(r.progresso) || 0; if (concluida(r)) x.ok++;
  }
  const out: Record<string, { progresso: number; conclusao: number; inscricoes: number }> = {};
  for (const [op, x] of m) out[op] = { progresso: x.prog / x.insc, conclusao: x.ok / x.insc, inscricoes: x.insc };
  return out;
}

// ==================================================================
// VISÃO GERAL — as três plataformas lado a lado, por operação
// ==================================================================
export function visaoGeral(f: Linha, dados: Linha): Linha {
  const tw = treinamentosMetrics(f, dados);
  const hist = twygoHistorico(f, dados);
  const ub = unibeMetrics(f, undefined, dados);
  const ac = academiaMetrics(f, undefined, dados);
  const twOp = twygoPorOperacao(f, dados);
  const ubOp = new Map<unknown, Linha>((ub.porOperacao || []).map((o: Linha) => [o.id, o]));
  const histOp = new Map<unknown, Linha>(hist.porOperacao.map((o: Linha) => [o.id, o]));
  const ops = OPERACOES.map(o => {
    const acad = o.id === 'hering' && ac.mes ? ac : null;
    return {
      id: o.id, nome: o.nome,
      twygoProgresso: twOp[o.id] ? twOp[o.id].progresso : null,
      twygoConclusao: twOp[o.id] ? twOp[o.id].conclusao : null,
      twygoInscricoes: twOp[o.id] ? twOp[o.id].inscricoes : 0,
      horasConcluidas: histOp.has(o.id) ? (histOp.get(o.id) as Linha).horas : null,
      unibe: ubOp.has(o.id) ? (ubOp.get(o.id) as Linha).adesao : null,
      academiaPerformance: acad ? acad.performanceMedia : null,
      academiaHoras: acad ? acad.horasMedia : null
    };
  }).filter(o => o.twygoInscricoes || o.unibe != null || o.academiaPerformance != null || o.horasConcluidas);
  return { tw, hist, ub, ac, ops, metaTwygo: META_TWYGO };
}
