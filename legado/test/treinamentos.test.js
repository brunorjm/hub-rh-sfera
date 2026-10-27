// Testa o módulo Treinamentos fora do navegador: leitura das planilhas 27.1
// Unibê e 27.2 Academia Hering (js/parsers-treinamentos.js), as contas das abas
// (js/metrics-treinamentos.js) e a entrada desses números no Boletim da
// Liderança (js/metrics-boletim.js). Roda com: node test/treinamentos.test.js
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
const perto = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= (tol || 1e-9);
function run(name, fn) {
  console.log(`\n${name}`);
  try { fn(); } catch (err) { fail++; console.log(`FAIL  erro: ${err.stack}`); }
}

const ctx = { console, Intl, Date };
ctx.window = ctx;
// SheetJS falso: cada aba é { rows (valores brutos), texto (valores formatados) }.
ctx.XLSX = { utils: { sheet_to_json: (ws, o) => (o && o.raw === false && ws.texto) || ws.rows } };
vm.createContext(ctx);
for (const f of ['js/utils.js', 'js/parsers.js', 'js/parsers-treinamentos.js', 'js/metrics-indicadores.js', 'js/metrics-boletim.js', 'js/metrics-treinamentos.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
const P = ctx.HUB_PARSERS_TREINAMENTOS;
const T = ctx.HUB_METRICS_TREINAMENTOS;
const MB = ctx.HUB_METRICS_BOLETIM;
const wb = abas => ({ SheetNames: Object.keys(abas), Sheets: abas });

// ---------------------------------------------------------------------
// Cadastro inventado
// ---------------------------------------------------------------------
const RJ = 'Boticário - Rio de Janeiro', MG = 'Boticário - Interior de MG', HER = 'Hering';
let seq = 0;
const pessoa = (nome, unidade, departamento, desl) => ({
  external_id: String(++seq), nome_completo: nome, nome, email: `p${seq}@teste`, unidade, departamento,
  papel: 'Colaborador', situacao: desl ? 'Desligado' : 'Ativo', data_admissao: '2025-01-01', ultimo_dia_trabalhado: desl || null
});
const colabs = [
  pessoa('Ana Maria Souza', RJ, 'O Boticário Centro'),
  pessoa('Bruno Lima', RJ, 'O Boticário Centro'),
  pessoa('Carla Dias', RJ, 'O Boticário Rodo'),           // loja de SG
  pessoa('Davi Rocha', MG, 'O Boticário Ipanema'),
  pessoa('Odir Luiz Ferreira Garcez', HER, 'Hering Rio Sul'),
  pessoa('Maria Elani Deodato de Souza', HER, 'Hering Catete'),
  pessoa('Victor Hugo Pereira', HER, 'Hering Rio Sul'),
  pessoa('Victor Hugo Santos', HER, 'Hering Rio Sul', '2026-01-10'),   // homônimo desligado
  pessoa('Bruno Lima', 'Levis', 'Levis Centro')            // homônimo em outra operação
];

// ---------------------------------------------------------------------
run('Unibê — leitura das abas PDV e Pessoa', () => {
  const abaPdv = { rows: [
    { PDV: 1001, 'NOME PDV': 'O Boticário Centro', 'REGIÃO': 'RJ', SEGMENTO: 'Loja', Gerente: 'SEGMENTO', 'SUPERVISÃO': 'Sup A', MULTI: 'Multi A', 'ADESÃO ATUAL': 0.95 },
    { PDV: 1002, 'NOME PDV': 'O Boticário Rodo', 'REGIÃO': 'SG', SEGMENTO: 'Loja', Gerente: 'Gê', 'SUPERVISÃO': 'Sup B', MULTI: 'Multi A', 'ADESÃO ATUAL': 0.8 },
    { PDV: 1003, 'NOME PDV': 'O Boticário Ipanema (MG)', 'REGIÃO': 'MG', SEGMENTO: 'Loja', Gerente: 'Gi', 'SUPERVISÃO': 'Sup C', MULTI: 'Multi B', 'ADESÃO ATUAL': 1 },
    { PDV: 1004, 'NOME PDV': 'Loja Fantasma', 'REGIÃO': 'MG', SEGMENTO: 'Loja', Gerente: 'Go', 'SUPERVISÃO': 'Sup C', MULTI: 'Multi B', 'ADESÃO ATUAL': 0.5 },
    { PDV: '', 'NOME PDV': '', 'ADESÃO ATUAL': '' }
  ] };
  const abaPes = { rows: [
    { NOME: 'Ana Maria Souza', CARGO: 'Consultor', 'CÓDIGO DE PDV': 1001, 'NOME PDV': 'O Boticário Centro', 'REGIÃO': 'RJ', SEGMENTO: 'Loja', 'ADESÃO IAF': 1 },
    { NOME: 'Bruno Lima', CARGO: 'Consultor', 'CÓDIGO DE PDV': 1001, 'NOME PDV': 'O Boticário Centro', 'REGIÃO': 'RJ', SEGMENTO: 'Loja', 'ADESÃO IAF': 0.5 },
    { NOME: 'Carla Dias', CARGO: 'Gerente', 'CÓDIGO DE PDV': 1002, 'NOME PDV': 'O Boticário Rodo', 'REGIÃO': 'SG', SEGMENTO: 'Loja', 'ADESÃO IAF': 0 },
    { NOME: 'Pessoa Nova', CARGO: 'Consultor', 'CÓDIGO DE PDV': 1002, 'NOME PDV': 'O Boticário Rodo', 'REGIÃO': 'SG', SEGMENTO: 'Loja', 'ADESÃO IAF': 0.9 }
  ] };
  const r = P.parseUnibe(wb({ 'Visão Gral - PDV': abaPdv, 'Visão Geral - Pessoa': abaPes }), { colaboradores: colabs });
  check('4 PDVs (linha vazia descartada)', r.pdvs.length === 4, r.pdvs.length);
  const centro = r.pdvs.find(p => p.pdv === '1001');
  check('PDV casado pelo departamento das pessoas', centro.departamento === 'O Boticário Centro' && centro.unidade === RJ);
  check('homônimo de outra operação não atrapalha (Unibê só olha Boticário)', r.pessoas.find(p => p.nome === 'Bruno Lima').unidade === RJ);
  check('gerente "SEGMENTO" vira vazio', centro.gerente === null);
  check('PDV sem ninguém casado acha a loja pelo nome, sem "(MG)"', r.pdvs.find(p => p.pdv === '1003').departamento === 'O Boticário Ipanema');
  check('PDV sem correspondência fica sem departamento', r.pdvs.find(p => p.pdv === '1004').departamento === null);
  check('aviso do PDV sem loja', r.avisos.some(a => /Loja Fantasma/.test(a)), r.avisos.join(' | '));
  const nova = r.pessoas.find(p => p.nome === 'Pessoa Nova');
  check('pessoa fora do cadastro herda a loja do PDV', nova.departamento === 'O Boticário Rodo' && nova.no_cadastro === false && nova.nome_cadastro === null);
  check('pessoas no PDV', centro.pessoas === 2);
  check('adesão média dos PDVs', perto(r.resumo.adesaoMedia, (0.95 + 0.8 + 1 + 0.5) / 4));
  let erro = null;
  try { P.parseUnibe(wb({ x: { rows: [{ a: 1 }] } }), {}); } catch (e) { erro = e.message; }
  check('planilha errada dá erro claro', /Visão Geral - PDV/.test(erro || ''), erro);
});

run('Academia Hering — leitura', () => {
  const linhas = [
    { 'Nome Completo': 'ODIR GARCEZ', Cargo: 'Gerente de Loja', Loja: 'HERING MEGA STORE - SHOPPING RIO SUL', 'Último Acesso': '05/10/2026 10:13', 'Horas de Treinamento': '51:20', Performance: '1439' },
    { 'Nome Completo': 'MARIA ELANI DEODATO DE SOUZA ', Cargo: 'Gerente de Loja', Loja: 'HERING STORE - RUA DO CATETE', 'Último Acesso': '29/08/2026 11:49', 'Horas de Treinamento': '10:30', Performance: '500' },
    { 'Nome Completo': 'VICTOR  HUGO', Cargo: 'Vendedor', Loja: 'HERING MEGA STORE - SHOPPING RIO SUL', 'Último Acesso': '', 'Horas de Treinamento': '0:00', Performance: '0' },
    { 'Nome Completo': 'FULANO SEM CADASTRO', Cargo: 'Caixa', Loja: 'HERING STORE - RUA DO CATETE', 'Último Acesso': '01/10/2026 09:00', 'Horas de Treinamento': '2:15', Performance: '100' },
    { 'Nome Completo': 'OUTRA PESSOA', Cargo: 'Caixa', Loja: 'HERING STORE - LOJA NOVA', 'Último Acesso': '', 'Horas de Treinamento': '0:00', Performance: '0' }
  ];
  const r = P.parseAcademia(wb({ 'Dados Exportados': { rows: linhas, texto: linhas } }), { colaboradores: colabs });
  const odir = r.linhas.find(l => l.nome === 'ODIR GARCEZ');
  check('nome abreviado casa com o cadastro (primeiro + último)', odir.no_cadastro && odir.nome_cadastro === 'Odir Luiz Ferreira Garcez' && odir.departamento === 'Hering Rio Sul');
  check('data em texto dd/mm/aaaa', odir.ultimo_acesso === '2026-10-05', odir.ultimo_acesso);
  check('horas "51:20" = 51,33', perto(odir.horas, 51 + 20 / 60, 1e-6), odir.horas);
  check('performance em texto vira número', odir.performance === 1439);
  check('espaços duplicados no nome', r.linhas.some(l => l.nome === 'MARIA ELANI DEODATO DE SOUZA'));
  check('homônimo desligado não impede o casamento (ativo tem preferência)', r.linhas.find(l => l.nome === 'VICTOR HUGO').nome_cadastro === 'Victor Hugo Pereira');
  const fulano = r.linhas.find(l => l.nome === 'FULANO SEM CADASTRO');
  check('fora do cadastro herda o departamento da loja', fulano.departamento === 'Hering Catete' && !fulano.no_cadastro);
  check('resumo: 3 lojas, performance média', r.resumo.lojas === 3 && perto(r.resumo.performanceMedia, (1439 + 500 + 0 + 100 + 0) / 5));
  const nova = r.linhas.find(l => l.nome === 'OUTRA PESSOA');
  check('loja não achada fica na unidade Hering (nunca sem unidade)', nova.unidade === HER && nova.departamento === null, JSON.stringify(nova));
});

// ---------------------------------------------------------------------
// Bases gravadas (como voltam do banco) para as contas
// ---------------------------------------------------------------------
ctx.HUB_DATA = {
  colaboradores: colabs,
  unibe_pdv: [
    { mes: '2026-08-01', pdv: '1001', nome_pdv: 'O Boticário Centro', regiao: 'RJ', segmento: 'Loja', supervisao: 'Sup A', multi: 'Multi A', adesao: 0.9, pessoas: 2, unidade: RJ, departamento: 'O Boticário Centro' },
    { mes: '2026-08-01', pdv: '1002', nome_pdv: 'O Boticário Rodo', regiao: 'SG', segmento: 'Loja', supervisao: 'Sup B', multi: 'Multi A', adesao: 0.7, pessoas: 2, unidade: RJ, departamento: 'O Boticário Rodo' },
    { mes: '2026-09-01', pdv: '1001', nome_pdv: 'O Boticário Centro', regiao: 'RJ', segmento: 'Loja', supervisao: 'Sup A', multi: 'Multi A', adesao: 0.95, pessoas: 2, unidade: RJ, departamento: 'O Boticário Centro' },
    { mes: '2026-09-01', pdv: '1002', nome_pdv: 'O Boticário Rodo', regiao: 'SG', segmento: 'Loja', supervisao: 'Sup B', multi: 'Multi A', adesao: 0.8, pessoas: 2, unidade: RJ, departamento: 'O Boticário Rodo' },
    { mes: '2026-09-01', pdv: '1003', nome_pdv: 'O Boticário Ipanema (MG)', regiao: 'MG', segmento: 'Loja', supervisao: 'Sup C', multi: 'Multi B', adesao: 1, pessoas: 0, unidade: MG, departamento: 'O Boticário Ipanema' }
  ],
  unibe_pessoas: [
    { mes: '2026-09-01', nome: 'Ana Maria Souza', cargo: 'Consultor', pdv: '1001', adesao: 1, unidade: RJ, departamento: 'O Boticário Centro', no_cadastro: true, nome_cadastro: 'Ana Maria Souza' },
    { mes: '2026-09-01', nome: 'Bruno Lima', cargo: 'Consultor', pdv: '1001', adesao: 0.5, unidade: RJ, departamento: 'O Boticário Centro', no_cadastro: true, nome_cadastro: 'Bruno Lima' },
    { mes: '2026-09-01', nome: 'Carla Dias', cargo: 'Gerente', pdv: '1002', adesao: 0, unidade: RJ, departamento: 'O Boticário Rodo', no_cadastro: true, nome_cadastro: 'Carla Dias' }
  ],
  academia_hering: [
    { mes: '2026-09-01', nome: 'ODIR GARCEZ', nome_cadastro: 'Odir Luiz Ferreira Garcez', cargo: 'Gerente de Loja', loja: 'HERING MEGA STORE - SHOPPING RIO SUL', ultimo_acesso: '2026-10-05', horas: 50, performance: 1400, unidade: HER, departamento: 'Hering Rio Sul', no_cadastro: true },
    { mes: '2026-09-01', nome: 'VICTOR HUGO', nome_cadastro: 'Victor Hugo Pereira', cargo: 'Vendedor', loja: 'HERING MEGA STORE - SHOPPING RIO SUL', ultimo_acesso: null, horas: 0, performance: 0, unidade: HER, departamento: 'Hering Rio Sul', no_cadastro: true },
    { mes: '2026-09-01', nome: 'MARIA ELANI', nome_cadastro: 'Maria Elani Deodato de Souza', cargo: 'Gerente de Loja', loja: 'HERING STORE - RUA DO CATETE', ultimo_acesso: '2026-08-20', horas: 20, performance: 800, unidade: HER, departamento: 'Hering Catete', no_cadastro: true },
    { mes: '2026-08-01', nome: 'ODIR GARCEZ', nome_cadastro: 'Odir Luiz Ferreira Garcez', cargo: 'Gerente de Loja', loja: 'HERING MEGA STORE - SHOPPING RIO SUL', ultimo_acesso: '2026-09-01', horas: 40, performance: 1000, unidade: HER, departamento: 'Hering Rio Sul', no_cadastro: true }
  ],
  twygo_participantes: [
    // ativo, concluído em ago; ativo pendente; inativo concluído em set; cancelada
    { nome_completo: 'Ana Maria Souza', email: 'a@t', unidade: RJ, departamento: 'O Boticário Centro', content_title: 'Curso A', content_type: 'Curso', situacao_inscricao: 'Confirmado', situacao: 'Aprovado', situacao_ambiente: 'Ativo', progresso: 1, carga_horaria: 2, data_inscricao: '2026-07-01', concluido_em: '2026-08-10' },
    { nome_completo: 'Ana Maria Souza', email: 'a@t', unidade: RJ, departamento: 'O Boticário Centro', content_title: 'Curso B', content_type: 'Curso', situacao_inscricao: 'Confirmado', situacao: 'Em Andamento', situacao_ambiente: 'Ativo', progresso: 0, carga_horaria: 3, data_inscricao: '2026-07-01' },
    { nome_completo: 'Bruno Lima', email: 'b@t', unidade: RJ, departamento: 'O Boticário Centro', content_title: 'Curso A', content_type: 'Curso', situacao_inscricao: 'Confirmado', situacao: 'Em Andamento', situacao_ambiente: 'Ativo', progresso: 0.5, carga_horaria: 2, data_inscricao: '2026-07-01' },
    { nome_completo: 'Saiu Antes', email: 's@t', unidade: RJ, departamento: 'O Boticário Centro', content_title: 'Curso A', content_type: 'Curso', situacao_inscricao: 'Confirmado', situacao: 'Aprovado', situacao_ambiente: 'Inativo', progresso: 1, carga_horaria: 2, data_inscricao: '2026-06-01', concluido_em: null, aprovado_em: '2026-09-03' },
    { nome_completo: 'Cancelou', email: 'c@t', unidade: RJ, departamento: 'O Boticário Centro', content_title: 'Curso A', content_type: 'Curso', situacao_inscricao: 'Cancelada', situacao: 'Aprovado', situacao_ambiente: 'Ativo', progresso: 1, carga_horaria: 2, data_inscricao: '2026-06-01', concluido_em: '2026-09-05' }
  ]
};
const f = (extra) => Object.assign({ start: '2026-01-01', end: '2026-10-09', unidade: [], departamento: [], colaborador: '', gestor: '', trilha: '', conteudo: '' }, extra || {});

run('Unibê — contas da aba', () => {
  const u = T.unibeMetrics(f());
  check('foto mais recente do período', u.mes === '2026-09', u.mes);
  check('adesão média dos PDVs', perto(u.adesaoMedia, (0.95 + 0.8 + 1) / 3));
  check('comparação com a foto anterior', perto(u.adesaoAnterior, 0.8));
  check('PDVs na meta (>= 90%)', u.pdvsNaMeta === 2);
  check('pessoas abaixo da meta, da menor para a maior', u.abaixo.map(p => p.nome).join() === 'Carla Dias,Bruno Lima');
  check('por operação: SG separada do RJ', u.porOperacao.some(o => o.id === 'boti-sg' && perto(o.adesao, 0.8)) && u.porOperacao.some(o => o.id === 'boti-rj' && perto(o.adesao, 0.95)));
  check('evolução com 2 meses', u.serie.length === 2);
  const ago = T.unibeMetrics(f(), '2026-08');
  check('seletor escolhe outra foto', ago.mes === '2026-08' && perto(ago.adesaoMedia, 0.8));
  const fora = T.unibeMetrics(f({ start: '2025-01-01', end: '2025-12-31' }));
  check('sem foto no período', fora.temDados && fora.mes === null);
  const filtro = T.unibeMetrics(f({ departamento: ['O Boticário Rodo'] }));
  check('filtro de departamento', filtro.totalPdvs === 1 && filtro.totalPessoas === 1);
});

run('Academia Hering — contas da aba', () => {
  const a = T.academiaMetrics(f());
  check('foto de setembro', a.mes === '2026-09');
  check('performance média e anterior', perto(a.performanceMedia, 2200 / 3) && perto(a.performanceAnterior, 1000));
  check('horas por pessoa', perto(a.horasMedia, 70 / 3));
  check('sem acesso há +30 dias conta a partir do acesso mais recente da foto', a.semAcesso === 2 && a.nuncaAcessou === 1 && a.referencia === '2026-10-05', `${a.semAcesso} ${a.referencia}`);
  check('nome curto da loja', T.lojaCurta('HERING STORE - RUA DO CATETE') === 'Rua do Catete' && T.lojaCurta('HERING MEGA STORE - SHOPPING RIO SUL') === 'Shopping Rio Sul');
  check('filtro de colaborador pelo nome do cadastro', T.academiaMetrics(f({ colaborador: 'Odir Luiz' })).totalPessoas === 1);
});

run('Twygo — conclusões por mês e pendências', () => {
  const h = T.twygoHistorico(f());
  check('tem datas de conclusão', h.temDatas);
  check('conta pela data da conclusão, com inativo e sem cancelada', h.conclusoes === 2 && h.serie.map(x => x.mes).join() === '2026-08,2026-09', h.serie.map(x => x.mes).join());
  check('horas concluídas', h.horas === 4);
  check('data de aprovação no lugar da conclusão 100%', T.dataConclusao({ aprovado_em: '2026-09-03' }) === '2026-09-03');
  const p = T.twygoPendencias(f());
  check('pendências: só ativos e confirmados', p.totalPendentes === 2 && p.pessoasComPendencia === 2);
  check('não iniciados por pessoa', p.porPessoa.find(x => x.nome === 'Ana Maria Souza').naoIniciados === 1);
  const semDatas = (() => { const orig = ctx.HUB_DATA.twygo_participantes; ctx.HUB_DATA.twygo_participantes = orig.map(r => Object.assign({}, r, { concluido_em: null, aprovado_em: null })); const r = T.twygoHistorico(f()); ctx.HUB_DATA.twygo_participantes = orig; return r; })();
  check('sem a coluna de conclusão (upload antigo): avisa', semDatas.temDatas === false && semDatas.conclusoes === 0);
});

run('Boletim — Unibê e Academia vêm da planilha do mês', () => {
  ctx.HUB_BOLETIM_DATA = {
    humor_mensal: [], engajamento_notas: [], satisfacao_suporte: [], fechamentos: [], versao: 1,
    entradas: [
      { mes: '2026-09-01', operacao: 'boti-rj', loja: 'O Boticário Centro', indicador: 'unibe_adesao', valor: 0.1 },   // ignorado: há planilha
      { mes: '2026-07-01', operacao: 'boti-rj', loja: null, indicador: 'unibe_adesao', valor: 0.77 }                  // vale: julho sem planilha
    ]
  };
  MB._invalidar();
  const set = MB.calcularMes('2026-09');
  const centro = set.operacoes['boti-rj'].lojas.find(l => l.departamento === 'O Boticário Centro');
  check('loja com a adesão do PDV (manual ignorado)', centro && perto(centro.ind.unibe_adesao, 0.95), centro && centro.ind.unibe_adesao);
  check('operação = média dos PDVs dela', perto(set.operacoes['boti-rj'].ind.unibe_adesao, 0.95) && perto(set.operacoes['boti-sg'].ind.unibe_adesao, 0.8));
  check('Interior de MG com o PDV achado pelo nome', perto(set.operacoes['boti-mg'].ind.unibe_adesao, 1));
  check('Academia: performance média da operação Hering', perto(set.operacoes.hering.ind.academia_pontos, 2200 / 3));
  const rioSul = set.operacoes.hering.lojas.find(l => l.departamento === 'Hering Rio Sul');
  check('Academia: média da loja', rioSul && perto(rioSul.ind.academia_pontos, 700));
  const jul = MB.calcularMes('2026-07');
  check('mês sem planilha usa o valor manual', perto(jul.operacoes['boti-rj'].ind.unibe_adesao, 0.77));
});

console.log(`\n${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
