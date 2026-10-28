// Camada de acesso a dados da Avaliação da Experiência (AVE 45 e 90 dias).
// Diferente de dal-indicadores.js (que carrega tudo no login), aqui cada
// ciclo só é buscado quando alguém abre aquela aba pela primeira vez na
// sessão e fica em cache — o dataset é grande o bastante (~1,5 mil linhas
// por ciclo) pra não valer pagar essa banda de todo mundo que só quer ver
// Headcount. Os comentários por competência (a parte mais pesada de cada
// linha) NÃO vêm na carga inicial: são buscados sob demanda, um colaborador
// por vez, quando a pessoa abre o detalhe dele.
(function () {
  const TABELAS = { 45: 'avaliacao_experiencia_45', 90: 'avaliacao_experiencia_90' };
  // As colunas (COLUNAS_LEVES: sem matricula e sem os comentários) são
  // escolhidas pelo servidor do Hub (src/server/hub/experiencia.ts).
  const PAGE = 1000;
  const QUERY_TIMEOUT_MS = 30000;

  // null = ainda não carregado nesta sessão.
  window.HUB_EXPERIENCIA_DATA = { 45: null, 90: null };
  const emAndamento = {};

  function withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  // Páginas por id crescente pela operação experiencia.lerPagina.
  async function buscarCiclo(ciclo) {
    const tabela = TABELAS[ciclo];
    let all = [];
    let aposId = 0;
    for (;;) {
      const data = await withTimeout(
        HUB_API.chamar('experiencia.lerPagina', { ciclo: Number(ciclo), aposId, limite: PAGE }),
        QUERY_TIMEOUT_MS,
        `tempo esgotado buscando "${tabela}" (conexão lenta ou servidor do Hub indisponível)`
      );
      if (!data.length) break;
      all = all.concat(data);
      if (data.length < PAGE) break;
      aposId = data[data.length - 1].id;
    }
    return all;
  }

  // Devolve as linhas do ciclo (do cache, ou buscando uma vez). Chamadas
  // simultâneas para o mesmo ciclo compartilham a mesma busca.
  function carregar(ciclo, opts) {
    const forcar = opts && opts.forcar;
    if (!forcar && window.HUB_EXPERIENCIA_DATA[ciclo]) return Promise.resolve(window.HUB_EXPERIENCIA_DATA[ciclo]);
    if (emAndamento[ciclo]) return emAndamento[ciclo];
    emAndamento[ciclo] = buscarCiclo(ciclo)
      .then(rows => { window.HUB_EXPERIENCIA_DATA[ciclo] = rows; return rows; })
      .finally(() => { delete emAndamento[ciclo]; });
    return emAndamento[ciclo];
  }

  async function buscarComentarios(ciclo, id) {
    const data = await withTimeout(
      HUB_API.chamar('experiencia.comentarios', { ciclo: Number(ciclo), id }),
      QUERY_TIMEOUT_MS, 'tempo esgotado buscando os comentários'
    );
    return data || { comentarios_gestor: {}, comentarios_auto: {} };
  }

  // Chamado depois de um upload em Administração: descarta o cache do ciclo
  // reenviado (as linhas novas só ganham "id" no banco, então o jeito certo
  // é buscar de novo na próxima vez que a aba for aberta).
  function invalidar(ciclo) { window.HUB_EXPERIENCIA_DATA[ciclo] = null; }

  function cicloDaTabela(tabela) {
    return Number(Object.keys(TABELAS).find(c => TABELAS[c] === tabela)) || null;
  }

  window.HUB_EXPERIENCIA = { TABELAS, carregar, buscarComentarios, invalidar, cicloDaTabela };
})();
