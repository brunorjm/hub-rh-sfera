// Camada de acesso a dados do Boletim da Liderança. Como a Pesquisa de
// Engajamento (dal-engajamento.js), NÃO entra no loadAll do login: só é
// buscada na primeira abertura de Indicadores → Boletim da Liderança na sessão
// e fica em cache. "Atualizar dados" e os uploads chamam invalidar().
//
// Além das tabelas próprias do boletim, garante que a Avaliação da Experiência
// (dal-experiencia.js) e a participação da Pesquisa de Engajamento
// (dal-engajamento.js) também estejam carregadas — o boletim usa as duas.
(function () {
  const PAGE = 1000;
  const LOTE = 1500;
  const QUERY_TIMEOUT_MS = 30000;
  const TABELAS = ['humor_mensal', 'engajamento_notas', 'satisfacao_suporte', 'boletim_entradas', 'boletim_fechamento'];
  const CHAVE = { humor_mensal: 'humor_mensal', engajamento_notas: 'engajamento_notas', satisfacao_suporte: 'satisfacao_suporte', boletim_entradas: 'entradas', boletim_fechamento: 'fechamentos' };

  window.HUB_BOLETIM_DATA = { humor_mensal: [], engajamento_notas: [], satisfacao_suporte: [], entradas: [], fechamentos: [], versao: 0, avisosCarga: [] };
  let carregado = false;
  let emAndamento = null;

  function withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  async function fetchAll(table) {
    let all = [];
    let lastId = 0;
    for (;;) {
      const data = await withTimeout(
        HUB_API.chamar('pesquisas.boletimLerPagina', { tabela: table, aposId: lastId, limite: PAGE }),
        QUERY_TIMEOUT_MS,
        `tempo esgotado buscando "${table}" (conexão lenta ou servidor do Hub indisponível)`
      );
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
      const avisos = [];
      const proprias = await Promise.all(TABELAS.map(t => fetchAll(t).catch(err => {
        if (/schema cache|does not exist|not find/i.test(err.message || '')) throw new Error('As tabelas do boletim ainda não existem no Supabase (rode supabase-boletim.sql).');
        throw err;
      })));
      // Fontes compartilhadas com outros menus: se a pessoa não tiver acesso a
      // elas, o boletim continua, só sem aquele bloco.
      const extras = [];
      if (window.HUB_EXPERIENCIA) extras.push(Promise.all([HUB_EXPERIENCIA.carregar(45), HUB_EXPERIENCIA.carregar(90)]).catch(err => avisos.push('Avaliação da Experiência: ' + err.message)));
      if (window.HUB_ENGAJAMENTO) extras.push(HUB_ENGAJAMENTO.carregar().catch(err => avisos.push('Pesquisa de Engajamento (participação): ' + err.message)));
      await Promise.all(extras);
      const d = window.HUB_BOLETIM_DATA;
      TABELAS.forEach((t, i) => { d[CHAVE[t]] = proprias[i]; });
      d.avisosCarga = avisos;
      d.versao++;
      carregado = true;
    })().finally(() => { emAndamento = null; });
    return emAndamento;
  }

  function invalidar() { carregado = false; }

  // Gravação pelo servidor do Hub (operação pesquisas.*), que chama a função do banco.
  async function rpc(nome, args) {
    try { return await HUB_API.chamar(nome, args); }
    catch (error) { throw new Error('Erro ao gravar: ' + error.message); }
  }

  // Grava em lotes: o primeiro limpa o período, os demais só inserem.
  async function emLotes(nome, base, linhas, onProgress) {
    let total = 0;
    for (let i = 0; i < Math.max(linhas.length, 1); i += LOTE) {
      const lote = linhas.slice(i, i + LOTE);
      total += await rpc(nome, Object.assign({}, base, { linhas: lote, limpar: i === 0 })) || 0;
      if (onProgress) onProgress(Math.min(i + LOTE, linhas.length), linhas.length);
    }
    invalidar();
    return total;
  }

  const unicos = arr => Array.from(new Set(arr));
  function salvarHumor(linhas, onProgress) { return emLotes('pesquisas.boletimSalvarHumor', { meses: unicos(linhas.map(l => l.mes)) }, linhas, onProgress); }
  function salvarEngNotas(inicio, fim, linhas, onProgress) { return emLotes('pesquisas.boletimSalvarEngNotas', { inicio, fim }, linhas, onProgress); }
  function salvarSatisfacao(linhas, onProgress) { return emLotes('pesquisas.boletimSalvarSatisfacao', { meses: unicos(linhas.map(l => l.pesquisa)) }, linhas, onProgress); }

  // Quem gravou/fechou (atualizado_por, fechado_por) vem da sessão, no servidor.

  async function salvarEntrada(mes, operacao, loja, indicador, valor) {
    await rpc('pesquisas.boletimSalvarEntrada', { mes: mes + '-01', operacao, loja: loja || null, indicador, valor });
    invalidar();
  }

  async function fechar(mes, itens) {
    const n = await rpc('pesquisas.boletimFechar', { mes: mes + '-01', itens });
    invalidar();
    return n;
  }

  async function reabrir(mes) {
    await rpc('pesquisas.boletimReabrir', { mes: mes + '-01' });
    invalidar();
  }

  window.HUB_BOLETIM = { carregar, invalidar, jaCarregado: () => carregado, salvarHumor, salvarEngNotas, salvarSatisfacao, salvarEntrada, fechar, reabrir };
})();
