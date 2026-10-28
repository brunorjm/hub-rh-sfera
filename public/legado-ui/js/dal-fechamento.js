// Camada de dados do Fechamento do Período: base de vagas da planilha 18
// (controle_vagas) e metas mensais de abertura/fechamento (metas_vagas). Não
// entra no loadAll do login: é buscada sob demanda e fica em cache; o upload
// do card 18 chama invalidar().
(function () {
  const PAGE = 1000;
  const LOTE = 500;
  const QUERY_TIMEOUT_MS = 30000;

  window.HUB_FECHAMENTO_DATA = { vagas: [], metas: [], versao: 0 };
  let carregado = false;
  let emAndamento = null;

  function withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  function traduzErro(err) {
    const m = (err && err.message) || String(err);
    if (/controle_vagas|metas_vagas|schema cache|does not exist|not find/i.test(m)) return new Error('As tabelas do Fechamento ainda não existem no Supabase (rode supabase-fechamento-vagas.sql).');
    return err instanceof Error ? err : new Error(m);
  }

  async function buscarVagas() {
    let all = [];
    for (let de = 0; ; de += PAGE) {
      const data = await withTimeout(
        HUB_API.chamar('fechamento.vagasPagina', { de, limite: PAGE }),
        QUERY_TIMEOUT_MS, 'tempo esgotado buscando as vagas do Fechamento');
      all = all.concat(data || []);
      if (!data || data.length < PAGE) break;
    }
    return all;
  }

  async function buscarMetas() {
    const data = await withTimeout(HUB_API.chamar('fechamento.metas', {}), QUERY_TIMEOUT_MS, 'tempo esgotado buscando as metas de vagas');
    return data || [];
  }

  function carregar() {
    if (carregado) return Promise.resolve();
    if (emAndamento) return emAndamento;
    emAndamento = (async () => {
      try {
        const [vagas, metas] = await Promise.all([buscarVagas(), buscarMetas()]);
        const d = window.HUB_FECHAMENTO_DATA;
        d.vagas = vagas;
        d.metas = metas;
        d.versao++;
        carregado = true;
      } catch (err) { throw traduzErro(err); }
    })().finally(() => { emAndamento = null; });
    return emAndamento;
  }

  function invalidar() { carregado = false; }

  // Upload: substitui a base inteira. O primeiro lote limpa a tabela.
  async function salvarVagas(linhas, onProgress) {
    for (let i = 0; i < Math.max(linhas.length, 1); i += LOTE) {
      try { await HUB_API.chamar('fechamento.salvarVagas', { linhas: linhas.slice(i, i + LOTE), limpar: i === 0 }); }
      catch (error) { throw new Error('Erro ao gravar: ' + traduzErro(error).message); }
      if (onProgress) onProgress(Math.min(i + LOTE, linhas.length), linhas.length);
    }
    invalidar();
  }

  // ------------------------------------------------------------------
  // Período (tabela fechamento_periodo, ver supabase-fechamento-periodo.sql):
  // textos e slides escritos pelo RH, slides ocultos e a foto do fechamento.
  // Sem a tabela (SQL ainda não rodado), lê como vazio e a gravação explica.
  // ------------------------------------------------------------------
  const periodoId = (tipo, ano, n) => `${tipo}-${ano}-${tipo === 'anual' ? 1 : n}`;
  const semTabela = err => /fechamento_periodo|schema cache|does not exist|not find/i.test((err && err.message) || '');

  async function buscarPeriodo(id) {
    let data;
    try { data = await withTimeout(HUB_API.chamar('fechamento.buscarPeriodo', { id }), QUERY_TIMEOUT_MS, 'tempo esgotado buscando o período'); }
    catch (error) { if (semTabela(error)) return { indisponivel: true }; throw error; }
    return data || null;
  }

  async function listarPeriodos() {
    let data;
    try { data = await withTimeout(HUB_API.chamar('fechamento.listarPeriodos', {}), QUERY_TIMEOUT_MS, 'tempo esgotado buscando os períodos'); }
    catch (error) { if (semTabela(error)) return []; throw error; }
    return data || [];
  }

  // O id, quem alterou e quem fechou (e quando) são decididos no servidor
  // (src/server/hub/fechamento.ts), pela sessão; daqui só vão o período e os campos.
  async function salvarPeriodo(p, campos) {
    const { fechado_em, fechado_por, atualizado_por, ...resto } = campos || {};
    const linha = Object.assign({ tipo: p.tipo, ano: p.ano, n: p.tipo === 'anual' ? 1 : p.n }, resto);
    try { return await HUB_API.chamar('fechamento.salvarPeriodo', linha); }
    catch (error) {
      if (semTabela(error)) throw new Error('A tabela do Fechamento ainda não existe no banco (rode supabase-fechamento-periodo.sql).');
      throw new Error('Erro ao gravar: ' + error.message);
    }
  }

  const fecharPeriodo = (p, snapshot) => salvarPeriodo(p, { status: 'fechado', snapshot });
  const reabrirPeriodo = p => salvarPeriodo(p, { status: 'rascunho', snapshot: null });

  window.HUB_FECHAMENTO = { carregar, invalidar, salvarVagas, periodoId, buscarPeriodo, listarPeriodos, salvarPeriodo, fecharPeriodo, reabrirPeriodo };
})();
