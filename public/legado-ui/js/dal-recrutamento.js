// Camada de acesso a dados do módulo Recrutamento: vagas/candidatos/
// entrevistas/histórico/solicitações + listas mestre. Diferente de
// dal-indicadores.js (carrega tudo uma vez no login e nunca mais busca),
// aqui os dados mudam com frequência — HUB_RECRUIT.reload() é chamado pelo
// app.js toda vez que o usuário entra em QUALQUER tela do módulo
// Recrutamento (indicador ao vivo ou operacional), o que cobre "tempo real,
// de forma automática" sem precisar de upload nem de um socket persistente.
//
// As linhas em JS usam camelCase (mesmo vocabulário do Sfera Recruiter
// original); o banco usa snake_case. A tradução é genérica (não uma tabela
// de mapeamento por campo) — funciona porque todo nome de coluna aqui segue
// o padrão direto camelCase<->snake_case, sem abreviações especiais.
(function () {
  // `onboarding` entra aqui (não é uma tabela de "listas mestre") porque
  // muda com a mesma frequência que vagas/candidatos/entrevistas e precisa
  // recarregar toda vez que se entra em qualquer tela do módulo Recrutamento
  // OU do módulo Treinamento e Desenvolvimento — ver RECRUIT_SECTIONS em app.js.
  const RECRUIT_TABLES = ['vagas', 'candidatos', 'entrevistas', 'onboarding', 'visitas_loja', 'pareceres_gestor', 'entrevistas_desligamento', 'controle_desligamento'];
  // Tabelas novas que podem ainda não ter sido criadas no Supabase (script
  // SQL rodado depois do deploy): se não existirem, ficam vazias em vez de
  // derrubar a atualização de todas as telas do Recrutamento.
  const OPTIONAL_TABLES = new Set(['controle_desligamento']);
  const MASTER_TABLES = ['unidades', 'cargos', 'etapas', 'fontes_captacao', 'portais', 'niveis_vaga', 'recrutadores', 'recrutamento_departamentos'];

  window.HUB_RECRUIT_DATA = window.HUB_RECRUIT_DATA || {};
  for (const t of RECRUIT_TABLES.concat(MASTER_TABLES)) window.HUB_RECRUIT_DATA[t] = window.HUB_RECRUIT_DATA[t] || [];

  function camelToSnake(s) { return s.replace(/[A-Z]/g, m => '_' + m.toLowerCase()); }
  function snakeToCamel(s) { return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase()); }

  // Normaliza string vazia para null: os formulários deixam datas/números
  // opcionais como '' quando o campo não foi preenchido (valor padrão de
  // <input>), mas o Postgres rejeita '' como valor de coluna date/numeric/int
  // ("invalid input syntax for type date") — só null é aceito pra "sem
  // valor". Não mexe em arrays (portaisAtivos: [] etc.), só em string vazia.
  function toSnakeRow(obj) {
    const out = {};
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      out[camelToSnake(k)] = v === '' ? null : v;
    }
    return out;
  }
  function toCamelRow(obj) {
    const out = {};
    for (const k of Object.keys(obj)) out[snakeToCamel(k)] = obj[k];
    return out;
  }

  const QUERY_TIMEOUT_MS = 30000;
  function withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  // O Supabase/PostgREST limita cada select('*') sem paginação a no máximo
  // 1000 linhas por padrão — acima disso, ele NÃO retorna erro, só devolve
  // as primeiras 1000 e trunca o resto silenciosamente. Isso é o oposto de
  // "sem dados": as telas continuavam funcionando, só que com uma lista
  // incompleta de candidatos/vagas por trás — e como U.nextCode calcula o
  // próximo código de negócio (CAND-2026-XXX) a partir dessa lista truncada,
  // ele gerava IDs que colidiam com linhas reais só que invisíveis no
  // cliente (erro "duplicate key" persistente mesmo com poucos usuários
  // simultâneos). dal-indicadores.js já pagina; aqui não paginava —
  // corrigido buscando em blocos até a página vir incompleta. Páginas de 5000
  // (máximo da operação no servidor): menos idas e voltas.
  const PAGE = 5000;
  // Tabelas lidas ao mesmo tempo (as outras esperam a vez).
  const SIMULTANEAS = 4;

  // Roda fn(item, índice) para cada item, no máximo `limite` ao mesmo tempo.
  // Nunca rejeita: devolve, na ordem dos itens, { ok, valor } ou { ok: false, erro }.
  async function emParalelo(itens, limite, fn) {
    const res = new Array(itens.length);
    let proximo = 0;
    async function trabalhador() {
      while (proximo < itens.length) {
        const i = proximo++;
        try { res[i] = { ok: true, valor: await fn(itens[i], i) }; }
        catch (erro) { res[i] = { ok: false, erro }; }
      }
    }
    await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
    return res;
  }

  // Paginação com ordem fixa (por id): sem "order", o banco não garante a
  // mesma ordem entre uma página e outra e podia repetir ou pular linhas.
  // `desde` (opcional): só as linhas alteradas depois desse instante (vagas e candidatos).
  // Páginas por id crescente pela operação recrutamento.lerPagina (servidor do Hub).
  // Candidatos vêm SEM "observacoes" (texto longo): ver carregarObservacoes.
  async function fetchAll(table, colunas, desde) {
    let all = [];
    let aposId = null;
    for (;;) {
      const data = await withTimeout(
        HUB_API.chamar('recrutamento.lerPagina', { tabela: table, aposId, limite: PAGE, soIds: colunas === 'id', desde: desde || undefined }),
        QUERY_TIMEOUT_MS,
        `tempo esgotado buscando "${table}" (conexão lenta ou servidor do Hub indisponível)`
      );
      if (!data.length) break;
      all = all.concat(data);
      if (data.length < PAGE) break;
      aposId = data[data.length - 1].id;
    }
    return all.map(toCamelRow);
  }

  // ---- Só baixar o que mudou (supabase-trafego-recrutamento.sql) ----------
  // hub_versoes tem um contador por tabela, somado pelo banco a cada
  // gravação. Tabela com o mesmo contador da última vez não é baixada de
  // novo; vagas e candidatos, quando mudam, baixam só as linhas alteradas
  // (hub_alterado_em) + a lista de ids (para tirar as apagadas). Sem o SQL
  // (hub_versoes não existe), tudo é baixado inteiro como antes.
  // CACHE guarda a cópia do banco; as telas recebem um .slice() dela — o
  // "Visualizar como" recorta a cópia das telas, nunca o CACHE.
  const CACHE = {};                       // tabela → { rows, versao, desde }
  const RESUMOS = {};                     // destino → linhas (ou null)
  let resumosChave = null;
  let ultimaCompleta = 0;
  const RECARGA_COMPLETA_MS = 30 * 60 * 1000;
  const TABELAS_DELTA = new Set(['vagas', 'candidatos']);
  const MARGEM_DELTA_MS = 60 * 1000;      // folga para gravações que terminam durante a leitura

  async function lerVersoes() {
    try {
      const data = await withTimeout(HUB_API.chamar('recrutamento.versoes'), QUERY_TIMEOUT_MS, 'tempo esgotado lendo as versões');
      const m = {};
      for (const r of data || []) m[r.tabela] = r;
      return m;
    } catch (err) {
      return null;
    }
  }

  async function atualizarTabela(t, v, completa) {
    const c = CACHE[t];
    if (!completa && c && v && c.versao === v.versao) return; // ninguém mexeu
    if (!completa && c && v && c.desde && TABELAS_DELTA.has(t)) {
      const desde = new Date(new Date(c.desde).getTime() - MARGEM_DELTA_MS).toISOString();
      const [novas, ids] = await Promise.all([
        fetchAll(t, '*', desde),
        fetchAll(t, 'id')
      ]);
      const vivos = new Set(ids.map(r => r.id));
      const porId = new Map(c.rows.filter(r => vivos.has(r.id)).map(r => [r.id, r]));
      for (const r of novas) porId.set(r.id, r);
      // Linha que existe no banco mas não veio (ex.: entrou no recorte sem ser
      // alterada): não dá para remendar — baixa a tabela inteira.
      if (ids.some(r => !porId.has(r.id))) {
        CACHE[t] = { rows: await fetchAll(t), versao: v.versao, desde: v.alterado_em };
        return;
      }
      CACHE[t] = { rows: Array.from(porId.values()), versao: v.versao, desde: v.alterado_em };
      return;
    }
    // A versão é lida ANTES de baixar: se alguém gravar durante a leitura, a
    // próxima recarga vê o contador diferente e busca de novo.
    CACHE[t] = { rows: await fetchAll(t), versao: v ? v.versao : null, desde: v ? v.alterado_em : null };
  }

  // Força baixar tudo na próxima recarga ("Atualizar dados").
  function invalidar() { ultimaCompleta = 0; }

  // Recarrega as tabelas operacionais (vagas/candidatos/entrevistas...) — é
  // isso que faz o indicador de Recrutamento e as telas operacionais
  // refletirem qualquer mudança feita por qualquer pessoa, sem upload.
  async function reload(opts) {
    const errors = [];
    const versoes = await lerVersoes();
    const completa = !versoes || !!(opts && opts.completa) || Date.now() - ultimaCompleta > RECARGA_COMPLETA_MS;
    // Tabelas em paralelo (até SIMULTANEAS); os erros saem na ordem de RECRUIT_TABLES.
    const res = await emParalelo(RECRUIT_TABLES, SIMULTANEAS, t => atualizarTabela(t, versoes && versoes[t], completa));
    RECRUIT_TABLES.forEach((t, i) => {
      const err = res[i].ok ? null : (res[i].erro || {});
      if (err) {
        if (OPTIONAL_TABLES.has(t) && /does not exist|schema cache|could not find/i.test(err.message || '')) CACHE[t] = { rows: [] };
        else errors.push(`${t}: ${err.message}`);
      }
      window.HUB_RECRUIT_DATA[t] = CACHE[t] ? CACHE[t].rows.slice() : [];
    });
    if (completa && !errors.length) ultimaCompleta = Date.now();
    const chave = versoes ? ['controle_desligamento', 'entrevistas_desligamento', 'entrevista_pesquisa'].map(t => (versoes[t] || {}).versao).join('|') : null;
    if (!completa && chave && chave === resumosChave) {
      for (const destino of ['controle_desligamento_ind', 'entrevistas_desligamento_ind', 'controle_respostas_forms']) {
        window.HUB_RECRUIT_DATA[destino] = Array.isArray(RESUMOS[destino]) ? RESUMOS[destino].slice() : RESUMOS[destino];
      }
      if (errors.length) throw new Error('Não consegui atualizar os dados do Recrutamento — ' + errors.join('; '));
      return window.HUB_RECRUIT_DATA;
    }
    let resumosOk = true;
    // Resumos da Entrevista de Desligamento para os Indicadores — sem dado
    // pessoal (supabase-links-privacidade.sql): desligamentos do Controle e
    // links de entrevista. O servidor do Hub devolve o resumo inteiro numa
    // chamada (não há o corte de 1000 linhas do PostgREST). null = resumo indisponível
    // (função não criada / erro) → os Indicadores usam a fonte antiga;
    // [] = a pessoa não tem linhas no seu recorte.
    // + quais fichas do Controle têm resposta do Forms (sem as respostas;
    // supabase-controle-respostas-forms.sql — vazio sem a permissão do Controle).
    // Os três resumos em paralelo; os erros saem na mesma ordem de antes.
    const fontes = [['controle_desligamento_indicadores', 'controle_desligamento_ind'], ['entrevistas_desligamento_indicadores', 'entrevistas_desligamento_ind'], ['controle_desligamento_respostas_forms_resumo', 'controle_respostas_forms']];
    const lidos = await emParalelo(fontes, SIMULTANEAS, ([fn]) =>
      withTimeout(HUB_API.chamar('recrutamento.resumo', { funcao: fn }), QUERY_TIMEOUT_MS, 'tempo esgotado buscando o resumo ' + fn));
    fontes.forEach(([fn, destino], i) => {
      if (lidos[i].ok) RESUMOS[destino] = (lidos[i].valor || []).map(toCamelRow);
      else {
        const err = lidos[i].erro || {};
        RESUMOS[destino] = null;
        if (!/does not exist|schema cache|could not find/i.test(err.message || '')) { errors.push(fn + ': ' + err.message); resumosOk = false; }
      }
      window.HUB_RECRUIT_DATA[destino] = Array.isArray(RESUMOS[destino]) ? RESUMOS[destino].slice() : RESUMOS[destino];
    });
    resumosChave = resumosOk ? chave : null;
    if (errors.length) throw new Error('Não consegui atualizar os dados do Recrutamento — ' + errors.join('; '));
    return window.HUB_RECRUIT_DATA;
  }

  // Listas mestre mudam raramente — carregadas uma vez (como os dados do
  // módulo Indicadores) e recarregadas manualmente depois de editar em
  // Administração → Cadastros do Recrutamento.
  async function reloadMasterLists() {
    // Em paralelo (até SIMULTANEAS); a primeira falha, na ordem de MASTER_TABLES, sobe.
    const res = await emParalelo(MASTER_TABLES, SIMULTANEAS, async t => {
      const data = await HUB_API.chamar('recrutamento.listarCadastro', { tabela: t });
      window.HUB_RECRUIT_DATA[t] = (data || []).map(toCamelRow);
    });
    const falha = res.find(r => !r.ok);
    if (falha) throw falha.erro;
    return window.HUB_RECRUIT_DATA;
  }

  // ---- Observações dos candidatos, sob demanda ----------------------------
  // A carga (fetchAll) não traz candidatos.observacoes (texto longo). Quem
  // mostra, edita ou exporta as observações chama carregarObservacoes(lista)
  // ANTES: elas ficam no próprio objeto do candidato (o mesmo do CACHE) e não
  // são buscadas de novo. Candidato alterado volta do banco como objeto novo
  // (sem a chave), e a próxima abertura busca a observação atualizada.
  // "Carregada" = o objeto tem a chave "observacoes" (mesmo que null).
  const LOTE_OBSERVACOES = 1000;
  function observacoesCarregadas(c) { return !!c && Object.prototype.hasOwnProperty.call(c, 'observacoes'); }
  async function carregarObservacoes(candidatos) {
    const faltam = (candidatos || []).filter(c => c && c.id != null && !observacoesCarregadas(c));
    for (let i = 0; i < faltam.length; i += LOTE_OBSERVACOES) {
      const lote = faltam.slice(i, i + LOTE_OBSERVACOES);
      const data = await withTimeout(
        HUB_API.chamar('recrutamento.observacoes', { ids: lote.map(c => String(c.id)) }),
        QUERY_TIMEOUT_MS,
        'tempo esgotado buscando as observações dos candidatos'
      );
      const porId = new Map((data || []).map(r => [String(r.id), r.observacoes]));
      // Id que não voltou (apagado ou fora do recorte) continua "não carregado".
      for (const c of lote) if (porId.has(String(c.id))) c.observacoes = porId.get(String(c.id));
    }
    return candidatos;
  }

  // Busca livre (Candidatos, Banco de Talentos) também procura nas observações,
  // que não vêm com a lista. Na primeira busca elas descem em segundo plano
  // (~1 MB comprimido para todos) e a lista é refeita. Ids que o servidor não
  // devolve (fora do recorte) não são pedidos de novo, para não repetir sem fim.
  const obsTentadas = new Set();
  let obsEmAndamento = null;
  function observacoesParaBusca(lista, aoCarregar) {
    const faltam = (lista || []).filter(c => c && c.id != null && !observacoesCarregadas(c) && !obsTentadas.has(String(c.id)));
    if (!faltam.length) return true;
    if (!obsEmAndamento) {
      faltam.forEach(c => obsTentadas.add(String(c.id)));
      obsEmAndamento = carregarObservacoes(faltam)
        .then(() => { obsEmAndamento = null; if (aoCarregar) aoCarregar(); })
        .catch(err => { obsEmAndamento = null; faltam.forEach(c => obsTentadas.delete(String(c.id))); console.warn('Busca nas observações indisponível:', err.message); });
    }
    return false;
  }

  function activeNames(table) {
    return (window.HUB_RECRUIT_DATA[table] || []).filter(r => r.ativo !== false).map(r => r.nome);
  }

  async function insertRow(table, rowCamel) {
    const data = await HUB_API.chamar('recrutamento.inserir', { tabela: table, linha: toSnakeRow(rowCamel) });
    return toCamelRow(data);
  }

  async function updateRow(table, id, rowCamel) {
    const data = await HUB_API.chamar('recrutamento.atualizar', { tabela: table, id, linha: toSnakeRow(rowCamel) });
    return toCamelRow(data);
  }

  async function deleteRow(table, id) {
    await HUB_API.chamar('recrutamento.excluir', { tabela: table, id });
  }

  async function upsertMaster(table, rowCamel) {
    await HUB_API.chamar('recrutamento.salvarCadastro', { tabela: table, linha: toSnakeRow(rowCamel) });
  }

  // Log de auditoria (tela Histórico) — chamado pelas telas operacionais a
  // cada ação relevante sobre uma vaga. O autor (usuario) é preenchido pelo servidor.
  async function logAcao(entry) {
    await HUB_API.chamar('recrutamento.registrarAcao', toSnakeRow(entry));
  }

  async function listHistorico() {
    const data = await HUB_API.chamar('recrutamento.listarHistorico');
    return (data || []).map(toCamelRow);
  }

  async function listSolicitacoes() {
    const data = await HUB_API.chamar('recrutamento.listarSolicitacoes');
    return (data || []).map(toCamelRow);
  }

  // Solicitante, perfil e status 'Pendente' são preenchidos pelo servidor.
  async function criarSolicitacao(entry) {
    await HUB_API.chamar('recrutamento.criarSolicitacao', toSnakeRow(entry));
  }

  // Quem aprovou e a data da decisão são preenchidos pelo servidor.
  async function decidirSolicitacao(id, status, observacao) {
    await HUB_API.chamar('recrutamento.decidirSolicitacao', { id, status, observacao: observacao || null });
  }

  window.HUB_RECRUIT = {
    RECRUIT_TABLES, MASTER_TABLES,
    reload, invalidar, reloadMasterLists, activeNames,
    insertRow, updateRow, deleteRow, upsertMaster,
    carregarObservacoes, observacoesCarregadas, observacoesParaBusca,
    logAcao, listHistorico,
    listSolicitacoes, criarSolicitacao, decidirSolicitacao,
    toSnakeRow, toCamelRow
  };
})();
