// Recrutamento → Agenda de Entrevistas. Portado de renderAgenda/
// renderAgendaContent/openEntrevistaDetail do Sfera Recruiter original
// (index.html antigo, ~8440-8852), adaptado às convenções do hub: sem
// Lucide, sem modal (o detalhe de uma entrevista troca o conteúdo da seção
// por uma view de detalhe com botão "Voltar", igual ao padrão de vagas.js/
// candidatos.js); "Capacidade por recrutador" agora é um gráfico de barras
// via HUB_CHART/HUB_UI.barChart (ui-charts.js) em vez de barras HTML
// manuais. Esta tela NÃO cria entrevistas novas — no app original isso só
// acontece a partir do formulário de Candidato (Entrevista RH agendada
// junto com o cadastro/edição do candidato, ver candidatos.js); aqui só se
// consulta, filtra e atualiza status/tipo/observação de entrevistas já
// existentes.
//
// Enum de status da entrevista — DISCREPÂNCIA ENCONTRADA no app original:
// STATUS_AGENDAMENTO e badgeStatusAgenda usam a forma masculina 'Agendado'
// (combina com "agendamento"), mas os dois pontos onde uma entrevista é
// efetivamente inserida (dentro do formulário de Candidato, ~8302 e ~8355)
// sempre gravam 'Agendada' (feminino, combina com "entrevista") — ou seja,
// o valor real gravado no banco nunca bate com o enum/badge declarados.
// Além disso, js/metrics-recrutamento.js (já portado, fora do escopo desta
// tarefa) já lê e depende de 'Agendada' e 'Realizado' especificamente. Por
// isso aqui o enum foi padronizado como
// ['Agendada','Reagendada','Realizado','No Show','Cancelada'] — bate com o
// valor real gravado nos dois pontos de inserção E com o que
// metrics-recrutamento.js já espera (mistura de gênero mantida de
// propósito por causa disso, não é descuido).
(function () {
  const U = HUB_UTILS;
  const R = HUB_RECRUIT;

  function D() { return window.HUB_RECRUIT_DATA || {}; }
  function canWrite() { return HUB_PERMISSIONS.hasPerm(HUB_USER, 'recrutamento.agenda'); }

  const TIPO_ENTREVISTA = ['RH', 'Gestor'];
  const TIPOS_RECRUT = ['Externo', 'Interno', 'Misto'];
  const STATUS_ENTREVISTA = ['Agendada', 'Reagendada', 'Realizado', 'No Show', 'Cancelada'];

  function recrutadoresAtivos() { return R.activeNames('recrutadores'); }
  function etapasAtivas() { return R.activeNames('etapas'); }
  function niveisAtivos() { return R.activeNames('niveis_vaga'); }

  function badgeStatusAgenda(s) {
    const map = { Agendada: 'b1', Reagendada: 'b4', Realizado: 'b2', 'No Show': 'b3', Cancelada: 'b5' };
    return `<span class="badge ${map[s] || 'b5'}">${U.escapeHtml(s || '—')}</span>`;
  }

  // Cores por tipo/status (portado de agendaClassPorTipo + legenda ~8471-8479,
  // aplicadas via style inline em vez das classes CSS .agt-* do app original)
  function corEntrevista(e) {
    if (!e) return '#757575';
    if (e.status === 'No Show') return '#C62828';
    if (e.status === 'Cancelada') return '#757575';
    if (e.status === 'Realizado') return '#2e7d32';
    const gestor = (e.tipoEntrevista || '').toUpperCase() === 'GESTOR' || (e.etapa || '').includes('Gestor');
    const reag = e.status === 'Reagendada';
    if (gestor) return reag ? '#FDD835' : '#E65100';
    return reag ? '#90CAF9' : '#1565C0';
  }

  // ================================================================
  // Estado do módulo
  // ================================================================
  let state = {
    viewMode: 'semana', cursor: U.todayISO(),
    filterTipoEntrevista: 'todos', filterRecrut: 'todos', filterVaga: 'todas', filterEtapa: 'todas',
    filterStatus: 'todos', filterNivel: 'todos', filterTipo: 'todos', filterCandidato: '',
    filterPeriodoIni: '', filterPeriodoFim: ''
  };
  let view = 'list'; // 'list' | 'detail'
  let detailId = null;
  let rootEl = null;

  // `f` (filtro compartilhado da barra superior) é ignorado de propósito —
  // esta é uma tela operacional com seu próprio painel de filtros. Parâmetro
  // mantido só para bater com a assinatura padrão function renderX(el, f).
  function renderAgenda(el, f) {
    rootEl = el;
    render();
  }
  function render() {
    if (!rootEl) return;
    if (view === 'detail') renderDetailView(rootEl);
    else renderCalendarView(rootEl);
  }
  async function reloadAndRender() {
    try { await R.reload(); } catch (err) { /* mantém dados antigos na tela mesmo se o reload falhar */ }
    render();
  }

  // ================================================================
  // FILTROS
  // ================================================================
  function filtrarEntrevistas() {
    const candLower = (state.filterCandidato || '').toLowerCase().trim();
    return (D().entrevistas || []).filter(e => {
      if (state.filterRecrut !== 'todos' && e.recrutador !== state.filterRecrut) return false;
      if (state.filterVaga !== 'todas' && e.vagaId !== state.filterVaga) return false;
      if (state.filterEtapa !== 'todas' && e.etapa !== state.filterEtapa) return false;
      if (state.filterStatus !== 'todos' && e.status !== state.filterStatus) return false;
      if (state.filterNivel !== 'todos' && e.nivelVaga !== state.filterNivel) return false;
      if (state.filterTipo !== 'todos' && e.tipoProcesso !== state.filterTipo) return false;
      if (state.filterTipoEntrevista !== 'todos' && e.tipoEntrevista !== state.filterTipoEntrevista) return false;
      if (candLower && !(e.candidatoNome || '').toLowerCase().includes(candLower)) return false;
      if (state.filterPeriodoIni && e.data < state.filterPeriodoIni) return false;
      if (state.filterPeriodoFim && e.data > state.filterPeriodoFim) return false;
      return true;
    });
  }

  // ================================================================
  // CALENDÁRIO
  // ================================================================
  function renderCalendarView(el) {
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div><h2 style="font-size:16px">Agenda de Entrevistas</h2><p class="sub" style="color:var(--muted);font-size:12px;margin-top:2px">Painel de agendamentos por etapa e recrutador(a)</p></div>
        <div class="tab-bar">
          <button class="tab-btn ${state.viewMode === 'dia' ? 'active' : ''}" data-mode="dia">Dia</button>
          <button class="tab-btn ${state.viewMode === 'semana' ? 'active' : ''}" data-mode="semana">Semana</button>
          <button class="tab-btn ${state.viewMode === 'mes' ? 'active' : ''}" data-mode="mes">Mês</button>
        </div>
      </div>
      <div class="legend">
        <span><span class="sw" style="background:#1565C0"></span>Entrevista RH — Agendada</span>
        <span><span class="sw" style="background:#90CAF9"></span>Entrevista RH — Reagendada</span>
        <span><span class="sw" style="background:#E65100"></span>Entrevista Gestor — Agendada</span>
        <span><span class="sw" style="background:#FDD835"></span>Entrevista Gestor — Reagendada</span>
        <span><span class="sw" style="background:#C62828"></span>No Show</span>
        <span><span class="sw" style="background:#2e7d32"></span>Realizado</span>
        <span><span class="sw" style="background:#757575"></span>Cancelada</span>
      </div>
      <div class="card full" style="margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap">
          <button class="btn btn-outline btn-sm" id="ag-prev" style="width:auto">‹</button>
          <button class="btn btn-outline btn-sm" id="ag-hoje" style="width:auto">Hoje</button>
          <button class="btn btn-outline btn-sm" id="ag-next" style="width:auto">›</button>
          <strong id="ag-title" style="font-size:13px;margin-left:4px"></strong>
        </div>
        <div class="toolbar">
          <select id="ag-f-tipoEntr"><option value="todos">Tipo: todos</option>${TIPO_ENTREVISTA.map(t => `<option ${state.filterTipoEntrevista === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <select id="ag-f-recrut"><option value="todos">Todos recrutadores</option>${recrutadoresAtivos().map(r => `<option value="${U.escapeHtml(r)}" ${state.filterRecrut === r ? 'selected' : ''}>${U.escapeHtml(r)}</option>`).join('')}</select>
          <select id="ag-f-vaga"><option value="todas">Todas vagas</option>${(D().vagas || []).map(v => `<option value="${v.id}" ${state.filterVaga === v.id ? 'selected' : ''}>${v.id} — ${U.escapeHtml(v.cargo || '')}</option>`).join('')}</select>
          <select id="ag-f-etapa"><option value="todas">Todas etapas</option>${etapasAtivas().map(e => `<option value="${U.escapeHtml(e)}" ${state.filterEtapa === e ? 'selected' : ''}>${U.escapeHtml(e)}</option>`).join('')}</select>
          <select id="ag-f-status"><option value="todos">Todos status</option>${STATUS_ENTREVISTA.map(s => `<option value="${s}" ${state.filterStatus === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
          <select id="ag-f-nivel"><option value="todos">Todos níveis</option>${niveisAtivos().map(n => `<option value="${U.escapeHtml(n)}" ${state.filterNivel === n ? 'selected' : ''}>${U.escapeHtml(n)}</option>`).join('')}</select>
          <select id="ag-f-tipo"><option value="todos">Processo: todos</option>${TIPOS_RECRUT.map(t => `<option ${state.filterTipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <input type="text" id="ag-f-cand" placeholder="Candidato..." value="${U.escapeHtml(state.filterCandidato)}">
          <input type="date" id="ag-f-ini" value="${state.filterPeriodoIni}" title="Período - de">
          <input type="date" id="ag-f-fim" value="${state.filterPeriodoFim}" title="Período - até">
        </div>
        <div id="ag-content"></div>
      </div>
      <h3 style="font-size:13px;margin:16px 0 10px">Capacidade por recrutador(a) — próximos 7 dias</h3>
      <div id="ag-capacidade" class="card full"></div>
      <h3 style="font-size:13px;margin:16px 0 10px">Alertas</h3>
      <div id="ag-alertas"></div>
    `;
    atualizarTitulo(el);
    renderContent(el);
    renderCapacidade(el);
    renderAlertas(el);
    wireCalendarEvents(el);
  }

  function atualizarTitulo(el) {
    const t = el.querySelector('#ag-title');
    if (!t) return;
    const d = new Date(state.cursor + 'T00:00:00');
    if (state.viewMode === 'dia') t.textContent = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    else if (state.viewMode === 'semana') {
      const ini = new Date(d); ini.setDate(d.getDate() - d.getDay());
      const fim = new Date(ini); fim.setDate(ini.getDate() + 6);
      t.textContent = `${ini.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${fim.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    } else {
      t.textContent = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    }
  }

  function renderContent(el) {
    const ents = filtrarEntrevistas();
    const content = el.querySelector('#ag-content');
    if (state.viewMode === 'dia') { content.innerHTML = renderDia(ents); return; }
    if (state.viewMode === 'semana') { content.innerHTML = renderSemana(ents); return; }
    content.innerHTML = renderMes(ents);
  }

  function renderDia(ents) {
    const d = state.cursor;
    const lista = ents.filter(e => e.data === d).sort((a, b) => (a.horario || '').localeCompare(b.horario || ''));
    if (!lista.length) return HUB_UI.empty('Sem entrevistas neste dia.');
    return `<div>${lista.map(e => renderInterviewCard(e, lista)).join('')}</div>`;
  }

  function renderInterviewCard(e, listaDia) {
    const conflito = (listaDia || []).some(x => x.id !== e.id && x.recrutador === e.recrutador && x.horario === e.horario && x.status !== 'Cancelada');
    return `<div class="interview-card" style="border-left-color:${corEntrevista(e)}" data-detalhe="${e.id}">
      <div class="hd"><span class="time">${U.escapeHtml(e.horario || '')}</span>${badgeStatusAgenda(e.status)}</div>
      <div class="cand">${U.escapeHtml(e.candidatoNome || '')}</div>
      <div class="meta">
        <span>${U.escapeHtml(e.cargo || '')}</span>
        <span>${U.escapeHtml(e.etapa || '')}${e.tipoEntrevista ? ' · ' + U.escapeHtml(e.tipoEntrevista) : ''}</span>
        <span>${U.escapeHtml(e.recrutador || '')}</span>
        <span>${U.escapeHtml(e.unidade || '')}</span>
      </div>
      ${conflito ? '<div style="font-size:11px;color:var(--warning);font-weight:700;margin-top:6px">⚠ Conflito de horário</div>' : ''}
    </div>`;
  }

  function renderSemana(ents) {
    const base = new Date(state.cursor + 'T00:00:00');
    const ini = new Date(base); ini.setDate(base.getDate() - base.getDay());
    const dias = Array.from({ length: 7 }, (_, i) => { const d = new Date(ini); d.setDate(ini.getDate() + i); return d.toISOString().slice(0, 10); });
    const hoje = U.todayISO();
    return `<div class="cal-grid">${dias.map(ds => {
      const dObj = new Date(ds + 'T00:00:00');
      const lista = ents.filter(e => e.data === ds).sort((a, b) => (a.horario || '').localeCompare(b.horario || ''));
      return `<div class="cal-cell ${ds === hoje ? 'today' : ''}">
        <div class="num">${dObj.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')} ${dObj.getDate()}</div>
        ${lista.length ? lista.map(e => `<button class="ev-chip" style="background:${corEntrevista(e)}" data-detalhe="${e.id}" title="${U.escapeHtml(e.horario || '')} · ${U.escapeHtml(e.candidatoNome || '')} · ${U.escapeHtml(e.status || '')}">${U.escapeHtml(e.horario || '')} ${U.escapeHtml((e.candidatoNome || '').split(' ')[0])}</button>`).join('') : '<div style="font-size:10.5px;color:var(--muted);text-align:center;padding:10px 0">—</div>'}
      </div>`;
    }).join('')}</div>`;
  }

  function renderMes(ents) {
    const base = new Date(state.cursor + 'T00:00:00');
    const y = base.getFullYear(), m = base.getMonth();
    const primeiroDia = new Date(y, m, 1);
    const ultimoDia = new Date(y, m + 1, 0);
    const inicioGrade = new Date(primeiroDia); inicioGrade.setDate(primeiroDia.getDate() - primeiroDia.getDay());
    const cells = [];
    const d = new Date(inicioGrade);
    while (d <= ultimoDia || d.getDay() !== 0) { cells.push(new Date(d)); d.setDate(d.getDate() + 1); if (cells.length > 42) break; }
    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const hoje = U.todayISO();
    return `<div class="cal-grid">
      ${weekdays.map(w => `<div class="cal-head">${w}</div>`).join('')}
      ${cells.map(c => {
        const ds = c.toISOString().slice(0, 10);
        const lista = ents.filter(e => e.data === ds).sort((a, b) => (a.horario || '').localeCompare(b.horario || ''));
        const show = lista.slice(0, 3), more = lista.length - show.length;
        return `<div class="cal-cell ${c.getMonth() !== m ? 'out' : ''} ${ds === hoje ? 'today' : ''}">
          <div class="num">${c.getDate()}</div>
          ${show.map(e => `<button class="ev-chip" style="background:${corEntrevista(e)}" data-detalhe="${e.id}" title="${U.escapeHtml(e.horario || '')} ${U.escapeHtml(e.candidatoNome || '')} · ${U.escapeHtml(e.status || '')}">${U.escapeHtml(e.horario || '')} ${U.escapeHtml((e.candidatoNome || '').split(' ')[0])}</button>`).join('')}
          ${more > 0 ? `<div class="ev-more">+${more} outras</div>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  }

  function renderCapacidade(el) {
    const wrap = el.querySelector('#ag-capacidade');
    const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
    const fim = new Date(hoje0.getTime() + 7 * 86400000);
    const recruts = recrutadoresAtivos();
    const counts = recruts.map(r => (D().entrevistas || []).filter(e => {
      const de = new Date(e.data);
      return e.recrutador === r && de >= hoje0 && de <= fim && e.status === 'Agendada';
    }).length);
    if (!recruts.length || counts.every(c => c === 0)) { wrap.innerHTML = HUB_UI.empty('Nenhuma entrevista agendada nos próximos 7 dias.'); return; }
    wrap.innerHTML = '<div class="chart-h short"><canvas id="c-agenda-capacidade"></canvas></div>';
    HUB_UI.barChart('c-agenda-capacidade', recruts, counts, { horizontal: true });
  }

  function renderAlertas(el) {
    const ents = D().entrevistas || [];
    const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
    const alerts = [];
    const map = new Map();
    ents.forEach(e => {
      if (e.status === 'Cancelada') return;
      const k = `${e.recrutador}|${e.data}|${e.horario}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(e);
    });
    map.forEach(arr => { if (arr.length > 1) alerts.push({ tipo: 'alerta', texto: `${arr[0].recrutador} tem ${arr.length} entrevistas sobrepostas em ${U.fmtDateBR(arr[0].data)} ${arr[0].horario}.` }); });
    const semFb = ents.filter(e => e.status === 'Realizado' && (hoje0 - new Date(e.data)) / 86400000 > 2 && !e.observacao);
    if (semFb.length) alerts.push({ tipo: 'acao', texto: `${semFb.length} entrevista(s) realizada(s) sem feedback registrado há mais de 2 dias.` });
    const hojeCount = ents.filter(e => e.data === U.todayISO() && e.status === 'Agendada').length;
    if (hojeCount) alerts.push({ tipo: 'info', texto: `${hojeCount} entrevista(s) hoje — confira os cards do dia para se preparar.` });
    el.querySelector('#ag-alertas').innerHTML = alerts.length ? HUB_UI.insightsList(alerts) : HUB_UI.empty('Nenhum alerta no momento.');
  }

  function wireCalendarEvents(el) {
    const $ = sel => el.querySelector(sel);
    el.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { state.viewMode = b.dataset.mode; render(); }));
    $('#ag-hoje').addEventListener('click', () => { state.cursor = U.todayISO(); atualizarTitulo(el); renderContent(el); });
    $('#ag-prev').addEventListener('click', () => { navegar(-1); atualizarTitulo(el); renderContent(el); });
    $('#ag-next').addEventListener('click', () => { navegar(1); atualizarTitulo(el); renderContent(el); });
    $('#ag-f-tipoEntr').addEventListener('change', e => { state.filterTipoEntrevista = e.target.value; renderContent(el); });
    $('#ag-f-recrut').addEventListener('change', e => { state.filterRecrut = e.target.value; renderContent(el); });
    $('#ag-f-vaga').addEventListener('change', e => { state.filterVaga = e.target.value; renderContent(el); });
    $('#ag-f-etapa').addEventListener('change', e => { state.filterEtapa = e.target.value; renderContent(el); });
    $('#ag-f-status').addEventListener('change', e => { state.filterStatus = e.target.value; renderContent(el); });
    $('#ag-f-nivel').addEventListener('change', e => { state.filterNivel = e.target.value; renderContent(el); });
    $('#ag-f-tipo').addEventListener('change', e => { state.filterTipo = e.target.value; renderContent(el); });
    $('#ag-f-cand').addEventListener('input', e => { state.filterCandidato = e.target.value; renderContent(el); });
    $('#ag-f-ini').addEventListener('change', e => { state.filterPeriodoIni = e.target.value; renderContent(el); });
    $('#ag-f-fim').addEventListener('change', e => { state.filterPeriodoFim = e.target.value; renderContent(el); });
    el.addEventListener('click', e => {
      const btn = e.target.closest('[data-detalhe]');
      if (btn) openDetalhe(btn.dataset.detalhe);
    });
  }

  function navegar(delta) {
    const d = new Date(state.cursor + 'T00:00:00');
    if (state.viewMode === 'dia') d.setDate(d.getDate() + delta);
    else if (state.viewMode === 'semana') d.setDate(d.getDate() + 7 * delta);
    else d.setMonth(d.getMonth() + delta);
    state.cursor = d.toISOString().slice(0, 10);
  }

  // ================================================================
  // DETALHE DE UMA ENTREVISTA (substitui o modal do app original —
  // portado de openEntrevistaDetail/salvarEntrevistaDetail, ~8784-8852)
  // ================================================================
  function openDetalhe(id) {
    detailId = id;
    view = 'detail';
    render();
  }

  function renderDetailView(el) {
    const e = (D().entrevistas || []).find(x => x.id === detailId);
    if (!e) { view = 'list'; render(); return; }
    const readOnly = !canWrite();
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div><h2 style="font-size:16px">Entrevista — ${U.escapeHtml(e.candidatoNome || '')}</h2><p class="sub" style="color:var(--muted);font-size:12px;margin-top:2px">${U.escapeHtml(e.vagaId || '')} · ${U.escapeHtml(e.cargo || '')} (${U.escapeHtml(e.unidade || '')})</p></div>
        <button class="btn btn-outline btn-sm" id="ed-voltar">‹ Voltar para a agenda</button>
      </div>
      <div class="card full">
        <div class="form-grid">
          <div class="field"><label>Candidato</label><input value="${U.escapeHtml(e.candidatoNome || '')}" readonly style="background:var(--bg)"></div>
          <div class="field"><label>Vaga</label><input value="${U.escapeHtml(e.vagaId || '')}" readonly style="background:var(--bg)"></div>
          <div class="field"><label>Cargo</label><input value="${U.escapeHtml(e.cargo || '')}" readonly style="background:var(--bg)"></div>
          <div class="field"><label>Unidade</label><input value="${U.escapeHtml(e.unidade || '')}" readonly style="background:var(--bg)"></div>
          <div class="field"><label>Recrutador(a)</label><input value="${U.escapeHtml(e.recrutador || '')}" readonly style="background:var(--bg)"></div>
          <div class="field"><label>Etapa</label><input value="${U.escapeHtml(e.etapa || '')}" readonly style="background:var(--bg)"></div>
          <div class="field"><label>Data / Horário</label><input value="${U.fmtDateBR(e.data)} às ${U.escapeHtml(e.horario || '')}" readonly style="background:var(--bg)"></div>
          <div class="field"><label>Nível da Vaga</label><input value="${U.escapeHtml(e.nivelVaga || '—')}" readonly style="background:var(--bg)"></div>
          <div class="field"><label>Tipo de Entrevista</label><select id="ed-tipo" ${readOnly ? 'disabled' : ''}><option value="">—</option>${TIPO_ENTREVISTA.map(t => `<option ${e.tipoEntrevista === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <div class="field"><label>Status do Agendamento</label><select id="ed-status" ${readOnly ? 'disabled' : ''}>${STATUS_ENTREVISTA.map(s => `<option value="${s}" ${e.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
          <div class="field full"><label>Observação / Feedback</label><textarea id="ed-obs" rows="3" placeholder="Feedback da entrevista, motivo do reagendamento, etc." ${readOnly ? 'disabled' : ''}>${U.escapeHtml(e.observacao || '')}</textarea></div>
        </div>
        ${!readOnly ? `<div style="margin-top:16px"><button class="btn btn-primary" id="ed-salvar" style="width:auto">Salvar alterações</button></div>
        <div class="msg err" id="ed-msg"></div>` : ''}
      </div>`;
    el.querySelector('#ed-voltar').addEventListener('click', () => { view = 'list'; render(); });
    if (readOnly) return;
    el.querySelector('#ed-salvar').addEventListener('click', () => salvarDetalhe(el, e));
  }

  async function salvarDetalhe(el, e) {
    const btn = el.querySelector('#ed-salvar');
    const msg = el.querySelector('#ed-msg');
    msg.style.display = 'none';
    const novoStatus = el.querySelector('#ed-status').value;
    const novoTipo = el.querySelector('#ed-tipo').value;
    const novoObs = el.querySelector('#ed-obs').value;
    const statusAnterior = e.status;
    btn.disabled = true; btn.textContent = 'Salvando...';
    try {
      await R.updateRow('entrevistas', e.id, { status: novoStatus, tipoEntrevista: novoTipo, observacao: novoObs });
      if (statusAnterior !== novoStatus) {
        await R.logAcao({ acao: 'Edição Entrevista', vagaId: e.vagaId, campo: 'Status', valorAnterior: statusAnterior, valorNovo: novoStatus });
      }
      view = 'list';
      await reloadAndRender();
    } catch (err) {
      msg.textContent = 'Erro ao salvar: ' + err.message; msg.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Salvar alterações';
    }
  }

  window.HUB_SECTIONS = window.HUB_SECTIONS || {};
  window.HUB_SECTIONS.renderAgenda = renderAgenda;
})();
