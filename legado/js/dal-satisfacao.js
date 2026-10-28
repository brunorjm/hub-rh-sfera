// Camada de dados da Pesquisa de Satisfação com o Suporte do Escritório. Como o
// Boletim, NÃO entra no loadAll do login: só é buscada na primeira abertura de
// Indicadores → Pesquisa de Satisfação e fica em cache. "Atualizar dados" e o
// upload do card 16 chamam invalidar().
//
// Leitura só pela função satisfacao_dados() (ver supabase-satisfacao.sql): o
// banco devolve apenas as áreas liberadas no perfil e, para quem não tem a visão
// completa, sem unidade/departamento de quem respondeu e sem os comentários que
// a triagem tirou da área.
(function () {
  const PAGE = 1000;
  const LOTE = 1000;
  const QUERY_TIMEOUT_MS = 30000;

  window.HUB_SATISFACAO_DATA = { respostas: [], ciclos: [], versao: 0 };
  let carregado = false;
  let emAndamento = null;

  function withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  function traduzErro(err) {
    const m = (err && err.message) || String(err);
    if (/satisfacao_dados|satisfacao_ciclo|schema cache|does not exist|not find/i.test(m)) return new Error('As tabelas da Pesquisa de Satisfação ainda não existem no Supabase (rode supabase-satisfacao.sql).');
    return err instanceof Error ? err : new Error(m);
  }

  async function buscarRespostas() {
    let all = [];
    for (let de = 0; ; de += PAGE) {
      const { data, error } = await withTimeout(
        sb.rpc('satisfacao_dados').order('ord', { ascending: true }).range(de, de + PAGE - 1),
        QUERY_TIMEOUT_MS, 'tempo esgotado buscando a Pesquisa de Satisfação (conexão lenta ou projeto Supabase inativo)');
      if (error) throw error;
      all = all.concat(data || []);
      if (!data || data.length < PAGE) break;
    }
    return all;
  }

  async function buscarCiclos() {
    const { data, error } = await withTimeout(sb.from('satisfacao_ciclo').select('*').order('pesquisa'), QUERY_TIMEOUT_MS, 'tempo esgotado buscando os ciclos da Pesquisa de Satisfação');
    if (error) throw error;
    return data || [];
  }

  function carregar() {
    if (carregado) return Promise.resolve();
    if (emAndamento) return emAndamento;
    emAndamento = (async () => {
      try {
        const [respostas, ciclos] = await Promise.all([buscarRespostas(), buscarCiclos()]);
        const d = window.HUB_SATISFACAO_DATA;
        d.respostas = respostas;
        d.ciclos = ciclos;
        d.versao++;
        carregado = true;
      } catch (err) { throw traduzErro(err); }
    })().finally(() => { emAndamento = null; });
    return emAndamento;
  }

  function invalidar() { carregado = false; }

  // Áreas que já apareceram na pesquisa (para o Cadastro de Acessos).
  async function areasConhecidas() {
    const { data, error } = await sb.from('satisfacao_ciclo').select('areas');
    if (error) throw traduzErro(error);
    return Array.from(new Set((data || []).flatMap(c => c.areas || [])));
  }

  async function rpc(nome, args) {
    const { data, error } = await sb.rpc(nome, args);
    if (error) throw new Error('Erro ao gravar no Supabase: ' + traduzErro(error).message);
    return data;
  }

  // Upload: respostas em lotes (o primeiro apaga os ciclos do arquivo) e depois os ciclos.
  async function salvar(linhas, ciclos, onProgress) {
    await sb.auth.refreshSession().catch(() => {});
    const meses = Array.from(new Set(linhas.map(l => l.pesquisa)));
    let total = 0;
    for (let i = 0; i < Math.max(linhas.length, 1); i += LOTE) {
      total += await rpc('satisfacao_salvar', { p_meses: meses, p_linhas: linhas.slice(i, i + LOTE), p_limpar: i === 0 }) || 0;
      if (onProgress) onProgress(Math.min(i + LOTE, linhas.length), linhas.length);
    }
    await rpc('satisfacao_salvar_ciclos', { p_ciclos: ciclos });
    invalidar();
    return total;
  }

  // Triagem de um comentário (só a visão completa): acao = 'ocultar' | 'individual' |
  // 'loja', ou vazio para desmarcar. Atualiza o cache sem buscar tudo de novo.
  async function triar(chave, acao) {
    if (!chave) throw new Error('Este comentário ainda não pode ser triado: rode a versão mais recente de supabase-satisfacao.sql e atualize os dados.');
    const { data, error } = await sb.rpc('satisfacao_triar', { p_chave: chave, p_acao: acao || '' });
    if (error) {
      if (/satisfacao_triar|schema cache|does not exist|not find/i.test(error.message || '')) throw new Error('A triagem dos comentários ainda não existe no Supabase (rode a versão mais recente de supabase-satisfacao.sql).');
      throw new Error(error.message || 'Não consegui gravar a triagem.');
    }
    const d = window.HUB_SATISFACAO_DATA;
    for (const r of d.respostas) if (r.chave === chave) r.triagem = data || null;
    d.versao++;
    return data || null;
  }

  window.HUB_SATISFACAO = { carregar, invalidar, jaCarregado: () => carregado, areasConhecidas, salvar, triar };
})();
