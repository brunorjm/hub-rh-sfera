// Ponte das telas antigas com o servidor do hub (substitui o cliente do Supabase).
// Cada acesso a dados é uma operação da lista fechada do servidor
// (src/server/hub/registro.ts), chamada por POST /api/hub/<operação>.
(function () {
  async function chamar(operacao, dados) {
    let resp;
    try {
      resp = await fetch('/api/hub/' + encodeURIComponent(operacao), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados || {})
      });
    } catch (e) {
      throw new Error('Sem conexão com o servidor do Hub. Verifique a rede e tente de novo.');
    }
    let corpo = null;
    try { corpo = await resp.json(); } catch (e) { /* resposta sem JSON */ }
    if (resp.status === 401) {
      window.location.assign('/login');
      throw new Error((corpo && corpo.erro) || 'Sessão encerrada.');
    }
    if (!resp.ok) throw new Error((corpo && corpo.erro) || ('Erro ' + resp.status));
    return corpo ? corpo.dados : null;
  }

  // Sair: o NextAuth exige o token CSRF dele no POST de saída.
  async function sair() {
    try {
      const { csrfToken } = await fetch('/api/auth/csrf', { credentials: 'same-origin' }).then(r => r.json());
      await fetch('/api/auth/signout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ csrfToken, callbackUrl: '/login', json: 'true' })
      });
    } finally {
      window.location.assign('/login');
    }
  }

  window.HUB_API = { chamar, sair };

  // Nenhuma tela fala mais direto com o banco. Se sobrou algum uso de
  // window.sb, ele falha alto (no console e na tela), em vez de sumir calado.
  const proibido = function (caminho) {
    return new Proxy(function () {}, {
      get(_, prop) { if (prop === 'then') return undefined; return proibido(caminho + '.' + String(prop)); },
      apply() { throw new Error('Acesso direto ao banco removido (' + caminho + '). Use HUB_API.chamar.'); }
    });
  };
  window.sb = proibido('sb');
  window.HUB_SUPABASE_READY = true;
})();
