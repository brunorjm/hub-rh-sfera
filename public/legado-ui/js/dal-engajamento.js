// Camada de acesso a dados da Pesquisa de Engajamento (participação por pulso).
// Como a Pesquisa de Clima (dal-pesquisa-clima.js), NÃO entra no loadAll do
// login: só é buscada na primeira vez que alguém abre Indicadores → Pesquisa de
// Engajamento na sessão e fica em cache. São poucas linhas (pulsos + uma linha
// por departamento em cada pulso), mas o dado muda toda vez que sobe um export
// novo — por isso o botão "Atualizar dados" e os uploads chamam invalidar().
// A RLS do Supabase (permissão indicadores.engajamento + can_see) decide o que
// cada usuário recebe. A gravação passa por funções do banco (ver
// supabase-engajamento.sql), numa transação só.
(function () {
  const PAGE = 1000;
  const QUERY_TIMEOUT_MS = 30000;

  window.HUB_DATA = window.HUB_DATA || {};
  window.HUB_DATA.engajamento_pulso = window.HUB_DATA.engajamento_pulso || [];
  window.HUB_DATA.engajamento_participacao = window.HUB_DATA.engajamento_participacao || [];
  let carregado = false;
  let emAndamento = null;

  function withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  // Paginação por id (keyset), mesma técnica de dal-indicadores.js.
  async function fetchAll(table) {
    let all = [];
    let lastId = 0;
    for (;;) {
      const { data, error } = await withTimeout(
        sb.from(table).select('*').gt('id', lastId).order('id', { ascending: true }).limit(PAGE),
        QUERY_TIMEOUT_MS,
        `tempo esgotado buscando "${table}" (conexão lenta ou projeto Supabase inativo)`
      );
      if (error) throw error;
      if (!data.length) break;
      all = all.concat(data);
      lastId = data[data.length - 1].id;
      if (data.length < PAGE) break;
    }
    return all;
  }

  function carregar() {
    if (carregado) return Promise.resolve();
    if (emAndamento) return emAndamento;
    emAndamento = (async () => {
      const [pulsos, part] = await Promise.all([fetchAll('engajamento_pulso'), fetchAll('engajamento_participacao')]);
      window.HUB_DATA.engajamento_pulso = pulsos;
      window.HUB_DATA.engajamento_participacao = part;
      carregado = true;
    })().finally(() => { emAndamento = null; });
    return emAndamento;
  }

  // Descarta o cache: a próxima abertura da tela busca de novo no Supabase.
  function invalidar() { carregado = false; }

  async function rpc(nome, args) {
    await sb.auth.refreshSession().catch(() => {});
    const { data, error } = await sb.rpc(nome, args);
    if (error) throw new Error('Erro ao gravar no Supabase: ' + error.message);
    return data;
  }

  // Tudo-ou-nada: todos os pulsos + linhas gravados numa transação no banco.
  // "hoje" (data local, AAAA-MM-DD) decide quais pulsos já encerraram — a base de
  // convidados deles fica congelada nos próximos uploads.
  function salvarBase(pulsos, linhas, hoje) { return rpc('engajamento_salvar_base', { p_pulsos: pulsos, p_linhas: linhas, p_hoje: hoje }); }

  window.HUB_ENGAJAMENTO = { carregar, invalidar, jaCarregado: () => carregado, salvarBase };
})();
