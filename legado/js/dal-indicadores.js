// Camada de acesso a dados do módulo Indicadores: busca tudo do Supabase uma
// vez (respeitando a RLS de cada usuário) e mantém em memória — os filtros da
// barra superior são só um "recorte" desses dados em JavaScript, então trocar
// filtro é instantâneo e não gera ida e volta ao banco a cada clique.
//
// As tabelas de Recrutamento (vagas/candidatos/entrevistas) NÃO entram aqui —
// elas mudam com frequência e são recarregadas à parte, sob demanda, por
// dal-recrutamento.js (ver app.js).
(function () {
  const TABLES = [
    'colaboradores', 'feedbacks', 'one_on_one', 'celebracoes',
    'entrevista_pesquisa', 'entrevista_solicitacao',
    'twygo_participantes', 'twygo_usuarios', 'twygo_conteudos',
    // Unibê e Academia Hering: fotos mensais por upload (supabase-treinamentos.sql)
    'unibe_pdv', 'unibe_pessoas', 'academia_hering',
    // Turmas das multiplicadoras (supabase-treinamento-turmas.sql)
    'treinamento_turmas'
  ];

  // Nunca deixa HUB_DATA como `undefined` — qualquer código que leia
  // HUB_DATA.colaboradores etc. antes do primeiro carregamento terminar (ou
  // depois de uma tabela falhar) deve achar um array vazio, não quebrar.
  window.HUB_DATA = window.HUB_DATA || {};
  for (const t of TABLES) window.HUB_DATA[t] = window.HUB_DATA[t] || [];

  const PAGE = 1000;
  const BATCH_SIZE = 500;
  const QUERY_TIMEOUT_MS = 30000;

  // fetch() do navegador não tem timeout embutido — se uma request travar
  // (rede instável, projeto Supabase gratuito "acordando" após ficar
  // inativo), sem isso a Promise nunca resolve nem rejeita e a página trava
  // fingindo estar carregando pra sempre, sem erro nenhum.
  function withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  // Paginação por id (keyset) em vez de OFFSET: OFFSET fica cada vez mais
  // lento conforme avança nas páginas (o banco tem que pular todas as linhas
  // anteriores a cada request) — numa tabela com dezenas de milhares de
  // linhas (Twygo) isso já demorou o suficiente pra parecer travado. Por id
  // crescente, cada página custa o mesmo, não importa a profundidade.
  // Colunas buscadas por tabela (padrão: todas). Em "colaboradores" a
  // "matricula" da Feedz é o CELULAR do colaborador — dado pessoal que
  // nenhuma tela usa, então nem desce para o navegador.
  const SELECT_COLUNAS = {
    // Feedbacks: o texto do feedback e as respostas (~80% do tráfego desta
    // tabela) não aparecem em nenhuma tela — só quem deu, para quem e quando.
    feedbacks: 'id,de,para,unidade,departamento,cargo,anonimo,avaliacao,data',
    // Celebrações: sem a mensagem (nenhuma tela mostra; o código identifica cada uma).
    celebracoes: 'id,codigo,colaborador_enviou,unidade,departamento,papel,cargo_enviou,colaboradores_receberam,cargo_recebeu,curtidas,comentarios,data',
    colaboradores: 'id,external_id,nome,nome_completo,email,cpf,cargo,cargo_visivel,unidade,departamento,grupos,papel,' +
      'gestor_direto,gestor_email,etnia,sexo,genero,data_nascimento,data_admissao,data_cadastro,situacao,ultimo_acesso,' +
      'origem_cadastro,participa_gamificacao,desligamento_tipo,desligamento_motivo,ultimo_dia_trabalhado,idioma,updated_at',
    // Solicitações antigas da planilha: só o que os Indicadores usam (sem
    // nome, solicitante nem observações).
    entrevista_solicitacao: 'id,planilha_id,unidade,departamento,data_solicitacao,data_admissao,data_demissao,tempo_trabalho,' +
      'tipo,tipo_desligamento,motivo_desligamento,status_feedz,status_entrevista'
  };
  // Respostas antigas do Forms vêm da versão anônima (sem nome, e-mail,
  // telefone e CPF, nem dentro de "respostas") — supabase-entrevista-
  // privacidade.sql. Os Indicadores da Entrevista de Desligamento são anônimos.
  const ORIGEM = { entrevista_pesquisa: 'entrevista_pesquisa_anon' };

  async function fetchAll(table, onPage) {
    let all = [];
    let lastId = 0;
    for (;;) {
      const { data, error } = await withTimeout(
        sb.from(ORIGEM[table] || table).select(SELECT_COLUNAS[table] || '*').gt('id', lastId).order('id', { ascending: true }).limit(PAGE),
        QUERY_TIMEOUT_MS,
        `tempo esgotado buscando "${table}" (conexão lenta ou projeto Supabase inativo)`
      );
      if (error) throw error;
      if (!data.length) break;
      all = all.concat(data);
      lastId = data[data.length - 1].id;
      if (onPage) onPage(all.length);
      if (data.length < PAGE) break;
    }
    return all;
  }

  function isAuthGlitch(msg) {
    return /row-level security|jwt|permission denied/i.test(msg || '');
  }

  async function insertBatch(table, batch) {
    let { error } = await sb.from(table).insert(batch);
    if (error && isAuthGlitch(error.message)) {
      // Sessão pode ter expirado/renovado no meio de um upload longo —
      // garante um token válido e tenta essa mesma leva mais uma vez antes
      // de desistir.
      await sb.auth.refreshSession().catch(() => {});
      await new Promise(r => setTimeout(r, 500));
      ({ error } = await sb.from(table).insert(batch));
    }
    return error;
  }

  async function replaceTable(table, rows, onProgress) {
    await sb.auth.refreshSession().catch(() => {});
    // TRUNCATE via função no banco em vez de DELETE linha a linha — evita
    // estourar o tempo limite em tabelas grandes (ex.: Twygo, 60mil+ linhas).
    const { error: delErr } = await sb.rpc('admin_truncate', { target: table });
    if (delErr) throw new Error('Erro ao limpar dados antigos: ' + delErr.message);
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const error = await insertBatch(table, batch);
      if (error) throw new Error('Erro ao gravar dados (linha ' + i + '): ' + error.message);
      if (onProgress) onProgress(Math.min(i + BATCH_SIZE, rows.length), rows.length);
    }
    // Tabelas fora de TABLES (ex.: Avaliação da Experiência, carregada sob
    // demanda por dal-experiencia.js) não entram em HUB_DATA — senão
    // inflariam a contagem de "registros carregados" e o noDataGate.
    if (TABLES.includes(table)) {
      window.HUB_DATA = window.HUB_DATA || {};
      window.HUB_DATA[table] = rows;
    }
  }

  // Log de uploads (tabela upload_log — ver supabase-upload-log.sql). Falhas aqui
  // nunca devem quebrar o upload em si, então retornam vazio/silenciam.
  async function logUpload(entry) {
    const u = window.HUB_USER || {};
    const { error } = await sb.from('upload_log').insert({
      tabela: entry.tabela, arquivo: entry.arquivo, linhas: entry.linhas,
      status: entry.status, erro: entry.erro || null,
      usuario_id: u.id || null, usuario_nome: u.nome || u.email || null
    });
    return error || null;
  }

  async function listUploadLog(limit) {
    const { data, error } = await sb.from('upload_log').select('*').order('created_at', { ascending: false }).limit(limit || 300);
    if (error) throw error;
    return data || [];
  }

  async function loadAll(onProgress) {
    window.HUB_DATA = window.HUB_DATA || {};
    const errors = [];
    for (let i = 0; i < TABLES.length; i++) {
      const t = TABLES[i];
      try {
        window.HUB_DATA[t] = await fetchAll(t, rowsSoFar => {
          if (onProgress) onProgress(t, i, TABLES.length, rowsSoFar);
        });
      } catch (err) {
        errors.push(`${t}: ${err.message}`);
        window.HUB_DATA[t] = window.HUB_DATA[t] || [];
      }
    }
    if (errors.length) throw new Error('Algumas tabelas não carregaram — ' + errors.join('; '));
    return window.HUB_DATA;
  }

  // Unibê / Academia Hering (um mês) e turmas das multiplicadoras (uma planilha):
  // uma chamada; a função no banco apaga e insere na mesma transação.
  async function salvarTreinamento(rpc, args, sql) {
    await sb.auth.refreshSession().catch(() => {});
    const { data, error } = await sb.rpc(rpc, args);
    if (error) {
      if (/does not exist|schema cache|not find/i.test(error.message)) throw new Error(`As tabelas novas ainda não existem no Supabase (rode ${sql}).`);
      throw new Error('Erro ao gravar no Supabase: ' + error.message);
    }
    return data;
  }
  const salvarUnibe = (mes, pdvs, pessoas) => salvarTreinamento('treinamentos_salvar_unibe', { p_mes: mes + '-01', p_pdvs: pdvs, p_pessoas: pessoas }, 'supabase-treinamentos.sql');
  const salvarAcademia = (mes, linhas) => salvarTreinamento('treinamentos_salvar_academia', { p_mes: mes + '-01', p_linhas: linhas }, 'supabase-treinamentos.sql');
  const salvarTurmas = (planilha, arquivo, linhas) => salvarTreinamento('treinamento_salvar_turmas', { p_planilha: planilha, p_arquivo: arquivo, p_linhas: linhas }, 'supabase-treinamento-turmas.sql');

  // Turma lançada pela tela (Treinamento e Desenvolvimento → Turmas e
  // Multiplicadoras → Lançamentos). Depois de gravar, rebusca só a tabela de turmas.
  async function salvarTurmaHub(id, dados) {
    const r = await salvarTreinamento('treinamento_turma_salvar', { p_id: id || null, p_dados: dados }, 'supabase-treinamento-turmas.sql');
    await recarregarTurmas();
    return r;
  }
  // Só a justificativa da divergência (turma importada incompleta não passa nas validações do formulário).
  async function justificarTurmaHub(id, texto, usuario) {
    await salvarTreinamento('treinamento_turma_justificar', { p_id: id, p_texto: texto, p_usuario: usuario }, 'supabase-treinamento-turmas-ajustes.sql');
    await recarregarTurmas();
  }
  async function excluirTurmaHub(id) {
    await salvarTreinamento('treinamento_turma_excluir', { p_id: id }, 'supabase-treinamento-turmas.sql');
    await recarregarTurmas();
  }
  // Gestor de T&D: validar / devolver a justificativa, pedir / cancelar ajuste.
  async function gestaoTurmaHub(id, acao, comentario, usuario) {
    await salvarTreinamento('treinamento_turma_gestao', { p_id: id, p_acao: acao, p_comentario: comentario || null, p_usuario: usuario }, 'supabase-treinamento-turmas-permissoes.sql');
    await recarregarTurmas();
  }
  // Meses fechados no Fechamento do Período ('AAAA-MM'): a multiplicadora não edita turmas deles.
  // Sem o SQL novo, devolve lista vazia (nada travado na tela; o banco continua mandando).
  async function mesesFechadosTurmas() {
    const { data, error } = await sb.rpc('treinamento_meses_fechados');
    return error ? [] : (data || []);
  }
  // Histórico de alterações de uma turma (só o gestor lê).
  async function historicoTurma(id) {
    const { data, error } = await sb.from('treinamento_turmas_log').select('*').eq('turma_id', id).order('quando', { ascending: false });
    if (error) throw new Error('Histórico indisponível: ' + error.message);
    return data || [];
  }
  async function recarregarTurmas() {
    window.HUB_DATA.treinamento_turmas = await fetchAll('treinamento_turmas');
    if (window.HUB_TURMAS_AVISO) window.HUB_TURMAS_AVISO();
  }

  async function listProfiles() {
    const { data, error } = await sb.from('profiles').select('*').order('nome');
    if (error) throw error;
    return data;
  }

  async function upsertProfile(profile) {
    const { error } = await sb.from('profiles').upsert(profile);
    if (error) throw error;
  }

  async function deleteProfile(id) {
    const { error } = await sb.from('profiles').delete().eq('id', id);
    if (error) throw error;
  }

  // Muda o status de acesso (ativo/inativo/desligado) sem apagar o perfil — ver
  // supabase-usuarios-inativar.sql. Nada é excluído: só o status e quem/quando mudou.
  async function setProfileStatus(id, status) {
    const u = window.HUB_USER || {};
    const patch = status === 'ativo'
      ? { status, status_em: null, status_por: null }
      : { status, status_em: new Date().toISOString(), status_por: u.nome || u.email || null };
    const { error } = await sb.from('profiles').update(patch).eq('id', id);
    if (error) throw error;
  }

  // Log de auditoria do "Visualizar como" (tabela viewas_log — ver
  // supabase-viewas-log.sql). Falhas aqui nunca devem impedir o uso do modo
  // de visualização em si — quem chama trata o erro como aviso, não bloqueio.
  async function logViewAsStart(alvo, ator) {
    // "ator" (quem está usando "Visualizar como") é passado explícito, não lido
    // de window.HUB_USER — na hora dessa chamada ele já pode ter sido trocado
    // pelo perfil simulado.
    const u = ator || window.HUB_USER || {};
    const { data, error } = await sb.from('viewas_log').insert({
      usuario_id: u.id || null, usuario_nome: u.nome || u.email || null,
      alvo_profile_id: alvo.id || null, alvo_nome: alvo.nome, alvo_email: alvo.email, alvo_perfil: alvo.perfil
    }).select('id').single();
    if (error) throw error;
    return data.id;
  }

  async function logViewAsEnd(id) {
    if (!id) return;
    const { error } = await sb.from('viewas_log').update({ encerrado_em: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  }

  async function listViewAsLog(limit) {
    const { data, error } = await sb.from('viewas_log').select('*').order('iniciado_em', { ascending: false }).limit(limit || 300);
    if (error) throw error;
    return data || [];
  }

  window.HUB_DAL = {
    TABLES, loadAll, replaceTable, salvarUnibe, salvarAcademia, salvarTurmas, salvarTurmaHub, justificarTurmaHub, excluirTurmaHub, gestaoTurmaHub, mesesFechadosTurmas, historicoTurma, recarregarTurmas, logUpload, listUploadLog, listProfiles, upsertProfile, deleteProfile, setProfileStatus,
    logViewAsStart, logViewAsEnd, listViewAsLog
  };
})();
