// Paridade porte × legado dos módulos que NÃO tinham teste no legado:
// parsers-engajamento, metrics-engajamento, metrics-pesquisa-clima,
// metrics-experiencia e metrics-recrutamento.
//
// O legado roda como está, num contexto `vm` que finge o "window" do navegador
// (igual aos testes de legado/test), e o porte roda com os MESMOS dados
// INVENTADOS passados por parâmetro. O resultado tem de ser idêntico.
jest.mock('xlsx', () => ({ utils: { sheet_to_json: (ws: { rows: unknown[] }) => ws.rows } }));

import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import type { Linha } from '@/lib/calculos/utils';
import { parseBase } from '@/lib/calculos/parsers-engajamento';
import * as ENG from '@/lib/calculos/metrics-engajamento';
import * as CLIMA from '@/lib/calculos/metrics-pesquisa-clima';
import * as EXP from '@/lib/calculos/metrics-experiencia';
import * as REC from '@/lib/calculos/metrics-recrutamento';

const LEGADO = path.join(__dirname, '..', '..', 'legado', 'js');
const ctx: Linha = { console, Intl, Date };
ctx.window = ctx;
ctx.XLSX = { utils: { sheet_to_json: (ws: { rows: unknown[] }) => ws.rows } };
vm.createContext(ctx);
for (const f of ['utils.js', 'parsers.js', 'parsers-engajamento.js', 'metrics-engajamento.js',
  'metrics-pesquisa-clima.js', 'metrics-experiencia.js', 'metrics-recrutamento.js']) {
  vm.runInContext(fs.readFileSync(path.join(LEGADO, f), 'utf8'), ctx, { filename: f });
}

const json = (x: unknown) => JSON.parse(JSON.stringify(x));
const clone = <T>(x: T): T => json(x);
// Gerador determinístico (os dados são inventados, mas sempre os mesmos).
function gerador(semente: number) {
  let s = semente;
  return (n: number) => { s = (s * 1103515245 + 12345) % 2147483648; return Math.floor((s / 2147483648) * n); };
}
const pad = (n: number) => String(n).padStart(2, '0');

// Compara: o legado lê os globais (preparados por `globais`), o porte recebe por parâmetro.
function igual(globais: Linha, legado: () => unknown, novo: () => unknown) {
  Object.assign(ctx, globais);
  const l = json(legado());
  const n = json(novo());
  expect(n).toEqual(l);
}

// ---------------------------------------------------------------------
// Cadastro inventado (colaboradores)
// ---------------------------------------------------------------------
const UNIDADES = ['Loja Alfa', 'Loja Beta', 'Escritório Central'];
const DEPTOS: Record<string, string[]> = { 'Loja Alfa': ['Vendas', 'Caixa'], 'Loja Beta': ['Vendas'], 'Escritório Central': ['DHO', 'Financeiro'] };
const GESTORES = ['Fulana Gestora', 'Beltrano Líder', 'Ciclana Chefe'];
const colaboradores: Linha[] = [];
{
  const r = gerador(7);
  for (let i = 0; i < 40; i++) {
    const un = UNIDADES[i % 3];
    const dp = DEPTOS[un][r(DEPTOS[un].length)];
    const sit = i % 9 === 0 ? 'Desligado' : i % 13 === 0 ? 'Desativado' : 'Ativo';
    colaboradores.push({
      nome_completo: `Pessoa Inventada ${i}`, cpf: i % 5 === 0 ? null : `000.000.000-${pad(i)}`,
      unidade: un, departamento: dp, gestor_direto: GESTORES[r(3)], situacao: sit,
      cargo: i % 11 === 0 ? 'Jovem Aprendiz' : 'Consultor', grupos: i % 7 === 0 ? 'extra.natal.2025' : '',
      ultimo_dia_trabalhado: sit === 'Desligado' ? '2026-03-' + pad(1 + r(27)) : null
    });
  }
}

// ---------------------------------------------------------------------
// parsers-engajamento
// ---------------------------------------------------------------------
describe('parsers-engajamento: parseBase', () => {
  const adesao = [
    { 'Numero do Pulso': '1º Pulso', Participantes: 36, Respondentes: 20, 'Inicio do Pulso': '2026-08-03', 'Final do Pulso': '2026-08-09' },
    { 'Numero do Pulso': '2º Pulso', Participantes: 36, Respondentes: 14, 'Inicio do Pulso': '2026-08-10', 'Final do Pulso': '2026-08-16' },
    { 'Numero do Pulso': '3º Pulso', Participantes: 36, Respondentes: 5, 'Inicio do Pulso': '2026-09-01', 'Final do Pulso': '2026-09-07' }
  ];
  function respostas(semente: number, n: number, dias: string[]): Linha[] {
    const r = gerador(semente);
    const out: Linha[] = [];
    for (let i = 0; i < n; i++) {
      const un = UNIDADES[r(3)];
      const dia = dias[r(dias.length)];
      const hora = `${dia} ${pad(8 + r(10))}:${pad(r(60))}:${pad(r(60))}`;
      // Cada envio tem 2 respostas no mesmo horário (conta 1 envio).
      out.push({ Data: hora, Unidade: un, Departamento: DEPTOS[un][r(DEPTOS[un].length)], Pergunta: 'p1' });
      out.push({ Data: hora, Unidade: un, Departamento: DEPTOS[un][0], Pergunta: 'p2' });
    }
    return out;
  }
  const wb = (rows: Linha[]) => ({ SheetNames: ['Adesão', 'Respostas'], Sheets: { 'Adesão': { rows: adesao }, Respostas: { rows } } });

  test('pulsos encerrados (respostas dentro dos pulsos e 1 fora)', () => {
    const rows = respostas(11, 45, ['2026-08-04', '2026-08-05', '2026-08-11', '2026-08-17', '2026-09-02', '2026-07-01']);
    const c = { colaboradores, hoje: '2026-10-01' };
    igual({}, () => ctx.HUB_PARSERS_ENGAJAMENTO.parseBase(wb(rows), c), () => parseBase(wb(rows), c));
  });
  test('respostas depois do último pulso viram pulso automático; pulso em andamento estimado', () => {
    const rows = respostas(12, 60, ['2026-08-04', '2026-08-12', '2026-09-03', '2026-09-08', '2026-09-20', '2026-09-22', '2026-10-05']);
    const c = { colaboradores, hoje: '2026-10-06' };
    igual({}, () => ctx.HUB_PARSERS_ENGAJAMENTO.parseBase(wb(rows), c), () => parseBase(wb(rows), c));
  });
  test('erro sem headcount ativo', () => {
    const rows = respostas(13, 3, ['2026-08-04']);
    const leg = (() => { try { ctx.HUB_PARSERS_ENGAJAMENTO.parseBase(wb(rows), { colaboradores: [] }); return null; } catch (e) { return (e as Error).message; } })();
    expect(() => parseBase(wb(rows), { colaboradores: [] })).toThrow(leg as string);
  });
});

// ---------------------------------------------------------------------
// metrics-engajamento
// ---------------------------------------------------------------------
describe('metrics-engajamento: engajamentoMetrics', () => {
  const pulsos = [
    { inicio: '2026-07-06', fim: '2026-07-12', numero: 1, convidados: 36, respondentes: 25, parcial: false },
    { inicio: '2026-07-13', fim: '2026-07-19', numero: 2, convidados: 36, respondentes: 18, parcial: false },
    { inicio: '2026-07-20', fim: '2026-07-26', numero: 3, convidados: 36, respondentes: 22, parcial: false },
    { inicio: '2026-08-24', fim: '2026-08-30', numero: 4, convidados: 36, respondentes: 10, parcial: false },
    { inicio: '2026-09-28', fim: '2099-10-04', numero: null, convidados: 36, respondentes: 8, parcial: true, atualizado_em: '2026-09-29T10:00:00' }
  ];
  const participacao: Linha[] = [];
  {
    const r = gerador(21);
    for (const p of pulsos) {
      const foto = p.inicio === '2026-09-28';
      for (const un of UNIDADES) for (const dp of DEPTOS[un]) {
        const resp = r(5);
        if (!foto && !resp) continue;
        participacao.push({ pulso_inicio: p.inicio, unidade: un, departamento: dp, gestor: foto ? GESTORES[r(3)] : null, convidados: foto ? 3 + r(6) : null, respondentes: resp });
      }
    }
  }
  const dados = { engajamento_pulso: pulsos, engajamento_participacao: participacao, colaboradores };
  const admin = { perfil: 'admin' };
  const gestor = { perfil: 'gestor', unidades: ['Loja Alfa'], departamentos: [] };
  const casos: [string, Linha, Linha | undefined, Linha][] = [
    ['admin sem filtro (total oficial)', { unidade: [], departamento: [] }, undefined, admin],
    ['admin, pulso anterior selecionado', { unidade: [], departamento: [] }, { pulso: '2026-07-13' }, admin],
    ['gestor com recorte de unidade', { unidade: [], departamento: [] }, undefined, gestor],
    ['filtro de unidade e departamento', { unidade: ['Loja Alfa'], departamento: ['Vendas'] }, undefined, admin],
    ['filtro de gestor', { unidade: [], departamento: [], gestor: 'fulana' }, undefined, admin],
    ['período sem pulsos', { unidade: [], departamento: [], start: '2025-01-01', end: '2025-02-01' }, undefined, admin],
    ['período parcial', { unidade: [], departamento: [], start: '2026-07-01', end: '2026-07-31' }, undefined, gestor]
  ];
  for (const [nome, f, opts, usuario] of casos) {
    test(nome, () => igual({ HUB_DATA: dados, HUB_USER: usuario },
      () => ctx.HUB_METRICS_ENGAJAMENTO.engajamentoMetrics(f, opts),
      () => ENG.engajamentoMetrics(f, opts, dados, usuario)));
  }
  test('sem pulsos', () => igual({ HUB_DATA: { engajamento_pulso: [] }, HUB_USER: admin },
    () => ctx.HUB_METRICS_ENGAJAMENTO.engajamentoMetrics({}),
    () => ENG.engajamentoMetrics({}, undefined, { engajamento_pulso: [] }, admin)));
  test('statusDe e faltamMeta', () => {
    for (const v of [null, 0.1, 0.4, 0.59, 0.6, 1]) expect(ENG.statusDe(v)).toBe(ctx.HUB_METRICS_ENGAJAMENTO.statusDe(v));
    for (const [c, r] of [[0, 0], [10, 3], [10, 6], [7, 4], [null, 2]] as [number | null, number][]) {
      expect(ENG.faltamMeta(c, r)).toBe(ctx.HUB_METRICS_ENGAJAMENTO.faltamMeta(c, r));
    }
  });
});

// ---------------------------------------------------------------------
// metrics-pesquisa-clima
// ---------------------------------------------------------------------
describe('metrics-pesquisa-clima: pesquisaClimaMetrics', () => {
  const pesquisa: Linha[] = [];
  const hc: Linha[] = [];
  {
    const r = gerador(31);
    const perguntas: [string, string][] = [
      ['gptw camaradagem', 'Aqui as pessoas se ajudam.'], ['gptw credibilidade', 'Confio na liderança.'],
      ['gptw orgulho', 'Tenho orgulho do que faço.'], ['nr-1 demandas', 'Tenho prazos impossíveis de cumprir.'],
      ['nr-1 relacionamento', 'Sou respeitado(a).']
    ];
    for (let i = 0; i < 30; i++) {
      const un = UNIDADES[r(3)];
      const dp = DEPTOS[un][r(DEPTOS[un].length)];
      const base = { unidade: un, departamento: dp, lider: GESTORES[r(3)], posicao: i % 4 === 0 ? 'Líder' : (i % 3 ? 'Liderado' : null),
        tempo_empresa_meses: i % 6 === 0 ? null : r(80), data_resposta: `2026-0${6 + r(3)}-${pad(1 + r(28))}` };
      for (const [dim, perg] of perguntas) pesquisa.push({ ...base, dimensao: dim, pergunta: perg, nota: r(7) === 0 ? null : 1 + r(5), comentario: r(8) === 0 ? 'Comentário inventado ' + i : null });
      for (const dim of ['nps empresa', 'nps gestor', 'nps remuneração']) pesquisa.push({ ...base, dimensao: dim, pergunta: dim, nota: r(11), comentario: r(10) === 0 ? 'Opinião ' + i : null });
    }
    for (let i = 0; i < 45; i++) { const un = UNIDADES[i % 3]; hc.push({ unidade: un, departamento: DEPTOS[un][i % DEPTOS[un].length], lider: GESTORES[i % 3] }); }
  }
  const dados = { pesquisa_clima: pesquisa, pesquisa_clima_hc: hc };
  const sem = { unidade: [], departamento: [] };
  const casos: [string, Linha, Linha | undefined][] = [
    ['admin sem filtro', sem, { perfil: 'admin' }],
    ['sem usuário (global ausente)', sem, undefined],
    ['gestor com recorte de unidade', sem, { perfil: 'gestor', unidades: ['Loja Alfa'] }],
    ['rh com recorte de departamento', sem, { perfil: 'rh', unidades: [], departamentos: ['Vendas'] }],
    ['perfil fora do escopo', sem, { perfil: 'colaborador' }],
    ['filtro de período, unidade e gestor', { unidade: ['Loja Beta', 'Escritório Central'], departamento: [], start: '2026-07-01', end: '2026-08-31', gestor: 'beltrano' }, { perfil: 'admin' }]
  ];
  for (const [nome, f, usuario] of casos) {
    test(nome, () => igual({ HUB_DATA: dados, HUB_USER: usuario },
      () => ctx.HUB_METRICS_PESQUISA_CLIMA.pesquisaClimaMetrics(f),
      () => CLIMA.pesquisaClimaMetrics(f, dados, usuario)));
  }
  test('sem dados', () => igual({ HUB_DATA: { pesquisa_clima: [], pesquisa_clima_hc: [] }, HUB_USER: { perfil: 'admin' } },
    () => ctx.HUB_METRICS_PESQUISA_CLIMA.pesquisaClimaMetrics(sem),
    () => CLIMA.pesquisaClimaMetrics(sem, { pesquisa_clima: [], pesquisa_clima_hc: [] }, { perfil: 'admin' })));
});

// ---------------------------------------------------------------------
// metrics-experiencia
// ---------------------------------------------------------------------
describe('metrics-experiencia', () => {
  const COMPS = ['Paixão pelo negócio', 'Mão na massa', 'Gente que gosta de gente', '#Somos todos Sfera',
    'Tá esperando o que ?', 'Aberto ao novo', 'Conhecimento Técnico da Função', 'Meta Atingida', 'Fechamento de Caixa'];
  const COMENT = ['Demonstrou ótima postura comercial e empatia', 'Precisa melhorar pontualidade e organização',
    'Ótima postura, pontualidade exemplar', 'Organização ruim no caixa, pontualidade falhou'];
  function avaliacoes(semente: number, n: number, sufixoNome: string): Linha[] {
    const r = gerador(semente);
    const out: Linha[] = [];
    for (let i = 0; i < n; i++) {
      const c = colaboradores[i % colaboradores.length];
      const adm = `2025-${pad(1 + r(12))}-${pad(1 + r(28))}`;
      const notas = (p: number) => { const o: Linha = {}; for (const k of COMPS) if (r(10) < p) o[k] = 1 + r(4); return o; };
      const stG = ['concluida', 'concluida', 'rascunho', 'pendente', null][r(5)];
      const stA = ['concluida', 'pendente', null][r(3)];
      out.push({
        pessoa_key: 'k' + i + sufixoNome, cpf: c.cpf, nome: i % 4 === 0 ? c.nome_completo : 'Avaliada ' + i + sufixoNome, cargo: i % 10 === 0 ? 'Estagiária' : 'Consultor',
        unidade: c.unidade, departamento: i % 9 === 0 ? null : c.departamento, gestor: GESTORES[r(3)] + ', Outro', gestor_direto: GESTORES[r(3)],
        gestor_avaliador: r(2) ? GESTORES[r(3)] : null, data_admissao: adm,
        data_avaliacao: stG === 'concluida' ? `2026-${pad(1 + r(9))}-${pad(1 + r(28))}` : null,
        data_autoavaliacao: stA === 'concluida' ? `2026-${pad(1 + r(9))}-${pad(1 + r(28))}` : null,
        status_gestor: stG, status_auto: stA,
        martelo: stG === 'concluida' ? 1 + r(4) : null, martelo_comentario: stG === 'concluida' ? COMENT[r(4)] : null,
        notas_gestor: stG === 'concluida' ? notas(9) : {}, notas_auto: stA === 'concluida' ? notas(8) : {}
      });
    }
    return out;
  }
  const dados = { colaboradores };
  const base45 = avaliacoes(41, 36, '');
  const base90 = avaliacoes(42, 30, '');
  const prep = (rows: Linha[], ciclo: number, lado: 'leg' | 'novo') =>
    lado === 'leg' ? ctx.HUB_EXP_METRICS.preparar(clone(rows), ciclo) : EXP.preparar(clone(rows), ciclo, dados);

  test('preparar (45 e 90 dias)', () => {
    igual({ HUB_DATA: dados }, () => prep(base45, 45, 'leg'), () => prep(base45, 45, 'novo'));
    igual({ HUB_DATA: dados }, () => prep(base90, 90, 'leg'), () => prep(base90, 90, 'novo'));
  });
  test('preparar sem HUB_DATA', () => igual({ HUB_DATA: undefined },
    () => ctx.HUB_EXP_METRICS.preparar(clone(base45), 45), () => EXP.preparar(clone(base45), 45, undefined)));
  const filtros: [string, Linha][] = [
    ['sem filtro', { unidade: [], departamento: [] }],
    ['período + sem dispensa + sem natal', { unidade: [], departamento: [], start: '2025-03-01', end: '2025-12-31', semDispensa: true, semNatal: true }],
    ['unidade + gestor', { unidade: ['Loja Alfa'], departamento: [], gestor: 'fulana' }],
    ['colaborador', { unidade: [], departamento: [], colaborador: 'avaliada 1' }]
  ];
  for (const [nome, f] of filtros) {
    test('filtrar + calcular: ' + nome, () => igual({ HUB_DATA: dados },
      () => { const M = ctx.HUB_EXP_METRICS; return M.calcular(M.filtrar(M.preparar(clone(base45), 45), f), 45); },
      () => EXP.calcular(EXP.filtrar(EXP.preparar(clone(base45), 45, dados), f), 45)));
  }
  test('calcular com volume (insights)', () => {
    const muitos = avaliacoes(43, 120, '');
    igual({ HUB_DATA: dados },
      () => ctx.HUB_EXP_METRICS.calcular(ctx.HUB_EXP_METRICS.preparar(clone(muitos), 90), 90),
      () => EXP.calcular(EXP.preparar(clone(muitos), 90, dados), 90));
  });
  test('comparar 45 → 90', () => igual({ HUB_DATA: dados },
    () => ctx.HUB_EXP_METRICS.comparar(prep(base45, 45, 'leg'), prep(base90, 90, 'leg')),
    () => EXP.comparar(prep(base45, 45, 'novo'), prep(base90, 90, 'novo'))));
  test('agrupar, conceitoDaMedia, marcaDe, anosNatal', () => igual({ HUB_DATA: dados },
    () => { const M = ctx.HUB_EXP_METRICS; return [M.agrupar(M.preparar(clone(base45), 45), (r: Linha) => r._d.marca),
      [null, 1.2, 2.49, 3.5].map(M.conceitoDaMedia), ['Boticário VD - Juiz de Fora', 'Hering', 'Levis', 'Quem disse', 'Escritório', 'X', ''].map(M.marcaDe),
      M.anosNatal('extra.natal.2024; natal-extra-2025 extra.natal.2024')]; },
    () => [EXP.agrupar(EXP.preparar(clone(base45), 45, dados), r => r._d.marca),
      [null, 1.2, 2.49, 3.5].map(v => EXP.conceitoDaMedia(v)), ['Boticário VD - Juiz de Fora', 'Hering', 'Levis', 'Quem disse', 'Escritório', 'X', ''].map(v => EXP.marcaDe(v)),
      EXP.anosNatal('extra.natal.2024; natal-extra-2025 extra.natal.2024')]));
});

// ---------------------------------------------------------------------
// metrics-recrutamento
// ---------------------------------------------------------------------
describe('metrics-recrutamento', () => {
  const hoje = new Date();
  const iso = (diasAtras: number) => new Date(hoje.getTime() - diasAtras * 86400000).toISOString().slice(0, 10);
  const r = gerador(51);
  const STATUS = ['Aberto', 'Andamento', 'Finalizada', 'Cancelada', 'Congelado', 'Finalizada'];
  const ETAPAS = ['Divulgação', 'Triagem', 'Entrevista (RH)', 'Entrevista (Gestor)', 'Proposta', 'Admissão'];
  const FONTES = ['InfoJobs', 'Indicação', 'LinkedIn', null];
  const vagas: Linha[] = [];
  for (let i = 0; i < 30; i++) {
    const st = STATUS[r(6)];
    const ab = r(120);
    const un = UNIDADES[r(3)];
    vagas.push({
      id: 'VAG-' + i, status: st, etapa: ETAPAS[r(6)], unidade: un, departamento: DEPTOS[un][0],
      dataAbertura: i === 3 ? null : iso(ab), dataFechamento: st === 'Finalizada' || st === 'Cancelada' ? iso(Math.max(0, ab - 5 - r(40))) : null,
      dataPrevistaAdmissao: st === 'Finalizada' ? iso(Math.max(0, ab - 50)) : null, responsavel: ['Recrutadora A', 'Recrutador B', null][r(3)],
      fonte: FONTES[r(4)], contratado: st === 'Finalizada' ? 'Cand ' + i + '-0' : null, fitPct: r(3) ? 50 + r(50) : null
    });
  }
  const candidatos: Linha[] = [];
  const entrevistas: Linha[] = [];
  for (const v of vagas) {
    const n = r(4);
    for (let j = 0; j < n; j++) {
      candidatos.push({
        vagaId: v.id, nome: `Cand ${v.id.slice(4)}-${j}`, resultado: ['Em andamento', 'Reprovado', 'Aprovado'][r(3)],
        resultadoFinal: r(5) === 0 ? 'Aprovado' : null, dataAdmissao: null, fitPct: r(4) ? 40 + r(60) : null,
        motivoReprovacao: ['Perfil', 'Salário', null][r(3)], entrevistadoPor: ['Recrutadora A', 'Recrutador B'][r(2)],
        dataContatoRh: iso(40), dataAgendadaRh: r(2) ? iso(40 - r(5)) : null, dataContatoGestor: iso(30), dataAgendadaGestor: iso(30 - r(8)),
        dataContatoAnalise: null, dataAgendadaAnalise: null, dataContatoChecagem: 'data ruim', dataAgendadaChecagem: iso(2)
      });
      entrevistas.push({
        vagaId: v.id, data: iso(r(40) - 10), status: ['Agendada', 'Realizado', 'No Show'][r(3)], tipoEntrevista: ['RH', 'Gestor'][r(2)],
        recrutador: ['Recrutadora A', 'Recrutador B'][r(2)], observacao: r(2) ? 'ok' : ''
      });
    }
  }
  const recrutamento = { vagas, candidatos, entrevistas };
  const casos: [string, Linha][] = [
    ['sem filtro', { unidade: [], departamento: [] }],
    ['período', { unidade: [], departamento: [], start: iso(60), end: iso(10) }],
    ['unidade e departamento', { unidade: ['Loja Alfa'], departamento: ['Vendas'] }],
    ['filtro sem vagas', { unidade: ['Inexistente'], departamento: [] }]
  ];
  for (const [nome, f] of casos) {
    test('recrutamentoMetrics: ' + nome, () => igual({ HUB_RECRUIT_DATA: recrutamento },
      () => ctx.HUB_METRICS_RECRUTAMENTO.recrutamentoMetrics(f),
      () => REC.recrutamentoMetrics(f, recrutamento)));
  }
  test('calcularSLA e statusSLA', () => {
    for (const v of vagas) {
      expect(REC.calcularSLA(v)).toBe(ctx.HUB_METRICS_RECRUTAMENTO.calcularSLA(v));
      expect(REC.statusSLA(v)).toBe(ctx.HUB_METRICS_RECRUTAMENTO.statusSLA(v));
    }
  });
});
