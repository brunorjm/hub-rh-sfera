// Página pública do Parecer do Gestor (parecer-publico.html) — SEM LOGIN.
// Acessada pelo link que o(a) recrutador(a) gera na tela Candidatos e manda
// por e-mail para o(a) Solicitante da vaga (que normalmente não tem conta no
// Hub Sfera). Usa o mesmo motor de renderização de
// js/pareceres/render-comum.js (HUB_PARECER_RENDER) que a tela autenticada
// (js/sections/parecer-gestor.js), mas fala com o banco só através de duas
// funções RPC (parecer_publico_get/parecer_publico_salvar, ver
// supabase-migration.sql seção 7) — nunca lê/escreve as tabelas direto, então
// não precisa (e não tem) sessão logada nem chave além da anon pública.
(function () {
  const U = HUB_UTILS;
  const PR = HUB_PARECER_RENDER;

  const root = document.getElementById('pp-root');
  const token = new URLSearchParams(location.search).get('token');

  let row = null;
  let modelo = null;
  let formDados = null;

  function telaErro(msg) {
    root.innerHTML = `<div class="pp-card"><h2>Link indisponível</h2><p class="hint" style="font-size:13px">${U.escapeHtml(msg)}</p></div>`;
  }

  function telaSucesso() {
    root.innerHTML = `<div class="pp-card"><h2>Parecer enviado com sucesso</h2><p class="hint" style="font-size:13px">Obrigado por preencher o parecer de ${U.escapeHtml(formDados.candidatoNome || '')}. O time de R&amp;S já foi notificado automaticamente. Este link não pode mais ser reutilizado.</p></div>`;
  }

  async function carregar() {
    if (!token) { telaErro('Link incompleto — falta o token de acesso. Copie o link exatamente como foi enviado por e-mail.'); return; }
    root.innerHTML = `<div class="pp-card"><p class="hint">Carregando...</p></div>`;
    let data, error;
    try {
      ({ data, error } = await sb.rpc('parecer_publico_get', { p_token: token }));
    } catch (err) {
      telaErro('Não foi possível carregar o parecer agora (' + err.message + '). Tente novamente em instantes.');
      return;
    }
    if (error) { telaErro('Não foi possível carregar o parecer agora (' + error.message + '). Tente novamente em instantes.'); return; }
    if (!data) { telaErro('Este link não é válido, já foi utilizado (o parecer já foi preenchido) ou expirou. Peça ao(à) recrutador(a) responsável para gerar um novo link.'); return; }
    row = data;
    modelo = (window.HUB_PARECER_MODELOS || {})[row.modelo];
    if (!modelo) { telaErro('Modelo de parecer não reconhecido. Avise o time de R&S.'); return; }
    formDados = Object.assign({}, row.dados || {});
    if (!formDados.dataEntrevista) formDados.dataEntrevista = U.todayISO();
    if (!formDados.cargo) formDados.cargo = row.cargo;
    if (!formDados.candidatoNome) formDados.candidatoNome = row.candidatoNome;
    if (!formDados.recrutadorNome) formDados.recrutadorNome = row.recrutador;
    if (!formDados.grupoCargo && modelo.cargoParaGrupoDefault) formDados.grupoCargo = modelo.cargoParaGrupoDefault(row.cargo) || '';
    render();
  }

  function render() {
    root.innerHTML = `
      <div class="pp-card">
        <h2 style="margin-bottom:4px">Parecer do Gestor — ${U.escapeHtml(row.candidatoNome || '')}</h2>
        <p class="hint" style="margin-bottom:16px">Modelo: ${U.escapeHtml(modelo.nome)}</p>
        <details class="blk" open><summary>Observações do Candidato</summary><div class="blk-body">
          <p style="white-space:pre-wrap;font-size:13px">${row.observacoesCandidato ? U.escapeHtml(row.observacoesCandidato) : '<span class="hint">Nenhuma observação registrada pelo time de R&amp;S.</span>'}</p>
        </div></details>
        <div id="pg-form">${PR.renderFormBody(modelo, formDados, '', { editarGestorNome: true })}</div>
        <div id="pg-msg"></div>
        <div class="field full" style="margin-top:10px"><button type="button" class="btn btn-primary" id="pg-salvar" style="width:auto">Enviar Parecer</button></div>
      </div>`;
    PR.wirePreencherEvents(root, modelo, formDados, { editarGestorNome: true });
    root.querySelector('#pg-salvar').addEventListener('click', salvar);
  }

  async function salvar() {
    const erro = PR.validar(modelo, formDados);
    const msgEl = root.querySelector('#pg-msg');
    if (erro) { msgEl.innerHTML = `<div class="msg err">${U.escapeHtml(erro)}</div>`; return; }
    const btn = root.querySelector('#pg-salvar');
    btn.disabled = true; btn.textContent = 'Enviando...';
    try {
      const { error } = await sb.rpc('parecer_publico_salvar', {
        p_token: token, p_dados: formDados, p_nivel_recomendacao: formDados.nivelRecomendacao,
        p_parecer_final: formDados.parecerFinal, p_justificativa: formDados.justificativa,
        p_preenchido_por: formDados.gestorNome
      });
      if (error) throw error;
      telaSucesso();
    } catch (err) {
      msgEl.innerHTML = `<div class="msg err">Erro ao enviar: ${U.escapeHtml(err.message)}</div>`;
      btn.disabled = false; btn.textContent = 'Enviar Parecer';
    }
  }

  if (!window.HUB_SUPABASE_READY) {
    telaErro('Configuração do sistema incompleta. Avise o time de R&S.');
  } else {
    carregar();
  }
})();
