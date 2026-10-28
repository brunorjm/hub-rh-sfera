// Recrutamento → Parecer do Gestor.
//
// Fluxo: o(a) recrutador(a), na Etapa Entrevista Gestor da tela Candidatos
// (renderGestorBlock em candidatos.js), escolhe qual dos 6 modelos
// (js/pareceres/modelo-*.js) o(a) gestor(a) deve usar — isso cria aqui um
// registro em `pareceres_gestor` com status "Pendente". Esta tela mostra
// essas pendências com uma tarja amarela pro(a) gestor(a); ao clicar, abre
// as Observações já cadastradas do candidato + o formulário do modelo
// escolhido. Ao salvar com um parecer final, atualiza automaticamente
// candidatos.resultadoGestor/etapaGestorStatus/dataEntrevistaGestor (ver
// aplicarResultadoNoCandidato).
//
// O motor de renderização (renderMatrizPositivoAtencao/renderMatrizSimNao/
// wireCampos/validarBlocos) é genérico e dirigido pelos objetos "modelo" —
// mesma filosofia declarativa usada em visita-loja.js, só que aqui em uma
// única página rolável com blocos condicionais (<details class="blk">),
// no molde de candidatos.js, em vez de um wizard por etapas — o formulário
// tem blocos demais e ramificações demais pra um stepper de poucos passos.
(function () {
  const U = HUB_UTILS;
  const R = HUB_RECRUIT;
  const C = HUB_PARECER_COMUM;
  const PR = HUB_PARECER_RENDER;

  function D() { return window.HUB_RECRUIT_DATA || {}; }
  function canFill() { return HUB_PERMISSIONS.hasPerm(HUB_USER, 'recrutamento.parecer_gestor'); }
  function canManage() { return HUB_PERMISSIONS.hasPerm(HUB_USER, 'recrutamento.candidatos'); }

  let rootEl = null;
  let view = 'list'; // 'list' | 'preencher' | 'ver'
  let editingId = null;
  let formDados = null;

  function pareceres() { return D()['pareceres_gestor'] || []; }
  function candidatoDe(parecer) { return (D().candidatos || []).find(c => c.id === parecer.candidatoId); }
  function modeloDe(parecer) { return (window.HUB_PARECER_MODELOS || {})[parecer.modelo]; }

  function renderParecerGestor(el, f) {
    rootEl = el;
    render();
  }
  function render() {
    if (view === 'preencher') return renderPreencherView(rootEl);
    if (view === 'ver') return renderVerView(rootEl);
    return renderListView(rootEl);
  }

  // ---------------------------------------------------------------- Lista
  function renderListView(el) {
    const todos = pareceres();
    const pendentes = todos.filter(p => p.status === 'Pendente');
    const preenchidos = todos.filter(p => p.status === 'Preenchido').sort((a, b) => (b.dataFinalizacao || '').localeCompare(a.dataFinalizacao || ''));

    el.innerHTML = `
      <div class="kpi-grid">
        ${HUB_UI.kpi('Pendentes de preenchimento', U.fmtInt(pendentes.length), '', pendentes.length > 0 ? 'var(--warning)' : '#1baf7a')}
        ${HUB_UI.kpi('Pareceres preenchidos', U.fmtInt(preenchidos.length), '', 'var(--p1)')}
      </div>

      <h3 style="font-size:13px;margin:6px 0 12px">Pendentes${canFill() ? '' : ' (visão do(a) recrutador(a))'}</h3>
      ${pendentes.length === 0 ? HUB_UI.empty('Nenhum parecer pendente no momento.', 'Quando um(a) recrutador(a) agendar uma entrevista com gestor e escolher um modelo de parecer, ele aparece aqui.') : `
        <div id="pg-pendentes">${pendentes.map(p => renderCardPendente(p)).join('')}</div>
      `}

      <h3 style="font-size:13px;margin:22px 0 12px">Preenchidos</h3>
      ${preenchidos.length === 0 ? HUB_UI.empty('Nenhum parecer preenchido ainda.', '') : `
        <div class="card full" style="overflow-x:auto">
          <table class="tbl">
            <thead><tr><th>Candidato</th><th>Modelo</th><th>Nível</th><th>Parecer Final</th><th>Preenchido por</th><th>Data</th><th></th></tr></thead>
            <tbody>
              ${preenchidos.map(p => {
                const modelo = modeloDe(p);
                const nivel = (C.NIVEIS_RECOMENDACAO.find(n => n.valor === p.nivelRecomendacao) || {}).estrelas || '—';
                return `<tr>
                  <td>${U.escapeHtml(p.candidatoNome || '—')}</td>
                  <td>${U.escapeHtml(modelo ? modelo.nome : p.modelo)}</td>
                  <td>${nivel}</td>
                  <td>${U.escapeHtml(p.parecerFinal || '—')}</td>
                  <td>${U.escapeHtml(p.preenchidoPor || '—')}</td>
                  <td>${p.dataFinalizacao ? U.fmtDateBR(p.dataFinalizacao) : '—'}</td>
                  <td><button type="button" class="btn btn-outline btn-sm" data-ver="${p.id}">Ver</button></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    `;
    el.querySelectorAll('[data-preencher]').forEach(btn => btn.addEventListener('click', () => abrirPreencher(btn.dataset.preencher)));
    el.querySelectorAll('[data-ver]').forEach(btn => btn.addEventListener('click', () => abrirVer(btn.dataset.ver)));
  }

  function renderCardPendente(p) {
    const modelo = modeloDe(p);
    const cand = candidatoDe(p);
    const dataAgendada = cand && cand.dataAgendadaGestor ? U.fmtDateBR(cand.dataAgendadaGestor) : null;
    return `<div style="background:#fff8e1;border-left:4px solid var(--warning);border-radius:8px;padding:14px 16px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap">
      <div>
        <div style="font-weight:700">${U.escapeHtml(p.candidatoNome || '—')}</div>
        <div style="font-size:12.5px;color:var(--muted)">${U.escapeHtml(p.cargo || '')} · Modelo: ${U.escapeHtml(modelo ? modelo.nome : p.modelo)}${dataAgendada ? ` · Entrevista agendada: ${dataAgendada}${cand.horarioGestor ? ' às ' + U.escapeHtml(cand.horarioGestor) : ''}` : ''}</div>
      </div>
      ${canFill() ? `<button type="button" class="btn btn-primary btn-sm" style="width:auto" data-preencher="${p.id}">Preencher Parecer</button>` : `<span class="hint">Aguardando o(a) gestor(a)</span>`}
    </div>`;
  }

  function abrirPreencher(id) {
    const p = pareceres().find(x => x.id === id);
    if (!p) return;
    editingId = id;
    formDados = Object.assign({}, p.dados || {});
    const modelo = modeloDe(p);
    if (modelo) {
      if (!formDados.dataEntrevista) formDados.dataEntrevista = U.todayISO();
      if (!formDados.cargo) formDados.cargo = p.cargo;
      if (!formDados.candidatoNome) formDados.candidatoNome = p.candidatoNome;
      if (!formDados.gestorNome) formDados.gestorNome = (HUB_USER && (HUB_USER.nome || HUB_USER.email)) || '';
      if (!formDados.recrutadorNome) formDados.recrutadorNome = p.recrutador;
      if (!formDados.grupoCargo && modelo.cargoParaGrupoDefault) formDados.grupoCargo = modelo.cargoParaGrupoDefault(p.cargo) || '';
    }
    view = 'preencher';
    render();
  }
  function abrirVer(id) {
    const p = pareceres().find(x => x.id === id);
    if (!p) return;
    editingId = id;
    formDados = Object.assign({}, p.dados || {});
    view = 'ver';
    render();
  }
  function voltarLista() { view = 'list'; editingId = null; formDados = null; render(); }

  // Motor de renderização (matrizes/localização/corpo do formulário) mora em
  // js/pareceres/render-comum.js (HUB_PARECER_RENDER) — compartilhado com a
  // página pública parecer-publico.html, que usa o mesmo motor sem login.

  // -------------------------------------------------------- Preencher/Ver
  function renderPreencherView(el) {
    const p = pareceres().find(x => x.id === editingId);
    const modelo = p && modeloDe(p);
    if (!p || !modelo) { voltarLista(); return; }
    const cand = candidatoDe(p);
    el.innerHTML = `
      <button type="button" class="btn btn-outline btn-sm" id="pg-voltar" style="width:auto;margin-bottom:14px">&larr; Voltar</button>
      <h2 style="margin-bottom:4px">Parecer do Gestor — ${U.escapeHtml(p.candidatoNome || '')}</h2>
      <p class="hint" style="margin-bottom:16px">Modelo: ${U.escapeHtml(modelo.nome)}</p>
      <details class="blk" open><summary>Observações do Candidato</summary><div class="blk-body">
        <p style="white-space:pre-wrap;font-size:13px">${cand && cand.observacoes ? U.escapeHtml(cand.observacoes) : '<span class="hint">Nenhuma observação registrada pelo time de R&amp;S.</span>'}</p>
      </div></details>
      <div id="pg-form">${PR.renderFormBody(modelo, formDados, '')}</div>
      <div id="pg-msg"></div>
      <div class="field full" style="margin-top:10px"><button type="button" class="btn btn-primary" id="pg-salvar" style="width:auto">Salvar Parecer</button></div>
    `;
    el.querySelector('#pg-voltar').addEventListener('click', voltarLista);
    el.querySelector('#pg-salvar').addEventListener('click', () => salvarParecer(el, p, modelo));
    PR.wirePreencherEvents(el, modelo, formDados);
  }

  function renderVerView(el) {
    const p = pareceres().find(x => x.id === editingId);
    const modelo = p && modeloDe(p);
    if (!p || !modelo) { voltarLista(); return; }
    const cand = candidatoDe(p);
    el.innerHTML = `
      <button type="button" class="btn btn-outline btn-sm" id="pg-voltar" style="width:auto;margin-bottom:14px">&larr; Voltar</button>
      <h2 style="margin-bottom:4px">Parecer do Gestor — ${U.escapeHtml(p.candidatoNome || '')}</h2>
      <p class="hint" style="margin-bottom:16px">Modelo: ${U.escapeHtml(modelo.nome)} · Preenchido por ${U.escapeHtml(p.preenchidoPor || '—')} em ${p.dataFinalizacao ? U.fmtDateBR(p.dataFinalizacao) : '—'}</p>
      <details class="blk" open><summary>Observações do Candidato</summary><div class="blk-body">
        <p style="white-space:pre-wrap;font-size:13px">${cand && cand.observacoes ? U.escapeHtml(cand.observacoes) : '<span class="hint">Nenhuma observação registrada pelo time de R&amp;S.</span>'}</p>
      </div></details>
      <div>${PR.renderFormBody(modelo, formDados, 'disabled')}</div>
    `;
    el.querySelector('#pg-voltar').addEventListener('click', voltarLista);
  }

  // ----------------------------------------------------------- Salvar
  // Espelha o "Parecer final" no resultado da Etapa Gestor do candidato —
  // não existe 1:1 exato para "Indicação para outra filial" no enum de
  // resultado da etapa (RESULTADO_ETAPA_DETALHE, em candidatos.js), então
  // essa opção também aprova a etapa; o detalhe completo continua salvo em
  // pareceres_gestor.parecer_final.
  function resultadoGestorDoParecer(parecerFinal) {
    if (parecerFinal === 'Aprovado(a) - Banco de Talentos') return 'Banco de Talentos';
    if (parecerFinal === 'Reprovado(a) - Não avançar no processo') return 'Reprovado';
    return 'Aprovado'; // 'Aprovado(a) - Avançar no processo' | 'Aprovado(a) - Indicação para outra filial'
  }

  async function salvarParecer(el, p, modelo) {
    const erro = PR.validar(modelo, formDados);
    const msgEl = el.querySelector('#pg-msg');
    if (erro) { msgEl.innerHTML = `<div class="msg erro" style="margin-top:10px">${U.escapeHtml(erro)}</div>`; return; }
    const btn = el.querySelector('#pg-salvar');
    btn.disabled = true; btn.textContent = 'Salvando...';
    try {
      const agora = new Date().toISOString();
      await R.updateRow('pareceres_gestor', p.id, {
        status: 'Preenchido',
        dados: formDados,
        nivelRecomendacao: formDados.nivelRecomendacao,
        parecerFinal: formDados.parecerFinal,
        justificativa: formDados.justificativa,
        preenchidoPor: (HUB_USER && (HUB_USER.nome || HUB_USER.email)) || 'Desconhecido',
        dataFinalizacao: agora
      });
      if (p.candidatoId) {
        await R.updateRow('candidatos', p.candidatoId, {
          resultadoGestor: resultadoGestorDoParecer(formDados.parecerFinal),
          etapaGestorStatus: 'Concluída',
          dataEntrevistaGestor: agora.slice(0, 10)
        });
      }
      await R.reload();
      voltarLista();
    } catch (err) {
      msgEl.innerHTML = `<div class="msg erro" style="margin-top:10px">Erro ao salvar: ${U.escapeHtml(err.message)}</div>`;
      btn.disabled = false; btn.textContent = 'Salvar Parecer';
    }
  }

  window.HUB_SECTIONS = window.HUB_SECTIONS || {};
  window.HUB_SECTIONS.renderParecerGestor = renderParecerGestor;
})();
