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

  // Páginas por "ord" crescente pela operação pesquisas.satisfacaoDados, que
  // chama satisfacao_dados() no banco (o recorte continua lá dentro).
  async function buscarRespostas() {
    let all = [];
    for (let aposOrd = 0; ;) {
      const data = await withTimeout(
        HUB_API.chamar('pesquisas.satisfacaoDados', { aposOrd, limite: PAGE }),
        QUERY_TIMEOUT_MS, 'tempo esgotado buscando a Pesquisa de Satisfação (conexão lenta ou servidor do Hub indisponível)');
      all = all.concat(data || []);
      if (!data || data.length < PAGE) break;
      aposOrd = data[data.length - 1].ord;
    }
    return all;
  }

  async function buscarCiclos() {
    const data = await withTimeout(HUB_API.chamar('pesquisas.satisfacaoCiclos'), QUERY_TIMEOUT_MS, 'tempo esgotado buscando os ciclos da Pesquisa de Satisfação');
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
    let data;
    try { data = await HUB_API.chamar('pesquisas.satisfacaoCiclos'); } catch (error) { throw traduzErro(error); }
    return Array.from(new Set((data || []).flatMap(c => c.areas || [])));
  }

  // Gravação pelo servidor do Hub (operação pesquisas.*), que chama a função do banco.
  async function rpc(nome, args) {
    try { return await HUB_API.chamar(nome, args); }
    catch (error) { throw new Error('Erro ao gravar: ' + traduzErro(error).message); }
  }

  // Upload: respostas em lotes (o primeiro apaga os ciclos do arquivo) e depois os ciclos.
  async function salvar(linhas, ciclos, onProgress) {
    const meses = Array.from(new Set(linhas.map(l => l.pesquisa)));
    let total = 0;
    for (let i = 0; i < Math.max(linhas.length, 1); i += LOTE) {
      total += await rpc('pesquisas.satisfacaoSalvar', { meses, linhas: linhas.slice(i, i + LOTE), limpar: i === 0 }) || 0;
      if (onProgress) onProgress(Math.min(i + LOTE, linhas.length), linhas.length);
    }
    await rpc('pesquisas.satisfacaoSalvarCiclos', { ciclos });
    invalidar();
    return total;
  }

  // Triagem de um comentário (só a visão completa): acao = 'ocultar' | 'individual' |
  // 'loja', ou vazio para desmarcar. Atualiza o cache sem buscar tudo de novo.
  async function triar(chave, acao) {
    if (!chave) throw new Error('Este comentário ainda não pode ser triado: rode a versão mais recente de supabase-satisfacao.sql e atualize os dados.');
    let data, error = null;
    try { data = await HUB_API.chamar('pesquisas.satisfacaoTriar', { chave, acao: acao || '' }); } catch (e) { error = e; }
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
