// Testa a base de vagas do Fechamento do Período: parser da planilha 18
// (js/parsers-fechamento.js) e regra de SLA/indicadores (js/metrics-fechamento.js),
// fora do navegador. Roda com: node test/fechamento.test.js
//
// Dados INVENTADOS (nenhum dado real fica no repositório).
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  OK  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}${detail !== undefined ? ' — ' + detail : ''}`); }
}
function run(name, fn) {
  console.log(`\n${name}`);
  try { fn(); } catch (err) { fail++; console.log(`FAIL  erro: ${err.stack}`); }
}

const ctx = { console, Intl, Date };
ctx.window = ctx;
ctx.XLSX = { utils: { sheet_to_json: ws => ws.rows } };   // SheetJS falso: a aba já é a lista de linhas
vm.createContext(ctx);
for (const f of ['js/utils.js', 'js/parsers.js', 'js/parsers-fechamento.js', 'js/metrics-fechamento.js', 'js/fechamento-slides.js', 'js/fechamento-slides-dho.js', 'js/fechamento-slides-cultura.js', 'js/fechamento-slides-manuais.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
const PF = ctx.HUB_PARSERS_FECHAMENTO;
const M = ctx.HUB_METRICS_FECHAMENTO;
const SL = ctx.HUB_FECHAMENTO_SLIDES;

const d = iso => { const [y, m, dd] = iso.split('-').map(Number); return new Date(y, m - 1, dd); };
function vaga(o) {
  return Object.assign({
    'DATA DE ABERTURA': '', SLA: '', 'Status SLA': '', 'Motivo SLA': '', UNIDADE: 'Hering', DEPARTAMENTO: 'Loja Centro',
    SOLICITANTE: 'Fulana Gestora', CARGO: 'Consultor de Vendas', 'VAGA SIGILOSA?': 'Não', 'TIPO DA VAGA': 'Operacional',
    'RESPONSÁVEL': 'Recrutadora A', 'STATUS DA VAGA': 'Finalizada', 'TIPO DA VAGA_1': 'Substituição', 'PESSOA SUBS.': 'Beltrano',
    'TIPO DE RECRUTAMENTO': 'Externo', 'ETAPA DA VAGA': 'Onboarding', 'DIAS CONGELADA': '', 'DATA DO CANCELAMENTO': '',
    '%FIT': '', 'CONTRATADO(A)': 'Ciclano', 'DATA DE FECHAMENTO': '', 'DATA DE INÍCIO': '', FONTE: 'InfoJobs',
    OBSERVAÇÃO: 'Candidata X faltou na entrevista'
  }, o);
}
function wb(rows) {
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
  try { PF.parse({ SheetNames: ['X'], Sheets: { X: { rows: [{ NOME: 'a' }] } } }); } catch (e) { msg = e.message; }
  check('erro explica o que falta', /CTRL GERAL/.test(msg), msg);
});

run('periodo: julho/2026 (critérios do RH)', () => {
  const r = PF.parse(wb(BASE));
  const p = M.periodo(r.linhas, '2026-07-01', '2026-07-31');
  check('6 fechadas pela DATA DE FECHAMENTO, qualquer status', p.fechadas === 6, p.fechadas);
  check('1 delas aguardando admissão (Andamento com data)', p.aguardandoAdmissao === 1, p.aguardandoAdmissao);
  check('8 abertas no mês', p.abertas === 8, p.abertas);
  check('1 cancelada com data no mês', p.canceladas === 1, p.canceladas);
  check('SLA pela planilha: "Expirou SLA" fora, branco dentro (4 de 6)', p.dentro === 4 && Math.abs(p.noPrazo - 4 / 6) < 1e-9, p.noPrazo);
  check('Estratégica: 1 fechada, 40 dias, dentro do prazo', p.estrategica.fechadas === 1 && p.estrategica.diasMedio === 40 && p.estrategica.noPrazo === 1, JSON.stringify(p.estrategica));
  check('fonte Operacional mais usada', p.fontesOperacional[0].nome === 'InfoJobs' && p.fontesOperacional[0].qtd === 4, JSON.stringify(p.fontesOperacional));
  check('time to fill = média abertura → fechamento', Math.abs(p.timeToFill - (20 + 21 + 25 + 30 + 40 + 8) / 6) < 1e-9, p.timeToFill);
  check('maior SLA primeiro', p.maioresSla[0].dias === 40 && p.maioresSla[0].cargo === 'Vaga sigilosa', JSON.stringify(p.maioresSla[0]));
  const at = M.ativas(r.linhas);
  check('ativas: 1 aberta, 0 em andamento, 1 aguardando admissão', at.aberta.total === 1 && at.andamento.total === 0 && at.aguardandoAdmissao.total === 1, JSON.stringify([at.aberta.total, at.andamento.total, at.aguardandoAdmissao.total]));
  const mes = M.mensal(r.linhas, 2026);
  check('mensal: julho com 8 abertas e 6 fechadas', mes[6].abertas === 8 && mes[6].fechadas === 6, JSON.stringify(mes[6]));
  check('mensal: junho com 1 aberta', mes[5].abertas === 1, JSON.stringify(mes[5]));
});

run('slides: períodos', () => {
  const m = SL.periodo('mensal', 2026, 9);
  check('mensal setembro', m.de === '2026-09-01' && m.ate === '2026-09-30' && m.label === 'Setembro 2026', JSON.stringify(m));
  const b = SL.periodo('bimestral', 2026, 4);
  check('bimestre 4 = jul–ago', b.de === '2026-07-01' && b.ate === '2026-08-31' && b.label === 'Julho e Agosto 2026', JSON.stringify(b));
  const s = SL.periodo('semestral', 2026, 2);
  check('2º semestre', s.de === '2026-07-01' && s.ate === '2026-12-31', JSON.stringify(s));
  const fev = SL.periodo('mensal', 2024, 2);
  check('fevereiro bissexto', fev.ate === '2024-02-29', fev.ate);
  check('mesmo período do ano anterior', SL.mesmoPeriodoAnoAnterior(b).de === '2025-07-01');
});

run('slides: deck de julho/2026', () => {
  const r = PF.parse(wb(BASE));
  const metas = [{ ano: 2026, mes: 7, meta_abertas: 10, meta_fechadas: 4 }];
  const deck = SL.montar(SL.periodo('mensal', 2026, 7), { vagas: r.linhas, metas, atualizadoEm: '2026-10-08' });
  check('7 slides, com Vagas por Unidade', deck.length === 7 && deck[3].id === 'rs-unidades', deck.map(d => d.id).join(','));
  const texto = sd => sd.els.filter(e => e.t === 'text').map(e => e.paras.map(p => p.runs.map(x => x.text).join('')).join(' ')).join(' | ');
  const fin = deck.find(d => d.id === 'rs-finalizadas');
  check('resumo com 6 vagas e 67% no prazo', /Fechamos julho com 6 vagas.*67% dentro do prazo/.test(texto(fin)), texto(fin));
  check('fechadas contra a meta', /150% da meta \(4\)/.test(texto(fin)), texto(fin));
  const nat = fin.els.find(e => e.t === 'chart' && e.title === 'NATUREZA DA VAGA');
  check('natureza agrupa Substituição', nat.labels[0] === 'Substituição' && nat.series[0].values[0] === 5 && nat.series[1].values[0] === 1, JSON.stringify(nat));
  const proj = deck.find(d => d.id === 'rs-projecao');
  check('projeção compara com a meta', /abriram-se 8 vagas \(80% da meta de 10\) e fecharam-se 6 \(150% da meta de 4\)/.test(texto(proj)), texto(proj));
  const ch = proj.els.find(e => e.t === 'chart');
  check('realizado só até o mês do período', ch.series[1].values[6] === 8 && ch.series[1].values[7] === null, JSON.stringify(ch.series[1].values));
  const at = deck.find(d => d.id === 'rs-ativas');
  check('ativas na virada do período, sem as já fechadas', /— 31\/07\/2026/.test(texto(at)) && /EM ANDAMENTO — 0 vagas/.test(texto(at)) && /vagas abertas até 31\/07\/2026 · não inclui as 1 vagas já fechadas/.test(texto(at)), texto(at));
  const uni = deck.find(d => d.id === 'rs-unidades');
  check('por unidade: substituição por unidade e SLAs', uni.els.find(e => e.t === 'chart').labels[0] === 'Hering' && /MAIORES SLAs/.test(texto(uni)) && /40d/.test(texto(uni)), texto(uni).slice(0, 300));
  check('todo elemento dentro do slide 960 × 540', deck.every(d => d.els.every(e => e.x >= 0 && e.y >= 0 && e.x + e.w <= 960 && e.y + e.h <= 540)));
});

// DHO: as contas vêm das telas do Hub (rotatividade/entrevista/experiência);
// aqui elas são simuladas para testar só a montagem dos slides.
function dhoFalso() {
  const colab = (adm, opts) => Object.assign({ unidade: 'Hering', departamento: 'Loja Centro', data_admissao: adm, data_nascimento: '1995-05-10', situacao: 'Ativo' }, opts || {});
  const colaboradores = [
    colab('2024-01-10'), colab('2026-03-01'), colab('2025-12-01', { unidade: 'Levis', data_nascimento: '1980-01-01' }),
    colab('2026-06-15', { situacao: 'Desligado', ultimo_dia_trabalhado: '2026-07-20' }),   // saiu na experiência
    colab('2023-02-01', { situacao: 'Desligado', ultimo_dia_trabalhado: '2026-07-31' })
  ];
  const serieMes = mes => ({ mes, taxaTurnover: 0.05, taxaDesligamento: 0.04, voluntarios: 1, involuntarios: 1 });
  const rot = f => ({
    turnoverMedio: 0.05, taxaDesligamentoMedia: 0.04, totalDesligados: 2, voluntarios: 1, involuntarios: 1, totalAdmitidos: 1, semDataSaida: 0,
    motivos: [{ label: 'Outra Oportunidade de Trabalho - Remun. e/ou Benef.', value: 1 }, { label: 'Baixo Desempenho/ Performance', value: 1 }],
    serie: ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'].filter(m => m >= f.start.slice(0, 7) && m <= f.end.slice(0, 7)).map(serieMes)
  });
  const ent = f => {
    const so = f.unidade && f.unidade.length ? f.unidade[0] : null;
    const nps = so === 'Hering' ? -50 : so === 'Levis' ? 100 : so ? null : 0;
    const total = so === 'Hering' ? 2 : so === 'Levis' ? 1 : so ? 0 : 3;
    return {
      nps, npsDetalhe: { total, promotores: 1, neutros: 1, detratores: 1 }, totalRespostas: 3, positivos: 2, participacao: 0.5,
      motivos: [{ label: 'Liderança', value: 2 }, { label: 'Motivos Pessoais', value: 1 }],
      indicesDesligamento: [{ key: 'efetividade_onboarding', total: 3, simples: false, principal: [], linhas: [{ bucket: 'positivo' }, { bucket: 'positivo' }, { bucket: 'negativo' }] }]
    };
  };
  return { colaboradores, unidades: ['Hering', 'Levis', 'Escritório'], rot, ent, exp: { 45: null, 90: null }, X: null };
}

run('slides: Demografia e DHO', () => {
  const deck = SL.montar(SL.periodo('mensal', 2026, 7), { vagas: [], metas: [], atualizadoEm: '2026-08-05', dho: dhoFalso() });
  const ids = deck.map(d => d.id).join(',');
  check('ordem: capa, resumo, demografia, R&S, DHO, contracapa', ids === 'capa,resumo,demografia,rs-divisor,rs-finalizadas,rs-unidades,rs-comparativo,rs-ativas,rs-projecao,dho-divisor,dho-turnover,dho-perfil-etario,dho-nps,dho-motivos,dho-percepcao,dho-experiencia,contracapa', ids);
  const texto = sd => sd.els.filter(e => e.t === 'text').map(e => e.paras.map(p => p.runs.map(x => x.text).join('')).join(' ')).join(' | ');
  const demo = deck.find(d => d.id === 'demografia');
  check('headcount em 31/07: 3 ativos', /HEADCOUNT \| 3 \|/.test(texto(demo)), texto(demo).slice(0, 120));
  const turn = deck.find(d => d.id === 'dho-turnover');
  check('desligados na experiência: 1 de 2', /50,0% \(1\/2\)/.test(texto(turn)), texto(turn));
  const nps = deck.find(d => d.id === 'dho-nps').els.find(e => e.t === 'chart');
  check('NPS por unidade só com quem respondeu, do maior para o menor', nps.labels.join('|') === 'Levis (n=1)|Hering (n=2)', nps.labels.join('|'));
  check('NPS negativo na série vermelha', nps.series[0].values[1] === null && nps.series[1].values[1] === -50, JSON.stringify(nps.series));
  const mot = deck.find(d => d.id === 'dho-motivos').els.find(e => e.t === 'chart' && /REGISTRADO/.test(e.title));
  check('motivo do RH com prefixo abreviado', mot.labels[0] === 'Outra oport.: Remun. e/ou Benef.', mot.labels[0]);
  const perc = texto(deck.find(d => d.id === 'dho-percepcao'));
  check('percepção: Onboarding 66,7%', /Onboarding \| 66,7%/.test(perc), perc.slice(0, 300));
  check('experiência sem planilha avisa em vez de quebrar', /indisponível/.test(texto(deck.find(d => d.id === 'dho-experiencia'))));
  check('todo elemento dentro do slide 960 × 540', deck.every(d => d.els.every(e => e.x >= 0 && e.y >= 0 && e.x + e.w <= 960 && e.y + e.h <= 540)));
});

// Cultura e T&D: o cálculo mensal do Boletim é simulado (mesmo formato de calcularMes).
function cultFalso() {
  const OPERACOES = [{ id: 'hering', nome: 'Hering' }, { id: 'levis', nome: "Levi's" }];
  const ind = (k) => ({ celebracoes: 10 * k, feedback_painel: 0.3 * k, humor_media: 4, humor_participacao: 0.5, engajamento_feedz: 0.4 * k,
    pesquisa_nota: 3.5 + 0.1 * k, pesquisa_participacao: 0.5, nps: 10, nps_respostas: 20, twygo_progresso: 0.5 + 0.1 * k,
    pilares: { 'Bem-estar': 3 + 0.1 * k, 'Conexão com líder': 4 }, unibe_adesao: k === 1 ? 0.8 : null, academia_pontos: k === 1 ? 750 : null });
  const loja = (nome, v) => ({ nome, apoio: false, base: { twygo_pessoas: 5 }, ind: { twygo_progresso: v } });
  const mes = mk => ({
    empresa: { ind: ind(2), base: { twygo_pessoas: 100 } },
    operacoes: { hering: { ind: ind(1), lojas: [loja('Rio Sul', 0.9), loja('Centro', 0.2)] }, levis: { ind: ind(2), lojas: [loja('Barra', 0.6)] } }
  });
  return { OPERACOES, mes };
}

run('slides: Cultura, T&D, slides do RH, textos e resumo', () => {
  const manuais = {
    'man-rs-projetos': { titulo: '', subtitulo: 'Objetivo: reduzir substituição', cards: [{ titulo: 'Persona', texto: 'Mapeamento da base\n- **4 vagas** piloto' }, { titulo: '', texto: '' }] },
    'man-rituais': { titulo: '', subtitulo: '', cards: [] },
    // "Próximos passos" vem depois de "Projetos DHO", que está vazio: tem de cair depois do Boletim/Engajamento.
    'man-dho-proximos': { cards: [{ titulo: 'AVD', texto: 'Calibragem em agosto' }] }
  };
  const textos = { 'rs-finalizadas': 'Texto do **RH** para as vagas.' };
  const deck = SL.montar(SL.periodo('mensal', 2026, 7), { vagas: [], metas: [], atualizadoEm: '2026-08-05', dho: dhoFalso(), cult: cultFalso(), manuais, textos });
  const ids = deck.map(d => d.id);
  check('cultura e engajamento depois da experiência', ids.indexOf('cult-cultura') === ids.indexOf('dho-experiencia') + 1 && ids.indexOf('cult-engajamento') === ids.indexOf('cult-cultura') + 1, ids.join(','));
  check('T&D com divisor, Twygo, Unibê e Academia Hering (um slide cada)', ids.indexOf('td-twygo') === ids.indexOf('td-divisor') + 1 && ids.indexOf('td-unibe') === ids.indexOf('td-twygo') + 1 && ids.indexOf('td-academia') === ids.indexOf('td-unibe') + 1, ids.join(','));
  check('slide do RH preenchido entra depois da Projeção', ids.indexOf('man-rs-projetos') === ids.indexOf('rs-projecao') + 1, ids.join(','));
  check('slide do RH vazio não entra', !ids.includes('man-rituais'));
  check('slide do RH cujo anterior está vazio volta pela sequência', ids.indexOf('man-dho-proximos') === ids.indexOf('cult-engajamento') + 1, ids.join(','));
  check('resumo em 2º e contracapa no fim', ids[1] === 'resumo' && ids[ids.length - 1] === 'contracapa', ids.join(','));
  const texto = sd => sd.els.filter(e => e.t === 'text').map(e => e.paras.map(p => p.runs.map(x => x.text).join('')).join(' ')).join(' | ');
  const fin = deck.find(d => d.id === 'rs-finalizadas');
  check('texto de abertura reescrito pelo RH, com negrito', /Texto do RH para as vagas\./.test(texto(fin)) && fin.els.find(e => e.editado).paras[0].runs.some(r => r.bold && r.text === 'RH'), texto(fin).slice(0, 120));
  check('texto automático guardado para "voltar ao automático"', /Nenhuma vaga fechada/.test(fin.textoAuto), fin.textoAuto);
  const man = deck.find(d => d.id === 'man-rs-projetos');
  check('slide do RH: título padrão, 1 card, tópico em negrito', /PROJETOS EM ANDAMENTO — R&S/.test(texto(man)) && man.els.filter(e => e.t === 'rect').length === 2 && man.els.some(e => e.t === 'text' && e.paras.some(p => p.bullet && p.runs.some(r => r.bold && r.text === '4 vagas'))), texto(man));
  const cult = deck.find(d => d.id === 'cult-cultura');
  check('cultura: celebrações e engajamento da empresa', /CELEBRAÇÕES DE GESTORES \| 20/.test(texto(cult)) && /ENGAJAMENTO NA FEEDZ \| 80%/.test(texto(cult)), texto(cult).slice(0, 400));
  const eng = deck.find(d => d.id === 'cult-engajamento');
  check('engajamento: pilar melhor e pior', /Conexão com líder.*mais bem avaliado.*Bem-estar/.test(texto(eng)), texto(eng).slice(0, 300));
  // Sem o módulo Treinamentos carregado não há data de conclusão: o slide avisa, sem números acumulados.
  check('Twygo: sem data de conclusão, avisa em vez de mostrar o acumulado', /Sem a data de conclusão/.test(texto(deck.find(d => d.id === 'td-twygo'))));
  // Sem as planilhas 27.1/27.2 (módulo Treinamentos não carregado no teste): valores digitados no Boletim.
  check('Unibê pelos valores manuais, com gráfico por operação', /valores digitados no Boletim/.test(texto(deck.find(d => d.id === 'td-unibe'))) && deck.find(d => d.id === 'td-unibe').els.some(e => e.t === 'chart'), texto(deck.find(d => d.id === 'td-unibe')));
  check('Academia Hering pelo valor manual', /750 pontos/.test(texto(deck.find(d => d.id === 'td-academia'))), texto(deck.find(d => d.id === 'td-academia')));
  const res = texto(deck.find(d => d.id === 'resumo'));
  check('resumo traz turnover, NPS e engajamento (sem o progresso acumulado da Twygo)', /Turnover médio/.test(res) && /NPS de desligamento/.test(res) && /Engajamento na Feedz/.test(res) && !/Progresso na Twygo/.test(res), res);
  check('todo elemento dentro do slide 960 × 540', deck.every(d => d.els.every(e => e.x >= 0 && e.y >= 0 && e.x + e.w <= 960 && e.y + e.h <= 540.5)), deck.filter(d => d.els.some(e => e.x + e.w > 960 || e.y + e.h > 540.5)).map(d => d.id).join(','));
});

run('Pesquisa de Engajamento: pulsos oficiais e notas do período', () => {
  const cult = cultFalso();
  cult.engajamento = {
    pulsos: [
      { inicio: '2026-07-02', convidados: 100, respondentes: 40 }, { inicio: '2026-07-09', convidados: 100, respondentes: 60 },
      { inicio: '2026-06-25', convidados: 100, respondentes: 90 }   // começou em junho: fica fora de julho
    ],
    notas: [
      { dia: '2026-07-03', unidade: 'Hering', departamento: 'Hering Centro', dimensao: 'Cultura', soma: 40, n: 10 },
      { dia: '2026-07-10', unidade: 'Levis', departamento: 'Levis Barra', dimensao: 'Bem-estar', soma: 30, n: 10 },
      { dia: '2026-07-10', unidade: 'Levis', departamento: 'Levis Barra', dimensao: 'NPS', soma: 70, n: 10, promotores: 5, detratores: 2 },
      { dia: '2026-06-30', unidade: 'Hering', departamento: 'Hering Centro', dimensao: 'Cultura', soma: 10, n: 10 }
    ],
    operacaoDe: u => (/hering/i.test(u) ? 'hering' : /levis/i.test(u) ? 'levis' : null)
  };
  const e = ctx.HUB_FECHAMENTO_CULTURA.engajamentoDe(cult, '2026-07-01', '2026-07-31');
  check('participação = respondentes ÷ convidados dos pulsos que começaram no período', e.pulsos === 2 && Math.abs(e.participacao - 0.5) < 1e-9, JSON.stringify(e));
  check('nota geral só com respostas do período, sem o NPS', Math.abs(e.nota - 3.5) < 1e-9, e.nota);
  check('eNPS = (promotores − detratores) ÷ respostas', e.nps === 30 && e.npsN === 10, `${e.nps} ${e.npsN}`);
  check('nota por operação', e.porOperacao.hering === 4 && e.porOperacao.levis === 3, JSON.stringify(e.porOperacao));
  const deck = SL.montar(SL.periodo('mensal', 2026, 7), { vagas: [], metas: [], atualizadoEm: '2026-08-05', dho: dhoFalso(), cult });
  const txt = deck.find(d => d.id === 'cult-engajamento').els.filter(x => x.t === 'text').map(x => x.paras.map(p => p.runs.map(r => r.text).join('')).join(' ')).join(' | ');
  check('slide mostra 50,0% com 100 de 200 em 2 pulsos', /50,0%/.test(txt) && /100 de 200 · 2 pulsos/.test(txt), txt);
});

console.log(`\n${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
