// Indicadores → Avaliação da Experiência: painel das avaliações do período
// de experiência (AVE 45 dias e AVE 90 dias), em que o gestor avalia o
// colaborador e o colaborador se autoavalia (notas 1-4) e o gestor decide
// aprovar ou não o colaborador no "Batendo o Martelo". Três visões: 45 dias,
// 90 dias e a Evolução 45 → 90; nas duas primeiras, duas abas —
// "Indicadores" (gráficos) e "Lista de Colaboradores" (quem, com nota,
// decisão e comentário do gestor). Os cálculos ficam em
// metrics-experiencia.js; a busca dos dados (sob demanda) em
// dal-experiencia.js.
(function () {
  const U = HUB_UTILS;
  const M = HUB_EXP_METRICS;
  const { kpi, empty, card, insightsCard, insightsList, barChart, doughnutChart } = HUB_UI;

  let ciclo = 45;               // 45 | 90 | 'evolucao'
  let desconsiderarNatal = true;    // Extra Natal fora dos ciclos de 45/90 (tem aba e calendário próprios)
  let desconsiderarDispensa = true; // aprendiz/estagiário fora da contagem (avaliação não obrigatória)
  let aba = 'indicadores';      // 'indicadores' | 'lista'
  const lista = { busca: '', conceito: 'todos', status: 'todos', situacaoColab: 'todos', ordem: 'recentes', pagina: 1 };
  const PAGE_SIZE = 25;
  let tokenRender = 0;
  let ultimoFiltro = '';
  let listaAtual = [];

  function canUpload() { return HUB_PERMISSIONS.hasPerm(HUB_USER, 'admin.upload'); }
  const esc = U.escapeHtml;
  const fmt1 = U.fmt1;
  const fmt2 = v => (v === null || v === undefined ? '—' : v.toFixed(2).replace('.', ','));
  const pct = v => U.fmtPct(v, 0);
  const sinal = v => (v > 0 ? '+' : '') + fmt1(v);

  const MARTELO_MINI = { 1: 'Reprov. cultura', 2: 'Reprov. perform.', 3: 'Aprov. c/ ressalvas', 4: 'Aprov. s/ ressalvas' };

  function pillMartelo(v) {
    if (!(v >= 1 && v <= 4)) return '<span class="ave-pill" style="--c:#8A8F98">Sem decisão</span>';
    return `<span class="ave-pill" style="--c:${M.CORES_MARTELO[v]}">${esc(M.MARTELO_CURTO[v])}</span>`;
  }
  function pillDispensa(r) {
    return r._d.dispensa ? `<span class="ave-pill" style="--c:#8A6FD6" title="Contrato fixo e predeterminado — avaliação de experiência não obrigatória">${esc(r._d.dispensa)} · não obrigatória</span>` : '';
  }
  function pillSituacao(s) {
    if (!s || !M.SITUACOES[s]) return '<span class="ave-pill" style="--c:#C9D0DA" title="Não encontrado no cadastro de Colaboradores (Headcount)">Não encontrado</span>';
    return `<span class="ave-pill" style="--c:${M.CORES_SITUACAO[s]}">${esc(M.SITUACOES[s])}</span>`;
  }
  function pillConceito(v) {
    if (!(v >= 1 && v <= 4)) return '<span style="color:var(--muted)">—</span>';
    return `<span class="ave-pill" style="--c:${M.CORES_CONCEITO[v]}">${v} · ${esc(M.CONCEITOS[v])}</span>`;
  }
  function notaMedia(v) {
    if (v === null || v === undefined) return '<span style="color:var(--muted)">—</span>';
    const c = M.conceitoDaMedia(v);
    return `<span class="ave-dot" style="--c:${M.CORES_CONCEITO[c]}"></span><b>${fmt1(v)}</b>`;
  }
  // Prazo de resposta (ciclo − 5 dias) e fim do período: ver prazoResposta()
  // em metrics-experiencia.js. sit/dias vêm de r._d (gestor) ou autoSit/autoDias.
  function prazoPill(sit, n, fim, deslig) {
    const pl = (cor, txt, title) => `<span class="ave-pill" style="--c:${cor}" title="${esc(title || '')}">${txt}</span>`;
    const ate = fim ? ` (período termina em ${U.fmtDateBR(fim)})` : '';
    if (sit === 'entregue_prazo') return pl('#1baf7a', 'No prazo', n < 0 ? `Respondeu ${-n} dia(s) antes do prazo` : 'Respondeu no último dia do prazo');
    if (sit === 'entregue_atraso') return pl('#eb6834', `+${n}d após o prazo`, `Respondeu ${n} dia(s) depois do prazo, ainda dentro do período`);
    if (sit === 'entregue_fora') return pl('#9b1c1c', `+${n}d após o prazo`, `Respondeu ${n} dia(s) depois do prazo, já fora do período de experiência`);
    if (sit === 'saiu_antes') return pl('#8A8F98', 'Saiu antes do prazo', 'Desligado(a) antes do prazo de resposta — não há atraso a cobrar');
    if (deslig && (sit === 'atrasada' || sit === 'vencida')) return pl(sit === 'vencida' ? '#9b1c1c' : '#e5533d', `Sem resposta até sair · +${n}d`, `Desligado(a) sem responder: atraso contado até a data do desligamento (${n} dia(s) após o prazo de resposta)`);
    if (sit === 'atrasada') return pl('#e5533d', `Atrasada ${n}d`, `Prazo de resposta venceu há ${n} dia(s)${ate} — ainda dá tempo`);
    if (sit === 'vencida') return pl('#9b1c1c', `Sem resposta · +${n}d`, `Período de experiência encerrado sem a avaliação (${n} dia(s) após o prazo de resposta)`);
    if (sit === 'a_vencer') return pl(n >= -7 ? '#eda100' : '#8A8F98', n === 0 ? 'Prazo hoje' : `Faltam ${-n}d`, 'Dentro do prazo de resposta');
    return '<span style="color:var(--muted)">—</span>';
  }
  const EM_ATRASO_UI = s => s === 'atrasada' || s === 'vencida';
  function notaFinalHtml(d) {
    if (d.notaFinal === null || d.notaFinal === undefined) return '<span style="color:var(--muted)">—</span>';
    const c = M.conceitoDaMedia(d.notaFinal);
    const tip = d.notaFinalParcial ? 'Sem autoavaliação: considera só a nota do gestor' : `Gestor ${fmt1(d.mediaGestor)} × ${M.PESO_GESTOR * 100}% + colaborador ${fmt1(d.mediaAuto)} × ${M.PESO_AUTO * 100}%`;
    return `<span title="${esc(tip)}"><span class="ave-dot" style="--c:${M.CORES_CONCEITO[c]}"></span><b>${fmt2(d.notaFinal)}</b>${d.notaFinalParcial ? '<sup style="color:var(--muted)">*</sup>' : ''}</span>`;
  }
  function statusIcone(s) {
    if (s === 'concluida') return '<span title="Concluída" style="color:var(--good);font-weight:700">&#10003;</span>';
    if (s === 'rascunho') return '<span title="Em rascunho (não concluída)" style="color:var(--warning);font-weight:700">&#9998;</span>';
    if (s === 'pendente') return '<span title="Pendente" style="color:var(--critical);font-weight:700">&#9203;</span>';
    return '<span style="color:var(--muted)">—</span>';
  }

  // ==================================================================
  // Entrada
  // ==================================================================
  function renderExperiencia(el, f) {
    f = Object.assign({}, f, { semDispensa: desconsiderarDispensa, semNatal: desconsiderarNatal });
    const assinatura = JSON.stringify(f);
    if (assinatura !== ultimoFiltro) { lista.pagina = 1; ultimoFiltro = assinatura; }
    const meu = ++tokenRender;
    const carregados = c => window.HUB_EXPERIENCIA_DATA[c];
    const sub = c => carregados(c) ? `${U.fmtInt(carregados(c).length)} colaboradores` : 'clique para carregar';
    el.innerHTML = `
      <div class="ave-top">
        <div class="ave-ciclos">
          <button type="button" class="ave-ciclo ${ciclo === 45 ? 'active' : ''}" data-ciclo="45"><b>Avaliação de 45 dias</b><span>${sub(45)}</span></button>
          <button type="button" class="ave-ciclo ${ciclo === 90 ? 'active' : ''}" data-ciclo="90"><b>Avaliação de 90 dias</b><span>${sub(90)}</span></button>
          <button type="button" class="ave-ciclo ${ciclo === 'evolucao' ? 'active' : ''}" data-ciclo="evolucao"><b>Evolução 45 &rarr; 90 dias</b><span>mesmo colaborador nos dois ciclos</span></button>
          <button type="button" class="ave-ciclo ${ciclo === 'natal' ? 'active' : ''}" data-ciclo="natal"><b>Extra Natal</b><span>${U.fmtInt(HUB_EXP_NATAL.contagemAtual())} contratados em ${new Date().getFullYear()}</span></button>
        </div>
        ${ciclo === 'evolucao' || ciclo === 'natal' ? '' : `<div class="tab-bar" style="margin-bottom:0">
          <button type="button" class="tab-btn ${aba === 'indicadores' ? 'active' : ''}" data-ave-aba="indicadores">Indicadores</button>
          <button type="button" class="tab-btn ${aba === 'lista' ? 'active' : ''}" data-ave-aba="lista">Lista de Colaboradores</button>
        </div>`}
      </div>
      ${ciclo === 'natal' ? '' : `<div style="display:flex;gap:6px 22px;flex-wrap:wrap;margin:0 0 12px">
      <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text2);margin:0;cursor:pointer" title="Jovens aprendizes e estagiários têm contrato fixo e predeterminado: a avaliação de experiência (até 90 dias) não é obrigatória para eles">
        <input type="checkbox" id="ave-dispensa" style="width:auto" ${desconsiderarDispensa ? 'checked' : ''}> Desconsiderar jovens aprendizes e estagiários (avaliação não obrigatória)
      </label>
      <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text2);margin:0;cursor:pointer" title="Os contratados de Extra Natal têm período de experiência próprio (calendário do DP) e são acompanhados na aba Extra Natal">
        <input type="checkbox" id="ave-natal" style="width:auto" ${desconsiderarNatal ? 'checked' : ''}> Desconsiderar Extra Natal (acompanhado na aba própria)
      </label>
      </div>`}
      <div id="ave-body"><div class="empty"><p>Carregando avaliações...</p></div></div>`;
    const cbDisp = el.querySelector('#ave-dispensa'), cbNatal = el.querySelector('#ave-natal');
    if (cbDisp) cbDisp.addEventListener('change', e => { desconsiderarDispensa = e.target.checked; lista.pagina = 1; renderExperiencia(el, f); });
    if (cbNatal) cbNatal.addEventListener('change', e => { desconsiderarNatal = e.target.checked; lista.pagina = 1; renderExperiencia(el, f); });
    el.querySelectorAll('[data-ciclo]').forEach(b => b.addEventListener('click', () => {
      ciclo = b.dataset.ciclo === 'evolucao' || b.dataset.ciclo === 'natal' ? b.dataset.ciclo : Number(b.dataset.ciclo);
      lista.pagina = 1;
      renderExperiencia(el, f);
    }));
    el.querySelectorAll('[data-ave-aba]').forEach(b => b.addEventListener('click', () => {
      aba = b.dataset.aveAba;
      renderExperiencia(el, f);
    }));

    const body = el.querySelector('#ave-body');
    const ciclos = ciclo === 'evolucao' || ciclo === 'natal' ? [45, 90] : [ciclo];
    Promise.all(ciclos.map(c => HUB_EXPERIENCIA.carregar(c))).then(() => {
      if (meu !== tokenRender) return;
      if (typeof window.HUB_REFRESH_FILTER_OPTIONS === 'function') window.HUB_REFRESH_FILTER_OPTIONS();
      ciclos.forEach(c => { const sp = el.querySelector(`[data-ciclo="${c}"] span`); if (sp) sp.textContent = `${U.fmtInt(carregados(c).length)} colaboradores`; });
      if (ciclo === 'evolucao') return renderEvolucao(body, f);
      if (ciclo === 'natal') return HUB_EXP_NATAL.render(body, f);
      const rows = carregados(ciclo);
      if (!rows.length) {
        body.innerHTML = empty(`Nenhuma avaliação de ${ciclo} dias importada ainda.`,
          canUpload() ? `Vá em Administração → Upload de Planilhas e envie o arquivo "AVE ${ciclo} DIAS.xlsx".` : 'Peça para um administrador importar a planilha.');
        return;
      }
      M.preparar(rows, ciclo);
      const filtradas = M.filtrar(rows, f);
      if (aba === 'lista') renderLista(body, filtradas, f);
      else renderIndicadores(body, filtradas);
    }).catch(err => {
      if (meu !== tokenRender) return;
      const faltaTabela = /relation|does not exist|schema cache|could not find/i.test(err.message || '');
      body.innerHTML = empty('Não consegui carregar as avaliações.',
        faltaTabela ? 'A tabela ainda não existe no Supabase — rode o script migracao-avaliacao-experiencia.sql no SQL Editor e depois importe as planilhas em Administração → Upload de Planilhas.' : esc(err.message || ''));
    });
  }

  // ==================================================================
  // Gráficos auxiliares
  // ==================================================================
  function alturaPara(n, min) { return Math.max(min || 200, n * 34 + 80); }

  // Barras empilhadas horizontais em 100% (cada linha soma 100%).
  function stackedPct(id, labels, seriesLabels, seriesColors, counts) {
    const totais = labels.map((_, i) => counts.reduce((s, arr) => s + arr[i], 0));
    const data = counts.map(arr => arr.map((v, i) => totais[i] ? +(v / totais[i] * 100).toFixed(1) : 0));
    HUB_CHART(id, {
      type: 'bar',
      data: { labels, datasets: seriesLabels.map((l, k) => ({ label: l, data: data[k], backgroundColor: seriesColors[k], borderWidth: 0, maxBarThickness: 26 })) },
      options: {
        indexAxis: 'y',
        scales: { x: { stacked: true, max: 100, ticks: { callback: v => v + '%' } }, y: { stacked: true, grid: { display: false } } },
        plugins: {
          legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${U.fmtInt(counts[c.datasetIndex][c.dataIndex])} (${String(c.raw).replace('.', ',')}%)` } },
          datalabels: { color: '#fff', font: { size: 9, weight: '700' }, formatter: v => v >= 8 ? Math.round(v) + '%' : '' }
        }
      }
    });
  }

  function groupedBars(id, labels, series, opts) {
    opts = opts || {};
    HUB_CHART(id, {
      type: 'bar',
      data: { labels, datasets: series.map(s => ({ label: s.label, data: s.data, backgroundColor: s.color, borderRadius: 4, maxBarThickness: 18 })) },
      options: {
        indexAxis: opts.horizontal ? 'y' : 'x',
        layout: { padding: opts.horizontal ? { right: 36 } : { top: 20 } },
        scales: {
          x: Object.assign({ grid: { display: !!opts.horizontal } }, opts.horizontal ? { min: opts.min, max: opts.max } : {}),
          y: Object.assign({ grid: { display: !opts.horizontal } }, opts.horizontal ? {} : { min: opts.min, max: opts.max })
        },
        plugins: {
          legend: { display: series.length > 1, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
          datalabels: { color: '#16181D', font: { size: 9, weight: '700' }, anchor: 'end', align: opts.horizontal ? 'end' : 'top', formatter: v => v === null ? '' : (opts.fmt ? opts.fmt(v) : fmt1(v)) }
        }
      }
    });
  }

  function miniDist(dist, cores) {
    const t = dist.reduce((s, v) => s + v, 0);
    if (!t) return '<span style="color:var(--muted)">—</span>';
    return `<div class="ave-mini" title="${dist.map((v, i) => `${i + 1}: ${v}`).join(' · ')}">${dist.map((v, i) => v ? `<div style="width:${v / t * 100}%;background:${cores[i + 1]}"></div>` : '').join('')}</div>`;
  }

  // ==================================================================
  // Aba INDICADORES
  // ==================================================================
  function renderIndicadores(body, rows) {
    if (!rows.length) { body.innerHTML = empty('Nenhuma avaliação no período/filtros selecionados.', 'Amplie o período na barra de filtros (o padrão é o ano corrente).'); return; }
    const d = M.calcular(rows, ciclo);
    const m = d.martelo;
    const conceitoMedio = M.conceitoDaMedia(d.mediaGestor);

    const kpis = `
      <div class="kpi-grid">
        ${kpi('Colaboradores no ciclo', U.fmtInt(d.total), `${U.fmtInt(d.gestor.concluidas)} com avaliação do gestor concluída`, 'var(--p1)')}
        ${kpi('Adesão — avaliação do gestor', d.gestor.taxa === null ? '—' : pct(d.gestor.taxa), `${U.fmtInt(d.gestor.concluidas)} de ${U.fmtInt(d.gestor.base)} · ${U.fmtInt(d.gestor.pendentes + d.gestor.rascunho)} pendentes`, d.gestor.taxa !== null && d.gestor.taxa < 0.8 ? 'var(--critical)' : '#1baf7a')}
        ${kpi('Adesão — autoavaliação', d.auto.taxa === null ? '—' : pct(d.auto.taxa), `${U.fmtInt(d.auto.concluidas)} de ${U.fmtInt(d.auto.base)} · ${U.fmtInt(d.auto.pendentes + d.auto.rascunho)} pendentes`, d.auto.taxa !== null && d.auto.taxa < 0.7 ? 'var(--critical)' : '#1baf7a')}
        ${kpi('Aprovados no período', m.pctAprov === null ? '—' : pct(m.pctAprov), `${U.fmtInt(m.dist[2] + m.dist[3])} de ${U.fmtInt(m.n)} decisões`, '#1baf7a')}
        ${kpi('Aprovados COM ressalvas', m.pctRessalvas === null ? '—' : pct(m.pctRessalvas), `${U.fmtInt(m.dist[2])} colaboradores`, '#eda100')}
        ${kpi('Reprovados', m.pctReprov === null ? '—' : pct(m.pctReprov), `${U.fmtInt(m.dist[1])} performance · ${U.fmtInt(m.dist[0])} cultura`, 'var(--critical)')}
        ${kpi('Nota média — gestor', d.mediaGestor === null ? '—' : fmt1(d.mediaGestor), conceitoMedio ? M.CONCEITOS[conceitoMedio] : '', '#4a3aa7')}
        ${kpi('Nota média — autoavaliação', d.mediaAuto === null ? '—' : fmt1(d.mediaAuto), d.mediaAuto === null ? '' : M.CONCEITOS[M.conceitoDaMedia(d.mediaAuto)], '#805AD5')}
        ${kpi('Autoavaliação x gestor', d.gapMedio === null ? '—' : sinal(d.gapMedio), `${U.fmtInt(d.nAmbos)} pessoas com as duas avaliações`, '#e87ba4')}
        ${kpi('Gestor sem resposta após o prazo', U.fmtInt(d.prazo.emAtraso), d.prazo.emAtraso ? `${U.fmtInt(d.prazo.atrasadas)} ainda dentro do período · ${U.fmtInt(d.prazo.encerradas)} período encerrado · ${U.fmtInt(d.prazo.emAtrasoDeslig)} de desligados (atraso até a saída)${d.prazo.aVencer7 ? ' · +' + U.fmtInt(d.prazo.aVencer7) + ' vencem em 7 dias' : ''}` : (d.prazo.aVencer ? `${U.fmtInt(d.prazo.aVencer)} ainda dentro do prazo` : 'nenhuma pendente'), d.prazo.emAtraso ? 'var(--critical)' : '#1baf7a')}
        ${kpi('Desligados sem avaliação', U.fmtInt(d.desligSemAval.total), d.desligSemAval.total ? `${pct(d.desligSemAval.pct)} do ciclo · ${d.desligSemAval.diasMedio === null ? '—' : U.fmtInt(Math.round(d.desligSemAval.diasMedio)) + ' dias de casa em média'} · ${U.fmtInt(d.desligSemAval.semNenhuma)} sem nenhuma resposta` : 'nenhum', d.desligSemAval.total ? 'var(--critical)' : '#1baf7a')}
        ${kpi('Gestor respondeu no prazo', d.prazo.pctNoPrazo === null ? '—' : pct(d.prazo.pctNoPrazo), `${U.fmtInt(d.prazo.noPrazo)} de ${U.fmtInt(d.prazo.entregues)} até o dia ${d.prazo.prazoDia} da admissão`, d.prazo.pctNoPrazo !== null && d.prazo.pctNoPrazo < 0.8 ? 'var(--critical)' : '#1baf7a')}
        ${kpi('Atraso médio de quem respondeu fora do prazo', d.prazo.atrasoMedioEntregues === null ? '—' : `${U.fmtInt(Math.round(d.prazo.atrasoMedioEntregues))} dias`, `${U.fmtInt(d.prazo.entregueForaPrazo)} avaliações do gestor entregues após o prazo`, '#eb6834')}
        ${kpi('Colaborador respondeu no prazo', d.prazo.auto.pctNoPrazo === null ? '—' : pct(d.prazo.auto.pctNoPrazo), `${U.fmtInt(d.prazo.auto.noPrazo)} de ${U.fmtInt(d.prazo.auto.entregues)} autoavaliações · ${U.fmtInt(d.prazo.auto.emAtraso)} pendentes fora do prazo`, d.prazo.auto.pctNoPrazo !== null && d.prazo.auto.pctNoPrazo < 0.7 ? 'var(--critical)' : '#1baf7a')}
        ${kpi('Prazo até a avaliação do gestor', d.prazo.media === null ? '—' : `${U.fmtInt(Math.round(d.prazo.media))} dias`, d.prazo.pctTardias === null ? '' : `${pct(d.prazo.pctTardias)} feitas após o dia ${ciclo}`, '#eb6834')}
      </div>`;

    // Termômetro (Batendo o Martelo)
    const segs = [4, 3, 2, 1].map(v => ({ v, n: m.dist[v - 1] }));
    const termometro = card('Termômetro de aprovação — "Batendo o Martelo"', '&#127777;&#65039;', m.n ? `
      <p class="sub" style="margin-bottom:12px;font-size:12px;color:var(--text2)">Decisão final do gestor sobre a continuidade do colaborador após ${ciclo} dias. Base: <strong>${U.fmtInt(m.n)}</strong> avaliações do gestor concluídas${d.gestor.pendentes + d.gestor.rascunho ? ` (outras <strong>${U.fmtInt(d.gestor.pendentes + d.gestor.rascunho)}</strong> ainda sem decisão)` : ''}.</p>
      <div class="ave-termo">${segs.map(s => s.n ? `<div class="ave-termo-seg" style="width:${s.n / m.n * 100}%;background:${M.CORES_MARTELO[s.v]}" title="${esc(M.MARTELO[s.v])}: ${s.n}"><span class="n">${pct(s.n / m.n)}</span><span class="l">${s.n >= m.n * 0.12 ? esc(MARTELO_MINI[s.v]) : ''}</span></div>` : '').join('')}</div>
      <div class="ave-legenda">${segs.map(s => `<div class="ave-leg" style="--c:${M.CORES_MARTELO[s.v]}"><i></i><div><b>${esc(M.MARTELO[s.v])}</b><span>Nota ${s.v} · ${U.fmtInt(s.n)} colaborador(es) · ${pct(s.n / m.n)}</span></div></div>`).join('')}</div>` : empty('Nenhuma decisão do gestor no período.'), { full: true });

    // Por marca / unidade / cargo (aprovação)
    const decList = arr => arr.filter(g => g.decididos >= 1);
    const marcas = decList(d.porMarca);
    const unidades = decList(d.porUnidade).sort((a, b) => b.decididos - a.decididos).slice(0, 12);
    const cargos = decList(d.porCargo).sort((a, b) => b.decididos - a.decididos).slice(0, 10);
    const chartBox = (id, n) => `<div class="chart-h" style="height:${alturaPara(n, 190)}px"><canvas id="${id}"></canvas></div>`;

    // Evolução mensal
    const temSerie = d.serie.length > 1;

    // Competências de negócio (só para cargos específicos)
    const negocioHtml = d.negocio.length ? `<div class="table-wrap"><table class="dt"><thead><tr><th>Competência</th><th>Avaliados</th><th>Média (gestor)</th><th>Distribuição de notas</th></tr></thead><tbody>${d.negocio.map(c => `<tr><td>${esc(c.comp)}</td><td>${U.fmtInt(c.nGestor)}</td><td>${notaMedia(c.mediaGestor)}</td><td style="min-width:150px">${miniDist(c.distGestor, M.CORES_CONCEITO)}</td></tr>`).join('')}</tbody></table></div><p class="sub" style="margin-top:8px">Só se aplicam a alguns cargos (vendas, caixa e liderança de loja) e são avaliadas pelo gestor.</p>` : empty('Sem competências de negócio no período.');

    // Rankings de gestores
    const gestPend = d.porGestor.filter(g => g.gestorPendentes > 0).sort((a, b) => (b.emAtraso - a.emAtraso) || (b.gestorPendentes - a.gestorPendentes)).slice(0, 12);
    const gestDec = d.porGestor.filter(g => g.decididos >= 5).sort((a, b) => (b.pctReprov - a.pctReprov) || (b.decididos - a.decididos)).slice(0, 12);
    const tabGestPend = gestPend.length ? `<div class="table-wrap"><table class="dt"><thead><tr><th>Gestor</th><th>Pendentes</th><th title="Pendentes com o prazo de resposta (dia ${ciclo - 5}) vencido">Fora do prazo</th><th>Concluídas</th><th>Adesão</th></tr></thead><tbody>${gestPend.map(g => `<tr><td>${esc(g.label)}</td><td><b style="color:var(--critical)">${U.fmtInt(g.gestorPendentes)}</b></td><td>${g.emAtraso ? `<b style="color:var(--critical)">${U.fmtInt(g.emAtraso)}</b> <span style="color:var(--muted);font-size:10.5px">(~${U.fmtInt(Math.round(g.atrasoMedioEmAtraso))}d)</span>` : '<span style="color:var(--muted)">0</span>'}</td><td>${U.fmtInt(g.gestorConcluidas)}</td><td>${g.adesaoGestor === null ? '—' : pct(g.adesaoGestor)}</td></tr>`).join('')}</tbody></table></div>` : empty('Nenhuma avaliação pendente.');
    const tabGestDec = gestDec.length ? `<div class="table-wrap"><table class="dt"><thead><tr><th>Gestor</th><th>Decisões</th><th>Aprov. s/ ress.</th><th>c/ ress.</th><th>Reprovados</th><th>Nota média dada</th></tr></thead><tbody>${gestDec.map(g => `<tr><td>${esc(g.label)}</td><td>${U.fmtInt(g.decididos)}</td><td>${pct(g.pctSemRessalvas)}</td><td>${pct(g.pctRessalvas)}</td><td><b style="color:${g.pctReprov >= 0.3 ? 'var(--critical)' : 'inherit'}">${pct(g.pctReprov)}</b></td><td>${notaMedia(g.mediaGestor)}</td></tr>`).join('')}</tbody></table></div><p class="sub" style="margin-top:8px">Gestores com pelo menos 5 decisões no período, ordenados pela maior taxa de reprovação.</p>` : empty('Poucas decisões por gestor no período.');

    // Desligados sem avaliação registrada
    const ds = d.desligSemAval;
    const tabDeslig = ds.total ? `<p class="sub" style="margin-bottom:10px;font-size:12px;color:var(--text2)">Colaboradores liberados para a avaliação de ${ciclo} dias que <strong>foram desligados sem a avaliação do gestor</strong> — saíram da empresa sem registro avaliativo. ${U.fmtInt(ds.soAuto)} chegaram a fazer a autoavaliação.</p>
      <div class="table-wrap"><table class="dt"><thead><tr><th>Colaborador</th><th>Unidade / gestor</th><th>Admissão</th><th>Saída</th><th>Dias de casa</th><th>Autoavaliação</th></tr></thead><tbody>${ds.lista.slice(0, 15).map(p => `<tr><td><b>${esc(p.nome)}</b><div style="color:var(--muted);font-size:10.5px">${esc(p.cargo)}</div></td><td>${esc(p.unidade)}<div style="color:var(--muted);font-size:10.5px">${esc(p.gestor)}</div></td><td>${p.admissao ? U.fmtDateBR(p.admissao) : '—'}</td><td>${p.saida ? U.fmtDateBR(p.saida) : '—'}</td><td>${p.diasCasa === null ? '—' : U.fmtInt(p.diasCasa)}</td><td>${p.autoFeita ? 'Respondeu' : '<span style="color:var(--critical)">Não respondeu</span>'}</td></tr>`).join('')}</tbody></table></div>${ds.lista.length > 15 ? `<p class="sub" style="margin-top:8px">Mostrando 15 de ${U.fmtInt(ds.lista.length)} — a lista completa está na aba "Lista de Colaboradores" (Situação do colaborador: Desligado).</p>` : ''}
      <p class="sub" style="margin-top:10px"><strong>Por unidade:</strong> ${ds.porUnidade.slice(0, 6).map(u => esc(u.label) + ' (' + u.value + ')').join(' · ')}</p>` : empty('Nenhum desligado sem avaliação no período.');

    // Adesão por unidade
    const unidAd = d.porUnidade.filter(u => u.gestorBase >= 10).sort((a, b) => (a.adesaoGestor - b.adesaoGestor)).slice(0, 12);

    body.innerHTML = `
      <div class="insight info" style="margin-bottom:16px">
        <span class="ic">${HUB_ICON('info')}</span>
        <span><strong>Como ler:</strong> cada competência é avaliada de 1 a 4 — <strong>1</strong> Necessita melhora, <strong>2</strong> Em desenvolvimento, <strong>3</strong> Atinge o esperado, <strong>4</strong> É referência — pelo gestor e pelo próprio colaborador (autoavaliação). Só o gestor responde ao <strong>"Batendo o Martelo"</strong>, que decide a continuidade: <strong>1</strong> Reprovado por questões culturais, <strong>2</strong> Reprovado por questões de performance, <strong>3</strong> Aprovado COM ressalvas, <strong>4</strong> Aprovado SEM ressalvas. A média de cada pessoa considera as 7 competências comuns a todos os cargos; o período filtrado usa a data da avaliação do gestor (ou o prazo do ciclo, se ainda pendente).</span>
      </div>
      ${kpis}
      ${termometro}
      <div class="grid2">
        ${card('Decisão por marca', '&#127970;', marcas.length ? chartBox('c-ave-marca', marcas.length) : empty('Sem decisões.'))}
        ${card('Decisão por unidade (maiores volumes)', '&#128205;', unidades.length ? chartBox('c-ave-unid', unidades.length) : empty('Sem decisões.'))}
        ${card('Decisão por cargo (maiores volumes)', '&#128188;', cargos.length ? chartBox('c-ave-cargo', cargos.length) : empty('Sem decisões.'))}
        ${card('Decisões ao longo do tempo', '&#128200;', temSerie ? '<div class="chart-h"><canvas id="c-ave-serie"></canvas></div>' : empty('Poucos meses para mostrar evolução.'))}
        ${card('Nota média por competência — gestor x autoavaliação', '&#127919;', '<div class="chart-h" style="height:330px"><canvas id="c-ave-comp"></canvas></div>')}
        ${card('Diferença de percepção por competência (autoavaliação − gestor)', '&#9878;&#65039;', '<div class="chart-h" style="height:330px"><canvas id="c-ave-gap"></canvas></div><p class="sub" style="margin-top:8px">Positivo = o colaborador se avalia acima do gestor; negativo = se avalia abaixo.</p>')}
        ${card('Conceitos atribuídos pelo gestor, por competência', '&#128100;', chartBox('c-ave-conc-g', M.CORE.length))}
        ${card('Conceitos da autoavaliação, por competência', '&#128172;', chartBox('c-ave-conc-a', M.CORE.length))}
        ${card('Alinhamento gestor x colaborador', '&#129309;', d.alinhamento.base ? '<div class="chart-h short"><canvas id="c-ave-alin"></canvas></div><p class="sub" style="margin-top:8px">Compara a média geral de cada pessoa: "alinhado" = diferença menor que 0,5 ponto. Base: ' + U.fmtInt(d.alinhamento.base) + ' pessoas com as duas avaliações concluídas.</p>' : empty('Sem pessoas com as duas avaliações.'))}
        ${card('Competências de negócio (por cargo)', '&#128200;', negocioHtml)}
        ${card('Prazo da avaliação do gestor (dias após a admissão)', '&#9200;', d.prazo.n ? '<div class="chart-h short"><canvas id="c-ave-prazo"></canvas></div><p class="sub" style="margin-top:8px">Mediana de <strong>' + U.fmtInt(d.prazo.mediana) + ' dias</strong>; <strong>' + pct(d.prazo.pctTardias) + '</strong> das avaliações foram feitas depois do dia ' + ciclo + '.</p>' : empty('Sem avaliações concluídas.'))}
        ${card('Adesão por unidade (avaliação do gestor)', '&#9989;', unidAd.length ? chartBox('c-ave-adesao', unidAd.length) : empty('Sem unidades com volume suficiente.'))}
        ${card('Desligados sem avaliação registrada', '&#128682;', tabDeslig)}
        ${card('Gestores com mais avaliações pendentes', '&#9203;', tabGestPend)}
        ${card('Decisões por gestor (rigor da avaliação)', '&#128104;&#8205;&#128188;', tabGestDec)}
        ${card('Palavras mais citadas nos comentários das reprovações', '&#128269;', d.termosReprovados.length ? chartBox('c-ave-termo-r', d.termosReprovados.length) : empty('Poucos comentários de reprovação.'))}
        ${card('Palavras mais citadas nos comentários das aprovações com ressalvas', '&#128269;', d.termosRessalvas.length ? chartBox('c-ave-termo-c', d.termosRessalvas.length) : empty('Poucos comentários.'))}
        ${insightsCard('Insights e plano de ação', '&#129504;', insightsList(d.insights) || empty('Sem dados suficientes para gerar insights.'), { full: true })}
      </div>`;

    // ---- gráficos ----
    const cm = M.CORES_MARTELO;
    const serieLbl = ['Reprovado — cultura', 'Reprovado — performance', 'Aprovado c/ ressalvas', 'Aprovado s/ ressalvas'];
    const serieCor = [cm[1], cm[2], cm[3], cm[4]];
    const dec = gs => [0, 1, 2, 3].map(i => gs.map(g => g.dist[i]));
    if (marcas.length) stackedPct('c-ave-marca', marcas.map(g => g.label), serieLbl, serieCor, dec(marcas));
    if (unidades.length) stackedPct('c-ave-unid', unidades.map(g => g.label), serieLbl, serieCor, dec(unidades));
    if (cargos.length) stackedPct('c-ave-cargo', cargos.map(g => g.label), serieLbl, serieCor, dec(cargos));

    if (temSerie) {
      HUB_CHART('c-ave-serie', {
        type: 'bar',
        data: {
          labels: d.serie.map(s => s.label),
          datasets: [
            { type: 'line', label: '% aprovados', data: d.serie.map(s => s.pctAprov === null ? null : +(s.pctAprov * 100).toFixed(1)), borderColor: '#1baf7a', backgroundColor: '#1baf7a', yAxisID: 'y1', tension: .3, pointRadius: 3 },
            { type: 'bar', label: 'Decisões no mês', data: d.serie.map(s => s.total), backgroundColor: '#C9D0DA', yAxisID: 'y', borderRadius: 4, maxBarThickness: 30 }
          ]
        },
        options: {
          layout: { padding: { top: 18 } },
          scales: { y: { position: 'left', title: { display: true, text: 'Decisões' }, grid: { display: false } }, y1: { position: 'right', min: 0, max: 100, ticks: { callback: v => v + '%' } } },
          plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } }, datalabels: { display: ctx => ctx.dataset.type === 'line' && (d.serie.length <= 14 || ctx.dataIndex % 2 === 0), color: '#0f8a4c', align: 'top', font: { size: 9, weight: '700' }, formatter: v => v === null ? '' : Math.round(v) + '%' } }
        }
      });
    }

    const comps = d.porCompetencia;
    groupedBars('c-ave-comp', comps.map(c => c.comp), [
      { label: 'Gestor', data: comps.map(c => c.mediaGestor === null ? null : +c.mediaGestor.toFixed(2)), color: '#1C7CEC' },
      { label: 'Autoavaliação', data: comps.map(c => c.mediaAuto === null ? null : +c.mediaAuto.toFixed(2)), color: '#eb6834' }
    ], { horizontal: true, min: 1, max: 4 });

    const gapVals = comps.map(c => c.gap === null ? 0 : +c.gap.toFixed(2));
    HUB_CHART('c-ave-gap', {
      type: 'bar',
      data: { labels: comps.map(c => c.comp), datasets: [{ data: gapVals, backgroundColor: gapVals.map(v => v > 0.05 ? '#eb6834' : v < -0.05 ? '#1C7CEC' : '#8A8F98'), borderRadius: 4, maxBarThickness: 22 }] },
      options: { indexAxis: 'y', scales: { x: { grid: { display: true } }, y: { grid: { display: false } } }, plugins: { legend: { display: false }, datalabels: { color: '#16181D', font: { size: 10, weight: '700' }, anchor: 'end', align: 'end', formatter: v => sinal(v) } }, layout: { padding: { left: 30, right: 30 } } }
    });

    const conceitoLbl = [1, 2, 3, 4].map(v => `${v} · ${M.CONCEITOS[v]}`);
    const conceitoCor = [1, 2, 3, 4].map(v => M.CORES_CONCEITO[v]);
    stackedPct('c-ave-conc-g', comps.map(c => c.comp), conceitoLbl, conceitoCor, [0, 1, 2, 3].map(i => comps.map(c => c.distGestor[i])));
    stackedPct('c-ave-conc-a', comps.map(c => c.comp), conceitoLbl, conceitoCor, [0, 1, 2, 3].map(i => comps.map(c => c.distAuto[i])));

    if (d.alinhamento.base) doughnutChart('c-ave-alin', ['Alinhados', 'Se avaliam acima do gestor', 'Se avaliam abaixo do gestor'], [d.alinhamento.alinhados, d.alinhamento.autoAcima, d.alinhamento.autoAbaixo]);
    if (d.prazo.n) groupedBars('c-ave-prazo', d.prazo.distribuicao.map(x => x.label), [{ label: 'Colaboradores', data: d.prazo.distribuicao.map(x => x.value), color: '#1C7CEC' }], { fmt: v => U.fmtInt(v) });
    if (unidAd.length) groupedBars('c-ave-adesao', unidAd.map(u => u.label), [
      { label: 'Avaliação do gestor', data: unidAd.map(u => +(u.adesaoGestor * 100).toFixed(0)), color: '#1C7CEC' },
      { label: 'Autoavaliação', data: unidAd.map(u => u.adesaoAuto === null ? null : +(u.adesaoAuto * 100).toFixed(0)), color: '#eda100' }
    ], { horizontal: true, min: 0, max: 100, fmt: v => v + '%' });
    if (d.termosReprovados.length) barChart('c-ave-termo-r', d.termosReprovados.map(x => x.label), d.termosReprovados.map(x => x.value), { horizontal: true, singleColor: '#e5533d' });
    if (d.termosRessalvas.length) barChart('c-ave-termo-c', d.termosRessalvas.map(x => x.label), d.termosRessalvas.map(x => x.value), { horizontal: true, singleColor: '#eda100' });
  }

  // ==================================================================
  // Aba LISTA DE COLABORADORES
  // ==================================================================
  function aplicarFiltrosLista(rows) {
    const q = U.normalizeText(lista.busca);
    let out = rows.filter(r => {
      if (q && !(U.normalizeText(r.nome).includes(q) || U.normalizeText(r.cargo).includes(q) || U.normalizeText(r.unidade).includes(q) || U.normalizeText(r._d.gestorRotulo).includes(q))) return false;
      const c = lista.conceito;
      if (c === 'reprovados' && !(r.martelo === 1 || r.martelo === 2)) return false;
      if (c === 'atencao' && !(r.martelo >= 1 && r.martelo <= 3)) return false;
      if (c === 'sem' && r.martelo >= 1) return false;
      if (['1', '2', '3', '4'].includes(c) && r.martelo !== Number(c)) return false;
      const s = lista.status;
      if (s === 'gestor_pend' && r.status_gestor === 'concluida') return false;
      if (s === 'gestor_pend' && !r.status_gestor) return false;
      if (s === 'auto_pend' && r.status_auto === 'concluida') return false;
      if (s === 'auto_pend' && !r.status_auto) return false;
      if (s === 'prazo_atrasada' && r._d.prazoSit !== 'atrasada') return false;
      if (s === 'prazo_encerrada' && r._d.prazoSit !== 'vencida') return false;
      if (s === 'prazo_a_vencer' && r._d.prazoSit !== 'a_vencer') return false;
      if (s === 'auto_fora_prazo' && !(r._d.autoSit === 'atrasada' || r._d.autoSit === 'vencida')) return false;
      if (s === 'ambas' && !(r.status_gestor === 'concluida' && r.status_auto === 'concluida')) return false;
      const sc = lista.situacaoColab;
      if (sc !== 'todos') {
        if (sc === 'nao_encontrado') { if (r._d.situacao) return false; }
        else if (r._d.situacao !== sc) return false;
      }
      return true;
    });
    const o = lista.ordem;
    const num = (v, dflt) => (v === null || v === undefined ? dflt : v);
    out = out.slice().sort((a, b) => {
      if (o === 'nome') return String(a.nome).localeCompare(String(b.nome), 'pt-BR');
      if (o === 'prazo_asc' || o === 'prazo_desc') {
        // pela data do prazo de resposta; sem data (sem admissão) vai sempre para o fim
        const pa = a._d.prazoResp, pb = b._d.prazoResp;
        if (!pa && !pb) return 0;
        if (!pa) return 1;
        if (!pb) return -1;
        return o === 'prazo_asc' ? pa.localeCompare(pb) : pb.localeCompare(pa);
      }
      if (o === 'prazo') {
        // atrasadas/encerradas (maior atraso primeiro) → a vencer (mais próximas primeiro) → entregues
        const peso = r => (EM_ATRASO_UI(r._d.prazoSit) ? 0 : r._d.prazoSit === 'a_vencer' ? 1 : 2);
        return (peso(a) - peso(b)) || (num(b._d.prazoDias, -999) - num(a._d.prazoDias, -999));
      }
      if (o === 'menor_nota') return num(a._d.mediaGestor, 99) - num(b._d.mediaGestor, 99);
      if (o === 'menor_final') return num(a._d.notaFinal, 99) - num(b._d.notaFinal, 99);
      if (o === 'maior_final') return num(b._d.notaFinal, -99) - num(a._d.notaFinal, -99);
      return String(b._d.dataRef || '').localeCompare(String(a._d.dataRef || ''));
    });
    return out;
  }

  function renderLista(body, rows, f) {
    if (!rows.length) { body.innerHTML = empty('Nenhuma avaliação no período/filtros selecionados.', 'Amplie o período na barra de filtros (o padrão é o ano corrente).'); return; }
    const opt = (v, l, cur) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`;
    body.innerHTML = `
      <div class="toolbar">
        <input type="text" id="ave-busca" placeholder="Buscar colaborador, cargo, unidade ou gestor..." value="${esc(lista.busca)}">
        <select id="ave-f-conceito">
          ${opt('todos', 'Batendo o Martelo: todos', lista.conceito)}
          ${opt('reprovados', 'Reprovados (cultura + performance)', lista.conceito)}
          ${opt('atencao', 'Em atenção (reprovados + com ressalvas)', lista.conceito)}
          ${opt('1', '1 · Reprovado por questões culturais', lista.conceito)}
          ${opt('2', '2 · Reprovado por questões de performance', lista.conceito)}
          ${opt('3', '3 · Aprovado COM ressalvas', lista.conceito)}
          ${opt('4', '4 · Aprovado SEM ressalvas', lista.conceito)}
          ${opt('sem', 'Sem decisão do gestor', lista.conceito)}
        </select>
        <select id="ave-f-status">
          ${opt('todos', 'Status: todos', lista.status)}
          ${opt('gestor_pend', 'Avaliação do gestor pendente', lista.status)}
          ${opt('prazo_atrasada', 'Gestor atrasado — ainda dentro do período', lista.status)}
          ${opt('prazo_encerrada', 'Gestor sem avaliação — período encerrado', lista.status)}
          ${opt('prazo_a_vencer', 'Gestor dentro do prazo de resposta', lista.status)}
          ${opt('auto_fora_prazo', 'Autoavaliação fora do prazo (pendente)', lista.status)}
          ${opt('auto_pend', 'Autoavaliação pendente', lista.status)}
          ${opt('ambas', 'Ambas concluídas', lista.status)}
        </select>
        <select id="ave-f-situacao">
          ${opt('todos', 'Situação do colaborador: todas', lista.situacaoColab)}
          ${opt('ativo', 'Ativo', lista.situacaoColab)}
          ${opt('desativado', 'Desativado', lista.situacaoColab)}
          ${opt('desligado', 'Desligado', lista.situacaoColab)}
          ${opt('nao_encontrado', 'Não encontrado no cadastro', lista.situacaoColab)}
        </select>
        <select id="ave-f-ordem">
          ${opt('recentes', 'Mais recentes', lista.ordem)}
          ${opt('prazo_asc', 'Prazo de resposta: crescente (mais antigo primeiro)', lista.ordem)}
          ${opt('prazo_desc', 'Prazo de resposta: decrescente (mais recente primeiro)', lista.ordem)}
          ${opt('prazo', 'Prazo de resposta: atrasadas primeiro', lista.ordem)}
          ${opt('nome', 'Nome (A-Z)', lista.ordem)}
          ${opt('menor_nota', 'Menor nota do gestor', lista.ordem)}
          ${opt('menor_final', 'Menor nota final', lista.ordem)}
          ${opt('maior_final', 'Maior nota final', lista.ordem)}
        </select>
        <button type="button" class="btn btn-outline btn-sm" id="ave-csv" style="width:auto">Exportar CSV</button>
      </div>
      <div id="ave-lista-tabela"></div>`;
    const redesenhar = () => desenharTabela(body.querySelector('#ave-lista-tabela'), rows);
    body.querySelector('#ave-busca').addEventListener('input', e => { lista.busca = e.target.value; lista.pagina = 1; redesenhar(); });
    body.querySelector('#ave-f-conceito').addEventListener('change', e => { lista.conceito = e.target.value; lista.pagina = 1; redesenhar(); });
    body.querySelector('#ave-f-status').addEventListener('change', e => { lista.status = e.target.value; lista.pagina = 1; redesenhar(); });
    body.querySelector('#ave-f-situacao').addEventListener('change', e => { lista.situacaoColab = e.target.value; lista.pagina = 1; redesenhar(); });
    body.querySelector('#ave-f-ordem').addEventListener('change', e => { lista.ordem = e.target.value; lista.pagina = 1; redesenhar(); });
    body.querySelector('#ave-csv').addEventListener('click', () => exportarCSV(aplicarFiltrosLista(rows)));
    redesenhar();
  }

  function desenharTabela(el, rows) {
    const filtradas = aplicarFiltrosLista(rows);
    listaAtual = filtradas;
    const paginas = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
    if (lista.pagina > paginas) lista.pagina = paginas;
    const ini = (lista.pagina - 1) * PAGE_SIZE;
    const pagina = filtradas.slice(ini, ini + PAGE_SIZE);
    if (!filtradas.length) { el.innerHTML = empty('Nenhum colaborador encontrado com esses filtros.'); return; }
    el.innerHTML = `
      <div class="table-wrap" style="max-height:none"><table class="dt">
        <thead><tr><th>Colaborador</th><th>Unidade / gestor</th><th>Admissão</th><th title="Prazo de resposta = dia ${ciclo - 5} da admissão (gestor e colaborador); o período de experiência termina no dia ${ciclo}">Prazo p/ responder</th><th>Avaliado em</th><th title="Média das 7 competências comuns — avaliação do gestor">Nota gestor</th><th title="Média das 7 competências comuns — autoavaliação">Nota auto</th><th title="Nota do gestor × 85% + nota do colaborador × 15% (médias das 7 competências comuns). * = sem autoavaliação, vale só o gestor">Nota final</th><th>Batendo o Martelo</th><th>Comentário do gestor</th><th title="Avaliação do gestor · autoavaliação">Status</th><th></th></tr></thead>
        <tbody>${pagina.map((r, i) => `<tr>
          <td><b>${esc(r.nome)}</b> ${pillSituacao(r._d.situacao)} ${pillDispensa(r)}<div style="font-size:10.5px;color:var(--muted)">${esc(r.cargo || 'Cargo não informado')}</div></td>
          <td>${esc(r.unidade || '—')}<div style="font-size:10.5px;color:var(--muted)">${esc(r._d.gestorRotulo)}</div></td>
          <td>${U.fmtDateBR(r.data_admissao) || '—'}</td>
          <td>${r._d.prazoResp ? U.fmtDateBR(r._d.prazoResp) : '—'}<div style="margin-top:2px" title="Gestor">${prazoPill(r._d.prazoSit, r._d.prazoDias, r._d.fimPeriodo, r._d.dataSaida)}</div><div style="margin-top:2px;font-size:9.5px;color:var(--muted)" title="Colaborador (autoavaliação)">colab.: ${prazoPill(r._d.autoSit, r._d.autoDias, r._d.fimPeriodo, r._d.dataSaida)}</div></td>
          <td>${r.data_avaliacao ? U.fmtDateBR(r.data_avaliacao) + (r._d.dias !== null ? ` <span style="color:var(--muted)">(${r._d.dias}d)</span>` : '') : '—'}</td>
          <td>${notaMedia(r._d.mediaGestor)}</td>
          <td>${notaMedia(r._d.mediaAuto)}</td>
          <td>${notaFinalHtml(r._d)}</td>
          <td>${pillMartelo(r.martelo)}</td>
          <td style="min-width:200px;max-width:260px;white-space:normal;font-size:11px;line-height:1.35" title="${esc(r.martelo_comentario || '')}">${r.martelo_comentario ? esc(r.martelo_comentario.length > 90 ? r.martelo_comentario.slice(0, 90) + '…' : r.martelo_comentario) : '<span style="color:var(--muted)">—</span>'}</td>
          <td style="text-align:center">${statusIcone(r.status_gestor)} · ${statusIcone(r.status_auto)}</td>
          <td><button type="button" class="btn btn-outline btn-sm" style="width:auto" data-ver="${ini + i}">Ver</button></td>
        </tr>`).join('')}</tbody></table></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;flex-wrap:wrap;gap:8px">
        <span class="sub" style="color:var(--muted);font-size:12px">Mostrando ${U.fmtInt(ini + 1)}–${U.fmtInt(Math.min(ini + PAGE_SIZE, filtradas.length))} de ${U.fmtInt(filtradas.length)} colaborador(es)</span>
        <div style="display:flex;gap:8px;align-items:center">
          <button type="button" class="btn btn-outline btn-sm" style="width:auto" id="ave-prev" ${lista.pagina <= 1 ? 'disabled' : ''}>&lsaquo; Anterior</button>
          <span style="font-size:12px">Página ${lista.pagina} de ${paginas}</span>
          <button type="button" class="btn btn-outline btn-sm" style="width:auto" id="ave-next" ${lista.pagina >= paginas ? 'disabled' : ''}>Próxima &rsaquo;</button>
        </div>
      </div>`;
    const prev = el.querySelector('#ave-prev'), next = el.querySelector('#ave-next');
    if (prev) prev.addEventListener('click', () => { lista.pagina--; desenharTabela(el, rows); });
    if (next) next.addEventListener('click', () => { lista.pagina++; desenharTabela(el, rows); });
    el.querySelectorAll('[data-ver]').forEach(b => b.addEventListener('click', () => abrirDetalhe(listaAtual[Number(b.dataset.ver)])));
  }

  const SIT_TXT = { entregue_prazo: 'Respondeu no prazo', entregue_atraso: 'Respondeu após o prazo (dentro do período)', entregue_fora: 'Respondeu após o fim do período', a_vencer: 'Pendente — dentro do prazo', atrasada: 'Pendente — prazo vencido (ainda dentro do período)', vencida: 'Pendente — período encerrado', saiu_antes: 'Desligado antes do prazo de resposta' };
  function exportarCSV(linhas) {
    const cab = ['Colaborador', 'Situação do colaborador', 'Cargo', 'Unidade', 'Departamento', 'Gestor', 'Admissão', 'Prazo de resposta', 'Fim do período de experiência', 'Situação do prazo (gestor)', 'Dias após o prazo (gestor; negativo = antes)', 'Situação do prazo (colaborador)', 'Data da avaliação do gestor', 'Dias até a avaliação', 'Média gestor', 'Média autoavaliação', 'Nota final (85% gestor + 15% colaborador)', 'Batendo o Martelo (nota)', 'Batendo o Martelo', 'Comentário do gestor', 'Avaliação do gestor', 'Autoavaliação']
      .concat(M.CORE.map(c => c + ' (gestor)')).concat(M.CORE.map(c => c + ' (auto)'));
    const num = v => (v === null || v === undefined ? '' : String(v).replace('.', ','));
    const cel = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const linhasCsv = linhas.map(r => [
      r.nome, r._d.situacao ? M.SITUACOES[r._d.situacao] : 'Não encontrado', r.cargo, r.unidade, r.departamento, r._d.gestorRotulo, r.data_admissao, r._d.prazoResp, r._d.fimPeriodo, SIT_TXT[r._d.prazoSit] || '', r._d.prazoDias, SIT_TXT[r._d.autoSit] || '', r.data_avaliacao, r._d.dias,
      num(r._d.mediaGestor === null ? null : +r._d.mediaGestor.toFixed(2)), num(r._d.mediaAuto === null ? null : +r._d.mediaAuto.toFixed(2)), num(r._d.notaFinal === null ? null : +r._d.notaFinal.toFixed(2)),
      r.martelo, r.martelo ? M.MARTELO[r.martelo] : '', r.martelo_comentario, r.status_gestor, r.status_auto
    ].concat(M.CORE.map(c => (r.notas_gestor || {})[c])).concat(M.CORE.map(c => (r.notas_auto || {})[c])).map(cel).join(';'));
    const blob = new Blob(['﻿' + [cab.map(cel).join(';')].concat(linhasCsv).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `avaliacao-experiencia-${ciclo}-dias.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ==================================================================
  // Detalhe do colaborador (modal)
  // ==================================================================
  function abrirModal(titulo, subtitulo, corpoHTML) {
    const existente = document.getElementById('hub-ave-modal');
    if (existente) existente.remove();
    const modal = document.createElement('div');
    modal.id = 'hub-ave-modal';
    modal.innerHTML = `
      <div data-fechar style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:998"></div>
      <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.3);width:94%;max-width:860px;max-height:88vh;z-index:999;display:flex;flex-direction:column">
        <div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:10px">
          <div><div style="font-size:16px;font-weight:700">${titulo}</div>${subtitulo ? `<div style="font-size:12px;color:var(--muted);margin-top:2px">${subtitulo}</div>` : ''}</div>
          <button data-fechar class="btn btn-outline btn-sm" style="width:auto">Fechar</button>
        </div>
        <div style="padding:18px 22px;overflow-y:auto;flex:1">${corpoHTML}</div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => modal.remove()));
    return modal;
  }

  function abrirDetalhe(r) {
    if (!r) return;
    const ng = r.notas_gestor || {}, na = r.notas_auto || {};
    const extras = Object.keys(ng).concat(Object.keys(na)).filter((c, i, a) => a.indexOf(c) === i && !M.CORE.includes(c));
    const comps = M.CORE.concat(extras);
    const linhas = comps.map((c, i) => {
      const g = ng[c], a = na[c];
      const fin = g >= 1 ? (a >= 1 ? g * M.PESO_GESTOR + a * M.PESO_AUTO : g) : null;
      return `<tr>
        <td><b>${esc(c)}</b>${M.CORE.includes(c) ? '' : ' <span style="color:var(--muted);font-size:10px">(cargo)</span>'}</td>
        <td>${g >= 1 ? pillConceito(g) : '<span style="color:var(--muted)">—</span>'}</td>
        <td>${a >= 1 ? pillConceito(a) : '<span style="color:var(--muted)">—</span>'}</td>
        <td>${fin === null ? '—' : `<b>${fmt2(fin)}</b>`}</td>
      </tr><tr class="ave-com" data-comp="${i}"><td colspan="4" style="white-space:normal;padding-top:0;border-bottom:1px solid var(--border)"></td></tr>`;
    }).join('');
    const corpo = `
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px;font-size:12px">
        <div><span style="color:var(--muted)">Admissão</span><br><b>${U.fmtDateBR(r.data_admissao) || '—'}</b></div>
        <div><span style="color:var(--muted)">Prazo para responder (dia ${ciclo - 5})</span><br><b>${r._d.prazoResp ? U.fmtDateBR(r._d.prazoResp) : '—'}</b> <span style="color:var(--muted);font-size:10.5px">período termina em ${r._d.fimPeriodo ? U.fmtDateBR(r._d.fimPeriodo) : '—'}</span><br>Gestor: ${prazoPill(r._d.prazoSit, r._d.prazoDias, r._d.fimPeriodo, r._d.dataSaida)} · Colaborador: ${prazoPill(r._d.autoSit, r._d.autoDias, r._d.fimPeriodo, r._d.dataSaida)}${r._d.dataSaida ? `<br><span style="color:var(--muted);font-size:10.5px">Desligamento em ${U.fmtDateBR(r._d.dataSaida)} — o atraso é contado até essa data</span>` : ''}</div>
        <div><span style="color:var(--muted)">Avaliação do gestor</span><br><b>${r.data_avaliacao ? U.fmtDateBR(r.data_avaliacao) : (r.status_gestor === 'rascunho' ? 'Em rascunho' : 'Pendente')}</b>${r._d.dias !== null ? ` <span style="color:var(--muted)">(${r._d.dias} dias)</span>` : ''}</div>
        <div><span style="color:var(--muted)">Autoavaliação</span><br><b>${r.data_autoavaliacao ? U.fmtDateBR(r.data_autoavaliacao) : (r.status_auto === 'rascunho' ? 'Em rascunho' : 'Pendente')}</b></div>
        <div><span style="color:var(--muted)">Média gestor · auto</span><br>${notaMedia(r._d.mediaGestor)} · ${notaMedia(r._d.mediaAuto)}</div>
        <div><span style="color:var(--muted)">Nota final (85% gestor + 15% colab.)</span><br>${notaFinalHtml(r._d)}</div>
        <div><span style="color:var(--muted)">Departamento</span><br><b>${esc(r.departamento || '—')}</b></div>
      </div>
      <div class="card" style="margin-bottom:14px;padding:14px 16px;border-left:4px solid ${r.martelo ? M.CORES_MARTELO[r.martelo] : '#C9D0DA'}">
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Batendo o Martelo &#128296; — decisão do gestor (${esc(r._d.gestorRotulo)})</div>
        <div style="margin-bottom:6px">${pillMartelo(r.martelo)}${r.martelo ? ` <span style="color:var(--muted);font-size:11px">nota ${r.martelo} — ${esc(M.MARTELO[r.martelo])}</span>` : ''}</div>
        <div style="font-size:12.5px;line-height:1.5">${r.martelo_comentario ? esc(r.martelo_comentario) : '<span style="color:var(--muted)">Sem comentário registrado.</span>'}</div>
      </div>
      <div class="table-wrap" style="max-height:none"><table class="dt" style="white-space:normal"><thead><tr><th>Competência</th><th>Gestor</th><th>Autoavaliação</th><th title="85% gestor + 15% colaborador">Nota final</th></tr></thead><tbody>${linhas}</tbody></table></div>
      <p class="sub" id="ave-com-status" style="margin-top:10px;font-size:11.5px;color:var(--muted)">Carregando comentários...</p>`;
    const modal = abrirModal(`${esc(r.nome)} ${pillSituacao(r._d.situacao)} ${pillDispensa(r)}`, `${esc(r.cargo || 'Cargo não informado')} · ${esc(r.unidade || '')}${r.departamento ? ' · ' + esc(r.departamento) : ''} · Avaliação de ${ciclo} dias`, corpo);

    // Comentários por competência: buscados só agora, um colaborador por vez.
    HUB_EXPERIENCIA.buscarComentarios(ciclo, r.id).then(cm => {
      if (!document.body.contains(modal)) return;
      const cg = (cm && cm.comentarios_gestor) || {}, ca = (cm && cm.comentarios_auto) || {};
      let algum = false;
      comps.forEach((c, i) => {
        const td = modal.querySelector(`tr[data-comp="${i}"] td`);
        if (!td) return;
        const partes = [];
        if (cg[c]) partes.push(`<div class="comment" style="margin:4px 0"><div class="meta">Gestor</div>${esc(cg[c])}</div>`);
        if (ca[c]) partes.push(`<div class="comment" style="margin:4px 0;background:#FFF9EF"><div class="meta">Colaborador</div>${esc(ca[c])}</div>`);
        if (partes.length) { td.innerHTML = partes.join(''); algum = true; }
      });
      const st = modal.querySelector('#ave-com-status');
      if (st) st.textContent = algum ? '' : 'Nenhum comentário por competência registrado.';
    }).catch(err => {
      const st = modal.querySelector('#ave-com-status');
      if (st) st.textContent = 'Não consegui carregar os comentários: ' + (err.message || '');
    });
  }

  // ==================================================================
  // Evolução 45 → 90 dias
  // ==================================================================
  function renderEvolucao(body, f) {
    const r45 = HUB_EXPERIENCIA_DATA[45], r90 = HUB_EXPERIENCIA_DATA[90];
    if (!r45.length || !r90.length) {
      body.innerHTML = empty('É preciso ter as duas planilhas importadas (45 e 90 dias) para comparar.', canUpload() ? 'Vá em Administração → Upload de Planilhas.' : 'Peça para um administrador importar as planilhas.');
      return;
    }
    M.preparar(r45, 45); M.preparar(r90, 90);
    // O período usa a data da avaliação de 90 dias (a mais recente); no ciclo
    // de 45 dias só valem os demais filtros — senão quem foi avaliado em
    // meses diferentes nos dois ciclos nunca formaria um par.
    const c = M.comparar(M.filtrar(r45, Object.assign({}, f, { start: '', end: '' })), M.filtrar(r90, f));
    if (!c.nPares) { body.innerHTML = empty('Nenhum colaborador com avaliação nos dois ciclos no período/filtros selecionados.'); return; }
    const total = c.nDecisao;
    const cm = M.CORES_MARTELO;
    const ordem = [1, 2, 3, 4];
    const maxCel = Math.max.apply(null, c.matriz.flat().concat([1]));
    const matrizHtml = `<div class="table-wrap" style="max-height:none"><table class="dt" style="text-align:center">
      <thead><tr><th style="text-align:left">Decisão aos 45 dias &darr; / aos 90 dias &rarr;</th>${ordem.map(v => `<th style="color:${cm[v]}">${esc(M.MARTELO_CURTO[v])}</th>`).join('')}<th>Total</th></tr></thead>
      <tbody>${ordem.map(a => {
        const linha = c.matriz[a - 1];
        const soma = linha.reduce((s, v) => s + v, 0);
        return `<tr><td style="text-align:left"><span class="ave-pill" style="--c:${cm[a]}">${esc(M.MARTELO_CURTO[a])}</span></td>${ordem.map(b => {
          const v = linha[b - 1];
          const diag = a === b;
          const alpha = v ? 0.12 + 0.6 * (v / maxCel) : 0;
          const cor = b < a ? '208,59,59' : diag ? '138,143,152' : '27,175,122';
          return `<td style="background:rgba(${cor},${alpha.toFixed(2)});font-weight:${v ? 700 : 400}">${v ? U.fmtInt(v) + `<div style="font-size:9.5px;font-weight:400;color:var(--text2)">${soma ? pct(v / soma) : ''}</div>` : '<span style="color:var(--muted)">·</span>'}</td>`;
        }).join('')}<td><b>${U.fmtInt(soma)}</b></td></tr>`;
      }).join('')}</tbody></table></div>
      <p class="sub" style="margin-top:8px">Verde = a decisão melhorou entre os ciclos; vermelho = piorou; cinza = manteve. Cada linha soma 100% dos colaboradores que tinham aquela decisão aos 45 dias.</p>`;

    const comps = c.porCompetencia.filter(x => x.n);
    const pioraram = c.pioraram.slice(0, 15);
    body.innerHTML = `
      <div class="insight info" style="margin-bottom:16px"><span class="ic">${HUB_ICON('info')}</span><span>Compara <strong>o mesmo colaborador</strong> nos dois ciclos (${U.fmtInt(c.nPares)} pessoas aparecem nas duas planilhas; ${U.fmtInt(c.nDecisao)} têm o "Batendo o Martelo" concluído nos dois). Mostra se quem foi aprovado, com ressalvas ou reprovado aos 45 dias evoluiu ou piorou aos 90.</span></div>
      <div class="kpi-grid">
        ${kpi('Colaboradores nos dois ciclos', U.fmtInt(c.nPares), `${U.fmtInt(c.nDecisao)} com decisão nos dois`, 'var(--p1)')}
        ${kpi('Nota média do gestor', c.media90 === null ? '—' : `${fmt1(c.media45)} → ${fmt1(c.media90)}`, c.deltaMedio === null ? '' : `variação média ${sinal(c.deltaMedio)}`, '#4a3aa7')}
        ${kpi('Evoluíram na nota', c.pctMelhoraram === null ? '—' : pct(c.pctMelhoraram), 'média ≥ 0,25 ponto acima dos 45 dias', '#1baf7a')}
        ${kpi('Pioraram na nota', c.pctPioraram === null ? '—' : pct(c.pctPioraram), 'média ≥ 0,25 ponto abaixo dos 45 dias', 'var(--critical)')}
        ${kpi('Decisão melhorou', total ? pct(c.subiu / total) : '—', `${U.fmtInt(c.subiu)} de ${U.fmtInt(total)}`, '#1baf7a')}
        ${kpi('Decisão manteve', total ? pct(c.igual / total) : '—', `${U.fmtInt(c.igual)} de ${U.fmtInt(total)}`, '#8A8F98')}
        ${kpi('Decisão piorou', total ? pct(c.desceu / total) : '—', `${U.fmtInt(c.desceu)} de ${U.fmtInt(total)}`, 'var(--critical)')}
      </div>
      <div class="grid2">
        ${card('Migração da decisão do gestor (45 → 90 dias)', '&#128260;', matrizHtml, { full: true })}
        ${card('Nota média por competência — 45 x 90 dias', '&#127919;', comps.length ? '<div class="chart-h" style="height:330px"><canvas id="c-ave-ev-comp"></canvas></div>' : empty('Sem dados.'))}
        ${card('Variação da nota por competência', '&#128200;', comps.length ? '<div class="chart-h" style="height:330px"><canvas id="c-ave-ev-delta"></canvas></div><p class="sub" style="margin-top:8px">Média da diferença (90 dias − 45 dias) entre os mesmos colaboradores.</p>' : empty('Sem dados.'))}
        ${card('Atenção: decisão que piorou para reprovado aos 90 dias', '&#9888;&#65039;', pioraram.length ? `<div class="table-wrap"><table class="dt"><thead><tr><th>Colaborador</th><th>Cargo</th><th>Unidade</th><th>Gestor</th><th>45 dias</th><th>90 dias</th><th>Comentário (90 dias)</th></tr></thead><tbody>${pioraram.map(p => `<tr><td><b>${esc(p.nome)}</b></td><td>${esc(p.cargo || '—')}</td><td>${esc(p.unidade || '—')}</td><td>${esc(p.gestor)}</td><td>${pillMartelo(p.de)}</td><td>${pillMartelo(p.para)}</td><td style="white-space:normal;max-width:300px;font-size:11.5px">${esc((p.comentario || '').slice(0, 140))}</td></tr>`).join('')}</tbody></table></div>${c.pioraram.length > 15 ? `<p class="sub" style="margin-top:8px">Exibindo 15 de ${U.fmtInt(c.pioraram.length)}.</p>` : ''}` : empty('Nenhum colaborador piorou para reprovado.'), { full: true })}
      </div>`;
    if (comps.length) {
      groupedBars('c-ave-ev-comp', comps.map(x => x.comp), [
        { label: '45 dias', data: comps.map(x => +x.media45.toFixed(2)), color: '#8bb8f5' },
        { label: '90 dias', data: comps.map(x => +x.media90.toFixed(2)), color: '#1C7CEC' }
      ], { horizontal: true, min: 1, max: 4 });
      const dv = comps.map(x => +x.delta.toFixed(2));
      HUB_CHART('c-ave-ev-delta', {
        type: 'bar',
        data: { labels: comps.map(x => x.comp), datasets: [{ data: dv, backgroundColor: dv.map(v => v > 0.02 ? '#1baf7a' : v < -0.02 ? '#d03b3b' : '#8A8F98'), borderRadius: 4, maxBarThickness: 22 }] },
        options: { indexAxis: 'y', scales: { x: { grid: { display: true } }, y: { grid: { display: false } } }, plugins: { legend: { display: false }, datalabels: { color: '#16181D', font: { size: 10, weight: '700' }, anchor: 'end', align: 'end', formatter: v => sinal(v) } }, layout: { padding: { left: 30, right: 30 } } }
      });
    }
  }

  window.HUB_SECTIONS = window.HUB_SECTIONS || {};
  window.HUB_SECTIONS.renderExperiencia = renderExperiencia;
  // Usado pelo Dashboard: abrir a tela já no ciclo do cartão clicado.
  window.HUB_EXPERIENCIA_ABRIR = c => { ciclo = c; aba = 'indicadores'; if (window.HUB_GOTO_SECTION) HUB_GOTO_SECTION('ind-experiencia'); };
})();
