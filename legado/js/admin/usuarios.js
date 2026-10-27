// Administração → Cadastro de Acessos: cria/edita logins e a permissão
// granular de cada um (checkbox por módulo/funcionalidade — catálogo em
// js/permissions.js). Os botões "Administrador/Gestor/RH" só aplicam um
// preset de checkboxes de partida; o que vale de verdade, salvo no banco, é
// o mapa de checkboxes marcados no momento do envio. Gate: admin.usuarios.
(function () {
  const U = HUB_UTILS;
  const PERM = HUB_PERMISSIONS;

  let editingProfile = null;
  const accFilter = { q: '', perfil: '', status: '', unidade: '' };

  // Só colaboradores Ativo/Desativado — Desligado fica de fora, senão unidade/
  // departamento de quem já saiu da empresa (às vezes com nome de área que nem
  // existe mais na configuração atual) continua aparecendo pra sempre nas
  // caixinhas de "Unidades/Departamentos liberados", mesmo sem ninguém lá.
  function orgOptions() {
    const colab = (HUB_DATA.colaboradores || []).filter(r => U.normalizeText(r.situacao) !== 'desligado');
    const unidades = U.uniqueSorted(colab.map(r => r.unidade));
    const porUnidade = new Map();
    for (const r of colab) {
      if (!r.unidade || !r.departamento) continue;
      if (!porUnidade.has(r.unidade)) porUnidade.set(r.unidade, new Set());
      porUnidade.get(r.unidade).add(r.departamento);
    }
    const departamentosPorUnidade = {};
    for (const [u, set] of porUnidade.entries()) departamentosPorUnidade[u] = U.uniqueSorted(Array.from(set));
    return { unidades, departamentosPorUnidade };
  }

  // Campo "Colaborador no Feedz": liga o login ao colaborador pelo ID da Feedz
  // (colaboradores.external_id), usado pelo organograma por galho. Cada opção
  // tem nome + cargo + unidade para diferenciar homônimos e recontratações.
  function colaboradorOptions() {
    const byLabel = new Map(), byExt = new Map();
    const colab = (HUB_DATA.colaboradores || []).filter(r => r.external_id)
      .slice().sort((a, b) => ((a.situacao === 'Ativo') ? 0 : 1) - ((b.situacao === 'Ativo') ? 0 : 1)
        || String(a.nome_completo || a.nome).localeCompare(String(b.nome_completo || b.nome), 'pt-BR'));
    for (const r of colab) {
      let label = `${r.nome_completo || r.nome} — ${r.cargo || 'sem cargo'} · ${r.unidade || 'sem unidade'}${r.situacao === 'Ativo' ? '' : ' (desativado)'}`;
      if (byLabel.has(label)) label += ` · ID ${r.external_id}`;
      byLabel.set(label, r.external_id);
      byExt.set(r.external_id, label);
    }
    return { byLabel, byExt };
  }

  function render(el) {
    if (!PERM.hasPerm(HUB_USER, 'admin.usuarios')) {
      el.innerHTML = '<div class="empty"><p>Acesso restrito.</p></div>';
      return;
    }
    el.innerHTML = `<div class="grid2">
      <div class="card full">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <h3><span class="card-ic">${HUB_ICON('users')}</span>Contas cadastradas</h3>
          <button type="button" class="btn btn-outline btn-sm" id="btn-viewas-history">Histórico de "Visualizar como"</button>
        </div>
        <div id="acc-list">Carregando...</div>
      </div>
      <div class="card full" id="acc-form-card"></div>
    </div>`;
    document.getElementById('btn-viewas-history').addEventListener('click', openViewAsHistory);
    try {
      renderAccessForm(document.getElementById('acc-form-card'));
    } catch (err) {
      document.getElementById('acc-form-card').innerHTML = `<div class="empty"><p>Erro ao montar o formulário: ${U.escapeHtml(err.message)}</p></div>`;
    }
    HUB_DAL.listProfiles()
      .then(profiles => renderAccessList(document.getElementById('acc-list'), profiles))
      .catch(err => { document.getElementById('acc-list').innerHTML = `<div class="empty"><p>Erro ao carregar contas: ${U.escapeHtml(err.message)}</p></div>`; });
  }

  // Auditoria do "Visualizar como" (viewas_log — ver supabase-viewas-log.sql).
  function openViewAsHistory() {
    const esc = U.escapeHtml;
    const fmtDT = iso => iso ? new Date(iso).toLocaleDateString('pt-BR') + ' às ' + new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px';
    overlay.innerHTML = `<div style="background:var(--card);border-radius:var(--radius);max-width:820px;width:100%;max-height:85vh;display:flex;flex-direction:column">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--border)">
        <h3 style="font-size:15px">Histórico de "Visualizar como"</h3>
        <button type="button" id="vh-close" aria-label="Fechar">&times;</button>
      </div>
      <div id="vh-body" style="overflow:auto;padding:14px 18px;font-size:12px">Carregando...</div>
    </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('#vh-close').addEventListener('click', close);
    const body = overlay.querySelector('#vh-body');
    HUB_DAL.listViewAsLog(300).then(log => {
      if (!log.length) { body.textContent = 'Nenhuma visualização registrada ainda.'; return; }
      body.innerHTML = `<table style="width:100%;border-collapse:collapse"><thead><tr style="text-align:left;color:var(--muted)"><th>Início</th><th>Duração</th><th>Quem visualizou</th><th>Visualizou como</th><th>Perfil</th></tr></thead><tbody>${log.map(l => {
        const emAndamento = !l.encerrado_em;
        const dur = emAndamento ? '<span style="color:var(--warning)">em andamento</span>'
          : U.fmtInt(Math.round((new Date(l.encerrado_em) - new Date(l.iniciado_em)) / 60000)) + ' min';
        return `<tr style="border-top:1px solid var(--border)"><td>${fmtDT(l.iniciado_em)}</td><td>${dur}</td><td>${esc(l.usuario_nome || '—')}</td><td>${esc(l.alvo_nome || l.alvo_email || '—')}</td><td>${esc(PERM.PERFIL_LABELS[l.alvo_perfil] || l.alvo_perfil || '—')}</td></tr>`;
      }).join('')}</tbody></table>`;
    }).catch(err => {
      body.textContent = 'Não foi possível carregar o histórico: ' + err.message + (/viewas_log|relation|schema cache/i.test(err.message) ? ' — rode supabase-viewas-log.sql no Supabase.' : '');
    });
  }

  // Lista longa vira os 2 primeiros itens + "+N" (tooltip com a lista completa);
  // a lista inteira continua visível ao clicar em Editar.
  const SCOPE_VISIBLE = 2;
  function scopeCell(items, allLabel) {
    if (!items || !items.length) return `<em>${allLabel}</em>`;
    const chips = items.slice(0, SCOPE_VISIBLE).map(i => `<span class="scope-chip" title="${U.escapeHtml(i)}">${U.escapeHtml(i)}</span>`).join('');
    const rest = items.length - SCOPE_VISIBLE;
    const more = rest > 0 ? `<span class="scope-chip scope-more" title="${U.escapeHtml(items.join('\n'))}">+${rest}</span>` : '';
    return `<div class="scope-chips">${chips}${more}</div>`;
  }

  // Status de acesso: 'ativo' | 'inativo' (suspenso) | 'desligado' (colaborador
  // desligado). Perfis sem a coluna (SQL ainda não rodado) contam como ativos.
  const STATUS_LABEL = { ativo: 'Ativo', inativo: 'Inativo', desligado: 'Desligado' };
  const statusOf = p => p.status || 'ativo';

  // Confirmação forte (desligar / reativar desligado): o botão só libera depois de
  // digitar a palavra pedida, para ninguém confirmar por engano.
  function confirmarDigitando({ titulo, corpo, nota, palavra, botao, perigo }) {
    return new Promise(resolve => {
      const ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:300;display:flex;align-items:center;justify-content:center;padding:16px';
      ov.innerHTML = `<div role="dialog" aria-modal="true" style="background:var(--card);border-radius:var(--radius);max-width:460px;width:100%;padding:22px">
        <h3 style="font-size:16px;margin-bottom:10px;color:${perigo ? 'var(--critical)' : 'var(--text)'}">${titulo}</h3>
        <p style="font-size:13px;line-height:1.5;margin-bottom:10px">${corpo}</p>
        <p style="font-size:12px;color:var(--muted);line-height:1.5;margin-bottom:14px">${nota}</p>
        <label style="font-size:12px;display:block;margin-bottom:6px">Para confirmar, digite <b>${palavra}</b>:</label>
        <input type="text" id="dz-input" autocomplete="off" style="width:100%;padding:9px 11px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;margin-bottom:16px">
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button type="button" class="btn btn-outline btn-sm" id="dz-cancel">Cancelar</button>
          <button type="button" class="btn ${perigo ? 'btn-danger' : 'btn-warn'} btn-sm" id="dz-ok" disabled>${botao}</button>
        </div></div>`;
      document.body.appendChild(ov);
      const input = ov.querySelector('#dz-input'), ok = ov.querySelector('#dz-ok');
      const done = v => { ov.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
      const onKey = e => { if (e.key === 'Escape') done(false); };
      document.addEventListener('keydown', onKey);
      input.addEventListener('input', () => { ok.disabled = input.value.trim().toUpperCase() !== palavra; });
      input.addEventListener('keydown', e => { if (e.key === 'Enter' && !ok.disabled) done(true); });
      ov.querySelector('#dz-cancel').addEventListener('click', () => done(false));
      ok.addEventListener('click', () => done(true));
      ov.addEventListener('click', e => { if (e.target === ov) done(false); });
      input.focus();
    });
  }

  function renderAccessList(el, profiles) {
    if (!profiles.length) { el.innerHTML = '<div class="empty"><p>Nenhuma conta cadastrada além da sua.</p></div>'; return; }
    // Ativos primeiro, depois inativos, depois desligados (ordem por nome preservada em cada grupo).
    const rank = { ativo: 0, inativo: 1, desligado: 2 };
    profiles = profiles.slice().sort((a, b) => rank[statusOf(a)] - rank[statusOf(b)]);
    const unidadesFiltro = Array.from(new Set(profiles.flatMap(p => p.unidades || []))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    el.innerHTML = `<div class="acc-filters">
      <input type="search" id="accf-q" placeholder="Buscar por nome ou e-mail" autocomplete="off" value="${U.escapeHtml(accFilter.q)}">
      <select id="accf-perfil"><option value="">Todos os perfis</option>${Object.keys(PERM.PERFIL_LABELS).map(k => `<option value="${k}"${accFilter.perfil === k ? ' selected' : ''}>${PERM.PERFIL_LABELS[k]}</option>`).join('')}</select>
      <select id="accf-status"><option value="">Todos os status</option>${Object.keys(STATUS_LABEL).map(k => `<option value="${k}"${accFilter.status === k ? ' selected' : ''}>${STATUS_LABEL[k]}</option>`).join('')}</select>
      <select id="accf-unidade"><option value="">Todas as unidades</option>${unidadesFiltro.map(u => `<option value="${U.escapeHtml(u)}"${accFilter.unidade === u ? ' selected' : ''}>${U.escapeHtml(u)}</option>`).join('')}</select>
      <button type="button" class="btn btn-outline btn-sm" id="accf-clear">Limpar</button>
      <span class="acc-count" id="accf-count"></span>
    </div>
    <div class="table-wrap"><table class="dt"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Permissões</th><th>Unidades</th><th>Departamentos</th><th></th></tr></thead><tbody>
      ${profiles.map(p => {
        const n = Object.values(p.permissoes || {}).filter(Boolean).length;
        const st = statusOf(p);
        const isSelf = HUB_USER && HUB_USER.id === p.id;
        const tip = st !== 'ativo' && p.status_em ? `${STATUS_LABEL[st]} em ${new Date(p.status_em).toLocaleDateString('pt-BR')}${p.status_por ? ' por ' + p.status_por : ''}` : '';
        const selfAttr = isSelf ? ' disabled title="Você não pode alterar o próprio acesso"' : '';
        return `<tr class="acc-${st}" data-id="${p.id}">
        <td>${U.escapeHtml(p.nome)}</td><td>${U.escapeHtml(p.email)}</td>
        <td><span class="badge b1">${PERM.PERFIL_LABELS[p.perfil] || p.perfil}</span></td>
        <td><span class="badge b-${st}" title="${U.escapeHtml(tip)}">${STATUS_LABEL[st]}</span></td>
        <td>${n} de ${PERM.ALL_KEYS.length}${satisfacaoResumo(p)}</td>
        <td class="acc-scope">${scopeCell(p.unidades, 'Todas')}</td>
        <td class="acc-scope">${scopeCell(p.departamentos, 'Todos')}</td>
        <td class="acc-actions">
          ${st === 'desligado' ? '<button class="btn btn-outline btn-sm" disabled title="Usuário desligado: só é possível visualizar. Reative para editar.">Editar</button>' : `<button class="btn btn-outline btn-sm" data-edit="${p.id}">Editar</button>`}
          ${st === 'ativo' && !isSelf ? `<button class="btn btn-outline btn-sm btn-icon" data-viewas="${p.id}" aria-label="Visualizar como esta conta" title="Visualizar como — ver o Hub como esta conta veria (menu, telas e, melhor esforço, dados recortados por unidade/departamento). Somente leitura.">&#128065;</button>` : ''}
          ${st === 'ativo' ? `<button class="btn btn-warn btn-sm" data-status="${p.id}" data-to="inativo"${selfAttr}>Inativar</button>` : `<button class="btn btn-warn btn-sm" data-status="${p.id}" data-to="ativo"${selfAttr}>Reativar</button>`}
          ${st !== 'desligado' ? `<button class="btn btn-danger btn-sm" data-status="${p.id}" data-to="desligado"${selfAttr}>Desligar</button>` : ''}
        </td>
      </tr>`;
      }).join('')}
    <tr id="accf-none" hidden><td colspan="8" style="text-align:center;color:var(--muted);padding:18px">Nenhuma conta encontrada com esses filtros.</td></tr>
    </tbody></table></div>`;
    const byId = new Map(profiles.map(p => [p.id, p]));
    const applyFilters = () => {
      const q = U.normalizeText(accFilter.q).trim();
      let shown = 0;
      el.querySelectorAll('tbody tr[data-id]').forEach(tr => {
        const p = byId.get(tr.dataset.id);
        const okQ = !q || U.normalizeText(p.nome + ' ' + p.email).includes(q);
        const okPerfil = !accFilter.perfil || p.perfil === accFilter.perfil;
        const okStatus = !accFilter.status || statusOf(p) === accFilter.status;
        // Conta sem unidades cadastradas enxerga todas, então também aparece ao filtrar uma unidade.
        const okUn = !accFilter.unidade || !(p.unidades || []).length || p.unidades.includes(accFilter.unidade);
        const ok = okQ && okPerfil && okStatus && okUn;
        tr.hidden = !ok;
        if (ok) shown++;
      });
      el.querySelector('#accf-none').hidden = shown > 0;
      el.querySelector('#accf-count').textContent = shown === profiles.length ? `${profiles.length} contas` : `${shown} de ${profiles.length} contas`;
    };
    el.querySelector('#accf-q').addEventListener('input', e => { accFilter.q = e.target.value; applyFilters(); });
    el.querySelector('#accf-perfil').addEventListener('change', e => { accFilter.perfil = e.target.value; applyFilters(); });
    el.querySelector('#accf-status').addEventListener('change', e => { accFilter.status = e.target.value; applyFilters(); });
    el.querySelector('#accf-unidade').addEventListener('change', e => { accFilter.unidade = e.target.value; applyFilters(); });
    el.querySelector('#accf-clear').addEventListener('click', () => {
      Object.assign(accFilter, { q: '', perfil: '', status: '', unidade: '' });
      el.querySelector('#accf-q').value = '';
      ['perfil', 'status', 'unidade'].forEach(k => { el.querySelector('#accf-' + k).value = ''; });
      applyFilters();
    });
    applyFilters();
    el.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
      const p = profiles.find(x => x.id === b.dataset.edit);
      editingProfile = p;
      renderAccessForm(document.getElementById('acc-form-card'));
      document.getElementById('acc-form-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }));
    el.querySelectorAll('[data-viewas]').forEach(b => b.addEventListener('click', () => {
      const p = profiles.find(x => x.id === b.dataset.viewas);
      window.HUB_VIEW_AS && window.HUB_VIEW_AS.enter(p);
    }));
    el.querySelectorAll('[data-status]').forEach(b => b.addEventListener('click', async () => {
      const p = profiles.find(x => x.id === b.dataset.status);
      const to = b.dataset.to;
      const from = statusOf(p);
      const nome = U.escapeHtml(p.nome);
      if (to === 'desligado') {
        if (!(await confirmarDigitando({
          titulo: 'Confirmar desligamento', perigo: true, palavra: 'DESLIGAR', botao: 'Desligar usuário',
          corpo: `Você está desligando <b>${nome}</b>. A pessoa perde <b>imediatamente</b> o acesso ao Hub Sfera e a todos os dados.`,
          nota: 'O cadastro e as permissões ficam guardados como <b>Desligado</b> (nada é apagado). Enquanto estiver desligado, o cadastro não pode ser editado.'
        }))) return;
      } else if (to === 'ativo' && from === 'desligado') {
        if (!(await confirmarDigitando({
          titulo: 'Confirmar reativação', perigo: false, palavra: 'REATIVAR', botao: 'Reativar usuário',
          corpo: `<b>${nome}</b> está <b>desligado(a)</b>. Ao reativar, a pessoa volta a entrar no Hub Sfera <b>imediatamente</b>, com as mesmas permissões que tinha antes.`,
          nota: 'Confirme que a reativação foi autorizada (ex.: recontratação). Depois de reativado, o cadastro volta a poder ser editado.'
        }))) return;
      } else {
        const msg = to === 'ativo'
          ? `Reativar o acesso de ${p.nome} ao Hub Sfera? A pessoa volta a entrar com as mesmas permissões de antes.`
          : `Inativar o acesso de ${p.nome} ao Hub Sfera? A pessoa deixa de conseguir entrar e de ver dados, mas o cadastro fica guardado e pode ser reativado depois.`;
        if (!confirm(msg)) return;
      }
      b.disabled = true;
      try {
        await HUB_DAL.setProfileStatus(p.id, to);
        if (to === 'desligado' && editingProfile && editingProfile.id === p.id) editingProfile = null;
        render(document.getElementById('sec-adm-usuarios'));
      }
      catch (err) {
        b.disabled = false;
        alert('Erro ao alterar o status: ' + err.message + (/status/i.test(err.message) ? '\n\nRode supabase-usuarios-inativar.sql no Supabase primeiro.' : ''));
      }
    }));
  }

  // "..._completo" (Headcount/Organograma/Satisfação), o Controle de
  // Desligamento e a participação da Pesquisa de Satisfação são extensão da
  // permissão principal acima na lista — não itens independentes.
  function isSubPerm(key) {
    return /_completo$/.test(key) || key === 'indicadores.controle_desligamento' || key === 'indicadores.satisfacao_participacao';
  }

  // Nota entre parênteses no rótulo (ex.: "(Dados Sigilosos)") sempre vira
  // ícone (i) com o texto completo no tooltip — o rótulo em si fica curto,
  // pra não poluir a lista.
  function permChk(it, p) {
    const m = it.label.match(/^(.*?)\s*\((.*)\)$/);
    const curto = m ? m[1] : it.label;
    const nota = m ? m[2] : '';
    const checked = p.permissoes && p.permissoes[it.key] ? 'checked' : '';
    const notaHtml = nota ? ` <span class="perm-info" title="${U.escapeHtml(nota)}">&#9432;</span>` : '';
    return `<label class="chk" style="width:100%"><input type="checkbox" data-perm="${it.key}" ${checked}><span>${curto}</span>${notaHtml}</label>`;
  }

  // Agrupa cada permissão "pai" com as sub-opções logo abaixo dela (na ordem
  // do catálogo) numa moldura só, pra ficar visualmente óbvio que uma é
  // extensão da outra — em vez de cada checkbox flutuando solto na lista.
  function permGroupHtml(items, p) {
    const blocks = [];
    for (const it of items) {
      if (isSubPerm(it.key) && blocks.length) blocks[blocks.length - 1].subs.push(it);
      else blocks.push({ item: it, subs: [] });
    }
    return blocks.map(b => {
      if (!b.subs.length) return permChk(b.item, p);
      return `<div class="perm-cluster">${permChk(b.item, p)}${b.subs.map(s => `<div class="chk-sub">${permChk(s, p)}</div>`).join('')}</div>`;
    });
  }

  // Na lista de contas: quais áreas da Pesquisa de Satisfação (sigilosa) a conta vê.
  function satisfacaoResumo(p) {
    const perm = p.permissoes || {};
    if (p.perfil !== 'admin' && !perm['indicadores.satisfacao']) return '';
    const txt = p.perfil === 'admin' || perm['indicadores.satisfacao_completo'] ? 'todas as áreas' : ((p.satisfacao_areas || []).join(', ') || 'nenhuma área');
    return `<div style="font-size:10.5px;color:var(--muted);margin-top:2px" title="Pesquisa de Satisfação (dados sigilosos)">&#128274; Satisfação: ${U.escapeHtml(txt)}</div>`;
  }

  // Áreas avaliadas na Pesquisa de Satisfação (checkboxes do campo próprio).
  function satAreasChecks(marcadas, extras) {
    const MS = window.HUB_METRICS_SATISFACAO;
    const base = MS ? MS.ORDEM_AREAS : [];
    const areas = MS ? MS.ordenarAreas(base.concat(marcadas, extras || [])) : Array.from(new Set(base.concat(marcadas, extras || [])));
    return areas.map(a => `<label class="chk"><input type="checkbox" value="${U.escapeHtml(a)}" ${marcadas.includes(a) ? 'checked' : ''}>${U.escapeHtml(a)}</label>`).join('');
  }

  function renderAccessForm(el) {
    const { unidades, departamentosPorUnidade } = orgOptions();
    const colabOpts = colaboradorOptions();
    const isEdit = !!editingProfile;
    const p = editingProfile || { nome: '', email: '', perfil: 'gestor', unidades: [], departamentos: [], permissoes: PERM.presetPermissoes('gestor') };
    const colabAtual = p.colaborador_external_id ? (colabOpts.byExt.get(p.colaborador_external_id) || `ID ${p.colaborador_external_id} (não está na planilha atual)`) : '';
    el.innerHTML = `
      <h3><span class="card-ic">${HUB_ICON('lock')}</span>${isEdit ? 'Editar acesso' : 'Novo acesso'}</h3>
      <form id="acc-form">
        <div class="form-grid">
          <div class="field full"><label>Nome completo</label><input id="acc-nome" required value="${U.escapeHtml(p.nome)}"></div>
          <div class="field"><label>E-mail (login)</label><input id="acc-email" type="email" required value="${U.escapeHtml(p.email)}" ${isEdit ? 'disabled' : ''}></div>
          ${isEdit ? '' : '<div class="field"><label>Senha provisória</label><input id="acc-senha" type="password" minlength="6" required placeholder="mínimo 6 caracteres"></div>'}
          <div class="field full"><label>Colaborador no Feedz (para o organograma)</label>
            <input id="acc-colab" list="acc-colab-list" autocomplete="off" placeholder="Vazio = liga pelo e-mail do login. Digite o nome para buscar" value="${U.escapeHtml(colabAtual)}">
            <datalist id="acc-colab-list">${Array.from(colabOpts.byLabel.keys()).map(l => `<option value="${U.escapeHtml(l)}"></option>`).join('')}</datalist>
            <p class="sub" style="color:var(--muted);font-size:11.5px;margin-top:4px">Quem não tem "Organograma — ver a estrutura completa" vê só o próprio galho: a liderança acima e a equipe abaixo desta pessoa. Deixe vazio se o e-mail do login for o mesmo do Feedz.</p>
          </div>
        </div>

        <label style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Perfil (só um rótulo — aplica um preset de permissões abaixo) <span class="perm-info" title="${U.escapeHtml('Administrador — acesso a tudo, inclusive Cadastro de Acessos e todas as unidades/departamentos. RH — mesmo acesso que o Administrador, exceto Cadastro de Acessos, Entrevistas de Desligamento, Controle de Desligamento e Pesquisa de Clima. Gestor — só as telas de Indicadores marcadas abaixo (mais Parecer do Gestor), e só vê os dados das unidades/departamentos liberados no final deste formulário; 1:1, a visão completa de Organograma/Headcount, Controle de Desligamento e Entrevistas de Desligamento ficam sempre fora do preset. Em todos os casos, o botão só marca as caixas de partida: depois de aplicar, ajuste qualquer uma à vontade — quem controla o acesso de verdade são as caixas marcadas, não o rótulo do perfil.')}">&#9432;</span></label>
        <div class="perm-preset-bar" id="acc-presets">
          ${['admin', 'gestor', 'rh'].map(k => `<button type="button" data-perfil="${k}" class="${p.perfil === k ? 'btn-primary' : ''}" style="${p.perfil === k ? 'background:var(--p1);color:#fff;border-color:var(--p1)' : ''}" title="Aplica ${PERM.PRESETS[k].length} de ${PERM.ALL_KEYS.length} permissões como ponto de partida">${PERM.PERFIL_LABELS[k]} <span style="opacity:.75;font-weight:400">· ${PERM.PRESETS[k].length}/${PERM.ALL_KEYS.length}</span></button>`).join('')}
        </div>

        <label style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Permissões — módulos e funcionalidades liberados</label>
        <p class="sub" style="color:var(--muted);margin:2px 0 8px">Cada linha é uma tela ou recurso. As recuadas (↳) são um "modo ampliado" de quem está logo acima — passe o mouse no <span class="perm-info">&#9432;</span> para entender cada uma.</p>
        <div class="perm-groups" id="acc-perm-groups">
          ${PERM.CATALOG.map(g => `
            <div class="perm-group">
              <h4><span class="perm-ic">${HUB_ICON(g.icon)}</span>${g.groupLabel}</h4>
              ${permGroupHtml(g.items, p).join('')}
            </div>`).join('')}
        </div>

        <div class="form-grid" id="acc-sat-wrap" style="display:none">
          <div class="field full">
            <label>Áreas da Pesquisa de Satisfação que pode ver</label>
            <div class="checks" id="acc-sat-areas">${satAreasChecks(p.satisfacao_areas || [])}</div>
            <p class="sub" style="color:var(--muted);margin-top:6px">Dados sigilosos: a pessoa vê só as notas e os comentários das áreas marcadas, sem a loja de quem respondeu. Com "ver todas as áreas" marcado acima, esta lista não é usada.</p>
          </div>
        </div>

        <div class="form-grid" id="acc-org-wrap">
          <div class="field full">
            <div style="display:flex;align-items:center;justify-content:space-between">
              <label>Unidades liberadas (vazio = todas)</label>
              <span style="font-size:11px"><a href="#" id="acc-unidades-all" style="color:var(--p1)">selecionar todas</a> · <a href="#" id="acc-unidades-none" style="color:var(--muted)">limpar</a></span>
            </div>
            <div class="checks" id="acc-unidades">${unidades.map(u => `<label class="chk"><input type="checkbox" value="${U.escapeHtml(u)}" ${p.unidades.includes(u) ? 'checked' : ''}>${U.escapeHtml(u)}</label>`).join('') || '<span style="font-size:11.5px;color:var(--muted)">Importe a planilha de Colaboradores primeiro.</span>'}</div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px">
              <label>Departamentos liberados (vazio = todos os da unidade marcada)</label>
              <span style="font-size:11px"><a href="#" id="acc-departamentos-all" style="color:var(--p1)">selecionar todos</a> · <a href="#" id="acc-departamentos-none" style="color:var(--muted)">limpar</a></span>
            </div>
            <div class="checks" id="acc-departamentos"></div>
            <p class="sub" style="color:var(--muted);margin-top:6px">Vale para os dois módulos: restringe as linhas de Indicadores e, no Recrutamento, restringe por unidade (ver observação no rodapé).</p>
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:16px">
          <button type="submit" class="btn btn-primary" style="width:auto" id="acc-submit">${isEdit ? 'Salvar alterações' : 'Criar acesso'}</button>
          ${isEdit ? '<button type="button" class="btn btn-outline" id="acc-cancel">Cancelar</button>' : ''}
        </div>
        <div class="msg err" id="acc-msg"></div>
        <p class="sub" style="color:var(--muted);margin-top:10px">No Recrutamento, "unidades liberadas" é comparado com o campo Unidade de cada vaga (ex.: "Boticário - Interior de MG", "Hering") — pode não usar exatamente a mesma lista de nomes que aparece nas planilhas de Indicadores.</p>
      </form>`;

    function checkedUnidades() {
      return Array.from(document.querySelectorAll('#acc-unidades input:checked')).map(i => i.value);
    }
    function renderDepartamentoChecks() {
      const selecionadas = checkedUnidades();
      const depWrap = document.getElementById('acc-departamentos');
      const previamenteMarcados = new Set(Array.from(depWrap.querySelectorAll('input:checked')).map(i => i.value));
      if (!selecionadas.length) {
        depWrap.innerHTML = '<span style="font-size:11.5px;color:var(--muted)">Marque ao menos uma unidade acima pra ver os departamentos dela — deixando sem marcar nenhuma, o acesso vale para todos os departamentos de todas as unidades liberadas.</span>';
        return;
      }
      const deptos = U.uniqueSorted(selecionadas.flatMap(u => departamentosPorUnidade[u] || []));
      depWrap.innerHTML = deptos.length
        ? deptos.map(d => `<label class="chk"><input type="checkbox" value="${U.escapeHtml(d)}" ${(p.departamentos.includes(d) || previamenteMarcados.has(d)) ? 'checked' : ''}>${U.escapeHtml(d)}</label>`).join('')
        : '<span style="font-size:11.5px;color:var(--muted)">Nenhum departamento encontrado para essa(s) unidade(s) na planilha de Colaboradores.</span>';
    }
    document.getElementById('acc-unidades').addEventListener('change', renderDepartamentoChecks);
    renderDepartamentoChecks();

    function setAllChecked(containerId, checked) {
      document.querySelectorAll('#' + containerId + ' input[type=checkbox]').forEach(i => { i.checked = checked; });
    }
    document.getElementById('acc-unidades-all').addEventListener('click', e => { e.preventDefault(); setAllChecked('acc-unidades', true); renderDepartamentoChecks(); });
    document.getElementById('acc-unidades-none').addEventListener('click', e => { e.preventDefault(); setAllChecked('acc-unidades', false); renderDepartamentoChecks(); });
    document.getElementById('acc-departamentos-all').addEventListener('click', e => { e.preventDefault(); setAllChecked('acc-departamentos', true); });
    document.getElementById('acc-departamentos-none').addEventListener('click', e => { e.preventDefault(); setAllChecked('acc-departamentos', false); });

    let perfilAtual = p.perfil;
    document.querySelectorAll('#acc-presets button').forEach(b => b.addEventListener('click', () => {
      perfilAtual = b.dataset.perfil;
      document.querySelectorAll('#acc-presets button').forEach(x => { x.classList.remove('btn-primary'); x.style.background = ''; x.style.color = ''; x.style.borderColor = ''; });
      b.classList.add('btn-primary'); b.style.background = 'var(--p1)'; b.style.color = '#fff'; b.style.borderColor = 'var(--p1)';
      const preset = PERM.presetPermissoes(perfilAtual);
      document.querySelectorAll('#acc-perm-groups input[data-perm]').forEach(chk => { chk.checked = !!preset[chk.dataset.perm]; });
      syncSatWrap();
    }));

    // Pesquisa de Satisfação: a lista de áreas só aparece com a permissão marcada.
    function syncSatWrap() {
      const chk = document.querySelector('#acc-perm-groups input[data-perm="indicadores.satisfacao"]');
      document.getElementById('acc-sat-wrap').style.display = chk && chk.checked ? '' : 'none';
    }
    document.getElementById('acc-perm-groups').addEventListener('change', syncSatWrap);
    syncSatWrap();
    // Áreas novas que já apareceram na pesquisa (fora da lista fixa) entram também.
    if (window.HUB_SATISFACAO) HUB_SATISFACAO.areasConhecidas().then(extras => {
      const box = document.getElementById('acc-sat-areas');
      if (!box) return;
      const marcadas = Array.from(box.querySelectorAll('input:checked')).map(i => i.value);
      box.innerHTML = satAreasChecks(marcadas, extras);
    }).catch(() => {});

    // Sub-opção ("ver todos", Controle de Desligamento) só amplia a permissão
    // de cima: marcar a sub marca a principal, desmarcar a principal desmarca
    // as subs. Sem isso ficavam cadastros com "ver todos" e sem a tela (15
    // contas em 08/10/2026 — ver supabase-permissoes-corrige-completo.sql).
    document.querySelectorAll('#acc-perm-groups .perm-cluster').forEach(cl => {
      const [pai, ...subs] = Array.from(cl.querySelectorAll('input[data-perm]'));
      if (!pai) return;
      subs.forEach(s => s.addEventListener('change', () => { if (s.checked) pai.checked = true; }));
      pai.addEventListener('change', () => { if (!pai.checked) subs.forEach(s => { s.checked = false; }); });
    });

    if (isEdit) document.getElementById('acc-cancel').addEventListener('click', () => { editingProfile = null; renderAccessForm(el); });
    document.getElementById('acc-form').addEventListener('submit', e => submitAccessForm(e, isEdit, () => perfilAtual, colabOpts));
  }

  async function submitAccessForm(e, isEdit, getPerfil, colabOpts) {
    e.preventDefault();
    const msg = document.getElementById('acc-msg');
    msg.style.display = 'none';
    const btn = document.getElementById('acc-submit');
    if (isEdit && editingProfile && (editingProfile.status || 'ativo') === 'desligado') {
      msg.textContent = 'Usuário desligado não pode ser editado. Reative o acesso primeiro.';
      msg.className = 'msg err';
      msg.style.display = 'block';
      return;
    }
    const nome = document.getElementById('acc-nome').value.trim();
    const email = document.getElementById('acc-email').value.trim();
    const perfil = getPerfil();
    const unidades = Array.from(document.querySelectorAll('#acc-unidades input:checked')).map(i => i.value);
    const departamentos = Array.from(document.querySelectorAll('#acc-departamentos input:checked')).map(i => i.value);
    const permissoes = {};
    document.querySelectorAll('#acc-perm-groups input[data-perm]').forEach(chk => { permissoes[chk.dataset.perm] = chk.checked; });

    // Colaborador no Feedz: texto escolhido na lista → ID da Feedz. Um vínculo
    // antigo que não está na planilha atual é mantido se o campo não foi mexido.
    const colabTexto = document.getElementById('acc-colab').value.trim();
    const anterior = isEdit && editingProfile ? (editingProfile.colaborador_external_id || '') : '';
    let colaboradorExt = '';
    if (colabTexto) {
      colaboradorExt = colabOpts.byLabel.get(colabTexto)
        || (anterior && colabTexto === `ID ${anterior} (não está na planilha atual)` ? anterior : '');
      if (!colaboradorExt) {
        msg.textContent = 'Escolha o colaborador na lista (digite parte do nome e clique na opção), ou deixe o campo vazio para ligar pelo e-mail.';
        msg.className = 'msg err';
        msg.style.display = 'block';
        return;
      }
    }
    // Só manda a coluna quando há algo a gravar ou a limpar — assim o cadastro
    // continua funcionando antes de supabase-organograma.sql ter sido rodado.
    const extra = (colaboradorExt || anterior) ? { colaborador_external_id: colaboradorExt || null } : {};

    // Áreas da Pesquisa de Satisfação: idem (coluna criada por supabase-satisfacao.sql).
    // Sem a permissão do módulo, a lista é limpa.
    const satAreas = permissoes['indicadores.satisfacao'] ? Array.from(document.querySelectorAll('#acc-sat-areas input:checked')).map(i => i.value) : [];
    if (permissoes['indicadores.satisfacao'] && !permissoes['indicadores.satisfacao_completo'] && !satAreas.length) {
      msg.textContent = 'Marque ao menos uma área da Pesquisa de Satisfação (ou "ver todas as áreas").';
      msg.className = 'msg err';
      msg.style.display = 'block';
      return;
    }
    const satAnterior = isEdit && editingProfile ? (editingProfile.satisfacao_areas || []) : [];
    if (satAreas.length || satAnterior.length) extra.satisfacao_areas = satAreas;

    btn.disabled = true;
    btn.textContent = 'Salvando...';
    try {
      if (isEdit) {
        await HUB_DAL.upsertProfile(Object.assign({ id: editingProfile.id, email, nome, perfil, unidades, departamentos, permissoes }, extra));
        editingProfile = null;
      } else {
        const senha = document.getElementById('acc-senha').value;
        // O banco só aceita criar login para e-mail autorizado aqui
        // (cadastro_autorizado — ver supabase-seguranca-fase1.sql).
        const { error: autErr } = await sb.from('cadastro_autorizado').upsert({ email: email.trim().toLowerCase(), criado_em: new Date().toISOString() });
        if (autErr) throw new Error('Não foi possível autorizar o e-mail: ' + autErr.message + (/cadastro_autorizado|schema cache/i.test(autErr.message) ? ' — rode supabase-seguranca-fase1.sql no Supabase.' : ''));
        const iso = window.createIsolatedClient();
        const { data, error } = await iso.auth.signUp({ email, password: senha });
        if (error) throw (/database error saving new user/i.test(error.message || '') ? new Error('O banco recusou criar o login deste e-mail (cadastro não autorizado). Tente de novo; se continuar, confira se o e-mail está certo.') : error);
        if (!data.user) throw new Error('Não foi possível criar o login (verifique se a confirmação de e-mail está desativada no Supabase — veja SETUP.md).');
        await HUB_DAL.upsertProfile(Object.assign({ id: data.user.id, email, nome, perfil, unidades, departamentos, permissoes }, extra));
      }
      render(document.getElementById('sec-adm-usuarios'));
    } catch (err) {
      msg.textContent = (err.message || 'Erro ao salvar.') + (/satisfacao_areas/i.test(err.message || '') ? ' — rode supabase-satisfacao.sql no Supabase primeiro.' : '');
      msg.style.display = 'block';
      btn.disabled = false;
      btn.textContent = isEdit ? 'Salvar alterações' : 'Criar acesso';
    }
  }

  window.HUB_ADMIN_USUARIOS = { render };
})();
