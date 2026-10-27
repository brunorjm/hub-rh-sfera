// Indicadores → Pesquisa de Satisfação (com o Suporte do Escritório).
// Gestores avaliam todo mês cada área do Escritório: nota de 0 a 10, "O que
// melhorar?" e comentário. DADOS SIGILOSOS: cada pessoa vê só as áreas liberadas
// no perfil (Cadastro de Acessos) e, sem a visão completa, só o total da área —
// nunca a loja/operação de quem respondeu. Regras no banco: supabase-satisfacao.sql;
// cálculos: metrics-satisfacao.js; dados: dal-satisfacao.js.
(function () {
  const U = HUB_UTILS;
  const M = HUB_METRICS_SATISFACAO;
  const { kpi, empty, card } = HUB_UI;
  const esc = U.escapeHtml;

  // simular: recalcula tudo sem as avaliações sinalizadas para conferência (nada é apagado).
  const state = { ciclo: '', area: '', janela: 12, busca: '', ordem: 'menor', todos: false, simular: false, soTriados: false };
  // Ciclos do histórico de cada loja no card "Onde está a insatisfação".
  const CICLOS_HISTORICO_LOJA = 6;
  // Mudança no número de respondentes a partir da qual a variação pede cuidado.
  const ALERTA_RESPONDENTES = 0.2;

  const STYLE = `<style>
    .sf-top{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px}
    .sf-top label{display:flex;flex-direction:column;gap:4px;font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px}
    .sf-top select,.sf-ctl select,.sf-ctl input[type=search]{padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:12.5px;font-family:inherit;color:var(--text);background:#fff;min-width:170px}
    .sf-sigilo{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:#7a3e00;background:#FFF4E0;border:1px solid #F5D9A8;border-radius:8px;padding:7px 10px;margin-bottom:2px}
    .sf-sigilo svg{width:15px;height:15px;flex:none;stroke:currentColor;fill:none;stroke-width:2}
    .sf-note{font-size:11px;color:var(--muted);margin-top:8px;line-height:1.5}
    #sec-ind-satisfacao .kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
    @media (min-width:800px){#sec-ind-satisfacao .kpi-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
    @media (min-width:1150px){#sec-ind-satisfacao .kpi-grid.sf-k4{grid-template-columns:repeat(4,minmax(0,1fr))}}
    #sec-ind-satisfacao .kpi.sf-main .val{font-size:34px}
    #sec-ind-satisfacao .card{margin-bottom:0}
    .sf-aviso{display:flex;align-items:flex-start;gap:8px;font-size:12px;line-height:1.5;color:#12406F;background:#EAF2FE;border:1px solid #C5DCF8;border-radius:10px;padding:10px 12px;margin-bottom:14px}
    .sf-aviso.sim{color:#7a3e00;background:#FFF4E0;border-color:#F5D9A8}
    .sf-aviso svg{width:16px;height:16px;flex:none;margin-top:2px;stroke:currentColor;fill:none;stroke-width:2}
    .sf-aviso button{background:none;border:none;color:inherit;font:inherit;font-weight:700;text-decoration:underline;cursor:pointer;padding:0}
    .sf-pnd{display:flex;height:16px;min-width:170px;border-radius:8px;overflow:hidden;background:var(--bg)}
    .sf-pnd i{display:flex;align-items:center;justify-content:center;font-style:normal;font-size:9.5px;font-weight:700;color:#fff;overflow:hidden}
    .sf-pnd i.n{color:#5b4200}
    .sf-selo{display:inline-block;font-size:10px;font-weight:700;padding:1px 7px;border-radius:9px;margin-left:4px;vertical-align:middle}
    .sf-selo.up{background:#E6F7F0;color:#0f8a4c}.sf-selo.down{background:#FDECEC;color:var(--critical)}.sf-selo.at{background:#FFF6E0;color:#9a6b00}
    .sf-lj td,.sf-lj th{white-space:nowrap}
    .sf-lj td.h{text-align:center;font-weight:700;font-size:11.5px;padding:6px 7px}
    .sf-lj td.wrap{white-space:normal;min-width:180px;font-size:11.5px;color:var(--text2)}
    .sf-conf{display:flex;align-items:center;gap:8px;font-size:12px;margin:0 0 10px;cursor:pointer}
    .sf-conf input{margin:0}
    .sf-tri{margin-left:auto;padding:3px 6px;border:1px solid var(--border);border-radius:6px;font-size:11px;font-family:inherit;color:var(--text2);background:#fff;max-width:230px}
    .sf-com.fora{background:#FAFAFB;border-style:dashed}
    .sf-com.fora p{color:var(--text2)}
    .sf-tag.lj{background:#E6F7F0;color:#0f8a4c;font-weight:700}
    .sf-gap{height:16px}
    .sf-rank td,.sf-rank th{white-space:nowrap}
    .sf-rank tbody tr{cursor:pointer}
    .sf-rank tbody tr:hover td{background:#F7F9FC}
    .sf-bar{position:relative;min-width:140px;height:10px;border-radius:5px;background:var(--bg)}
    .sf-bar i{display:block;height:100%;border-radius:5px}
    .sf-cell{display:flex;align-items:center;gap:8px}
    .sf-cell b{min-width:30px;text-align:right;font-size:12.5px}
    .sf-var{font-size:11px;font-weight:700}
    .sf-var.up{color:#0f8a4c}.sf-var.down{color:var(--critical)}.sf-var.eq{color:var(--muted)}
    .sf-heat td,.sf-heat th{text-align:center;padding:6px 7px;white-space:nowrap;font-size:11.5px}
    .sf-heat td:first-child,.sf-heat th:first-child{text-align:left;position:sticky;left:0;background:#fff;z-index:1;font-weight:600}
    .sf-heat th:first-child{background:#F7F9FC;z-index:2}
    .sf-heat td.v{font-weight:700;border-radius:4px}
    .sf-heat tbody tr.click{cursor:pointer}
    .sf-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--text2);margin-top:8px}
    .sf-legend span{display:inline-flex;align-items:center;gap:5px}
    .sf-legend i{width:12px;height:12px;border-radius:3px;display:inline-block}
    .sf-ctl{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px;font-size:12px}
    .sf-ctl input[type=search]{min-width:240px}
    .sf-com{border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#fff}
    .sf-com-h{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px}
    .sf-chip{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:22px;padding:0 7px;border-radius:11px;font-size:11.5px;font-weight:800;color:#fff}
    .sf-tag{font-size:10.5px;padding:2px 8px;border-radius:10px;background:var(--bg);color:var(--text2)}
    .sf-tag.op{background:#EAF2FE;color:var(--p1)}
    .sf-com p{white-space:pre-wrap;font-size:12.5px;line-height:1.5;color:var(--text);margin:0}
    .sf-coms{max-height:620px;overflow:auto;padding-right:4px}
    .sf-back{background:none;border:none;color:var(--p1);cursor:pointer;font-size:12px;font-family:inherit;padding:0;margin-bottom:10px}
    table.dt td.num,table.dt th.num{text-align:right}
    .sf-mx td,.sf-mx th{text-align:center;white-space:nowrap;padding:6px 7px;font-size:11.5px}
    .sf-mx td:first-child,.sf-mx th:first-child{text-align:left;position:sticky;left:0;background:#fff;z-index:1;font-weight:600}
    .sf-mx th:first-child{background:#F7F9FC;z-index:2}
    .sf-mx td.v{font-weight:700}
    .sf-mx small{display:block;font-weight:400;color:var(--muted);font-size:9.5px}
  </style>`;

  const pct = v => v == null ? '—' : U.fmtPct(v, 0);

  // Participação de todas as lojas e áreas (quem respondeu ou não): confidencial,
  // só o Administrador (permissão própria, fora de todos os presets). As contas são
  // as do Boletim da Liderança (js/metrics-boletim.js): respondentes por loja da
  // planilha 16 e gestores aptos = ativos com a tag pesquisa.satisfação.
  const PERM_PARTICIPACAO = 'indicadores.satisfacao_participacao';
  const veParticipacao = () => HUB_PERMISSIONS.hasPerm(window.HUB_USER, PERM_PARTICIPACAO);
  const corNota = v => { const f = M.faixa(v); return f ? f.cor : 'var(--muted)'; };
  function varHtml(v, fmt) {
    if (v == null) return '<span class="sf-var eq">—</span>';
    const t = fmt(v);
    const cls = t.startsWith('▲') ? 'up' : t.startsWith('▼') ? 'down' : 'eq';
    return `<span class="sf-var ${cls}">${t}</span>`;
  }
  function barraNota(v) {
    if (v == null) return '—';
    return `<div class="sf-cell"><div class="sf-bar"><i style="width:${Math.max(2, v * 10)}%;background:${corNota(v)}"></i></div><b style="color:${corNota(v)}">${M.fmtNota(v)}</b></div>`;
  }
  function chart(id, h) { return `<div class="chart-h" style="height:${h || 280}px"><canvas id="${id}"></canvas></div>`; }
  const corNps = v => { const z = M.zonaNps(v); return z ? z.cor : 'var(--muted)'; };
  // Variação do NPS a partir dos valores já arredondados, para bater com o que a tela mostra (+43 → +44 = ▲ 1).
  const dNps = (s, sa) => s && sa && s.nps != null && sa.nps != null ? Math.round(s.nps) - Math.round(sa.nps) : null;
  // Cartão em destaque (o NPS é o indicador principal do módulo).
  const kpiMain = (label, value, sub, cor) => kpi(label, value, sub, cor).replace('class="kpi"', 'class="kpi sf-main"');
  const fmtPontos = v => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  // Barra promotores · neutros · detratores (o número aparece no trecho quando cabe).
  function pndBar(s) {
    if (!s || !s.n) return '—';
    const seg = (cls, cor, qtd, nome) => {
      const p = qtd / s.n;
      return qtd ? `<i class="${cls}" style="width:${(p * 100).toFixed(1)}%;background:${cor}" title="${nome}: ${U.fmtInt(qtd)} de ${U.fmtInt(s.n)} (${U.fmtPct(p, 0)})">${p >= 0.14 ? U.fmtPct(p, 0) : ''}</i>` : '';
    };
    return `<div class="sf-pnd">${seg('p', '#1baf7a', s.promotores, 'Promotores (9-10)')}${seg('n', '#f2c14e', s.neutros, 'Neutros (7-8)')}${seg('d', '#e34948', s.detratores, 'Detratores (0-6)')}</div>`;
  }
  function seloTendencia(t) {
    if (!t) return '';
    return t === 'subindo'
      ? '<span class="sf-selo up" title="Três variações seguidas para cima">▲ subindo há 3 ciclos</span>'
      : '<span class="sf-selo down" title="Três variações seguidas para baixo">▼ caindo há 3 ciclos</span>';
  }
  // "ago/26 a out/26" (ou só o ciclo, quando a área tem um ciclo só).
  const periodo = ms => ms.length > 1 ? `${M.rotuloMes(ms[0])} a ${M.rotuloMes(ms[ms.length - 1])}` : M.rotuloMes(ms[0]);

  // Faixa no topo quando a simulação está ligada.
  function avisoSimulacao(ctx) {
    if (!state.simular) return '';
    const n = M.sinalizadas(ctx.brutas, state.ciclo, state.area || null).length;
    return `<div class="sf-aviso sim">${HUB_ICON('alert')}<span><b>Simulação ligada.</b> Os números desta tela estão sem as avaliações sinalizadas para conferência (${U.fmtInt(n)} neste ciclo${state.area ? ', nesta área' : ''}). Nada foi apagado. <button type="button" id="sf-sim-off">Voltar aos números oficiais</button></span></div>`;
  }

  // Aviso quando o número de respondentes muda muito de um ciclo para o outro: a
  // variação mistura mudança de opinião com mudança de quem respondeu.
  function avisoRespondentes(g, ml) {
    if (g.respondentes == null || !g.respondentesAnt) return '';
    const d = (g.respondentes - g.respondentesAnt) / g.respondentesAnt;
    if (Math.abs(d) <= ALERTA_RESPONDENTES) return '';
    const ant = M.rotuloMes(g.cicloAnterior);
    const mesmas = ml
      ? ` ${U.fmtInt(ml.lojas)} lojas/áreas responderam nos dois ciclos; nelas o NPS foi de <b>${M.fmtNps(ml.anterior.nps)}</b> para <b>${M.fmtNps(ml.atual.nps)}</b>. Leia a variação de cada área pela coluna "Mesmas lojas".`
      : ' Parte da variação pode vir só da mudança de quem respondeu.';
    return `<div class="sf-aviso">${HUB_ICON('info')}<span>O número de respondentes ${d < 0 ? 'caiu' : 'subiu'} de <b>${U.fmtInt(g.respondentesAnt)}</b> (${esc(ant)}) para <b>${U.fmtInt(g.respondentes)}</b> (${d < 0 ? '−' : '+'}${U.fmtPct(Math.abs(d), 0)}).${mesmas}</span></div>`;
  }

  // ---- Topo ----------------------------------------------------------------
  function topo(ctx) {
    const { idx, acesso } = ctx;
    const ciclos = idx.ciclos.slice().reverse();
    const areas = idx.areas;
    const optAreas = (areas.length > 1 ? [`<option value="">Visão geral${acesso.completo ? ' do Escritório' : ' das suas áreas'}</option>`] : [])
      .concat(areas.map(a => `<option value="${esc(a)}"${a === state.area ? ' selected' : ''}>${esc(a)}</option>`));
    const sigilo = acesso.completo
      ? 'Dados sigilosos · visão completa: todas as áreas, com o recorte por operação e loja.'
      : `Dados sigilosos · você vê: <b>${esc(areas.join(', ') || '—')}</b> (só o total da área, sem identificar lojas).`;
    return `<div class="sf-top">
      <label>Ciclo<select id="sf-ciclo">${ciclos.map(m => `<option value="${m}"${m === state.ciclo ? ' selected' : ''}>${esc(M.rotuloCicloLongo(m))}</option>`).join('')}</select></label>
      <label>Área<select id="sf-area">${optAreas.join('')}</select></label>
      <label>Evolução<select id="sf-janela">${[[6, 'Últimos 6 ciclos'], [12, 'Últimos 12 ciclos'], [0, 'Todo o histórico']].map(([v, t]) => `<option value="${v}"${state.janela === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <div class="sf-sigilo">${HUB_ICON('lock')}<span>${sigilo}</span></div>
    </div>`;
  }

  function janelaCiclos(idx) {
    const ate = idx.ciclos.filter(m => m <= state.ciclo);
    return state.janela ? ate.slice(-state.janela) : ate;
  }

  // ---- Visão geral ---------------------------------------------------------
  function viewGeral(ctx) {
    const { idx, acesso, respostas } = ctx;
    const g = M.visaoGeral(idx, state.ciclo, ctx.ciclosTab);
    if (!g.areas.length) return empty('Nenhuma área avaliada neste ciclo.');
    const mes = M.rotuloCiclo(state.ciclo);
    const fx = M.faixa(g.geral.media), zn = M.zonaNps(g.geral.nps);
    const partSub = g.aptos ? `${U.fmtPct(g.participacao, 0)} de ${U.fmtInt(g.aptos)} gestores aptos` : 'sem a base de aptos neste ciclo';
    const varResp = g.respondentesAnt != null && g.respondentes != null ? g.respondentes - g.respondentesAnt : null;
    const vsAnt = g.cicloAnterior ? ` vs pesquisa ${M.rotuloMes(g.cicloAnterior)}` : '';
    const ac = M.acumuladoGeral(idx, state.ciclo);
    // Mesmas lojas: só com a visão completa (sem ela as respostas vêm sem loja).
    const ml = acesso.completo ? M.mesmasLojas(respostas, state.ciclo, g.cicloAnterior, null) : null;
    const kpis = `<div class="kpi-grid">
      ${kpiMain(acesso.completo ? 'NPS do Escritório' : 'NPS das suas áreas', M.fmtNps(g.geral.nps), `${zn ? zn.rotulo : ''} ${varHtml(dNps(g.geral, g.geralAnterior), M.fmtVarNps)}${vsAnt}${ml ? ` · mesmas lojas ${varHtml(dNps(ml.atual, ml.anterior), M.fmtVarNps)}` : ''}`, zn ? zn.cor : null)}
      ${ac && ac.ciclos.length > 1 ? kpi(`NPS de ${ac.ciclos.length} ciclos`, M.fmtNps(ac.s.nps), `${esc(periodo(ac.ciclos))} somados · ${U.fmtInt(ac.s.n)} avaliações${seloTendencia(M.tendenciaGeral(idx, state.ciclo))}`, corNps(ac.s.nps)) : ''}
      ${kpi('Nota média', M.fmtNota(g.geral.media), `${fx ? fx.rotulo : ''} ${varHtml(g.varNota, M.fmtVarNota)}${vsAnt}`, fx ? fx.cor : null)}
      ${kpi('Gestores que responderam', g.respondentes != null ? U.fmtInt(g.respondentes) : '—', partSub + (varResp != null ? ` · ${varResp >= 0 ? '+' : '−'}${Math.abs(varResp)} vs ciclo anterior` : ''))}
      ${kpi('Maior NPS', esc(g.melhor ? g.melhor.area : '—'), g.melhor ? `NPS ${M.fmtNps(g.melhor.atual.nps)} · nota ${M.fmtNota(g.melhor.atual.media)}` : '', '#0f8a4c')}
      ${g.pior ? kpi('Menor NPS', esc(g.pior.area), `NPS ${M.fmtNps(g.pior.atual.nps)} · nota ${M.fmtNota(g.pior.atual.media)}`, corNps(g.pior.atual.nps)) : ''}
    </div>`;

    const peso = M.pesoResposta(g.respondentes || (g.areas[0] && g.areas[0].atual.n));
    const linhaRank = a => {
      const acA = M.acumulado(idx, a.area, state.ciclo);
      const mlA = acesso.completo ? M.mesmasLojas(respostas, state.ciclo, a.cicloAnterior, a.area) : null;
      const sr = M.semReuniao(idx.porArea.get(a.area).get(state.ciclo));
      return `<tr data-area="${esc(a.area)}"><td><b>${esc(a.area)}</b></td>
        <td class="num" style="color:${corNps(a.atual.nps)}"><b style="font-size:13.5px">${M.fmtNps(a.atual.nps)}</b></td>
        <td>${varHtml(dNps(a.atual, a.anterior), M.fmtVarNps)}</td>
        ${acesso.completo ? `<td title="${mlA ? `${mlA.lojas} lojas/áreas responderam nos dois ciclos: NPS de ${M.fmtNps(mlA.anterior.nps)} para ${M.fmtNps(mlA.atual.nps)}` : 'Sem lojas em comum com o ciclo anterior'}">${mlA ? varHtml(dNps(mlA.atual, mlA.anterior), M.fmtVarNps) : '<span class="sf-var eq">—</span>'}</td>` : ''}
        <td class="num" title="${acA ? `${esc(periodo(acA.ciclos))} somados · ${acA.s.n} avaliações` : ''}">${acA && acA.ciclos.length > 1 ? `<span style="color:${corNps(acA.s.nps)};font-weight:700">${M.fmtNps(acA.s.nps)}</span>` : '—'}${seloTendencia(M.tendenciaArea(idx, a.area, state.ciclo))}</td>
        <td>${pndBar(a.atual)}</td>
        <td class="num">${M.fmtNota(a.atual.media)} ${varHtml(a.varNota, M.fmtVarNota)}</td>
        <td>${esc(a.atual.principal || '—')}${a.atual.pctNada != null ? ` <span class="sf-tag" title="Respostas que marcaram só 'Nada a melhorar'">${U.fmtPct(a.atual.pctNada, 0)} nada a melhorar</span>` : ''}${sr ? ` <span class="sf-tag" title="${sr.zero} de ${sr.n} responderam '0 reuniões' no mês">${U.fmtPct(sr.pct, 0)} sem reunião</span>` : ''}</td>
        <td class="num">${U.fmtInt(a.atual.n)}</td></tr>`;
    };
    const rank = card(`Ranking das áreas pelo NPS — ${esc(mes)}`, 'trophy', `
      <div class="table-wrap"><table class="dt sf-rank"><thead><tr><th>Área</th><th class="num">NPS</th><th>Var.</th>${acesso.completo ? '<th title="Variação do NPS só entre as lojas/áreas que responderam nos dois ciclos">Mesmas lojas</th>' : ''}<th class="num" title="NPS somando os últimos ${M.CICLOS_ACUMULADO} ciclos em que a área foi avaliada">NPS ${M.CICLOS_ACUMULADO} ciclos</th><th>Promotores · neutros · detratores</th><th class="num">Nota</th><th>Principal ponto a melhorar</th><th class="num">Respostas</th></tr></thead><tbody>
      ${g.areas.map(linhaRank).join('')}
      </tbody></table></div>
      <div class="sf-legend"><span><i style="background:#1baf7a"></i>Promotores (9-10)</span><span><i style="background:#f2c14e"></i>Neutros (7-8)</span><span><i style="background:#e34948"></i>Detratores (0-6)</span></div>
      <p class="sf-note">Clique numa área para ver a evolução, o que melhorar e os comentários. Variação contra o ciclo anterior em que a área foi avaliada.${peso ? ` <b>Como ler o NPS:</b> com ${U.fmtInt(Math.round(100 / peso.umPasso))} respostas, cada loja que deixa de ser detratora soma ${fmtPontos(peso.umPasso)} pontos ao NPS de uma área (${fmtPontos(peso.doisPassos)} se virar promotora). Variação menor que isso é uma loja só; só trate como tendência o que se repete por três ciclos — por isso a coluna "NPS ${M.CICLOS_ACUMULADO} ciclos".` : ''}</p>`, { full: true });

    const ciclos = janelaCiclos(idx);
    const heat = card('Evolução por área — nota média por ciclo', 'barChart', `
      <div class="table-wrap sf-heat-wrap" style="max-height:none"><table class="dt sf-heat"><thead><tr><th>Área</th>${ciclos.map(m => `<th title="Avalia ${esc(M.rotuloMes(M.mesReferencia(m)))}">${esc(M.rotuloMes(m))}</th>`).join('')}</tr></thead><tbody>
      ${M.mapaCalor(idx, ciclos).map(l => `<tr class="click" data-area="${esc(l.area)}"><td>${esc(l.area)}</td>${l.celulas.map(c => {
        if (!c.s || c.s.media == null) return '<td style="color:var(--muted)">—</td>';
        const f = M.faixa(c.s.media);
        return `<td class="v" style="background:${f.fundo};color:${f.cor}" title="Pesquisa ${esc(M.rotuloCiclo(c.ciclo))}: nota ${M.fmtNota(c.s.media)} · NPS ${M.fmtNps(c.s.nps)} · ${c.s.n} respostas">${M.fmtNota(c.s.media)}</td>`;
      }).join('')}</tr>`).join('')}
      </tbody></table></div>${legendaFaixas()}<p class="sf-note">Colunas = mês em que a pesquisa foi aplicada; cada pesquisa avalia o mês anterior (a de set/26 avalia agosto).</p>`, { full: true });

    const evo = card('Evolução geral', 'trendUp', chart('c-sf-evo-geral', 280) + `<p class="sf-note">NPS de todas as respostas ${acesso.completo ? 'do Escritório' : 'das suas áreas'} no ciclo (linha azul), NPS somando ${M.CICLOS_ACUMULADO} ciclos (linha clara, oscila menos) e nota média (tracejada, 0 a 10).</p>`);
    const melh = card(`O que melhorar? — ${esc(mes)}`, 'lightbulb', chart('c-sf-melh-geral', 240) + '<p class="sf-note">% das avaliações em que cada ponto foi marcado (pode marcar mais de um), somando as áreas.</p>');

    let mx = '';
    if (acesso.completo) {
      const ops = M.matrizOperacoes(respostas, state.ciclo, g.areas.map(a => a.area));
      if (ops.length) {
        const areasOrd = g.areas.map(a => a.area);
        mx = '<div class="sf-gap"></div>' + card(`Nota por operação × área — ${esc(mes)}`, 'building', `
          <div class="table-wrap" style="max-height:none"><table class="dt sf-mx"><thead><tr><th>Operação</th><th>Geral</th>${areasOrd.map(a => `<th>${esc(a)}</th>`).join('')}</tr></thead><tbody>
          ${ops.map(o => `<tr><td>${esc(o.nome)}</td>${[o.total].concat(o.areas).map(s => {
            if (!s || s.media == null) return '<td style="color:var(--muted)">—</td>';
            const f = M.faixa(s.media);
            return `<td class="v" style="background:${f.fundo};color:${f.cor}" title="${s.n} respostas · NPS ${M.fmtNps(s.nps)}">${M.fmtNota(s.media)}<small>${s.n} resp.</small></td>`;
          }).join('')}</tr>`).join('')}
          </tbody></table></div>
          <p class="sf-note">Visão completa (RH): mostra de onde vêm as notas. Nas lojas, 1 respondente costuma ser o gerente — não repasse este recorte às áreas avaliadas.</p>`, { full: true });
      }
    }

    return avisoSimulacao(ctx) + avisoRespondentes(g, ml) + kpis + rank + cardInsatisfacao(ctx) + cardConferir(ctx, null)
      + '<div class="sf-gap"></div>' + heat + '<div class="sf-gap"></div>' + `<div class="grid2">${evo}${melh}</div>` + mx + cardParticipacao() + comoLer(acesso);
  }

  // ---- Onde está a insatisfação (visão completa) -----------------------------
  // Lojas com média abaixo de 6,5 em todas as áreas: quanto das notas de 0 a 6
  // elas concentram e se o caso é recorrente (histórico dos últimos ciclos).
  function cardInsatisfacao(ctx) {
    if (!ctx.acesso.completo) return '';
    const { idx, respostas } = ctx;
    const janela = idx.ciclos.filter(m => m <= state.ciclo).slice(-CICLOS_HISTORICO_LOJA);
    const li = M.lojasInsatisfacao(respostas, state.ciclo, janela);
    if (!li.totalDet && !li.ausentes.length) return '';
    const lim = M.fmtNota(li.limite);
    const cel = h => {
      if (h.media == null) return '<td class="h" style="color:var(--muted)" title="Não respondeu">—</td>';
      const f = M.faixa(h.media);
      return `<td class="h" style="background:${f.fundo};color:${f.cor}">${M.fmtNota(h.media)}</td>`;
    };
    const situacao = l => (l.recorrente
      ? `<span class="sf-selo down" title="Média abaixo de ${lim} em ${l.ciclosBaixos} dos ${l.ciclosRespondidos} ciclos respondidos">Recorrente · ${l.ciclosBaixos} de ${l.ciclosRespondidos}</span>`
      : `<span class="sf-selo at" title="Média abaixo de ${lim} em ${l.ciclosBaixos} dos ${l.ciclosRespondidos} ciclos respondidos">Pontual</span>`)
      + (l.conferir ? `<span class="sf-selo at" title="${l.suspeitas} avaliações sinalizadas (ver 'Respostas para conferir')">Conferir com a loja</span>` : '');
    const resumo = li.criticas.length
      ? `<p style="font-size:13px;margin:0 0 10px"><b>${U.fmtInt(li.criticas.length)} ${li.criticas.length === 1 ? 'loja concentra' : 'lojas concentram'} ${U.fmtPct(li.pctCriticas, 0)} das notas de 0 a 6</b> do ciclo (${U.fmtInt(li.detCriticas)} de ${U.fmtInt(li.totalDet)}). São as lojas/áreas com média abaixo de ${lim} somando todas as áreas avaliadas.</p>`
      : `<p style="font-size:13px;margin:0 0 10px">Nenhuma loja/área com média abaixo de ${lim} neste ciclo. As ${U.fmtInt(li.totalDet)} notas de 0 a 6 estão espalhadas por ${U.fmtInt(li.outras.lojas)} lojas/áreas.</p>`;
    const tabela = li.criticas.length ? `<div class="table-wrap" style="max-height:none"><table class="dt sf-lj"><thead><tr><th>Loja / área</th><th>Operação</th><th class="num">Média</th><th class="num">Notas 0-6</th><th class="num">Zeros</th><th>Áreas com nota zero</th>${li.janela.map(m => `<th title="Média da loja na pesquisa de ${esc(M.rotuloMes(m))}">${esc(M.rotuloMes(m))}</th>`).join('')}<th>Situação</th></tr></thead><tbody>
      ${li.criticas.map(l => `<tr><td><b>${esc(l.nome)}</b></td><td>${esc(l.operacao)}</td><td class="num" style="color:${corNota(l.media)}"><b>${M.fmtNota(l.media)}</b></td><td class="num" title="Notas de 0 a 6 em: ${esc(l.areasBaixas.join(', '))}">${U.fmtInt(l.detratores)} de ${U.fmtInt(l.avaliacoes)}</td><td class="num">${U.fmtInt(l.zeros)}</td><td class="wrap">${esc(l.areasZero.join(', ') || '—')}</td>${l.historico.map(cel).join('')}<td>${situacao(l)}</td></tr>`).join('')}
      </tbody></table></div>` : '';
    const outras = li.criticas.length && li.outras.lojas ? ` As outras ${U.fmtInt(li.outras.detratores)} notas de 0 a 6 vieram de ${U.fmtInt(li.outras.lojas)} lojas/áreas com média de ${lim} ou mais.` : '';
    const ausentes = li.ausentes.length
      ? `<div class="sf-aviso" style="margin:12px 0 0">${HUB_ICON('alert')}<span><b>${li.ausentes.length === 1 ? 'Uma loja/área com média baixa' : `${li.ausentes.length} lojas/áreas com média baixa`} em ${esc(M.rotuloMes(li.cicloAnterior))} não ${li.ausentes.length === 1 ? 'respondeu' : 'responderam'} agora:</b> ${li.ausentes.map(a => `${esc(a.nome)} (${M.fmtNota(a.mediaAnterior)})`).join(', ')}. Quando uma loja insatisfeita deixa de responder, o NPS sobe sem que nada tenha melhorado.</span></div>`
      : '';
    return '<div class="sf-gap"></div>' + card(`Onde está a insatisfação — ${esc(M.rotuloCiclo(state.ciclo))}`, 'pin', `${resumo}${tabela}
      <p class="sf-note">Colunas de mês = média da loja em todas as áreas em cada pesquisa ("—" = não respondeu). Passe o mouse em "Notas 0-6" para ver as áreas. Recorrente = média abaixo de ${lim} em 3 ou mais dos últimos ${li.janela.length} ciclos.${outras} Visão completa (RH): em loja, o respondente costuma ser o gerente — não repasse este recorte às áreas avaliadas.</p>${ausentes}`, { full: true });
  }

  // ---- Respostas para conferir ------------------------------------------------
  // Avaliações em que a nota pode não medir o serviço. A simulação recalcula a tela
  // sem elas; os dados continuam no banco.
  function cardConferir(ctx, area) {
    const lista = M.sinalizadas(ctx.brutas, state.ciclo, area);
    if (!lista.length) return '';
    const conta = k => lista.filter(x => x.sinal === k).length;
    const partes = Object.keys(M.SINAIS).filter(k => conta(k)).map(k => `<b>${U.fmtInt(conta(k))}</b> — ${esc(M.SINAIS[k].charAt(0).toLowerCase() + M.SINAIS[k].slice(1))}`);
    const comLoja = ctx.acesso.completo;
    return '<div class="sf-gap"></div>' + card(`Respostas para conferir — ${esc(M.rotuloCiclo(state.ciclo))}`, 'alert', `
      <p style="font-size:13px;margin:0 0 10px">${U.fmtInt(lista.length)} ${lista.length === 1 ? 'avaliação' : 'avaliações'}${area ? ' desta área' : ''} em que a nota pode não medir o serviço: ${partes.join('; ')}.</p>
      <label class="sf-conf"><input type="checkbox" id="sf-sim"${state.simular ? ' checked' : ''}>Simular os indicadores sem essas avaliações (em todos os ciclos; nada é apagado)</label>
      <details><summary style="cursor:pointer;font-size:12px;color:var(--p1)">Ver as ${U.fmtInt(lista.length)} avaliações</summary>
      <div class="table-wrap" style="margin-top:10px;max-height:420px"><table class="dt"><thead><tr><th class="num">Nota</th>${area ? '' : '<th>Área</th>'}${comLoja ? '<th>Loja / área</th>' : ''}<th>Motivo</th><th>Comentário</th></tr></thead><tbody>
      ${lista.map(x => `<tr><td class="num"><span class="sf-chip" style="background:${corNota(x.nota)}">${x.nota == null ? '—' : U.fmtInt(x.nota)}</span></td>${area ? '' : `<td>${esc(x.area)}</td>`}${comLoja ? `<td>${esc(x.loja || '—')}</td>` : ''}<td>${esc(x.motivo)}</td><td style="white-space:normal;min-width:220px">${esc(x.comentario || '—')}</td></tr>`).join('')}
      </tbody></table></div></details>
      <p class="sf-note">Confirme com a loja antes de levar essas notas à área como insatisfação. Para não depender disso, vale incluir no formulário a opção "não tive contato com a área neste mês".</p>`, { full: true });
  }

  // ---- Participação por loja (só Administrador) -----------------------------
  function cardParticipacao() {
    if (!veParticipacao()) return '';
    return '<div class="sf-gap"></div>' + card(`Participação de todas as lojas e áreas — ${esc(M.rotuloCiclo(state.ciclo))}`, 'building',
      `<div class="sf-sigilo" style="margin-bottom:10px">${HUB_ICON('lock')}<span>Confidencial · visível só para o Administrador.</span></div><div id="sf-part">${tabelaParticipacao()}</div>`, { full: true });
  }

  function tabelaParticipacao() {
    if (!HUB_BOLETIM.jaCarregado()) return '<p class="sf-note">Carregando a participação por loja...</p>';
    const MB = HUB_METRICS_BOLETIM;
    let calc;
    try { calc = MB.calcularMes(M.mesISO(state.ciclo)); }
    catch (err) { return `<p class="sf-note">Não consegui calcular a participação: ${esc(err.message || '')}</p>`; }
    const linhas = [];
    for (const o of MB.OPERACOES) for (const l of calc.operacoes[o.id].lojas) {
      const x = { op: o.nome, nome: l.nome, resp: l.base.satisfacao_respondentes, aptos: l.base.satisfacao_aptos };
      if (x.aptos || x.resp) linhas.push(x);
    }
    if (!linhas.length) return '<p class="sf-note">Nenhuma loja ou área com gestores aptos ou respostas neste ciclo.</p>';
    const pctDe = x => x.aptos ? Math.min(1, x.resp / x.aptos) : null;
    const ordem = x => pctDe(x) == null ? 2 : pctDe(x);
    linhas.sort((a, c) => ordem(a) - ordem(c) || a.op.localeCompare(c.op, 'pt-BR') || a.nome.localeCompare(c.nome, 'pt-BR'));
    const badge = (txt, fundo, cor) => `<span class="badge" style="background:${fundo};color:${cor}">${txt}</span>`;
    const situ = x => !x.resp ? badge('Não respondeu', '#FDECEC', 'var(--critical)') : x.aptos && x.resp < x.aptos ? badge('Parcial', '#FFF6E0', '#9a6b00') : badge('Respondeu', '#E6F7F0', '#0f8a4c');
    const nao = linhas.filter(x => !x.resp).length;
    const t = linhas.reduce((a, x) => ({ resp: a.resp + x.resp, aptos: a.aptos + x.aptos }), { resp: 0, aptos: 0 });
    return `<div class="table-wrap" style="max-height:520px"><table class="dt"><thead><tr><th>Operação</th><th>Loja / área</th><th class="num">Gestores aptos</th><th class="num">Responderam</th><th class="num">Participação</th><th>Situação</th></tr></thead><tbody>
        ${linhas.map(x => `<tr><td>${esc(x.op)}</td><td>${esc(x.nome)}</td><td class="num">${U.fmtInt(x.aptos)}</td><td class="num">${U.fmtInt(x.resp)}</td><td class="num">${x.aptos ? U.fmtPct(pctDe(x), 0) : '—'}</td><td>${situ(x)}</td></tr>`).join('')}
        <tr style="font-weight:700;background:#F7F9FC"><td>Total</td><td></td><td class="num">${U.fmtInt(t.aptos)}</td><td class="num">${U.fmtInt(t.resp)}</td><td class="num">${t.aptos ? U.fmtPct(Math.min(1, t.resp / t.aptos), 0) : '—'}</td><td></td></tr>
      </tbody></table></div>
      <p class="sf-note">${nao} de ${linhas.length} lojas/áreas sem nenhuma resposta no ciclo. A pesquisa é anônima: a conta é por loja/área (gestores aptos = ativos com a tag pesquisa.satisfação no cadastro, foto de hoje), não por pessoa. Mais respostas que aptos indica gestor respondendo sem a tag.</p>`;
  }

  // Os dados por loja vêm do Boletim da Liderança, buscados só quando a tabela aparece.
  function carregarParticipacao(el) {
    const box = el.querySelector('#sf-part');
    if (!box || HUB_BOLETIM.jaCarregado()) return;
    HUB_BOLETIM.carregar().then(() => {
      HUB_METRICS_BOLETIM._invalidar();
      const b = el.querySelector('#sf-part');
      if (b) b.innerHTML = tabelaParticipacao();
    }).catch(err => {
      const b = el.querySelector('#sf-part');
      if (b) b.innerHTML = `<p class="sf-note">Não consegui carregar a participação por loja: ${esc(err.message || '')}</p>`;
    });
  }

  function legendaFaixas() {
    return `<div class="sf-legend">${M.FAIXAS.map((f, i) => `<span><i style="background:${f.fundo};border:1px solid ${f.cor}"></i>${f.rotulo} ${i === 0 ? '(≥ 9)' : i === M.FAIXAS.length - 1 ? '(< 7)' : `(${f.min} a ${String(f.min + 0.9).replace('.', ',')})`}</span>`).join('')}</div>`;
  }

  function comoLer(acesso) {
    return '<div class="sf-gap"></div>' + card('Como ler', 'info', `<div class="sf-note" style="font-size:12px;color:var(--text2)">
      <p><b>Ciclo</b>: a pesquisa aplicada num mês avalia o <b>mês anterior</b> — a de setembro avalia agosto, e assim por diante. Os ciclos levam o nome do mês da pesquisa, com o mês avaliado entre parênteses (ref.).</p>
      <p><b>NPS</b> (indicador principal): % de notas 9-10 (promotores) − % de notas 0-6 (detratores), de −100 a +100. As notas 7 e 8 são neutras. Zonas: excelência ≥ 75, qualidade 50 a 74, aperfeiçoamento 0 a 49, crítica abaixo de 0. É o NPS aplicado à nota de satisfação com o suporte — não é pesquisa de recomendação.</p>
      <p><b>NPS de ${M.CICLOS_ACUMULADO} ciclos</b>: o mesmo cálculo somando as respostas dos últimos ${M.CICLOS_ACUMULADO} ciclos. Com poucas respostas por mês, uma única loja move o NPS de uma área em vários pontos; somando os ciclos o número oscila menos. O selo "subindo/caindo há 3 ciclos" só aparece com três variações seguidas na mesma direção.</p>
      <p><b>Nota média</b>: média das notas de 0 a 10 dadas no ciclo. Faixas: ótimo ≥ 9, bom 8 a 8,9, atenção 7 a 7,9, crítico abaixo de 7.</p>
      ${acesso.completo ? '<p><b>Mesmas lojas</b>: variação calculada só com as lojas/áreas que responderam nos dois ciclos. Separa a mudança de opinião da mudança de quem respondeu.</p>' : ''}
      <p><b>Respostas para conferir</b>: nota de 0 a 6 que marcou só "Nada a melhorar" e comentários de quem diz ter pouco contato com a área. A simulação mostra os indicadores sem elas; os números oficiais não mudam.</p>
      <p><b>Gestores aptos</b>: ativos com a tag <i>pesquisa.satisfação</i> no cadastro (foto do dia do upload, mesma regra do Boletim).</p>
      ${acesso.completo
        ? '<p><b>Triagem dos comentários</b>: o responsável da área vê todos os comentários da área, sem a loja. Em cada comentário você pode marcar uma exceção — <i>ocultar da área</i> (fora do escopo, sem fato, nota incoerente), <i>tratar individualmente</i> (cita uma pessoa ou conduta: conversa reservada com o gestor dela) ou <i>liberar a loja</i> (quando o nome da loja ajuda a resolver). A nota continua contando nos indicadores em qualquer caso.</p>'
        : '<p><b>Sigilo</b>: você vê só as áreas liberadas no seu acesso, sem a loja ou operação de quem respondeu, salvo nos comentários em que o DHO liberou a loja para ajudar a resolver. Comentários são de gestores identificáveis por quem conhece o contexto — trate como confidencial. Alguns comentários podem ser tratados à parte pelo DHO e não aparecem aqui.</p>'}
    </div>`, { full: true });
  }

  // ---- Página da área --------------------------------------------------------
  function viewArea(ctx, area) {
    const { idx, acesso, respostas } = ctx;
    const r = M.resumoArea(idx, area, state.ciclo);
    const voltar = idx.areas.length > 1 ? '<button type="button" class="sf-back" id="sf-voltar">← Voltar à visão geral</button>' : '';
    if (!r.atual || !r.atual.n) return voltar + empty(`${esc(area)} não foi avaliada na ${esc(M.rotuloCicloLongo(state.ciclo))}.`, 'Escolha outro ciclo.');
    const s = r.atual, fx = M.faixa(s.media), zn = M.zonaNps(s.nps);
    const vs = r.cicloAnterior ? ` vs pesquisa ${M.rotuloMes(r.cicloAnterior)}` : '';
    const mes = M.rotuloCiclo(state.ciclo);
    const ac = M.acumulado(idx, area, state.ciclo);
    const ml = acesso.completo ? M.mesmasLojas(respostas, state.ciclo, r.cicloAnterior, area) : null;
    const peso = M.pesoResposta(s.n);
    const rowsCiclo = (idx.porArea.get(area).get(state.ciclo)) || [];
    const sr = M.semReuniao(rowsCiclo);
    const srAnt = r.cicloAnterior ? M.semReuniao(idx.porArea.get(area).get(r.cicloAnterior)) : null;
    const cartoes = [
      kpiMain('NPS', M.fmtNps(s.nps), `${zn.rotulo} ${varHtml(dNps(r.atual, r.anterior), M.fmtVarNps)}${vs}${ml ? ` · mesmas lojas ${varHtml(dNps(ml.atual, ml.anterior), M.fmtVarNps)}` : ''}`, zn.cor),
      ac && ac.ciclos.length > 1 ? kpi(`NPS de ${ac.ciclos.length} ciclos`, M.fmtNps(ac.s.nps), `${esc(periodo(ac.ciclos))} somados · ${U.fmtInt(ac.s.n)} avaliações${seloTendencia(M.tendenciaArea(idx, area, state.ciclo))}`, corNps(ac.s.nps)) : '',
      kpi('Nota média', M.fmtNota(s.media), `${fx.rotulo} ${varHtml(r.varNota, M.fmtVarNota)}${vs}`, fx.cor),
      kpi('Promotores (9-10)', pct(s.pctPromotores), `${U.fmtInt(s.promotores)} de ${U.fmtInt(s.n)}`, '#0f8a4c'),
      kpi('Detratores (0-6)', pct(s.pctDetratores), `${U.fmtInt(s.detratores)} de ${U.fmtInt(s.n)}`, 'var(--critical)'),
      kpi('Avaliações', U.fmtInt(s.n), `1 resposta = ${fmtPontos(peso.umPasso)} pontos de NPS${r.anterior ? ` · ${U.fmtInt(r.anterior.n)} no ciclo anterior` : ''}`),
      sr ? kpi('Lojas sem reunião no mês', pct(sr.pct), `${U.fmtInt(sr.zero)} de ${U.fmtInt(sr.n)} responderam "0 reuniões"${srAnt ? ` · ${pct(srAnt.pct)} no ciclo anterior` : ''}`, sr.pct > 0.5 ? 'var(--critical)' : sr.pct > 0.25 ? '#c98500' : '#0f8a4c') : ''
    ].filter(Boolean);
    const kpis = `<div class="kpi-grid${cartoes.length > 6 ? ' sf-k4' : ''}">${cartoes.join('')}</div>`;

    const extra = M.distribuicaoExtra(rowsCiclo);
    const blocos = [
      card(`Evolução — ${esc(area)}`, 'trendUp', chart('c-sf-evo', 290) + `<p class="sf-note">NPS do ciclo (linha azul), NPS somando ${M.CICLOS_ACUMULADO} ciclos (linha clara, oscila menos) e nota média (tracejada, 0 a 10).</p>`),
      card(`Distribuição das notas — ${esc(mes)}`, 'barChart', chart('c-sf-dist', 290) + '<p class="sf-note">Vermelho: detratores (0-6) · amarelo: neutros (7-8) · verde: promotores (9-10).</p>'),
      card(`O que melhorar? — ${esc(mes)}`, 'lightbulb', chart('c-sf-melh', 230) + tabelaMelhorar(idx, area))
    ];
    if (extra.length) {
      blocos.push(card(`Reuniões do time com a loja no mês — ${esc(mes)}`, 'handshake', chart('c-sf-extra', 230) + '<p class="sf-note">Pergunta "Quantas reuniões o time realizou com você este mês?".</p>'));
      blocos.push(card('Lojas sem reunião no mês — evolução', 'trendDown', chart('c-sf-reun', 230) + '<p class="sf-note">% dos gestores que responderam "0 reuniões" em cada pesquisa. Quanto menor, melhor.</p>'));
    }
    if (acesso.completo) blocos.push(card(`Nota por operação — ${esc(mes)}`, 'building', tabelaOperacoes(M.porOperacao(respostas, state.ciclo, area))));

    let lojas = '';
    if (acesso.completo) {
      const ls = M.porLoja(respostas, state.ciclo, area);
      if (ls.length) lojas = '<div class="sf-gap"></div>' + card(`Por loja / departamento — ${esc(mes)}`, 'pin', `<details><summary style="cursor:pointer;font-size:12px;color:var(--p1)">Mostrar ${ls.length} lojas/departamentos (menor nota primeiro)</summary>
        <div class="table-wrap" style="margin-top:10px;max-height:480px"><table class="dt"><thead><tr><th>Operação</th><th>Unidade</th><th>Departamento</th><th>Nota</th><th>O que melhorar</th></tr></thead><tbody>
        ${ls.map(l => `<tr><td>${esc(l.operacao)}</td><td>${esc(l.unidade || '—')}</td><td>${esc(l.departamento || '—')}</td><td>${barraNota(l.s.media)}</td><td>${esc(Object.keys(l.s.melhorar).filter(k => k !== M.NADA).join(', ') || (l.s.melhorar[M.NADA] ? M.NADA : '—'))}</td></tr>`).join('')}
        </tbody></table></div></details>
        <p class="sf-note">Visão completa (RH). Loja com 1 respondente identifica o gerente — não repasse à área avaliada.</p>`, { full: true });
    }

    return voltar + avisoSimulacao(ctx) + kpis + `<div class="grid2">${blocos.join('')}</div>` + lojas + cardConferir(ctx, area) + '<div class="sf-gap"></div>' + blocoComentarios(ctx, area) + comoLer(acesso);
  }

  function tabelaMelhorar(idx, area) {
    const pa = idx.porArea.get(area);
    const ant = M.resumoArea(idx, area, state.ciclo).cicloAnterior;
    const ult6 = Array.from(pa.keys()).filter(m => m <= state.ciclo).sort().slice(-6);
    const s = M.stats(pa.get(state.ciclo)), sa = ant ? M.stats(pa.get(ant)) : null;
    const s6 = M.stats(ult6.flatMap(m => pa.get(m)));
    const p = (st, k) => st && st.respostas ? (st.melhorar[k] || 0) / st.respostas : null;
    return `<div class="table-wrap" style="margin-top:8px"><table class="dt"><thead><tr><th>Ponto</th><th class="num">${esc(M.rotuloCiclo(state.ciclo))}</th><th class="num">Ciclo anterior</th><th class="num">Últimos 6 ciclos</th></tr></thead><tbody>
      ${M.MELHORAR.concat([M.NADA]).map(k => `<tr><td>${esc(k)}</td><td class="num"><b>${pct(p(s, k))}</b></td><td class="num">${pct(p(sa, k))}</td><td class="num">${pct(p(s6, k))}</td></tr>`).join('')}
    </tbody></table></div><p class="sf-note">% das avaliações da área em que o ponto foi marcado.</p>`;
  }

  function tabelaOperacoes(ops) {
    if (!ops.length) return empty('Sem respostas com loja neste ciclo.');
    return `<div class="table-wrap"><table class="dt"><thead><tr><th>Operação</th><th>Nota</th><th class="num">NPS</th><th class="num">Respostas</th></tr></thead><tbody>
      ${ops.map(o => `<tr><td>${esc(o.nome)}</td><td>${barraNota(o.s.media)}</td><td class="num">${M.fmtNps(o.s.nps)}</td><td class="num">${U.fmtInt(o.s.n)}</td></tr>`).join('')}
    </tbody></table></div><p class="sf-note">Visão completa (RH). Não repasse este recorte à área avaliada.</p>`;
  }

  function blocoComentarios(ctx, area) {
    return card(`Comentários — ${esc(area)} · ${esc(M.rotuloCiclo(state.ciclo))}`, 'message', `
      <div class="sf-ctl">
        <input type="search" id="sf-busca" placeholder="Buscar nos comentários" value="${esc(state.busca)}">
        <select id="sf-ordem"><option value="menor"${state.ordem === 'menor' ? ' selected' : ''}>Menor nota primeiro</option><option value="maior"${state.ordem === 'maior' ? ' selected' : ''}>Maior nota primeiro</option></select>
        <label class="chk"><input type="checkbox" id="sf-todos"${state.todos ? ' checked' : ''}>Mostrar também os sem conteúdo (".", "ok", "nada a declarar")</label>
        ${ctx.acesso.completo ? `<label class="chk"><input type="checkbox" id="sf-triados"${state.soTriados ? ' checked' : ''}>Só os marcados na triagem</label>` : ''}
      </div>
      <div id="sf-coms"></div>`, { full: true });
  }

  function desenharComentarios(ctx, area) {
    const box = document.getElementById('sf-coms');
    if (!box) return;
    const completo = ctx.acesso.completo;
    const lista = M.comentarios(ctx.respostas, state.ciclo, area, { busca: state.busca, ordem: state.ordem, todos: state.todos, soTriados: completo && state.soTriados });
    const todos = M.comentarios(ctx.respostas, state.ciclo, area, { todos: true });
    // Triagem: quantos comentários deste ciclo não chegam ao responsável da área.
    const fora = completo ? todos.filter(c => c.triagem && M.TRIAGEM[c.triagem].escondeDaArea).length : 0;
    const comLoja = completo ? todos.filter(c => c.triagem === 'loja').length : 0;
    const triagemTxt = completo
      ? ` Triagem: por padrão o responsável da área vê todos os comentários, sem a loja. Marque só as exceções${fora || comLoja ? ` — hoje <b>${U.fmtInt(fora)}</b> não ${fora === 1 ? 'vai' : 'vão'} para a área e <b>${U.fmtInt(comLoja)}</b> ${comLoja === 1 ? 'vai' : 'vão'} com a loja` : ''}.`
      : ' Sem loja ou operação de quem respondeu, salvo quando o DHO libera a loja para ajudar a resolver. Alguns comentários podem ser tratados à parte pelo DHO.';
    const cab = `<p class="sf-note" style="margin:0 0 10px">${U.fmtInt(lista.length)} de ${U.fmtInt(todos.length)} comentários${state.todos ? '' : ' (sem os vazios)'}.${completo ? ' Visão completa: com a loja de origem.' : ''}${triagemTxt}</p>`;
    if (!lista.length) { box.innerHTML = cab + empty('Nenhum comentário neste recorte.'); return; }
    const seletor = c => !completo || !c.chave ? '' : `<select class="sf-tri" data-chave="${esc(c.chave)}" title="Triagem deste comentário">
        <option value="">Vai para a área (sem a loja)</option>
        ${Object.keys(M.TRIAGEM).map(k => `<option value="${k}"${c.triagem === k ? ' selected' : ''}>${esc(M.TRIAGEM[k].acao)}</option>`).join('')}
      </select>`;
    box.innerHTML = cab + '<div class="sf-coms">' + lista.map(c => {
      const t = c.triagem ? M.TRIAGEM[c.triagem] : null;
      return `<div class="sf-com${t && t.escondeDaArea ? ' fora' : ''}"><div class="sf-com-h">
        <span class="sf-chip" style="background:${corNota(c.nota)}" title="Nota dada à área">${c.nota == null ? '—' : U.fmtInt(c.nota)}</span>
        ${c.melhorar.map(m => `<span class="sf-tag">${esc(m)}</span>`).join('')}
        ${c.operacao ? `<span class="sf-tag op">${esc(c.operacao)}</span>` : ''}
        ${c.loja ? `<span class="sf-tag${c.lojaLiberada ? ' lj' : ''}" title="${c.lojaLiberada ? 'Loja liberada pelo DHO para ajudar a resolver' : 'Loja / área de quem respondeu'}">${esc(c.loja)}</span>` : ''}
        ${c.sinal ? `<span class="sf-selo at" title="${esc(M.SINAIS[c.sinal])}">Conferir</span>` : ''}
        ${t ? `<span class="sf-selo ${t.escondeDaArea ? 'down' : 'up'}">${esc(t.rotulo)}</span>` : ''}
        ${seletor(c)}
      </div><p>${esc(c.comentario)}</p></div>`;
    }).join('') + '</div>';

    box.querySelectorAll('.sf-tri').forEach(sel => sel.addEventListener('change', async () => {
      const anterior = (ctx.respostas.find(x => x.chave === sel.dataset.chave) || {}).triagem || '';
      sel.disabled = true;
      try {
        await HUB_SATISFACAO.triar(sel.dataset.chave, sel.value);
        desenharComentarios(ctx, area);
      } catch (err) {
        sel.value = anterior;
        sel.disabled = false;
        alert(err.message || 'Não consegui gravar a triagem.');
      }
    }));
  }

  // ---- Gráficos ----------------------------------------------------------------
  const DL = '#16181D';
  // serie: [{ ciclo, s (stats do ciclo), ac (stats somando os últimos ciclos) }]
  function linhaNotaNps(id, serie) {
    const temAc = serie.some(x => x.ac);
    // Eixo do NPS: de 0 a 100 quando não há NPS negativo na janela (aproveita melhor a altura).
    const menor = Math.min(0, ...serie.map(x => x.s && x.s.nps != null ? x.s.nps : 0), ...serie.map(x => x.ac && x.ac.nps != null ? x.ac.nps : 0));
    const yMin = Math.floor(menor / 25) * 25;
    HUB_CHART(id, {
      type: 'line',
      data: {
        labels: serie.map(x => M.rotuloMes(x.ciclo)),
        datasets: [
          { label: 'NPS', data: serie.map(x => x.s && x.s.nps != null ? Math.round(x.s.nps) : null), borderColor: '#1C7CEC', backgroundColor: '#1C7CEC', tension: .3, pointRadius: 3, spanGaps: true, yAxisID: 'y' }
        ].concat(temAc ? [
          { label: `NPS ${M.CICLOS_ACUMULADO} ciclos`, data: serie.map(x => x.ac && x.ac.nps != null ? Math.round(x.ac.nps) : null), borderColor: '#9CC4F5', backgroundColor: '#9CC4F5', borderWidth: 4, tension: .3, pointRadius: 0, spanGaps: true, yAxisID: 'y' }
        ] : []).concat([
          { label: 'Nota média', data: serie.map(x => x.s && x.s.media != null ? +x.s.media.toFixed(2) : null), borderColor: '#8A8F98', backgroundColor: '#8A8F98', borderDash: [5, 4], tension: .3, pointRadius: 2, spanGaps: true, yAxisID: 'y1' }
        ])
      },
      options: {
        layout: { padding: { top: 18, left: 6, right: 6 } },
        plugins: {
          legend: { display: true, labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: c => c.dataset.yAxisID === 'y1' ? `Nota ${M.fmtNota(c.raw)}` : `${c.dataset.label} ${M.fmtNps(c.raw)}` } },
          datalabels: { display: c => c.datasetIndex === 0, color: DL, font: { size: 9, weight: '700' }, align: 'top', offset: 3, formatter: v => v == null ? '' : M.fmtNps(v) }
        },
        scales: {
          y: { min: yMin, max: 100, ticks: { stepSize: 25 } },
          y1: { position: 'right', min: 0, max: 10, grid: { drawOnChartArea: false }, ticks: { stepSize: 2 } }
        }
      }
    });
  }

  // Linha simples em % (Compras: lojas sem reunião por ciclo).
  function linhaPct(id, labels, values, cor) {
    HUB_CHART(id, {
      type: 'line',
      data: { labels, datasets: [{ data: values, borderColor: cor, backgroundColor: cor, tension: .3, pointRadius: 3, spanGaps: true }] },
      options: {
        layout: { padding: { top: 18, left: 6, right: 12 } },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => U.fmtPct(c.raw, 0) } },
          datalabels: { color: DL, font: { size: 9, weight: '700' }, align: 'top', offset: 3, formatter: v => v == null ? '' : U.fmtPct(v, 0) }
        },
        scales: { y: { min: 0, max: 1, ticks: { stepSize: 0.25, callback: v => U.fmtPct(v, 0) } } }
      }
    });
  }

  function barras(id, labels, values, cores, opts) {
    opts = opts || {};
    HUB_CHART(id, {
      type: 'bar',
      data: { labels, datasets: [{ data: values, backgroundColor: cores, borderRadius: 5, maxBarThickness: 34 }] },
      options: {
        indexAxis: opts.horizontal ? 'y' : 'x',
        layout: { padding: opts.horizontal ? { right: 44 } : { top: 22 } },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => opts.pct ? U.fmtPct(c.raw, 0) : U.fmtInt(c.raw) } },
          datalabels: { color: DL, font: { size: 10, weight: '700' }, anchor: 'end', align: opts.horizontal ? 'end' : 'top', formatter: v => opts.pct ? U.fmtPct(v, 0) : (v ? U.fmtInt(v) : '') }
        },
        scales: opts.horizontal
          ? { x: Object.assign({ grid: { display: true }, beginAtZero: true }, opts.pct ? { max: 1, ticks: { callback: v => U.fmtPct(v, 0) } } : {}), y: { grid: { display: false } } }
          : { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  function graficoMelhorar(id, st) {
    const ks = M.MELHORAR.concat([M.NADA]);
    const vals = ks.map(k => st.respostas ? (st.melhorar[k] || 0) / st.respostas : 0);
    barras(id, ks, vals, ks.map(k => k === M.NADA ? '#1baf7a' : '#eb6834'), { horizontal: true, pct: true });
  }

  function desenharGeral(ctx) {
    const { idx } = ctx;
    const ciclos = janelaCiclos(idx);
    const todas = m => idx.areas.flatMap(a => (idx.porArea.get(a).get(m)) || []);
    linhaNotaNps('c-sf-evo-geral', ciclos.map(m => { const ac = M.acumuladoGeral(idx, m); return { ciclo: m, s: M.stats(todas(m)), ac: ac && ac.ciclos.length > 1 ? ac.s : null }; }));
    graficoMelhorar('c-sf-melh-geral', M.stats(todas(state.ciclo)));
  }

  function desenharArea(ctx, area) {
    const { idx } = ctx;
    const pa = idx.porArea.get(area);
    if (!pa || !pa.has(state.ciclo)) return;
    linhaNotaNps('c-sf-evo', M.serieArea(idx, area, janelaCiclos(idx)).map(x => { const ac = x.s ? M.acumulado(idx, area, x.ciclo) : null; return { ciclo: x.ciclo, s: x.s, ac: ac && ac.ciclos.length > 1 ? ac.s : null }; }));
    const s = M.stats(pa.get(state.ciclo));
    barras('c-sf-dist', s.dist.map((_, i) => String(i)), s.dist, s.dist.map((_, i) => i >= 9 ? '#1baf7a' : i >= 7 ? '#eda100' : '#e34948'));
    graficoMelhorar('c-sf-melh', s);
    const ex = M.distribuicaoExtra(pa.get(state.ciclo));
    if (ex.length) {
      barras('c-sf-extra', ex.map(e => e[0]), ex.map(e => e[1]), ex.map(() => '#1C7CEC'));
      const cs = janelaCiclos(idx).filter(m => M.semReuniao(pa.get(m)));
      linhaPct('c-sf-reun', cs.map(m => M.rotuloMes(m)), cs.map(m => M.semReuniao(pa.get(m)).pct), '#e34948');
    }
  }

  // ---- Montagem ----------------------------------------------------------------
  function renderConteudo(el) {
    const acesso = M.acessoDe(window.HUB_USER);
    const D = window.HUB_SATISFACAO_DATA;
    const brutas = M.recortar(D.respostas || [], acesso);
    // Simulação: mesma tela sem as avaliações sinalizadas para conferência.
    const respostas = state.simular ? M.semSinalizadas(brutas) : brutas;
    const idx = M.indexar(respostas);
    if (!idx.ciclos.length) {
      el.innerHTML = empty(acesso.completo ? 'Nenhuma resposta da Pesquisa de Satisfação importada ainda.' : 'Ainda não há respostas para as áreas liberadas no seu acesso.',
        acesso.completo ? 'Em Administração → Upload de Planilhas, envie a planilha "16. Base Pesquisa Feedz".' : 'Se você deveria ver alguma área, peça ao administrador do Hub para liberá-la no seu cadastro.');
      return;
    }
    if (!state.ciclo || !idx.ciclos.includes(state.ciclo)) state.ciclo = idx.ciclos[idx.ciclos.length - 1];
    if (idx.areas.length === 1) state.area = idx.areas[0];
    else if (state.area && !idx.areas.includes(state.area)) state.area = '';
    const ctx = { acesso, respostas, brutas, idx, ciclosTab: D.ciclos || [] };

    el.innerHTML = STYLE + topo(ctx) + (state.area ? viewArea(ctx, state.area) : viewGeral(ctx));

    const re = () => renderConteudo(el);
    el.querySelector('#sf-ciclo').addEventListener('change', e => { state.ciclo = e.target.value; re(); });
    el.querySelector('#sf-area').addEventListener('change', e => { state.area = e.target.value; state.busca = ''; re(); });
    el.querySelector('#sf-janela').addEventListener('change', e => { state.janela = Number(e.target.value); re(); });
    el.querySelectorAll('[data-area]').forEach(tr => tr.addEventListener('click', () => { state.area = tr.dataset.area; state.busca = ''; re(); el.scrollIntoView({ block: 'start' }); }));
    const voltar = el.querySelector('#sf-voltar');
    if (voltar) voltar.addEventListener('click', () => { state.area = ''; re(); });
    const sim = el.querySelector('#sf-sim');
    if (sim) sim.addEventListener('change', e => { state.simular = e.target.checked; re(); });
    const simOff = el.querySelector('#sf-sim-off');
    if (simOff) simOff.addEventListener('click', () => { state.simular = false; re(); });

    if (state.area) {
      desenharArea(ctx, state.area);
      desenharComentarios(ctx, state.area);
      const busca = el.querySelector('#sf-busca');
      if (busca) {
        let t = null;
        busca.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.busca = busca.value; desenharComentarios(ctx, state.area); }, 200); });
        el.querySelector('#sf-ordem').addEventListener('change', e => { state.ordem = e.target.value; desenharComentarios(ctx, state.area); });
        el.querySelector('#sf-todos').addEventListener('change', e => { state.todos = e.target.checked; desenharComentarios(ctx, state.area); });
        const tri = el.querySelector('#sf-triados');
        if (tri) tri.addEventListener('change', e => { state.soTriados = e.target.checked; desenharComentarios(ctx, state.area); });
      }
    } else {
      desenharGeral(ctx);
      carregarParticipacao(el);
      // Mapa de calor abre no ciclo mais recente (fim da tabela).
      el.querySelectorAll('.sf-heat-wrap').forEach(w => { w.scrollLeft = w.scrollWidth; });
    }
  }

  // Os dados só são buscados na primeira abertura da tela na sessão (ou depois de
  // "Atualizar dados" / do upload do card 16, que descartam o cache).
  function renderSatisfacao(el) {
    const acesso = M.acessoDe(window.HUB_USER);
    if (!acesso.modulo) { el.innerHTML = empty('Acesso restrito.'); return; }
    if (!acesso.completo && !acesso.areas.length) {
      el.innerHTML = empty('Nenhuma área da Pesquisa de Satisfação liberada para o seu acesso.', 'Peça ao administrador do Hub para marcar, no seu cadastro, as áreas que você acompanha.');
      return;
    }
    if (HUB_SATISFACAO.jaCarregado()) return renderConteudo(el);
    el.innerHTML = empty('Carregando a Pesquisa de Satisfação...');
    HUB_SATISFACAO.carregar().then(() => {
      if (window.HUB_RENDER_CURRENT) window.HUB_RENDER_CURRENT();
      else renderConteudo(el);
    }).catch(err => {
      el.innerHTML = empty('Não consegui carregar a Pesquisa de Satisfação.', esc(err.message || ''));
    });
  }

  window.HUB_SECTIONS = window.HUB_SECTIONS || {};
  window.HUB_SECTIONS.renderSatisfacao = renderSatisfacao;
})();
