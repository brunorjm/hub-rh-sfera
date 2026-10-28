// Indicadores → Boletim da Liderança: os indicadores mensais de Gestão de
// Pessoas de cada operação (o mesmo recorte dos boletins enviados às
// lideranças), com comparação ao mês anterior, gráficos por loja prontos para
// baixar como imagem, os textos do boletim gerados a partir dos números e a
// conferência da qualidade dos dados. Cálculos em metrics-boletim.js; dados em
// dal-boletim.js (+ HUB_DATA, Avaliação da Experiência e Pesquisa de Engajamento).
//
// Esta tela tem seletor próprio de mês e operação — a barra de filtros do topo
// fica oculta aqui (ver goToSection em app.js).
(function () {
  const U = HUB_UTILS;
  const M = HUB_METRICS_BOLETIM;
  const { kpi, empty, card } = HUB_UI;
  const esc = U.escapeHtml;

  const state = { mes: null, op: 'geral', aba: 'indicadores', mostrarPoucas: false };
  const COR = { ok: '#1baf7a', aceitavel: '#1C7CEC', atencao: '#e0a100', critico: '#d03b3b', neutro: '#1C7CEC' };
  const TINT = { ok: '#E6F7F0', aceitavel: '#E7F1FD', atencao: '#FFF6E0', critico: '#FDECEC' };

  const STYLE = `<style>
    .bl-top{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px}
    .bl-top label{display:flex;flex-direction:column;gap:4px;font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px}
    .bl-top select{padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:12.5px;font-family:inherit;color:var(--text);background:#fff;min-width:200px}
    .bl-top .bl-acoes{margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .bl-status{font-size:11.5px;color:var(--text2);padding-bottom:9px}
    .bl-var{display:inline-block;font-size:11px;font-weight:700;white-space:nowrap}
    .bl-var.bom{color:#0f8a4c}.bl-var.ruim{color:var(--critical)}.bl-var.neutro{color:var(--muted)}
    .bl-note{font-size:11px;color:var(--muted);margin-top:8px;line-height:1.5}
    #sec-ind-boletim .kpi-grid{grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}
    #sec-ind-boletim .kpi .sub{line-height:1.45}
    .bl-card-acoes{float:right;margin-top:-4px}
    .bl-mx td,.bl-mx th{white-space:nowrap;text-align:center;padding:7px 9px}
    .bl-mx td:first-child,.bl-mx th:first-child{text-align:left;position:sticky;left:0;background:#fff;z-index:1;font-weight:600}
    .bl-mx th:first-child{background:#F7F9FC;z-index:2}
    .bl-mx td .v{display:block;font-weight:700;font-size:12.5px}
    .bl-mx tr{cursor:pointer}
    .bl-mx tr.bl-total{cursor:default}
    .bl-mx tr.bl-total td{border-top:2px solid var(--text);font-weight:700}
    .bl-mx tr.bl-total td:first-child{background:#F7F9FC}
    .bl-lojas td,.bl-lojas th{text-align:right}
    .bl-lojas td:first-child,.bl-lojas th:first-child{text-align:left}
    .bl-lojas tr.apoio td{color:var(--muted)}
    .bl-nom td:nth-child(2),.bl-nom thead tr:first-child th:nth-child(2){text-align:left}
    .bl-txt{border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:12px;background:#fff}
    .bl-txt h4{font-size:13px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:8px}
    .bl-txt p{font-size:13px;line-height:1.6;margin:0 0 8px;color:var(--text)}
    .bl-man td input{width:110px;padding:6px 8px;border:1.5px solid var(--border);border-radius:7px;font-family:inherit;font-size:12.5px;text-align:right}
    .bl-man td input:focus{outline:none;border-color:var(--p1)}
    .bl-man td.ok-salvo{color:#0f8a4c;font-size:11px}
    .bl-dic td{white-space:normal;vertical-align:top;line-height:1.5}
    .bl-itens{display:none;flex-wrap:wrap;gap:4px 14px;padding:10px 12px;margin:0 0 10px;border:1px solid var(--border);border-radius:8px;background:#F7F9FC;font-size:12px;max-height:180px;overflow:auto}
    .bl-itens.aberto{display:flex}
    .bl-itens label{display:flex;gap:5px;align-items:center;cursor:pointer;white-space:nowrap}
    .bl-itens .bl-itens-acoes{width:100%;display:flex;gap:12px;font-size:11px}
    .bl-itens .bl-itens-acoes a{cursor:pointer;color:var(--p1)}
  </style>`;

  const podeEditar = () => HUB_PERMISSIONS.hasPerm(HUB_USER, 'admin.upload');
  const mesLabel = mes => M.nomeDoMes(mes, true) + '/' + mes.slice(0, 4);

  function chip(id, v) {
    if (!v) return '';
    const cls = v.bom === null ? 'neutro' : v.bom ? 'bom' : 'ruim';
    return `<span class="bl-var ${cls}">${esc(M.fmtVariacao(id, v))}</span>`;
  }

  // ---------------------------------------------------------------------------
  // Topo: mês, operação, situação (aberto/fechado), ações
  // ---------------------------------------------------------------------------
  function topo(b) {
    const meses = M.mesesDisponiveis(18);
    const ops = [{ id: 'geral', nome: 'Visão geral — todas as operações' }].concat(M.OPERACOES);
    const fechados = M.OPERACOES.map(o => b.operacoes[o.id].fechado).filter(Boolean);
    const status = fechados.length
      ? `<span class="badge b2">Fechado</span> <span class="bl-status">foto publicada salva — a comparação do mês seguinte usa estes números</span>`
      : `<span class="badge b4">Em aberto</span> <span class="bl-status">recalculado com os dados atuais</span>`;
    const acoes = podeEditar()
      ? (fechados.length ? `<button class="btn btn-outline btn-sm" id="bl-reabrir">Reabrir mês</button>` : '') +
        `<button class="btn btn-sm" id="bl-fechar" style="background:var(--p1);color:#fff">${fechados.length ? 'Fechar de novo' : 'Fechar mês'}</button>`
      : '';
    return `<div class="bl-top">
      <label>Mês<select id="bl-mes">${meses.map(m => `<option value="${m}"${m === state.mes ? ' selected' : ''}>${esc(mesLabel(m))}</option>`).join('')}</select></label>
      <label>Operação<select id="bl-op">${ops.map(o => `<option value="${o.id}"${o.id === state.op ? ' selected' : ''}>${esc(o.nome)}</option>`).join('')}</select></label>
      <div style="padding-bottom:6px">${status}</div>
      <div class="bl-acoes">${acoes}</div>
    </div>
    <div class="tab-bar">${[['indicadores', 'Indicadores'], ['texto', 'Texto do boletim'], ['manuais', 'Valores manuais'], ['qualidade', 'Qualidade dos dados']]
      .map(([k, l]) => `<button class="tab-btn${state.aba === k ? ' active' : ''}" data-aba="${k}">${l}${k === 'qualidade' && b.avisos.some(a => a.tipo === 'alerta') ? ' ⚠' : ''}</button>`).join('')}</div>`;
  }

  // ---------------------------------------------------------------------------
  // Visão geral: matriz operações × indicadores
  // ---------------------------------------------------------------------------
  const COLUNAS_GERAL = ['feedback_adesao', 'celebracoes', 'humor_media', 'engajamento_feedz', 'turnover', 'ave45_gestor', 'ave90_gestor', 'satisfacao_participacao', 'pesquisa_nota', 'pesquisa_participacao', 'nps', 'twygo_progresso'];
  const CURTO = { feedback_adesao: 'Feedback', celebracoes: 'Celebrações', humor_media: 'Humor', engajamento_feedz: 'Engaj. Feedz', turnover: 'Turnover', ave45_gestor: 'AvE 45 gestor', ave90_gestor: 'AvE 90 gestor', satisfacao_participacao: 'Satisfação', pesquisa_nota: 'Nota pesquisa', pesquisa_participacao: 'Particip. pesquisa', nps: 'eNPS', twygo_progresso: 'Twygo' };

  // Uma linha da matriz: r = { ind, variacoes } da operação (ou do total).
  function linhaMatriz(op, r, clicavel) {
    const total = op.id === 'empresa';
    const attrs = total ? ' class="bl-total"' : clicavel ? ` data-op="${op.id}"` : ' style="cursor:default"';
    return `<tr${attrs}><td>${esc(op.nome)}</td>${COLUNAS_GERAL.map(id => {
      const idReal = id === 'feedback_adesao' ? (total ? 'feedback_painel' : op.id === 'escritorio' ? 'devolutiva_adesao' : id) : id;
      const v = r.ind[idReal];
      const st = M.statusMeta(id, v);
      return `<td style="background:${st ? TINT[st] : 'transparent'}"><span class="v">${esc(M.fmtValor(idReal, v))}</span>${chip(idReal, (r.variacoes || {})[idReal])}</td>`;
    }).join('')}</tr>`;
  }

  const LEGENDA = 'Cor de fundo: verde = na meta, amarelo = atenção, vermelho = crítico.';
  const NOTA_ESCRITORIO_TOTAL = 'No Escritório, a coluna Feedback considera feedback ou 1:1. Total da empresa: todas as lojas somadas e ponderadas pelo tamanho de cada uma (não é a média das operações).';

  function tabelaMatriz(titulo, linhas, nota, rotuloLinha) {
    return card(titulo, '&#128202;', `
      <div class="table-wrap" style="max-height:none"><table class="dt bl-mx"><thead><tr><th>${rotuloLinha || 'Operação'}</th>${COLUNAS_GERAL.map(id => `<th>${CURTO[id]}</th>`).join('')}</tr></thead>
      <tbody>${linhas.join('')}</tbody></table></div>
      <p class="bl-note">${nota}</p>`, { full: true });
  }

  function visaoGeral(b) {
    const linhas = M.OPERACOES.map(op => linhaMatriz(op, b.operacoes[op.id], true))
      .concat(linhaMatriz({ id: 'empresa', nome: 'Total da empresa' }, b.empresa, false));
    return tabelaMatriz(`Todas as operações — ${esc(mesLabel(b.mes))}`, linhas,
      `Clique numa operação para abrir o boletim dela. ${LEGENDA} Setas comparam com ${esc(M.nomeDoMes(b.mesAnterior))} (verde = melhorou, vermelho = piorou). ${NOTA_ESCRITORIO_TOTAL}`);
  }

  // Números PUBLICADOS (mês fechado) para quem não tem o módulo — vêm da
  // função boletim_resumo_publicado() do banco, já recortados pelo acesso da
  // pessoa (supabase-boletim-resumo-departamento.sql): operação inteira quando
  // todas as lojas dela estão liberadas; senão só as lojas/departamentos
  // liberados (dados.parcial + dados.lojas), sem o total da operação. Setas só
  // quando o mês anterior também foi fechado (é o que foi publicado).
  function resumoPublicado(linhasBanco) {
    const iso = d => String(d).slice(0, 7);
    const meses = Array.from(new Set(linhasBanco.map(l => iso(l.mes)))).sort();
    if (!meses.length) return '';
    const mes = meses[meses.length - 1];
    const ant = M.mesAnterior(mes);
    const doMes = (m, op) => { const x = linhasBanco.find(l => iso(l.mes) === m && l.operacao === op); return x ? x.dados : null; };
    const variacoesDe = (atual, prev) => {
      const v = {};
      if (prev) for (const id of Object.keys(M.INDICADORES)) v[id] = M.variacao(id, (atual || {})[id], (prev || {})[id]);
      return v;
    };
    const lojaDe = (dados, dep) => ((dados && dados.lojas) || []).find(l => l.departamento === dep);
    let porLoja = false;
    const montar = op => {
      const atual = doMes(mes, op.id);
      if (!atual) return [];
      const prev = doMes(ant, op.id);
      if (!atual.parcial) {
        const prevInd = prev && !prev.parcial ? prev.ind : null;
        return [linhaMatriz(op, { ind: atual.ind || {}, variacoes: variacoesDe(atual.ind, prevInd) }, false)];
      }
      porLoja = true;
      return (atual.lojas || []).map(l => {
        const p = lojaDe(prev, l.departamento);
        return linhaMatriz({ id: op.id, nome: `${l.nome || l.departamento} · ${op.nome}` }, { ind: l.ind || {}, variacoes: variacoesDe(l.ind, p && p.ind) }, false);
      });
    };
    const linhas = M.OPERACOES.concat({ id: 'empresa', nome: 'Total da empresa' }).flatMap(montar);
    if (!linhas.length) return '';
    const temAnt = M.OPERACOES.concat({ id: 'empresa' }).some(op => doMes(ant, op.id));
    const escopo = porLoja ? 'das lojas e departamentos do seu acesso' : 'da(s) operação(ões) do seu acesso';
    return tabelaMatriz(`Boletim da Liderança — ${esc(mesLabel(mes))}`, linhas,
      `Números publicados do último boletim fechado, ${escopo} — os mesmos do boletim enviado por newsletter. ${LEGENDA} ${temAnt ? `Setas comparam com ${esc(M.nomeDoMes(ant))} (verde = melhorou, vermelho = piorou).` : 'Sem setas: o mês anterior não foi fechado.'} No Escritório, a coluna Feedback considera feedback ou 1:1.`,
      porLoja ? 'Loja / departamento' : 'Operação');
  }

  // ---------------------------------------------------------------------------
  // Operação: KPIs, gráficos por loja, tabela
  // ---------------------------------------------------------------------------
  function kpis(r) {
    const i = r.ind, b = r.base, v = r.variacoes;
    const fbId = r.id === 'escritorio' ? 'devolutiva_adesao' : 'feedback_adesao';
    const k = (id, sub, rotulo) => {
      const st = M.statusMeta(id, i[id]);
      const subTxt = [chip(id, v[id]), sub].filter(Boolean).join(' · ');
      return kpi(rotulo || M.INDICADORES[id].rotulo, esc(M.fmtValor(id, i[id])), subTxt, st ? COR[st] : 'var(--p1)');
    };
    const comp = i.engajamento_componentes || {};
    const compTxt = [['acessos', 'acessos'], ['feedbacks', 'feedbacks'], ['oneonone', '1:1'], ['celebracoes', 'celebrações'], ['humor', 'humor'], ['pesquisa', 'pesq. engaj.'], ['satisfacao', 'satisf.'], ['ave', 'AvE']]
      .filter(([c]) => comp[c] != null).map(([c, l]) => `${l} ${U.fmtPct(comp[c], 0)}`).join(', ');
    const lista = [
      k(fbId, `${U.fmtInt(r.id === 'escritorio' ? b.devolutiva_pessoas : b.feedback_pessoas)} de ${U.fmtInt(b.liderados)} liderados`),
      k('celebracoes', (i.celebracoes_lojas ? `${i.celebracoes_lojas_meta} de ${i.celebracoes_lojas} ${r.id === 'escritorio' ? 'departamentos' : 'lojas'} com ${M.META_CELEBRACOES_LOJA}+ · ` : '') + 'para o próprio time'),
      r.id === 'escritorio' ? k('oneonone_adesao', `${U.fmtInt(b.oneonone_liderados)} de ${U.fmtInt(b.liderados)} liderados`) : '',
      k('humor_media', i.humor_media != null ? `${M.rotuloHumor(i.humor_media)} · ${U.fmtPct(i.humor_participacao, 0)} registraram` : 'sem registros'),
      k('engajamento_feedz', compTxt + (i.engajamento_completo ? '' : ' · <b>sem acessos</b>: informe em Valores manuais')),
      k('turnover', `${b.admissoes} adm. · ${b.desligamentos} desl. · HC ${b.hc_inicio}`),
      k('ave45_gestor', b.ave45_total ? `auto ${M.fmtValor('ave45_auto', i.ave45_auto)} · ${b.ave45_total} no ciclo` : 'ninguém venceu 45 dias', 'AvE 45 dias'),
      k('ave90_gestor', b.ave90_total ? `auto ${M.fmtValor('ave90_auto', i.ave90_auto)} · ${b.ave90_total} no ciclo` : 'ninguém venceu 90 dias', 'AvE 90 dias'),
      k('satisfacao_respondentes', (b.satisfacao_aptos ? `${M.fmtValor('satisfacao_participacao', i.satisfacao_participacao)} de ${b.satisfacao_aptos} gestores aptos` : 'nenhum gestor com a tag pesquisa.satisfação') + (i.satisfacao_empresa ? ' · empresa toda' : ''), 'Pesquisa de Satisfação'),
      k('pesquisa_nota', b.pesquisa_respondentes ? `${U.fmtInt(b.pesquisa_respondentes)} respondentes no pulso` : (b.pesquisa_respostas ? 'respostas sem a base de participação' : 'sem respostas no pulso'), 'Pesquisa de Engajamento — nota'),
      k('pesquisa_participacao', b.pesquisa_convidados != null ? `${U.fmtInt(b.pesquisa_respondentes)} de ${U.fmtInt(b.pesquisa_convidados)} convidados · meta ${U.fmtPct(M.INDICADORES.pesquisa_participacao.meta, 0)}` : 'pulso sem a base de convidados', 'Pesquisa de Engajamento — participação'),
      k('nps', i.nps_respostas ? `${i.nps_respostas} resposta(s) · média ${M.fmtValor('pesquisa_nota', i.nps_media)}` : 'sem respostas'),
      b.twygo_pessoas ? k('twygo_progresso', `${b.twygo_pessoas} pessoas · foto atual`) : '',
      i.unibe_adesao != null ? k('unibe_adesao', daPlanilha('unibe_adesao') ? 'planilha 27.1 · média dos PDVs' : 'valor informado') : '',
      i.academia_pontos != null ? k('academia_pontos', daPlanilha('academia_pontos') ? 'planilha 27.2 · performance média' : 'valor informado') : ''
    ];
    return `<div class="kpi-grid">${lista.join('')}</div>`;
  }

  const CHARTS = [];
  // Gráfico na largura toda (fora da grade de duas colunas).
  function cardGraficoLargo(id, titulo, ic, altura, nota) {
    return `<div style="grid-column:1 / -1">${cardGrafico(id, titulo, ic, altura, nota)}</div>`;
  }

  function cardGrafico(id, titulo, ic, altura, nota) {
    CHARTS.push(id);
    return card(`${esc(titulo)}<span style="margin-left:auto"></span><button class="btn btn-outline btn-sm bl-itens-btn" data-canvas="${id}" title="Escolher o que aparece no gráfico (e na imagem baixada)" style="margin-right:6px">Itens</button><button class="btn btn-outline btn-sm bl-png" data-canvas="${id}" data-nome="${esc(titulo)}" title="Baixar o gráfico como imagem (PNG) para o Mailchimp">Baixar imagem</button>`, ic,
      `<div class="bl-itens" id="${id}-itens"></div><div class="chart-h" style="height:${altura}px"><canvas id="${id}"></canvas></div>${nota ? `<p class="bl-note">${nota}</p>` : ''}`);
  }

  // ---------------------------------------------------------------------------
  // Mostrar/ocultar itens de um gráfico (ex.: tirar um gestor antes de baixar a
  // imagem). Guarda os dados originais e redesenha só com os itens marcados; a
  // escolha vale para o mês e a operação até recarregar a página.
  // ---------------------------------------------------------------------------
  const ORIGINAIS = {};
  const OCULTOS = {};
  const chaveItens = id => `${state.mes}|${state.op}|${id}`;
  // Índice original do item (os rótulos/cores calculados por item usam o índice da lista completa).
  const oi = c => (c.chart && c.chart.$idx ? c.chart.$idx[c.dataIndex] : c.dataIndex);

  function guardarOriginais() {
    for (const id of CHARTS) {
      const ch = window.Chart && Chart.getChart(id);
      if (!ch) continue;
      ORIGINAIS[id] = { labels: ch.data.labels.slice(), ds: ch.data.datasets.map(d => ({ data: d.data.slice(), bg: Array.isArray(d.backgroundColor) ? d.backgroundColor.slice() : null })) };
      if ((OCULTOS[chaveItens(id)] || new Set()).size) aplicarItens(id);
    }
  }

  function aplicarItens(id) {
    const ch = Chart.getChart(id), o = ORIGINAIS[id];
    if (!ch || !o) return;
    const oc = OCULTOS[chaveItens(id)] || new Set();
    const keep = o.labels.map((_, i) => i).filter(i => !oc.has(String(o.labels[i])));
    ch.$idx = keep;
    ch.data.labels = keep.map(i => o.labels[i]);
    ch.data.datasets.forEach((d, k) => {
      d.data = keep.map(i => o.ds[k].data[i]);
      if (o.ds[k].bg) d.backgroundColor = keep.map(i => o.ds[k].bg[i]);
    });
    ch.update();
  }

  function abrirItens(id) {
    const painel = document.getElementById(id + '-itens'), o = ORIGINAIS[id];
    if (!painel || !o) return;
    if (painel.classList.toggle('aberto') === false) return;
    const oc = OCULTOS[chaveItens(id)] || (OCULTOS[chaveItens(id)] = new Set());
    painel.innerHTML = '<div class="bl-itens-acoes"><a data-acao="todos">Mostrar todos</a><a data-acao="nenhum">Ocultar todos</a></div>' +
      o.labels.map(l => `<label><input type="checkbox" value="${esc(String(l))}"${oc.has(String(l)) ? '' : ' checked'}> ${esc(String(l))}</label>`).join('');
    painel.querySelectorAll('input').forEach(inp => inp.addEventListener('change', () => {
      if (inp.checked) oc.delete(inp.value); else oc.add(inp.value);
      aplicarItens(id);
    }));
    painel.querySelectorAll('a[data-acao]').forEach(a => a.addEventListener('click', () => {
      oc.clear();
      if (a.dataset.acao === 'nenhum') o.labels.forEach(l => oc.add(String(l)));
      painel.querySelectorAll('input').forEach(inp => { inp.checked = a.dataset.acao === 'todos'; });
      aplicarItens(id);
    }));
  }

  function barras(id, labels, valores, o) {
    if (!document.getElementById(id)) return;
    const fmt = o.fmt;
    HUB_CHART(id, {
      type: 'bar',
      data: { labels, datasets: [{ data: valores, backgroundColor: o.cores || valores.map(() => COR.neutro), borderRadius: 5, maxBarThickness: 26 }] },
      options: {
        indexAxis: 'y',
        layout: { padding: { right: o.rotulos ? 92 : 48 } },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => o.dicas ? o.dicas[oi(c)] : o.rotulos ? o.rotulos[oi(c)] : fmt(c.parsed.x) } },
          datalabels: { color: '#16181D', font: { size: 10.5, weight: '700' }, anchor: 'end', align: 'end', formatter: (v, c) => v == null ? '' : o.rotulos ? o.rotulos[oi(c)] : fmt(v) }
        },
        scales: { x: { min: 0, max: o.max, suggestedMax: o.suggestedMax, ticks: o.inteiro ? { precision: 0, stepSize: 1 } : { callback: o.tick || (v => v) } }, y: { grid: { display: false } } }
      }
    });
  }

  // Colunas por loja, da maior para a menor, coloridas pela meta (verde = bateu,
  // amarelo = celebrou mas não bateu, sem coluna = nenhuma), com a meta tracejada.
  function colunasComMeta(id, labels, valores, meta) {
    if (!document.getElementById(id)) return;
    const ultimo = labels.length - 1;
    HUB_CHART(id, {
      type: 'bar',
      data: { labels, datasets: [
        { type: 'line', label: 'Meta', data: labels.map(() => meta), borderColor: COR.critico, borderWidth: 1.5, borderDash: [6, 4], pointRadius: 0, pointHoverRadius: 0, fill: false, order: 0,
          datalabels: { display: c => c.dataIndex === c.chart.data.labels.length - 1, color: COR.critico, font: { size: 11, weight: '700' }, align: 'top', anchor: 'end', offset: 2, formatter: () => `Meta: ${meta}` } },
        { label: 'Celebrações', data: valores, order: 1, borderRadius: 4, maxBarThickness: 34,
          backgroundColor: valores.map(v => v >= meta ? COR.ok : v > 0 ? COR.atencao : COR.critico),
          datalabels: { display: c => !!c.dataset.data[c.dataIndex], color: '#16181D', font: { size: 11, weight: '700' }, align: 'end', anchor: 'end', formatter: v => U.fmtInt(v) } }
      ] },
      options: {
        layout: { padding: { top: 22, right: 8 } },
        plugins: { legend: { display: false }, tooltip: { filter: c => c.datasetIndex === 1, callbacks: { label: c => `${U.fmtInt(c.parsed.y)} celebração(ões) do gestor para o time` } } },
        scales: { y: { min: 0, suggestedMax: meta + 1, ticks: { precision: 0, stepSize: 1 } }, x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 45, minRotation: 45 } } }
      }
    });
  }

  // Pizza participação × ausência (Pesquisa de Satisfação da operação).
  function pizzaParticipacao(id, resp, aptos) {
    if (!document.getElementById(id)) return;
    const part = Math.min(resp, aptos), aus = Math.max(aptos - resp, 0);
    HUB_CHART(id, {
      type: 'pie',
      data: { labels: ['Participação', 'Ausência'], datasets: [{ data: [part, aus], backgroundColor: [COR.ok, '#D9D9D9'], borderColor: '#fff', borderWidth: 2 }] },
      options: {
        plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 12 } } },
          tooltip: { callbacks: { label: c => `${c.label}: ${U.fmtInt(c.parsed)} gestor(es)` } },
          datalabels: { color: c => c.chart.data.labels[c.dataIndex] === 'Participação' ? '#fff' : '#16181D', font: { size: 15, weight: '700' }, formatter: v => v && aptos ? U.fmtPct(v / aptos, 0) : '' } }
      }
    });
  }

  // Feedback por liderança: a barra cinza é o time do gestor (o 100% dele) e a
  // verde, sobreposta, "enche" a barra com quem recebeu feedback dele no mês.
  // Acima de cada barra, só o % de adesão (sem a quantidade, para não expor o
  // gestor). Ordem: do maior time para o menor.
  function barrasLideres(id, lista) {
    if (!document.getElementById(id)) return;
    const xs = lista.slice().sort((a, b) => b.liderados - a.liderados || b.adesao - a.adesao);
    const curto = n => { const p = String(n).trim().split(/\s+/); return p.length > 1 ? p[0] + ' ' + p[p.length - 1] : p[0]; };
    const corAdesao = p => p >= 0.8 ? COR.ok : p >= 0.5 ? COR.atencao : COR.critico;
    HUB_CHART(id, {
      type: 'bar',
      data: { labels: xs.map(x => curto(x.gestor)), datasets: [
        { label: 'Time (liderados)', data: xs.map(x => x.liderados), backgroundColor: '#D9D9D9', grouped: false, barPercentage: 0.75, maxBarThickness: 30, borderRadius: 4, order: 2,
          datalabels: { anchor: 'end', align: 'end', offset: 2, textAlign: 'center', font: { size: 10.5, weight: '700' },
            color: c => corAdesao(xs[oi(c)].adesao),
            formatter: (v, c) => U.fmtPct(xs[oi(c)].adesao, 0) } },
        { label: 'Receberam feedback do líder', data: xs.map(x => x.receberam), backgroundColor: xs.map(x => corAdesao(x.adesao)), grouped: false, barPercentage: 0.75, maxBarThickness: 30, borderRadius: 4, order: 1,
          datalabels: { display: false } }
      ] },
      options: {
        layout: { padding: { top: 22 } },
        plugins: { legend: { display: false, position: 'top', labels: { boxWidth: 12, font: { size: 11 }, generateLabels: () => [
            { text: 'Time (liderados)', fillStyle: '#D9D9D9', strokeStyle: '#D9D9D9', lineWidth: 0 },
            { text: '80% ou mais', fillStyle: COR.ok, strokeStyle: COR.ok, lineWidth: 0 },
            { text: '50% a 79%', fillStyle: COR.atencao, strokeStyle: COR.atencao, lineWidth: 0 },
            { text: 'Abaixo de 50%', fillStyle: COR.critico, strokeStyle: COR.critico, lineWidth: 0 }
          ] }, onClick: () => {} },
          tooltip: { callbacks: { title: c => `${xs[oi(c[0])].gestor} — ${xs[oi(c[0])].loja}`,
            label: c => c.datasetIndex === 0 ? 'Time do gestor' : `Adesão aos feedbacks: ${U.fmtPct(xs[oi(c)].adesao, 0)}` } } },
        scales: {
          y: { min: 0, ticks: { precision: 0 }, title: { display: true, text: 'pessoas' } },
          x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 45, minRotation: 45 } }
        }
      }
    });
  }

  // Barra de 100% dividida em realizado (verde) e restante (cinza).
  function barrasRealizado(id, labels, valores) {
    if (!document.getElementById(id)) return;
    HUB_CHART(id, {
      type: 'bar',
      data: { labels, datasets: [
        { label: 'Realizado', data: valores, backgroundColor: COR.ok, maxBarThickness: 24 },
        { label: 'Restante', data: valores.map(v => Math.max(0, 1 - v)), backgroundColor: '#D9D9D9', maxBarThickness: 24 }
      ] },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${U.fmtPct(c.parsed.x, 0)}` } },
          datalabels: { color: c => c.datasetIndex === 0 ? '#fff' : '#16181D', font: { size: 10.5, weight: '700' }, formatter: v => v >= 0.06 ? U.fmtPct(v, 0) : '' } },
        scales: { x: { stacked: true, min: 0, max: 1, ticks: { callback: v => U.fmtPct(v, 0) } }, y: { stacked: true, grid: { display: false } } }
      }
    });
  }

  // Barras empilhadas com contagens (ex.: avaliações respondidas × pendentes).
  function barrasEmpilhadas(id, labels, series) {
    if (!document.getElementById(id)) return;
    HUB_CHART(id, {
      type: 'bar',
      data: { labels, datasets: series.map(x => ({ label: x.nome, data: x.dados, backgroundColor: x.cor, borderRadius: 4, maxBarThickness: 22 })) },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
          datalabels: { color: '#fff', font: { size: 10.5, weight: '700' }, formatter: v => v ? U.fmtInt(v) : '' } },
        scales: { x: { stacked: true, min: 0, ticks: { precision: 0, stepSize: 1 } }, y: { stacked: true, grid: { display: false } } }
      }
    });
  }

  // Participação na Pesquisa de Satisfação por loja (no Escritório, por operação).
  function satisfacaoParticipacao(r, b) {
    if (r.id === 'escritorio') {
      return M.OPERACOES.filter(o => o.id !== 'escritorio')
        .map(o => ({ nome: o.nome, resp: b.operacoes[o.id].base.satisfacao_respondentes, aptos: b.operacoes[o.id].base.satisfacao_aptos }))
        .filter(x => x.aptos || x.resp);
    }
    return r.lojas.map(l => ({ nome: l.nome, resp: l.base.satisfacao_respondentes, aptos: l.base.satisfacao_aptos })).filter(x => x.aptos || x.resp);
  }
  const pctDe = x => x.aptos ? Math.min(1, x.resp / x.aptos) : null;
  const rotuloSat = x => `${x.aptos ? U.fmtPct(pctDe(x), 0) : '—'} (${U.fmtInt(x.resp)} de ${U.fmtInt(x.aptos)})`;
  const badge = (txt, tipo) => `<span class="badge" style="background:${TINT[tipo]};color:${tipo === 'ok' ? '#0f8a4c' : tipo === 'atencao' ? '#9a6b00' : 'var(--critical)'}">${txt}</span>`;

  // Nota da pesquisa por loja: todas as lojas da operação (não só as com nota),
  // da maior nota para a menor; depois as ocultas pelo anonimato e as sem resposta.
  // Com a opção marcada, mostra também a nota das lojas com menos de
  // MIN_RESPOSTAS_NOTA respondentes (sem a regra de anonimato).
  const notaLoja = l => l.ind.pesquisa_nota != null ? l.ind.pesquisa_nota : state.mostrarPoucas ? (l.ind.pesquisa_nota_bruta != null ? l.ind.pesquisa_nota_bruta : null) : null;
  function lojasPesquisa(r) {
    const ordem = l => notaLoja(l) != null ? 0 : (l.ind.pesquisa_oculta || l.base.pesquisa_respondentes) ? 1 : 2;
    return r.lojas.filter(l => !l.apoio && (l.base.hc_fim || l.base.pesquisa_convidados || l.base.pesquisa_respostas))
      .sort((a, b) => ordem(a) - ordem(b) || (notaLoja(b) || 0) - (notaLoja(a) || 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
  }
  const FAIXAS_NOTA = ' Verde = 4,0 ou mais; azul = 3,5 a 3,9 (aceitável); laranja = 3,0 a 3,4 (atenção); vermelho = abaixo de 3,0.';
  const alturaPara = n => Math.max(150, n * 30 + 50);
  const pctFmt = v => U.fmtPct(v, 0);
  const notaFmt = v => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  function blocoGraficos(r, b) {
    CHARTS.length = 0;
    const lojas = r.lojas.filter(l => !l.apoio);
    const com = id => lojas.filter(l => l.ind[id] != null);
    const fbId = r.id === 'escritorio' ? 'devolutiva_adesao' : 'feedback_adesao';
    const ave = lojas.filter(l => l.base.ave45_total || l.base.ave90_total);
    const pilares = Object.entries(r.ind.pilares || {}).filter(([, v]) => v != null);
    const areas = Object.entries(r.ind.satisfacao_areas || {}).filter(([, v]) => v != null);
    const satP = satisfacaoParticipacao(r, b);
    const html = [
      cardGrafico('bl-c-fb', r.id === 'escritorio' ? 'Feedback ou 1:1 por área' : 'Adesão aos feedbacks por loja', '&#128172;', alturaPara(com(fbId).length), 'Pessoas que receberam ao menos um feedback de gestor no mês ÷ liderados ativos no fim do mês.'),
      (r.feedback_lideres || []).length ? cardGraficoLargo('bl-c-fbl', 'Feedbacks por liderança', '&#128172;', 340, `Liderados de cada gestor (gestor direto no cadastro) que receberam ao menos um feedback dele no mês: a barra cinza é o time inteiro e a colorida mostra quanto dele foi alcançado (verde = 80% ou mais, amarelo = 50% a 79%, vermelho = abaixo de 50%). Do maior time para o menor. Uma ${r.id === 'escritorio' ? 'área' : 'loja'} pode ter mais de um time (ex.: gerente de venda direta, gerente de atendimento, coordenador de logística). Passe o mouse para ver a ${r.id === 'escritorio' ? 'área' : 'loja'}.`) : '',
      cardGrafico('bl-c-cel', 'Celebrações das lideranças por loja', '&#127881;', 300, `Celebrações do gestor para o próprio time (liderados diretos, mesma loja ou @todos), contadas uma vez cada. Verde = bateu a meta de ${M.META_CELEBRACOES_LOJA} no mês (1 por semana); amarelo = celebrou, mas abaixo da meta. ${lojas.filter(l => !l.ind.celebracoes).length} de ${lojas.length} ${r.id === 'escritorio' ? 'departamentos' : 'lojas'} sem nenhuma celebração no mês. Áreas de apoio (supervisão, comercial) aparecem, marcadas com "(apoio)", quando celebraram: elas contam no total da operação.`),
      cardGrafico('bl-c-hum', 'Termômetro de Humor por loja', '&#127777;&#65039;', alturaPara(com('humor_media').length), 'Média dos registros do mês (1 a 5). Meta: acima de 3,5.' + FAIXAS_NOTA),
      cardGrafico('bl-c-eng', 'Engajamento na Feedz por loja', '&#127939;', alturaPara(com('engajamento_feedz').length), `Média dos módulos: acessos, ${r.id === 'escritorio' ? '1:1' : 'feedbacks'}, celebrações e humor (contas da Feedz, base = colaboradores ativos) e participação na Pesquisa de Engajamento, na Pesquisa de Satisfação e na AvE do mês. Verde = realizado; cinza = o que falta para 100%. * = sem acessos informados.`),
      lojas.some(l => l.ind.turnover > 0) ? cardGrafico('bl-c-turn', 'Turnover por loja', '&#128260;', alturaPara(lojas.filter(l => l.ind.turnover > 0).length), '((Admissões + desligamentos) ÷ 2) ÷ headcount no início do mês. Lojas com 0% não aparecem.') : '',
      ave.some(l => l.base.ave45_total) ? cardGrafico('bl-c-ave45', 'AvE 45 dias — avaliações dos gestores', '&#128221;', alturaPara(ave.filter(l => l.base.ave45_total).length) + 30, 'Avaliações que venceram no mês (admissão + 44 dias): respondidas pelo gestor × pendentes. Entre parênteses, o total da loja.') : '',
      ave.some(l => l.base.ave90_total) ? cardGrafico('bl-c-ave90', 'AvE 90 dias — avaliações dos gestores', '&#128221;', alturaPara(ave.filter(l => l.base.ave90_total).length) + 30, 'Avaliações que venceram no mês (admissão + 89 dias): respondidas pelo gestor × pendentes. Entre parênteses, o total da loja.') : '',
      lojasPesquisa(r).length && (r.ind.pesquisa_nota != null || r.base.pesquisa_convidados) ? cardGrafico('bl-c-pq', 'Pesquisa de Engajamento — nota por loja', '&#128200;', alturaPara(lojasPesquisa(r).length), `<label style="display:inline-flex;gap:6px;align-items:center;cursor:pointer;color:var(--text);font-weight:600;margin-bottom:4px"><input type="checkbox" id="bl-pq-poucas"${state.mostrarPoucas ? ' checked' : ''}> Mostrar notas de lojas com menos de ${M.MIN_RESPOSTAS_NOTA} respondentes</label><br>Todas as lojas: sem resposta no pulso = 0,0. Com 1 ou 2 respondentes a nota fica oculta, a não ser que a opção acima esteja marcada (com tão poucas pessoas, a nota da loja pode mostrar a resposta individual). Passe o mouse na barra para ver quantos responderam. Meta 4,0; saudável a partir de 3,5.${FAIXAS_NOTA}`) : '',
      pilares.length ? cardGrafico('bl-c-pil', 'Pesquisa de Engajamento — pilares', '&#127919;', alturaPara(pilares.length), 'Média das respostas de cada pilar no pulso do mês.' + FAIXAS_NOTA) : '',
      com('pesquisa_participacao').length ? cardGrafico('bl-c-pqp', 'Pesquisa de Engajamento — participação por loja', '&#128101;', alturaPara(com('pesquisa_participacao').length), 'Respondentes ÷ convidados do pulso. Meta: 60%.') : '',
      r.id === 'escritorio'
        ? (satP.length ? cardGrafico('bl-c-satp', 'Pesquisa de Satisfação — participação por operação', '&#128101;', alturaPara(satP.length), 'Gestores que responderam no ciclo ÷ gestores aptos (tag pesquisa.satisfação no cadastro).') : '')
        : (r.base.satisfacao_aptos ? cardGrafico('bl-c-satp', 'Pesquisa de Satisfação — participação dos gestores', '&#128101;', 280, `${U.fmtInt(Math.min(r.base.satisfacao_respondentes, r.base.satisfacao_aptos))} de ${U.fmtInt(r.base.satisfacao_aptos)} gestores aptos responderam no ciclo (tag pesquisa.satisfação no cadastro). Visão da operação, sem identificar lojas.`) : ''),
      areas.length ? cardGrafico('bl-c-sat', 'Satisfação com o Suporte do Escritório — notas por área', '&#127970;', alturaPara(areas.length), r.id === 'escritorio' ? 'Notas de 0 a 10 dadas pelos gestores de todas as operações.' : 'Notas de 0 a 10 dadas pelos gestores desta operação.') : '',
      com('twygo_progresso').length ? cardGrafico('bl-c-tw', 'Twygo — progresso por loja', '&#128218;', alturaPara(com('twygo_progresso').length), 'Progresso médio das inscrições confirmadas (foto atual do Twygo, não do mês).') : '',
      com('unibe_adesao').length ? cardGrafico('bl-c-ub', 'Unibê — adesão por loja', '&#127891;', alturaPara(com('unibe_adesao').length), daPlanilha('unibe_adesao') ? 'Adesão oficial de cada PDV na planilha 27.1 (Unibê) do mês.' : 'Valores informados em "Valores manuais".') : ''
    ].filter(Boolean);
    return `<div class="grid2">${html.join('')}</div>`;
  }

  function desenharGraficos(r, b) {
    const lojas = r.lojas.filter(l => !l.apoio);
    const serie = (id, filtro) => lojas.filter(l => l.ind[id] != null && (!filtro || filtro(l))).sort((a, b) => b.ind[id] - a.ind[id]);
    const cores = (id, xs) => xs.map(l => COR[M.statusMeta(id, l.ind[id]) || 'neutro']);
    const fbId = r.id === 'escritorio' ? 'devolutiva_adesao' : 'feedback_adesao';
    let s = serie(fbId); barras('bl-c-fb', s.map(l => l.nome), s.map(l => l.ind[fbId]), { max: 1, fmt: pctFmt, tick: pctFmt, cores: cores(fbId, s) });
    // Áreas de apoio (supervisão, comercial) entram no gráfico quando celebraram: elas contam no total da operação.
    s = lojas.concat(r.lojas.filter(l => l.apoio && l.ind.celebracoes)).sort((a, b) => b.ind.celebracoes - a.ind.celebracoes || a.apoio - b.apoio || a.nome.localeCompare(b.nome, 'pt-BR'));
    colunasComMeta('bl-c-cel', s.map(l => l.apoio ? `${l.nome} (apoio)` : l.nome), s.map(l => l.ind.celebracoes), M.META_CELEBRACOES_LOJA);
    barrasLideres('bl-c-fbl', r.feedback_lideres || []);
    s = serie('humor_media'); barras('bl-c-hum', s.map(l => l.nome), s.map(l => l.ind.humor_media), { min: 0, max: 5, fmt: notaFmt, cores: cores('humor_media', s) });
    s = serie('engajamento_feedz'); barrasRealizado('bl-c-eng', s.map(l => l.nome + (l.ind.engajamento_completo ? '' : ' *')), s.map(l => l.ind.engajamento_feedz));
    s = serie('turnover', l => l.ind.turnover > 0); barras('bl-c-turn', s.map(l => l.nome), s.map(l => l.ind.turnover), { fmt: v => U.fmtPct(v, 1), tick: pctFmt, cores: cores('turnover', s) });
    for (const c of [45, 90]) {
      const tot = l => l.base['ave' + c + '_total'], feitas = l => l.base['ave' + c + '_gestor'];
      const xs = lojas.filter(tot).sort((a, d) => (tot(d) - feitas(d)) - (tot(a) - feitas(a)) || tot(d) - tot(a));
      barrasEmpilhadas('bl-c-ave' + c, xs.map(l => `${l.nome} (${tot(l)})`), [
        { nome: 'Gestor respondeu', dados: xs.map(feitas), cor: COR.ok },
        { nome: 'Pendente', dados: xs.map(l => tot(l) - feitas(l)), cor: COR.critico }
      ]);
    }
    if (r.id !== 'escritorio') pizzaParticipacao('bl-c-satp', r.base.satisfacao_respondentes, r.base.satisfacao_aptos);
    const sp = r.id !== 'escritorio' ? [] : satisfacaoParticipacao(r, b).sort((a, d) => (pctDe(d) || 0) - (pctDe(a) || 0));
    if (sp.length) barras('bl-c-satp', sp.map(x => x.nome), sp.map(x => pctDe(x) || 0), { max: 1, fmt: pctFmt, tick: pctFmt, rotulos: sp.map(rotuloSat),
      cores: sp.map(x => { const p = pctDe(x); return p == null ? COR.neutro : p >= 1 ? COR.ok : p >= 0.5 ? COR.atencao : COR.critico; }) });
    s = lojasPesquisa(r);
    barras('bl-c-pq', s.map(l => l.nome), s.map(l => notaLoja(l) || 0), { max: 5, fmt: notaFmt,
      rotulos: s.map(l => notaLoja(l) != null ? notaFmt(notaLoja(l))
        : l.ind.pesquisa_oculta || l.base.pesquisa_respondentes ? `oculta (menos de ${M.MIN_RESPOSTAS_NOTA} respostas)` : '0,0 (sem resposta)'),
      // Ao passar o mouse: nota e número de respondentes.
      dicas: s.map(l => (notaLoja(l) != null ? 'Nota ' + notaFmt(notaLoja(l)) : l.base.pesquisa_respondentes ? 'Nota oculta' : 'Sem resposta') + ` · ${U.fmtInt(l.base.pesquisa_respondentes || 0)} respondente(s)`),
      cores: s.map(l => notaLoja(l) != null ? COR[M.statusMeta('pesquisa_nota', notaLoja(l))] : '#BFBFBF') });
    const pil = Object.entries(r.ind.pilares || {}).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]);
    barras('bl-c-pil', pil.map(p => p[0]), pil.map(p => p[1]), { max: 5, fmt: notaFmt, cores: pil.map(p => COR[M.statusMeta('pesquisa_nota', p[1])]) });
    s = serie('pesquisa_participacao'); barras('bl-c-pqp', s.map(l => l.nome), s.map(l => l.ind.pesquisa_participacao), { max: 1, fmt: pctFmt, tick: pctFmt, cores: cores('pesquisa_participacao', s) });
    const ar = Object.entries(r.ind.satisfacao_areas || {}).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]);
    barras('bl-c-sat', ar.map(a => a[0]), ar.map(a => a[1]), { max: 10, fmt: notaFmt, cores: ar.map(a => a[1] >= 8 ? COR.ok : a[1] >= 6 ? COR.atencao : COR.critico) });
    s = serie('twygo_progresso'); barras('bl-c-tw', s.map(l => l.nome), s.map(l => l.ind.twygo_progresso), { max: 1, fmt: pctFmt, tick: pctFmt, cores: cores('twygo_progresso', s) });
    s = serie('unibe_adesao'); barras('bl-c-ub', s.map(l => l.nome), s.map(l => l.ind.unibe_adesao), { max: 1, fmt: pctFmt, tick: pctFmt, cores: cores('unibe_adesao', s) });
  }

  function tabelaLojas(r) {
    const cols = [
      ['hc', 'HC', l => U.fmtInt(l.base.hc_fim)],
      [r.id === 'escritorio' ? 'devolutiva_adesao' : 'feedback_adesao', 'Feedback'],
      ['celebracoes', 'Celebr.'],
      ['humor_media', 'Humor'],
      ['engajamento_feedz', 'Engaj. Feedz'],
      ['turnover', 'Turnover'],
      ['ave45_gestor', 'AvE 45 gestor', l => l.base.ave45_total ? `${M.fmtValor('ave45_gestor', l.ind.ave45_gestor)} <span class="bl-note">(${l.base.ave45_total})</span>` : '—'],
      ['ave90_gestor', 'AvE 90 gestor', l => l.base.ave90_total ? `${M.fmtValor('ave90_gestor', l.ind.ave90_gestor)} <span class="bl-note">(${l.base.ave90_total})</span>` : '—'],
      ['satisfacao_respondentes', 'Satisf.'],
      ['pesquisa_nota', 'Nota pesquisa', l => l.ind.pesquisa_oculta ? `<span class="bl-note" title="Menos de ${M.MIN_RESPOSTAS_NOTA} respondentes">oculta</span>` : esc(M.fmtValor('pesquisa_nota', l.ind.pesquisa_nota))],
      ['pesquisa_participacao', 'Particip.'],
      ['twygo_progresso', 'Twygo']
    ];
    const cel = (l, [id, , f]) => `<td>${f ? f(l) : `${esc(M.fmtValor(id, l.ind[id]))} ${chip(id, l.variacoes && l.variacoes[id])}`}</td>`;
    const lojas = r.lojas.slice().sort((a, b) => (a.apoio - b.apoio) || a.nome.localeCompare(b.nome, 'pt-BR'));
    return card(`Indicadores por loja — ${esc(r.op.nome)}`, '&#127970;', `
      <div class="table-wrap" style="max-height:620px"><table class="dt bl-lojas"><thead><tr><th>Loja / área</th>${cols.map(c => `<th>${c[1]}</th>`).join('')}</tr></thead><tbody>
      ${lojas.map(l => `<tr class="${l.apoio ? 'apoio' : ''}"><td>${esc(l.nome)}${l.apoio ? ' <span class="badge b1">apoio</span>' : ''}</td>${cols.map(c => cel(l, c)).join('')}</tr>`).join('')}
      <tr style="font-weight:700;background:#F7F9FC"><td>Total da operação</td>${cols.map(c => cel({ base: r.base, ind: r.ind, variacoes: r.variacoes }, c)).join('')}</tr>
      </tbody></table></div>
      <p class="bl-note">Áreas de apoio (comercial, supervisão, logística) entram no total, mas não nos gráficos por loja. Totais são ponderados pelo tamanho de cada loja.</p>`, { full: true });
  }

  function abaIndicadores(b) {
    if (state.op === 'geral') return visaoGeral(b);
    const r = b.operacoes[state.op];
    const fonte = r.anteriorFonte === 'fechado' ? `boletim fechado de ${M.nomeDoMes(b.mesAnterior)}` : `${M.nomeDoMes(b.mesAnterior)} recalculado com os dados atuais`;
    return `${kpis(r)}<p class="bl-note" style="margin:-8px 0 16px">Comparação com ${esc(fonte)}.${b.pulso ? ` Pesquisa de Engajamento: pulso de ${U.fmtDateBR(b.pulso.inicio)} a ${U.fmtDateBR(b.pulso.fim)}.` : ''}</p>
      ${blocoGraficos(r, b)}${tabelaLojas(r)}`;
  }

  // ---------------------------------------------------------------------------
  // Texto do boletim
  // ---------------------------------------------------------------------------
  function abaTexto(b) {
    if (state.op === 'geral') return empty('Escolha uma operação para ver o texto do boletim dela.');
    const secoes = M.textos(b.operacoes[state.op], b.mes);
    return `<div style="display:flex;justify-content:flex-end;margin-bottom:10px"><button class="btn btn-outline btn-sm" id="bl-copiar-tudo">Copiar o boletim inteiro</button></div>
      ${secoes.map((s, i) => `<div class="bl-txt"><h4>${esc(s.titulo)}<button class="btn btn-outline btn-sm bl-copiar" data-i="${i}">Copiar</button></h4>${s.paragrafos.map(p => `<p>${esc(p)}</p>`).join('')}</div>`).join('')}
      <p class="bl-note">Os textos são gerados a partir dos números desta tela, com as mesmas regras para todas as operações. Revise e ajuste o tom antes de publicar; os gráficos de cada seção estão na aba Indicadores (botão "Baixar imagem").</p>`;
  }

  async function copiar(texto, btn) {
    try { await navigator.clipboard.writeText(texto); }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = texto; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    const o = btn.textContent; btn.textContent = 'Copiado!'; setTimeout(() => { btn.textContent = o; }, 1500);
  }

  // ---------------------------------------------------------------------------
  // Valores manuais (Unibê, Academia Hering)
  // ---------------------------------------------------------------------------
  function abaManuais(b) {
    if (state.op === 'geral') return empty('Escolha uma operação para informar os valores manuais.');
    const r = b.operacoes[state.op];
    // Mês fechado: a foto já foi guardada como publicada; editar aqui deixaria a
    // tela diferente da foto. Para mudar, é preciso reabrir o mês.
    const fechado = M.OPERACOES.some(o => b.operacoes[o.id].fechado);
    const pode = podeEditar() && !fechado;
    const campos = [['unibe_adesao', 'Unibê — adesão (%)', true]].concat(state.op === 'hering' ? [['academia_pontos', 'Academia Hering — pontos', false]] : []);
    const inp = (loja, id, pct, v) => pode
      ? `<input type="number" step="${pct ? '0.1' : '1'}" min="0" ${pct ? 'max="100"' : ''} data-loja="${esc(loja || '')}" data-ind="${id}" data-pct="${pct ? 1 : 0}" value="${v == null ? '' : (pct ? +(v * 100).toFixed(1) : v)}">`
      : esc(v == null ? '—' : (pct ? U.fmtPct(v, 1) : U.fmtInt(v)));
    // Unibê / Academia com planilha no mês: mostra o valor calculado, sem campo.
    const campo = (x, loja, c) => daPlanilha(c[0])
      ? `<span title="Da planilha ${c[0] === 'unibe_adesao' ? '27.1 Unibê' : '27.2 Academia Hering'} do mês">${esc(x.ind[c[0]] == null ? '—' : (c[2] ? U.fmtPct(x.ind[c[0]], 1) : U.fmtInt(Math.round(x.ind[c[0]]))))}</span>`
      : inp(loja, c[0], c[2], manual(r, loja, c[0]));
    const lojas = r.lojas.filter(l => !l.apoio);
    const algumaPlanilha = campos.some(c => daPlanilha(c[0]));
    const aviso = fechado ? `<div class="insight info" style="margin-bottom:16px"><span class="ic">${HUB_ICON('info')}</span><span><b>${esc(mesLabel(b.mes))} está fechado:</b> os valores manuais ficam travados. Para alterar, clique em <b>Reabrir mês</b> no topo, ajuste e feche de novo.</span></div>` : '';
    return aviso + cardEngajamento(r, b, inp) + '<div style="height:16px"></div>' + card(`Treinamentos — ${esc(r.op.nome)} · ${esc(mesLabel(b.mes))}`, '&#128221;', `
      <p class="bl-note" style="margin:0 0 12px">${algumaPlanilha ? 'Com a planilha do mês enviada em Administração → Upload (27.1 Unibê / 27.2 Academia Hering), o valor vem dela e não pode ser digitado. ' : 'Envie as planilhas 27.1 Unibê e 27.2 Academia Hering em Administração → Upload, com o mês de referência, para não precisar digitar. '}O valor digitado salva ao sair do campo; apagar o campo remove o valor. Se só a operação for informada, ela vale como total.</p>
      <div class="table-wrap" style="max-height:600px"><table class="dt bl-man"><thead><tr><th>Loja</th>${campos.map(c => `<th>${c[1]}</th>`).join('')}<th></th></tr></thead><tbody>
        <tr style="font-weight:700;background:#F7F9FC"><td>Total da operação</td>${campos.map(c => `<td>${campo(r, null, c)}</td>`).join('')}<td class="ok-salvo"></td></tr>
        ${lojas.map(l => `<tr><td>${esc(l.nome)}</td>${campos.map(c => `<td>${campo(l, l.departamento, c)}</td>`).join('')}<td class="ok-salvo"></td></tr>`).join('')}
      </tbody></table></div>`, { full: true });
  }

  // Engajamento na Feedz: só os Acessos são digitados (por loja); os outros
  // módulos o Hub calcula com as contas do Painel de Engajamento da Feedz.
  function cardEngajamento(r, b, inp) {
    const esc_ = r.id === 'escritorio';
    const pct = v => v == null ? '—' : U.fmtPct(v, 0);
    const eng = x => `<b style="color:${COR[M.statusMeta('engajamento_feedz', x.ind.engajamento_feedz)] || 'inherit'}">${pct(x.ind.engajamento_feedz)}</b>${x.ind.engajamento_feedz != null && !x.ind.engajamento_completo ? ' <span class="bl-note" title="Sem acessos: média só dos outros módulos">*</span>' : ''}`;
    const linha = (x, total) => { const c = x.ind.engajamento_componentes || {};
      return `<tr${total ? ' style="font-weight:700;background:#F7F9FC"' : ''}><td>${total ? 'Total da operação' : esc(x.nome)}</td><td>${U.fmtInt(x.base.hc_fim)}</td>
        <td>${total ? pct(c.acessos) : inp(x.departamento, 'acessos_feedz', true, manual(r, x.departamento, 'acessos_feedz'))}</td>
        <td>${pct(esc_ ? c.oneonone : c.feedbacks)}</td><td>${pct(c.celebracoes)}</td><td>${pct(c.humor)}</td><td>${pct(c.pesquisa)}</td><td>${pct(c.satisfacao)}</td><td>${pct(c.ave)}</td><td>${eng(x)}</td><td class="ok-salvo"></td></tr>`; };
    const lojas = r.lojas.filter(l => !l.apoio && l.base.hc_fim);
    return card(`Engajamento na Feedz — ${esc(r.op.nome)} · ${esc(mesLabel(b.mes))}`, '&#127939;', `
      <p class="bl-note" style="margin:0 0 12px">Digite só os <b>Acessos</b> de cada loja: o % da barra "Acessos" do Painel de Engajamento da Feedz, de 01 ao último dia de ${esc(M.nomeDoMes(b.mes))}, com Colaboradores = <b>Ativos</b>, filtrado pelo departamento. ${esc_ ? '1:1' : 'Feedbacks'}, Celebrações e Humor o Hub calcula com as contas da Feedz: ${esc_ ? '1:1 realizados' : 'feedbacks enviados'} ÷ ativos, celebrações enviadas (loja inteira) ÷ ativos e registros de humor ÷ (10 × ativos), cada um até 100%. Também entram a participação na Pesquisa de Engajamento (respondentes ÷ convidados do pulso), na Pesquisa de Satisfação (gestores que responderam ÷ aptos) e na AvE do mês (avaliações do gestor e autoavaliações concluídas ÷ as que venceram). Engajamento = média dos módulos; o que não se aplica à loja no mês (—) fica fora. * = loja sem acessos.</p>
      <div class="table-wrap" style="max-height:600px"><table class="dt bl-man"><thead><tr><th>Loja</th><th>Ativos</th><th>Acessos (%)</th><th>${esc_ ? '1:1' : 'Feedbacks'}</th><th>Celebrações</th><th>Humor</th><th>Pesq. Engaj.</th><th>Pesq. Satisf.</th><th>AvE</th><th>Engajamento</th><th></th></tr></thead><tbody>
        ${linha({ base: r.base, ind: r.ind }, true)}
        ${lojas.map(l => linha(l, false)).join('')}
      </tbody></table></div>`, { full: true });
  }

  // Unibê / Academia Hering do mês vieram de planilha (supabase-treinamentos.sql)?
  // Então o valor manual não vale (ver metrics-boletim.js, passo 10).
  function daPlanilha(id) {
    const t = { unibe_adesao: 'unibe_pdv', academia_pontos: 'academia_hering' }[id];
    return !!t && ((window.HUB_DATA || {})[t] || []).some(x => String(x.mes).slice(0, 7) === state.mes);
  }

  // Valor informado à mão (não o calculado), para o campo começar vazio quando não houver.
  function manual(r, loja, id) {
    const n = s => U.normalizeText(s || '');
    const e = ((window.HUB_BOLETIM_DATA || {}).entradas || []).find(x => String(x.mes).slice(0, 7) === state.mes && x.operacao === r.id && x.indicador === id && n(x.loja) === n(loja));
    return e ? Number(e.valor) : null;
  }

  function wireManuais(el, b) {
    el.querySelectorAll('.bl-man input').forEach(inp => inp.addEventListener('change', async e => {
      const t = e.target;
      const bruto = t.value.trim();
      const valor = bruto === '' ? null : Number(bruto.replace(',', '.')) / (t.dataset.pct === '1' ? 100 : 1);
      const ok = t.closest('tr').querySelector('.ok-salvo');
      ok.textContent = 'Salvando...';
      try {
        await HUB_BOLETIM.salvarEntrada(b.mes, state.op, t.dataset.loja || null, t.dataset.ind, valor);
        ok.textContent = 'Salvo';
        const prox = document.activeElement && document.activeElement.dataset ? Object.assign({}, document.activeElement.dataset) : null;
        await HUB_BOLETIM.carregar();
        M._invalidar();
        renderConteudo(el);
        if (prox && prox.ind) { const alvo = Array.from(el.querySelectorAll('.bl-man input')).find(x => x.dataset.ind === prox.ind && x.dataset.loja === prox.loja); if (alvo) alvo.focus(); }
      } catch (err) { ok.textContent = err.message; ok.style.color = 'var(--critical)'; }
    }));
  }

  // ---------------------------------------------------------------------------
  // Qualidade dos dados + dicionário
  // ---------------------------------------------------------------------------
  const DICIONARIO = [
    ['Adesão aos feedbacks', 'Liderados que receberam ao menos um feedback de um gestor no mês ÷ liderados ativos no fim do mês.', 'Feedbacks + Colaboradores', 'Pessoas, não quantidade de feedbacks: nunca passa de 100%.'],
    ['Feedback ou 1:1 (Escritório)', 'Liderados com feedback de gestor OU 1:1 realizado no mês ÷ liderados. O boletim do Escritório também mostra a adesão só ao 1 on 1.', 'Feedbacks + 1 on 1', ''],
    ['Celebrações', 'Celebrações do gestor para o próprio time no mês: algum destinatário é liderado direto dele, da mesma loja, ou @todos. Cada celebração conta uma vez (o export repete a linha por destinatário). Referência: 4 por loja (1 por semana).', 'Celebrações + Colaboradores (gestor direto)', 'Usuário automático de aniversários (Juliana Caldeira) não conta.'],
    ['Termômetro de Humor', 'Média de todos os registros do mês (1 a 5). Meta: acima de 3,5.', '36. Humor', 'Não usa a coluna "Media" (média histórica da pessoa).'],
    ['Engajamento na Feedz', 'Média dos módulos, cada um até 100%: acessos (% que acessou), feedbacks enviados ÷ ativos (no Escritório, 1:1 realizados ÷ ativos), celebrações enviadas pela loja inteira ÷ ativos, registros de humor ÷ (10 × ativos), participação na Pesquisa de Engajamento (respondentes ÷ convidados), na Pesquisa de Satisfação (respondentes ÷ gestores aptos) e na AvE do mês (gestor + autoavaliação concluídas ÷ 2 × vencidas).', 'Acessos: Valores manuais (painel da Feedz). Demais: Feedbacks / 1 on 1, Celebrações, 36. Humor, 33, 61, AvE 45/90', 'Módulo que não se aplica à loja no mês fica fora da média. Loja sem acessos marcada com *.'],
    ['Turnover', '((Admissões + desligamentos) ÷ 2) ÷ headcount no início do mês.', 'Colaboradores', 'Mesma conta da tela Rotatividade.'],
    ['AvE 45 / 90', 'Colaboradores que completam 45 (ou 90) dias no mês: % com avaliação do gestor concluída e % com autoavaliação concluída.', 'AVE 45/90 DIAS', 'Quem saiu antes do vencimento não entra.'],
    ['Pesquisa de Satisfação', 'Gestores que responderam no mês ÷ gestores ativos com a tag pesquisa.satisfação (coluna Grupos do cadastro); notas 0-10 por área de suporte.', '16. Base Pesquisa Feedz (Pesquisa de Satisfação) + Colaboradores', 'No boletim do Escritório: respostas da empresa toda.'],
    ['Nota da Pesquisa de Engajamento', 'Média de todas as respostas do pulso do mês, sem a pergunta de NPS. Pilares: média por dimensão.', '33. Pesquisa de Engajamento (aba Respostas, agregada)', `Loja só aparece com ${M.MIN_RESPOSTAS_NOTA}+ respondentes.`],
    ['Participação na Pesquisa', 'Respondentes ÷ convidados do pulso que começa no mês. Meta: 60%.', '33. Pesquisa de Engajamento', 'Convidados = headcount ativo do departamento (foto do pulso).'],
    ['eNPS', '% de promotores (9-10) − % de detratores (0-6).', '33. Pesquisa de Engajamento', 'Só no total da operação.'],
    ['Twygo', 'Progresso médio das inscrições confirmadas (ambiente ativo).', '27. Twygo', 'Foto atual: não muda com o mês; só tem seta quando o mês anterior foi fechado.'],
    ['Unibê', 'Adesão oficial de cada PDV (aba PDV); loja e operação = média dos PDVs. Meta: 90%.', '27.1 Unibê (mês escolhido no upload)', 'Sem planilha no mês, vale o valor digitado em Valores manuais.'],
    ['Academia Hering', 'Performance média (pontos) das pessoas da loja/operação.', '27.2 Academia Hering (mês escolhido no upload)', 'Sem planilha no mês, vale o valor digitado em Valores manuais.'],
    ['Totais da operação', 'Soma dos numeradores ÷ soma dos denominadores de todas as lojas e áreas da operação.', '', 'Nunca média simples das lojas.'],
    ['Setas', '▲ subiu / ▼ caiu / = estável, sempre comparando com o mês anterior. A cor diz se foi bom (verde) ou ruim (vermelho) — no turnover, cair é bom.', '', 'Percentuais variam em pontos percentuais (p.p.).']
  ];

  function abaQualidade(b) {
    const carga = ((window.HUB_BOLETIM_DATA || {}).avisosCarga || []).map(t => ({ tipo: 'alerta', area: 'Carga', texto: t }));
    const avisos = carga.concat(b.avisos);
    const icons = { alerta: 'alert', info: 'info' };
    const lista = avisos.length
      ? avisos.map(a => `<div class="insight ${a.tipo === 'alerta' ? 'alerta' : 'info'}"><span class="ic">${HUB_ICON(icons[a.tipo] || 'info')}</span><span><b>${esc(a.area)}:</b> ${esc(a.texto)}</span></div>`).join('')
      : '<div class="insight info"><span class="ic">' + HUB_ICON('checkCircle') + '</span><span>Nenhum problema encontrado nos dados deste mês.</span></div>';
    return card(`Conferência dos dados — ${esc(mesLabel(b.mes))}`, '&#9888;&#65039;', lista, { full: true }) +
      '<div style="height:16px"></div>' +
      card('Como cada indicador é calculado', '&#128203;', `<div class="table-wrap fit"><table class="dt fit bl-dic"><thead><tr><th>Indicador</th><th>Conta</th><th>Fonte</th><th>Observação</th></tr></thead><tbody>
        ${DICIONARIO.map(d => `<tr>${d.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`, { full: true });
  }

  // ---------------------------------------------------------------------------
  // Fechar / reabrir mês
  // ---------------------------------------------------------------------------
  function fotoDoMes(b) {
    return M.OPERACOES.map(op => {
      const r = b.operacoes[op.id];
      return { operacao: op.id, dados: { ind: r.ind, base: r.base, lojas: r.lojas.map(l => ({ departamento: l.departamento, nome: l.nome, apoio: l.apoio, ind: l.ind, base: l.base })) } };
    }).concat([{ operacao: 'empresa', dados: { ind: b.empresa.ind, base: b.empresa.base, lojas: [] } }]);
  }

  async function fechar(el, b) {
    if (!window.confirm(`Fechar o boletim de ${mesLabel(b.mes)}? Os números de hoje ficam guardados como os publicados, e o boletim do mês seguinte passa a se comparar com esta foto.`)) return;
    const btn = el.querySelector('#bl-fechar');
    btn.disabled = true; btn.textContent = 'Fechando...';
    try {
      await HUB_BOLETIM.fechar(b.mes, fotoDoMes(b));
      await HUB_BOLETIM.carregar();
      M._invalidar();
      renderConteudo(el);
    } catch (err) { btn.disabled = false; btn.textContent = 'Fechar mês'; window.alert(err.message); }
  }

  async function reabrir(el, b) {
    if (!window.confirm(`Reabrir ${mesLabel(b.mes)}? A foto salva é descartada e o mês volta a ser recalculado com os dados atuais.`)) return;
    try {
      await HUB_BOLETIM.reabrir(b.mes);
      await HUB_BOLETIM.carregar();
      M._invalidar();
      renderConteudo(el);
    } catch (err) { window.alert(err.message); }
  }

  function baixarPng(canvasId, nome) {
    const c = document.getElementById(canvasId);
    if (!c) return;
    const t = document.createElement('canvas');
    t.width = c.width; t.height = c.height;
    const g = t.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, t.width, t.height); g.drawImage(c, 0, 0);
    const a = document.createElement('a');
    const opNome = state.op === 'geral' ? 'geral' : M.OP_POR_ID.get(state.op).nome;
    // Sem acentos: o Chrome ignora o nome do arquivo quando ele tem caracteres fora do ASCII.
    a.download = `${nome} - ${opNome} - ${state.mes}.png`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]+/g, '').replace(/[\\/:*?"<>|']+/g, '-');
    a.href = t.toDataURL('image/png');
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  function renderConteudo(el) {
    if (!state.mes) {
      const ant = M.mesAnterior(U.todayISO().slice(0, 7));
      state.mes = ant;
    }
    const b = M.boletim(state.mes);
    const corpo = { indicadores: abaIndicadores, texto: abaTexto, manuais: abaManuais, qualidade: abaQualidade }[state.aba](b);
    el.innerHTML = STYLE + topo(b) + corpo;

    el.querySelector('#bl-mes').addEventListener('change', e => { state.mes = e.target.value; renderConteudo(el); });
    el.querySelector('#bl-op').addEventListener('change', e => { state.op = e.target.value; renderConteudo(el); });
    el.querySelectorAll('.tab-btn[data-aba]').forEach(t => t.addEventListener('click', () => { state.aba = t.dataset.aba; renderConteudo(el); }));
    const bf = el.querySelector('#bl-fechar'); if (bf) bf.addEventListener('click', () => fechar(el, b));
    const br = el.querySelector('#bl-reabrir'); if (br) br.addEventListener('click', () => reabrir(el, b));
    el.querySelectorAll('.bl-mx tr[data-op]').forEach(tr => tr.addEventListener('click', () => { state.op = tr.dataset.op; renderConteudo(el); }));

    if (state.aba === 'indicadores' && state.op !== 'geral') {
      const cbPoucas = el.querySelector('#bl-pq-poucas');
      if (cbPoucas) cbPoucas.addEventListener('change', e => { state.mostrarPoucas = e.target.checked; renderConteudo(el); });
      desenharGraficos(b.operacoes[state.op], b);
      guardarOriginais();
      el.querySelectorAll('.bl-itens-btn').forEach(btn => btn.addEventListener('click', () => abrirItens(btn.dataset.canvas)));
      el.querySelectorAll('.bl-png').forEach(btn => btn.addEventListener('click', () => baixarPng(btn.dataset.canvas, btn.dataset.nome)));
    }
    if (state.aba === 'texto' && state.op !== 'geral') {
      const secoes = M.textos(b.operacoes[state.op], b.mes);
      el.querySelectorAll('.bl-copiar').forEach(btn => btn.addEventListener('click', () => {
        const s = secoes[+btn.dataset.i];
        copiar([s.titulo].concat(s.paragrafos).join('\n\n'), btn);
      }));
      el.querySelector('#bl-copiar-tudo').addEventListener('click', e => copiar(M.textoCorrido(secoes), e.target));
    }
    if (state.aba === 'manuais' && state.op !== 'geral') wireManuais(el, b);
  }

  // Os dados só são buscados na primeira abertura da tela na sessão (ou depois
  // de "Atualizar dados" / de um upload, que descartam o cache).
  function renderBoletim(el) {
    if (HUB_BOLETIM.jaCarregado()) {
      try { return renderConteudo(el); }
      catch (err) { el.innerHTML = empty('Não consegui calcular o boletim.', esc(err.message || '')); return; }
    }
    el.innerHTML = empty('Carregando os dados do Boletim da Liderança...');
    HUB_BOLETIM.carregar().then(() => {
      M._invalidar();
      if (window.HUB_RENDER_CURRENT) window.HUB_RENDER_CURRENT();
    }).catch(err => {
      el.innerHTML = empty('Não consegui carregar o Boletim da Liderança.', esc(err.message || ''));
    });
  }

  window.HUB_SECTIONS = window.HUB_SECTIONS || {};
  window.HUB_SECTIONS.renderBoletim = renderBoletim;

  // Usado pelo Dashboard: a mesma matriz "Todas as operações" desta tela (mês
  // selecionado aqui, ou o mês anterior ao atual) e abrir o boletim de uma
  // operação ao clicar na linha. Os dados precisam estar carregados
  // (HUB_BOLETIM.carregar()) — o Dashboard cuida disso.
  window.HUB_BOLETIM_UI = {
    resumoHtml() {
      if (!state.mes) state.mes = M.mesAnterior(U.todayISO().slice(0, 7));
      return STYLE + visaoGeral(M.boletim(state.mes));
    },
    // Para quem não tem o módulo: linhas de boletim_resumo_publicado().
    resumoPublicadoHtml(linhas) {
      const html = resumoPublicado(linhas || []);
      return html ? STYLE + html : '';
    },
    abrir(op) {
      state.op = op || 'geral';
      state.aba = 'indicadores';
      if (window.HUB_GOTO_SECTION) HUB_GOTO_SECTION('ind-boletim');
    }
  };
})();
