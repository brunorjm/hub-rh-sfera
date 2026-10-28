// Recrutamento → Transferência de Vaga. Portado de renderTransferencia do
// Sfera Recruiter original (~6813-7006), adaptado às convenções do hub: sem
// tabela `transferencias` própria (no original ela era só em memória, nunca
// persistida — ver relatório de exploração) — aqui a ação passa pelo mesmo
// mecanismo de solicitações/histórico já usado por congelar/cancelar vaga em
// vagas.js, então o rastro fica em Aprovações (se precisar de aprovação) e
// em Histórico (sempre, depois de efetivada) sem precisar de tabela extra.
// aplicarEfeitoAprovacao (js/sections/aprovacoes.js) já sabe aplicar o tipo
// 'transferir-vaga' quando a solicitação é aprovada depois.
(function () {
  const U = HUB_UTILS;
  const R = HUB_RECRUIT;

  const MOTIVOS_TRANSF = ['Férias', 'Afastamento', 'Redistribuição de Carga', 'Desligamento', 'Outro'];

  function D() { return window.HUB_RECRUIT_DATA || {}; }
  function canWrite() { return HUB_PERMISSIONS.hasPerm(HUB_USER, 'recrutamento.transferencia'); }
  function canApprove() { return HUB_PERMISSIONS.hasPerm(HUB_USER, 'recrutamento.aprovacoes'); }
  function recrutadoresAtivos() { return R.activeNames('recrutadores'); }

  let rootEl = null;
  let transferindoId = null; // id da vaga com o form de transferência aberto

  function renderTransferencia(el, f) {
    rootEl = el;
    render();
  }
  function render() { if (rootEl) renderList(rootEl); }
  async function reloadAndRender() {
    try { await R.reload(); } catch (err) { /* mantém dados antigos na tela mesmo se o reload falhar */ }
    render();
  }

  function renderList(el) {
    const vagas = (D().vagas || []).filter(v => v.status !== 'Finalizada' && v.status !== 'Cancelada');

    if (!canWrite()) {
      el.innerHTML = '<div class="empty"><p>Acesso restrito.</p></div>';
      return;
    }

    el.innerHTML = `
      <div style="margin-bottom:14px">
        <h2 style="font-size:16px">Transferência de Vaga</h2>
        <p class="sub" style="color:var(--muted);font-size:12px;margin-top:2px">Reatribua o(a) recrutador(a) responsável por uma vaga em aberto, andamento ou congelada${canApprove() ? '' : ' — a mudança é enviada para aprovação'}.</p>
      </div>
      <div class="card full">
        ${vagas.length === 0 ? HUB_UI.empty('Nenhuma vaga em aberto, andamento ou congelada no momento.') : `
        <div class="table-wrap"><table class="dt">
          <thead><tr><th>ID</th><th>Cargo</th><th>Unidade</th><th>Departamento</th><th>Status</th><th>Responsável atual</th><th></th></tr></thead>
          <tbody>
            ${vagas.map(v => `
              <tr>
                <td>${U.escapeHtml(v.id)}</td>
                <td>${U.escapeHtml(v.cargo || '')}</td>
                <td>${U.escapeHtml(v.unidade || '')}</td>
                <td>${U.escapeHtml(v.departamento || '')}</td>
                <td>${U.escapeHtml(v.status || '')}</td>
                <td>${U.escapeHtml(v.responsavel || '—')}</td>
                <td class="row-actions"><button class="btn btn-outline btn-sm" data-transferir="${v.id}">Transferir</button></td>
              </tr>
              ${transferindoId === v.id ? `<tr><td colspan="7">${formTransferenciaHTML(v)}</td></tr>` : ''}
            `).join('')}
          </tbody>
        </table></div>`}
      </div>`;

    el.querySelectorAll('[data-transferir]').forEach(b => b.addEventListener('click', () => {
      transferindoId = transferindoId === b.dataset.transferir ? null : b.dataset.transferir;
      renderList(el);
    }));
    if (transferindoId) wireForm(el, transferindoId);
  }

  function formTransferenciaHTML(v) {
    const opcoes = recrutadoresAtivos().filter(r => r !== v.responsavel);
    return `<div class="card" style="margin:8px 0;border-left:4px solid var(--p1)">
      <div class="form-grid">
        <div class="field"><label>Novo(a) recrutador(a) responsável <span class="req">*</span></label>
          <select id="tf_novoRecrutador"><option value="">Selecione...</option>${opcoes.map(r => `<option value="${U.escapeHtml(r)}">${U.escapeHtml(r)}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Motivo <span class="req">*</span></label>
          <select id="tf_motivo"><option value="">Selecione...</option>${MOTIVOS_TRANSF.map(m => `<option value="${U.escapeHtml(m)}">${U.escapeHtml(m)}</option>`).join('')}</select>
        </div>
        <div class="field full"><label>Observação</label><textarea id="tf_observacao" rows="2" placeholder="Detalhes adicionais (opcional)"></textarea></div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:10px">
        <button type="button" class="btn btn-outline btn-sm" id="tf_cancelar" style="width:auto">Cancelar</button>
        <button type="button" class="btn btn-primary btn-sm" id="tf_confirmar" style="width:auto">${canApprove() ? 'Transferir' : 'Enviar para aprovação'}</button>
      </div>
      <div class="msg err" id="tf_msg"></div>
    </div>`;
  }

  function wireForm(el, vagaId) {
    el.querySelector('#tf_cancelar').addEventListener('click', () => { transferindoId = null; renderList(el); });
    el.querySelector('#tf_confirmar').addEventListener('click', () => confirmarTransferencia(el, vagaId));
  }

  async function confirmarTransferencia(el, vagaId) {
    const vaga = (D().vagas || []).find(v => v.id === vagaId);
    if (!vaga) return;
    const novoRecrutador = el.querySelector('#tf_novoRecrutador').value;
    const motivo = el.querySelector('#tf_motivo').value;
    const observacao = el.querySelector('#tf_observacao').value.trim();
    const msg = el.querySelector('#tf_msg');
    msg.style.display = 'none';
    if (!novoRecrutador) { msg.textContent = 'Selecione o(a) novo(a) recrutador(a) responsável.'; msg.style.display = 'block'; return; }
    if (!motivo) { msg.textContent = 'Selecione o motivo da transferência.'; msg.style.display = 'block'; return; }

    const btn = el.querySelector('#tf_confirmar');
    btn.disabled = true; btn.textContent = 'Enviando...';
    try {
      if (canApprove()) {
        await R.updateRow('vagas', vagaId, { responsavel: novoRecrutador });
        await R.logAcao({
          acao: 'Transferência', vagaId, campo: 'Responsável', valorAnterior: vaga.responsavel, valorNovo: novoRecrutador,
          detalhes: `Motivo: ${motivo}${observacao ? ' · ' + observacao : ''}`
        });
        alert(`Vaga ${vagaId} transferida para ${novoRecrutador}.`);
      } else {
        await R.criarSolicitacao({
          tipo: 'transferir-vaga',
          payload: { vagaId, cargo: vaga.cargo, unidade: vaga.unidade, novoRecrutador, motivo, observacao },
          descricao: `Transferir vaga ${vagaId} — ${vaga.cargo || ''} (${vaga.unidade || ''}) de ${vaga.responsavel || '—'} para ${novoRecrutador}. Motivo: ${motivo}${observacao ? ' — ' + observacao : ''}`
        });
        alert('Solicitação de transferência enviada para aprovação.');
      }
    } catch (err) {
      msg.textContent = 'Erro ao transferir: ' + err.message; msg.style.display = 'block';
      btn.disabled = false; btn.textContent = canApprove() ? 'Transferir' : 'Enviar para aprovação';
      return;
    }
    transferindoId = null;
    await reloadAndRender();
  }

  window.HUB_SECTIONS = window.HUB_SECTIONS || {};
  window.HUB_SECTIONS.renderTransferencia = renderTransferencia;
})();
