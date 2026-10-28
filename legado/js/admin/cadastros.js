// Administração → Cadastros do Recrutamento: CRUD das 8 listas mestre que
// alimentam os formulários/filtros do módulo Recrutamento (Recrutadores,
// Unidades, Departamentos, Cargos, Etapas, Fontes de Captação, Portais,
// Níveis de Vaga). Porta a parte de listas mestre de renderAdmin +
// adminSectionHTML/adminSectionDepartamentosHTML + adicionarItemAdmin/
// editarItemAdmin/removerItemAdmin do Sfera Recruiter original
// (~linhas 8857-9425) — a gestão de usuários dessa mesma tela já está
// coberta por js/admin/usuarios.js (não duplicar aqui) e o antigo ADMIN_PIN
// não existe mais (gate real: admin.cadastros_recrutamento).
//
// Diferente do original (arrays simples de string em memória, removidos por
// índice), aqui cada linha é {id, nome, ativo[, unidade]} vinda do Supabase
// (window.HUB_RECRUIT_DATA[table], carregada 1x no login — ver
// dal-recrutamento.js). Não existe um "remover" de verdade: seguindo o
// padrão de soft-delete por `ativo` já usado no `departamentos` do
// original, "remover" aqui é um upsert com ativo:false (reversível via
// "Ativar"), e nunca um delete físico — mais seguro para não quebrar vagas/
// candidatos antigos que já referenciam o nome.
//
// Não existe mais um cadastro de "Marca" — Departamentos cascateia a partir
// de Unidade (a tabela `recrutamento_departamentos` tem uma coluna
// `unidade`), igual à cascata usada na tela de vagas (js/sections/vagas.js).
(function () {
  const U = HUB_UTILS;

  const TABS = [
    { key: 'recrutadores', table: 'recrutadores', label: 'Recrutadores', icon: '&#128100;' },
    { key: 'unidades', table: 'unidades', label: 'Unidades', icon: '&#128205;' },
    { key: 'departamentos', table: 'recrutamento_departamentos', label: 'Departamentos', icon: '&#127970;', dependsOnUnidade: true },
    { key: 'cargos', table: 'cargos', label: 'Cargos', icon: '&#128188;' },
    { key: 'etapas', table: 'etapas', label: 'Etapas do Processo', icon: '&#128279;' },
    { key: 'fontes', table: 'fontes_captacao', label: 'Fontes de Captação', icon: '&#128225;' },
    { key: 'portais', table: 'portais', label: 'Portais de Divulgação', icon: '&#127760;' },
    { key: 'niveis', table: 'niveis_vaga', label: 'Níveis de Vaga', icon: '&#128200;' }
  ];

  let activeTab = TABS[0].key;
  let editingRow = null; // linha sendo editada (objeto vindo de HUB_RECRUIT_DATA[table]) ou null = criando

  function canManage() { return HUB_PERMISSIONS.hasPerm(HUB_USER, 'admin.cadastros_recrutamento'); }

  function render(el) {
    if (!canManage()) {
      el.innerHTML = '<div class="empty"><p>Acesso restrito.</p></div>';
      return;
    }
    el.innerHTML = `
      <div class="tab-bar">${TABS.map(t => `<button type="button" class="tab-btn ${activeTab === t.key ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}</div>
      <div id="cad-body"></div>
    `;
    el.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
      activeTab = b.dataset.tab;
      editingRow = null;
      render(el);
    }));
    renderTab(el);
  }

  function renderTab(el) {
    const cfg = TABS.find(t => t.key === activeTab);
    const body = document.getElementById('cad-body');
    const rows = ((window.HUB_RECRUIT_DATA && window.HUB_RECRUIT_DATA[cfg.table]) || [])
      .slice()
      .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));

    body.innerHTML = `
      <div class="grid2">
        <div class="card full">
          <h3><span class="card-ic">${HUB_ICON(cfg.icon)}</span>${cfg.label} — ${rows.length} item(ns)</h3>
          ${rows.length ? `<div class="table-wrap"><table class="dt"><thead><tr>
            <th>Nome</th>${cfg.dependsOnUnidade ? '<th>Unidade</th>' : ''}<th>Status</th><th></th>
          </tr></thead><tbody>
            ${rows.map(r => `<tr>
              <td>${U.escapeHtml(r.nome)}</td>
              ${cfg.dependsOnUnidade ? `<td>${U.escapeHtml(r.unidade || '—')}</td>` : ''}
              <td><span class="badge ${r.ativo !== false ? 'b2' : 'b3'}">${r.ativo !== false ? 'Ativo' : 'Inativo'}</span></td>
              <td style="white-space:nowrap"><div class="row-actions">
                <button class="btn btn-outline btn-sm" data-edit="${r.id}">Editar</button>
                <button class="btn btn-sm ${r.ativo !== false ? 'btn-danger' : ''}" data-toggle="${r.id}">${r.ativo !== false ? 'Desativar' : 'Ativar'}</button>
              </div></td>
            </tr>`).join('')}
          </tbody></table></div>` : '<div class="empty"><p>Nenhum item cadastrado.</p></div>'}
        </div>
        <div class="card full" id="cad-form-card"></div>
      </div>
    `;

    renderForm(el, cfg, rows);

    body.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
      editingRow = rows.find(r => String(r.id) === b.dataset.edit) || null;
      renderForm(el, cfg, rows);
      document.getElementById('cad-form-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }));
    body.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => {
      const row = rows.find(r => String(r.id) === b.dataset.toggle);
      if (row) toggleAtivo(el, cfg, row);
    }));
  }

  function renderForm(el, cfg, rows) {
    const card = document.getElementById('cad-form-card');
    const isEdit = !!editingRow;
    const r = editingRow || { nome: '', unidade: '', ativo: true };
    const unidadesAtivas = HUB_RECRUIT.activeNames('unidades');

    card.innerHTML = `
      <h3>${isEdit ? 'Editar' : 'Novo(a)'} — ${cfg.label.replace(/s$/, '')}</h3>
      <form id="cad-form">
        <div class="field full"><label>Nome</label><input id="cad-nome" required value="${U.escapeHtml(r.nome)}"></div>
        ${cfg.dependsOnUnidade ? `<div class="field full"><label>Unidade</label><select id="cad-unidade" required>
          <option value="">Selecione a unidade...</option>
          ${unidadesAtivas.map(m => `<option value="${U.escapeHtml(m)}" ${r.unidade === m ? 'selected' : ''}>${U.escapeHtml(m)}</option>`).join('')}
        </select>${!unidadesAtivas.length ? '<p class="sub" style="color:var(--muted);margin-top:6px">Cadastre ao menos uma unidade ativa primeiro.</p>' : ''}</div>` : ''}
        <div style="display:flex;gap:10px;margin-top:6px">
          <button type="submit" class="btn btn-primary" style="width:auto">${isEdit ? 'Salvar alterações' : 'Adicionar'}</button>
          ${isEdit ? '<button type="button" class="btn btn-outline" id="cad-cancel">Cancelar</button>' : ''}
        </div>
        <div class="msg err" id="cad-msg"></div>
      </form>
    `;

    if (isEdit) document.getElementById('cad-cancel').addEventListener('click', () => { editingRow = null; renderForm(el, cfg, rows); });
    document.getElementById('cad-form').addEventListener('submit', e => submitForm(e, el, cfg, rows));
  }

  async function submitForm(e, el, cfg, rows) {
    e.preventDefault();
    const msg = document.getElementById('cad-msg');
    msg.style.display = 'none';
    const nome = document.getElementById('cad-nome').value.trim();
    const unidade = cfg.dependsOnUnidade ? document.getElementById('cad-unidade').value : undefined;
    const isEdit = !!editingRow;

    if (!nome) { msg.textContent = 'Informe o nome.'; msg.style.display = 'block'; return; }
    if (cfg.dependsOnUnidade && !unidade) { msg.textContent = 'Selecione a unidade.'; msg.style.display = 'block'; return; }

    const duplicado = rows.find(r => U.normalizeText(r.nome) === U.normalizeText(nome) && (!isEdit || String(r.id) !== String(editingRow.id)));
    if (duplicado) {
      msg.textContent = duplicado.ativo === false ? 'Já existe um item inativo com esse nome — edite-o e clique em "Ativar" em vez de criar um novo.' : 'Este nome já existe.';
      msg.style.display = 'block';
      return;
    }

    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    const payload = { nome, ativo: isEdit ? editingRow.ativo !== false : true };
    if (isEdit) payload.id = editingRow.id;
    if (cfg.dependsOnUnidade) payload.unidade = unidade;

    try {
      await HUB_RECRUIT.upsertMaster(cfg.table, payload);
      const user = (window.HUB_USER && (HUB_USER.nome || HUB_USER.email)) || 'Desconhecido';
      await HUB_RECRUIT.logAcao({ acao: isEdit ? 'Admin - Edição de Cadastro' : 'Admin - Cadastro', detalhes: `${cfg.label}: ${nome}${cfg.dependsOnUnidade ? ' (' + unidade + ')' : ''} · por ${user}` });
      await HUB_RECRUIT.reloadMasterLists();
      editingRow = null;
      renderTab(el);
    } catch (err) {
      msg.textContent = err.message || 'Erro ao salvar.';
      msg.style.display = 'block';
      btn.disabled = false;
      btn.textContent = isEdit ? 'Salvar alterações' : 'Adicionar';
    }
  }

  // Soft-delete/reativação: upsert reenviando o registro inteiro (id + nome
  // [+ unidade]) só com `ativo` invertido — nunca um delete físico, pra não
  // quebrar vagas/candidatos já cadastrados com esse valor.
  async function toggleAtivo(el, cfg, row) {
    const ativar = row.ativo === false;
    if (!ativar && !confirm(`Desativar "${row.nome}"? Isso não afeta registros já cadastrados, só some das opções de novos cadastros.`)) return;
    try {
      const payload = { id: row.id, nome: row.nome, ativo: ativar };
      if (cfg.dependsOnUnidade) payload.unidade = row.unidade;
      await HUB_RECRUIT.upsertMaster(cfg.table, payload);
      const user = (window.HUB_USER && (HUB_USER.nome || HUB_USER.email)) || 'Desconhecido';
      await HUB_RECRUIT.logAcao({ acao: ativar ? 'Admin - Reativação de Cadastro' : 'Admin - Remoção', detalhes: `${cfg.label}: ${row.nome} · por ${user}` });
      await HUB_RECRUIT.reloadMasterLists();
      renderTab(el);
    } catch (err) {
      alert('Erro ao atualizar: ' + err.message);
    }
  }

  window.HUB_ADMIN_CADASTROS = { render };
})();
