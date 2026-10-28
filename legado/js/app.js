// Orquestração geral: login, navegação (agrupada por módulo, filtrada por
// permissão), barra de filtros e carregamento de dados. O conteúdo de cada
// tela é montado em sections/*.js / admin/*.js — este arquivo só decide
// QUANDO chamar cada um e QUAIS itens de menu um usuário específico enxerga.
(function () {
  const U = HUB_UTILS;
  const P = HUB_PERMISSIONS;
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  window.HUB_USER = null;
  window.HUB_FILTERS = {};

  const NAV_TITLES = {
    'conexao-rh': 'Conexão RH',
    'do-controle-desligamento': 'Controle de Desligamento',
    dashboard: 'Dashboard',
    'ind-headcount': 'Headcount', 'ind-recrutamento': 'Recrutamento', 'ind-rotatividade': 'Rotatividade', 'ind-experiencia': 'Avaliação da Experiência', 'ind-pesquisa-clima': 'Pesquisa de Clima', 'ind-engajamento': 'Pesquisa de Engajamento', 'ind-boletim': 'Boletim da Liderança', 'ind-satisfacao': 'Pesquisa de Satisfação', 'ind-fechamento': 'Fechamento do Período', 'ind-organograma': 'Organograma',
    'ind-desligamento': 'Entrevista de Desligamento', 'ind-feedbacks': 'Feedbacks', 'ind-oneonone': '1:1',
    'ind-treinamentos': 'Treinamentos', 'ind-celebracoes': 'Celebrações',
    'rec-dashboard': 'Dashboard — Recrutamento', 'rec-vagas': 'Controle de Vagas', 'rec-candidatos': 'Candidatos',
    'rec-agenda': 'Agenda de Entrevistas', 'rec-banco-talentos': 'Banco de Talentos', 'rec-aprovacoes': 'Aprovações',
    'rec-historico': 'Histórico', 'rec-transferencia': 'Transferência de Vaga', 'rec-parecer-gestor': 'Parecer do Gestor',
    'tre-onboarding': 'Onboarding', 'tre-visita-loja': 'Visita em Loja', 'tre-turmas': 'Turmas e Multiplicadoras',
    'adm-upload': 'Upload de Planilhas', 'adm-cadastros': 'Cadastros do Recrutamento', 'adm-usuarios': 'Cadastro de Acessos', 'adm-log-acessos': 'Log de Acessos'
  };
  window.HUB_NAV_TITLES = NAV_TITLES;

  // Cada item de menu (exceto "dashboard", sempre visível) exige a permissão
  // correspondente do catálogo (js/permissions.js) para aparecer na barra
  // lateral e para o conteúdo ser renderizado.
  const NAV_PERMISSIONS = {
    'conexao-rh': 'conexao_rh.acompanhar',
    'do-controle-desligamento': 'indicadores.controle_desligamento',
    'ind-headcount': 'indicadores.headcount', 'ind-recrutamento': 'indicadores.recrutamento',
    'ind-rotatividade': 'indicadores.rotatividade', 'ind-experiencia': 'indicadores.experiencia', 'ind-pesquisa-clima': 'indicadores.pesquisa_clima', 'ind-engajamento': 'indicadores.engajamento', 'ind-boletim': 'indicadores.boletim', 'ind-satisfacao': 'indicadores.satisfacao', 'ind-fechamento': 'indicadores.fechamento', 'ind-organograma': 'indicadores.organograma', 'ind-desligamento': 'indicadores.desligamento',
    'ind-feedbacks': 'indicadores.feedbacks', 'ind-oneonone': 'indicadores.oneonone',
    'ind-treinamentos': 'indicadores.treinamentos', 'ind-celebracoes': 'indicadores.celebracoes',
    'rec-dashboard': 'recrutamento.dashboard', 'rec-vagas': 'recrutamento.vagas', 'rec-candidatos': 'recrutamento.candidatos',
    'rec-agenda': 'recrutamento.agenda', 'rec-banco-talentos': 'recrutamento.banco_talentos',
    'rec-aprovacoes': 'recrutamento.aprovacoes', 'rec-historico': 'recrutamento.historico',
    'rec-transferencia': 'recrutamento.transferencia', 'rec-parecer-gestor': 'recrutamento.parecer_gestor',
    'tre-onboarding': 'treinamento_dev.onboarding', 'tre-visita-loja': 'treinamento_dev.visita_loja', 'tre-turmas': ['treinamento_dev.turmas', 'treinamento_dev.turmas_gestor', 'treinamento_dev.turmas_lancar'],
    'adm-upload': 'admin.upload', 'adm-cadastros': 'admin.cadastros_recrutamento', 'adm-usuarios': 'admin.usuarios', 'adm-log-acessos': 'admin.log_acessos'
  };

  // Seções do módulo Recrutamento (e Treinamento e Desenvolvimento, que
  // compartilha as mesmas tabelas — ver dal-recrutamento.js) recarregam
  // vagas/candidatos/entrevistas/onboarding toda vez que são abertas — é
  // isso que faz os dados aparecerem "em tempo real, de forma automática"
  // sem upload.
  const RECRUIT_SECTIONS = new Set(['do-controle-desligamento', 'ind-recrutamento', 'ind-desligamento', 'ind-fechamento', 'rec-dashboard', 'rec-vagas', 'rec-candidatos', 'rec-agenda', 'rec-banco-talentos', 'rec-aprovacoes', 'rec-historico', 'rec-transferencia', 'rec-parecer-gestor', 'tre-onboarding', 'tre-visita-loja']);

  function sectionRenderer(name) {
    const f = getFilters();
    const el = $('#sec-' + name);
    switch (name) {
      case 'conexao-rh': return HUB_CONEXAO.render(el, f);
      case 'do-controle-desligamento': return HUB_CONTROLE_DESLIGAMENTO.render(el, f);
      case 'dashboard': return HUB_SECTIONS.renderDashboard(el, f);
      case 'ind-headcount': return HUB_SECTIONS.renderHeadcount(el, f);
      case 'ind-recrutamento': return HUB_SECTIONS.renderRecrutamentoDashboard(el, f);
      case 'ind-rotatividade': return HUB_SECTIONS.renderRotatividade(el, f);
      case 'ind-experiencia': return HUB_SECTIONS.renderExperiencia(el, f);
      case 'ind-desligamento': return HUB_SECTIONS.renderDesligamento(el, f);
      case 'ind-feedbacks': return HUB_SECTIONS.renderFeedbacks(el, f);
      case 'ind-oneonone': return HUB_SECTIONS.renderOneOnOne(el, f);
      case 'ind-treinamentos': return HUB_SECTIONS.renderTreinamentos(el, f);
      case 'ind-celebracoes': return HUB_SECTIONS.renderCelebracoes(el, f);
      case 'ind-pesquisa-clima': return HUB_SECTIONS.renderPesquisaClima(el, f);
      case 'ind-engajamento': return HUB_SECTIONS.renderEngajamento(el, f);
      case 'ind-boletim': return HUB_SECTIONS.renderBoletim(el);
      case 'ind-satisfacao': return HUB_SECTIONS.renderSatisfacao(el);
      case 'ind-fechamento': return HUB_SECTIONS.renderFechamento(el);
      case 'ind-organograma': return HUB_SECTIONS.renderOrganograma(el, f);
      case 'rec-dashboard': return HUB_SECTIONS.renderRecrutamentoDashboard(el, f);
      case 'rec-vagas': return HUB_SECTIONS.renderVagas(el, f);
      case 'rec-candidatos': return HUB_SECTIONS.renderCandidatos(el, f);
      case 'rec-agenda': return HUB_SECTIONS.renderAgenda(el, f);
      case 'rec-banco-talentos': return HUB_SECTIONS.renderBancoTalentos(el, f);
      case 'rec-aprovacoes': return HUB_SECTIONS.renderAprovacoes(el, f);
      case 'rec-historico': return HUB_SECTIONS.renderHistorico(el, f);
      case 'rec-transferencia': return HUB_SECTIONS.renderTransferencia(el, f);
      case 'rec-parecer-gestor': return HUB_SECTIONS.renderParecerGestor(el, f);
      case 'tre-onboarding': return HUB_SECTIONS.renderOnboarding(el, f);
      case 'tre-visita-loja': return HUB_SECTIONS.renderVisitaLoja(el, f);
      case 'tre-turmas': return HUB_SECTIONS.renderTurmas(el);
      case 'adm-upload': return HUB_ADMIN_UPLOAD.render(el);
      case 'adm-cadastros': return HUB_ADMIN_CADASTROS.render(el);
      case 'adm-usuarios': return HUB_ADMIN_USUARIOS.render(el);
      case 'adm-log-acessos': return HUB_ADMIN_LOG_ACESSOS.render(el);
    }
  }

  let currentSection = 'dashboard';
  let unidadeMS, departamentoMS;

  function getFilters() {
    return {
      start: $('#f-start').value || '',
      end: $('#f-end').value || '',
      unidade: unidadeMS ? unidadeMS.getSelected() : [],
      departamento: departamentoMS ? departamentoMS.getSelected() : [],
      gestor: $('#f-gestor').value || '',
      colaborador: $('#f-colaborador').value || '',
      // Só existe (visível) na tela Headcount — ver goToSection() — mas não
      // custa nada ler sempre; as outras telas simplesmente ignoram o campo.
      experiencia: $('#f-experiencia') ? $('#f-experiencia').checked : false,
      trilha: $('#f-trilha').value || '',
      conteudo: $('#f-conteudo').value || ''
    };
  }

  async function renderCurrentSection() {
    $('#page-title').textContent = NAV_TITLES[currentSection] || currentSection;
    if (RECRUIT_SECTIONS.has(currentSection)) {
      const statusEl = $('#data-status');
      const prev = statusEl.textContent;
      statusEl.textContent = 'Atualizando dados de Recrutamento...';
      try { await HUB_RECRUIT.reload(); } catch (err) { statusEl.textContent = 'Atenção: ' + err.message; statusEl.style.color = 'var(--critical)'; }
      finally { if (statusEl.textContent === 'Atualizando dados de Recrutamento...') statusEl.textContent = prev; }
    }
    sectionRenderer(currentSection);
  }
  window.HUB_RENDER_CURRENT = renderCurrentSection;

  function canSee(name) {
    const perm = NAV_PERMISSIONS[name];
    // Lista = basta ter uma das permissões (ex.: Turmas: ver tudo ou lançar as próprias).
    if (Array.isArray(perm)) return P.hasAnyPerm(HUB_USER, perm);
    return !perm || P.hasPerm(HUB_USER, perm);
  }

  function goToSection(name) {
    if (!canSee(name)) return;
    closeMobileMenu();
    currentSection = name;
    $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.section === name));
    $$('.section').forEach(s => s.classList.remove('active'));
    $('#sec-' + name).classList.add('active');
    const showTwygo = name === 'ind-treinamentos';
    $('#fg-trilha').style.display = showTwygo ? 'flex' : 'none';
    $('#fg-conteudo').style.display = showTwygo ? 'flex' : 'none';
    $('#fg-experiencia').style.display = name === 'ind-headcount' ? 'flex' : 'none';
    // O Boletim da Liderança, a Pesquisa de Satisfação, o Fechamento e o Log de Acessos têm seletores próprios.
    $('#filter-bar').style.display = name === 'ind-boletim' || name === 'ind-satisfacao' || name === 'ind-fechamento' || name === 'adm-log-acessos' || name === 'tre-turmas' ? 'none' : '';
    HUB_LOG_ACESSO.registrar('modulo', name);
    renderCurrentSection();
  }
  // Exposto pra navegação entre módulos a partir de uma seção (ex.: botão
  // "Abrir no Treinamento e Desenvolvimento" em Recrutamento → Candidatos).
  window.HUB_GOTO_SECTION = goToSection;
  // Exposto para js/view-as.js re-montar o menu quando troca HUB_USER pelo
  // perfil simulado (e de volta, ao sair do modo de visualização).
  window.HUB_APPLY_NAV_PERMS = () => applyPermissionsToNav();

  function populateDatalist(inputId, values) {
    const dl = document.getElementById('dl-' + inputId.replace(/^f-/, ''));
    dl.innerHTML = values.map(v => `<option value="${U.escapeHtml(v)}"></option>`).join('');
  }

  function createMultiSelect(key, placeholder) {
    const root = document.getElementById('msel-' + key);
    const btn = document.getElementById('msel-' + key + '-btn');
    const panel = document.getElementById('msel-' + key + '-panel');
    const search = document.getElementById('msel-' + key + '-search');
    const optionsEl = document.getElementById('msel-' + key + '-options');
    let allValues = [];
    const selected = new Set();
    let changeCb = () => {};

    function renderOptions() {
      const q = U.normalizeText(search.value);
      const filtered = allValues.filter(v => !q || U.normalizeText(v).includes(q));
      optionsEl.innerHTML = filtered.length
        ? filtered.map(v => `<label class="msel-opt"><input type="checkbox" value="${U.escapeHtml(v)}"${selected.has(v) ? ' checked' : ''}><span>${U.escapeHtml(v)}</span></label>`).join('')
        : '<div class="msel-empty">Nenhuma opção encontrada.</div>';
    }

    function updateButton() {
      if (!selected.size) { btn.textContent = placeholder; btn.classList.add('placeholder'); }
      else {
        btn.textContent = selected.size === 1 ? Array.from(selected)[0] : `${selected.size} selecionadas`;
        btn.classList.remove('placeholder');
      }
    }

    function open() {
      panel.hidden = false;
      btn.classList.add('active');
      search.value = '';
      renderOptions();
      search.focus();
    }
    function close() {
      panel.hidden = true;
      btn.classList.remove('active');
    }

    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (panel.hidden) open(); else close();
    });
    search.addEventListener('input', renderOptions);
    optionsEl.addEventListener('change', e => {
      if (e.target.type !== 'checkbox') return;
      if (e.target.checked) selected.add(e.target.value); else selected.delete(e.target.value);
      updateButton();
      changeCb();
    });
    root.querySelector('[data-act="all"]').addEventListener('click', () => {
      const q = U.normalizeText(search.value);
      allValues.filter(v => !q || U.normalizeText(v).includes(q)).forEach(v => selected.add(v));
      renderOptions();
      updateButton();
      changeCb();
    });
    root.querySelector('[data-act="clear"]').addEventListener('click', () => {
      selected.clear();
      renderOptions();
      updateButton();
      changeCb();
    });
    document.addEventListener('click', e => { if (!panel.hidden && !root.contains(e.target)) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) close(); });

    return {
      setOptions(values) {
        allValues = values;
        for (const s of Array.from(selected)) if (!values.includes(s)) selected.delete(s);
        renderOptions();
        updateButton();
      },
      getSelected() { return Array.from(selected); },
      // Seleção vinda de fora (clique num gráfico do Dashboard). Aceita o valor
      // com outra grafia (caixa/acento) e usa a grafia da lista de opções.
      setSelected(values) {
        selected.clear();
        for (const v of values) {
          const achado = allValues.find(o => U.normalizeText(o) === U.normalizeText(v));
          selected.add(achado || v);
        }
        renderOptions();
        updateButton();
      },
      clear() { selected.clear(); renderOptions(); updateButton(); },
      onChange(cb) { changeCb = cb; }
    };
  }

  // Cada tabela usa nomes de campo diferentes pra unidade/departamento/pessoa
  // (ou nem tem o campo) — este mapa é a base tanto pra montar as opções de
  // filtro quanto pra fazer Departamento/Colaborador reagirem ao que já está
  // selecionado em Unidade (e Departamento, no caso de Colaborador). Só
  // cobre as tabelas de Indicadores — o filtro de unidade/departamento das
  // telas de Recrutamento é resolvido dentro do próprio módulo (vaga.unidade).
  function filterSources() {
    return [
      { rows: HUB_DATA.colaboradores || [], u: 'unidade', d: 'departamento', n: 'nome_completo' },
      { rows: HUB_DATA.feedbacks || [], u: 'unidade', d: 'departamento', n: null },
      { rows: HUB_DATA.celebracoes || [], u: 'unidade', d: 'departamento', n: 'colaborador_enviou' },
      { rows: HUB_DATA.one_on_one || [], u: null, d: 'departamento', n: 'liderado' },
      // Entrevista de Desligamento é anônima: não alimenta a lista de nomes
      // do filtro "Colaborador" (e o Hub nem recebe mais esses nomes).
      { rows: HUB_DATA.entrevista_pesquisa || [], u: 'unidade', d: 'departamento', n: null },
      { rows: HUB_DATA.entrevista_solicitacao || [], u: 'unidade', d: 'departamento', n: null },
      { rows: HUB_DATA.twygo_participantes || [], u: 'unidade', d: 'departamento', n: 'nome_completo' },
      { rows: HUB_DATA.twygo_usuarios || [], u: 'unidade', d: 'departamento', n: 'nome_completo' },
      { rows: HUB_DATA.unibe_pessoas || [], u: 'unidade', d: 'departamento', n: 'nome_cadastro' },
      { rows: HUB_DATA.academia_hering || [], u: 'unidade', d: 'departamento', n: 'nome_cadastro' }
    ];
  }

  // Só quem está Ativo ou Desativado na planilha de Colaboradores — Desligado
  // nunca entra, mesmo que o nome/unidade/departamento apareça em
  // Feedbacks/Twygo/Entrevista de Desligamento etc.
  function activeColaboradores() {
    return (HUB_DATA.colaboradores || []).filter(r => {
      const st = U.normalizeText(r.situacao);
      return st === 'ativo' || st === 'desativado';
    });
  }

  function activeColaboradorNamesSet() {
    const s = new Set();
    for (const r of activeColaboradores()) if (r.nome_completo) s.add(U.normalizeText(r.nome_completo));
    return s;
  }

  // Avaliação da Experiência não vive em HUB_DATA (é carregada sob demanda,
  // ver dal-experiencia.js) — mas quando já foi carregada, as unidades,
  // departamentos, gestores e colaboradores dela também entram nos filtros.
  function experienciaRows() {
    const d = window.HUB_EXPERIENCIA_DATA || {};
    return (d[45] || []).concat(d[90] || []);
  }

  function populateFilterOptions() {
    const ativos = activeColaboradores();
    const nomesAtivos = activeColaboradorNamesSet();
    const ave = experienciaRows();
    // Pesquisa de Clima (carregada sob demanda, ver dal-pesquisa-clima.js): quando já
    // foi carregada, suas unidades/departamentos/líderes também entram nos filtros.
    const pesq = HUB_DATA.pesquisa_clima || [];
    // Pesquisa de Engajamento (idem, sob demanda — dal-engajamento.js).
    const eng = HUB_DATA.engajamento_participacao || [];
    const unidades = U.uniqueSortedNormalized(ativos.map(r => r.unidade).concat(ave.map(r => r.unidade), pesq.map(r => r.unidade), eng.map(r => r.unidade)));
    const gestores = U.uniqueSortedNormalized(ativos.map(r => r.gestor_direto).filter(n => n && nomesAtivos.has(U.normalizeText(n)))
      .concat(ave.map(r => r.gestor_avaliador || r.gestor_direto), pesq.map(r => r.lider), eng.map(r => r.gestor)));
    const tipos = U.uniqueSortedNormalized((HUB_DATA.twygo_participantes || []).map(r => r.content_type)
      .concat((HUB_DATA.twygo_conteudos || []).map(r => r.tipo)));
    const conteudos = U.uniqueSortedNormalized((HUB_DATA.twygo_participantes || []).map(r => r.content_title)
      .concat((HUB_DATA.twygo_conteudos || []).map(r => r.nome)));

    unidadeMS.setOptions(unidades);
    populateDatalist('f-gestor', gestores);
    populateDatalist('f-trilha', tipos);
    populateDatalist('f-conteudo', conteudos);
    updateDependentFilters();
  }
  window.HUB_REFRESH_FILTER_OPTIONS = populateFilterOptions;

  function updateDependentFilters() {
    const ativos = activeColaboradores();
    const selUnidades = unidadeMS.getSelected();
    const selDepartamentos = departamentoMS.getSelected();
    const nomesAtivos = activeColaboradorNamesSet();

    const deptosBase = selUnidades.length ? ativos.filter(r => U.matchesAny(r.unidade, selUnidades)) : ativos;
    const ave = experienciaRows();
    const aveBase = selUnidades.length ? ave.filter(r => U.matchesAny(r.unidade, selUnidades)) : ave;
    const pesqBase = (HUB_DATA.pesquisa_clima || []).filter(r => !selUnidades.length || U.matchesAny(r.unidade, selUnidades));
    const engBase = (HUB_DATA.engajamento_participacao || []).filter(r => !selUnidades.length || U.matchesAny(r.unidade, selUnidades));
    const deptos = U.uniqueSortedNormalized(deptosBase.map(r => r.departamento).concat(aveBase.map(r => r.departamento), pesqBase.map(r => r.departamento), engBase.map(r => r.departamento)));

    const pessoas = [];
    for (const src of filterSources()) {
      for (const r of src.rows) {
        if (selUnidades.length) {
          if (!src.u || !U.matchesAny(r[src.u], selUnidades)) continue;
        }
        if (selDepartamentos.length) {
          if (!src.d || !U.matchesAny(r[src.d], selDepartamentos)) continue;
        }
        if (src.n && r[src.n] && nomesAtivos.has(U.normalizeText(r[src.n]))) pessoas.push(r[src.n]);
      }
    }
    for (const r of ave) {
      if (selUnidades.length && !U.matchesAny(r.unidade, selUnidades)) continue;
      if (selDepartamentos.length && !U.matchesAny(r.departamento, selDepartamentos)) continue;
      if (r.nome) pessoas.push(r.nome);
    }
    departamentoMS.setOptions(deptos);
    populateDatalist('f-colaborador', U.uniqueSortedNormalized(pessoas));
  }

  function setDefaultDates() {
    $('#f-start').value = '2026-01-01';
    $('#f-end').value = U.todayISO();
  }

  function wireFilterBar() {
    unidadeMS = createMultiSelect('unidade', 'Todas');
    departamentoMS = createMultiSelect('departamento', 'Todos');
    unidadeMS.onChange(() => { updateDependentFilters(); renderCurrentSection(); });
    departamentoMS.onChange(() => { updateDependentFilters(); renderCurrentSection(); });

    ['f-start', 'f-end', 'f-gestor', 'f-colaborador', 'f-experiencia', 'f-trilha', 'f-conteudo']
      .forEach(id => document.getElementById(id).addEventListener('change', renderCurrentSection));
    $('#btn-clear-filters').addEventListener('click', () => {
      ['f-gestor', 'f-colaborador', 'f-trilha', 'f-conteudo'].forEach(id => $('#' + id).value = '');
      unidadeMS.clear();
      departamentoMS.clear();
      setDefaultDates();
      updateDependentFilters();
      renderCurrentSection();
    });
  }

  // Filtro "estilo BI": um clique num gráfico do Dashboard aplica a unidade, o
  // departamento ou o mês clicado na barra de filtros do topo (a mesma do Hub
  // inteiro, então ela continua valendo ao abrir outro módulo). Clicar de novo
  // no mesmo item desfaz: volta para "Todas"/"Todos" ou para o período padrão.
  function aplicarFiltroDoGrafico(tipo, valor) {
    const igual = (a, b) => U.normalizeText(a) === U.normalizeText(b);
    if (tipo === 'unidade' || tipo === 'departamento') {
      const ms = tipo === 'unidade' ? unidadeMS : departamentoMS;
      const atual = ms.getSelected();
      if (atual.length === 1 && igual(atual[0], valor)) ms.clear(); else ms.setSelected([valor]);
      // Trocar de unidade pode tirar o departamento escolhido das opções.
      updateDependentFilters();
    } else if (tipo === 'mes') {
      const [a, m] = valor.split('-').map(Number);
      const ini = `${valor}-01`;
      const fim = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
      if ($('#f-start').value === ini && $('#f-end').value === fim) setDefaultDates();
      else { $('#f-start').value = ini; $('#f-end').value = fim; }
    }
    renderCurrentSection();
  }
  window.HUB_FILTRAR_POR = aplicarFiltroDoGrafico;
  window.HUB_GET_FILTERS = () => getFilters();

  // Botão global no topo (visível em todos os menus) — busca os dados mais
  // recentes do Supabase sem precisar recarregar a página. Reaproveita
  // HUB_RELOAD_DATA (mesma função chamada após um upload em Administração):
  // recarrega todas as tabelas de Indicadores + listas mestre do
  // Recrutamento, e renderCurrentSection() no final já recarrega
  // vagas/candidatos/entrevistas também, se a seção atual for do módulo
  // Recrutamento (ver RECRUIT_SECTIONS).
  function wireRefreshButton() {
    const btn = $('#btn-refresh-data');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      // innerHTML (não textContent) pra preservar o <span class="btn-label">
      // que o CSS mobile usa pra esconder só o texto e manter o ícone.
      const original = btn.innerHTML;
      btn.innerHTML = '&#8635; Atualizando...';
      try { await HUB_RELOAD_DATA(true); }
      finally { btn.disabled = false; btn.innerHTML = original; }
    });
  }

  function wireNav() {
    $$('.nav-item').forEach(item => item.addEventListener('click', () => goToSection(item.dataset.section)));
    wireModuleToggle();
  }

  // Clique no título do módulo (Indicadores/Recrutamento/Treinamento e
  // Desenvolvimento/Administração) oculta/mostra os itens daquele grupo —
  // usa uma classe própria (.sb-collapsed) em vez de mexer no style.display
  // que applyPermissionsToNav() já usa para ocultar por permissão, então os
  // dois controles não se atropelam.
  function wireModuleToggle() {
    $$('.sb-mod-title').forEach(title => {
      title.addEventListener('click', () => {
        const collapsed = title.classList.toggle('collapsed');
        let el = title.nextElementSibling;
        while (el && el.classList.contains('nav-item')) {
          el.classList.toggle('sb-collapsed', collapsed);
          el = el.nextElementSibling;
        }
      });
    });
  }

  // Esconde cada item de menu sem permissão, e o título do módulo inteiro se
  // nenhum item dele sobrou visível — assim o cadastro de acessos granular
  // realmente controla o que cada pessoa enxerga na barra lateral.
  function applyPermissionsToNav() {
    $$('.nav-item[data-section]').forEach(item => {
      item.style.display = canSee(item.dataset.section) ? 'flex' : 'none';
    });
    $$('.sb-mod-title').forEach(title => {
      let el = title.nextElementSibling;
      let anyVisible = false;
      while (el && el.classList.contains('nav-item')) {
        if (el.style.display !== 'none') anyVisible = true;
        el = el.nextElementSibling;
      }
      title.style.display = anyVisible ? 'block' : 'none';
    });
  }

  function firstVisibleSection() {
    const order = ['dashboard'].concat(Object.keys(NAV_PERMISSIONS));
    return order.find(canSee) || 'dashboard';
  }

  async function reloadData(showStatus) {
    const statusEl = $('#data-status');
    statusEl.style.color = '';
    // A Pesquisa de Engajamento é carregada sob demanda e muda a cada export novo:
    // "Atualizar dados" (e os uploads) descartam o cache para a próxima leitura.
    if (window.HUB_ENGAJAMENTO) HUB_ENGAJAMENTO.invalidar();
    if(window.HUB_CONEXAO_STORE?.ready())await HUB_CONEXAO_STORE.load(true);
    if (window.HUB_BOLETIM) HUB_BOLETIM.invalidar();
    if (window.HUB_SATISFACAO) HUB_SATISFACAO.invalidar();
    if (window.HUB_FECHAMENTO) HUB_FECHAMENTO.invalidar();
    if (window.HUB_RECRUIT && HUB_RECRUIT.invalidar) HUB_RECRUIT.invalidar();
    try {
      await HUB_DAL.loadAll((table, i, total, rowsSoFar) => {
        if (showStatus !== false) statusEl.textContent = `Carregando dados... (${i + 1}/${total}: ${table}, ${U.fmtInt(rowsSoFar)} linhas)`;
      });
      const n = Object.values(HUB_DATA).reduce((s, arr) => s + (arr ? arr.length : 0), 0);
      statusEl.textContent = n ? `${U.fmtInt(n)} registros carregados` : 'Nenhum dado carregado ainda';
    } catch (err) {
      statusEl.textContent = 'Atenção: ' + err.message;
      statusEl.style.color = 'var(--critical)';
      statusEl.title = err.message;
    }
    try { await HUB_RECRUIT.reloadMasterLists(); } catch (err) { /* listas mestre do Recrutamento são opcionais no primeiro carregamento */ }
    populateFilterOptions();
    // Turmas e Multiplicadoras: número de pendências no item do menu.
    if (window.HUB_TURMAS_AVISO) HUB_TURMAS_AVISO();
    renderCurrentSection();
  }
  window.HUB_RELOAD_DATA = reloadData;

  // evento: 'login' (acabou de entrar) ou 'sessao' (voltou com a sessão aberta)
  // — vai para o Log de Acessos antes do primeiro módulo aberto.
  async function enterApp(profile, evento) {
    window.HUB_USER = profile;
    if (evento) await HUB_LOG_ACESSO.registrar(evento);
    $('#login-screen').hidden = true;
    $('#app-shell').hidden = false;
    $('#user-name').textContent = profile.nome || profile.email;
    $('#user-avatar').textContent = (profile.nome || profile.email || 'U').charAt(0).toUpperCase();
    $('#user-role').textContent = P.PERFIL_LABELS[profile.perfil] || profile.perfil;
    applyPermissionsToNav();
    setDefaultDates();
    wireFilterBar();
    wireRefreshButton();
    wireNav();
    goToSection(firstVisibleSection());
    await reloadData();
  }

  async function loadProfileOrFail(authUser) {
    const { data, error } = await sb.from('profiles').select('*').eq('id', authUser.id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('NO_PROFILE');
    if (data.status === 'inativo') throw new Error('INATIVO');
    if (data.status === 'desligado') throw new Error('DESLIGADO');
    return { id: data.id, email: data.email, nome: data.nome, perfil: data.perfil, unidades: data.unidades || [], departamentos: data.departamentos || [], permissoes: data.permissoes || {}, satisfacao_areas: data.satisfacao_areas || [] };
  }

  function withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  async function doLogin(e) {
    e.preventDefault();
    const btn = $('#login-btn');
    const msg = $('#login-msg');
    msg.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Entrando...';
    const slowHint = setTimeout(() => {
      btn.textContent = 'Ainda entrando... (pode demorar se o projeto Supabase ficou inativo)';
    }, 6000);
    try {
      const email = $('#login-email').value.trim();
      const password = $('#login-pass').value;
      const TIMEOUT_MSG = 'A conexão com o Supabase demorou demais para responder. Se o projeto ficou muito tempo sem uso ele pode estar "acordando" — aguarde meio minuto e tente de novo.';
      const { data, error } = await withTimeout(sb.auth.signInWithPassword({ email, password }), 25000, TIMEOUT_MSG);
      if (error) throw error;
      const profile = await withTimeout(loadProfileOrFail(data.user), 20000, TIMEOUT_MSG);
      await enterApp(profile, 'login');
    } catch (err) {
      if (err.message === 'NO_PROFILE') {
        msg.textContent = 'Este login existe no Supabase mas não tem um perfil de acesso cadastrado. Peça para um administrador cadastrá-lo em Administração → Cadastro de Acessos.';
      } else if (err.message === 'DESLIGADO') {
        msg.textContent = 'Seu acesso ao Hub Sfera foi encerrado. Em caso de dúvida, fale com o RH.';
      } else if (err.message === 'INATIVO') {
        msg.textContent = 'Seu acesso ao Hub Sfera está inativo. Em caso de dúvida, fale com o RH.';
      } else if (/invalid login credentials/i.test(err.message || '')) {
        msg.textContent = 'E-mail ou senha incorretos.';
      } else {
        msg.textContent = err.message || 'Não foi possível entrar. Tente novamente.';
      }
      msg.style.display = 'block';
      await sb.auth.signOut().catch(() => {});
    } finally {
      clearTimeout(slowHint);
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  }

  async function doLogout() {
    await HUB_LOG_ACESSO.registrar('logout');
    await sb.auth.signOut();
    window.location.reload();
  }

  // Sidebar em telas ≤900px vira uma gaveta deslizante (ver CSS .sidebar em
  // index.html) — sem isto ela some por completo e leva junto o único jeito
  // de trocar de seção ou sair (o botão "Sair" mora dentro dela).
  function closeMobileMenu() {
    $('.sidebar').classList.remove('open');
    $('#sb-backdrop').classList.remove('open');
  }
  function wireMobileMenu() {
    const btn = $('#btn-mobile-menu');
    const backdrop = $('#sb-backdrop');
    if (!btn || !backdrop) return;
    btn.addEventListener('click', () => {
      $('.sidebar').classList.toggle('open');
      backdrop.classList.toggle('open');
    });
    backdrop.addEventListener('click', closeMobileMenu);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMobileMenu(); });
  }

  async function bootstrap() {
    if (!window.HUB_SUPABASE_READY) {
      $('#login-btn').disabled = true;
      $('#setup-hint').textContent = 'Supabase ainda não configurado — preencha js/config.js com a URL e a chave anon do seu projeto (veja SETUP.md).';
      return;
    }
    $('#login-form').addEventListener('submit', doLogin);
    $('#btn-logout').addEventListener('click', doLogout);
    wireMobileMenu();

    const { data } = await sb.auth.getSession();
    if (data && data.session) {
      try {
        const profile = await loadProfileOrFail(data.session.user);
        await enterApp(profile, 'sessao');
      } catch (err) {
        await sb.auth.signOut();
      }
    }
  }

  document.addEventListener('DOMContentLoaded', bootstrap);
})();
