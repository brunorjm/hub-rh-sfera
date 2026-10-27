// Porte de legado/js/metrics-turmas.js (HUB_METRICS_TURMAS). Nada ficou fora.
//
// Treinamento e Desenvolvimento → Turmas e Multiplicadoras: contas sobre as
// turmas importadas das planilhas das multiplicadoras (tabela treinamento_turmas).
// Usadas pela tela (sections/turmas.js) e pelo slide do Fechamento.
//
//   Horas de treinamento = soma da duração das turmas (esforço da multiplicadora).
//   Horas entregues      = duração × presentes (campo horasPessoa).
//   Aderência            = presentes ÷ convocados (campo presenca). Pode passar de 100%:
//                          o RH quer ver quando veio mais gente que o convocado (e o motivo,
//                          na justificativa da multiplicadora).
//   Pendências           = divergências do lançamento (ver PENDENCIAS); a multiplicadora justifica.
//   Turma em dupla conta uma vez no total e entra na linha de cada multiplicadora.
import { monthLabel, normalizeText, type Linha } from '@/lib/calculos/utils';

const N = (s: unknown) => normalizeText(s == null ? '' : s);
const iso = (d: unknown) => (d ? String(d).slice(0, 10) : null);

export interface FiltroTurmas { de?: string | null; ate?: string | null; multiplicadora?: string | null; marca?: string | null; categoria?: string | null }

export function filtrar(turmas: Linha[] | null | undefined, f?: FiltroTurmas | null): Linha[] {
  f = f || {};
  return (turmas || []).filter(t => {
    const d = iso(t.data);
    // `as string`: o legado compara direto (null < 'x' segue a coerção do JS).
    if (f.de && (d as string) < f.de) return false;
    if (f.ate && (d as string) > f.ate) return false;
    if (f.multiplicadora && !(t.multiplicadoras || []).some((m: unknown) => N(m) === N(f.multiplicadora))) return false;
    if (f.marca && !(t.marcas || []).some((m: unknown) => N(m) === N(f.marca))) return false;
    if (f.categoria && t.categoria !== f.categoria) return false;
    return true;
  });
}

export interface ResumoTurmas { turmas: number; horas: number; horasPessoa: number; presentes: number; convocados: number; presenca: number | null; multiplicadoras: number }

export function resumo(lista: Linha[]): ResumoTurmas {
  let horas = 0, horasPessoa = 0, presentes = 0, convocados = 0, presComConv = 0;
  const multis = new Set<unknown>();
  for (const t of lista) {
    const h = Number(t.horas) || 0, p = Number(t.presentes) || 0, c = Number(t.convocados) || 0;
    horas += h; horasPessoa += h * p; presentes += p;
    if (t.convocados != null && t.presentes != null) { convocados += c; presComConv += p; }
    (t.multiplicadoras || []).forEach((m: unknown) => multis.add(m));
  }
  return { turmas: lista.length, horas, horasPessoa, presentes, convocados, presenca: convocados ? presComConv / convocados : null, multiplicadoras: multis.size };
}

// Agrupa por uma ou várias chaves por turma (marcas, multiplicadoras).
export function agrupar(lista: Linha[], chaves: (t: Linha) => unknown): (ResumoTurmas & { label: string })[] {
  const m = new Map<string, Linha[]>();
  for (const t of lista) {
    const ks = ([] as unknown[]).concat(chaves(t) || []).filter(Boolean) as string[];
    for (const k of (ks.length ? ks : ['Não informado'])) { if (!m.has(k)) m.set(k, []); (m.get(k) as Linha[]).push(t); }
  }
  return Array.from(m.entries()).map(([label, l]) => Object.assign({ label }, resumo(l))).sort((a, b) => b.horasPessoa - a.horasPessoa);
}

export function porMes(lista: Linha[]): (ResumoTurmas & { mes: string; label: string })[] {
  const m = new Map<string, Linha[]>();
  for (const t of lista) { const k = (iso(t.data) as string).slice(0, 7); if (!m.has(k)) m.set(k, []); (m.get(k) as Linha[]).push(t); }
  return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([mes, l]) => Object.assign({ mes, label: monthLabel(mes) }, resumo(l)));
}

export function umAnoAntes<T extends string | null | undefined>(d: T): T | string {
  return d ? `${+d.slice(0, 4) - 1}${d.slice(4)}` : d;
}

// Marca de uma unidade do cadastro, no mesmo vocabulário das planilhas.
export function marcaDaUnidade(u: unknown): string | null {
  const k = N(u);
  if (k.startsWith('hering')) return 'Hering';
  if (k.startsWith('levi')) return "Levi's";
  if (k.startsWith('escritorio')) return 'Sfera';
  if (k.startsWith('boticario vd')) return 'O Boticário VD';
  if (k.startsWith('boticario') || k.startsWith('quem disse')) return 'O Boticário';
  return null;
}

// Cobertura ESTIMADA da integração: presentes em turmas de integração ÷
// admitidos no período, por marca. Sem a lista de participantes não dá para
// saber quem é quem (pode haver integração no mês seguinte à admissão, ou
// pessoa de fora do cadastro) — por isso é estimativa.
export function coberturaIntegracao(lista: Linha[], colaboradores: Linha[] | null | undefined, de?: string | null, ate?: string | null) {
  const integ = new Map<string, number>();
  for (const t of lista) {
    if (t.categoria !== 'Integração e onboarding') continue;
    for (const m of (t.marcas || [])) integ.set(m, (integ.get(m) || 0) + (Number(t.presentes) || 0) / Math.max((t.marcas || []).length, 1));
  }
  const adm = new Map<string, number>();
  for (const c of (colaboradores || [])) {
    const d = iso(c.data_admissao);
    if (!d || (de && d < de) || (ate && d > ate)) continue;
    const m = marcaDaUnidade(c.unidade);
    if (m) adm.set(m, (adm.get(m) || 0) + 1);
  }
  return Array.from(new Set(Array.from(integ.keys()).concat(Array.from(adm.keys()))))
    .map(marca => ({ marca, integrados: Math.round(integ.get(marca) || 0), admitidos: adm.get(marca) || 0 }))
    .map(x => Object.assign(x, { cobertura: x.admitidos ? Math.min(1, x.integrados / x.admitidos) : null }))
    .sort((a, b) => b.admitidos - a.admitidos);
}

// Divergências de um lançamento. Não são corrigidas pelo RH: ficam marcadas na
// lista e a multiplicadora escreve a justificativa (campo justificativa).
const minutos = (h: string | null | undefined): number | null => (/^\d{1,2}:\d{2}$/.test(h || '') ? +(h as string).slice(0, (h as string).indexOf(':')) * 60 + +(h as string).slice((h as string).indexOf(':') + 1) : null);
// `as number`: o legado compara minutos que podem ser null (null > x segue a coerção do JS).
const PENDENCIAS_: [string, (t: Linha) => boolean][] = [
  ['presentes acima dos convocados', t => t.presentes != null && t.convocados != null && t.presentes > t.convocados],
  ['sem convocados ou presentes', t => t.presentes == null || t.convocados == null],
  ['sem horário de início ou fim', t => !t.hora_inicio || !t.hora_fim],
  ['fim antes do início', t => minutos(t.hora_inicio) != null && minutos(t.hora_fim) != null && (minutos(t.hora_fim) as number) <= (minutos(t.hora_inicio) as number)],
  ['sem duração', t => !(Number(t.horas) > 0)],
  ['duração diferente do horário', t => Number(t.horas) > 0 && minutos(t.hora_inicio) != null && (minutos(t.hora_fim) as number) > (minutos(t.hora_inicio) as number) && Math.abs(Number(t.horas) - ((minutos(t.hora_fim) as number) - (minutos(t.hora_inicio) as number)) / 60) > 0.05],
  ['sem local', t => !t.local],
  ['tema não informado', t => t.tema === 'TEMA NÃO INFORMADO'],
  ['sem instrutor', t => (t.multiplicadoras || []).includes('Sem instrutor') || !(t.multiplicadoras || []).length]
];
export function pendencias(t: Linha): string[] { return PENDENCIAS_.filter(([, f]) => f(t)).map(([nome]) => nome); }
// 'ajuste'     o gestor de T&D pediu um ajuste na turma (vale mesmo sem divergência)
// 'ok'         sem divergência
// 'justificar' divergência sem justificativa, ou justificativa devolvida pelo gestor
// 'aguardando' justificada, esperando o gestor validar
// 'validada'   justificativa aceita pelo gestor
export function situacao(t: Linha): 'ajuste' | 'ok' | 'justificar' | 'validada' | 'aguardando' {
  if (t.ajuste_pedido) return 'ajuste';
  if (!pendencias(t).length) return 'ok';
  if (!t.justificativa || t.validacao === 'devolvida') return 'justificar';
  return t.validacao === 'validada' ? 'validada' : 'aguardando';
}
// O que a multiplicadora precisa resolver (aviso no menu) e o que o gestor precisa validar.
export const precisaAcao = (t: Linha): boolean => ['ajuste', 'justificar'].includes(situacao(t));
export const aguardaGestor = (t: Linha): boolean => situacao(t) === 'aguardando';

// Tudo o que a tela e o slide usam, para um período e filtros.
export function painel(turmas: Linha[] | null | undefined, f: FiltroTurmas, colaboradores?: Linha[] | null) {
  const lista = filtrar(turmas, f);
  const ant = filtrar(turmas, Object.assign({}, f, { de: umAnoAntes(f.de), ate: umAnoAntes(f.ate) }));
  return {
    lista, total: resumo(lista), anterior: ant.length ? resumo(ant) : null,
    porMes: porMes(lista),
    porMultiplicadora: agrupar(lista, t => t.multiplicadoras),
    porMarca: agrupar(lista, t => t.marcas),
    porCategoria: agrupar(lista, t => t.categoria),
    porTema: agrupar(lista, t => t.tema),
    porPublico: agrupar(lista, t => t.publico),
    porCanal: agrupar(lista, t => t.canal),
    porModalidade: agrupar(lista, t => t.modalidade),
    cobertura: coberturaIntegracao(lista, colaboradores, f.de, f.ate),
    comPendencia: lista.filter(t => pendencias(t).length),
    planilhas: Array.from(new Set((turmas || []).map(t => t.planilha))).sort()
  };
}

export const PENDENCIAS = PENDENCIAS_.map(p => p[0]);
