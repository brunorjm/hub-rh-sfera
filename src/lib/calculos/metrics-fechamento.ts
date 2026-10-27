// Porte de legado/js/metrics-fechamento.js (HUB_METRICS_FECHAMENTO). Nada ficou fora.
//
// Indicadores de R&S do Fechamento do Período, calculados sobre a base da
// planilha 18 (tabela controle_vagas). Critérios definidos pelo RH (09/10/2026):
//
//   Vaga fechada  → tem DATA DE FECHAMENTO no período, qualquer que seja o
//                   status. As que estão "Andamento" com data de fechamento
//                   são vagas fechadas aguardando admissão/início.
//   Dentro do SLA → coluna "Status SLA" da planilha: "Expirou SLA" = fora do
//                   prazo; em branco = dentro do prazo.
//   SLA médio     → média da coluna SLA (dias) das vagas fechadas.
//   Time to Fill  → dias da abertura ao fechamento.
//   Time to Hire  → dias da abertura à DATA DE INÍCIO (só quem já tem início).
//   Em andamento  → status Andamento SEM data de fechamento (as com data já
//                   estão nas fechadas); em aberto → status Aberta.
import type { Linha } from '@/lib/calculos/utils';

const MS_DIA = 86400000;
function dias(de: string | null | undefined, ate: string | null | undefined): number | null {
  if (!de || !ate) return null;
  return Math.round((Date.parse(ate) - Date.parse(de)) / MS_DIA);
}

const norm = (s: unknown) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
const fechada = (v: Linha) => !!v.data_fechamento;
export const expirou = (v: Linha): boolean => norm(v.status_sla_planilha).includes('expir');
export const diasSla = (v: Linha): number | null => (v.sla_dias_planilha != null && !isNaN(v.sla_dias_planilha) ? Number(v.sla_dias_planilha) : dias(v.data_abertura, v.data_fechamento));
const entre = (iso: string | null | undefined, de: string, ate: string) => !!iso && iso >= de && iso <= ate;
const media = (a: (number | null | undefined)[]): number | null => { const v = a.filter(x => x != null && !isNaN(x)) as number[]; return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };

function contar(lista: Linha[], chave: (v: Linha) => unknown): { nome: string; qtd: number }[] {
  const m: Record<string, number> = {};
  for (const v of lista) { const k = String(chave(v) || '(não informado)'); m[k] = (m[k] || 0) + 1; }
  return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([nome, qtd]) => ({ nome, qtd }));
}

// Loja/área curta para listas ("O Boticário Manhuaçu" → "Bot. Manhuaçu").
export function localCurto(v: Linha): string {
  const d = String(v.departamento || v.unidade || '').replace(/^O Botic[aá]rio\s+/i, 'Bot. ');
  return d || 'Não informado';
}

// Números de um período [de, ate] (datas ISO, inclusivas).
export function periodo(vagas: Linha[], de: string, ate: string) {
  const fechadas = vagas.filter(v => fechada(v) && entre(v.data_fechamento, de, ate));
  const abertas = vagas.filter(v => entre(v.data_abertura, de, ate));
  const canceladas = vagas.filter(v => v.status_vaga === 'Cancelada' && entre(v.data_cancelamento, de, ate));
  const noPrazo = (l: Linha[]) => (l.length ? l.filter(v => !expirou(v)).length / l.length : null);
  const porTipo = (tipo: string) => {
    const l = fechadas.filter(v => v.tipo_vaga === tipo);
    return { fechadas: l.length, diasMedio: media(l.map(diasSla)), noPrazo: noPrazo(l), dentro: l.filter(v => !expirou(v)).length };
  };
  const comSla = fechadas.map(v => ({ v, dias: diasSla(v) })).filter((x): x is { v: Linha; dias: number } => x.dias != null);
  const item = (x: { v: Linha; dias: number }) => ({ dias: x.dias, cargo: x.v.sigilosa ? 'Vaga sigilosa' : (x.v.cargo || 'Cargo não informado'), local: localCurto(x.v), motivo: x.v.motivo_sla || null, fonte: x.v.fonte || null, status: x.v.status_vaga });
  const porFonte: Record<string, number[]> = {};
  comSla.forEach(x => { const k = x.v.fonte || 's/ fonte'; (porFonte[k] = porFonte[k] || []).push(x.dias); });
  return {
    de, ate,
    abertas: abertas.length,
    fechadas: fechadas.length,
    aguardandoAdmissao: fechadas.filter(v => v.status_vaga === 'Andamento').length,
    canceladas: canceladas.length,
    dentro: fechadas.filter(v => !expirou(v)).length,
    noPrazo: noPrazo(fechadas),
    diasMedio: media(fechadas.map(diasSla)),
    timeToFill: media(fechadas.map(v => dias(v.data_abertura, v.data_fechamento))),
    timeToHire: media(fechadas.map(v => dias(v.data_abertura, v.data_inicio))),
    operacional: porTipo('Operacional'),
    estrategica: porTipo('Estratégica'),
    naturezaFechadas: contar(fechadas, v => v.natureza),
    naturezaAbertas: contar(abertas, v => v.natureza),
    fontesOperacional: contar(fechadas.filter(v => v.tipo_vaga === 'Operacional'), v => v.fonte),
    fontesEstrategica: contar(fechadas.filter(v => v.tipo_vaga === 'Estratégica'), v => v.fonte),
    unidadesFechadas: contar(fechadas, v => v.unidade),
    semFonte: fechadas.filter(v => !v.fonte).length,
    maioresSla: comSla.slice().sort((a, b) => b.dias - a.dias).slice(0, 5).map(item),
    menoresSla: comSla.slice().sort((a, b) => a.dias - b.dias).slice(0, 5).map(item),
    slaPorFonte: Object.entries(porFonte).map(([fonte, d]) => ({ fonte, dias: media(d), qtd: d.length })).sort((a, b) => b.qtd - a.qtd),
    lista: fechadas
  };
}

// Vagas em aberto e em andamento na virada do período (ate = último dia):
// só as abertas até essa data; "em andamento" sem as que já fecharam até ela
// (essas estão nas fechadas). O status é o da base no upload — a planilha não
// guarda histórico de status.
export function ativas(vagas: Linha[], ate?: string | null) {
  const ate_ = ate || '9999-12-31';
  const base = vagas.filter(v => v.data_abertura && v.data_abertura <= ate_);
  const fechouAte = (v: Linha) => !!v.data_fechamento && v.data_fechamento <= ate_;
  const grupo = (filtro: (v: Linha) => boolean) => {
    const l = base.filter(filtro);
    return { total: l.length, porTipo: contar(l, v => v.tipo_vaga), porNatureza: contar(l, v => v.natureza), porUnidade: contar(l, v => v.unidade), porEtapa: contar(l, v => v.etapa_vaga), expiradas: l.filter(expirou).length, lista: l };
  };
  return {
    aberta: grupo(v => v.status_vaga === 'Aberta'),
    andamento: grupo(v => v.status_vaga === 'Andamento' && !fechouAte(v)),
    aguardandoAdmissao: grupo(v => v.status_vaga === 'Andamento' && fechouAte(v)),
    congelada: grupo(v => v.status_vaga === 'Congelada')
  };
}

// Abertas e fechadas mês a mês de um ano (realizado da projeção).
export function mensal(vagas: Linha[], ano: number | string): { mes: number; abertas: number; fechadas: number }[] {
  const meses: { mes: number; abertas: number; fechadas: number }[] = [];
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    const de = `${ano}-${mm}-01`, ate = `${ano}-${mm}-31`;
    meses.push({
      mes: m,
      abertas: vagas.filter(v => entre(v.data_abertura, de, ate)).length,
      fechadas: vagas.filter(v => fechada(v) && entre(v.data_fechamento, de, ate)).length
    });
  }
  return meses;
}

export const _internal = { dias };
