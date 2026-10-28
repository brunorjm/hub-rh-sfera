// Página pública da Entrevista de Desligamento (entrevista-desligamento-
// publico.html) — SEM LOGIN. Acessada pelo link que o(a) analista de RH
// gera na tela Indicadores → Entrevista Desligamento e manda por e-mail
// para o(a) ex-colaborador(a). Fala com o banco só via as RPCs
// entrevista_desligamento_publico_get/salvar (ver supabase-migration.sql
// seção 8) — nunca lê/escreve a tabela direto. Motor de perguntas em
// js/entrevista-desligamento/{modelo,render-comum}.js — o mesmo usado pela
// tela "Ver resposta" (autenticada, só leitura) em
// js/sections/entrevista-desligamento.js.
(function () {
  const U = HUB_UTILS;
  const M = HUB_ED_MODELO;
  const PR = HUB_ED_RENDER;

  const root = document.getElementById('pp-root');
  const token = new URLSearchParams(location.search).get('token');

  let dados = null; // resposta de entrevista_desligamento_publico_get
  let respostas = {};
  let pilha = [M.PRIMEIRA_PERGUNTA];
  let indiceAtual = 0;

  function telaErro(msg) {
    root.innerHTML = `<div class="pp-card"><h2>Link indisponível</h2><p class="hint" style="font-size:13px">${U.escapeHtml(msg)}</p></div>`;
  }
  function telaSucesso() {
    root.innerHTML = `<div class="pp-card"><h2>Entrevista enviada — obrigado!</h2><p class="hint" style="font-size:13px">Suas respostas foram registradas com sucesso. Agradecemos muito por compartilhar sua experiência conosco. Este link não pode mais ser reutilizado.</p></div>`;
  }

  async function carregar() {
    if (!token) { telaErro('Link incompleto — falta o token de acesso. Copie o link exatamente como foi enviado por e-mail.'); return; }
    root.innerHTML = `<div class="pp-card"><p class="hint">Carregando...</p></div>`;
    let data, error;
    try {
      ({ data, error } = await sb.rpc('entrevista_desligamento_publico_get', { p_token: token }));
    } catch (err) {
      telaErro('Não foi possível carregar a entrevista agora (' + err.message + '). Tente novamente em instantes.');
      return;
    }
    if (error) { telaErro('Não foi possível carregar a entrevista agora (' + error.message + '). Tente novamente em instantes.'); return; }
    if (!data) { telaErro('Este link não é válido, já foi utilizado (a entrevista já foi respondida) ou expirou. Peça ao RH para gerar um novo link.'); return; }
    dados = data;
    respostas = Object.assign({}, data.respostas || {});
    pilha = [M.PRIMEIRA_PERGUNTA];
    indiceAtual = 0;
    render();
  }

  function resumoDadosHTML() {
    const linhas = [
      ['Nome', dados.colaboradorNome], ['CPF', dados.colaboradorCpf], ['E-mail', dados.colaboradorEmail],
      ['Unidade de trabalho', dados.unidadeTrabalho], ['Loja/ER', dados.local], ['Departamento', dados.departamentoForms]
    ].filter(([, v]) => v);
    return `<details class="blk"><summary>Seus dados (preenchidos automaticamente)</summary><div class="blk-body">
      <div class="form-grid">${linhas.map(([l, v]) => `<div class="field"><label>${U.escapeHtml(l)}</label><input value="${U.escapeHtml(v)}" disabled></div>`).join('')}</div>
    </div></details>`;
  }

  function render() {
    const qid = pilha[indiceAtual];
    const q = M.PERGUNTAS[qid];
    const enviar = q.tipo === 'nps';
    root.innerHTML = `
      <div class="pp-card">
        <h2 style="margin-bottom:4px">Entrevista de Desligamento</h2>
        <p class="hint" style="margin-bottom:16px">Sfera Multifranquias — sua opinião é muito importante para nós.</p>
        ${indiceAtual === 0 ? resumoDadosHTML() : ''}
        <div id="ed-pergunta" style="margin-top:14px">${PR.renderPerguntaHTML(qid, q, respostas[qid], '')}</div>
        <div id="ed-msg"></div>
        <div style="display:flex;justify-content:space-between;margin-top:14px">
          <button type="button" class="btn btn-outline" id="ed-voltar" style="width:auto" ${indiceAtual === 0 ? 'disabled' : ''}>&larr; Voltar</button>
          <button type="button" class="btn btn-primary" id="ed-avancar" style="width:auto">${enviar ? 'Enviar' : 'Avançar'}</button>
        </div>
      </div>`;
    PR.wirePergunta(root.querySelector('#ed-pergunta'), qid, q, respostas);
    root.querySelector('#ed-voltar').addEventListener('click', voltar);
    root.querySelector('#ed-avancar').addEventListener('click', avancar);
  }

  function voltar() {
    if (indiceAtual === 0) return;
    indiceAtual--;
    render();
  }

  function avancar() {
    const qid = pilha[indiceAtual];
    const q = M.PERGUNTAS[qid];
    const msgEl = () => root.querySelector('#ed-msg');
    if (!PR.perguntaRespondida(qid, q, respostas)) {
      msgEl().innerHTML = `<div class="msg err">Responda a pergunta para continuar.</div>`;
      return;
    }
    if (q.tipo === 'nps') { enviarEntrevista(); return; }
    const prox = PR.proximaPergunta(qid, q, respostas);
    if (prox === null || !M.PERGUNTAS[prox]) { enviarEntrevista(); return; }
    if (pilha[indiceAtual + 1] === prox) {
      indiceAtual++;
    } else {
      pilha = pilha.slice(0, indiceAtual + 1);
      pilha.push(prox);
      indiceAtual++;
    }
    render();
  }

  async function enviarEntrevista() {
    const btn = root.querySelector('#ed-avancar');
    btn.disabled = true; btn.textContent = 'Enviando...';
    try {
      const { error } = await sb.rpc('entrevista_desligamento_publico_salvar', { p_token: token, p_respostas: respostas });
      if (error) throw error;
      telaSucesso();
    } catch (err) {
      root.querySelector('#ed-msg').innerHTML = `<div class="msg err">Erro ao enviar: ${U.escapeHtml(err.message)}</div>`;
      btn.disabled = false; btn.textContent = 'Enviar';
    }
  }

  if (!window.HUB_SUPABASE_READY) {
    telaErro('Configuração do sistema incompleta. Avise o time de RH.');
  } else {
    carregar();
  }
})();
