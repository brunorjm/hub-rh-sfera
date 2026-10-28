// Componentes visuais compartilhados por TODAS as telas de indicadores do
// hub — tanto o módulo Indicadores (metrics-indicadores.js) quanto o
// indicador ao vivo de Recrutamento (metrics-recrutamento.js) montam seus
// cards/gráficos com as mesmas funções daqui, pra manter uma identidade
// visual única em vez de dois estilos diferentes dentro do mesmo hub.
(function () {
  const U = HUB_UTILS;
  const CHARTS = {};
  if (window.ChartDataLabels) Chart.register(ChartDataLabels);

  function chart(canvasId, config) {
    const el = document.getElementById(canvasId);
    if (!el) return null;
    if (CHARTS[canvasId]) { CHARTS[canvasId].destroy(); delete CHARTS[canvasId]; }
    config.options = config.options || {};
    config.options.maintainAspectRatio = false;
    const c = new Chart(el.getContext('2d'), config);
    CHARTS[canvasId] = c;
    return c;
  }
  window.HUB_CHART = chart;

  function kpi(label, value, sub, colorVar) {
    return `<div class="kpi" style="--bar:${colorVar || 'var(--p1)'}">
      <div class="lbl">${label}</div><div class="val">${value}</div>
      ${sub ? `<div class="sub">${sub}</div>` : ''}
    </div>`;
  }

  // Ícones de linha (estilo Lucide), monocromáticos — seguem a cor do texto
  // via currentColor. As telas continuam chamando card() com a entidade do
  // emoji antigo ('&#128200;' etc.); ela é traduzida aqui pro ícone SVG.
  // HUB_ICON aceita tanto o nome do ícone quanto essa entidade.
  const SVG = {
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    building: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
    user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    userCheck: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    briefcase: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
    trendUp: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    trendDown: '<path d="m22 17-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/>',
    barChart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    clipboard: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98"/><path d="m15.41 6.51-6.82 3.98"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    funnel: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01"/><path d="M15 9h.01"/>',
    siren: '<path d="M7 18v-6a5 5 0 1 1 10 0v6"/><path d="M5 21a1 1 0 0 1-1-1v-1a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1z"/><path d="M21 12h1"/><path d="M18.5 4.5 18 5"/><path d="M2 12h1"/><path d="M12 2v1"/><path d="m4.93 4.93.71.71"/>',
    ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
    handshake: '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/>',
    sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.29 1.29L3 12l5.8 1.9a2 2 0 0 1 1.29 1.29L12 21l1.9-5.8a2 2 0 0 1 1.29-1.29L21 12l-5.8-1.9a2 2 0 0 1-1.29-1.29Z"/>',
    lightbulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
    hourglass: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22"/><path d="M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    scale: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    xCircle: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
    thermometer: '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>',
    cake: '<path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/><path d="M2 21h20"/><path d="M7 8v3"/><path d="M12 8v3"/><path d="M17 8v3"/><path d="M7 4h.01"/><path d="M12 4h.01"/><path d="M17 4h.01"/>',
    cap: '<path d="M22 10v6"/><path d="M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="M15.48 12.89 17 22l-5-3-5 3 1.52-9.11"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    card: '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    party: '<path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/><path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11-.11.7-.72 1.22-1.43 1.22H17"/><path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7"/><path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z"/>',
    filePen: '<path d="M12.5 22H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v9.5"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M13.38 15.62a1 1 0 0 0-3-3L5 18v3h3Z"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
    userMinus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 11h-6"/>',
    thumbsUp: '<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  };
  const EMOJI_ICON = {
    '&#127942;': 'trophy', '&#127970;': 'building', '&#128100;': 'user', '&#128101;': 'users',
    '&#128104;&#8205;&#128188;': 'userCheck', '&#128172;': 'message', '&#128188;': 'briefcase',
    '&#128194;': 'folder', '&#128197;': 'calendar', '&#128200;': 'trendUp', '&#128202;': 'barChart',
    '&#128203;': 'clipboard', '&#128205;': 'pin', '&#128218;': 'book', '&#128225;': 'share',
    '&#128260;': 'refresh', '&#128268;': 'funnel', '&#128269;': 'search', '&#128522;': 'smile',
    '&#128680;': 'siren', '&#128683;': 'ban', '&#128721;': 'trendDown', '&#129309;': 'handshake',
    '&#129498;': 'sparkles', '&#129504;': 'lightbulb', '&#8987;': 'hourglass', '&#9203;': 'hourglass',
    '&#9200;': 'clock', '&#9878;&#65039;': 'scale', '&#9888;&#65039;': 'alert', '&#9889;': 'zap',
    '&#9989;': 'checkCircle', '&#10003;&#65039;': 'check', '&#10060;': 'xCircle',
    '&#127777;&#65039;': 'thermometer', '&#127874;': 'cake', '&#127891;': 'cap', '&#127894;': 'award',
    '&#127919;': 'target', '&#127939;': 'activity', '&#128176;': 'bag', '&#128179;': 'card',
    '&#128279;': 'link', '&#127760;': 'globe', '&#127881;': 'party', '&#128221;': 'filePen',
    '&#128272;': 'lock', '&#9881;&#65039;': 'settings',
    '&#128682;': 'userMinus', '&#128077;': 'thumbsUp',
  };
  function icon(name) {
    const p = SVG[name] || SVG[EMOJI_ICON[name]];
    return p ? `<svg class="lic" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>` : '';
  }
  window.HUB_ICON = icon;

  function empty(msg, sub) {
    return `<div class="empty"><span class="ic">${icon('clipboard')}</span><p>${msg}</p>${sub ? `<p class="sub">${sub}</p>` : ''}</div>`;
  }

  function card(title, ic, bodyHtml, opts) {
    opts = opts || {};
    const svg = icon(ic);
    return `<div class="card${opts.full ? ' full' : ''}"><h3>${svg ? `<span class="card-ic">${svg}</span>` : ''}${title}</h3>${bodyHtml}</div>`;
  }

  // Insights / plano de ação / alertas analíticos: só perfis RH e Administrador.
  // (Só esconde o bloco na tela — o acesso aos dados em si é controlado pela RLS do banco.)
  function canSeeInsights() {
    const u = window.HUB_USER;
    return !!u && (u.perfil === 'admin' || u.perfil === 'rh');
  }

  function insightsCard(title, icon, bodyHtml, opts) {
    return canSeeInsights() ? card(title, icon, bodyHtml, opts) : '';
  }

  function insightsList(insights) {
    const icons = { alerta: 'alert', acao: 'lightbulb', info: 'info' };
    if (!insights || !insights.length) return '';
    return insights.map(i => `<div class="insight ${i.tipo}"><span class="ic">${icon(icons[i.tipo] || icons.info)}</span><span>${U.escapeHtml(i.texto)}</span></div>`).join('');
  }

  // needed: nomes de tabelas (em `source`, padrão window.HUB_DATA) que
  // precisam ter pelo menos 1 linha pra essa tela fazer sentido. canManage:
  // se o usuário pode importar/gerar esses dados (controla a dica exibida no
  // estado vazio). source: de onde ler os dados — o indicador ao vivo de
  // Recrutamento passa HUB_RECRUIT_DATA aqui, já que suas tabelas
  // (vagas/candidatos/entrevistas) não vivem em HUB_DATA.
  function noDataGate(el, needed, canManage, manageHint, source) {
    const data = source || window.HUB_DATA || {};
    const any = Object.values(data).some(arr => arr && arr.length);
    if (!any) {
      el.innerHTML = empty('Nenhum dado carregado ainda.', canManage ? (manageHint || 'Vá em Administração para importar os dados.') : 'Peça para um administrador importar os dados.');
      return true;
    }
    if (needed && !needed.some(t => (data[t] || []).length)) {
      el.innerHTML = empty('Sem dados para esta tela ainda.', canManage ? (manageHint || 'Importe os dados correspondentes em Administração.') : 'Peça para um administrador importar os dados correspondentes.');
      return true;
    }
    return false;
  }

  const DL_COLOR = '#16181D';

  function barChart(id, labels, values, opts) {
    opts = opts || {};
    const cfg = {
      type: 'bar',
      data: { labels, datasets: [{ data: values, backgroundColor: opts.colors || labels.map((_, i) => opts.singleColor || U.color(i)), borderRadius: 5, maxBarThickness: 34 }] },
      options: {
        indexAxis: opts.horizontal ? 'y' : 'x',
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true },
          datalabels: {
            color: DL_COLOR, font: { size: 10, weight: '700' },
            anchor: 'end', align: opts.horizontal ? 'end' : 'top',
            formatter: opts.pct ? v => U.fmtPct(v, 0) : v => U.fmtInt(v)
          }
        },
        // Nunca passar `ticks: undefined` explicitamente — o Chart.js não
        // ignora essa chave como ignora `max: undefined`, e isso apaga o
        // callback padrão que faz o eixo de categoria mostrar o texto do
        // rótulo em vez do índice numérico da barra.
        scales: {
          x: Object.assign({ grid: { display: opts.horizontal } }, opts.pct && opts.horizontal ? { max: 1, ticks: { callback: v => U.fmtPct(v, 0) } } : {}),
          y: Object.assign({ grid: { display: !opts.horizontal } }, opts.pct && !opts.horizontal ? { max: 1, ticks: { callback: v => U.fmtPct(v, 0) } } : {})
        }
      }
    };
    // O rótulo de valor fica do lado de fora da ponta da barra — na maior
    // barra (que encosta no fim do eixo) ele sai da área do gráfico e o canvas
    // corta o texto (ex.: "100%" virava "10"; a barra de maior contagem ficava
    // sem número). Reserva um respiro no lado em que o rótulo estica, em todo
    // gráfico de barras, não só nos de %.
    cfg.options.layout = { padding: opts.horizontal ? { right: 40 } : { top: 22 } };
    if (opts.onClick) {
      // setTimeout: o clique costuma redesenhar a tela (e destruir este gráfico); fazer isso
      // ainda dentro do evento do Chart.js quebra o resto do tratamento do clique.
      cfg.options.onClick = (evt, els) => { if (els.length) { const v = labels[els[0].index]; setTimeout(() => opts.onClick(v), 0); } };
      cfg.options.onHover = (evt, els) => { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; };
    }
    return HUB_CHART(id, cfg);
  }

  // opts.onClick(índice do ponto) e opts.pointColors (cor por ponto) são
  // opcionais — usados no Dashboard para filtrar pelo mês clicado.
  function lineChart(id, labels, series, opts) {
    opts = opts || {};
    const cfg = {
      type: 'line',
      data: { labels, datasets: series.map((s, i) => Object.assign(
        { label: s.label, data: s.data, borderColor: U.color(i), backgroundColor: U.color(i) + '33', tension: .3, fill: series.length === 1, pointRadius: 3 },
        opts.onClick ? { pointRadius: 5, pointHoverRadius: 7 } : {},
        opts.pointColors ? { pointBackgroundColor: opts.pointColors, pointBorderColor: opts.pointColors } : {}
      )) },
      options: {
        // respiro para o rótulo acima do ponto mais alto (e nas pontas) não ser cortado
        layout: { padding: { top: 20, left: 8, right: 12 } },
        plugins: {
          legend: { display: series.length > 1 },
          datalabels: {
            color: DL_COLOR, font: { size: 9, weight: '700' }, align: 'top', offset: 4,
            formatter: v => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
          }
        }
      }
    };
    if (opts.onClick) {
      // Clicar em qualquer ponto da coluna do mês (não só exatamente no ponto).
      cfg.options.interaction = { mode: 'index', intersect: false };
      cfg.options.onClick = (evt, els) => { if (els.length) { const i = els[0].index; setTimeout(() => opts.onClick(i), 0); } };
      cfg.options.onHover = (evt, els) => { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; };
    }
    HUB_CHART(id, cfg);
  }

  // Barras (quantidade) + linha (outra escala, eixo da direita).
  function comboChart(id, labels, barras, linha) {
    const fmt = (v, f) => (v == null ? '' : f(v));
    HUB_CHART(id, {
      type: 'bar',
      data: {
        labels, datasets: [
          { type: 'bar', label: barras.label, data: barras.data, backgroundColor: U.color(0), borderRadius: 5, maxBarThickness: 34, yAxisID: 'y', order: 2,
            datalabels: { anchor: 'end', align: 'top', formatter: v => fmt(v, barras.fmt || U.fmtInt) } },
          { type: 'line', label: linha.label, data: linha.data, borderColor: U.color(2), backgroundColor: U.color(2), tension: 0.3, pointRadius: 3, yAxisID: 'y1', order: 1,
            datalabels: { display: linha.rotulos !== false, align: 'top', offset: 6, backgroundColor: 'rgba(255,255,255,.9)', borderRadius: 3, padding: { top: 1, bottom: 1, left: 3, right: 3 }, color: U.color(2), formatter: v => fmt(v, linha.fmt || U.fmtInt) } }
        ]
      },
      options: {
        layout: { padding: { top: 22 } },
        // Passar o mouse em qualquer ponto do mês mostra as duas séries.
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: true }, datalabels: { color: '#16181D', font: { size: 9, weight: '700' } } },
        scales: { y: { beginAtZero: true }, y1: { beginAtZero: true, position: 'right', grid: { display: false } } }
      }
    });
  }


  function doughnutChart(id, labels, values) {
    const total = values.reduce((s, v) => s + v, 0) || 1;
    HUB_CHART(id, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: labels.map((_, i) => U.color(i)) }] },
      options: {
        plugins: {
          legend: { display: true, position: 'right', labels: { boxWidth: 11, font: { size: 11 } } },
          datalabels: {
            color: '#fff', font: { size: 10, weight: '700' },
            formatter: v => v ? U.fmtPct(v / total, 0) : ''
          }
        }
      }
    });
  }

  function topRows(list, valueLabel) {
    if (!list.length) return empty('Sem registros.');
    return `<div class="table-wrap"><table class="dt"><thead><tr><th>Nome</th><th>${valueLabel}</th></tr></thead><tbody>` +
      list.slice(0, 15).map(r => `<tr><td>${U.escapeHtml(r.label)}</td><td>${U.fmtInt(r.value)}</td></tr>`).join('') +
      '</tbody></table></div>';
  }

  function rankingTable(list, firstColLabel) {
    if (!list.length) return empty('Sem registros.');
    // Quando os itens trazem cargo/departamento (Top 10 colaboradores), essas
    // colunas extras entram entre o nome e as métricas de conclusão.
    const temContexto = list.some(r => r.cargo || r.departamento);
    const colunasExtra = temContexto ? '<th>Cargo</th><th>Departamento</th>' : '';
    // Tabela "fit": textos quebram linha e o card cresce com as linhas —
    // sem rolagem lateral nem vertical.
    return `<div class="table-wrap fit"><table class="dt fit"><thead><tr><th>${firstColLabel}</th>${colunasExtra}<th>Taxa de conclusão</th><th>Progresso médio</th><th>Inscrições</th></tr></thead><tbody>` +
      list.map(r => `<tr><td>${U.escapeHtml(r.label)}</td>${temContexto ? `<td>${U.escapeHtml(r.cargo || '')}</td><td>${U.escapeHtml(r.departamento || '')}</td>` : ''}<td>${U.fmtPct(r.taxaConclusao)}</td><td>${U.fmtPct(r.progressoMedio)}</td><td>${U.fmtInt(r.total)}</td></tr>`).join('') +
      '</tbody></table></div>';
  }

  window.HUB_UI = { kpi, empty, card, insightsCard, canSeeInsights, insightsList, noDataGate, barChart, lineChart, comboChart, doughnutChart, topRows, rankingTable };
})();
