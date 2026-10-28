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
      // Colunas e origem (ex.: entrevista_pesquisa_anon) agora são decididas no
      // servidor (src/server/hub/indicadores.ts), com a RLS de cada usuário.
      const data = await withTimeout(
        HUB_API.chamar('indicadores.lerPagina', { tabela: table, aposId: lastId, limite: PAGE }),
        QUERY_TIMEOUT_MS,
        `tempo esgotado buscando "${table}" (conexão lenta com o servidor do Hub)`
      );
      if (!data.length) break;
      all = all.concat(data);
      lastId = data[data.length - 1].id;
      if (onPage) onPage(all.length);
      if (data.length < PAGE) break;
    }
    return all;
  }

  // Upload atômico (src/server/hub/admin.ts): os lotes vão para uma área de
  // preparo no servidor e só a última chamada troca a tabela, numa transação
  // única (apaga, insere tudo e grava o upload_log). Se cair no meio, os dados
  // antigos ficam — antes era admin_truncate e insert em lotes, e uma queda no
  // meio deixava a tabela vazia.
  function novoLote() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const h = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-a' + h.slice(17, 20) + '-' + h.slice(20, 32);
  }

  async function replaceTable(table, rows, onProgress, arquivo) {
    const lote = novoLote();
    try {
      for (let i = 0, ordem = 0; i < rows.length; i += BATCH_SIZE, ordem++) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        try { await HUB_API.chamar('admin.uploadLote', { lote, tabela: table, ordem, linhas: batch }); }
        catch (error) { throw new Error('Erro ao gravar dados (linha ' + i + '): ' + error.message + ' Os dados anteriores foram mantidos.'); }
        if (onProgress) onProgress(Math.min(i + BATCH_SIZE, rows.length), rows.length);
      }
      try { await HUB_API.chamar('admin.uploadConcluir', { lote, tabela: table, total: rows.length, arquivo: arquivo || null }); }
      catch (error) { throw new Error('Erro ao substituir os dados: ' + error.message + ' Os dados anteriores foram mantidos.'); }
    } catch (err) {
      HUB_API.chamar('admin.uploadDescartar', { lote }).catch(() => {});
      throw err;
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
  // Quem enviou vem da sessão, no servidor. O replaceTable já grava o log de sucesso.
  async function logUpload(entry) {
    try {
      await HUB_API.chamar('admin.registrarUpload', {
        tabela: entry.tabela, arquivo: entry.arquivo || null, linhas: entry.linhas == null ? null : entry.linhas,
        status: entry.status, erro: entry.erro || null
      });
      return null;
    } catch (error) {
      return error;
    }
  }

  async function listUploadLog(limit) {
    const data = await HUB_API.chamar('admin.listarUploads', { limite: limit || 300 });
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
  // Agora pelo servidor do Hub (operações turmas.*, src/server/hub/turmas.ts).
  async function salvarTreinamento(operacao, args, sql) {
    try { return await HUB_API.chamar(operacao, args); }
    catch (error) {
      if (/does not exist|schema cache|not find/i.test(error.message)) throw new Error(`As tabelas novas ainda não existem no banco (rode ${sql}).`);
      throw new Error('Erro ao gravar: ' + error.message);
    }
  }
  const salvarUnibe = (mes, pdvs, pessoas) => salvarTreinamento('turmas.salvarUnibe', { mes: mes + '-01', pdvs, pessoas }, 'supabase-treinamentos.sql');
  const salvarAcademia = (mes, linhas) => salvarTreinamento('turmas.salvarAcademia', { mes: mes + '-01', linhas }, 'supabase-treinamentos.sql');

  // Turma lançada pela tela (Treinamento e Desenvolvimento → Turmas e
  // Multiplicadoras → Lançamentos). Depois de gravar, rebusca só a tabela de turmas.
  // Quem lançou/alterou ("usuario") é decidido no servidor, pela sessão.
  async function salvarTurmaHub(id, dados) {
    const { usuario, ...resto } = dados || {};
    const r = await salvarTreinamento('turmas.salvar', { id: id || null, dados: resto }, 'supabase-treinamento-turmas.sql');
    await recarregarTurmas();
    return r;
  }
  // Só a justificativa da divergência (turma importada incompleta não passa nas validações do formulário).
  // "usuario" fica na assinatura, mas quem justificou vem da sessão, no servidor.
  async function justificarTurmaHub(id, texto, usuario) {
    await salvarTreinamento('turmas.justificar', { id, texto: texto || null }, 'supabase-treinamento-turmas-ajustes.sql');
    await recarregarTurmas();
  }
  async function excluirTurmaHub(id) {
    await salvarTreinamento('turmas.excluir', { id }, 'supabase-treinamento-turmas.sql');
    await recarregarTurmas();
  }
  // Gestor de T&D: validar / devolver a justificativa, pedir / cancelar ajuste.
  // Quem decidiu vem da sessão, no servidor ("usuario" fica só na assinatura).
  async function gestaoTurmaHub(id, acao, comentario, usuario) {
    await salvarTreinamento('turmas.gestao', { id, acao, comentario: comentario || null }, 'supabase-treinamento-turmas-permissoes.sql');
    await recarregarTurmas();
  }
  // Meses fechados no Fechamento do Período ('AAAA-MM'): a multiplicadora não edita turmas deles.
  // Sem o SQL novo, devolve lista vazia (nada travado na tela; o banco continua mandando).
  async function mesesFechadosTurmas() {
    try { return (await HUB_API.chamar('turmas.mesesFechados', {})) || []; }
    catch (error) { return []; }
  }
  // Histórico de alterações de uma turma (só o gestor lê).
  async function historicoTurma(id) {
    let data;
    try { data = await HUB_API.chamar('turmas.historico', { id }); }
    catch (error) { throw new Error('Histórico indisponível: ' + error.message); }
    return data || [];
  }
  async function recarregarTurmas() {
    window.HUB_DATA.treinamento_turmas = await fetchAll('treinamento_turmas');
    if (window.HUB_TURMAS_AVISO) window.HUB_TURMAS_AVISO();
  }

  async function listProfiles() {
    return HUB_API.chamar('admin.listarPerfis', {});
  }

  // Edição de um cadastro existente. Criar login é admin.criarAcesso (no
  // servidor: login + perfil numa transação). deleteProfile não existe mais:
  // nenhuma tela excluía perfil (o acesso é inativado ou desligado).
  async function upsertProfile(profile) {
    await HUB_API.chamar('admin.salvarPerfil', profile);
  }

  // Muda o status de acesso (ativo/inativo/desligado) sem apagar o perfil — ver
  // supabase-usuarios-inativar.sql. Nada é excluído: só o status e quem/quando mudou.
  // Quem mudou e quando vêm da sessão, no servidor; inativar/desligar derruba as sessões da pessoa.
  async function setProfileStatus(id, status) {
    await HUB_API.chamar('admin.alterarStatus', { id, status });
  }

  // Log de auditoria do "Visualizar como" (tabela viewas_log — ver
  // supabase-viewas-log.sql): agora gravado pelo servidor ao iniciar
  // (admin.verComoIniciar) e fechado ao sair (POST /hub) — ver view-as.js.
  async function listViewAsLog(limit) {
    const data = await HUB_API.chamar('admin.listarVerComo', { limite: limit || 300 });
    return data || [];
  }

  window.HUB_DAL = {
    TABLES, loadAll, replaceTable, salvarUnibe, salvarAcademia, salvarTurmaHub, justificarTurmaHub, excluirTurmaHub, gestaoTurmaHub, mesesFechadosTurmas, historicoTurma, recarregarTurmas, logUpload, listUploadLog, listProfiles, upsertProfile, setProfileStatus,
    listViewAsLog
  };
})();
