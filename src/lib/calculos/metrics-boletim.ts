// Porte de legado/js/metrics-boletim.js (HUB_METRICS_BOLETIM).
//
// Indicadores → Boletim da Liderança: calcula, para um mês, todos os
// indicadores do boletim mensal enviado às lideranças — por OPERAÇÃO (cada
// boletim: Boti RJ, SG, JF, MG/3R, VD, Hering, Levi's, Escritório) e por LOJA
// (departamento do Feedz) dentro dela.
//
// Substitui a planilha "Dados_Boletim.xlsx": em vez de ~80 tabelas dinâmicas
// filtradas à mão a cada mês, tudo sai das mesmas tabelas que o Hub já carrega
// (colaboradores, feedbacks, 1:1, celebrações, Twygo, AvE, Pesquisa de
// Engajamento) + 3 bases agregadas próprias do boletim (humor, notas da
// pesquisa e pesquisa de satisfação — ver supabase-boletim.sql).
//
// Regras gerais (as mesmas para todas as operações, todos os meses):
//   • Totais da operação são PONDERADOS (soma dos numeradores ÷ soma dos
//     denominadores), nunca média simples das lojas.
//   • Feedback = PESSOAS que receberam ao menos um feedback de gestor no mês
//     (não quantidade de feedbacks) ÷ liderados ativos no fim do mês.
//   • Turnover = ((admissões + desligamentos) ÷ 2) ÷ headcount no início do mês
//     — mesma conta da tela Rotatividade.
//   • Nota da Pesquisa de Engajamento NÃO inclui a pergunta de NPS (escala 0-10).
//   • Nota por loja só aparece com MIN_RESPOSTAS_NOTA respondentes ou mais
//     (anonimato) — abaixo disso a loja entra no total da operação, mas não
//     aparece sozinha.
//
// Globais que viraram parâmetro (opcionais, no fim da assinatura; ausentes valem
// {} como no legado): HUB_DATA → `dados`; HUB_BOLETIM_DATA → `boletimDados`;
// HUB_EXPERIENCIA_DATA → `experiencia`. Os caches (contexto e memo de boletim())
// comparam os objetos recebidos do mesmo jeito que comparavam os globais.
// Nada de acesso a dados nem de tela aqui.
import * as U from '@/lib/calculos/utils';
import type { Linha } from '@/lib/calculos/utils';

const N = (s: unknown): string => U.normalizeText(s == null ? '' : s);

// ------------------------------------------------------------------
// Configuração do negócio
// ------------------------------------------------------------------
export const OPERACOES = [
  { id: 'boti-rj', nome: 'O Boticário RJ', saudacao: 'Liderança do O Boticário - Rio de Janeiro', artigo: 'O' },
  { id: 'boti-sg', nome: 'O Boticário SG', saudacao: 'Liderança do O Boticário - São Gonçalo', artigo: 'O' },
  { id: 'boti-jf', nome: 'O Boticário Juiz de Fora', saudacao: 'Liderança do O Boticário - Juiz de Fora e Valença', artigo: 'O' },
  { id: 'boti-mg', nome: 'O Boticário Interior de MG', saudacao: 'Liderança do O Boticário - Interior de Minas e Três Rios', artigo: 'O' },
  { id: 'boti-vd', nome: 'O Boticário VD', saudacao: 'Liderança do O Boticário VD', artigo: 'O' },
  { id: 'hering', nome: 'Hering', saudacao: 'Liderança da Hering', artigo: 'A' },
  { id: 'levis', nome: "Levi's", saudacao: "Liderança da Levi's", artigo: 'A' },
  { id: 'escritorio', nome: 'Escritório', saudacao: 'Liderança do Escritório', artigo: 'O' }
];
export const OP_POR_ID = new Map(OPERACOES.map(o => [o.id, o] as const));

// Lojas da unidade "Boticário - Rio de Janeiro" que vão no boletim de São Gonçalo.
const LOJAS_SG = new Set([
  'O Boticário Alcântara', 'O Boticário Carrefour', 'O Boticário Guanabara',
  'O Boticário Partage', 'O Boticário Rodo', 'O Boticário São Gonçalo Shop'
].map(N));

// Unidade + Departamento (como vêm do Feedz) → operação. Loja nova entra
// sozinha na operação certa; só uma loja nova de SG precisa entrar na lista acima.
export function operacaoDe(unidade: unknown, departamento: unknown): string | null {
  const u = N(unidade);
  if (!u) return null;
  if (u.startsWith('hering')) return 'hering';
  if (u.startsWith('levis') || u.startsWith("levi's")) return 'levis';
  if (u.startsWith('escritorio')) return 'escritorio';
  if (u.startsWith('boticario vd')) return 'boti-vd';
  if (u === 'boticario - interior de mg' || u === 'boticario - tres rios') return 'boti-mg';
  if (u === 'boticario - juiz de fora' || u === 'boticario - valenca') return 'boti-jf';
  if (u === 'boticario - rio de janeiro') return LOJAS_SG.has(N(departamento)) ? 'boti-sg' : 'boti-rj';
  if (u === 'quem disse, berenice?') return 'boti-rj';
  return null;
}

// Áreas de apoio (supervisão, comercial, logística) entram nos totais da
// operação, mas não nos rankings/gráficos de loja.
export function ehApoio(departamento: unknown, op: string): boolean {
  if (op === 'escritorio') return false;
  return /^(comercial|supervisao|logistica)/.test(N(departamento));
}

export function nomeCurto(departamento: unknown): string {
  return String(departamento || '')
    .replace(/^O Botic[aá]rio\s+/i, '')
    .replace(/^(Hering|Levis|Levi's)\s+/i, '')
    .replace(/\s*\(MG\)\s*$/i, '')
    .trim() || String(departamento || '');
}

// sentido: 'maior' = quanto maior melhor; 'menor' = quanto menor melhor.
// tipo: 'pct' (0-1, variação em p.p.), 'nota' (escala), 'int' (contagem).
export const INDICADORES: Record<string, Linha> = {
  feedback_adesao: { rotulo: 'Adesão aos feedbacks', tipo: 'pct', sentido: 'maior', meta: 1 },
  devolutiva_adesao: { rotulo: 'Feedback ou 1:1', tipo: 'pct', sentido: 'maior', meta: 1 },
  // Total da empresa no painel: feedback nas operações + feedback ou 1:1 no Escritório.
  feedback_painel: { rotulo: 'Feedback (empresa)', tipo: 'pct', sentido: 'maior', meta: 1 },
  oneonone_adesao: { rotulo: 'Adesão ao 1 on 1', tipo: 'pct', sentido: 'maior', meta: 1 },
  celebracoes: { rotulo: 'Celebrações de gestores', tipo: 'int', sentido: 'maior' },
  humor_media: { rotulo: 'Termômetro de Humor', tipo: 'nota', sentido: 'maior', meta: 3.5, casas: 1 },
  humor_participacao: { rotulo: 'Registro de humor', tipo: 'pct', sentido: 'maior' },
  engajamento_feedz: { rotulo: 'Engajamento na Feedz', tipo: 'pct', sentido: 'maior', meta: 1 },
  acessos_feedz: { rotulo: 'Acessos na Feedz', tipo: 'pct', sentido: 'maior', manual: true },
  turnover: { rotulo: 'Turnover', tipo: 'pct', sentido: 'menor', casas: 1 },
  ave45_gestor: { rotulo: 'AvE 45 — gestor', tipo: 'pct', sentido: 'maior', meta: 1 },
  ave45_auto: { rotulo: 'AvE 45 — autoavaliação', tipo: 'pct', sentido: 'maior', meta: 1 },
  ave90_gestor: { rotulo: 'AvE 90 — gestor', tipo: 'pct', sentido: 'maior', meta: 1 },
  ave90_auto: { rotulo: 'AvE 90 — autoavaliação', tipo: 'pct', sentido: 'maior', meta: 1 },
  satisfacao_respondentes: { rotulo: 'Gestores na Pesquisa de Satisfação', tipo: 'int', sentido: 'maior' },
  satisfacao_participacao: { rotulo: 'Adesão à Pesquisa de Satisfação', tipo: 'pct', sentido: 'maior', meta: 1 },
  pesquisa_nota: { rotulo: 'Nota da Pesquisa de Engajamento', tipo: 'nota', sentido: 'maior', meta: 4, saudavel: 3.5, casas: 1 },
  pesquisa_participacao: { rotulo: 'Participação na Pesquisa de Engajamento', tipo: 'pct', sentido: 'maior', meta: 0.6 },
  nps: { rotulo: 'eNPS', tipo: 'int', sentido: 'maior' },
  twygo_progresso: { rotulo: 'Twygo — progresso', tipo: 'pct', sentido: 'maior', meta: 0.9 },
  unibe_adesao: { rotulo: 'Unibê — adesão', tipo: 'pct', sentido: 'maior', meta: 0.9, manual: true },
  academia_pontos: { rotulo: 'Academia Hering — pontos', tipo: 'int', sentido: 'maior', manual: true }
};
export const META_CELEBRACOES_LOJA = 4;       // 1 por semana
// Usuários "robô" da Feedz (cópia de um usuário real, usada para publicar
// aniversários automaticamente): ficam fora das celebrações.
const USUARIOS_AUTOMATICOS = new Set(['Juliana Caldeira'].map(N));
// Tag (coluna Grupos do cadastro) dos gestores aptos a responder a Pesquisa de Satisfação.
const TAG_SATISFACAO = 'pesquisa.satisfacao';
export const MIN_RESPOSTAS_NOTA = 3;          // anonimato da nota por loja
export const PILARES = ['Satisfação', 'Bem-estar', 'Empoderamento', 'Crescimento pessoal', 'Cultura', 'Embaixador', 'Reconhecimento & Feedback', 'Conexão com colegas', 'Conexão com líder'];
export const AREAS_SUPORTE = ['Financeiro', 'Compras O Boticário', 'Compras Hering e Levis', 'Recrutamento e Seleção', 'DP', 'TI', 'Manutenção', 'Auditoria', 'Administrativo', 'Marketing', 'Jurídico', 'DHO', 'T&D', 'Suprimentos Indiretos'];

export function rotuloHumor(nota: number | null | undefined): string | null {
  if (nota == null) return null;
  if (nota >= 4.5) return 'Muito feliz';
  if (nota >= 4.0) return 'Feliz';
  if (nota >= 3.0) return 'Neutro';
  if (nota >= 2.0) return 'Triste';
  return 'Muito triste';
}

// ------------------------------------------------------------------
// Datas
// ------------------------------------------------------------------
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function inicioDoMes(mes: string): string { return mes + '-01'; }
export function fimDoMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
export function mesAnterior(mes: string): string {
  let [y, m] = mes.split('-').map(Number);
  m--; if (m < 1) { m = 12; y--; }
  return `${y}-${String(m).padStart(2, '0')}`;
}
export function nomeDoMes(mes: string, maiuscula?: boolean): string {
  const s = MESES[parseInt(mes.slice(5, 7), 10) - 1] || mes;
  return maiuscula ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
const iso = (v: unknown): string | null => (v == null || v === '') ? null : String(v).slice(0, 10);
const noMes = (d: unknown, mes: string): boolean => !!d && String(d).slice(0, 7) === mes;
const entre = (d: string | null, a: string, b: string): boolean => !!d && d >= a && d <= b;

// ------------------------------------------------------------------
// Pessoas e departamentos (índices montados uma vez por carga de dados)
// ------------------------------------------------------------------
let ctxCache: Linha | null = null;
function contexto(dados?: Linha | null): Linha {
  const colabs: Linha[] = (dados && dados.colaboradores) || [];
  if (ctxCache && ctxCache.ref === colabs) return ctxCache;
  const porNome = new Map();
  const cacheGestor = new Map();
  const porEmail = new Map();
  const preferir = (atual: Linha | undefined, novo: Linha): Linha => {
    if (!atual) return novo;
    const ativoA = N(atual.situacao) !== 'desligado', ativoN = N(novo.situacao) !== 'desligado';
    if (ativoN !== ativoA) return ativoN ? novo : atual;
    return (iso(novo.data_admissao) || '') > (iso(atual.data_admissao) || '') ? novo : atual;
  };
  const depOps = new Map();
  let atualizado: string | null = null;
  for (const c of colabs) {
    for (const k of [N(c.nome_completo), N(c.nome)]) if (k) porNome.set(k, preferir(porNome.get(k), c));
    if (c.email) porEmail.set(N(c.email), preferir(porEmail.get(N(c.email)), c));
    const op = operacaoDe(c.unidade, c.departamento);
    if (op && c.departamento) {
      const k = N(c.departamento);
      if (!depOps.has(k)) depOps.set(k, new Map());
      depOps.get(k).set(op, (depOps.get(k).get(op) || 0) + 1);
    }
    if (c.updated_at && (!atualizado || c.updated_at > atualizado)) atualizado = c.updated_at;
  }
  ctxCache = {
    ref: colabs, colabs, atualizado: atualizado ? String(atualizado).slice(0, 10) : null,
    pessoa(nome: unknown, email?: unknown) {
      if (email && porEmail.has(N(email))) return porEmail.get(N(email));
      return nome ? porNome.get(N(nome)) || null : null;
    },
    // Gestor direto como vem no cadastro, às vezes abreviado ("Odir Garcez" =
    // "Odir Luiz Ferreira Garcez"): nome exato; senão, primeiro + último nome,
    // desde que só uma pessoa bata.
    gestor(nome: unknown) {
      const k = N(nome);
      if (!k) return null;
      if (cacheGestor.has(k)) return cacheGestor.get(k);
      let g = porNome.get(k) || null;
      if (!g) {
        const t = k.split(/\s+/);
        const achados = t.length > 1 ? Array.from(new Set(colabs.filter(c => { const u = N(c.nome_completo).split(/\s+/); return u.length > 1 && u[0] === t[0] && u[u.length - 1] === t[t.length - 1]; }))) : [];
        const ativos = achados.filter(c => N(c.situacao) !== 'desligado');
        g = ativos.length === 1 ? ativos[0] : achados.length === 1 ? achados[0] : null;
      }
      cacheGestor.set(k, g);
      return g;
    },
    // Departamento sem unidade (1:1, Twygo): operação só se o nome do departamento for único.
    opDoDepartamento(dep: unknown) {
      const m = depOps.get(N(dep));
      if (!m || m.size !== 1) return null;
      return Array.from(m.keys())[0];
    }
  };
  return ctxCache;
}

function ativoEm(c: Linha, dataISO: string): boolean {
  const adm = iso(c.data_admissao);
  if (!adm || adm > dataISO) return false;
  if (N(c.situacao) !== 'desligado') return true;
  const fim = iso(c.ultimo_dia_trabalhado) || adm;
  return fim > dataISO;
}

// ------------------------------------------------------------------
// Acumulador por loja
// ------------------------------------------------------------------
function novaLoja(op: string, dep: string): Linha {
  return {
    op, departamento: dep, nome: nomeCurto(dep), apoio: ehApoio(dep, op),
    hc_inicio: 0, hc_fim: 0, liderados: 0, gestores: 0, adm: 0, dem: 0,
    acessou: 0, acc_n: 0, acc_hc: 0, fb_env: 0, oo_n: 0, fb_recebeu: new Set(), fb_total: 0, oo: new Set(), oo_lid: new Set(), devolutiva: new Set(),
    fb_part: new Set(), cel_part: new Set(), cel_gestores: 0, cel_total: 0, cel_semanas: [0, 0, 0, 0, 0],
    hum_soma: 0, hum_reg: 0, hum_pessoas: 0,
    ave45: { tot: 0, g: 0, a: 0 }, ave90: { tot: 0, g: 0, a: 0 }, ave_gestores: new Map(),
    pq_conv: 0, pq_conv_ok: false, pq_resp: 0, pq_soma: 0, pq_n: 0, pilares: {},
    nps_n: 0, nps_prom: 0, nps_det: 0, nps_soma: 0,
    sat_resp: 0, sat_aptos: 0, sat_areas: {},
    tw_insc: 0, tw_prog: 0, tw_pessoas: new Set(),
    manual: {}
  };
}

function chavePessoa(c: Linha | null | undefined): string | null { return c ? (c.external_id || N(c.email) || N(c.nome_completo || c.nome)) : null; }

// ------------------------------------------------------------------
// Cálculo de um mês
// ------------------------------------------------------------------
export function calcularMes(mes: string, opts?: Linha | null, dados?: Linha | null, boletimDados?: Linha | null, experiencia?: Linha | null): Linha {
  opts = opts || {};
  const ctx = contexto(dados);
  const D = dados || {};
  const B = boletimDados || {};
  const ini = inicioDoMes(mes), fim = fimDoMes(mes);
  const lojas = new Map();
  const avisos: Linha[] = [];
  const naoEncontrados = { feedback: new Map(), celebracao: new Map(), departamento: new Map() };
  const conta = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) || 0) + 1);

  function loja(op: string | null | undefined, dep: unknown): Linha | null {
    if (!op) return null;
    const label = String(dep || 'Sem departamento').trim();
    const k = op + '|' + N(label);
    if (!lojas.has(k)) lojas.set(k, novaLoja(op, label));
    return lojas.get(k);
  }
  function lojaDe(unidade: unknown, dep: unknown): Linha | null {
    const op = operacaoDe(unidade, dep) || (dep ? ctx.opDoDepartamento(dep) : null);
    if (!op) { if (unidade || dep) conta(naoEncontrados.departamento, `${unidade || '—'} / ${dep || '—'}`); return null; }
    return loja(op, dep);
  }
  const lojaDaPessoa = (c: Linha | null | undefined) => c ? lojaDe(c.unidade, c.departamento) : null;

  // Último acesso é uma FOTO do dia do upload de Colaboradores: só vale para
  // o mês dessa foto (para meses anteriores use o boletim fechado).
  const acessoValido = !!ctx.atualizado && ctx.atualizado.slice(0, 7) === mes;

  // Abrangência dos feedbacks POR LIDERANÇA (gestor direto do cadastro): uma
  // loja pode ter mais de um time (ex.: VD com gerente de venda direta,
  // gerente de atendimento e coordenador de logística).
  const lideres = new Map();
  const nomeLider = (c: Linha) => { const g = ctx.gestor(c.gestor_direto); return g ? String(g.nome_completo || g.nome).trim() : (String(c.gestor_direto || '').trim() || 'Sem gestor direto'); };
  function liderDe(c: Linha, l: Linha): Linha {
    const nome = nomeLider(c);
    const k = l.op + '|' + N(nome);
    if (!lideres.has(k)) lideres.set(k, { op: l.op, gestor: nome, liderados: new Set(), receberam: new Set(), feedbacks: 0, lojas: new Map() });
    const x = lideres.get(k);
    x.lojas.set(l.nome, (x.lojas.get(l.nome) || 0) + 1);
    return x;
  }

  // 1. Quadro, admissões, desligamentos, acessos
  for (const c of ctx.colabs) {
    const l = lojaDaPessoa(c);
    if (!l) continue;
    if (ativoEm(c, ini)) l.hc_inicio++;
    const ativoFim = ativoEm(c, fim);
    if (ativoFim) {
      l.hc_fim++;
      const papel = N(c.papel);
      if (papel === 'colaborador') { l.liderados++; liderDe(c, l).liderados.add(chavePessoa(c)); }
      else if (papel === 'gestor') l.gestores++;
      if (String(c.grupos || '').split(/[,;]/).some(g => N(g) === TAG_SATISFACAO)) l.sat_aptos++;
      if (acessoValido && iso(c.ultimo_acesso) && (iso(c.ultimo_acesso) as string) >= ini) l.acessou++;
    }
    if (noMes(iso(c.data_admissao), mes)) l.adm++;
    if (N(c.situacao) === 'desligado' && noMes(iso(c.ultimo_dia_trabalhado) || iso(c.data_admissao), mes)) l.dem++;
  }

  // 2. Feedbacks de gestores
  for (const f of (D.feedbacks || [])) {
    if (!noMes(iso(f.data), mes)) continue;
    const de = ctx.pessoa(f.de);
    if (!de) { conta(naoEncontrados.feedback, f.de || '—'); continue; }
    // Engajamento na Feedz: feedbacks ENVIADOS por qualquer pessoa da loja (gestor ou colaborador).
    const lde = lojaDaPessoa(de);
    if (lde) lde.fb_env++;
    if (N(de.papel) !== 'gestor') continue;
    const para = ctx.pessoa(f.para);
    const l = para ? lojaDaPessoa(para) : lojaDe(f.unidade, f.departamento);
    if (!l) continue;
    l.fb_total++;
    const kp = chavePessoa(para) || N(f.para);
    if (para && ativoEm(para, fim) && N(para.papel) === 'colaborador') {
      l.fb_recebeu.add(kp); l.devolutiva.add(kp);
      // Por liderança: só o feedback que o próprio gestor direto deu ao liderado.
      const lider = lideres.get(l.op + '|' + N(nomeLider(para)));
      if (lider && ctx.gestor(para.gestor_direto) === de) { lider.receberam.add(kp); lider.feedbacks++; }
    }
    l.fb_part.add(kp);
    const ld = lojaDaPessoa(de);
    if (ld) ld.fb_part.add(chavePessoa(de));
  }

  // 3. 1:1 realizados
  for (const o of (D.one_on_one || [])) {
    if (N(o.status) !== 'realizado' || !noMes(iso(o.data_realizada), mes)) continue;
    const liderado = ctx.pessoa(o.liderado, o.liderado_email);
    const l = liderado ? lojaDaPessoa(liderado) : lojaDe(null, o.departamento);
    if (!l) continue;
    l.oo_n++;
    const kp = chavePessoa(liderado) || N(o.liderado);
    l.oo.add(kp);
    if (liderado && ativoEm(liderado, fim) && N(liderado.papel) === 'colaborador') { l.devolutiva.add(kp); l.oo_lid.add(kp); }
  }

  // 4. Celebrações. O export do Feedz repete a celebração em uma linha por
  // destinatário (mesmo "codigo"): conta-se a CELEBRAÇÃO, não a linha. Para o
  // boletim, só vale a celebração do gestor (papel do remetente) para o
  // PRÓPRIO TIME: algum destinatário é liderado direto dele, é da mesma loja
  // ou é "@todos". Usuários automáticos (aniversários) não contam.
  const celebracoes = new Map();
  for (const r of (D.celebracoes || [])) {
    if (!noMes(iso(r.data), mes)) continue;
    if (USUARIOS_AUTOMATICOS.has(N(r.colaborador_enviou))) continue;
    const k = r.codigo || [iso(r.data), N(r.colaborador_enviou), N(r.mensagem).slice(0, 80)].join('|');
    if (!celebracoes.has(k)) celebracoes.set(k, []);
    celebracoes.get(k).push(r);
  }
  for (const linhas of celebracoes.values()) {
    const r = linhas[0];
    const remetente = ctx.pessoa(r.colaborador_enviou);
    // Loja de quem enviou, como vem no export; se a linha vier sem departamento,
    // usa o do cadastro do remetente (senão cairia em "Sem departamento").
    const l = String(r.departamento || '').trim() ? lojaDe(r.unidade, r.departamento) : (lojaDaPessoa(remetente) || (r.unidade ? lojaDe(r.unidade, null) : null));
    if (!remetente && !r.departamento) conta(naoEncontrados.celebracao, r.colaborador_enviou || '—');
    const destinatarios: Linha[] = [];
    let todos = false;
    for (const x of linhas) {
      for (const nome of String(x.colaboradores_receberam || '').split(/[,;\n]+/)) {
        if (!nome.trim()) continue;
        if (N(nome) === 'todos') { todos = true; continue; }
        const p = ctx.pessoa(nome.trim());
        if (p) destinatarios.push(p);
      }
    }
    for (const p of destinatarios) {
      const lr = lojaDaPessoa(p);
      if (lr) lr.cel_part.add(chavePessoa(p));
    }
    if (!l) continue;
    l.cel_total++;
    l.cel_part.add(chavePessoa(remetente) || N(r.colaborador_enviou));
    if (N(r.papel || (remetente && remetente.papel)) !== 'gestor') continue;
    const doTime = todos || destinatarios.some(p =>
      N(p.gestor_direto) === N(r.colaborador_enviou) ||
      (remetente && ctx.gestor(p.gestor_direto) === remetente) ||
      N(p.departamento) === N(r.departamento || (remetente && remetente.departamento)));
    if (doTime) {
      l.cel_gestores++;
      // Semana do mês (1-7, 8-14, 15-21, 22-28, 29 em diante): meta é 1 por semana.
      l.cel_semanas[Math.min(4, Math.floor((Number(String(iso(r.data)).slice(8, 10)) - 1) / 7))]++;
    }
  }

  // 5. Termômetro de Humor (base agregada por mês/unidade/departamento)
  const humorDoMes = (B.humor_mensal || []).filter((h: Linha) => noMes(iso(h.mes), mes));
  for (const h of humorDoMes) {
    const l = lojaDe(h.unidade, h.departamento);
    if (!l) continue;
    l.hum_soma += Number(h.soma) || 0;
    l.hum_reg += Number(h.registros) || 0;
    l.hum_pessoas += Number(h.pessoas) || 0;
  }

  // 6. Avaliação da Experiência — quem VENCE o ciclo no mês. O dia da
  // admissão conta como 1º dia: vencimento = admissão + 44 (ou + 89), igual à
  // planilha "AVE 45 E 90 DIAS".
  const exp = experiencia || {};
  for (const ciclo of [45, 90]) {
    const rows = exp[ciclo];
    if (!rows) continue;
    for (const r of rows) {
      const venc = U.addDays(iso(r.data_admissao), ciclo - 1);
      if (!noMes(venc, mes)) continue;
      const p = ctx.pessoa(r.nome);
      if (p && N(p.situacao) === 'desligado' && (iso(p.ultimo_dia_trabalhado) || '') < (venc as string)) continue;
      const l = lojaDe(r.unidade, r.departamento) || lojaDaPessoa(p);
      if (!l) continue;
      const a = l['ave' + ciclo];
      const okG = N(r.status_gestor) === 'concluida', okA = N(r.status_auto) === 'concluida';
      a.tot++;
      if (okG) a.g++;
      if (okA) a.a++;
      // Nominal por gestor avaliador: quantas avaliações venceram, quantas ele respondeu.
      const gestor = String(r.gestor_avaliador || r.gestor || r.gestor_direto || '').trim() || 'Sem gestor informado';
      if (!l.ave_gestores.has(N(gestor))) l.ave_gestores.set(N(gestor), { gestor, 45: { tot: 0, g: 0, a: 0 }, 90: { tot: 0, g: 0, a: 0 } });
      const x = l.ave_gestores.get(N(gestor))[ciclo];
      x.tot++; if (okG) x.g++; if (okA) x.a++;
    }
  }

  // 7. Pesquisa de Engajamento — pulso que começa no mês (ou termina nele)
  const pulsos: Linha[] = (D.engajamento_pulso || []).slice().sort((a: Linha, b: Linha) => a.inicio.localeCompare(b.inicio));
  const pulso = pulsos.filter(p => noMes(p.inicio, mes)).pop() || pulsos.filter(p => noMes(p.fim, mes)).pop() || null;
  if (pulso) {
    for (const r of (D.engajamento_participacao || [])) {
      if (r.pulso_inicio !== pulso.inicio) continue;
      const l = lojaDe(r.unidade, r.departamento);
      if (!l) continue;
      l.pq_resp += Number(r.respondentes) || 0;
      if (r.convidados != null) { l.pq_conv += Number(r.convidados) || 0; l.pq_conv_ok = true; }
    }
  }
  const janela: string[] = pulso ? [pulso.inicio, pulso.fim] : [ini, fim];
  for (const r of (B.engajamento_notas || [])) {
    if (!entre(iso(r.dia), janela[0], janela[1])) continue;
    const l = lojaDe(r.unidade, r.departamento);
    if (!l) continue;
    const n = Number(r.n) || 0, s = Number(r.soma) || 0;
    if (N(r.dimensao) === 'nps') {
      l.nps_n += n; l.nps_soma += s; l.nps_prom += Number(r.promotores) || 0; l.nps_det += Number(r.detratores) || 0;
    } else {
      l.pq_soma += s; l.pq_n += n;
      const p = l.pilares[r.dimensao] || (l.pilares[r.dimensao] = { s: 0, n: 0 });
      p.s += s; p.n += n;
    }
  }

  // 8. Pesquisa de Satisfação com o Suporte do Escritório (gestores)
  for (const r of (B.satisfacao_suporte || [])) {
    if (!noMes(iso(r.pesquisa), mes)) continue;
    const l = lojaDe(r.unidade, r.departamento);
    if (!l) continue;
    l.sat_resp += Number(r.respondentes) || 0;
    const areas = r.areas || {};
    for (const a of Object.keys(areas)) {
      const x = l.sat_areas[a] || (l.sat_areas[a] = { s: 0, n: 0 });
      x.s += Number(areas[a].soma) || 0; x.n += Number(areas[a].n) || 0;
    }
  }

  // 9. Twygo — foto atual (inscrições confirmadas, ambiente ativo)
  for (const r of (D.twygo_participantes || [])) {
    if (N(r.situacao_ambiente) === 'inativo' || !N(r.situacao_inscricao).includes('confirmad')) continue;
    const p = ctx.pessoa(r.nome_completo, r.email);
    const l = lojaDaPessoa(p) || lojaDe(r.unidade, r.departamento);
    if (!l) continue;
    l.tw_insc++;
    l.tw_prog += Number(r.progresso) || 0;
    l.tw_pessoas.add(chavePessoa(p) || N(r.email || r.nome_completo));
  }

  // 10. Unibê e Academia Hering: a planilha do mês (upload com mês de
  // referência, supabase-treinamentos.sql) vale no lugar do valor digitado —
  // o campo manual só conta quando o mês não tem planilha. Unibê: adesão
  // oficial de cada PDV (aba PDV); loja e operação = média dos PDVs. Academia:
  // performance média das pessoas (loja e operação ponderadas por pessoa).
  const unibeMes = (D.unibe_pdv || []).filter((r: Linha) => noMes(iso(r.mes), mes));
  const academiaMes = (D.academia_hering || []).filter((r: Linha) => noMes(iso(r.mes), mes));
  const daPlanilha: Record<string, boolean> = { unibe_adesao: unibeMes.length > 0, academia_pontos: academiaMes.length > 0 };
  const planilhaOp: Linha = {};
  const acumular = (alvo: Linha, ind: string, v: number) => { const x = alvo[ind] || (alvo[ind] = { s: 0, n: 0 }); x.s += v; x.n++; };
  for (const [ind, rows, campo] of [['unibe_adesao', unibeMes, 'adesao'], ['academia_pontos', academiaMes, 'performance']] as [string, Linha[], string][]) {
    for (const r of rows) {
      if (r[campo] == null) continue;
      const l = lojaDe(r.unidade, r.departamento);
      if (!l) continue;
      acumular(l.treino || (l.treino = {}), ind, Number(r[campo]));
      acumular(planilhaOp[l.op] || (planilhaOp[l.op] = {}), ind, Number(r[campo]));
    }
  }
  for (const l of lojas.values()) for (const [ind, x] of Object.entries((l.treino || {}) as Linha)) l.manual[ind] = x.s / x.n;

  // 11. Entradas manuais (Unibê e Academia Hering sem planilha no mês, acessos da Feedz)
  const manuais = (B.entradas || []).filter((e: Linha) => noMes(iso(e.mes), mes) && !daPlanilha[e.indicador]);
  const manuaisOp: Linha = {};
  for (const [op, inds] of Object.entries(planilhaOp)) {
    manuaisOp[op] = {};
    for (const [ind, x] of Object.entries(inds as Linha)) manuaisOp[op][ind] = x.s / x.n;
  }
  for (const e of manuais) {
    if (e.loja) {
      const l = loja(e.operacao, e.loja);
      if (l) l.manual[e.indicador] = Number(e.valor);
    } else {
      (manuaisOp[e.operacao] || (manuaisOp[e.operacao] = {}))[e.indicador] = Number(e.valor);
    }
  }

  // ---- Consolidação ----
  const porOp: Record<string, Linha> = {};
  for (const op of OPERACOES) porOp[op.id] = { op, lojas: [], soma: novaLoja(op.id, 'Total') };
  for (const l of lojas.values()) {
    const g = porOp[l.op];
    if (!g) continue;
    // Loja que não tem ninguém nem nada no mês não aparece.
    const temAlgo = l.hc_fim || l.hc_inicio || l.dem || l.fb_total || l.cel_total || l.hum_reg || l.ave45.tot || l.ave90.tot || l.pq_resp || l.pq_n || l.sat_resp || l.tw_insc || Object.keys(l.manual).length;
    if (!temAlgo) continue;
    // Acessos (componente do engajamento): o % do painel da Feedz informado em
    // Valores manuais; sem ele, a foto de Colaboradores, só no mês da foto.
    if (l.manual.acessos_feedz != null && l.hc_fim) { l.acc_n = l.manual.acessos_feedz * l.hc_fim; l.acc_hc = l.hc_fim; }
    else if (acessoValido && l.hc_fim) { l.acc_n = l.acessou; l.acc_hc = l.hc_fim; }
    g.lojas.push(l);
    somarEm(g.soma, l);
  }

  const resultado: Linha = { mes, ini, fim, pulso, acessoValido, fotoColaboradores: ctx.atualizado, operacoes: {}, avisos };
  for (const op of OPERACOES) {
    const g = porOp[op.id];
    const lojasOut = g.lojas.map((l: Linha) => ({
      departamento: l.departamento, nome: l.nome, apoio: l.apoio, base: base(l),
      ind: derivar(l, { loja: true, acessoValido }),
      cel_semanas: l.cel_semanas.slice(),
      ave_gestores: Array.from(l.ave_gestores.values() as Iterable<Linha>).sort((a, b) => a.gestor.localeCompare(b.gestor, 'pt-BR'))
    })).sort((a: Linha, b: Linha) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const lojasReais: Linha[] = g.lojas.filter((l: Linha) => !l.apoio && (l.hc_fim || l.hc_inicio));
    const ind = derivar(g.soma, { loja: false, acessoValido });
    // Total só está completo quando todas as lojas têm os acessos informados.
    ind.engajamento_completo = lojasReais.every(l => l.acc_hc);
    ind.celebracoes_lojas_meta = lojasReais.filter(l => l.cel_gestores >= META_CELEBRACOES_LOJA).length;
    ind.celebracoes_lojas = lojasReais.length;
    Object.assign(ind, manuaisOp[op.id] || {});
    const feedbackLideres = Array.from(lideres.values()).filter(x => x.op === op.id && x.liderados.size).map(x => ({
      gestor: x.gestor, loja: Array.from(x.lojas.entries() as Iterable<[string, number]>).sort((a, b) => b[1] - a[1])[0][0],
      liderados: x.liderados.size, receberam: x.receberam.size, feedbacks: x.feedbacks, adesao: x.receberam.size / x.liderados.size
    })).sort((a, b) => a.loja.localeCompare(b.loja, 'pt-BR') || b.liderados - a.liderados);
    resultado.operacoes[op.id] = { id: op.id, op, base: base(g.soma), ind, lojas: lojasOut, feedback_lideres: feedbackLideres };
  }
  // A Pesquisa de Satisfação avalia o Escritório: no boletim dele entram as
  // respostas de TODAS as operações (gestores com a tag pesquisa.satisfação no cadastro).
  const empresa = novaLoja('escritorio', 'Empresa');
  for (const op of OPERACOES) for (const l of porOp[op.id].lojas) { empresa.sat_resp += l.sat_resp; empresa.sat_aptos += l.sat_aptos; for (const [a, p] of Object.entries(l.sat_areas as Linha)) { const x = empresa.sat_areas[a] || (empresa.sat_areas[a] = { s: 0, n: 0 }); x.s += p.s; x.n += p.n; } }
  // Total da empresa: todas as lojas de todas as operações, ponderado (soma dos
  // numeradores ÷ soma dos denominadores). Feedback e o módulo de feedback do
  // engajamento seguem cada operação: no Escritório valem feedback ou 1:1 e o 1:1.
  const emp = novaLoja('empresa', 'Total da empresa');
  for (const op of OPERACOES) for (const l of porOp[op.id].lojas) somarEm(emp, l);
  const indE = derivar(emp, { loja: false, acessoValido });
  const so = porOp.escritorio.soma, outras = OPERACOES.filter(o => o.id !== 'escritorio').map(o => porOp[o.id].soma);
  indE.feedback_painel = cap1(div(outras.reduce((t, x) => t + x.fb_recebeu.size, 0) + so.devolutiva.size, emp.liderados));
  const compE = Object.assign({}, indE.engajamento_componentes);
  compE.feedbacks = cap1(div(outras.reduce((t, x) => t + x.fb_env, 0) + so.oo_n, emp.hc_fim));
  const valsE = Object.values(compE as Linha).filter(v => v != null);
  indE.engajamento_componentes = compE;
  indE.engajamento_feedz = valsE.length ? valsE.reduce((t, v) => t + v, 0) / valsE.length : null;
  indE.engajamento_completo = OPERACOES.every(o => porOp[o.id].lojas.filter((l: Linha) => !l.apoio && l.hc_fim).every((l: Linha) => l.acc_hc));
  // Pesquisa de Satisfação: base = gestores aptos de todas as operações.
  resultado.empresa = { id: 'empresa', op: { id: 'empresa', nome: 'Total da empresa' }, base: base(emp), ind: indE, lojas: [] };

  const esc = resultado.operacoes.escritorio;
  const indEmp = derivar(empresa, { loja: false, acessoValido });
  for (const k of ['satisfacao_respondentes', 'satisfacao_participacao', 'satisfacao_areas']) esc.ind[k] = indEmp[k];
  esc.base.satisfacao_respondentes = empresa.sat_resp;
  esc.base.satisfacao_aptos = empresa.sat_aptos;
  esc.ind.satisfacao_empresa = true;

  // Avisos de qualidade dos dados
  const topo = (m: Map<string, number>, n?: number) => Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, n || 8);
  if (naoEncontrados.feedback.size) avisos.push({ tipo: 'alerta', area: 'Feedbacks', texto: `${sum(naoEncontrados.feedback)} feedback(s) no mês de pessoas que não estão no cadastro de Colaboradores (não entram na adesão): ` + topo(naoEncontrados.feedback).map(([n, q]) => `${n} (${q})`).join(', ') + '.' });
  if (naoEncontrados.celebracao.size) avisos.push({ tipo: 'alerta', area: 'Celebrações', texto: `${sum(naoEncontrados.celebracao)} celebração(ões) sem unidade/departamento e com remetente fora do cadastro: ` + topo(naoEncontrados.celebracao).map(([n, q]) => `${n} (${q})`).join(', ') + '.' });
  if (naoEncontrados.departamento.size) avisos.push({ tipo: 'info', area: 'Lojas', texto: 'Unidade/departamento sem operação definida (ficam fora dos boletins): ' + topo(naoEncontrados.departamento, 10).map(([n, q]) => `${n} (${q})`).join('; ') + '.' });
  if (!humorDoMes.length) avisos.push({ tipo: 'alerta', area: 'Humor', texto: `Sem registros do Termômetro de Humor para ${nomeDoMes(mes)} — envie a planilha "36. Humor" em Administração → Upload de Planilhas.` });
  if (!pulso) avisos.push({ tipo: 'alerta', area: 'Pesquisa de Engajamento', texto: `Nenhum pulso da Pesquisa de Engajamento começa em ${nomeDoMes(mes)} — envie a planilha "33. Pesquisa de Engajamento" atualizada.` });
  else if (!(B.engajamento_notas || []).some((r: Linha) => entre(iso(r.dia), janela[0], janela[1]))) avisos.push({ tipo: 'alerta', area: 'Pesquisa de Engajamento', texto: 'O pulso do mês tem participação, mas não tem as notas — reenvie a planilha "33. Pesquisa de Engajamento" (as notas vêm da aba Respostas).' });
  if (!(B.satisfacao_suporte || []).some((r: Linha) => noMes(iso(r.pesquisa), mes))) avisos.push({ tipo: 'alerta', area: 'Pesquisa de Satisfação', texto: `Sem respostas da Pesquisa de Satisfação de ${nomeDoMes(mes)} — envie a planilha "16. Base Pesquisa Feedz" (Pesquisa de Satisfação).` });
  if (!exp[45] || !exp[90]) avisos.push({ tipo: 'info', area: 'AvE', texto: 'Avaliação da Experiência ainda carregando.' });
  const semAcesso = OPERACOES.map(o => [o.nome, porOp[o.id].lojas.filter((l: Linha) => !l.apoio && l.hc_fim && !l.acc_hc).length]).filter(x => x[1]);
  if (semAcesso.length) avisos.push({ tipo: 'alerta', area: 'Engajamento na Feedz', texto: `Lojas/áreas sem o % de Acessos da Feedz em Valores manuais (${semAcesso.map(([n, q]) => `${n}: ${q}`).join('; ')}). Nelas o engajamento usa só os outros 3 módulos.` + (ctx.atualizado ? ` A foto de Colaboradores (${U.fmtDateBR(ctx.atualizado)}) só preenche os acessos de ${nomeDoMes(ctx.atualizado.slice(0, 7))}.` : '') });
  return resultado;
}

function sum(m: Map<string, number>): number { let s = 0; for (const v of m.values()) s += v; return s; }

function somarEm(t: Linha, l: Linha): void {
  for (const k of ['hc_inicio', 'hc_fim', 'liderados', 'gestores', 'adm', 'dem', 'acessou', 'acc_n', 'acc_hc', 'fb_env', 'oo_n', 'fb_total', 'cel_gestores', 'cel_total', 'hum_soma', 'hum_reg', 'hum_pessoas', 'pq_conv', 'pq_resp', 'pq_soma', 'pq_n', 'nps_n', 'nps_prom', 'nps_det', 'nps_soma', 'sat_resp', 'sat_aptos', 'tw_insc', 'tw_prog']) t[k] += l[k];
  t.pq_conv_ok = t.pq_conv_ok || l.pq_conv_ok;
  for (const k of ['fb_recebeu', 'oo', 'oo_lid', 'devolutiva', 'fb_part', 'cel_part', 'tw_pessoas']) for (const v of l[k]) t[k].add(l.op + '|' + v);
  l.cel_semanas.forEach((v: number, i: number) => { t.cel_semanas[i] += v; });
  for (const c of ['ave45', 'ave90']) for (const k of ['tot', 'g', 'a']) t[c][k] += l[c][k];
  for (const [d, p] of Object.entries(l.pilares as Linha)) { const x = t.pilares[d] || (t.pilares[d] = { s: 0, n: 0 }); x.s += p.s; x.n += p.n; }
  for (const [a, p] of Object.entries(l.sat_areas as Linha)) { const x = t.sat_areas[a] || (t.sat_areas[a] = { s: 0, n: 0 }); x.s += p.s; x.n += p.n; }
}

// Números brutos (numeradores/denominadores) — mostrados nas tabelas e no "ver conta".
function base(l: Linha): Linha {
  return {
    hc_inicio: l.hc_inicio, hc_fim: l.hc_fim, liderados: l.liderados, gestores: l.gestores,
    admissoes: l.adm, desligamentos: l.dem,
    feedback_pessoas: l.fb_recebeu.size, feedbacks: l.fb_total, oneonone_pessoas: l.oo.size, oneonone_liderados: l.oo_lid.size, devolutiva_pessoas: l.devolutiva.size,
    celebracoes_total: l.cel_total, humor_registros: l.hum_reg, humor_pessoas: l.hum_pessoas,
    ave45_total: l.ave45.tot, ave45_gestor: l.ave45.g, ave45_auto: l.ave45.a,
    ave90_total: l.ave90.tot, ave90_gestor: l.ave90.g, ave90_auto: l.ave90.a,
    pesquisa_convidados: l.pq_conv_ok ? l.pq_conv : null, pesquisa_respondentes: l.pq_resp, pesquisa_respostas: l.pq_n,
    nps_respostas: l.nps_n, nps_promotores: l.nps_prom, nps_detratores: l.nps_det,
    satisfacao_respondentes: l.sat_resp, satisfacao_aptos: l.sat_aptos, twygo_inscricoes: l.tw_insc, twygo_pessoas: l.tw_pessoas.size,
    acessos: l.acc_hc ? Math.round(l.acc_n) : null, feedbacks_enviados: l.fb_env, oneonone_realizados: l.oo_n
  };
}

const div = (a: number, b: number): number | null => b ? a / b : null;
const cap1 = (v: number | null): number | null => v == null ? null : Math.min(1, v);

function derivar(l: Linha, o: Linha): Linha {
  const ind: Linha = {};
  ind.feedback_adesao = cap1(div(l.fb_recebeu.size, l.liderados));
  ind.devolutiva_adesao = cap1(div(l.devolutiva.size, l.liderados));
  ind.oneonone_adesao = cap1(div(l.oo_lid.size, l.liderados));
  ind.celebracoes = l.cel_gestores;
  ind.humor_media = div(l.hum_soma, l.hum_reg);
  ind.humor_participacao = cap1(div(l.hum_pessoas, l.hc_fim));
  // Engajamento na Feedz = média dos módulos do Painel de Engajamento, com as
  // contas da Feedz (cada um limitado a 100%, base = colaboradores ativos):
  // acessos (% que acessou, informado em Valores manuais), feedbacks enviados ÷
  // ativos, celebrações enviadas (loja inteira) ÷ ativos e registros de humor ÷
  // (10 × ativos). No Escritório, 1:1 realizados ÷ ativos no lugar dos feedbacks.
  // Somam-se a participação na Pesquisa de Engajamento, na Pesquisa de
  // Satisfação e na Avaliação de Experiência (gestor e autoavaliação).
  const comp: Linha = { acessos: l.acc_hc ? cap1(l.acc_n / l.acc_hc) : null };
  if (l.op === 'escritorio') comp.oneonone = cap1(div(l.oo_n, l.hc_fim));
  else comp.feedbacks = cap1(div(l.fb_env, l.hc_fim));
  comp.celebracoes = cap1(div(l.cel_total, l.hc_fim));
  comp.humor = cap1(div(l.hum_reg, 10 * l.hc_fim));
  // Participação nas pesquisas e na AvE do mês. Módulo que não se aplica à loja
  // no mês (sem pulso, sem gestor apto, ninguém venceu a AvE) fica fora da média.
  comp.pesquisa = l.pq_conv_ok && l.pq_conv ? cap1(l.pq_resp / l.pq_conv) : null;
  comp.satisfacao = l.sat_aptos ? cap1(l.sat_resp / l.sat_aptos) : null;
  const aveTot = l.ave45.tot + l.ave90.tot;
  comp.ave = aveTot ? (l.ave45.g + l.ave45.a + l.ave90.g + l.ave90.a) / (2 * aveTot) : null;
  ind.engajamento_componentes = comp;
  const vals = Object.values(comp).filter(v => v != null);
  ind.engajamento_feedz = l.hc_fim && vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  ind.engajamento_completo = comp.acessos != null;
  ind.turnover = div((l.adm + l.dem) / 2, l.hc_inicio);
  ind.ave45_gestor = div(l.ave45.g, l.ave45.tot);
  ind.ave45_auto = div(l.ave45.a, l.ave45.tot);
  ind.ave90_gestor = div(l.ave90.g, l.ave90.tot);
  ind.ave90_auto = div(l.ave90.a, l.ave90.tot);
  ind.satisfacao_respondentes = l.sat_resp;
  ind.satisfacao_participacao = cap1(div(l.sat_resp, l.sat_aptos));
  ind.satisfacao_areas = {};
  for (const [a, x] of Object.entries(l.sat_areas as Linha)) ind.satisfacao_areas[a] = div(x.s, x.n);
  ind.pesquisa_participacao = l.pq_conv_ok ? cap1(div(l.pq_resp, l.pq_conv)) : null;
  const poucas = o.loja && l.pq_resp < MIN_RESPOSTAS_NOTA;
  ind.pesquisa_oculta = !!(poucas && l.pq_n);
  ind.pesquisa_nota = poucas ? null : div(l.pq_soma, l.pq_n);
  // Nota sem a regra de anonimato — só exibida quando o usuário marca a opção na tela.
  ind.pesquisa_nota_bruta = div(l.pq_soma, l.pq_n);
  ind.pilares = {};
  if (!poucas) for (const [d, x] of Object.entries(l.pilares as Linha)) ind.pilares[d] = div(x.s, x.n);
  ind.nps = (!o.loja && l.nps_n) ? Math.round((l.nps_prom - l.nps_det) / l.nps_n * 100) : null;
  ind.nps_media = (!o.loja && l.nps_n) ? l.nps_soma / l.nps_n : null;
  ind.nps_respostas = l.nps_n;
  ind.twygo_progresso = div(l.tw_prog, l.tw_insc);
  Object.assign(ind, l.manual || {});
  return ind;
}

// ------------------------------------------------------------------
// Comparação com o mês anterior
// ------------------------------------------------------------------
// Valor do mês anterior: o boletim FECHADO (congelado) quando existe — é o
// que foi publicado; senão, o recálculo com os dados atuais.
function fechamentoDe(mes: string, opId: string, boletimDados?: Linha | null): Linha | null {
  const f = ((boletimDados || {}).fechamentos || []).find((x: Linha) => noMes(iso(x.mes), mes) && x.operacao === opId);
  return f ? f.dados : null;
}

export function variacao(id: string, atual: number | null | undefined, anterior: number | null | undefined): Linha | null {
  const def = INDICADORES[id] || {};
  if (atual == null || anterior == null || isNaN(atual) || isNaN(anterior)) return null;
  const diff = atual - anterior;
  const unidade = def.tipo === 'pct' ? diff * 100 : diff;
  const passo = def.tipo === 'int' ? 0.5 : def.tipo === 'nota' ? 0.05 : 0.05;
  const dir = Math.abs(unidade) < passo ? 0 : unidade > 0 ? 1 : -1;
  const bom = dir === 0 ? null : (def.sentido === 'menor' ? dir < 0 : dir > 0);
  return { diff, unidade, dir, bom };
}

export function seta(v: Linha | null | undefined): string { return !v ? '' : v.dir > 0 ? '▲' : v.dir < 0 ? '▼' : '='; }

// "▲ 24,0 p.p." / "▼ 0,3" / "▼ 9" / "="
export function fmtVariacao(id: string, v: Linha | null | undefined): string {
  if (!v) return '';
  if (v.dir === 0) return '=';
  const def = INDICADORES[id] || {};
  const abs = Math.abs(v.unidade);
  const n = def.tipo === 'int' ? U.fmtInt(Math.round(abs)) : abs.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${seta(v)} ${n}${def.tipo === 'pct' ? ' p.p.' : ''}`;
}

export function fmtValor(id: string, v: number | null | undefined): string {
  if (v == null || (typeof v === 'number' && isNaN(v))) return '—';
  const def = INDICADORES[id] || {};
  if (def.tipo === 'pct') return U.fmtPct(v, def.casas != null ? def.casas : 0);
  if (def.tipo === 'nota') return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: def.casas || 1, maximumFractionDigits: def.casas || 1 });
  return U.fmtInt(Math.round(v));
}

// Situação contra a meta: 'ok' | 'atencao' | 'critico' | null
export function statusMeta(id: string, v: number | null | undefined): string | null {
  const def = INDICADORES[id] || {};
  if (v == null) return null;
  // Notas de 1 a 5 (pesquisa e humor): 4,0 ou mais = meta; 3,5 a 3,9 = aceitável
  // na Sfera; 3,0 a 3,4 = atenção; abaixo de 3,0 = crítico.
  if (id === 'pesquisa_nota' || id === 'humor_media') return v >= 4 ? 'ok' : v >= 3.5 ? 'aceitavel' : v >= 3 ? 'atencao' : 'critico';
  if (id === 'nps') return v >= 50 ? 'ok' : v >= 0 ? 'atencao' : 'critico';
  if (id === 'pesquisa_participacao') return v >= def.meta ? 'ok' : v >= 0.4 ? 'atencao' : 'critico';
  if (id === 'turnover') return v <= 0.03 ? 'ok' : v <= 0.06 ? 'atencao' : 'critico';
  if (def.meta == null) return null;
  if (v >= def.meta) return 'ok';
  return v >= def.meta * 0.7 ? 'atencao' : 'critico';
}

// Resultado completo da tela: mês atual + anterior + variações.
let memo: { chave: unknown[] | null; valor: Linha | null } = { chave: null, valor: null };
export function boletim(mes: string, dados?: Linha | null, boletimDados?: Linha | null, experiencia?: Linha | null): Linha {
  const B = boletimDados || {};
  const D = dados || {};
  const exp = experiencia || {};
  const chave = [mes, D.colaboradores, D.feedbacks, D.celebracoes, D.one_on_one, D.twygo_participantes, D.unibe_pdv, D.academia_hering, D.engajamento_participacao, B.versao, exp[45], exp[90]];
  if (memo.chave && memo.chave.length === chave.length && memo.chave.every((v, i) => v === chave[i])) return memo.valor as Linha;
  const atual = calcularMes(mes, undefined, dados, boletimDados, experiencia);
  const ant = mesAnterior(mes);
  const anteriorCalc = calcularMes(ant, undefined, dados, boletimDados, experiencia);
  for (const op of OPERACOES) {
    const r = atual.operacoes[op.id];
    const fechado = fechamentoDe(ant, op.id, boletimDados);
    const prev = fechado ? fechado.ind : anteriorCalc.operacoes[op.id].ind;
    r.anterior = prev;
    r.anteriorFonte = fechado ? 'fechado' : 'recalculado';
    r.variacoes = {};
    // Sem seta quando os dois meses não são comparáveis: Twygo é foto atual
    // (recalcular o mês anterior dá o mesmo número — só vale com o mês fechado).
    const varDe = (id: string, atual: Linha, ant: Linha | null | undefined) => {
      if (!ant) return null;
      if (id === 'twygo_progresso' && !fechado) return null;
      return variacao(id, atual[id], ant[id]);
    };
    for (const id of Object.keys(INDICADORES)) r.variacoes[id] = varDe(id, r.ind, prev);
    const prevLojas = new Map<string, Linha>(((fechado && fechado.lojas) || anteriorCalc.operacoes[op.id].lojas).map((l: Linha) => [N(l.departamento), l.ind]));
    for (const l of r.lojas) {
      const p = prevLojas.get(N(l.departamento));
      l.variacoes = {};
      for (const id of Object.keys(INDICADORES)) l.variacoes[id] = varDe(id, l.ind, p);
    }
    r.fechado = fechamentoDe(mes, op.id, boletimDados);
  }
  // Total da empresa: compara com a foto do mês anterior, se ele foi fechado.
  const fechE = fechamentoDe(ant, 'empresa', boletimDados);
  const prevE = fechE ? fechE.ind : anteriorCalc.empresa.ind;
  atual.empresa.anterior = prevE;
  atual.empresa.variacoes = {};
  for (const id of Object.keys(INDICADORES)) atual.empresa.variacoes[id] = id === 'twygo_progresso' && !fechE ? null : variacao(id, atual.empresa.ind[id], prevE ? prevE[id] : null);
  atual.mesAnterior = ant;
  memo = { chave, valor: atual };
  return atual;
}

// Meses disponíveis no seletor: do mais recente com dado para trás.
export function mesesDisponiveis(qtd?: number): string[] {
  const hoje = U.todayISO().slice(0, 7);
  const out: string[] = [];
  let m = hoje;
  for (let i = 0; i < (qtd || 18); i++) { out.push(m); m = mesAnterior(m); }
  return out;
}

// ------------------------------------------------------------------
// Textos do boletim (um bloco por seção, prontos para colar no Mailchimp)
// ------------------------------------------------------------------
// Edição: #020 = agosto/2026; +1 por mês.
export function edicaoDoMes(mes: string): number {
  const [y, m] = mes.split('-').map(Number);
  return 20 + (y - 2026) * 12 + (m - 8);
}

function sujeito(op: Linha): string { return /^(O|A|Os|As) /.test(op.nome) ? op.nome : `${op.artigo} ${op.nome}`; }
function doSujeito(op: Linha): string { const s = sujeito(op); return s.replace(/^O /, 'do ').replace(/^A /, 'da ').replace(/^(?!do |da )/, 'de '); }
const plural = (n: number, um: string, varios: string) => `${U.fmtInt(n)} ${n === 1 ? um : varios}`;

export function textos(r: Linha, mes: string, opts?: Linha | null) {
  opts = opts || {};
  const op = r.op, i = r.ind, b = r.base, v = r.variacoes || {};
  const val = (id: string) => fmtValor(id, i[id]);
  const comVar = (id: string) => { const t = fmtVariacao(id, v[id]); return t ? `${val(id)} (${t})` : val(id); };
  const lojas: Linha[] = r.lojas.filter((l: Linha) => !l.apoio);
  const melhorPior = (id: string, filtro?: (l: Linha) => boolean) => {
    const xs = lojas.filter(l => l.ind[id] != null && (!filtro || filtro(l))).sort((a, c) => c.ind[id] - a.ind[id]);
    return xs.length >= 2 ? { melhor: xs[0], pior: xs[xs.length - 1] } : null;
  };
  const ano = mes.slice(0, 4), nomeMes = nomeDoMes(mes, true);
  const edicao = opts.edicao || edicaoDoMes(mes);
  const S: { id: string; titulo: string; paragrafos: string[] }[] = [];
  const add = (id: string, titulo: string, paragrafos: (string | null | undefined)[]) => { const p = paragrafos.filter(Boolean) as string[]; if (p.length) S.push({ id, titulo, paragrafos: p }); };

  add('abertura', `Boletim da Liderança #${String(edicao).padStart(3, '0')} – ${nomeMes} ${ano}`, [
    `Olá, ${op.saudacao}!`,
    `Nesta edição do Boletim da Liderança, convidamos você a acompanhar os principais indicadores de Gestão de Pessoas referentes ao mês de ${nomeDoMes(mes)}, com um olhar atento aos resultados, movimentos e oportunidades que impactam diretamente a experiência dos nossos times.`,
    'Mais do que apresentar números, este boletim busca apoiar uma leitura estratégica dos dados, com marcações comparativas que facilitam a visualização da evolução dos indicadores em relação ao ciclo anterior, ampliando a compreensão sobre o cenário das operações e contribuindo para decisões e conversas cada vez mais próximas da realidade das equipes.',
    'Ao longo da edição, você encontrará informações sobre engajamento, clima, indicadores de pessoas e pontos de atenção que ajudam e dão visibilidade à atuação das lideranças no dia a dia.',
    'Siga na leitura e explore os destaques desta edição.'
  ]);

  const ehEsc = op.id === 'escritorio';
  const unid = ehEsc ? 'departamento' : 'loja';

  // Feedbacks (Escritório: feedback ou 1:1)
  const fbId = op.id === 'escritorio' ? 'devolutiva_adesao' : 'feedback_adesao';
  if (i[fbId] != null) {
    const f = i[fbId];
    const tom = f >= 0.9 ? 'Parabenizamos todas as lideranças pelo acompanhamento e pelo registro das devolutivas junto às equipes!'
      : f < 0.5 ? 'É um resultado abaixo do que esperamos de nossas lideranças. Precisamos amadurecer e virar a chave para a rotina de gestão de pessoas, acompanhamento e orientação das equipes.'
        : 'Seguimos avançando, mas ainda há espaço para que todas as pessoas do time recebam devolutivas registradas ao longo do mês.';
    const pessoas = op.id === 'escritorio' ? b.devolutiva_pessoas : b.feedback_pessoas;
    add('feedbacks', ehEsc ? '🌟 Feedbacks e 1 on 1' : '🌟 Feedbacks', [
      `Encerramos o período com ${comVar(fbId)} de adesão aos ${op.id === 'escritorio' ? 'feedbacks e 1:1 registrados' : 'feedbacks registrados'}: ${U.fmtInt(pessoas)} de ${plural(b.liderados, 'liderado', 'liderados')} receberam ao menos uma devolutiva no mês.`,
      ehEsc && i.oneonone_adesao != null ? `No 1 on 1, a adesão foi de ${comVar('oneonone_adesao')}: ${U.fmtInt(b.oneonone_liderados)} de ${plural(b.liderados, 'liderado', 'liderados')} tiveram ao menos uma reunião realizada no mês.` : null,
      tom,
      'A consistência na realização de feedbacks fortalece a gestão de desempenho, contribui para a manutenção de um histórico atualizado e apoia a tomada de decisões mais assertivas ao longo do desenvolvimento dos colaboradores.',
      `O gráfico a seguir apresenta a adesão por ${unid}:`
    ]);
  }

  // Celebrações (as das áreas de apoio — supervisão — contam no total e são citadas no texto)
  const celApoio = r.lojas.filter((l: Linha) => l.apoio).reduce((t: number, l: Linha) => t + (l.ind.celebracoes || 0), 0);
  add('celebracoes', '🎉 Celebrações na Feedz', [
    'Neste período, seguimos acompanhando de perto as celebrações registradas na Feedz, reforçando a importância desse movimento para fortalecer nossa cultura de reconhecimento.',
    `O ideal é realizar ao menos uma celebração por semana, mantendo o foco em reconhecer o que traduz o nosso jeito de ser: resultados, colaboração, atitudes positivas, marcos importantes da jornada profissional e atitudes alinhadas aos valores da Sfera.`,
    `Neste mês, as lideranças registraram ${plural(i.celebracoes || 0, 'celebração', 'celebrações')}${v.celebracoes ? ` (${fmtVariacao('celebracoes', v.celebracoes)})` : ''}` +
      (celApoio ? (celApoio === (i.celebracoes || 0) ? (celApoio === 1 ? ', feita pela supervisão' : ', todas feitas pela supervisão') : (celApoio === 1 ? ', uma delas feita pela supervisão' : `, ${U.fmtInt(celApoio)} delas feitas pela supervisão`)) : '') +
      (i.celebracoes_lojas ? `, e ${U.fmtInt(i.celebracoes_lojas_meta)} de ${plural(i.celebracoes_lojas, unid, unid + 's')} ${i.celebracoes_lojas_meta === 1 ? 'atingiu' : 'atingiram'} a referência de ${META_CELEBRACOES_LOJA} celebrações no mês.` : '.'),
    'Confira a seguir o panorama de celebrações do mês:'
  ]);

  // Humor
  if (i.humor_media != null) {
    const h = i.humor_media;
    const leitura = h >= 4 ? 'demonstrando uma percepção positiva do ambiente de trabalho.'
      : h >= 3.5 ? 'dentro da meta, mas com espaço para evoluir.'
        : 'abaixo da meta, sinalizando percepções de desconforto que merecem atenção.';
    add('humor', '🌡️ Termômetro de Humor', [
      'O Termômetro de Humor segue como uma das principais ferramentas para entendermos, em tempo real, a percepção do nosso time no dia a dia. Estimular o registro do humor de forma simples, honesta e regular é fundamental para garantir ações de gestão mais efetivas.',
      'Nossa meta é manter o nível de humor acima de 3,5, indicador alinhado às diretrizes da NR-1 e às boas práticas de cuidado com as pessoas.',
      `${sujeito(op)} atingiu a nota ${comVar('humor_media')}, considerada “${rotuloHumor(h)}”, ${leitura} No mês, ${fmtValor('humor_participacao', i.humor_participacao)} do time registrou o humor ao menos uma vez.`,
      `A seguir, você confere a média de humor por ${unid}:`
    ]);
  }

  // Engajamento na Feedz
  if (i.engajamento_feedz != null) {
    const top = lojas.filter(l => l.ind.engajamento_feedz >= 0.9).sort((a, c) => c.ind.engajamento_feedz - a.ind.engajamento_feedz)[0];
    add('engajamento', '🚀 Engajamento na Feedz', [
      `Fechamos o período com ${comVar('engajamento_feedz')} de engajamento em nossa plataforma. Cada acesso, feedback, celebração, registro no Termômetro de Humor, resposta às pesquisas e Avaliação de Experiência concluída contribui para fortalecer a nossa cultura.`,
      top ? `Parabéns à equipe ${nomeCurto(top.departamento)}, com ${fmtValor('engajamento_feedz', top.ind.engajamento_feedz)} de engajamento na Feedz!` : null,
      'Vamos manter firme a nossa meta de 100% de FERAS engajados em 2026, e contamos com cada líder para impulsionar esse movimento e servir de inspiração para seus times!'
    ]);
  }

  // Turnover
  if (i.turnover != null) {
    add('turnover', '🔁 Turnover', [
      `O fechamento de ${nomeDoMes(mes)} traz uma visão da rotatividade e de seus impactos nas operações, ajudando a identificar a estabilidade das equipes e pontos de atenção. Quando alto, o turnover gera perda de conhecimento, aumento de custos com contratações e sobrecarga nas equipes.`,
      `Fechamos o período com ${comVar('turnover')} de turnover, com ${plural(b.admissoes, 'admissão', 'admissões')} e ${plural(b.desligamentos, 'desligamento', 'desligamentos')} sobre um quadro de ${plural(b.hc_inicio, 'pessoa', 'pessoas')} no início do mês.`,
      'Manter times engajados e com baixa rotatividade é essencial para garantir consistência nos resultados, especialmente no varejo, onde atendimento e conhecimento são diferenciais.'
    ]);
  }

  // AvE
  if (b.ave45_total || b.ave90_total) {
    const etapa = (t: number, g: number | null, a: number | null, n: number) => t ? `${plural(t, 'colaborador completou', 'colaboradores completaram')} ${n} dias: ${fmtValor('ave45_gestor', g)} das avaliações dos gestores e ${fmtValor('ave45_auto', a)} das autoavaliações foram realizadas.` : `nenhum colaborador completou ${n} dias no mês.`;
    add('ave', '📅 Avaliação de Experiência', [
      'Segue o cenário das Avaliações de Experiência dos colaboradores que completaram 45 e 90 dias de trabalho. Lembrando que a AvE é dividida em duas etapas: a avaliação feita pelo gestor e a autoavaliação.',
      `Na 1ª avaliação (45 dias), ${etapa(b.ave45_total, i.ave45_gestor, i.ave45_auto, 45)}`,
      `Na 2ª avaliação (90 dias), ${etapa(b.ave90_total, i.ave90_gestor, i.ave90_auto, 90)}`
    ]);
  }

  // Pesquisa de Satisfação (gestores)
  add('satisfacao', '🔎 Pesquisa de Satisfação', [
    'Apresentamos também o nível de adesão à Pesquisa Mensal de Satisfação com o Suporte do Escritório. Essa pesquisa é direcionada exclusivamente aos gestores e tem como objetivo avaliar a qualidade dos serviços de retaguarda.',
    `Neste ciclo, tivemos a participação de ${plural(i.satisfacao_respondentes || 0, 'gestor', 'gestores')}${v.satisfacao_respondentes ? ` (${fmtVariacao('satisfacao_respondentes', v.satisfacao_respondentes)})` : ''}` +
      (i.satisfacao_participacao != null ? `, ${fmtValor('satisfacao_participacao', i.satisfacao_participacao)} das lideranças aptas a responder ${ehEsc ? 'em toda a empresa' : 'na operação'}.` : '.'),
    'Contamos com o compromisso de todos os gestores para responder à pesquisa e compartilhar suas percepções. Agradecemos às lideranças que se engajaram e se comprometeram com a busca por melhorias!'
  ]);

  // Pesquisa de Engajamento
  if (i.pesquisa_nota != null || i.pesquisa_participacao != null) {
    const n = i.pesquisa_nota, p = i.pesquisa_participacao;
    const leituraNota = n == null ? null : n >= 4 ? 'A nota está dentro do nosso objetivo.' : n >= 3.5 ? 'A nota permanece em uma faixa saudável.' : 'A nota está abaixo da faixa saudável e pede atenção.';
    const pil = (Object.entries(i.pilares || {}) as [string, number | null][]).filter(([, x]) => x != null).sort((a, c) => (c[1] as number) - (a[1] as number)) as [string, number][];
    const fp = ([d, x]: [string, number]) => `${d} (${fmtValor('pesquisa_nota', x)})`;
    const atencao = pil.filter(([, x]) => x < 3.5);
    const oportunidade = pil.filter(([, x]) => x >= 3.5 && x < 4);
    add('pesquisa', '🔎 Pesquisa de Engajamento', [
      'A Pesquisa de Engajamento é uma das principais formas de ouvir o nosso time ao longo do ano. Rápida e objetiva, acontece em ciclos curtos e nos ajuda a acompanhar, de forma contínua, como está a experiência das pessoas no dia a dia.',
      `${sujeito(op)} fechou o ciclo${n != null ? ` com a nota ${comVar('pesquisa_nota')} de Engajamento` : ''}${p != null ? `${n != null ? ',' : ''} com participação de ${comVar('pesquisa_participacao')} do time` : ''}. ${leituraNota || ''}`.trim(),
      p != null && p < 0.6 ? 'A baixa adesão pode influenciar a representatividade do resultado. Por isso, precisamos continuar incentivando a participação das equipes, buscando alcançar o mínimo de 60% de adesão — o que permitirá uma análise mais robusta, confiável e representativa da experiência das pessoas.' : null,
      'Devemos manter os resultados sempre acima da nota 4,0. Ainda assim, consideramos saudável toda pontuação a partir de 3,5, pois esse resultado indica que o pilar está dentro de uma margem aceitável, embora ainda exista oportunidade de evolução.',
      pil.length ? `Pilares mais bem avaliados: ${pil.slice(0, 2).map(fp).join(' e ')}.` + (atencao.length ? ` Pedem atenção: ${atencao.map(fp).join(', ')}.` : oportunidade.length ? ` Com oportunidade de evolução: ${oportunidade.slice(-3).map(fp).join(', ')}.` : '') : null,
      i.nps != null ? `O eNPS ${doSujeito(op)} foi de ${U.fmtInt(i.nps)}, com média de recomendação de ${fmtValor('pesquisa_nota', i.nps_media)}.` +
        (i.nps_respostas < 5 ? ` Porém, contou com apenas ${plural(i.nps_respostas, 'resposta', 'respostas')}, e essa baixa adesão influencia a representatividade do resultado.` : '') : null
    ]);
  }

  // Treinamento (o Escritório não tem esta seção)
  if (ehEsc) return S;
  const tw = melhorPior('twygo_progresso');
  const ub = melhorPior('unibe_adesao');
  add('treinamento', '📚 Treinamento', [
    i.twygo_progresso != null ? `Na Twygo, o progresso médio é de ${fmtValor('twygo_progresso', i.twygo_progresso)} entre ${plural(b.twygo_pessoas, 'colaborador', 'colaboradores')}` +
      (tw ? `. ${nomeCurto(tw.melhor.departamento)} tem o maior progresso (${fmtValor('twygo_progresso', tw.melhor.ind.twygo_progresso)}); ${nomeCurto(tw.pior.departamento)}, o menor (${fmtValor('twygo_progresso', tw.pior.ind.twygo_progresso)}).` : '.') : null,
    i.unibe_adesao != null ? `Na Unibê, a adesão é de ${fmtValor('unibe_adesao', i.unibe_adesao)}` +
      (ub ? `. ${nomeCurto(ub.melhor.departamento)} está em ${fmtValor('unibe_adesao', ub.melhor.ind.unibe_adesao)}; ${nomeCurto(ub.pior.departamento)} tem o menor número, ${fmtValor('unibe_adesao', ub.pior.ind.unibe_adesao)}.` : '.') : null,
    i.academia_pontos != null ? `Na Academia Hering, a pontuação média é de ${U.fmtInt(Math.round(i.academia_pontos))} pontos.` : null
  ]);

  return S;
}

export function textoCorrido(secoes: { titulo: string; paragrafos: string[] }[]): string {
  return secoes.map(s => [s.titulo].concat(s.paragrafos).join('\n\n')).join('\n\n\n');
}


/** Limpa os caches (equivale a HUB_METRICS_BOLETIM._invalidar do legado). */
export function _invalidar(): void { memo = { chave: null, valor: null }; ctxCache = null; }
