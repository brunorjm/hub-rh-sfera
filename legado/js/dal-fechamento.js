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
      const { data, error } = await withTimeout(
        sb.from('controle_vagas').select('*').order('linha', { ascending: true }).range(de, de + PAGE - 1),
        QUERY_TIMEOUT_MS, 'tempo esgotado buscando as vagas do Fechamento');
      if (error) throw error;
      all = all.concat(data || []);
      if (!data || data.length < PAGE) break;
    }
    return all;
  }

  async function buscarMetas() {
    const { data, error } = await withTimeout(sb.from('metas_vagas').select('*').order('ano').order('mes'), QUERY_TIMEOUT_MS, 'tempo esgotado buscando as metas de vagas');
    if (error) throw error;
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
    await sb.auth.refreshSession().catch(() => {});
    for (let i = 0; i < Math.max(linhas.length, 1); i += LOTE) {
      const { error } = await sb.rpc('controle_vagas_salvar', { p_linhas: linhas.slice(i, i + LOTE), p_limpar: i === 0 });
      if (error) throw new Error('Erro ao gravar no Supabase: ' + traduzErro(error).message);
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
  const quem = () => { const u = window.HUB_USER || {}; return u.nome || u.email || null; };

  async function buscarPeriodo(id) {
    const { data, error } = await withTimeout(sb.from('fechamento_periodo').select('*').eq('id', id).maybeSingle(), QUERY_TIMEOUT_MS, 'tempo esgotado buscando o período');
    if (error) { if (semTabela(error)) return { indisponivel: true }; throw error; }
    return data || null;
  }

  async function listarPeriodos() {
    const { data, error } = await withTimeout(sb.from('fechamento_periodo').select('id,tipo,ano,n,status,fechado_em,fechado_por,atualizado_em,atualizado_por').order('ano', { ascending: false }).order('n', { ascending: false }), QUERY_TIMEOUT_MS, 'tempo esgotado buscando os períodos');
    if (error) { if (semTabela(error)) return []; throw error; }
    return data || [];
  }

  async function salvarPeriodo(p, campos) {
    const linha = Object.assign({ id: periodoId(p.tipo, p.ano, p.n), tipo: p.tipo, ano: p.ano, n: p.tipo === 'anual' ? 1 : p.n, atualizado_por: quem() }, campos);
    const { data, error } = await sb.from('fechamento_periodo').upsert(linha).select().single();
    if (error) {
      if (semTabela(error)) throw new Error('A tabela do Fechamento ainda não existe no Supabase (rode supabase-fechamento-periodo.sql).');
      throw new Error('Erro ao gravar no Supabase: ' + error.message);
    }
    return data;
  }

  const fecharPeriodo = (p, snapshot) => salvarPeriodo(p, { status: 'fechado', snapshot, fechado_em: new Date().toISOString(), fechado_por: quem() });
  const reabrirPeriodo = p => salvarPeriodo(p, { status: 'rascunho', snapshot: null, fechado_em: null, fechado_por: null });

  window.HUB_FECHAMENTO = { carregar, invalidar, salvarVagas, periodoId, buscarPeriodo, listarPeriodos, salvarPeriodo, fecharPeriodo, reabrirPeriodo };
})();
