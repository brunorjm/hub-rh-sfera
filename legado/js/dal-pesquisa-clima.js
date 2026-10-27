// Camada de acesso a dados da Pesquisa de Clima. Como a Avaliação da
// Experiência (dal-experiencia.js), NÃO entra no loadAll do login: são ~22 mil
// respostas + o headcount da época, então só são buscadas na primeira vez que
// alguém abre Indicadores → Pesquisa de Clima na sessão, e ficam em cache.
// A RLS do Supabase (permissão indicadores.pesquisa_clima + can_see) decide
// quais linhas cada usuário recebe.
(function () {
  const PAGE = 1000;
  const QUERY_TIMEOUT_MS = 30000;

  window.HUB_DATA = window.HUB_DATA || {};
  window.HUB_DATA.pesquisa_clima = window.HUB_DATA.pesquisa_clima || [];
  window.HUB_DATA.pesquisa_clima_hc = window.HUB_DATA.pesquisa_clima_hc || [];
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
      const [resp, hc] = await Promise.all([fetchAll('pesquisa_clima'), fetchAll('pesquisa_clima_hc')]);
      window.HUB_DATA.pesquisa_clima = resp;
      window.HUB_DATA.pesquisa_clima_hc = hc;
      carregado = true;
    })().finally(() => { emAndamento = null; });
    return emAndamento;
  }

  window.HUB_PESQUISA_CLIMA = { carregar, jaCarregado: () => carregado };
})();
