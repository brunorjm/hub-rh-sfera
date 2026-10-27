// Indicadores → Pesquisa de Clima: resultados, análises e comentários da
// pesquisa de clima (dados importados uma única vez no Supabase; carregados sob demanda — ver dal-pesquisa-clima.js).
// Usa a MESMA barra de filtros do topo (Data, Unidade, Departamento, Gestor)
// e os componentes visuais de ui-charts.js. Pesquisa anônima: recortes com
// menos de MIN_RESPONDENTES não exibem resultado (hoje 1 = sem bloqueio; ver metrics-pesquisa-clima.js).
(function () {
  const U = HUB_UTILS;
  const M = HUB_METRICS_PESQUISA_CLIMA;
  const { kpi, empty, card, insightsList, barChart, doughnutChart } = HUB_UI;
  const esc = U.escapeHtml;

  const TABS = [
    { key: 'geral', label: 'Visão geral' },
    { key: 'dimensoes', label: 'Dimensões e perguntas' },
    { key: 'segmentos', label: 'Segmentação' },
    { key: 'comentarios', label: 'Comentários' }
  ];
  const state = { tab: 'geral', dim: '', unidade: '', sent: '', busca: '', longos: true, limite: 40 };

  const STYLE = `<style>
    .pc-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;border-bottom:1px solid var(--border)}
    .pc-tab{padding:9px 16px;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;border:none;background:none;border-bottom:3px solid transparent;font-family:inherit}
    .pc-tab:hover{color:var(--text)}
    .pc-tab.active{color:var(--p1);border-bottom-color:var(--p1)}
    .pc-bar{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px}
    .pc-bar label{display:flex;flex-direction:column;gap:4px;font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px}
    .pc-bar select,.pc-bar input[type=search]{padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:12.5px;font-family:inherit;color:var(--text);background:#fff;min-width:150px}
    .pc-bar .chk{flex-direction:row;align-items:center;gap:6px;text-transform:none;font-size:12px;font-weight:500;color:var(--text2);letter-spacing:0;padding-bottom:8px}
    .pc-cm{padding:12px 14px;border:1px solid var(--border);border-left:4px solid var(--border);border-radius:10px;margin-bottom:9px;background:#fff;font-size:13px;line-height:1.5}
    .pc-cm.favoravel{border-left-color:#1baf7a}.pc-cm.desfavoravel{border-left-color:var(--critical)}.pc-cm.neutro{border-left-color:#e0a100}
    .pc-cm .meta{font-size:10.5px;color:var(--muted);margin-bottom:4px;font-weight:600}
    .pc-stack{display:flex;height:22px;border-radius:6px;overflow:hidden;min-width:200px;background:var(--bg)}
    .pc-stack i{display:flex;align-items:center;justify-content:center;height:100%;font-style:normal;font-size:10.5px;font-weight:700;color:#fff;white-space:nowrap}
    .pc-note{font-size:11px;color:var(--muted);margin-top:8px}
    .pc-duo{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;margin-bottom:18px}
    @media (max-width:900px){.pc-duo{grid-template-columns:minmax(0,1fr)}}
  </style>`;

  const pct = v => (v === null || v === undefined) ? '—' : U.fmtPct(v, 0);
  const npsTxt = v => (v === null || v === undefined) ? '—' : String(v);

  // Barra empilhada Favorável / Neutro / Desfavorável com o % escrito em cada
  // faixa (some quando a faixa é estreita demais — o valor segue no tooltip).
  function stackBar(l, rot) {
    if (!l || l.pctFav === null || l.pctFav === undefined) return '—';
    rot = rot || ['Favorável', 'Neutro', 'Desfavorável'];
    const seg = (v, cor) => `<i style="width:${v * 100}%;background:${cor}">${v >= 0.07 ? U.fmtPct(v, 0) : ''}</i>`;
    return `<div class="pc-stack" title="${rot[0]} ${pct(l.pctFav)} · ${rot[1]} ${pct(l.pctNeutro)} · ${rot[2]} ${pct(l.pctDesf)}">${seg(l.pctFav, '#1baf7a')}${seg(l.pctNeutro, '#e0a100')}${seg(l.pctDesf, 'var(--critical)')}</div>`;
  }

  function npsScale(np) {
    if (!np || !np.total) return '';
    const segs = [
      { key: 'detrator', label: 'Detratores (0-6)', pct: np.pctDetratores, n: np.detratores },
      { key: 'neutro', label: 'Neutros (7-8)', pct: np.pctNeutros, n: np.neutros },
      { key: 'promotor', label: 'Promotores (9-10)', pct: np.pctPromotores, n: np.promotores }
    ];
    return `<div class="nps-scale">` + segs.map(s =>
      `<div class="nps-seg ${s.key}" style="width:${Math.max(s.pct * 100, s.n ? 4 : 0)}%"><span class="n">${U.fmtPct(s.pct, 0)}</span><span class="lbl">${s.label} · ${U.fmtInt(s.n)}</span></div>`
    ).join('') + `</div>`;
  }

  function ocultosNote(q) {
    return q.ocultos ? `<p class="pc-note">${q.ocultos} grupo(s) com menos de ${M.MIN_RESPONDENTES} respostas não são exibidos para preservar o anonimato.</p>` : '';
  }

  // Tabela de participação: HC, respondentes, faltam, % (com barra) e linha de total.
  function partTable(p, first, mostraUnidade) {
    if (!p.itens.length) return empty('Sem dados.');
    const bar = v => v === null ? '—' : `<div style="display:flex;align-items:center;gap:8px"><div style="flex:1;min-width:70px;height:8px;border-radius:4px;background:var(--bg);overflow:hidden"><div style="width:${v * 100}%;height:100%;background:${v >= .7 ? '#1baf7a' : v >= .5 ? '#e0a100' : 'var(--critical)'}"></div></div><span style="font-size:11px;min-width:42px;text-align:right">${U.fmtPct(v, 1)}</span></div>`;
    const tr = x => `<tr><td>${esc(x.label)}</td>${mostraUnidade ? `<td style="color:var(--muted)">${esc(x.unidade || '')}</td>` : ''}<td>${U.fmtInt(x.hc)}</td><td>${U.fmtInt(x.resp)}</td><td>${U.fmtInt(x.faltam)}</td><td>${bar(x.pct)}</td></tr>`;
    const t = p.total;
    return `<div class="table-wrap"><table class="dt"><thead><tr><th>${first}</th>${mostraUnidade ? '<th>Unidade</th>' : ''}<th>HC</th><th>Resp.</th><th>Faltam</th><th>Participação</th></tr></thead><tbody>${p.itens.map(tr).join('')}<tr style="font-weight:700;background:#F7F9FC"><td colspan="${mostraUnidade ? 2 : 1}">Total — ${p.itens.length} ${mostraUnidade ? 'departamentos' : 'unidades'}</td><td>${U.fmtInt(t.hc)}</td><td>${U.fmtInt(t.resp)}</td><td>${U.fmtInt(t.faltam)}</td><td>${bar(t.pct)}</td></tr></tbody></table></div><p class="pc-note">HC = headcount da época da pesquisa (${U.fmtInt(t.hc)} pessoas). Faltam = HC − respondentes.</p>`;
  }

  // ---- Aba: Visão geral ------------------------------------------------
  function tabGeral(d) {
    const partSub = d.hcTotal ? `${U.fmtInt(d.n)} respondentes / ${U.fmtInt(d.hcTotal)} participantes` : `${U.fmtInt(d.n)} respondentes`;
    const gptwDims = d.dimensoes.filter(x => x.grupo === 'gptw');
    const partHtml = partTable(d.partUnidade, 'Unidade', false);
    return `
      <div class="kpi-grid">
        ${kpi('Participação', d.participacao !== null ? pct(d.participacao) : U.fmtInt(d.n), partSub, 'var(--p1)')}
        ${kpi('Índice GPTW (favorável)', pct(d.gptw.pctFav), 'média ' + (d.gptw.media === null ? '—' : U.fmt1(d.gptw.media)) + ' de 5', '#1baf7a')}
        ${kpi('NR-1 (favorável)', pct(d.nr1.pctFav), 'riscos psicossociais', '#8b5cf6')}
        ${kpi('eNPS Empresa', npsTxt(d.npsEmpresa.nps), U.fmtInt(d.npsEmpresa.total) + ' resposta(s)', '#e0a100')}
        ${kpi('Comentários', U.fmtInt(d.comentarios.length), 'respostas abertas', '#e87ba4')}
      </div>
      ${npsScale(d.npsEmpresa)}
      <div class="insight info" style="margin-bottom:18px">
        <span class="ic">&#8505;&#65039;</span>
        <span><strong>Como calculamos o eNPS:</strong> cada resposta de 0 a 10 ("o quanto você recomendaria a empresa como um ótimo lugar para trabalhar?") entra num de três grupos — Detratores (0 a 6), Neutros (7 a 8) e Promotores (9 a 10). eNPS = ((nº de Promotores − nº de Detratores) ÷ total de respostas) × 100. Varia de -100 a +100; Neutros contam no total mas não entram na conta.</span>
      </div>
      ${d.insights.length && HUB_UI.canSeeInsights() ? `<div class="card full" style="margin-bottom:16px"><h3><span>&#128161;</span>Leituras rápidas</h3>${insightsList(d.insights)}</div>` : ''}
      <div class="pc-duo">
        ${card('Participação por unidade', '&#127970;', partHtml)}
        ${card('eNPS por tema', '&#128172;', '<div class="chart-h"><canvas id="c-pc-nps"></canvas></div>')}
        <div class="card full"><h3><span>&#127942;</span>% favorável por dimensão GPTW</h3><div class="chart-h"><canvas id="c-pc-gptw"></canvas></div></div>
      </div>`;
  }

  function drawGeral(d) {
    const g = d.dimensoes.filter(x => x.grupo === 'gptw' && x.likert.pctFav !== null).sort((a, b) => b.likert.pctFav - a.likert.pctFav);
    if (g.length) barChart('c-pc-gptw', g.map(x => x.label), g.map(x => x.likert.pctFav), { horizontal: true, pct: true });
    const n = d.npsDimensoes.filter(x => x.nps.nps !== null);
    if (n.length) barChart('c-pc-nps', n.map(x => x.label), n.map(x => x.nps.nps), { horizontal: true });
  }

  // ---- Aba: Dimensões e perguntas --------------------------------------
  function perguntasTable(list) {
    if (!list.length) return empty('Sem dados.');
    return `<div class="table-wrap"><table class="dt"><thead><tr><th>Pergunta</th><th>Dimensão</th><th>Favorável · Neutro · Desfavorável</th></tr></thead><tbody>${list.map(p =>
      `<tr><td style="white-space:normal;min-width:260px">${esc(p.pergunta)}${p.invertida ? ' <span class="badge b4" title="Afirmação negativa: resultado invertido">invertida</span>' : ''}</td><td>${esc(p.dimLabel)}</td><td>${stackBar(p)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function tabDimensoes(d) {
    const likert = d.dimensoes.filter(x => x.grupo !== 'nps');
    const dimTable = `<div class="table-wrap"><table class="dt"><thead><tr><th>Dimensão</th><th>Média (1-5)</th><th>Favorável · Neutro · Desfavorável</th></tr></thead><tbody>${likert.map(x =>
      `<tr><td>${esc(x.label)}</td><td>${x.likert.media === null ? '—' : U.fmt1(x.likert.media)}</td><td>${stackBar(x.likert)}</td></tr>`).join('')}</tbody></table></div>
      <p class="pc-note"><span style="color:#1baf7a">■</span> Favorável (4-5) &nbsp;<span style="color:#e0a100">■</span> Neutro (3) &nbsp;<span style="color:var(--critical)">■</span> Desfavorável (1-2)</p>`;
    const npsTable = `<div class="table-wrap"><table class="dt"><thead><tr><th>Tema</th><th>eNPS</th><th>Média (0-10)</th><th>Promotores · Neutros · Detratores</th></tr></thead><tbody>${d.npsDimensoes.map(x =>
      `<tr><td>${esc(x.label)}</td><td><strong>${npsTxt(x.nps.nps)}</strong></td><td>${x.nps.media === null ? '—' : U.fmt1(x.nps.media)}</td><td>${stackBar({ pctFav: x.nps.total ? x.nps.pctPromotores : null, pctNeutro: x.nps.pctNeutros, pctDesf: x.nps.pctDetratores }, ['Promotores', 'Neutros', 'Detratores'])}</td></tr>`).join('')}</tbody></table></div>
      <p class="pc-note"><span style="color:#1baf7a">■</span> Promotores (9-10) &nbsp;<span style="color:#e0a100">■</span> Neutros (7-8) &nbsp;<span style="color:var(--critical)">■</span> Detratores (0-6)</p>`;
    return `
      <div class="grid2">
        ${card('Dimensões GPTW e NR-1', '&#128202;', dimTable)}
        ${card('Temas NPS (0 a 10)', '&#128172;', npsTable)}
        ${card('Pontos fortes — 5 perguntas mais bem avaliadas', '&#128077;', perguntasTable(d.melhores))}
        ${card('Oportunidades — 5 perguntas menos bem avaliadas', '&#127919;', perguntasTable(d.piores))}
        <div class="card full"><h3><span>&#128203;</span>Todas as perguntas (da mais para a menos favorável)</h3>${perguntasTable(d.perguntas)}</div>
      </div>`;
  }

  // ---- Aba: Segmentação -------------------------------------------------
  function quebraTable(q, first) {
    if (!q.itens.length) return empty('Nenhum grupo com respostas suficientes.') + ocultosNote(q);
    return `<div class="table-wrap"><table class="dt"><thead><tr><th>${first}</th><th>Respondentes</th><th>GPTW favorável</th><th>NR-1 favorável</th><th>eNPS empresa</th><th>eNPS gestor</th></tr></thead><tbody>${q.itens.map(x =>
      `<tr><td>${esc(x.label)}</td><td>${U.fmtInt(x.n)}</td><td><strong>${pct(x.gptw)}</strong></td><td>${pct(x.nr1)}</td><td>${npsTxt(x.npsEmpresa)}</td><td>${npsTxt(x.npsGestor)}</td></tr>`).join('')}</tbody></table></div>` + ocultosNote(q);
  }

  function tabSegmentos(d) {
    return `
      <div class="grid2">
        ${card('Por unidade', '&#127970;', quebraTable(d.porUnidade, 'Unidade'))}
        ${card('Líderes × liderados', '&#128101;', quebraTable(d.porPosicao, 'Posição'))}
        ${card('Por tempo de empresa', '&#8987;', quebraTable(d.porTempo, 'Tempo de empresa'))}
        ${card('Por departamento', '&#128194;', quebraTable(d.porDepartamento, 'Departamento'))}
        <div class="card full"><h3><span>&#128203;</span>Participação por departamento</h3>${partTable(d.partDepto, 'Departamento', true)}</div>
        <div class="card full"><h3><span>&#129489;&#8205;&#128188;</span>Por líder direto</h3>${quebraTable(d.porLider, 'Líder')}</div>
      </div>`;
  }

  // ---- Aba: Comentários --------------------------------------------------
  function comentariosFiltrados(d) {
    const q = U.normalizeText(state.busca);
    return d.comentarios.filter(c => {
      if (state.dim && c.dimensao !== state.dim) return false;
      if (state.unidade && c.unidade !== state.unidade) return false;
      if (state.sent && c.sentimento !== state.sent) return false;
      if (state.longos && c.texto.length < 25) return false;
      if (q && !U.normalizeText(c.texto).includes(q)) return false;
      return true;
    });
  }

  function comentariosLista(d) {
    const list = comentariosFiltrados(d);
    if (!list.length) return empty('Nenhum comentário com esses filtros.');
    const rot = { favoravel: 'Favorável', neutro: 'Neutro', desfavoravel: 'Desfavorável' };
    const shown = list.slice(0, state.limite);
    return `<p class="pc-note" style="margin:0 0 10px">${U.fmtInt(list.length)} comentário(s)</p>` +
      shown.map(c => `<div class="pc-cm ${c.sentimento}">
        <div class="meta">${esc(c.dimLabel)} · ${esc(c.unidade || 'Não informada')} · Nota ${c.nota} (${rot[c.sentimento]})</div>
        ${esc(c.texto)}
        <div class="meta" style="margin:6px 0 0;font-weight:400">${esc(c.pergunta || '')}</div>
      </div>`).join('') +
      (list.length > shown.length ? `<button class="btn btn-outline btn-sm" id="pc-more">Mostrar mais (${U.fmtInt(list.length - shown.length)} restantes)</button>` : '');
  }

  function tabComentarios(d) {
    const dims = Array.from(new Set(d.comentarios.map(c => c.dimensao)));
    const unidades = Array.from(new Set(d.comentarios.map(c => c.unidade).filter(Boolean))).sort();
    const opt = (v, l, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`;
    return `
      <div class="card full">
        <h3><span>&#128172;</span>Comentários da pesquisa</h3>
        <div class="pc-bar">
          <label>Dimensão<select id="pc-f-dim">${opt('', 'Todas', state.dim)}${dims.map(k => opt(k, M.DIMENSOES.find(x => x.key === k)?.label || k, state.dim)).join('')}</select></label>
          <label>Unidade<select id="pc-f-unidade">${opt('', 'Todas', state.unidade)}${unidades.map(u => opt(u, u, state.unidade)).join('')}</select></label>
          <label>Tom<select id="pc-f-sent">${opt('', 'Todos', state.sent)}${opt('favoravel', 'Favorável', state.sent)}${opt('neutro', 'Neutro', state.sent)}${opt('desfavoravel', 'Desfavorável', state.sent)}</select></label>
          <label>Buscar<input type="search" id="pc-f-busca" placeholder="palavra ou trecho" value="${esc(state.busca)}"></label>
          <label class="chk"><input type="checkbox" id="pc-f-longos"${state.longos ? ' checked' : ''}> Ocultar respostas muito curtas ("Sim", "Concordo")</label>
        </div>
        <div id="pc-lista">${comentariosLista(d)}</div>
        <p class="pc-note">Para preservar o anonimato, os comentários não exibem líder, departamento nem tempo de empresa.</p>
      </div>`;
  }

  function wireComentarios(d) {
    const refresh = () => {
      state.limite = 40;
      document.getElementById('pc-lista').innerHTML = comentariosLista(d);
      wireMore(d);
    };
    const bind = (id, key, ev) => document.getElementById(id).addEventListener(ev || 'change', e => { state[key] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; refresh(); });
    bind('pc-f-dim', 'dim'); bind('pc-f-unidade', 'unidade'); bind('pc-f-sent', 'sent');
    bind('pc-f-longos', 'longos'); bind('pc-f-busca', 'busca', 'input');
    wireMore(d);
  }

  function wireMore(d) {
    const btn = document.getElementById('pc-more');
    if (btn) btn.addEventListener('click', () => {
      state.limite += 40;
      document.getElementById('pc-lista').innerHTML = comentariosLista(d);
      wireMore(d);
    });
  }

  // ---- Render -------------------------------------------------------------
  function renderConteudo(el, f) {
    const d = M.pesquisaClimaMetrics(f);
    if (!d.temDados) {
      el.innerHTML = empty('Nenhum resultado da Pesquisa de Clima carregado ainda.',
        'Rode a importação única (importacao-pesquisa-clima/, partes 1 a 4) no Supabase e clique em Atualizar dados.');
      return;
    }
    let body;
    if (d.vazio) body = empty('Nenhuma resposta no recorte selecionado.', 'Ajuste as datas, a unidade, o departamento ou o gestor na barra de filtros.');
    else if (d.bloqueado) body = empty(`Recorte com apenas ${d.n} resposta(s).`, `Para preservar o anonimato, resultados só são exibidos com pelo menos ${d.minimo} respondentes. Amplie o filtro.`);

    el.innerHTML = STYLE + `<div class="pc-tabs">${TABS.map(t => `<button class="pc-tab${t.key === state.tab ? ' active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}</div>` +
      `<div id="pc-body">${body || ({ geral: tabGeral, dimensoes: tabDimensoes, segmentos: tabSegmentos, comentarios: tabComentarios }[state.tab])(d)}</div>`;

    el.querySelectorAll('.pc-tab').forEach(b => b.addEventListener('click', () => { state.tab = b.dataset.tab; renderConteudo(el, f); }));
    if (body) return;
    if (state.tab === 'geral') drawGeral(d);
    if (state.tab === 'comentarios') wireComentarios(d);
  }

  window.HUB_SECTIONS = window.HUB_SECTIONS || {};
  // Os dados (~22 mil respostas) só são buscados na primeira abertura da tela na
  // sessão; depois disso ficam em cache e a tela abre na hora.
  function renderPesquisaClima(el, f) {
    if (HUB_PESQUISA_CLIMA.jaCarregado()) return renderConteudo(el, f);
    el.innerHTML = empty('Carregando resultados da Pesquisa de Clima...');
    HUB_PESQUISA_CLIMA.carregar().then(() => {
      if (window.HUB_REFRESH_FILTER_OPTIONS) window.HUB_REFRESH_FILTER_OPTIONS();
      if (window.HUB_RENDER_CURRENT) window.HUB_RENDER_CURRENT();
    }).catch(err => {
      const semTabela = /schema cache|does not exist|not find/i.test(err.message || '');
      el.innerHTML = empty('Não consegui carregar a Pesquisa de Clima.',
        semTabela ? 'As tabelas ainda não existem no Supabase (rode supabase-pesquisa-clima.sql e a importação).' : (err.message || ''));
    });
  }

  window.HUB_SECTIONS.renderPesquisaClima = renderPesquisaClima;
})();
