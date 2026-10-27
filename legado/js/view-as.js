// Administração → Cadastro de Acessos → "Visualizar como": deixa um
// Administrador ver o Hub exatamente como um perfil/conta específico veria —
// menu, permissões e (melhor esforço) recorte de dados por unidade/
// departamento — sem precisar da senha da pessoa nem fazer login de novo.
//
// Como funciona, em 3 partes:
//  1) Troca window.HUB_USER pelo perfil/permissões/unidades/departamentos da
//     conta escolhida — todo o app já decide o que mostrar checando
//     HUB_USER em tempo real (menu, telas, blocos de Insights), então isso
//     sozinho já resolve "o que essa pessoa vê no menu".
//  2) Para simular a restrição por unidade/departamento que a RLS do
//     Supabase aplicaria a um Gestor de verdade (e que aqui não se aplica,
//     porque a sessão real continua sendo a do Administrador), recorta as
//     linhas já carregadas em HUB_DATA/HUB_RECRUIT_DATA pela mesma regra do
//     can_see() do banco (ver canSeeRow abaixo) — e reaplica esse recorte
//     sempre que uma tela recarrega dados (Recrutamento ao vivo, Avaliação
//     da Experiência, Pesquisa de Clima).
//  3) Bloqueia qualquer escrita no Supabase enquanto o modo estiver ativo
//     (proxy em cima de sb.from/sb.rpc) e esconde inteiramente o módulo
//     Administração — visualizar como alguém nunca deve permitir mexer em
//     dados reais nem em outras contas.
//
// Limitações conhecidas (avisadas na faixa de topo):
//  - Organograma e Headcount de quem NÃO tem a permissão "...completo" usam
//    a função organograma_meu_galho() do banco — desde que
//    supabase-organograma.sql (versão com p_target_profile_id) tenha sido
//    rodado, ela aceita pedir a equipe de OUTRA conta (checando
//    admin.usuarios no próprio banco). Sem essa versão do SQL, cai de volta
//    no próprio galho do Administrador — a tela avisa isso, nunca mostra a
//    equipe errada com a etiqueta da pessoa errada.
//  - O recorte de dados é uma aproximação do que a RLS faria, não uma cópia
//    exata: cobre as tabelas carregadas no navegador, mas não substitui um
//    teste de verdade com o login da pessoa quando a decisão for crítica.
(function () {
  const U = HUB_UTILS;
  const P = HUB_PERMISSIONS;

  let active = false;
  let realUser = null;
  let simUser = null;
  let savedHubData = null;       // { tabela: array original } — restaurado ao sair
  let sbOriginal = null;         // { from, rpc } reais, restaurados ao sair
  let galhoOriginal = null;      // { get, cached } reais
  let galhoCache = null;         // resultado já resolvido (da conta simulada), enquanto ativo
  let galhoPending = null;       // busca em andamento, evita pedir 2x em paralelo
  let hasPermOriginal = null;
  let recruitReloadOriginal = null;
  let experienciaCarregarOriginal = null;
  let climaCarregarOriginal = null;
  let engajamentoCarregarOriginal = null;
  let logId = null;               // id do registro em viewas_log desta sessão de visualização

  // Tabelas de Indicadores restringíveis por unidade/departamento, no mesmo
  // padrão do can_see(unidade, departamento) do supabase-migration.sql.
  // twygo_conteudos fica de fora de propósito: a policy dela libera qualquer
  // usuário logado, sem recorte (é um catálogo, não dado de pessoa).
  const INDICADORES_SCOPE = {
    colaboradores: ['unidade', 'departamento'], feedbacks: ['unidade', 'departamento'],
    one_on_one: ['unidade', 'departamento'], celebracoes: ['unidade', 'departamento'],
    entrevista_pesquisa: ['unidade', 'departamento'], entrevista_solicitacao: ['unidade', 'departamento'],
    experiencia_candidato: ['unidade', 'departamento'], twygo_participantes: ['unidade', 'departamento'],
    twygo_usuarios: ['unidade', 'departamento'], pesquisa_clima: ['unidade', 'departamento'],
    pesquisa_clima_hc: ['unidade', 'departamento'], engajamento_participacao: ['unidade', 'departamento'],
    unibe_pdv: ['unidade', 'departamento'], unibe_pessoas: ['unidade', 'departamento'], academia_hering: ['unidade', 'departamento']
  };
  // Tabelas do Recrutamento (HUB_RECRUIT_DATA) — entrevistas não tem coluna
  // "departamento" (can_see(unidade, null) na policy real); visitas_loja usa
  // "area" e um departamento fixo (can_see(area, 'Treinamento e Desenvolvimento')).
  const RECRUIT_SCOPE = {
    vagas: ['unidade', 'departamento'], candidatos: ['unidade', 'departamento'],
    entrevistas: ['unidade', null], onboarding: ['unidade', 'departamento'],
    pareceresGestor: ['unidade', 'departamento'], entrevistasDesligamento: ['unidade', 'departamento'],
    visitasLoja: ['area', '__FIXO__:Treinamento e Desenvolvimento']
  };
  // HUB_RECRUIT_DATA usa os nomes de tabela do banco (snake_case), não os
  // camelCase acima usados só pra combinar com a leitura em português.
  const RECRUIT_TABLE_NAMES = {
    vagas: 'vagas', candidatos: 'candidatos', entrevistas: 'entrevistas', onboarding: 'onboarding',
    pareceresGestor: 'pareceres_gestor', entrevistasDesligamento: 'entrevistas_desligamento', visitasLoja: 'visitas_loja'
  };

  // Tabelas cuja policy de leitura, além do recorte, exige a permissão do
  // módulo (supabase-recorte-rh-permissoes.sql e supabase-entrevista-privacidade.sql).
  // Sem a permissão, o banco devolve vazio para a pessoa de verdade.
  const INDICADORES_PERM = {
    feedbacks: 'indicadores.feedbacks', one_on_one: 'indicadores.oneonone', celebracoes: 'indicadores.celebracoes',
    twygo_participantes: 'indicadores.treinamentos', twygo_usuarios: 'indicadores.treinamentos',
    entrevista_pesquisa: 'indicadores.desligamento', entrevista_solicitacao: 'indicadores.desligamento',
    pesquisa_clima: 'indicadores.pesquisa_clima', pesquisa_clima_hc: 'indicadores.pesquisa_clima',
    unibe_pdv: 'indicadores.treinamentos', unibe_pessoas: 'indicadores.treinamentos', academia_hering: 'indicadores.treinamentos'
  };

  const SEM_UNIDADE_BLOQUEIA = new Set(['unibe_pdv', 'unibe_pessoas', 'academia_hering']);
  const UNIBE_ESCRITORIO = new Set(['unibe_pdv', 'unibe_pessoas']);

  // Mesma regra de public.can_see() do banco: só o admin vê tudo; RH e
  // gestor só veem linhas cuja unidade/departamento estejam liberados (lista
  // vazia = sem restrição naquele eixo); unidade nula sempre passa,
  // departamento nulo só passa se não há departamento restrito.
  function canSeeRow(rowUnidade, rowDepartamento, target) {
    if (target.perfil === 'admin') return true;
    if (target.perfil !== 'gestor' && target.perfil !== 'rh') return false;
    const un = (target.unidades || []).map(U.normalizeText);
    const dp = (target.departamentos || []).map(U.normalizeText);
    const okU = !un.length || rowUnidade == null || un.includes(U.normalizeText(rowUnidade));
    const okD = !dp.length || (rowDepartamento != null && dp.includes(U.normalizeText(rowDepartamento)));
    return okU && okD;
  }

  function scopeArray(rows, uField, dField) {
    if (!Array.isArray(rows)) return rows;
    return rows.filter(r => {
      const rowD = dField && dField.indexOf('__FIXO__:') === 0 ? dField.slice(9) : (dField ? r[dField] : null);
      return canSeeRow(r[uField], rowD, simUser);
    });
  }

  function applyScopeToHubData() {
    savedHubData = {};
    for (const [tabela, [u, d]] of Object.entries(INDICADORES_SCOPE)) {
      if (!window.HUB_DATA || !Array.isArray(window.HUB_DATA[tabela])) continue;
      savedHubData[tabela] = window.HUB_DATA[tabela];
      const perm = INDICADORES_PERM[tabela];
      const temPerm = !perm || simUser.perfil === 'admin' || !!(simUser.permissoes && simUser.permissoes[perm] === true);
      // Unibê / Academia: linha sem unidade não passa (coalesce na policy, supabase-treinamentos.sql).
      const linhas = SEM_UNIDADE_BLOQUEIA.has(tabela) ? window.HUB_DATA[tabela].map(r => r[u] == null ? Object.assign({}, r, { [u]: '(sem unidade)' }) : r) : window.HUB_DATA[tabela];
      // Unibê: quem tem a unidade Escritório liberada vê tudo (treinamentos_ve_escritorio no banco).
      const escritorio = UNIBE_ESCRITORIO.has(tabela) && (simUser.unidades || []).some(x => U.normalizeText(x) === 'escritorio');
      window.HUB_DATA[tabela] = !temPerm ? [] : escritorio ? linhas : scopeArray(linhas, u, d);
    }
  }
  // Tabelas sem unidade/departamento, liberadas só pela permissão do módulo.
  const SO_PERMISSAO = { treinamento_turmas: 'treinamento_dev.turmas' };
  function aplicarSoPermissao() {
    for (const [tabela, perm] of Object.entries(SO_PERMISSAO)) {
      if (!window.HUB_DATA || !Array.isArray(window.HUB_DATA[tabela])) continue;
      savedHubData[tabela] = window.HUB_DATA[tabela];
      const temPerm = simUser.perfil === 'admin' || !!(simUser.permissoes && (simUser.permissoes[perm] === true
        || (tabela === 'treinamento_turmas' && simUser.permissoes['treinamento_dev.turmas_gestor'] === true)));
      if (temPerm) continue;
      // Turmas: a multiplicadora (só "lançar") vê as que ela mesma lançou — mesma regra da policy.
      const lanca = tabela === 'treinamento_turmas' && !!(simUser.permissoes && simUser.permissoes['treinamento_dev.turmas_lancar'] === true);
      window.HUB_DATA[tabela] = lanca ? window.HUB_DATA[tabela].filter(r => r.criado_por && r.criado_por === simUser.id) : [];
    }
  }
  function restoreHubData() {
    if (!savedHubData) return;
    for (const [tabela, rows] of Object.entries(savedHubData)) window.HUB_DATA[tabela] = rows;
    savedHubData = null;
  }

  function applyScopeToRecruitData() {
    if (!window.HUB_RECRUIT_DATA) return;
    for (const [key, [u, d]] of Object.entries(RECRUIT_SCOPE)) {
      const tabela = RECRUIT_TABLE_NAMES[key];
      if (!Array.isArray(window.HUB_RECRUIT_DATA[tabela])) continue;
      window.HUB_RECRUIT_DATA[tabela] = scopeArray(window.HUB_RECRUIT_DATA[tabela], u, d);
    }
    // Entrevista de Desligamento: além da unidade/departamento, a RLS exige
    // permissão — links e o resumo dos Indicadores pedem
    // "indicadores.desligamento"; a tabela completa do Controle pede
    // "indicadores.controle_desligamento". Sem a permissão, o banco devolve
    // vazio para a pessoa de verdade.
    const RD = window.HUB_RECRUIT_DATA;
    const tem = k => simUser.perfil === 'admin' || !!(simUser.permissoes && simUser.permissoes[k] === true);
    if (!tem('indicadores.desligamento')) { RD.controle_desligamento_ind = []; RD.entrevistas_desligamento_ind = []; }
    if (!tem('indicadores.controle_desligamento')) { RD.controle_desligamento = []; RD.controle_respostas_forms = []; }
    if (!tem('indicadores.controle_desligamento') && !tem('indicadores.desligamento_gerar_link')) RD.entrevistas_desligamento = [];
    if (Array.isArray(RD.entrevistas_desligamento_ind)) RD.entrevistas_desligamento_ind = scopeArray(RD.entrevistas_desligamento_ind, 'unidade', 'departamento');
    if (Array.isArray(RD.controle_desligamento_ind)) RD.controle_desligamento_ind = scopeArray(RD.controle_desligamento_ind, 'unidade', 'departamento');
    if (Array.isArray(RD.controle_desligamento)) RD.controle_desligamento = scopeArray(RD.controle_desligamento, 'unidade', 'departamento');
  }

  function scopeExperienciaCache() {
    if (!window.HUB_EXPERIENCIA_DATA) return;
    for (const ciclo of [45, 90]) {
      if (Array.isArray(window.HUB_EXPERIENCIA_DATA[ciclo])) {
        window.HUB_EXPERIENCIA_DATA[ciclo] = scopeArray(window.HUB_EXPERIENCIA_DATA[ciclo], 'unidade', 'departamento');
      }
    }
  }

  // Recrutamento recarrega vagas/candidatos/... do zero toda vez que se abre
  // qualquer tela do módulo (ver RECRUIT_SECTIONS em app.js) — reaplica o
  // recorte depois de cada recarga, sem isso a próxima tela mostraria tudo.
  // Avaliação da Experiência e Pesquisa de Clima só buscam uma vez por sessão
  // (cache) — reaplica também depois da primeira busca de cada uma.
  function wrapReloaders() {
    if (window.HUB_RECRUIT && !recruitReloadOriginal) {
      recruitReloadOriginal = HUB_RECRUIT.reload;
      // finally: se a recarga falhar no meio (ex.: uma tabela), o recorte
      // ainda é aplicado ao que já foi carregado — sem isso a tela mostrava
      // dados de todas as unidades.
      HUB_RECRUIT.reload = async function (...args) {
        try { return await recruitReloadOriginal.apply(HUB_RECRUIT, args); }
        finally { if (active) applyScopeToRecruitData(); }
      };
    }
    if (window.HUB_EXPERIENCIA && !experienciaCarregarOriginal) {
      experienciaCarregarOriginal = HUB_EXPERIENCIA.carregar;
      HUB_EXPERIENCIA.carregar = async function (ciclo, opts) {
        const r = await experienciaCarregarOriginal.call(HUB_EXPERIENCIA, ciclo, opts);
        if (active) scopeExperienciaCache();
        return window.HUB_EXPERIENCIA_DATA[ciclo];
      };
    }
    if (window.HUB_PESQUISA_CLIMA && !climaCarregarOriginal) {
      climaCarregarOriginal = HUB_PESQUISA_CLIMA.carregar;
      HUB_PESQUISA_CLIMA.carregar = async function (...args) {
        const r = await climaCarregarOriginal.apply(HUB_PESQUISA_CLIMA, args);
        if (active && window.HUB_DATA) {
          if (Array.isArray(HUB_DATA.pesquisa_clima)) HUB_DATA.pesquisa_clima = scopeArray(HUB_DATA.pesquisa_clima, 'unidade', 'departamento');
          if (Array.isArray(HUB_DATA.pesquisa_clima_hc)) HUB_DATA.pesquisa_clima_hc = scopeArray(HUB_DATA.pesquisa_clima_hc, 'unidade', 'departamento');
        }
        return r;
      };
    }
    // Pesquisa de Engajamento: mesma ideia (só a participação por unidade/departamento
    // é restringível; os totais por pulso ficam como vêm do banco).
    if (window.HUB_ENGAJAMENTO && !engajamentoCarregarOriginal) {
      engajamentoCarregarOriginal = HUB_ENGAJAMENTO.carregar;
      HUB_ENGAJAMENTO.carregar = async function (...args) {
        const r = await engajamentoCarregarOriginal.apply(HUB_ENGAJAMENTO, args);
        if (active && window.HUB_DATA && Array.isArray(HUB_DATA.engajamento_participacao)) {
          HUB_DATA.engajamento_participacao = scopeArray(HUB_DATA.engajamento_participacao, 'unidade', 'departamento');
        }
        return r;
      };
    }
  }
  function unwrapReloaders() {
    if (recruitReloadOriginal) { HUB_RECRUIT.reload = recruitReloadOriginal; recruitReloadOriginal = null; }
    if (experienciaCarregarOriginal) { HUB_EXPERIENCIA.carregar = experienciaCarregarOriginal; experienciaCarregarOriginal = null; }
    if (climaCarregarOriginal) { HUB_PESQUISA_CLIMA.carregar = climaCarregarOriginal; climaCarregarOriginal = null; }
    if (engajamentoCarregarOriginal) { HUB_ENGAJAMENTO.carregar = engajamentoCarregarOriginal; engajamentoCarregarOriginal = null; }
  }

  // Organograma / Headcount sem "...completo": pede ao banco a equipe de
  // VERDADE da conta simulada, via organograma_meu_galho(p_target_profile_id)
  // — chama pelo sb.rpc ORIGINAL (sbOriginal, salvo por blockWrites), porque
  // sb.rpc fica bloqueado enquanto o modo estiver ativo. O banco só aceita o
  // parâmetro se quem está chamando (o Administrador de verdade) tiver
  // admin.usuarios; sem isso, ou sem a versão nova do SQL rodada, o próprio
  // banco devolve o galho do Administrador — daí o aviso quando os dois ids
  // não batem, pra nunca mostrar a equipe errada sem avisar.
  function wrapGalho() {
    if (!window.HUB_GALHO || galhoOriginal) return;
    galhoOriginal = { get: HUB_GALHO.get, cached: HUB_GALHO.cached };
    HUB_GALHO.get = function () {
      if (!active) return galhoOriginal.get();
      if (galhoCache) return Promise.resolve(galhoCache);
      if (galhoPending) return galhoPending;
      const rpcReal = (sbOriginal && sbOriginal.rpc ? sbOriginal.rpc : sb.rpc).bind(sb);
      galhoPending = (async () => {
        let res;
        try {
          const { data, error } = await rpcReal('organograma_meu_galho', { p_target_profile_id: simUser.id });
          if (error) throw error;
          res = { rows: data || [] };
        } catch (err) {
          res = {
            rows: [],
            erro: /organograma_meu_galho|function|funç/i.test(err.message || '')
              ? 'para simular a equipe (galho) de outra conta, rode a versão mais recente de supabase-organograma.sql no Supabase (com o parâmetro p_target_profile_id).'
              : (err.message || String(err))
          };
        }
        res.ids = new Set(res.rows.filter(r => r.relacao !== 'acima').map(HUB_GALHO.chave));
        galhoCache = res;
        galhoPending = null;
        return res;
      })();
      return galhoPending;
    };
    HUB_GALHO.cached = function () {
      return active ? galhoCache : galhoOriginal.cached();
    };
  }
  function unwrapGalho() {
    if (!galhoOriginal) return;
    HUB_GALHO.get = galhoOriginal.get;
    HUB_GALHO.cached = galhoOriginal.cached;
    galhoOriginal = null;
    galhoCache = null;
    galhoPending = null;
  }

  // Administração (Upload de Planilhas, Cadastros do Recrutamento, Cadastro
  // de Acessos) fica sempre fora do modo de visualização, mesmo simulando
  // outro Administrador — mexer em dados reais ou em outras contas nunca
  // deve acontecer "vestindo a pele" de alguém. hasPerm() é o único lugar
  // por onde passa toda checagem de permissão (menu, telas, canUpload()),
  // então um único remendo aqui já esconde o módulo inteiro em qualquer tela.
  function wrapHasPerm() {
    if (hasPermOriginal) return;
    hasPermOriginal = P.hasPerm;
    P.hasPerm = function (user, key) {
      if (active && key && key.indexOf('admin.') === 0) return false;
      return hasPermOriginal(user, key);
    };
  }
  function unwrapHasPerm() {
    if (!hasPermOriginal) return;
    P.hasPerm = hasPermOriginal;
    hasPermOriginal = null;
  }

  function blockedError() {
    return new Error('Ação bloqueada: o modo "Visualizar como" é somente leitura. Saia da visualização para fazer alterações.');
  }
  // "Corrente" que aceita qualquer método encadeado do PostgREST
  // (.select().eq().single() etc.) depois de insert/update/upsert/delete e,
  // ao ser aguardada (await), sempre resolve como {data:null, error} — nunca
  // rejeita, pra não derrubar quem espera esse formato específico.
  function makeBlockedChain() {
    const result = { data: null, error: blockedError() };
    const chain = new Proxy(function () {}, {
      apply() { return chain; },
      get(_target, prop) {
        if (prop === 'then') return resolve => resolve(result);
        if (prop === 'catch' || prop === 'finally') return () => chain;
        return () => chain;
      }
    });
    return chain;
  }
  function blockWrites() {
    if (!window.sb || sbOriginal) return;
    sbOriginal = { from: sb.from, rpc: sb.rpc };
    const realFrom = sbOriginal.from.bind(sb);
    sb.from = function (table) {
      const real = realFrom(table);
      return new Proxy(real, {
        get(target, prop) {
          if (prop === 'insert' || prop === 'update' || prop === 'upsert' || prop === 'delete') return () => makeBlockedChain();
          const v = target[prop];
          return typeof v === 'function' ? v.bind(target) : v;
        }
      });
    };
    // Funções do banco que só LEEM dados continuam liberadas (o resultado
    // passa pelo mesmo recorte das tabelas); todas as outras ficam bloqueadas.
    const realRpc = sbOriginal.rpc.bind(sb);
    sb.rpc = (fn, ...args) => (RPC_SO_LEITURA.has(fn) ? realRpc(fn, ...args) : makeBlockedChain());
  }
  const RPC_SO_LEITURA = new Set(['controle_desligamento_indicadores', 'entrevistas_desligamento_indicadores',
    'controle_desligamento_respostas_forms_resumo', 'controle_desligamento_respostas_forms', 'controle_desligamento_respostas_forms_exportar',
    // Pesquisa de Satisfação: o recorte por área da conta simulada é refeito na
    // tela (HUB_METRICS_SATISFACAO.recortar com o HUB_USER simulado).
    'satisfacao_dados',
    // Resumo do Boletim no Dashboard: recebe o id da conta simulada e o banco
    // devolve o recorte dela (só para quem tem admin.usuarios).
    'boletim_resumo_publicado']);
  function unblockWrites() {
    if (!sbOriginal) return;
    sb.from = sbOriginal.from;
    sb.rpc = sbOriginal.rpc;
    sbOriginal = null;
  }

  function refreshBtn() { return document.getElementById('btn-refresh-data'); }

  function renderBanner() {
    let bar = document.getElementById('view-as-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'view-as-bar';
      document.body.appendChild(bar);
    }
    const perfilLabel = P.PERFIL_LABELS[simUser.perfil] || simUser.perfil;
    bar.innerHTML = `<span>&#128065; Visualizando como <b>${U.escapeHtml(simUser.nome || simUser.email)}</b> — perfil <b>${U.escapeHtml(perfilLabel)}</b>.
      Somente leitura — nada do que aparece aqui grava no banco.
      <span title="Recorte de dados por unidade/departamento é uma aproximação do que a pessoa veria de verdade. O módulo Administração nunca é simulado." style="cursor:help;border-bottom:1px dotted;margin-left:4px">(?)</span></span>
      <button type="button" id="view-as-exit">Sair da visualização</button>`;
    document.getElementById('view-as-exit').addEventListener('click', () => exit());
    document.body.classList.add('view-as-mode');
  }
  function removeBanner() {
    const bar = document.getElementById('view-as-bar');
    if (bar) bar.remove();
    document.body.classList.remove('view-as-mode');
  }

  function swapTopoUsuario() {
    const nameEl = document.getElementById('user-name');
    const avatarEl = document.getElementById('user-avatar');
    const roleEl = document.getElementById('user-role');
    if (nameEl) nameEl.textContent = simUser.nome || simUser.email;
    if (avatarEl) avatarEl.textContent = (simUser.nome || simUser.email || 'U').charAt(0).toUpperCase();
    if (roleEl) roleEl.textContent = (P.PERFIL_LABELS[simUser.perfil] || simUser.perfil) + ' (visualização)';
  }
  function restoreTopoUsuario() {
    const nameEl = document.getElementById('user-name');
    const avatarEl = document.getElementById('user-avatar');
    const roleEl = document.getElementById('user-role');
    if (nameEl) nameEl.textContent = realUser.nome || realUser.email;
    if (avatarEl) avatarEl.textContent = (realUser.nome || realUser.email || 'U').charAt(0).toUpperCase();
    if (roleEl) roleEl.textContent = P.PERFIL_LABELS[realUser.perfil] || realUser.perfil;
  }

  async function enter(profile) {
    if (active) await exit();
    realUser = window.HUB_USER;
    simUser = {
      id: profile.id, nome: profile.nome, email: profile.email, perfil: profile.perfil,
      unidades: profile.unidades || [], departamentos: profile.departamentos || [], permissoes: profile.permissoes || {},
      satisfacao_areas: profile.satisfacao_areas || []
    };
    active = true;
    window.HUB_USER = simUser;

    // Log de auditoria (viewas_log — ver supabase-viewas-log.sql): grava ANTES
    // de bloquear as escritas (blockWrites troca sb.from logo abaixo), senão
    // o próprio registro do log seria bloqueado. Falha aqui não impede o uso
    // do modo de visualização, só fica sem registro.
    logId = null;
    if (window.HUB_DAL && HUB_DAL.logViewAsStart) {
      try { logId = await HUB_DAL.logViewAsStart(simUser, realUser); }
      catch (err) { console.warn('Visualizar como: não consegui gravar o log de auditoria (viewas_log) —', err.message); }
    }

    wrapHasPerm();
    wrapGalho();
    wrapReloaders();
    blockWrites();
    applyScopeToHubData();
    aplicarSoPermissao();
    applyScopeToRecruitData();
    scopeExperienciaCache();

    const btn = refreshBtn();
    if (btn) { btn.disabled = true; btn.title = 'Desativado durante "Visualizar como" — saia do modo de visualização para atualizar os dados.'; }

    swapTopoUsuario();
    renderBanner();
    if (window.HUB_APPLY_NAV_PERMS) HUB_APPLY_NAV_PERMS();
    if (window.HUB_REFRESH_FILTER_OPTIONS) HUB_REFRESH_FILTER_OPTIONS();
    if (window.HUB_GOTO_SECTION) HUB_GOTO_SECTION('dashboard');
  }

  async function exit() {
    if (!active) return;
    active = false;
    window.HUB_USER = realUser;

    unwrapHasPerm();
    unwrapGalho();
    unwrapReloaders();
    unblockWrites();
    restoreHubData();
    // Avaliação da Experiência ficou em cache recortado — descarta pra
    // próxima abertura buscar de novo, sem restrição (sessão real é admin).
    if (window.HUB_EXPERIENCIA_DATA) { HUB_EXPERIENCIA_DATA[45] = null; HUB_EXPERIENCIA_DATA[90] = null; }

    // Fecha o registro do log (depois de unblockWrites, pra ir com a escrita real).
    if (logId && window.HUB_DAL && HUB_DAL.logViewAsEnd) {
      try { await HUB_DAL.logViewAsEnd(logId); }
      catch (err) { console.warn('Visualizar como: não consegui fechar o log de auditoria (viewas_log) —', err.message); }
    }
    logId = null;

    const btn = refreshBtn();
    if (btn) { btn.disabled = false; btn.title = ''; }

    restoreTopoUsuario();
    removeBanner();
    if (window.HUB_APPLY_NAV_PERMS) HUB_APPLY_NAV_PERMS();
    if (window.HUB_REFRESH_FILTER_OPTIONS) HUB_REFRESH_FILTER_OPTIONS();
    if (window.HUB_GOTO_SECTION) HUB_GOTO_SECTION('dashboard');
    realUser = null;
    simUser = null;
  }

  window.HUB_VIEW_AS = { enter, exit, isActive: () => active };
})();
