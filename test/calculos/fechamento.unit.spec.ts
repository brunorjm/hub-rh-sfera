// Porte de legado/test/fechamento.test.js: base de vagas do Fechamento do
// Período — parser da planilha 18 (parsers-fechamento) e regra de
// SLA/indicadores (metrics-fechamento).
//
// Dados INVENTADOS (nenhum dado real fica no repositório).
//
// Fora do porte: os blocos que testam a montagem dos slides
// (legado/js/fechamento-slides*.js — HUB_FECHAMENTO_SLIDES e
// HUB_FECHAMENTO_CULTURA), que não fazem parte de src/lib/calculos:
// "slides: períodos" (5), "slides: deck de julho/2026" (9),
// "slides: Demografia e DHO" (9), "slides: Cultura, T&D, slides do RH, textos
// e resumo" (16) e "Pesquisa de Engajamento: pulsos oficiais e notas do
// período" (5). 44 das 67 verificações; ficam 23.

// SheetJS falso: a aba já é a lista de linhas.
jest.mock('xlsx', () => ({ utils: { sheet_to_json: (ws: { rows: unknown[] }) => ws.rows } }));

import * as PF from '@/lib/calculos/parsers-fechamento';
import * as M from '@/lib/calculos/metrics-fechamento';
import type { Linha } from '@/lib/calculos/utils';
import { criarVerificacoes } from '../helpers/verificacoes';

const { check, run, totalEsperado } = criarVerificacoes();

const d = (iso: string) => { const [y, m, dd] = iso.split('-').map(Number); return new Date(y, m - 1, dd); };
function vaga(o: Linha): Linha {
  return Object.assign({
    'DATA DE ABERTURA': '', SLA: '', 'Status SLA': '', 'Motivo SLA': '', UNIDADE: 'Hering', DEPARTAMENTO: 'Loja Centro',
    SOLICITANTE: 'Fulana Gestora', CARGO: 'Consultor de Vendas', 'VAGA SIGILOSA?': 'Não', 'TIPO DA VAGA': 'Operacional',
    'RESPONSÁVEL': 'Recrutadora A', 'STATUS DA VAGA': 'Finalizada', 'TIPO DA VAGA_1': 'Substituição', 'PESSOA SUBS.': 'Beltrano',
    'TIPO DE RECRUTAMENTO': 'Externo', 'ETAPA DA VAGA': 'Onboarding', 'DIAS CONGELADA': '', 'DATA DO CANCELAMENTO': '',
    '%FIT': '', 'CONTRATADO(A)': 'Ciclano', 'DATA DE FECHAMENTO': '', 'DATA DE INÍCIO': '', FONTE: 'InfoJobs',
    OBSERVAÇÃO: 'Candidata X faltou na entrevista'
  }, o);
}
function wb(rows: Linha[]) {
  return { SheetNames: ['Resumo Abertas', 'CTRL GERAL'], Sheets: { 'Resumo Abertas': { rows: [{ UNIDADE: 'Hering', 'QTDE VAGAS ABERTAS': 3 }] }, 'CTRL GERAL': { rows } } };
}

const BASE = [
  // Loja RJ (Hering) 20 dias: 20 no prazo, 21 fora
  vaga({ 'DATA DE ABERTURA': d('2026-07-01'), 'DATA DE FECHAMENTO': d('2026-07-21') }),
  vaga({ 'DATA DE ABERTURA': d('2026-07-01'), 'DATA DE FECHAMENTO': d('2026-07-22'), 'Status SLA': 'Expirou SLA', FONTE: 'Infojobs' }),
  // VD RJ 25 dias
  vaga({ 'DATA DE ABERTURA': d('2026-07-05'), 'DATA DE FECHAMENTO': d('2026-07-30'), UNIDADE: 'Boticário VD - Rio de Janeiro', FONTE: 'Indeed ' }),
  // Loja MG 34 dias: 30 dias, no prazo (a planilha marcava como expirada)
  vaga({ 'DATA DE ABERTURA': d('2026-07-01'), 'DATA DE FECHAMENTO': d('2026-07-31'), UNIDADE: 'Boticário - Juiz de Fora', 'Status SLA': 'Expirou SLA' }),
  // Estratégica 35 dias: 40 dias, fora; sigilosa
  vaga({ 'DATA DE ABERTURA': d('2026-06-20'), 'DATA DE FECHAMENTO': d('2026-07-30'), 'TIPO DA VAGA': 'Estratégica', UNIDADE: 'Escritório', CARGO: 'Gerente Financeiro', 'VAGA SIGILOSA?': 'Sim', FONTE: 'LinkedIn', '%FIT': 0.85 }),
  // abertas e ativas
  vaga({ 'DATA DE ABERTURA': d('2026-07-10'), 'STATUS DA VAGA': 'Aberta', 'TIPO DA VAGA_1': 'Extra Natal', FONTE: '' }),
  vaga({ 'DATA DE ABERTURA': d('2026-07-12'), 'STATUS DA VAGA': 'Andamento', 'DATA DE FECHAMENTO': d('2026-07-20') }),
  vaga({ 'DATA DE ABERTURA': d('2026-07-15'), 'STATUS DA VAGA': 'Cancelada' }),
  vaga({ 'DATA DE ABERTURA': d('2026-07-16'), 'STATUS DA VAGA': 'Cancelada', 'DATA DO CANCELAMENTO': d('2026-07-25') }),
  // linha vazia do fim da planilha
  vaga({ 'STATUS DA VAGA': '', 'TIPO DA VAGA': '', UNIDADE: '' })
];

run('parse: aba CTRL GERAL, sem nomes de pessoa nem observação', () => {
  const r = PF.parse(wb(BASE));
  check('lê a aba CTRL GERAL', r.aba === 'CTRL GERAL', r.aba);
  check('ignora a linha sem data de abertura', r.linhas.length === 9, r.linhas.length);
  const l = r.linhas[0];
  check('datas em ISO', l.data_abertura === '2026-07-01' && l.data_fechamento === '2026-07-21', l.data_abertura + ' ' + l.data_fechamento);
  check('UNIDADE vira unidade', l.unidade === 'Hering', l.unidade);
  const chaves = Object.keys(l).join(',');
  check('não guarda contratado, substituído, solicitante nem observação', !/contratad|pessoa|solicitante|observa/i.test(chaves), chaves);
  const sig = r.linhas[4];
  check('vaga sigilosa sem cargo', sig.sigilosa === true && sig.cargo === null, JSON.stringify([sig.sigilosa, sig.cargo]));
  check('fonte unificada pela grafia mais usada', r.linhas[1].fonte === 'InfoJobs' && r.linhas[2].fonte === 'Indeed', r.linhas[1].fonte + '|' + r.linhas[2].fonte);
  check('%FIT em 0–1', sig.fit === 0.85, sig.fit);
});

run('parse: conferência da planilha', () => {
  const r = PF.parse(wb(BASE));
  const t = r.avisos.join(' | ');
  check('avisa cancelada sem data de cancelamento', /1 vaga\(s\) Cancelada\(s\) sem DATA DO CANCELAMENTO/.test(t), t);
  check('Andamento com data de fechamento não gera aviso (é vaga fechada aguardando admissão)', !/Andamento/.test(t), t);
});

run('parse: planilha errada', () => {
  let msg = '';
  try { PF.parse({ SheetNames: ['X'], Sheets: { X: { rows: [{ NOME: 'a' }] } } }); } catch (e) { msg = (e as Error).message; }
  check('erro explica o que falta', /CTRL GERAL/.test(msg), msg);
});

run('periodo: julho/2026 (critérios do RH)', () => {
  const r = PF.parse(wb(BASE));
  const p = M.periodo(r.linhas, '2026-07-01', '2026-07-31');
  check('6 fechadas pela DATA DE FECHAMENTO, qualquer status', p.fechadas === 6, p.fechadas);
  check('1 delas aguardando admissão (Andamento com data)', p.aguardandoAdmissao === 1, p.aguardandoAdmissao);
  check('8 abertas no mês', p.abertas === 8, p.abertas);
  check('1 cancelada com data no mês', p.canceladas === 1, p.canceladas);
  check('SLA pela planilha: "Expirou SLA" fora, branco dentro (4 de 6)', p.dentro === 4 && Math.abs((p.noPrazo as number) - 4 / 6) < 1e-9, p.noPrazo);
  check('Estratégica: 1 fechada, 40 dias, dentro do prazo', p.estrategica.fechadas === 1 && p.estrategica.diasMedio === 40 && p.estrategica.noPrazo === 1, JSON.stringify(p.estrategica));
  check('fonte Operacional mais usada', p.fontesOperacional[0].nome === 'InfoJobs' && p.fontesOperacional[0].qtd === 4, JSON.stringify(p.fontesOperacional));
  check('time to fill = média abertura → fechamento', Math.abs((p.timeToFill as number) - (20 + 21 + 25 + 30 + 40 + 8) / 6) < 1e-9, p.timeToFill);
  check('maior SLA primeiro', p.maioresSla[0].dias === 40 && p.maioresSla[0].cargo === 'Vaga sigilosa', JSON.stringify(p.maioresSla[0]));
  const at = M.ativas(r.linhas);
  check('ativas: 1 aberta, 0 em andamento, 1 aguardando admissão', at.aberta.total === 1 && at.andamento.total === 0 && at.aguardandoAdmissao.total === 1, JSON.stringify([at.aberta.total, at.andamento.total, at.aguardandoAdmissao.total]));
  const mes = M.mensal(r.linhas, 2026);
  check('mensal: julho com 8 abertas e 6 fechadas', mes[6].abertas === 8 && mes[6].fechadas === 6, JSON.stringify(mes[6]));
  check('mensal: junho com 1 aberta', mes[5].abertas === 1, JSON.stringify(mes[5]));
});

totalEsperado(23);
