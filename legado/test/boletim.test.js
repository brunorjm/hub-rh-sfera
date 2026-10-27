// Testa o motor do Boletim da Liderança (js/metrics-boletim.js) e os parsers
// das planilhas próprias dele (js/parsers-boletim.js), fora do navegador.
// Roda com: node test/boletim.test.js
//
// Carrega os scripts como estão, num contexto do Node que finge o "window" do
// navegador, e alimenta com dados INVENTADOS (nenhum dado real fica no
// repositório). Cobre as regras da seção 4 de docs/boletim-lideranca/README.md.
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;

function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  OK  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}${detail !== undefined ? ' — ' + detail : ''}`); }
}
const perto = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= (tol || 1e-9);

function run(name, fn) {
  console.log(`\n${name}`);
  try { fn(); } catch (err) { fail++; console.log(`FAIL  erro: ${err.stack}`); }
}

// ---------------------------------------------------------------------
// Contexto: utils + parsers + parsers-boletim + metrics-indicadores + metrics-boletim
// ---------------------------------------------------------------------
const ctx = { console, Intl, Date };
ctx.window = ctx;
// SheetJS falso: as "abas" já são listas de linhas.
ctx.XLSX = { utils: { sheet_to_json: ws => ws.rows } };
vm.createContext(ctx);
for (const f of ['js/utils.js', 'js/parsers.js', 'js/parsers-boletim.js', 'js/metrics-indicadores.js', 'js/metrics-boletim.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
const M = ctx.HUB_METRICS_BOLETIM;
const PB = ctx.HUB_PARSERS_BOLETIM;

// ---------------------------------------------------------------------
// Dados inventados
// ---------------------------------------------------------------------
const RJ = 'Boticário - Rio de Janeiro';
const HER = 'Hering Rio';
let seq = 0;
function pessoa(nome, unidade, departamento, papel, adm, desl) {
  seq++;
  return {
    external_id: String(seq), nome_completo: nome, nome, email: `p${seq}@teste`,
    unidade, departamento, papel, situacao: desl ? 'Desligado' : 'Ativo',
    data_admissao: adm, ultimo_dia_trabalhado: desl || null, updated_at: '2026-10-06T10:00:00Z'
  };
}

const colabs = [];
// SG (loja de SG dentro da unidade do Rio)
colabs.push(pessoa('Gestora Rodo', RJ, 'O Boticário Rodo', 'Gestor', '2024-01-01'));
colabs.push(pessoa('Bia Rodo', RJ, 'O Boticário Rodo', 'Colaborador', '2024-01-01'));
colabs.push(pessoa('Caio Rodo', RJ, 'O Boticário Rodo', 'Colaborador', '2024-01-01', '2026-08-10'));
colabs.push(pessoa('Duda Rodo', RJ, 'O Boticário Rodo', 'Colaborador', '2026-08-05'));
colabs.push(pessoa('Enzo Rodo', RJ, 'O Boticário Rodo', 'Colaborador', '2025-03-01'));
// RJ: loja grande (28 liderados) e loja pequena (4 liderados) — ponderação
colabs.push(pessoa('Gestor Grande', RJ, 'O Boticário Grande', 'Gestor', '2023-01-01'));
for (let i = 1; i <= 28; i++) colabs.push(pessoa(`Grande ${i}`, RJ, 'O Boticário Grande', 'Colaborador', '2025-01-01'));
colabs.push(pessoa('Gestor Mini', RJ, 'O Boticário Mini', 'Gestor', '2023-01-01'));
for (let i = 1; i <= 4; i++) colabs.push(pessoa(`Mini ${i}`, RJ, 'O Boticário Mini', 'Colaborador', '2025-01-01'));
colabs.push(pessoa('Supervisor RJ', RJ, 'Supervisão O Boticário RJ', 'Gestor', '2022-01-01'));
// Hering: movimentação em vários meses (turnover)
colabs.push(pessoa('Gestora Hering', HER, 'Hering Centro', 'Gestor', '2023-01-01'));
for (let i = 1; i <= 10; i++) colabs.push(pessoa(`Hering ${i}`, HER, 'Hering Centro', 'Colaborador', '2025-01-01'));
colabs.push(pessoa('Hering Nova', HER, 'Hering Centro', 'Colaborador', '2026-07-15'));
colabs.push(pessoa('Hering Saiu Jul', HER, 'Hering Centro', 'Colaborador', '2025-01-01', '2026-07-20'));
colabs.push(pessoa('Hering Saiu Ago', HER, 'Hering Centro', 'Colaborador', '2025-01-01', '2026-08-31'));
colabs.push(pessoa('Hering Saiu Set', HER, 'Hering Centro', 'Colaborador', '2026-06-10', '2026-09-02'));
// AvE: venceu 45 dias e saiu antes do vencimento
colabs.push(pessoa('Ave Saiu', HER, 'Hering Centro', 'Colaborador', '2026-07-10', '2026-08-20'));
// Fora de qualquer operação
colabs.push(pessoa('Sem Unidade', 'Não Possui', 'Não possui', 'Colaborador', '2025-01-01'));

const feedbacks = [];
const fb = (data, de, para) => feedbacks.push({ data, de, para });
// Bia recebe 3 feedbacks no mês: conta 1 pessoa
fb('2026-08-03', 'Gestora Rodo', 'Bia Rodo'); fb('2026-08-10', 'Gestora Rodo', 'Bia Rodo'); fb('2026-08-20', 'Gestora Rodo', 'Bia Rodo');
// feedback de colaborador para colaborador: não conta
fb('2026-08-04', 'Enzo Rodo', 'Duda Rodo');
// Caio saiu no meio do mês: não conta na adesão
fb('2026-08-05', 'Gestora Rodo', 'Caio Rodo');
// Grande: 14 de 28; Mini: 4 de 4
for (let i = 1; i <= 14; i++) fb('2026-08-12', 'Gestor Grande', `Grande ${i}`);
for (let i = 1; i <= 4; i++) fb('2026-08-12', 'Gestor Mini', `Mini ${i}`);
// mês anterior (julho): Bia e Enzo
fb('2026-07-08', 'Gestora Rodo', 'Bia Rodo'); fb('2026-07-08', 'Gestora Rodo', 'Enzo Rodo');

const celebracoes = [];
for (let i = 0; i < 5; i++) celebracoes.push({ data: '2026-08-0' + (i + 1), colaborador_enviou: 'Gestora Rodo', colaboradores_receberam: 'Bia Rodo', unidade: RJ, departamento: 'O Boticário Rodo', papel: 'Gestor' });
celebracoes.push({ data: '2026-08-15', colaborador_enviou: 'Enzo Rodo', colaboradores_receberam: 'Duda Rodo', unidade: RJ, departamento: 'O Boticário Rodo', papel: 'Colaborador' });

const AVE = (nome, adm, g, a) => ({ nome, unidade: HER, departamento: 'Hering Centro', data_admissao: adm, status_gestor: g, status_auto: a });
const ave45 = [
  AVE('Hering A', '2026-07-18', 'Concluída', 'Pendente'),  // vence 31/08: entra
  AVE('Hering B', '2026-07-19', 'Concluída', 'Concluída'), // vence 01/09: fora
  AVE('Hering C', '2026-07-02', 'Pendente', 'Concluída'),  // vence 15/08: entra
  AVE('Ave Saiu', '2026-07-10', 'Pendente', 'Pendente')    // vence 23/08, saiu 20/08: fora
];
const ave90 = [AVE('Hering D', '2026-06-03', 'Concluída', 'Concluída')]; // vence 31/08

const pulso = { inicio: '2026-08-20', fim: '2026-08-27' };
const participacao = [
  { pulso_inicio: '2026-08-20', unidade: RJ, departamento: 'O Boticário Rodo', convidados: 4, respondentes: 2 },
  { pulso_inicio: '2026-08-20', unidade: RJ, departamento: 'O Boticário Grande', convidados: 28, respondentes: 10 },
  { pulso_inicio: '2026-08-20', unidade: RJ, departamento: 'O Boticário Mini', convidados: 4, respondentes: 4 }
];
const N = (dia, departamento, dimensao, soma, n, promotores, detratores) => ({ dia, unidade: RJ, departamento, dimensao, soma, n, promotores: promotores || 0, detratores: detratores || 0 });
const notas = [
  N('2026-08-21', 'O Boticário Grande', 'Satisfação', 40, 10),
  N('2026-08-21', 'O Boticário Grande', 'Cultura', 30, 10),
  N('2026-08-21', 'O Boticário Grande', 'NPS', 90, 10, 6, 2),  // 0-10: NÃO entra na nota
  N('2026-08-22', 'O Boticário Mini', 'Satisfação', 20, 4),
  N('2026-08-22', 'O Boticário Mini', 'NPS', 20, 4, 0, 3),
  N('2026-08-22', 'O Boticário Rodo', 'Satisfação', 10, 2),    // 2 respondentes: oculta
  N('2026-08-10', 'O Boticário Grande', 'Satisfação', 5, 5)    // fora da janela do pulso
];

function carregar(extra) {
  extra = extra || {};
  ctx.HUB_DATA = {
    colaboradores: colabs, feedbacks, celebracoes, one_on_one: [], twygo_participantes: [],
    engajamento_pulso: [pulso], engajamento_participacao: participacao
  };
  ctx.HUB_EXPERIENCIA_DATA = { 45: ave45, 90: ave90 };
  ctx.HUB_BOLETIM_DATA = Object.assign({ humor_mensal: [], engajamento_notas: notas, satisfacao_suporte: [], entradas: [], fechamentos: [], versao: ++seq }, extra);
  M._invalidar();
  return M.boletim('2026-08');
}

// ---------------------------------------------------------------------
run('1. Mapeamento loja → operação', () => {
  const casos = [
    [RJ, 'O Boticário Rodo', 'boti-sg'], [RJ, 'O Boticário Alcântara', 'boti-sg'], [RJ, 'O Boticário São Gonçalo Shop', 'boti-sg'],
    [RJ, 'O Boticário Mercadão', 'boti-rj'], [RJ, 'Comercial O Boticário RJ', 'boti-rj'],
    ['Quem disse, Berenice?', 'Quem disse, Berenice? Norte', 'boti-rj'],
    ['Boticário - Juiz de Fora', 'O Boticário Independência', 'boti-jf'], ['Boticário - Valença', 'O Boticário Valença', 'boti-jf'],
    ['Boticário - Interior de MG', 'O Boticário Manhuaçu (MG)', 'boti-mg'], ['Boticário - Três Rios', 'O Boticário Três Rios', 'boti-mg'],
    ['Boticário VD - Rio de Janeiro', 'O Boticário VD Alcântara', 'boti-vd'],
    ['Hering Rio', 'Hering Catete', 'hering'], ["Levi's", "Levi's Shopping Leblon", 'levis'], ['Levis', 'Levis Rio Sul', 'levis'],
    ['Escritório', 'DHO', 'escritorio'], ['Não Possui', 'Não possui', null], ['', 'O Boticário Rodo', null]
  ];
  for (const [u, d, esperado] of casos) check(`${u || '(vazio)'} / ${d} → ${esperado}`, M.operacaoDe(u, d) === esperado, M.operacaoDe(u, d));
  check('área de apoio: Supervisão é apoio', M.ehApoio('Supervisão O Boticário RJ', 'boti-rj'));
  check('no Escritório nada é apoio', !M.ehApoio('Comercial', 'escritorio'));
  const b = carregar();
  const rj = b.operacoes['boti-rj'];
  const sup = rj.lojas.find(l => l.departamento === 'Supervisão O Boticário RJ');
  check('apoio entra no total (HC)', sup && rj.base.hc_fim === 28 + 4 + 2 + 1, rj.base.hc_fim);
  check('Rodo (SG) não aparece no RJ', !rj.lojas.some(l => l.departamento === 'O Boticário Rodo'));
  check('pessoa sem unidade gera aviso de loja sem operação', b.avisos.some(a => a.area === 'Lojas' && a.texto.includes('Não Possui')));
});

run('2. Ponderação dos totais', () => {
  const rj = carregar().operacoes['boti-rj'];
  const grande = rj.lojas.find(l => l.nome === 'Grande'), mini = rj.lojas.find(l => l.nome === 'Mini');
  check('Grande = 14/28 = 50%', perto(grande.ind.feedback_adesao, 0.5), grande.ind.feedback_adesao);
  check('Mini = 4/4 = 100%', perto(mini.ind.feedback_adesao, 1), mini.ind.feedback_adesao);
  check('total = 18/32 (ponderado), não 75% (média simples)', perto(rj.ind.feedback_adesao, 18 / 32), rj.ind.feedback_adesao);
  check('nota da pesquisa do total = soma ÷ n de todas as lojas', perto(rj.ind.pesquisa_nota, (40 + 30 + 20) / 24), rj.ind.pesquisa_nota);
  check('participação do total = 14/32', perto(rj.ind.pesquisa_participacao, 14 / 32), rj.ind.pesquisa_participacao);
  const b = M.boletim('2026-08'), e = b.empresa;
  const ops = Object.values(b.operacoes);
  const somaB = k => ops.reduce((t, o) => t + o.base[k], 0);
  check('total da empresa: HC = soma das operações', e.base.hc_fim === somaB('hc_fim'), `${e.base.hc_fim} × ${somaB('hc_fim')}`);
  check('total da empresa: feedback = pessoas ÷ liderados de todas as operações', perto(e.ind.feedback_painel, somaB('feedback_pessoas') / somaB('liderados')), e.ind.feedback_painel);
  check('total da empresa: turnover ponderado', perto(e.ind.turnover, (somaB('admissoes') + somaB('desligamentos')) / 2 / somaB('hc_inicio')), e.ind.turnover);
  check('total da empresa: eNPS de todas as respostas = (6+0) − (2+3) ÷ 14 → 7', e.ind.nps === 7, e.ind.nps);
});

run('3. Feedback conta pessoas', () => {
  const sg = carregar().operacoes['boti-sg'];
  check('liderados ativos no fim do mês = 3 (Bia, Duda, Enzo; Caio saiu)', sg.base.liderados === 3, sg.base.liderados);
  check('3 feedbacks para a Bia = 1 pessoa; feedback de colaborador não conta', sg.base.feedback_pessoas === 1, sg.base.feedback_pessoas);
  check('adesão = 1/3', perto(sg.ind.feedback_adesao, 1 / 3), sg.ind.feedback_adesao);
  check('feedbacks de gestor contados (3 da Bia + 1 do Caio)', sg.base.feedbacks === 4, sg.base.feedbacks);
  check('nunca passa de 100%', Object.values(carregar().operacoes).every(o => o.ind.feedback_adesao == null || o.ind.feedback_adesao <= 1));
});

run('3b. Feedback por liderança', () => {
  for (let i = 1; i <= 28; i++) colabs.find(c => c.nome === 'Grande ' + i).gestor_direto = i <= 20 ? 'Gestor Grande' : 'Gestor Mini';
  const rj = carregar().operacoes['boti-rj'];
  const g = rj.feedback_lideres.find(x => x.gestor === 'Gestor Grande'), m = rj.feedback_lideres.find(x => x.gestor === 'Gestor Mini');
  check('Gestor Grande: 20 liderados, 14 receberam feedback dele', g && g.liderados === 20 && g.receberam === 14, JSON.stringify(g));
  check('Gestor Mini lidera 8 na loja Grande: feedback do Gestor Grande não conta para ele', m && m.liderados === 8 && m.receberam === 0 && m.loja === 'Grande', JSON.stringify(m));
  check('liderados sem gestor direto ficam em "Sem gestor direto"', rj.feedback_lideres.some(x => x.gestor === 'Sem gestor direto'));
  for (let i = 1; i <= 28; i++) delete colabs.find(c => c.nome === 'Grande ' + i).gestor_direto;
  // Gestor direto abreviado no cadastro ('Gestor Grande' escrito como 'Gestor Grande' com nome do meio)
  const g2 = pessoa('Ana Maria Souza', RJ, 'O Boticário Mini', 'Gestor', '2023-01-01'); colabs.push(g2);
  const m1 = colabs.find(c => c.nome === 'Mini 1'), m2 = colabs.find(c => c.nome === 'Mini 2');
  m1.gestor_direto = 'Ana Souza'; m2.gestor_direto = 'Ana Souza';
  feedbacks.push({ data: '2026-08-15', de: 'Ana Maria Souza', para: 'Mini 1' });
  const ana = carregar().operacoes['boti-rj'].feedback_lideres.find(x => x.gestor === 'Ana Maria Souza');
  check('gestor direto abreviado ("Ana Souza") é reconhecido: 1 de 2 liderados', ana && ana.liderados === 2 && ana.receberam === 1, JSON.stringify(ana));
  feedbacks.pop(); delete m1.gestor_direto; delete m2.gestor_direto; colabs.splice(colabs.indexOf(g2), 1);
});

run('4. Turnover igual ao da tela Rotatividade', () => {
  carregar();
  for (const mes of ['2026-06', '2026-07', '2026-08', '2026-09']) {
    const r = M.calcularMes(mes);
    const fim = M.fimDoMes(mes);
    const comparar = (rotulo, ind, filtro) => {
      const rot = ctx.HUB_METRICS.rotatividadeMetrics(Object.assign({ unidade: [], departamento: [], start: mes + '-01', end: fim }, filtro));
      const s = rot.serie[0];
      check(`${mes} ${rotulo}: ${ind.turnover == null ? '—' : (ind.turnover * 100).toFixed(2) + '%'}`, perto(ind.turnover || 0, s.taxaTurnover), `rotatividade ${s.taxaTurnover}`);
    };
    comparar('Hering (filtro de unidade)', r.operacoes.hering.ind, { unidade: [HER] });
    comparar('SG (filtro de departamento)', r.operacoes['boti-sg'].ind, { departamento: ['O Boticário Rodo'] });
  }
  const sg = M.calcularMes('2026-08').operacoes['boti-sg'];
  check('SG agosto: (1 adm + 1 desl) ÷ 2 ÷ HC 4 no início = 25%', perto(sg.ind.turnover, 0.25), sg.ind.turnover);
});

run('5. AvE: vencimento = admissão + 44 / + 89', () => {
  const h = carregar().operacoes.hering;
  check('45 dias: 2 no ciclo (18/07 → 31/08 e 02/07 → 15/08; 19/07 vence em setembro; quem saiu antes fica fora)', h.base.ave45_total === 2, h.base.ave45_total);
  check('45 dias gestor: 1 de 2', perto(h.ind.ave45_gestor, 0.5), h.ind.ave45_gestor);
  check('45 dias auto: 1 de 2', perto(h.ind.ave45_auto, 0.5), h.ind.ave45_auto);
  check('90 dias: 03/06 → 31/08 entra, 100%', h.base.ave90_total === 1 && perto(h.ind.ave90_gestor, 1), `${h.base.ave90_total} ${h.ind.ave90_gestor}`);
  const centro = h.lojas.find(l => l.nome === 'Centro');
  const g = centro && centro.ave_gestores.find(x => x.gestor === 'Sem gestor informado');
  check('nominal por gestor: 2 venceram em 45 dias, 1 respondida, 1 pendente', g && g[45].tot === 2 && g[45].g === 1, JSON.stringify(g));
  const set = M.calcularMes('2026-09').operacoes.hering;
  check('setembro pega o de 19/07', set.base.ave45_total === 1, set.base.ave45_total);
});

run('6. Nota da pesquisa sem NPS e dentro da janela do pulso', () => {
  const rj = carregar().operacoes['boti-rj'];
  const grande = rj.lojas.find(l => l.nome === 'Grande');
  check('Grande = (40+30)/20 = 3,5 (sem o NPS e sem a resposta de 10/08)', perto(grande.ind.pesquisa_nota, 3.5), grande.ind.pesquisa_nota);
  check('pilares por dimensão', perto(grande.ind.pilares['Satisfação'], 4) && perto(grande.ind.pilares['Cultura'], 3), JSON.stringify(grande.ind.pilares));
  check('pilar NPS não aparece', !('NPS' in rj.ind.pilares));
});

run('7. Anonimato (< 3 respondentes)', () => {
  const b = carregar();
  const rodo = b.operacoes['boti-sg'].lojas.find(l => l.nome === 'Rodo');
  check('Rodo (2 respondentes): nota oculta na loja', rodo.ind.pesquisa_nota == null && rodo.ind.pesquisa_oculta === true, `${rodo.ind.pesquisa_nota} ${rodo.ind.pesquisa_oculta}`);
  check('… mas entra no total da operação', perto(b.operacoes['boti-sg'].ind.pesquisa_nota, 5), b.operacoes['boti-sg'].ind.pesquisa_nota);
  const mini = b.operacoes['boti-rj'].lojas.find(l => l.nome === 'Mini');
  check('Mini (4 respondentes): nota aparece', perto(mini.ind.pesquisa_nota, 5), mini.ind.pesquisa_nota);
  check('eNPS nunca aparece por loja', b.operacoes['boti-rj'].lojas.every(l => l.ind.nps == null));
});

run('8. eNPS', () => {
  const rj = carregar().operacoes['boti-rj'];
  // 14 respostas: 6 promotores, 5 detratores → (6 − 5) ÷ 14 = 7,1 → 7
  check('eNPS do RJ = 7', rj.ind.nps === 7, rj.ind.nps);
  check('respostas de NPS = 14', rj.ind.nps_respostas === 14, rj.ind.nps_respostas);
  check('média de recomendação = 110/14', perto(rj.ind.nps_media, 110 / 14), rj.ind.nps_media);
  check('sem respostas → eNPS vazio', carregar().operacoes.hering.ind.nps == null);
});

run('9. Setas e variações', () => {
  const v1 = M.variacao('turnover', 0.02, 0.05);
  check('turnover caiu 3 p.p.: ▼ e bom', v1.dir === -1 && v1.bom === true && M.fmtVariacao('turnover', v1) === '▼ 3,0 p.p.', M.fmtVariacao('turnover', v1));
  const v2 = M.variacao('feedback_adesao', 0.3, 0.42);
  check('feedback caiu 12 p.p.: ▼ e ruim', v2.dir === -1 && v2.bom === false && M.fmtVariacao('feedback_adesao', v2) === '▼ 12,0 p.p.', M.fmtVariacao('feedback_adesao', v2));
  const v3 = M.variacao('humor_media', 4.02, 4.0);
  check('humor +0,02: "=" (estável)', v3.dir === 0 && M.fmtVariacao('humor_media', v3) === '=', M.fmtVariacao('humor_media', v3));
  const v4 = M.variacao('celebracoes', 5, 9);
  check('celebrações 9 → 5: "▼ 4"', M.fmtVariacao('celebracoes', v4) === '▼ 4', M.fmtVariacao('celebracoes', v4));
  check('nota 3,9 → 4,06: "▲ 0,2"', M.fmtVariacao('pesquisa_nota', M.variacao('pesquisa_nota', 4.06, 3.9)) === '▲ 0,2');
  check('sem valor anterior: sem seta', M.variacao('turnover', 0.1, null) === null);

  let sg = carregar().operacoes['boti-sg'];
  check('sem fechamento: compara com julho recalculado (2/3 → 1/3)', sg.anteriorFonte === 'recalculado' && sg.variacoes.feedback_adesao.dir === -1, sg.anteriorFonte);
  sg = carregar({ fechamentos: [{ mes: '2026-07-01', operacao: 'boti-sg', dados: { ind: { feedback_adesao: 0.1, twygo_progresso: 0.5 }, lojas: [] } }] }).operacoes['boti-sg'];
  check('com julho fechado: compara com a foto (10% → 33%: ▲)', sg.anteriorFonte === 'fechado' && sg.variacoes.feedback_adesao.dir === 1, sg.anteriorFonte);
  check('Twygo sem mês fechado: sem seta', carregar().operacoes['boti-sg'].variacoes.twygo_progresso === null);
});

run('10. Engajamento na Feedz: média dos módulos com as contas da Feedz', () => {
  const E = (operacao, loja, valor) => ({ mes: '2026-08-01', operacao, loja, indicador: 'acessos_feedz', valor });
  const humor = [{ mes: '2026-08-01', unidade: RJ, departamento: 'O Boticário Rodo', registros: 20, soma: 80, pessoas: 3 }];
  let sg = carregar({ humor_mensal: humor }).operacoes['boti-sg'];
  const c = sg.ind.engajamento_componentes;
  // Rodo: 4 ativos; 5 feedbacks enviados (gestora 4 + Enzo 1); 6 celebrações; 20 humores
  check('feedbacks enviados ÷ ativos, até 100%', perto(c.feedbacks, 1) && sg.base.feedbacks_enviados === 5, JSON.stringify(c));
  check('celebrações da loja inteira ÷ ativos, até 100%', perto(c.celebracoes, 1));
  check('humor = registros ÷ (10 × ativos) = 20/40', perto(c.humor, 0.5), c.humor);
  check('Pesquisa de Engajamento: 2 de 4 convidados', perto(c.pesquisa, 0.5), c.pesquisa);
  check('sem gestor apto e sem AvE vencida: Satisfação e AvE ficam fora', c.satisfacao == null && c.ave == null, JSON.stringify(c));
  check('sem acessos: média dos outros módulos (1 + 1 + 0,5 + 0,5) ÷ 4 e marcado como incompleto', perto(sg.ind.engajamento_feedz, 0.75) && sg.ind.engajamento_completo === false, sg.ind.engajamento_feedz);
  const b = carregar({ humor_mensal: humor, entradas: [E('boti-sg', 'O Boticário Rodo', 0.5), E('boti-rj', 'O Boticário Grande', 0.5), E('boti-rj', 'O Boticário Mini', 1)] });
  sg = b.operacoes['boti-sg'];
  check('com acessos 50%: (0,5 + 1 + 1 + 0,5 + 0,5) ÷ 5 = 70%', perto(sg.ind.engajamento_feedz, 0.7) && sg.ind.engajamento_completo, sg.ind.engajamento_feedz);
  const her = b.operacoes.hering.ind.engajamento_componentes;
  check('AvE: (gestor + auto concluídas) ÷ (2 × vencidas) = (1+1+1+1) ÷ 6', perto(her.ave, 4 / 6), her.ave);
  const rj = b.operacoes['boti-rj'];
  check('acessos do total ponderado pelos ativos: (14,5 + 5) ÷ 34', perto(rj.ind.engajamento_componentes.acessos, 19.5 / 34), rj.ind.engajamento_componentes.acessos);
  check('aviso lista as operações com lojas sem acessos', b.avisos.some(a => a.area === 'Engajamento na Feedz' && a.texto.includes('Hering') && !a.texto.includes('SG')));
});

run('11. Textos do boletim', () => {
  check('edição #020 = agosto/2026', M.edicaoDoMes('2026-08') === 20);
  check('edição #021 = setembro/2026; #025 = janeiro/2027', M.edicaoDoMes('2026-09') === 21 && M.edicaoDoMes('2027-01') === 25);
  const b = carregar();
  for (const op of M.OPERACOES) {
    const secoes = M.textos(b.operacoes[op.id], '2026-08');
    const tudo = M.textoCorrido(secoes);
    check(`${op.nome}: sem undefined/NaN/null`, !/undefined|NaN|null/.test(tudo), (tudo.match(/.{0,40}(undefined|NaN|null).{0,20}/) || [])[0]);
  }
  const sg = M.textos(b.operacoes['boti-sg'], '2026-08');
  check('título "Boletim da Liderança #020 – Agosto 2026"', sg[0].titulo === 'Boletim da Liderança #020 – Agosto 2026', sg[0].titulo);
  check('saudação de SG', sg[0].paragrafos[0] === 'Olá, Liderança do O Boticário - São Gonçalo!');
  const fbTxt = sg.find(s => s.id === 'feedbacks').paragrafos[0];
  check('feedback: "1 de 3 liderados"', fbTxt.includes('1 de 3 liderados'), fbTxt);
  const sat = M.textos(Object.assign({}, b.operacoes.hering, { ind: Object.assign({}, b.operacoes.hering.ind, { satisfacao_respondentes: 1 }) }), '2026-08').find(s => s.id === 'satisfacao').paragrafos[1];
  check('singular: "1 gestor"', /de 1 gestor\b/.test(sat), sat);
});

run('12. Parsers: Pesquisa de Satisfação e Humor', () => {
  const mesBR = PB._internal.mesBR;
  check('"set/26" → 2026-09-01', mesBR('set/26') === '2026-09-01', mesBR('set/26'));
  check('"março/2026" → 2026-03-01', mesBR('março/2026') === '2026-03-01', mesBR('março/2026'));
  check('"Ago/24" → 2024-08-01', mesBR('Ago/24') === '2024-08-01', mesBR('Ago/24'));
  check('data → mês', mesBR(new Date(2026, 8, 3)) === '2026-09-01', mesBR(new Date(2026, 8, 3)));
  const wbSat = { SheetNames: ['Base Original'], Sheets: { 'Base Original': { rows: [
    { PESQUISA: 'set/26', Unidade: RJ, Departamento: 'O Boticário Rodo', 'Posição na empresa': 'É líder', CPF: '000', 'Financeiro - 0 a 10': '9', 'DP - 0 a 10': 7, 'DP - Comentários': 'texto' },
    { PESQUISA: 'set/26', Unidade: RJ, Departamento: 'O Boticário Rodo', 'Posição na empresa': 'É líder', CPF: '111', 'Financeiro - 0 a 10': 5, 'DP - 0 a 10': '' },
    { PESQUISA: 'ago/26', Unidade: HER, Departamento: 'Hering Centro', 'Posição na empresa': 'É líder', CPF: '222', 'Financeiro - 0 a 10': 10, 'DP - 0 a 10': 10 }
  ] } } };
  const sat = PB.parseSatisfacao(wbSat);
  const rodo = sat.linhas.find(l => l.pesquisa === '2026-09-01');
  check('agrupa por mês e loja', sat.linhas.length === 2 && rodo && rodo.respondentes === 2, JSON.stringify(sat.linhas));
  check('notas por área (vazio não conta)', rodo.areas.Financeiro.soma === 14 && rodo.areas.Financeiro.n === 2 && rodo.areas.DP.n === 1, JSON.stringify(rodo.areas));
  check('não guarda CPF nem comentário', !JSON.stringify(sat.linhas).includes('000') && !JSON.stringify(sat.linhas).includes('texto'));
  const wbHum = { SheetNames: ['Worksheet'], Sheets: { Worksheet: { rows: [
    { Nome: 'Bia Rodo', Unidade: RJ, Departamento: 'O Boticário Rodo', Media: 2, 'Nota do Humor': 5, Data: new Date(2026, 8, 1, 0, 0, 28) },
    { Nome: 'Bia Rodo', Unidade: RJ, Departamento: 'O Boticário Rodo', Media: 2, 'Nota do Humor': 3, Data: new Date(2026, 8, 30, 0, 0, 28) },
    { Nome: 'Enzo Rodo', Unidade: RJ, Departamento: 'O Boticário Rodo', Media: 2, 'Nota do Humor': 4, Data: '15/09/2026 07:40:17' },
    { Nome: 'Enzo Rodo', Unidade: RJ, Departamento: 'O Boticário Rodo', Media: 2, 'Nota do Humor': 4, Data: new Date(2026, 9, 1, 0, 0, 28) },
    { Nome: 'Sem nota', Unidade: RJ, Departamento: 'O Boticário Rodo', 'Nota do Humor': '', Data: new Date(2026, 8, 2) }
  ] } } };
  const hum = PB.parseHumor(wbHum);
  const set = hum.linhas.find(l => l.mes === '2026-09-01');
  check('humor de setembro: 3 registros, soma 12, 2 pessoas (não usa a coluna Media)', set && set.registros === 3 && set.soma === 12 && set.pessoas === 2, JSON.stringify(set));
  check('01/10 vai para outubro', hum.linhas.some(l => l.mes === '2026-10-01' && l.registros === 1));
  check('linha sem nota é ignorada com aviso', hum.avisos.length === 1, hum.avisos.join(' | '));
  check('não guarda nomes', !JSON.stringify(hum.linhas).includes('Bia'));
});

// Os testes abaixo acrescentam dados aos fixtures: ficam por último.
run('13. Celebrações do gestor para o próprio time', () => {
  const antes = carregar().operacoes['boti-sg'].ind.celebracoes;
  const cel = (codigo, data, de, para, papel, extra) => celebracoes.push(Object.assign({ codigo, data, colaborador_enviou: de, colaboradores_receberam: para, unidade: RJ, departamento: 'O Boticário Rodo', papel }, extra || {}));
  // uma celebração com 3 destinatários = 3 linhas no export, mesmo código
  cel('C1', '2026-08-20', 'Gestora Rodo', 'Bia Rodo', 'Gestor'); cel('C1', '2026-08-20', 'Gestora Rodo', 'Enzo Rodo', 'Gestor'); cel('C1', '2026-08-20', 'Gestora Rodo', 'Duda Rodo', 'Gestor');
  // @todos conta como o time
  cel('C2', '2026-08-21', 'Gestora Rodo', 'todos', 'Gestor');
  // gestora celebrando gente de outra loja/time: não conta
  cel('C3', '2026-08-22', 'Gestora Rodo', 'Grande 1', 'Gestor');
  // usuário automático de aniversários: não conta (nem no total)
  cel('C4', '2026-08-23', 'Juliana Caldeira', 'todos', 'Gestor');
  const sg = carregar().operacoes['boti-sg'];
  check('+2 celebrações do gestor para o time (3 linhas do mesmo código = 1; @todos = 1)', sg.ind.celebracoes === antes + 2, `${antes} → ${sg.ind.celebracoes}`);
  check('total de celebrações conta cada código uma vez e ignora o robô', sg.base.celebracoes_total === 6 + 3, sg.base.celebracoes_total);
  const g = colabs.find(c => c.nome === 'Grande 1');
  g.gestor_direto = 'Gestora Rodo';
  check('liderado direto de outra loja conta', carregar().operacoes['boti-sg'].ind.celebracoes === antes + 3);
  delete g.gestor_direto;
  // linha do export sem departamento: vai para a loja do remetente no cadastro
  cel('C5', '2026-08-24', 'Gestora Rodo', 'todos', null, { departamento: '' });
  const sg2 = carregar().operacoes['boti-sg'];
  check('celebração sem departamento no export cai na loja do remetente (papel vazio → cadastro)', sg2.ind.celebracoes === antes + 3 && !sg2.lojas.some(l => l.nome === 'Sem departamento'), `${sg2.ind.celebracoes} ${sg2.lojas.map(l => l.nome).join(',')}`);
});

run('14. Pesquisa de Satisfação: base = tag pesquisa.satisfação; Escritório vê a empresa toda', () => {
  colabs.find(c => c.nome === 'Gestora Rodo').grupos = 'gestor.boti,pesquisa.satisfação,';
  colabs.find(c => c.nome === 'Gestor Grande').grupos = 'pesquisa.satisfação';
  colabs.find(c => c.nome === 'Gestor Mini').grupos = 'gestor.boti';
  const sat = [
    { pesquisa: '2026-08-01', unidade: RJ, departamento: 'O Boticário Rodo', respondentes: 1, areas: { DP: { soma: 8, n: 1 } } },
    { pesquisa: '2026-08-01', unidade: RJ, departamento: 'O Boticário Grande', respondentes: 1, areas: { DP: { soma: 6, n: 1 } } }
  ];
  const b = carregar({ satisfacao_suporte: sat });
  const sg = b.operacoes['boti-sg'], rj = b.operacoes['boti-rj'], esc = b.operacoes.escritorio;
  check('SG: 1 de 1 apto = 100%', sg.base.satisfacao_aptos === 1 && perto(sg.ind.satisfacao_participacao, 1), `${sg.base.satisfacao_aptos} ${sg.ind.satisfacao_participacao}`);
  check('Satisfação entra no engajamento da loja (1 de 1 = 100%)', perto(sg.ind.engajamento_componentes.satisfacao, 1));
  check('RJ: 1 de 1 apto (Gestor Mini sem a tag não entra)', rj.base.satisfacao_aptos === 1 && perto(rj.ind.satisfacao_participacao, 1), rj.base.satisfacao_aptos);
  check('Escritório: 2 respostas da empresa toda, 2 de 2 aptos', esc.ind.satisfacao_respondentes === 2 && perto(esc.ind.satisfacao_participacao, 1) && esc.ind.satisfacao_empresa, `${esc.ind.satisfacao_respondentes} ${esc.ind.satisfacao_participacao}`);
  check('Escritório: nota por área da empresa (DP = 7)', perto(esc.ind.satisfacao_areas.DP, 7), JSON.stringify(esc.ind.satisfacao_areas));
});

run('15. Texto do Escritório', () => {
  colabs.push(pessoa('Gestora DHO', 'Escritório', 'DHO', 'Gestor', '2023-01-01'));
  colabs.push(pessoa('Ana DHO', 'Escritório', 'DHO', 'Colaborador', '2024-01-01'));
  colabs.push(pessoa('Beto DHO', 'Escritório', 'DHO', 'Colaborador', '2024-01-01'));
  ctx.HUB_DATA_ONE = [{ status: 'Realizado', data_realizada: '2026-08-10', liderado: 'Ana DHO', departamento: 'DHO' }];
  const b = carregar({ entradas: [{ mes: '2026-08-01', operacao: 'hering', loja: null, indicador: 'unibe_adesao', valor: 0.9 }] });
  ctx.HUB_DATA.one_on_one = ctx.HUB_DATA_ONE; M._invalidar();
  const b2 = M.boletim('2026-08');
  const e = b2.operacoes.escritorio;
  check('Escritório: engajamento usa 1:1 (1 realizado ÷ 3 ativos) no lugar dos feedbacks', perto(e.ind.engajamento_componentes.oneonone, 1 / 3) && e.ind.engajamento_componentes.feedbacks === undefined, JSON.stringify(e.ind.engajamento_componentes));
  check('Escritório: 1:1 de 1 dos 2 liderados = 50%', perto(e.ind.oneonone_adesao, 0.5), e.ind.oneonone_adesao);
  const t = M.textos(e, '2026-08');
  check('sem a seção de Treinamento', !t.some(s => s.id === 'treinamento'));
  check('seção "Feedbacks e 1 on 1"', t.some(s => s.titulo === '🌟 Feedbacks e 1 on 1'));
  check('fala em departamento, não em loja', !/por loja/.test(M.textoCorrido(t)));
  check('as outras operações continuam com Treinamento', M.textos(b.operacoes.hering, '2026-08').some(s => s.id === 'treinamento'));
});

console.log(`\n${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
