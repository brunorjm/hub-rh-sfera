// Indicadores → Pesquisa de Engajamento: acompanhamento da PARTICIPAÇÃO (quem
// foi convidado × quem respondeu) por pulso, unidade e departamento, contra a
// meta de 60%. Não mostra respostas, notas nem comentários — só contagens.
// Dados carregados sob demanda (ver dal-engajamento.js); cálculos em
// metrics-engajamento.js. Usa a MESMA barra de filtros do topo (Data, Unidade,
// Departamento, Gestor) e os componentes de ui-charts.js.
(function () {
  const U = HUB_UTILS;
  const M = HUB_METRICS_ENGAJAMENTO;
  const { kpi, empty, card } = HUB_UI;
  const esc = U.escapeHtml;

  const state = { pulso: '', busca: '', situacao: '', ordem: 'pct' };

  const COR = { ok: '#1baf7a', atencao: '#e0a100', critico: 'var(--critical)', sem: 'var(--muted)' };
  const TINT = { ok: '#E6F7F0', atencao: '#FFF6E0', critico: '#FDECEC', sem: 'transparent' };
  const ROTULO = { ok: 'Na meta', atencao: 'Abaixo da meta', critico: 'Crítico', sem: '—' };
  const BADGE = { ok: 'b2', atencao: 'b4', critico: 'b3' };

  const STYLE = `<style>
    .pc-bar{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px}
    .pc-bar label{display:flex;flex-direction:column;gap:4px;font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px}
    .pc-bar select,.pc-bar input[type=search]{padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:12.5px;font-family:inherit;color:var(--text);background:#fff;min-width:150px}
    .pc-bar input[type=search]{min-width:300px}
    .pc-note{font-size:11px;color:var(--muted);margin-top:8px}
    .eg-top{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px}
    .eg-top select{padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:12.5px;font-family:inherit;color:var(--text);background:#fff;min-width:250px}
    .eg-top label{display:flex;flex-direction:column;gap:4px;font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px}
    .eg-fresh{font-size:11.5px;color:var(--text2);padding-bottom:9px}
    .eg-bar{position:relative;flex:1;min-width:110px;height:9px;border-radius:5px;background:var(--bg)}
    .eg-bar i{display:block;height:100%;border-radius:5px}
    .eg-bar b{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--text);opacity:.5}
    .eg-tbl{max-width:1150px}
    .eg-tbl th{z-index:3;white-space:nowrap}
    .eg-tbl th.num,.eg-tbl td.num{width:84px}
    .eg-cell{display:flex;align-items:center;gap:8px}
    .eg-cell span{font-size:11px;min-width:48px;text-align:right}
    table.dt td.num,table.dt th.num{text-align:right}
    .eg-mx td,.eg-mx th{white-space:nowrap;text-align:center;padding:6px 8px}
    .eg-mx td:first-child,.eg-mx th:first-child{text-align:left;position:sticky;left:0;background:#fff;z-index:1;font-weight:600}
    .eg-mx th:first-child{background:#F7F9FC;z-index:2}
    .eg-mx tr.tot td{font-weight:700}
    .pc-duo{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;margin-bottom:18px}
    #sec-ind-engajamento .kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
    @media (min-width:700px){#sec-ind-engajamento .kpi-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
    @media (min-width:1100px){#sec-ind-engajamento .kpi-grid{grid-template-columns:repeat(6,minmax(0,1fr))}}
    #sec-ind-engajamento .card{margin-bottom:0}
    .eg-body-card{margin-bottom:18px}
    @media (max-width:900px){.pc-duo{grid-template-columns:minmax(0,1fr)}}
  </style>`;

  const pct = (v, est) => v === null || v === undefined ? '—' : (est ? '~' : '') + U.fmtPct(v, 1);
  const num = v => v === null || v === undefined ? '—' : U.fmtInt(v);
  const pp = v => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1).replace('.', ',') + ' p.p.';

  function fmtUltimaResposta(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(s || ''));
    return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : '';
  }
  function fmtAtualizado(iso) {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  // Barra de adesão com o traço da meta.
  function barra(v, status, est) {
    if (v === null || v === undefined) return '—';
    return `<div class="eg-cell"><div class="eg-bar" title="Meta: ${U.fmtPct(M.META, 0)}"><i style="width:${Math.min(100, v * 100)}%;background:${COR[status]}"></i><b style="left:${M.META * 100}%"></b></div><span>${pct(v, est)}</span></div>`;
  }
  function tabelaVazia() { return empty('Sem dados neste recorte.'); }

  // ---- Topo: seletor de pulso + situação dos dados ---------------------------
  function topo(d) {
    const p = d.sel.p;
    const lista = d.pulsos.slice().reverse();
    const opt = s => `<option value="${esc(s.p.inicio)}"${s.p.inicio === p.inicio ? ' selected' : ''}>${esc(s.rotuloLongo)} · ${esc(s.periodo)}${s.p.parcial ? ' · parcial' : ''}</option>`;
    const partes = [];
    if (p.ultima_resposta) partes.push('Última resposta registrada: ' + fmtUltimaResposta(p.ultima_resposta));
    if (p.atualizado_em) partes.push('Importado no Hub em ' + fmtAtualizado(p.atualizado_em));
    const tag = p.parcial ? '<span class="badge b4">Parcial</span>' : '<span class="badge b2">Encerrado</span>';
    return `<div class="eg-top">
      <label>Pulso<select id="eg-pulso">${lista.map(opt).join('')}</select></label>
      <div style="padding-bottom:9px">${tag}</div>
      <span class="eg-fresh">${esc(partes.join(' · '))}</span>
    </div>`;
  }

  // ---- Tabela de unidades ------------------------------------------------------
  function tabelaUnidades(d) {
    if (!d.unidades.length) return tabelaVazia();
    const t = d.totalLinhas;
    const oficial = d.sel.oficial && d.sel.conv !== t.conv
      ? `<p class="pc-note">Total oficial do pulso: ${num(d.sel.conv)} convidados. A soma por unidade (${num(t.conv)}) usa o headcount ativo do Hub, que pode diferir de poucos convidados.</p>` : '';
    const tr = u => `<tr><td>${esc(u.label)}</td><td class="num">${num(u.conv)}</td><td class="num">${num(u.resp)}</td><td class="num">${num(u.pend)}</td><td>${barra(u.pct, u.status, u.est)}</td></tr>`;
    return `<div class="table-wrap"><table class="dt eg-tbl"><thead><tr><th>Unidade</th><th class="num">Convidados</th><th class="num">Responderam</th><th class="num">Pendentes</th><th>Adesão</th></tr></thead><tbody>${d.unidades.map(tr).join('')}
      <tr style="font-weight:700;background:#F7F9FC"><td>Total — ${d.unidades.length} unidades</td><td class="num">${num(t.conv)}</td><td class="num">${num(t.resp)}</td><td class="num">${num(t.pend)}</td><td>${barra(t.pct, t.status, t.est)}</td></tr></tbody></table></div>
      <p class="pc-note">Ordenado da menor para a maior adesão. A linha vertical marca a meta de ${U.fmtPct(M.META, 0)}.</p>${oficial}`;
  }

  // ---- Aba: Visão geral --------------------------------------------------------
  function prazoKpi(d) {
    const p = d.sel.p;
    if (!p.parcial) return kpi('Período', esc(d.sel.periodo), esc(d.sel.cadencia) + ' · encerrado', 'var(--p2)');
    if (d.diasRestantes === null) return kpi('Período', 'Encerrado', `terminou em ${esc(d.sel.periodo.split(' a ')[1])} — envie a planilha 33 atualizada`, 'var(--serious)');
    const v = d.diasRestantes === 0 ? 'Hoje' : d.diasRestantes + (d.diasRestantes === 1 ? ' dia' : ' dias');
    return kpi('Encerra em', v, esc(d.sel.periodo) + ' · ' + esc(d.sel.cadencia), 'var(--p2)');
  }

  function tabGeral(d) {
    const s = d.sel;
    const gap = s.pct === null ? '' : (s.pct >= M.META ? `${pp(s.pct - M.META)} acima da meta` : `${pp(s.pct - M.META)} da meta de ${U.fmtPct(M.META, 0)}`);
    const ant = d.anterior;
    const antSub = ant ? (s.pct !== null && ant.pct !== null ? `${esc(ant.rotuloLongo)} · ${pp(s.pct - ant.pct)}${s.p.parcial ? ' (atual parcial)' : ''}` : esc(ant.rotuloLongo)) : 'sem pulso anterior';
    const aviso = d.estimado
      ? `<div class="insight info" style="margin-bottom:18px"><span class="ic">${HUB_ICON('info')}</span><span>Este pulso é anterior ao registro da base de convidados: os percentuais por unidade/departamento (marcados com "~") usam como base o headcount ativo de hoje. O total da empresa segue o número oficial da aba Adesão.</span></div>` : '';
    return `
      <div class="kpi-grid">
        ${kpi('Adesão', pct(s.pct, s.est && !s.oficial), esc(gap), COR[s.status])}
        ${kpi('Convidados', num(s.conv), `${d.unidades.length} unidades · ${d.departamentos.length} departamentos`, 'var(--p1)')}
        ${kpi('Responderam', num(s.resp), s.conv ? `${U.fmtPct(s.resp / s.conv, 1)} dos convidados` : '', '#1baf7a')}
        ${kpi('Pulso anterior', ant ? pct(ant.pct, ant.est) : '—', antSub, '#8b5cf6')}
        ${kpi('Média dos pulsos', pct(d.media), `${d.pulsos.length} pulso(s) no período`, '#e0a100')}
        ${prazoKpi(d)}
      </div>
      ${aviso}
      <div class="pc-duo">
        ${card('Participação por unidade', '&#127970;', tabelaUnidades(d))}
        ${card('Evolução da adesão (últimos 12 pulsos)', '&#128200;', '<div class="chart-h" style="height:300px"><canvas id="c-eg-evo-geral"></canvas></div><p class="pc-note">Linha tracejada: meta de ' + U.fmtPct(M.META, 0) + '. Ponto vazado: pulso parcial. "~": estimativa por unidade/departamento (histórico).</p>')}
      </div>
      ${cardBaixaAdesao(d)}
      ${tabDepartamentos(d)}`;
  }

  // ---- Departamentos sem resposta ou abaixo da meta -----------------------------
  // Resumo para cobrança: só quem não respondeu nada ou está abaixo da meta, do
  // pior para o melhor (respeita os filtros de Unidade/Departamento/Gestor do topo).
  function cardBaixaAdesao(d) {
    const xs = d.departamentos.filter(x => x.conv && (!x.resp || (x.pct !== null && x.pct < M.META)))
      .sort((a, b) => (a.pct || 0) - (b.pct || 0) || b.conv - a.conv);
    const semResp = xs.filter(x => !x.resp).length;
    const situ = x => !x.resp ? `<span class="badge b3">Sem resposta</span>`
      : x.pct < M.LIMITE_CRITICO ? `<span class="badge b3">Crítica (abaixo de ${U.fmtPct(M.LIMITE_CRITICO, 0)})</span>`
        : `<span class="badge b4">Abaixo da meta</span>`;
    const corpo = xs.length
      ? `<div class="table-wrap" style="max-height:420px"><table class="dt eg-tbl"><thead><tr><th>Departamento</th><th>Unidade</th><th>Gestor</th><th class="num">Convidados</th><th class="num">Responderam</th><th class="num">Participação</th><th>Situação</th></tr></thead><tbody>
        ${xs.map(x => `<tr><td>${esc(x.departamento)}</td><td>${esc(x.unidade || '—')}</td><td>${esc(x.gestor || '—')}</td><td class="num">${num(x.conv)}</td><td class="num">${num(x.resp)}</td><td class="num">${pct(x.pct, x.est)}</td><td>${situ(x)}</td></tr>`).join('')}
        </tbody></table></div>`
      : `<p style="font-size:13px">Todos os departamentos atingiram a meta de ${U.fmtPct(M.META, 0)} neste pulso.</p>`;
    return `<div class="card full eg-body-card">
      <h3><span class="card-ic">${HUB_ICON('alert')}</span>Departamentos sem resposta ou com baixa adesão — ${esc(d.sel.rotuloLongo)}</h3>
      ${corpo}
      <p class="pc-note">${U.fmtInt(xs.length)} de ${U.fmtInt(d.departamentos.length)} departamentos abaixo da meta de ${U.fmtPct(M.META, 0)} (${U.fmtInt(semResp)} sem nenhuma resposta). Convidados = headcount ativo do departamento no pulso.</p>
    </div>`;
  }

  // ---- Gráfico de evolução -------------------------------------------------------
  function desenharEvolucao(id, pulsos) {
    if (!pulsos.length || !document.getElementById(id)) return;
    const vals = pulsos.map(s => s.pct === null ? null : s.pct * 100);
    HUB_CHART(id, {
      type: 'line',
      data: {
        labels: pulsos.map(s => s.rotulo),
        datasets: [
          {
            label: 'Adesão', data: vals, borderColor: '#1C7CEC', backgroundColor: '#1C7CEC22', tension: .25, fill: true,
            pointRadius: 4, pointBackgroundColor: pulsos.map(s => s.p.parcial ? '#fff' : '#1C7CEC'), pointBorderColor: '#1C7CEC', pointBorderWidth: 2,
            segment: { borderDash: c => pulsos[c.p1DataIndex] && pulsos[c.p1DataIndex].p.parcial ? [5, 4] : undefined }
          },
          { label: 'Meta ' + U.fmtPct(M.META, 0), data: pulsos.map(() => M.META * 100), borderColor: '#c98500', borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5, fill: false, datalabels: { display: false } }
        ]
      },
      options: {
        layout: { padding: { top: 20, left: 6, right: 14 } },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              title: items => { const s = pulsos[items[0].dataIndex]; return `${s.rotuloLongo} · ${s.periodo}${s.p.parcial ? ' (parcial)' : ''}`; },
              label: ctx => {
                if (ctx.datasetIndex !== 0) return ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(0) + '%';
                const s = pulsos[ctx.dataIndex];
                return `Adesão: ${ctx.parsed.y.toFixed(1).replace('.', ',')}% (${U.fmtInt(s.resp)} de ${U.fmtInt(s.conv)}) · ${s.cadencia}`;
              }
            }
          },
          datalabels: {
            color: '#16181D', font: { size: 9, weight: '700' }, align: 'top', offset: 4, clip: false,
            display: ctx => ctx.datasetIndex === 0 && ctx.dataset.data[ctx.dataIndex] !== null,
            formatter: v => v === null ? '' : Math.round(v) + '%'
          }
        },
        scales: {
          y: { min: 0, suggestedMax: 80, ticks: { callback: v => v + '%' } },
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } }
        }
      }
    });
  }

  // ---- Aba: Departamentos --------------------------------------------------------
  function departamentosFiltrados(d) {
    const q = U.normalizeText(state.busca);
    let list = d.departamentos.filter(x => {
      if (state.situacao && x.status !== state.situacao) return false;
      if (q && !U.normalizeText(x.departamento + ' ' + x.unidade + ' ' + (x.gestor || '')).includes(q)) return false;
      return true;
    });
    const cmp = {
      pct: (a, b) => (a.pct === null) - (b.pct === null) || a.pct - b.pct,
      pend: (a, b) => (b.pend || 0) - (a.pend || 0),
      nome: (a, b) => a.departamento.localeCompare(b.departamento, 'pt-BR')
    }[state.ordem] || (() => 0);
    return list.sort(cmp);
  }

  function departamentosLista(d) {
    const list = departamentosFiltrados(d);
    if (!list.length) return empty('Nenhum departamento com esses filtros.');
    const tr = x => `<tr>
      <td>${esc(x.departamento)}${x.pequena ? ' <span class="badge b1" title="Equipe pequena: cada resposta muda bastante o percentual">equipe pequena</span>' : ''}</td>
      <td>${esc(x.gestor || '—')}</td>
      <td class="num">${num(x.conv)}</td><td class="num">${num(x.resp)}</td><td class="num">${num(x.pend)}</td>
      <td>${barra(x.pct, x.status, x.est)}</td></tr>`;
    return `<p class="pc-note" style="margin:0 0 10px">${U.fmtInt(list.length)} departamento(s)</p>
      <div class="table-wrap" style="max-height:560px"><table class="dt eg-tbl"><thead><tr><th>Departamento</th><th>Gestor</th><th class="num">Convid.</th><th class="num">Resp.</th><th class="num">Pend.</th><th>Adesão</th></tr></thead><tbody>${list.map(tr).join('')}</tbody></table></div>`;
  }

  function tabDepartamentos(d) {
    const opt = (v, l, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`;
    return `<div class="card full eg-body-card">
      <h3><span class="card-ic">${HUB_ICON('folder')}</span>Participação por departamento — ${esc(d.sel.rotuloLongo)}</h3>
      <div class="pc-bar">
        <label>Situação<select id="eg-f-sit">${opt('', 'Todas', state.situacao)}${opt('critico', 'Crítico (< ' + U.fmtPct(M.LIMITE_CRITICO, 0) + ')', state.situacao)}${opt('atencao', 'Abaixo da meta', state.situacao)}${opt('ok', 'Na meta', state.situacao)}</select></label>
        <label>Ordenar por<select id="eg-f-ord">${opt('pct', 'Menor adesão', state.ordem)}${opt('pend', 'Mais pendentes', state.ordem)}${opt('nome', 'Nome', state.ordem)}</select></label>
        <label>Buscar<input type="search" id="eg-f-busca" placeholder="departamento, unidade ou gestor" value="${esc(state.busca)}"></label>
      </div>
      <div id="eg-dep-lista">${departamentosLista(d)}</div>
      <p class="pc-note">Gestor = gestor direto mais frequente entre os convidados do departamento. Use também os filtros de Unidade, Departamento e Gestor no topo da página.</p>
    </div>`;
  }

  function wireDepartamentos(d) {
    const refresh = () => { document.getElementById('eg-dep-lista').innerHTML = departamentosLista(d); };
    const bind = (id, key, ev) => document.getElementById(id).addEventListener(ev || 'change', e => { state[key] = e.target.value; refresh(); });
    bind('eg-f-sit', 'situacao'); bind('eg-f-ord', 'ordem'); bind('eg-f-busca', 'busca', 'input');
  }

  // ---- Render --------------------------------------------------------------------------
  function renderConteudo(el, f) {
    const d = M.engajamentoMetrics(f, { pulso: state.pulso });
    if (!d.temDados) {
      el.innerHTML = empty('Nenhum pulso da Pesquisa de Engajamento importado ainda.',
        'Em Administração → Upload de Planilhas, envie o histórico (33) e o export "Participação" do Feedz (33.1).');
      return;
    }
    if (d.vazio) {
      el.innerHTML = empty('Nenhum pulso no período selecionado.', 'Ajuste as datas na barra de filtros.');
      return;
    }
    state.pulso = d.sel.p.inicio;
    el.innerHTML = STYLE + topo(d) + tabGeral(d);
    el.querySelector('#eg-pulso').addEventListener('change', e => { state.pulso = e.target.value; renderConteudo(el, f); });
    desenharEvolucao('c-eg-evo-geral', d.pulsos.slice(-12));
    wireDepartamentos(d);
  }

  window.HUB_SECTIONS = window.HUB_SECTIONS || {};
  // Os dados só são buscados na primeira abertura da tela na sessão (ou depois de
  // "Atualizar dados" / de um upload, que descartam o cache).
  function renderEngajamento(el, f) {
    if (HUB_ENGAJAMENTO.jaCarregado()) return renderConteudo(el, f);
    el.innerHTML = empty('Carregando a Pesquisa de Engajamento...');
    HUB_ENGAJAMENTO.carregar().then(() => {
      if (window.HUB_REFRESH_FILTER_OPTIONS) window.HUB_REFRESH_FILTER_OPTIONS();
      if (window.HUB_RENDER_CURRENT) window.HUB_RENDER_CURRENT();
    }).catch(err => {
      const semTabela = /schema cache|does not exist|not find/i.test(err.message || '');
      el.innerHTML = empty('Não consegui carregar a Pesquisa de Engajamento.',
        semTabela ? 'As tabelas ainda não existem no Supabase (rode supabase-engajamento.sql).' : (err.message || ''));
    });
  }

  window.HUB_SECTIONS.renderEngajamento = renderEngajamento;
})();
