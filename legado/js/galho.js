// "Galho" da pessoa logada: a linha de liderança acima dela e toda a equipe
// abaixo, devolvidos pela função organograma_meu_galho() do Supabase
// (supabase-organograma.sql). Usado pelo Organograma e pelo Headcount de quem
// não tem a permissão de ver a empresa inteira.
//
// Buscado uma vez e guardado; busca de novo quando HUB_DATA.colaboradores é
// recarregado (botão Atualizar, novo upload da planilha de Colaboradores).
(function () {
  const U = HUB_UTILS;
  let cache = null;       // { rows, erro, ids }
  let cacheDe = null;     // HUB_DATA.colaboradores de quando o cache foi montado
  let pendente = null;

  function dadosAtuais() { return (window.HUB_DATA && HUB_DATA.colaboradores) || []; }

  // Chave de cruzamento com HUB_DATA.colaboradores: ID da Feedz; nome completo
  // só quando a linha não tem ID.
  function chave(r) {
    return r.external_id ? 'id:' + r.external_id : 'nome:' + U.normalizeText(r.nome_completo || r.nome || '');
  }

  function cached() {
    return cacheDe === dadosAtuais() ? cache : null;
  }

  function get() {
    const dados = dadosAtuais();
    if (cacheDe === dados && cache) return Promise.resolve(cache);
    if (pendente && pendente.de === dados) return pendente.p;
    const p = (async () => {
      let res;
      try {
        const { data, error } = await sb.rpc('organograma_meu_galho');
        if (error) throw error;
        res = { rows: data || [] };
      } catch (err) {
        res = { rows: [], erro: err.message || String(err) };
      }
      // Headcount conta a pessoa e a equipe abaixo dela, nunca a liderança acima.
      res.ids = new Set(res.rows.filter(r => r.relacao !== 'acima').map(chave));
      if (dadosAtuais() === dados) { cache = res; cacheDe = dados; }
      return res;
    })();
    pendente = { de: dados, p };
    return p;
  }

  // Texto para explicar por que o galho veio vazio.
  function motivo(res) {
    if (res.erro) {
      return /organograma_meu_galho|function|funç/i.test(res.erro)
        ? 'A visão por equipe ainda não foi ativada no banco. Peça ao administrador para rodar supabase-organograma.sql no Supabase.'
        : 'Não foi possível carregar a sua equipe: ' + res.erro;
    }
    return 'Seu login não está ligado a um colaborador do Feedz, então não dá para saber qual é a sua equipe. Peça ao administrador para escolher o seu nome no campo “Colaborador no Feedz” em Administração → Cadastro de Acessos.';
  }

  window.HUB_GALHO = { get, cached, chave, motivo };
})();
