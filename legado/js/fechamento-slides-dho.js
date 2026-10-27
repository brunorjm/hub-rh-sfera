// Fechamento do Período — Demografia e Desenvolvimento Humano e Organizacional.
// Mesmo formato de fechamento-slides.js (elementos num quadro de 960 × 540 pt).
// Os números vêm das MESMAS contas das telas do Hub, para baterem entre si:
//   dho.rot(f)  → HUB_METRICS.rotatividadeMetrics (tela Rotatividade)
//   dho.ent(f)  → HUB_METRICS.entrevistaMetrics   (tela Entrevista Desligamento)
//   dho.exp[45|90] + dho.X → linhas e contas da tela Avaliação da Experiência
//   dho.colaboradores → planilha 1. Colaboradores (headcount)
(function () {
  const S = () => window.HUB_FECHAMENTO_SLIDES;
  const MS_DIA = 86400000;
  const addDias = (iso, n) => new Date(Date.parse(iso) + n * MS_DIA).toISOString().slice(0, 10);
  const filtro = (de, ate) => ({ start: de, end: ate, unidade: [], departamento: [], gestor: '', colaborador: '' });
  const norm = s => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
  const desligado = c => norm(c.situacao) === 'desligado';

  // Nome curto de unidade para eixos de gráfico.
  function unidadeCurta(u) {
    return String(u || 'Não informado')
      .replace('Boticário VD - ', 'VD ').replace('Boticário - ', 'Boti ')
      .replace('Rio de Janeiro', 'RJ').replace('Interior de MG', 'Int. MG').replace('Juiz de Fora', 'JF')
      .replace('Quem disse, Berenice?', 'QDB');
  }
  const corta = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1).trim() + '…' : String(s));
  // Motivo para eixo de gráfico: o prefixo repetido vira abreviação, para os
  // "Outra Oportunidade de Trabalho - ..." não ficarem iguais depois de cortados.
  const motivoCurto = s => corta(String(s).replace(/^Outra Oportunidade de Trabalho\s*-\s*/i, 'Outra oport.: '), 38);

  // Ativo numa data: mesma regra do headcountAt da tela Rotatividade.
  function ativosEm(cols, iso) {
    return cols.filter(c => c.data_admissao && c.data_admissao <= iso && (!desligado(c) || (c.ultimo_dia_trabalhado || c.data_admissao) > iso));
  }
  function idadeEm(nasc, iso) {
    if (!nasc) return null;
    let a = +iso.slice(0, 4) - +nasc.slice(0, 4);
    if (iso.slice(5) < nasc.slice(5)) a--;
    return a;
  }

  // ------------------------------------------------------------------
  // Demografia
  // ------------------------------------------------------------------
  function demografia(p, dho) {
    const { COR, MES3, para, titulo, card, fmtInt, fmtPct, fmtData } = S().pecas;
    const cols = dho.colaboradores || [];
    const fim = p.ate, anoAntes = (+fim.slice(0, 4) - 1) + fim.slice(4);
    const fimJan = `${p.ano}-01-31`;
    const at = ativosEm(cols, fim), atJan = ativosEm(cols, fimJan), atAno = ativosEm(cols, anoAntes);
    const r = dho.rot ? dho.rot(filtro(p.de, p.ate)) : null;
    const adm = r ? r.totalAdmitidos : cols.filter(c => c.data_admissao >= p.de && c.data_admissao <= p.ate).length;
    const desl = r ? r.totalDesligados : cols.filter(c => desligado(c) && c.ultimo_dia_trabalhado >= p.de && c.ultimo_dia_trabalhado <= p.ate).length;
    // Admissões dos 2 meses anteriores (para o subtítulo do cartão).
    const mesesAnt = [2, 1].map(k => { const d = new Date(Date.UTC(p.ano, p.m1 - 1 - k, 1)); const de = d.toISOString().slice(0, 10); const ate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10); return { rot: MES3[d.getUTCMonth()].toLowerCase(), n: cols.filter(c => c.data_admissao >= de && c.data_admissao <= ate).length }; });
    const diasCasa = c => (Date.parse(fim) - Date.parse(c.data_admissao)) / MS_DIA;
    const exp = at.filter(c => diasCasa(c) <= 90).length;
    const ate12 = (l, ref) => (l.length ? l.filter(c => c.data_admissao > addDias(ref, -365)).length / l.length : null);
    const ate35 = (l, ref) => { const id = l.map(c => idadeEm(c.data_nascimento, ref)).filter(a => a != null); return id.length ? id.filter(a => a <= 35).length / id.length : null; };
    const t12 = ate12(at, fim), t12a = ate12(atAno, anoAntes), i35 = ate35(at, fim);
    const tempoMedio = at.length ? at.reduce((s, c) => s + diasCasa(c), 0) / at.length : null;
    const anosMeses = d => { if (d == null) return '—'; const m = Math.floor(d / 30.44); return `${Math.floor(m / 12)}a ${m % 12}m`; };
    const vJan = atJan.length ? (at.length - atJan.length) / atJan.length : null;

    // Faixas de tempo de casa (as 3 primeiras = até 12 meses).
    const FAIXAS = [['0–3m', 0, 91], ['3–6m', 91, 183], ['6–12m', 183, 366], ['1–2a', 366, 731], ['2–5a', 731, 1827], ['5–7a', 1827, 2557], ['7–10a', 2557, 3653], ['>10a', 3653, 1e9]];
    const faixa = FAIXAS.map(([, a, b]) => at.filter(c => { const d = diasCasa(c); return d >= a && d < b; }).length);
    const porUnidade = {};
    at.forEach(c => { const k = c.unidade || 'Não informado'; porUnidade[k] = (porUnidade[k] || 0) + 1; });
    const unidades = Object.entries(porUnidade).sort((a, b) => b[1] - a[1]);

    const texto = `Quadro ${vJan == null ? '' : `${vJan < 0 ? 'recua' : vJan > 0 ? 'cresce' : 'estável'} de ${fmtInt(atJan.length)} (jan) para ${fmtInt(at.length)} (${MES3[p.m2 - 1].toLowerCase()}), ${vJan > 0 ? '+' : vJan < 0 ? '−' : ''}${fmtPct(Math.abs(vJan), 1)}. `}${S().pecas.cap(S().pecas.emPeriodo(p))}, **${fmtInt(adm)} admissões × ${fmtInt(desl)} desligamentos** (saldo ${adm - desl >= 0 ? '+' : '−'}${fmtInt(Math.abs(adm - desl))}).`;
    const W = 145, G = 7;
    const kpis = [
      ['HEADCOUNT', fmtInt(at.length), vJan == null ? `em ${fmtData(fim)}` : `${vJan > 0 ? '+' : vJan < 0 ? '−' : ''}${fmtPct(Math.abs(vJan), 1)} vs jan/${String(p.ano).slice(2)} (${fmtInt(atJan.length)})`],
      ['ADMISSÕES', fmtInt(adm), mesesAnt.map(m => `${m.rot} ${m.n}`).join(' · ')],
      ['DESLIGAMENTOS', fmtInt(desl), `saldo: ${adm - desl >= 0 ? '+' : '−'}${fmtInt(Math.abs(adm - desl))}`],
      ['EM EXPERIÊNCIA', fmtInt(exp), `≤90 dias · ${fmtPct(at.length ? exp / at.length : null)} do quadro`],
      ['TEMPO MÉDIO DE CASA', anosMeses(tempoMedio), `${fmtPct(t12, 1)} com até 12 meses`],
      ['ATÉ 35 ANOS', fmtPct(i35), i35 == null ? '' : `${Math.round(i35 * 10)} a cada 10`]
    ];
    const els = [].concat(
      titulo(`HEADCOUNT — ${p.label.toUpperCase()}`),
      { t: 'text', x: 40, y: 76, w: 830, h: 20, size: 11, color: COR.branco, paras: [para(texto)] },
      kpis.map(([rot, val, sub], i) => [
        card(25 + i * (W + G), 102, W, 78),
        { t: 'text', x: 35 + i * (W + G), y: 108, w: W - 20, h: 14, size: 8, color: COR.claro, paras: [para(rot)] },
        { t: 'text', x: 35 + i * (W + G), y: 124, w: W - 20, h: 30, size: 21, bold: true, color: COR.branco, valign: 'middle', paras: [para(val)] },
        { t: 'text', x: 35 + i * (W + G), y: 156, w: W - 20, h: 20, size: 7.5, color: '6FA8FF', paras: [para(sub)] }
      ]).flat(),
      [card(25, 190, 420, 300)],
      { t: 'chart', x: 35, y: 196, w: 400, h: 288, kind: 'bar', catSize: 8, labelSize: 8, title: 'HEADCOUNT POR UNIDADE', labels: unidades.map(u => unidadeCurta(u[0])), series: [{ name: 'Headcount', values: unidades.map(u => u[1]), color: '1C7CEC' }] },
      [card(455, 190, 300, 300)],
      { t: 'chart', x: 465, y: 196, w: 280, h: 288, kind: 'col', stacked: true, legend: true, catSize: 7.5, labelSize: 8, title: 'FAIXA DE TEMPO DE CASA', labels: FAIXAS.map(f => f[0]),
        series: [{ name: `até 12 meses: ${fmtInt(faixa.slice(0, 3).reduce((s, x) => s + x, 0))} (${fmtPct(t12, 1)})`, values: faixa.map((v, i) => (i < 3 ? v : null)), color: 'F5B800' }, { name: 'mais de 12 meses', values: faixa.map((v, i) => (i >= 3 ? v : null)), color: '1C7CEC' }] },
      [card(765, 190, 170, 300),
        { t: 'text', x: 777, y: 200, w: 148, h: 282, size: 9, color: COR.branco, paras: [
          para('**LEITURA**', { run: { color: '6FA8FF' }, spaceAfter: 4 }),
          para(`${fmtPct(t12, 1)} do quadro tem até 12 meses de casa (${fmtPct(t12a, 1)} um ano antes).`, { bullet: true, spaceAfter: 4 }),
          para(`${fmtInt(exp)} pessoas em experiência (até 90 dias).`, { bullet: true, spaceAfter: 4 }),
          para(`Maior unidade: ${unidades[0] ? `${unidadeCurta(unidades[0][0])} (${fmtInt(unidades[0][1])})` : '—'}.`, { bullet: true })
        ] }]
    );
    const notas = `Fonte: planilha 1. Colaboradores. Headcount = ativos em ${fmtData(fim)} (admitidos até a data e não desligados até ela, mesma regra da tela Rotatividade). Admissões e desligamentos do período = mesma conta do Turnover. Em experiência = ativos com até 90 dias de casa em ${fmtData(fim)}. Idade pela data de nascimento (${fmtInt(at.filter(c => c.data_nascimento).length)} de ${fmtInt(at.length)} com a data).`;
    return [{ id: 'demografia', nome: 'Headcount', fundo: 'conteudo', els, notas }];
  }

  // Perfil etário: quadro ativo × desligados do período, e turnover por faixa no ano.
  function slidePerfilEtario(p, dho) {
    const { COR, para, titulo, card, fmtInt, fmtPct, fmtData } = S().pecas;
    const cols = dho.colaboradores || [];
    const FX = [['até 25', 0, 25], ['26–35', 26, 35], ['36–44', 36, 44], ['45+', 45, 200]];
    const faixaDe = idade => (idade == null ? null : FX.findIndex(([, a, b]) => idade >= a && idade <= b));
    const at = ativosEm(cols, p.ate);
    const deslP = cols.filter(c => desligado(c) && c.ultimo_dia_trabalhado && c.ultimo_dia_trabalhado >= p.de && c.ultimo_dia_trabalhado <= p.ate);
    const deslAno = cols.filter(c => desligado(c) && c.ultimo_dia_trabalhado && c.ultimo_dia_trabalhado >= `${p.ano}-01-01` && c.ultimo_dia_trabalhado <= p.ate);
    const contaFx = (lista, dataDe) => { const n = [0, 0, 0, 0]; lista.forEach(c => { const f = faixaDe(idadeEm(c.data_nascimento, dataDe(c))); if (f != null && f >= 0) n[f]++; }); return n; };
    const nAt = contaFx(at, () => p.ate), nDesl = contaFx(deslP, c => c.ultimo_dia_trabalhado), nAno = contaFx(deslAno, c => c.ultimo_dia_trabalhado);
    const tot = a => a.reduce((s, x) => s + x, 0);
    const pctAt = nAt.map(x => (tot(nAt) ? x / tot(nAt) : null)), pctDesl = nDesl.map(x => (tot(nDesl) ? x / tot(nDesl) : null));
    const W = 205;
    const els = [].concat(
      titulo(`PERFIL ETÁRIO — QUADRO ATIVO × DESLIGAMENTOS — ${p.label.toUpperCase()}`),
      { t: 'text', x: 40, y: 76, w: 830, h: 20, size: 11, color: COR.branco, paras: [para(tot(nDesl)
        ? `A faixa **até 25 anos** é ${fmtPct(pctAt[0], 1)} do quadro e ${fmtPct(pctDesl[0], 1)} das saídas ${S().pecas.emPeriodo(p)}; a faixa **45+** é ${fmtPct(pctDesl[3], 1)} das saídas.`
        : `Sem desligamentos com data de nascimento ${S().pecas.emPeriodo(p)}.`)] },
      [card(25, 105, 910, 225)],
      { t: 'chart', x: 35, y: 111, w: 890, h: 213, kind: 'col', fmt: 'pct', legend: true, title: 'COMPOSIÇÃO POR FAIXA — % DO HEADCOUNT ATIVO × % DOS DESLIGAMENTOS', labels: FX.map(f => f[0]),
        series: [{ name: `Headcount ativo (${fmtData(p.ate)})`, values: pctAt, color: '2E75B6' }, { name: `Desligamentos (${p.curto})`, values: pctDesl, color: 'F28C38' }] },
      { t: 'text', x: 40, y: 338, w: 880, h: 16, size: 10, bold: true, color: COR.claro, paras: [para(`TURNOVER POR FAIXA (JAN–${S().MESES[p.m2 - 1].slice(0, 3).toUpperCase()}, ACUMULADO)`)] },
      FX.map((f, i) => {
        const x = 25 + i * (W + 30);
        const t = nAt[i] ? nAno[i] / nAt[i] : null;
        return [card(x, 358, W, 120),
          { t: 'text', x: x + 14, y: 368, w: W - 28, h: 36, size: 26, bold: true, color: i === 0 ? 'F46A6A' : i === 3 ? '3CCB8B' : COR.amarelo, valign: 'middle', paras: [para(fmtPct(t, 1))] },
          { t: 'text', x: x + 14, y: 408, w: W - 28, h: 16, size: 10, bold: true, color: COR.branco, paras: [para(`faixa ${f[0]}`)] },
          { t: 'text', x: x + 14, y: 428, w: W - 28, h: 40, size: 8.5, color: COR.suave, paras: [para(`${fmtInt(nAno[i])} desligados de ${fmtInt(nAt[i])} ativos na faixa`)] }];
      }).flat()
    );
    const notas = `Idade na data de saída (desligados) ou em ${fmtData(p.ate)} (ativos), pela data de nascimento da planilha 1. Colaboradores. Turnover por faixa = desligados de jan até ${fmtData(p.ate)} ÷ ativos da faixa em ${fmtData(p.ate)}.`;
    return { id: 'dho-perfil-etario', nome: 'Perfil Etário', fundo: 'conteudo', els, notas };
  }

  // ------------------------------------------------------------------
  // Turnover
  // ------------------------------------------------------------------
  function slideTurnover(p, dho) {
    const { COR, MES3, para, titulo, card, kpi, fmtInt, fmtPct, pp } = S().pecas;
    const pa = S().mesmoPeriodoAnoAnterior(p);
    const r = dho.rot(filtro(p.de, p.ate)), ra = dho.rot(filtro(pa.de, pa.ate));
    // Gráficos: pelo menos 6 meses até o fim do período, para dar contexto.
    const iniJanela = p.meses >= 6 ? p.de : (() => { const d = new Date(Date.UTC(p.ano, p.m2 - 6, 1)); return d.toISOString().slice(0, 10); })();
    const serie = dho.rot(filtro(iniJanela, p.ate)).serie;
    const rotulo = m => `${MES3[+m.mes.slice(5, 7) - 1]}/${m.mes.slice(2, 4)}`;

    // Desligados no período que saíram em até 90 dias de casa (como no deck).
    const cols = dho.colaboradores || [];
    const desl = cols.filter(c => desligado(c) && c.ultimo_dia_trabalhado && c.ultimo_dia_trabalhado >= p.de && c.ultimo_dia_trabalhado <= p.ate);
    const exp = desl.filter(c => c.data_admissao && (Date.parse(c.ultimo_dia_trabalhado) - Date.parse(c.data_admissao)) / MS_DIA <= 90);
    const pctVol = r.totalDesligados ? r.voluntarios / r.totalDesligados : null;
    const motivo = r.motivos[0];

    const insights = [
      `Turnover médio de **${fmtPct(r.turnoverMedio, 1)}** ao mês ${pp(r.turnoverMedio, ra.turnoverMedio) ? `(${pp(r.turnoverMedio, ra.turnoverMedio)} contra ${pa.curto})` : ''}; taxa de desligamento de **${fmtPct(r.taxaDesligamentoMedia, 1)}**.`,
      pctVol != null ? `${pctVol >= 0.5 ? 'Voluntário predomina' : 'Involuntário predomina'}: ${fmtPct(Math.max(pctVol, 1 - pctVol))} dos desligamentos.` : null,
      desl.length ? `**${fmtPct(exp.length / desl.length)}** dos desligados saíram ainda na experiência (até 90 dias).` : null,
      motivo ? `Motivo mais registrado pelo RH: **${motivo.label}** (${fmtInt(motivo.value)}).` : null
    ].filter(Boolean);

    const linha = (y, rot, val) => [
      { t: 'text', x: 500, y, w: 300, h: 20, size: 10.5, color: COR.branco, valign: 'middle', paras: [para(rot)] },
      { t: 'text', x: 800, y, w: 125, h: 20, size: 10.5, color: COR.branco, align: 'right', valign: 'middle', paras: [para(val)] }
    ];
    const els = [].concat(
      titulo(`TURNOVER — ${p.label.toUpperCase()}`),
      { t: 'chart', x: 25, y: 100, w: 455, h: 195, kind: 'col', fmt: 'pct', legend: true, title: 'TURNOVER × TAXA DE DESLIGAMENTO (AO MÊS)', labelSize: 8,
        labels: serie.map(rotulo), series: [{ name: 'Turnover', values: serie.map(m => m.taxaTurnover), color: '2E75B6' }, { name: 'Taxa de desligamento', values: serie.map(m => m.taxaDesligamento), color: 'DAE3F3' }] },
      { t: 'chart', x: 25, y: 300, w: 455, h: 190, kind: 'col', stacked: true, legend: true, title: 'DESLIGAMENTOS: VOLUNTÁRIO × INVOLUNTÁRIO', labelSize: 8,
        labels: serie.map(rotulo), series: [{ name: 'Voluntário', values: serie.map(m => m.voluntarios), color: '2E75B6' }, { name: 'Involuntário', values: serie.map(m => m.involuntarios), color: 'B4C7E7' }] },
      kpi(490, 100, 215, 92, 'TURNOVER MÉDIO', fmtPct(r.turnoverMedio, 1), `${fmtPct(ra.turnoverMedio, 1)} em ${pa.curto}`, COR.amarelo),
      kpi(720, 100, 215, 92, 'TAXA DE DESLIGAMENTO MÉDIA', fmtPct(r.taxaDesligamentoMedia, 1), `${fmtPct(ra.taxaDesligamentoMedia, 1)} em ${pa.curto}`, COR.amarelo),
      card(490, 202, 445, 128),
      linha(210, '**Desligamentos no período**', fmtInt(r.totalDesligados)),
      linha(232, 'Voluntários', `${fmtPct(pctVol, 1)} (${fmtInt(r.voluntarios)})`),
      linha(254, 'Involuntários', `${fmtPct(r.totalDesligados ? r.involuntarios / r.totalDesligados : null, 1)} (${fmtInt(r.involuntarios)})`),
      linha(276, 'Desligados na experiência (até 90 dias)', `${fmtPct(desl.length ? exp.length / desl.length : null, 1)} (${fmtInt(exp.length)}/${fmtInt(desl.length)})`),
      linha(298, '**Admissões no período**', fmtInt(r.totalAdmitidos)),
      [card(490, 340, 445, 150), { t: 'text', x: 505, y: 348, w: 418, h: 138, size: 9.5, color: COR.branco, paras: [para('**INSIGHTS DO PERÍODO**', { run: { color: COR.claro }, spaceAfter: 4 })].concat(insights.map(t => para(t, { bullet: true, spaceAfter: 3 }))) }]
    );
    const notas = [
      'Mesma conta da tela Rotatividade: turnover = (admissões + desligamentos) / 2 ÷ headcount do início do mês; taxa de desligamento = desligamentos ÷ headcount do início do mês. "Médio" = média dos meses do período.',
      'Data de saída = Último dia trabalhado da planilha de Colaboradores' + (r.semDataSaida ? ` (${r.semDataSaida} desligado(s) sem essa data ficam fora).` : '.'),
      'Desligados na experiência = desligados do período que saíram com até 90 dias de casa.'
    ].join('\n');
    return { id: 'dho-turnover', nome: 'Turnover', fundo: 'conteudo', els, notas };
  }

  // ------------------------------------------------------------------
  // Pesquisa de Desligamento
  // ------------------------------------------------------------------
  function slideNps(p, dho) {
    const { COR, para, titulo, card, fmtInt, fmtPct } = S().pecas;
    const e = dho.ent(filtro(p.de, p.ate));
    const eAno = dho.ent(filtro(`${p.ano}-01-01`, p.ate));
    const r = dho.rot(filtro(p.de, p.ate));
    // NPS por unidade: a mesma conta do NPS geral, filtrando cada unidade
    // (como a tela Entrevista Desligamento faz com o filtro de Unidade).
    const ranking = (dho.unidades || []).map(u => {
      const m = dho.ent(Object.assign(filtro(p.de, p.ate), { unidade: [u] }));
      return { u, nps: m.nps, n: m.npsDetalhe.total };
    }).filter(x => x.n > 0 && x.nps != null).sort((a, b) => b.nps - a.nps);
    const negativas = ranking.filter(x => x.nps < 0).length;
    const taxaResp = r.totalDesligados ? e.totalRespostas / r.totalDesligados : null;
    const voltaria = e.totalRespostas ? e.positivos / e.totalRespostas : null;
    const voltariaAno = eAno.totalRespostas ? eAno.positivos / eAno.totalRespostas : null;
    const sinal = v => (v == null ? '—' : (v > 0 ? '+' : '') + String(Math.round(v * 10) / 10).replace('.', ','));

    const box = (y, valor, rotulo, sub, cor) => [
      card(640, y, 295, 88),
      { t: 'rect', x: 652, y: y + 14, w: 4, h: 60, fill: cor, r: 2 },
      { t: 'text', x: 666, y: y + 10, w: 260, h: 34, size: 22, bold: true, color: COR.branco, valign: 'middle', paras: [para(valor)] },
      { t: 'text', x: 666, y: y + 44, w: 260, h: 38, size: 9, color: COR.claro, paras: [para(`**${rotulo}**`), para(sub, { run: { color: COR.suave, size: 8.5 } })] }
    ];
    const els = [].concat(
      titulo('PESQUISA DE DESLIGAMENTO — NPS POR UNIDADE'),
      { t: 'text', x: 40, y: 76, w: 830, h: 20, size: 11, color: COR.branco, paras: [para(`NPS das respostas à pesquisa ${S().pecas.emPeriodo(p)}, por unidade de trabalho de quem saiu.`)] },
      [card(25, 105, 600, 385)],
      { t: 'chart', x: 35, y: 112, w: 580, h: 370, kind: 'bar', stacked: true, negativos: true, fmt: 'nps', catSize: 8.5, labelSize: 8.5,
        labels: ranking.map(x => `${unidadeCurta(x.u)} (n=${x.n})`),
        series: [{ name: 'Positivo', values: ranking.map(x => (x.nps >= 0 ? x.nps : null)), color: '2EC4A0' }, { name: 'Negativo', values: ranking.map(x => (x.nps < 0 ? x.nps : null)), color: 'E8604C' }] },
      box(105, sinal(e.nps), `NPS ${S().pecas.emPeriodo(p)}`, `${fmtInt(e.npsDetalhe.promotores)} promotores · ${fmtInt(e.npsDetalhe.neutros)} neutros · ${fmtInt(e.npsDetalhe.detratores)} detratores · acum. ${p.ano}: ${sinal(eAno.nps)}`, COR.amarelo),
      box(201, fmtPct(taxaResp), 'Taxa de resposta', `${fmtInt(e.totalRespostas)} respostas de ${fmtInt(r.totalDesligados)} desligados no período`, COR.azul),
      box(297, fmtPct(voltaria, 1), 'Voltaria a trabalhar na empresa', `"sim" e "provavelmente sim" · acum. ${p.ano}: ${fmtPct(voltariaAno, 1)}`, '2EC4A0'),
      box(393, `${fmtInt(negativas)} de ${fmtInt(ranking.length)}`, 'Unidades com NPS negativo', 'entre as que tiveram respostas no período', 'E8604C')
    );
    const notas = [
      'Fonte: Entrevista de Desligamento (planilha histórica + respostas pelo link), pela data da resposta — mesma base da tela Entrevista Desligamento.',
      'NPS = % promotores (9–10) − % detratores (0–6).',
      'Taxa de resposta = respostas no período ÷ desligados no período (tela Rotatividade). A tela Entrevista Desligamento mostra também a participação pelo Controle (entrevistas realizadas ÷ solicitações): ' + fmtPct(e.participacao) + '.'
    ].join('\n');
    return { id: 'dho-nps', nome: 'Pesquisa de Desligamento — NPS', fundo: 'conteudo', els, notas };
  }

  function slideMotivos(p, dho) {
    const { COR, para, titulo, card, fmtInt, fmtPct } = S().pecas;
    const e = dho.ent(filtro(p.de, p.ate)), r = dho.rot(filtro(p.de, p.ate));
    const eAno = dho.ent(filtro(`${p.ano}-01-01`, p.ate)), rAno = dho.rot(filtro(`${p.ano}-01-01`, p.ate));
    const top = (lista) => { const tot = lista.reduce((s, m) => s + m.value, 0); const t = lista.slice(0, 6); return { labels: t.map(m => motivoCurto(m.label)), values: t.map(m => (tot ? m.value / tot : 0)), tot }; };
    const dec = top(e.motivos), reg = top(r.motivos);
    const parte = (lista, re) => { const tot = lista.reduce((s, m) => s + m.value, 0); return tot ? lista.filter(m => re.test(norm(m.label))).reduce((s, m) => s + m.value, 0) / tot : null; };
    const div = (titulo, re) => ({ titulo, p: parte(e.motivos, re), rh: parte(r.motivos, re), pA: parte(eAno.motivos, re), rhA: parte(rAno.motivos, re) });
    const lid = div('Liderança', /lideran|gestor|gestao/), des = div('Baixo desempenho', /desempenho|performance/);
    const pctVol = r.totalDesligados ? r.voluntarios / r.totalDesligados : null, pctVolAno = rAno.totalDesligados ? rAno.voluntarios / rAno.totalDesligados : null;
    const caixa = (x, rotulo, l1, l2, l3) => [
      card(x, 400, 295, 90),
      { t: 'text', x: x + 14, y: 408, w: 268, h: 78, size: 10, color: COR.branco, paras: [para(`**${rotulo}**`, { run: { color: COR.claro }, spaceAfter: 3 }), para(l1), para(l2), para(l3, { run: { color: COR.suave, size: 8.5, italic: true } })] }
    ];
    const els = [].concat(
      titulo('MOTIVOS DE DESLIGAMENTO'),
      { t: 'text', x: 40, y: 76, w: 830, h: 20, size: 11, color: COR.branco, paras: [para(`Motivo declarado por quem saiu (pesquisa) × motivo registrado formalmente pelo RH — ${p.label.toLowerCase()}.`)] },
      [card(25, 105, 450, 285)],
      { t: 'chart', x: 35, y: 112, w: 430, h: 272, kind: 'bar', fmt: 'pct', catSize: 8, labelSize: 8.5, title: `DECLARADO NA PESQUISA (${fmtInt(dec.tot)})`, labels: dec.labels, series: [{ name: 'Pesquisa', values: dec.values, color: '2E75B6' }] },
      [card(485, 105, 450, 285)],
      { t: 'chart', x: 495, y: 112, w: 430, h: 272, kind: 'bar', fmt: 'pct', catSize: 8, labelSize: 8.5, title: `REGISTRADO PELO RH (${fmtInt(reg.tot)})`, labels: reg.labels, series: [{ name: 'RH', values: reg.values, color: 'F2B84B' }] },
      caixa(25, 'Divergência — Liderança', `**${fmtPct(lid.p, 1)}** na pesquisa`, `**${fmtPct(lid.rh, 1)}** no registro do RH`, `acum. ${p.ano}: ${fmtPct(lid.pA, 1)} pesquisa / ${fmtPct(lid.rhA, 1)} RH`),
      caixa(332, 'Divergência — Baixo desempenho', `**${fmtPct(des.p, 1)}** na pesquisa`, `**${fmtPct(des.rh, 1)}** no registro do RH`, `acum. ${p.ano}: ${fmtPct(des.pA, 1)} pesquisa / ${fmtPct(des.rhA, 1)} RH`),
      caixa(640, 'Tipo de desligamento', `**${fmtPct(pctVol, 1)}** voluntário`, `**${fmtPct(pctVol == null ? null : 1 - pctVol, 1)}** involuntário`, `acum. ${p.ano}: ${fmtPct(pctVolAno, 1)} voluntário`)
    );
    const notas = 'Declarado: "motivo de desligamento" da Entrevista de Desligamento (respostas no período). Registrado: "Desligamento - Motivo" da planilha de Colaboradores (desligados no período). As bases não são as mesmas pessoas: nem todo desligado responde à pesquisa. Divergência de Liderança: motivos com "liderança"/"gestor"/"gestão"; Baixo desempenho: "desempenho"/"performance".';
    return { id: 'dho-motivos', nome: 'Motivos de Desligamento', fundo: 'conteudo', els, notas };
  }

  // Índices da pesquisa (mesma configuração da tela Entrevista Desligamento).
  const INDICES = [
    { key: 'transparencia_recrutamento', grupo: 'ENTRADA E FORMAÇÃO', nome: 'Processo Seletivo', desc: 'informações correspondentes ao aplicado' },
    { key: 'satisfacao_contratacao', grupo: 'ENTRADA E FORMAÇÃO', nome: 'Processo de Contratação', desc: 'informações correspondentes ao aplicado' },
    { key: 'efetividade_onboarding', grupo: 'ENTRADA E FORMAÇÃO', nome: 'Onboarding', desc: 'treinamentos aderentes às tarefas' },
    { key: 'percepcao_carga_treinamentos', grupo: 'ENTRADA E FORMAÇÃO', nome: 'Treinamentos Obrigatórios', desc: 'quantidade adequada ou satisfatória' },
    { key: 'qualidade_relacao_gestor', grupo: 'LIDERANÇA E RELACIONAMENTOS', nome: 'Gestor Direto', desc: 'relação excelente ou boa' },
    { key: 'qualidade_lideranca_direta', grupo: 'LIDERANÇA E RELACIONAMENTOS', nome: 'Liderança Direta', desc: 'gestão excelente ou boa' },
    { key: 'relacionamento_equipe', grupo: 'LIDERANÇA E RELACIONAMENTOS', nome: 'Equipe', desc: 'relação excelente ou boa' },
    { key: 'drivers_atracao', grupo: 'LIDERANÇA E RELACIONAMENTOS', nome: 'Motivação de Ingresso', desc: null },
    { key: 'satisfacao_remuneracao', grupo: 'REMUNERAÇÃO E CARREIRA', nome: 'Remuneração', desc: 'avaliada como boa ou excelente' },
    { key: 'satisfacao_beneficios', grupo: 'REMUNERAÇÃO E CARREIRA', nome: 'Benefícios', desc: 'avaliados como bons ou excelentes' },
    { key: 'percepcao_crescimento', grupo: 'REMUNERAÇÃO E CARREIRA', nome: 'Perspectiva de Crescimento', desc: 'avaliada como boa ou excelente' }
  ];
  function valorIndice(ind) {
    if (!ind || !ind.total) return null;
    if (ind.simples) { const t = ind.principal[0]; return t ? { pct: t.value / ind.total, desc: `"${corta(t.label, 30)}" foi a mais citada` } : null; }
    return { pct: ind.linhas.filter(l => l.bucket === 'positivo').length / ind.total };
  }

  function slidePercepcao(p, dho) {
    const { COR, para, titulo, card, fmtInt, fmtPct } = S().pecas;
    const e = dho.ent(filtro(p.de, p.ate)), eAno = dho.ent(filtro(`${p.ano}-01-01`, p.ate));
    const ind = (m, k) => (m.indicesDesligamento || []).find(i => i.key === k);
    const W = 220, H = 112, GX = 8;
    const els = [].concat(
      titulo('PESQUISA DE DESLIGAMENTO — PERCEPÇÃO DOS INDICADORES'),
      { t: 'text', x: 40, y: 76, w: 830, h: 20, size: 11, color: COR.branco, paras: [para(`% de respostas positivas ${S().pecas.emPeriodo(p)} (${fmtInt(e.totalRespostas)} respondentes), com o acumulado de ${p.ano}.`)] }
    );
    INDICES.forEach((c, i) => {
      const col = i % 4, lin = Math.floor(i / 4);
      const x = 25 + col * (W + GX), y = 108 + lin * (H + 10);
      const v = valorIndice(ind(e, c.key)), va = valorIndice(ind(eAno, c.key));
      const cor = v == null ? COR.suave : v.pct >= 0.7 ? '2EC4A0' : v.pct >= 0.5 ? COR.amarelo : 'F46A6A';
      els.push(card(x, y, W, H),
        { t: 'text', x: x + 12, y: y + 8, w: W - 24, h: 14, size: 7.5, color: COR.suave, paras: [para(c.grupo)] },
        { t: 'text', x: x + 12, y: y + 22, w: W - 24, h: 18, size: 11, bold: true, color: COR.branco, paras: [para(c.nome)] },
        { t: 'text', x: x + 12, y: y + 42, w: W - 24, h: 30, size: 22, bold: true, color: cor, valign: 'middle', paras: [para(v ? fmtPct(v.pct, 1) : '—')] },
        { t: 'text', x: x + 12, y: y + 74, w: W - 24, h: 34, size: 8.5, color: COR.claro, paras: [para((v && v.desc) || c.desc || ''), para(`acum. ${p.ano}: ${va ? fmtPct(va.pct, 1) : '—'}`, { run: { color: COR.suave } })] });
    });
    els.push({ t: 'text', x: 25 + 3 * (W + GX), y: 108 + 2 * (H + 10) + 8, w: W, h: H - 16, size: 8.5, color: COR.suave, valign: 'middle', paras: [
      para('Régua de cor: **verde** a partir de 70% · **amarelo** de 50% a 69% · **vermelho** abaixo de 50%.')] });
    const notas = 'Mesmos índices da tela Entrevista Desligamento: % de respostas classificadas como positivas na pergunta principal de cada índice. Motivação de Ingresso: % da resposta mais citada.';
    return { id: 'dho-percepcao', nome: 'Percepção dos Indicadores (Desligamento)', fundo: 'conteudo', els, notas };
  }

  // ------------------------------------------------------------------
  // Avaliação da Experiência (45 e 90 dias)
  // ------------------------------------------------------------------
  function slideExperiencia(p, dho) {
    const { COR, para, titulo, card, fmtInt, fmtPct } = S().pecas;
    const X = dho.X;
    const metade = (x, ciclo) => {
      const rows = dho.exp && dho.exp[ciclo];
      if (!rows || !X) return [card(x, 105, 450, 385), { t: 'text', x: x + 15, y: 115, w: 420, h: 40, size: 11, color: COR.suave, paras: [para(`Avaliação de ${ciclo} dias indisponível (planilha não carregada).`)] }];
      const sel = X.filtrar(rows, filtro(p.de, p.ate));
      const t = X.resumoGrupo('Total', sel);
      const g = X.agrupar(sel, r => r.unidade || 'Não informado').filter(u => u.gestorBase || u.autoBase).sort((a, b) => b.total - a.total).slice(0, 8);
      return [
        card(x, 105, 450, 385),
        { t: 'text', x: x + 15, y: 113, w: 420, h: 22, size: 14, bold: true, color: COR.azul, paras: [para(`${ciclo} DIAS — ${fmtInt(t.total)} avaliações liberadas`)] },
        card(x + 15, 140, 205, 70), card(x + 230, 140, 205, 70),
        { t: 'text', x: x + 27, y: 146, w: 185, h: 60, size: 9.5, color: COR.claro, paras: [{ runs: [{ text: fmtPct(t.adesaoGestor), bold: true, size: 24, color: '2BB3FF' }] }, para(`**Avaliação do gestor** · ${fmtInt(t.gestorConcluidas)}/${fmtInt(t.gestorBase)}`)] },
        { t: 'text', x: x + 242, y: 146, w: 185, h: 60, size: 9.5, color: COR.claro, paras: [{ runs: [{ text: fmtPct(t.adesaoAuto), bold: true, size: 24, color: '5CE1E6' }] }, para(`**Autoavaliação** · ${fmtInt(t.autoConcluidas)}/${fmtInt(t.autoBase)}`)] },
        { t: 'chart', x: x + 10, y: 218, w: 430, h: 266, kind: 'bar', fmt: 'pct0', legend: true, catSize: 8, labelSize: 8, title: 'ADESÃO POR UNIDADE',
          labels: g.map(u => `${unidadeCurta(u.label)} (${u.total})`),
          series: [{ name: 'Gestor', values: g.map(u => u.adesaoGestor), color: '2BB3FF' }, { name: 'Autoavaliação', values: g.map(u => u.adesaoAuto), color: '5CE1E6' }] }
      ];
    };
    const els = [].concat(titulo(`AVALIAÇÃO DA EXPERIÊNCIA — ${p.label.toUpperCase()}`), metade(25, 45), metade(485, 90));
    const notas = 'Mesma base da tela Avaliação da Experiência: avaliações LIBERADAS no período (admissão + 30 dias no ciclo de 45; + 75 no de 90), inclusive de quem não respondeu ou saiu. Adesão = concluídas ÷ (concluídas + rascunho + pendentes). Unidades: as 8 com mais avaliações.';
    return { id: 'dho-experiencia', nome: 'Avaliação da Experiência', fundo: 'conteudo', els, notas };
  }

  function slides(p, dho) {
    const out = [];
    if (dho.rot) out.push(slideTurnover(p, dho));
    if (dho.colaboradores) out.push(slidePerfilEtario(p, dho));
    if (dho.ent && dho.rot) out.push(slideNps(p, dho), slideMotivos(p, dho), slidePercepcao(p, dho));
    out.push(slideExperiencia(p, dho));
    return out;
  }

  window.HUB_FECHAMENTO_DHO = { demografia, slides, _internal: { ativosEm, idadeEm, unidadeCurta } };
})();
