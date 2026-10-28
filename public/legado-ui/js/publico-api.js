// Ponte das páginas públicas SEM LOGIN (parecer do gestor, entrevista de
// desligamento e NPS da Conexão RH) com o servidor: POST /api/publico/<pagina>
// com { acao: 'ler' | 'salvar', token, dados }. O servidor chama as mesmas
// funções do banco de antes (src/server/publico/api.ts). Não usa sessão nem
// cookie: estas páginas não carregam hub-api.js.
(function () {
  async function chamar(pagina, corpo) {
    let resp;
    try {
      resp = await fetch('/api/publico/' + encodeURIComponent(pagina), {
        method: 'POST',
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo || {})
      });
    } catch (e) {
      throw new Error('Sem conexão com o servidor. Verifique a rede e tente de novo.');
    }
    let json = null;
    try { json = await resp.json(); } catch (e) { /* resposta sem JSON */ }
    if (!resp.ok) throw new Error((json && json.erro) || ('Erro ' + resp.status));
    return json ? json.dados : null;
  }

  window.HUB_PUBLICO = { chamar };
})();
