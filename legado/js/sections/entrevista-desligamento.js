// Entrevista de Desligamento — "Gerar link de entrevista" e acompanhamento
// dos links já gerados. Renderizado dentro da subaba "Lista de
// Colaboradores" da tela Indicadores → Entrevista Desligamento
// (js/sections/indicadores.js chama HUB_ENTREVISTA_DESLIGAMENTO) — não é
// uma seção própria do menu.
//
// Fluxo: analista com a permissão indicadores.desligamento_gerar_link
// escolhe um colaborador (qualquer situação — ativo, desativado ou
// desligado) na planilha de Colaboradores já carregada em HUB_DATA;
// Unidade/Departamento/Cargo/Data de Admissão/Data de Desligamento vêm
// preenchidos automaticamente do cadastro dele, e o sistema tenta também
// pré-selecionar a "Unidade de trabalho"/loja (ou Departamento, se
// Escritório) do formulário de desligamento comparando o nome da
// unidade/departamento do colaborador com as listas do formulário
// (js/entrevista-desligamento/modelo.js) — nem sempre bate (nomes vêm de
// sistemas diferentes), por isso os campos ficam editáveis. Ao gerar,
// grava um registro em entrevistas_desligamento com token aleatório e abre
// o e-mail do(a) ex-colaborador(a) já preenchido com o link público
// (entrevista-desligamento-publico.html?token=...), no mesmo molde do botão
// equivalente em candidatos.js (parecer do gestor).
(function () {
  const U = HUB_UTILS;
  const R = HUB_RECRUIT;
  const M = HUB_ED_MODELO;

  function D() { return window.HUB_DATA || {}; }
  function RD() { return window.HUB_RECRUIT_DATA || {}; }
  function registros() { return RD()['entrevistas_desligamento'] || []; }
  // Gerar link faz parte do Controle de Desligamento; a permissão antiga
  // "Gerar link" (fora do Cadastro de Acessos) continua aceita na transição.
  function canGerarLink() {
    return HUB_PERMISSIONS.hasPerm(HUB_USER, 'indicadores.controle_desligamento') ||
      HUB_PERMISSIONS.hasPerm(HUB_USER, 'indicadores.desligamento_gerar_link');
  }

  // ---------------------------------------------------------------
  // Auto-match: nome de unidade/departamento do colaborador -> ramo do
  // formulário. Comparação normalizada (sem acento/maiúsculas) e exata —
  // se não bater com nada, devolve null e o(a) analista escolhe na mão.
  // ---------------------------------------------------------------
  function buscarLocalPorNomeUnidade(nomeUnidade) {
    if (!nomeUnidade) return null;
    const alvo = U.normalizeText(nomeUnidade);
    for (const qidStr of Object.keys(M.LOCAIS)) {
      const qid = Number(qidStr);
      const loja = M.LOCAIS[qid].lojas.find(l => U.normalizeText(l) === alvo);
      if (loja) {
        const ut = M.UNIDADE_TRABALHO_OPCOES.find(o => o.next === qid);
        return { unidadeTrabalho: ut ? ut.label : null, local: loja };
      }
    }
    return null;
  }
  function buscarDepartamentoForms(nomeDepto) {
    if (!nomeDepto) return null;
    const alvo = U.normalizeText(nomeDepto);
    return M.DEPARTAMENTOS.find(d => U.normalizeText(d) === alvo) || null;
  }

  // ---------------------------------------------------------------
  // Modal "Gerar link de entrevista"
  // ---------------------------------------------------------------
  let modalColab = null;
  let modalUnidadeTrabalho = '';
  let modalLocal = '';
  let modalDepartamentoForms = '';
  let modalIdDesligamento = null;   // quando o link sai da guia Controle de Desligamento

  function abrirModal(titulo, corpoHTML) {
    fecharModal();
    const modal = document.createElement('div');
    modal.id = 'hub-ed-modal';
    modal.innerHTML = `
      <div data-fechar style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:998"></div>
      <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.3);width:92%;max-width:640px;max-height:88vh;z-index:999;display:flex;flex-direction:column">
        <div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:10px">
          <div style="font-size:16px;font-weight:700">${titulo}</div>
          <button data-fechar class="btn btn-outline btn-sm" style="width:auto">Fechar</button>
        </div>
        <div style="padding:18px 22px;overflow-y:auto;flex:1">${corpoHTML}</div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', fecharModal));
    return modal;
  }
  function fecharModal() {
    const existente = document.getElementById('hub-ed-modal');
    if (existente) existente.remove();
  }

  // opts (opcional, vindo do Controle de Desligamento): { externalId, nome,
  // idDesligamento } — abre o modal com o(a) colaborador(a) já selecionado(a)
  // e grava o ID do desligamento no link gerado.
  function abrirModalGerarLink(opts) {
    modalColab = null; modalUnidadeTrabalho = ''; modalLocal = ''; modalDepartamentoForms = '';
    modalIdDesligamento = (opts && opts.idDesligamento) || null;
    renderModalGerarLink(opts);
  }

  function renderModalGerarLink(opts) {
    const colaboradores = (D().colaboradores || []).slice().sort((a, b) => (a.nome_completo || a.nome || '').localeCompare(b.nome_completo || b.nome || ''));
    const corpo = `
      <div class="field full">
        <label>Buscar colaborador(a) (todas as situações — ativos, desativados e desligados)</label>
        <input type="text" id="ed-busca-colab" placeholder="Digite o nome..." autocomplete="off">
      </div>
      <div class="field full">
        <select id="ed-lista-colab" size="8" style="width:100%">
          ${colaboradores.map((c, i) => `<option value="${i}">${U.escapeHtml(c.nome_completo || c.nome || '(sem nome)')} — ${U.escapeHtml(c.situacao || '—')}</option>`).join('')}
        </select>
      </div>
      <div id="ed-preview"></div>
      <div class="msg err" id="ed-gerar-msg"></div>
    `;
    const modal = abrirModal('Gerar link de entrevista', corpo);
    const busca = modal.querySelector('#ed-busca-colab');
    const lista = modal.querySelector('#ed-lista-colab');
    busca.addEventListener('input', () => {
      const termo = U.normalizeText(busca.value);
      Array.from(lista.options).forEach((opt, i) => {
        const c = colaboradores[i];
        const nome = U.normalizeText(c.nome_completo || c.nome || '');
        opt.hidden = termo.length > 0 && !nome.includes(termo);
      });
    });
    lista.addEventListener('change', () => {
      const idx = Number(lista.value);
      modalColab = colaboradores[idx];
      const matchLoja = buscarLocalPorNomeUnidade(modalColab.unidade);
      const matchDepto = matchLoja ? null : buscarDepartamentoForms(modalColab.departamento);
      modalUnidadeTrabalho = matchLoja ? matchLoja.unidadeTrabalho : (matchDepto ? 'Escritório' : '');
      modalLocal = matchLoja ? matchLoja.local : '';
      modalDepartamentoForms = matchDepto || '';
      renderPreviewColab(modal);
    });
    if (opts && (opts.externalId || opts.nome)) {
      const alvoNome = U.normalizeText(opts.nome || '');
      let idx = opts.externalId ? colaboradores.findIndex(c => c.external_id && c.external_id === opts.externalId) : -1;
      if (idx < 0 && alvoNome) idx = colaboradores.findIndex(c => U.normalizeText(c.nome_completo || c.nome || '') === alvoNome);
      if (idx >= 0) {
        busca.value = colaboradores[idx].nome_completo || colaboradores[idx].nome || '';
        busca.dispatchEvent(new Event('input'));
        lista.value = String(idx);
        lista.dispatchEvent(new Event('change'));
      }
    }
  }

  function selOptsSimples(arr, val) {
    return `<option value="">— selecione —</option>` + arr.map(o => `<option value="${U.escapeHtml(o)}" ${val === o ? 'selected' : ''}>${U.escapeHtml(o)}</option>`).join('');
  }

  function renderPreviewColab(modal) {
    const c = modalColab;
    const previewEl = modal.querySelector('#ed-preview');
    if (!c) { previewEl.innerHTML = ''; return; }
    const semAutoMatch = !modalUnidadeTrabalho;
    previewEl.innerHTML = `
      <div class="card full" style="background:var(--bg);margin:14px 0">
        <div class="form-grid">
          <div class="field"><label>Nome</label><input value="${U.escapeHtml(c.nome_completo || c.nome || '')}" disabled></div>
          <div class="field"><label>Situação</label><input value="${U.escapeHtml(c.situacao || '')}" disabled></div>
          <div class="field"><label>Cargo</label><input value="${U.escapeHtml(c.cargo || '')}" disabled></div>
          <div class="field"><label>CPF</label><input value="${U.escapeHtml(c.cpf || '')}" disabled></div>
          <div class="field"><label>E-mail</label><input value="${U.escapeHtml(c.email || '')}" disabled></div>
          <div class="field"><label>Unidade (cadastro)</label><input value="${U.escapeHtml(c.unidade || '')}" disabled></div>
          <div class="field"><label>Departamento (cadastro)</label><input value="${U.escapeHtml(c.departamento || '')}" disabled></div>
          <div class="field"><label>Data de Admissão</label><input value="${c.data_admissao ? U.fmtDateBR(c.data_admissao) : '—'}" disabled></div>
          <div class="field"><label>Data de Desligamento</label><input value="${c.ultimo_dia_trabalhado ? U.fmtDateBR(c.ultimo_dia_trabalhado) : '—'}" disabled></div>
        </div>
      </div>
      ${!c.email ? '<div class="hint" style="margin-bottom:10px">Este colaborador não tem e-mail cadastrado na planilha — você poderá copiar o link manualmente, mas não enviar por e-mail direto daqui.</div>' : ''}
      <div class="form-grid">
        <div class="field"><label>Unidade de trabalho (formulário) <span class="req">*</span>${semAutoMatch ? ' <span class="hint">(não identificamos automaticamente — selecione)</span>' : ''}</label>
          <select id="ed-unidade-trabalho">${selOptsSimples(M.UNIDADE_TRABALHO_OPCOES.map(o => o.label), modalUnidadeTrabalho)}</select>
        </div>
        <div class="field" id="ed-wrap-local">${renderCampoLocalOuDepto()}</div>
      </div>
      <div style="margin-top:14px"><button type="button" class="btn btn-primary" id="ed-btn-gerar" style="width:auto">Gerar link de entrevista</button></div>
    `;
    modal.querySelector('#ed-unidade-trabalho').addEventListener('change', e => {
      modalUnidadeTrabalho = e.target.value; modalLocal = ''; modalDepartamentoForms = '';
      modal.querySelector('#ed-wrap-local').innerHTML = renderCampoLocalOuDepto();
      wireCampoLocalOuDepto(modal);
    });
    wireCampoLocalOuDepto(modal);
    modal.querySelector('#ed-btn-gerar').addEventListener('click', () => gerarLink(modal));
  }

  function opcaoUnidadeAtual() { return M.UNIDADE_TRABALHO_OPCOES.find(o => o.label === modalUnidadeTrabalho); }

  function renderCampoLocalOuDepto() {
    const op = opcaoUnidadeAtual();
    if (!op) return '<label>Loja / ER / Departamento</label><select disabled><option>Escolha a Unidade de trabalho primeiro</option></select>';
    if (op.next === 14) return `<label>Departamento <span class="req">*</span></label><select id="ed-departamento-forms">${selOptsSimples(M.DEPARTAMENTOS, modalDepartamentoForms)}</select>`;
    const bloco = M.LOCAIS[op.next];
    return `<label>${U.escapeHtml(bloco.titulo.replace(/^Selecione (a loja|o ER) em que trabalhou \(.*\)$/, 'Loja/ER'))} <span class="req">*</span></label><select id="ed-local">${selOptsSimples(bloco.lojas, modalLocal)}</select>`;
  }
  function wireCampoLocalOuDepto(modal) {
    const selLocal = modal.querySelector('#ed-local');
    selLocal && selLocal.addEventListener('change', e => { modalLocal = e.target.value; });
    const selDepto = modal.querySelector('#ed-departamento-forms');
    selDepto && selDepto.addEventListener('change', e => { modalDepartamentoForms = e.target.value; });
  }

  async function gerarLink(modal) {
    const msgEl = modal.querySelector('#ed-gerar-msg');
    msgEl.style.display = 'none';
    const op = opcaoUnidadeAtual();
    if (!modalColab) { msgEl.textContent = 'Selecione um(a) colaborador(a).'; msgEl.style.display = 'block'; return; }
    if (!op) { msgEl.textContent = 'Selecione a Unidade de trabalho.'; msgEl.style.display = 'block'; return; }
    if (op.next === 14 && !modalDepartamentoForms) { msgEl.textContent = 'Selecione o Departamento.'; msgEl.style.display = 'block'; return; }
    if (op.next !== 14 && !modalLocal) { msgEl.textContent = 'Selecione a Loja/ER.'; msgEl.style.display = 'block'; return; }

    const btn = modal.querySelector('#ed-btn-gerar');
    btn.disabled = true; btn.textContent = 'Gerando...';
    const token = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2));
    const c = modalColab;
    let row;
    try {
      row = await U.insertWithRetryId('ED', registros().map(r => r.id), async id => {
        const built = {
          id, colaboradorExternalId: c.external_id || '', colaboradorNome: c.nome_completo || c.nome || '',
          colaboradorCpf: c.cpf || '', colaboradorEmail: c.email || '', colaboradorTelefone: '',
          cargo: c.cargo || '', dataAdmissao: c.data_admissao || null, dataDesligamento: c.ultimo_dia_trabalhado || null,
          unidade: c.unidade || '', departamento: c.departamento || '',
          unidadeTrabalho: modalUnidadeTrabalho, local: op.next === 14 ? null : modalLocal,
          departamentoForms: op.next === 14 ? modalDepartamentoForms : null,
          respostas: {}, status: 'Pendente', linkToken: token,
          geradoPor: (HUB_USER && (HUB_USER.nome || HUB_USER.email)) || 'Desconhecido'
        };
        if (modalIdDesligamento) built.idDesligamento = modalIdDesligamento;
        await R.insertRow('entrevistas_desligamento', built);
        return built;
      });
    } catch (err) {
      msgEl.textContent = 'Erro ao gerar o link: ' + err.message; msgEl.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Gerar link de entrevista';
      return;
    }
    mostrarLinkGerado(modal, row);
    // 'ind-desligamento' está em RECRUIT_SECTIONS (app.js) — chamar isto
    // recarrega entrevistas_desligamento do banco e re-renderiza a lista por
    // trás do modal (que fica fora da <div> da seção, então não é fechado).
    if (typeof window.HUB_RENDER_CURRENT === 'function') window.HUB_RENDER_CURRENT();
  }

  function mostrarLinkGerado(modal, row) {
    const link = new URL('entrevista-desligamento-publico.html?token=' + encodeURIComponent(row.linkToken), location.href).href;
    modal.querySelector('#ed-preview').insertAdjacentHTML('beforeend', `
      <div class="msg ok" style="display:block;margin-top:14px">
        <strong>Link gerado com sucesso.</strong><br>
        <input readonly value="${U.escapeHtml(link)}" id="ed-link-gerado" style="width:100%;margin-top:8px;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:12px">
        <div style="display:flex;gap:8px;margin-top:8px">
          <button type="button" class="btn btn-outline btn-sm" id="ed-copiar-link" style="width:auto">Copiar link</button>
          ${row.colaboradorEmail ? `<button type="button" class="btn btn-outline btn-sm" id="ed-enviar-email" style="width:auto">Enviar por e-mail</button>` : ''}
        </div>
      </div>`);
    document.getElementById('ed-btn-gerar').remove();
    modal.querySelector('#ed-copiar-link').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(link); alert('Link copiado.'); } catch (e) { prompt('Copie o link:', link); }
    });
    const btnEmail = modal.querySelector('#ed-enviar-email');
    btnEmail && btnEmail.addEventListener('click', () => {
      const assunto = `Pesquisa de Entrevista de Desligamento — Sfera Multifranquias`;
      const corpo = `Olá, ${row.colaboradorNome}!\n\nGostaríamos de entender melhor sua experiência na Sfera Multifranquias. Por favor, acesse o link abaixo para responder nossa Entrevista de Desligamento:\n${link}\n\nEste link é pessoal e de uso único — não repasse para outras pessoas.\n\nAgradecemos sua colaboração.\nRecursos Humanos`;
      const mailto = `mailto:${row.colaboradorEmail}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
      const a = document.createElement('a');
      a.href = mailto; a.target = '_blank'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    });
  }

  // ---------------------------------------------------------------
  // Subaba "Lista de Colaboradores" — acompanhamento de envio (pra quem foi
  // gerado o link e qual o status) + ações "Copiar link" (reenviar o mesmo
  // link já gerado em vez de criar um novo — evita duas pesquisas pra
  // mesma pessoa) e "Ver respostas" nos já preenchidos. Os gráficos
  // anonimizados da subaba "Indicadores" continuam sem nome de respondente
  // (ver converterRespostaLink em metrics-indicadores.js) — só aqui, tela
  // de acompanhamento operacional por colaborador(a), é que o conteúdo da
  // resposta fica visível, ligado ao nome.
  // ---------------------------------------------------------------
  function linkDoRegistro(row) {
    return new URL('entrevista-desligamento-publico.html?token=' + encodeURIComponent(row.linkToken), location.href).href;
  }

  async function copiarLink(row) {
    const link = linkDoRegistro(row);
    try { await navigator.clipboard.writeText(link); alert('Link copiado — envie para ' + (row.colaboradorNome || 'o(a) ex-colaborador(a)') + '.'); }
    catch (e) { prompt('Copie o link:', link); }
  }

  function abrirModalRespostas(row) {
    const M = window.HUB_ED_MODELO, PR = window.HUB_ED_RENDER;
    const qids = Object.keys(row.respostas || {}).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
    const corpo = qids.map(qid => {
      const q = M.PERGUNTAS[qid];
      if (!q) return '';
      return PR.renderPerguntaHTML(qid, q, row.respostas[qid], true);
    }).join('') || '<p class="sub" style="color:var(--muted)">Sem respostas registradas.</p>';
    const subtitulo = `${U.escapeHtml(row.cargo || '')}${row.dataFinalizacao ? ' · finalizada em ' + U.fmtDateBR(String(row.dataFinalizacao).slice(0, 10)) : ''}`;
    abrirModal(`Respostas — ${U.escapeHtml(row.colaboradorNome || '')}`, `<p class="sub" style="color:var(--muted);margin-bottom:14px">${subtitulo}</p><div class="form-grid">${corpo}</div>`);
  }

  function renderListaLinks() {
    const todos = registros();
    const pendentes = todos.filter(r => r.status === 'Pendente');
    const preenchidos = todos.filter(r => r.status === 'Preenchido').sort((a, b) => (b.dataFinalizacao || '').localeCompare(a.dataFinalizacao || ''));
    return `
      <div class="card full">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
          <h3 style="margin:0">Links de Entrevista de Desligamento</h3>
          <button type="button" class="btn btn-primary btn-sm" id="ed-abrir-gerar" style="width:auto">Gerar link de entrevista</button>
        </div>
        ${!todos.length ? '<p class="sub" style="color:var(--muted)">Nenhum link gerado ainda.</p>' : `
        <div class="table-wrap"><table class="dt">
          <thead><tr><th>Colaborador(a)</th><th>Cargo</th><th>Status</th><th>Gerado por</th><th>Data</th><th></th></tr></thead>
          <tbody>
            ${pendentes.map(r => `<tr>
              <td>${U.escapeHtml(r.colaboradorNome || '')}</td><td>${U.escapeHtml(r.cargo || '')}</td>
              <td><span class="badge b4">Pendente</span></td><td>${U.escapeHtml(r.geradoPor || '')}</td>
              <td>${r.criadoEm ? U.fmtDateBR(String(r.criadoEm).slice(0, 10)) : '—'}</td>
              <td class="row-actions">${r.linkToken ? `<button class="btn btn-outline btn-sm" data-copiar="${r.id}">Copiar link</button>` : ''}</td>
            </tr>`).join('')}
            ${preenchidos.map(r => `<tr>
              <td>${U.escapeHtml(r.colaboradorNome || '')}</td><td>${U.escapeHtml(r.cargo || '')}</td>
              <td><span class="badge b2">Preenchido</span></td><td>${U.escapeHtml(r.geradoPor || '')}</td>
              <td>${r.dataFinalizacao ? U.fmtDateBR(String(r.dataFinalizacao).slice(0, 10)) : '—'}</td>
              <td class="row-actions">
                ${r.linkToken ? `<button class="btn btn-outline btn-sm" data-copiar="${r.id}">Copiar link</button>` : ''}
                <button class="btn btn-outline btn-sm" data-ver="${r.id}">Ver respostas</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table></div>`}
      </div>`;
  }

  function wireListaLinks(el) {
    const btn = el.querySelector('#ed-abrir-gerar');
    btn && btn.addEventListener('click', () => abrirModalGerarLink());
    const todos = registros();
    el.querySelectorAll('[data-copiar]').forEach(b => b.addEventListener('click', () => {
      const row = todos.find(r => String(r.id) === b.dataset.copiar);
      if (row) copiarLink(row);
    }));
    el.querySelectorAll('[data-ver]').forEach(b => b.addEventListener('click', () => {
      const row = todos.find(r => String(r.id) === b.dataset.ver);
      if (row) abrirModalRespostas(row);
    }));
  }

  window.HUB_ENTREVISTA_DESLIGAMENTO = { canGerarLink, renderListaLinks, wireListaLinks, abrirGerarLinkPara: abrirModalGerarLink, linkDoRegistro, copiarLink, abrirRespostas: abrirModalRespostas };
})();
