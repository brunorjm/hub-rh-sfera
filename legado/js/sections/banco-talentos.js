// Banco de Talentos — candidatos "aproveitáveis" classificados como Banco de
// Talentos em qualquer ponto do processo (etapa RH, resultado final ou tag).
// Porta renderBancoTalentos/renderBancoTalentosTable do Sfera Recruiter
// original (~linhas 6346-6555). Lê window.HUB_RECRUIT_DATA.candidatos/.vagas
// (recarregados pelo app.js sempre que este módulo é aberto — nunca chamar
// HUB_RECRUIT.reload() só para ler, apenas depois de escrever). Mantém
// filtro/busca em estado local (btState), igual ao módulo original —
// ignora o filtro global `f` da barra superior.
(function () {
  const U = HUB_UTILS;
  const { kpi, empty, card } = HUB_UI;

  let btState = { search: '', vaga: 'todas', recrut: 'todos', origem: 'todos', cargoPossivel: 'todos' };

  // Quem gerencia candidatos no Banco de Talentos (excluir/solicitar
  // exclusão). Quem também tem recrutamento.aprovacoes decide sozinho (é o
  // equivalente do antigo isAdmin()); quem só tem recrutamento.banco_talentos
  // manda a exclusão para a fila de Aprovações, igual ao acaoExcluirCandidato
  // original.
  function canManage() { return HUB_PERMISSIONS.hasPerm(HUB_USER, 'recrutamento.banco_talentos'); }
  function canDecideDireto() { return HUB_PERMISSIONS.hasPerm(HUB_USER, 'recrutamento.aprovacoes'); }

  // Mesma lógica de getCandidatosBancoTalentos() original: candidato entra se
  // caiu em Banco de Talentos pela etapa RH, pelo resultado (final) ou por
  // tag — o campo auxiliar origemBT registra de onde veio (pode ser mais de
  // uma origem ao mesmo tempo).
  function getBanco() {
    const candidatos = (window.HUB_RECRUIT_DATA && window.HUB_RECRUIT_DATA.candidatos) || [];
    const lista = [];
    candidatos.forEach(c => {
      const origens = [];
      if (c.resultadoRh === 'Banco de Talentos') origens.push('Etapa RH');
      if (c.resultado === 'Banco de Talentos') origens.push('Resultado Final');
      if (c.resultadoFinal === 'Banco de Talentos') origens.push('Resultado Final');
      if (Array.isArray(c.tags) && c.tags.some(t => String(t).toLowerCase() === 'banco de talentos')) origens.push('Tag');
      if (origens.length) lista.push(Object.assign({}, c, { origemBT: Array.from(new Set(origens)).join(' + ') }));
    });
    lista.sort((a, b) => new Date(b.atualizadoEm || b.criadoEm || 0) - new Date(a.atualizadoEm || a.criadoEm || 0));
    return lista;
  }

  // Mesmos cortes/cores do fitBarHTML original.
  function fitColor(fit) {
    const v = fit || 0;
    if (v >= 80) return '#0F6E56';
    if (v >= 70) return '#1D9E75';
    return '#E24B4A';
  }
  // Mesmos cortes do semaforoCandidato original, com as cores padrão do hub.
  function fitDotColor(fit) {
    const v = fit || 0;
    if (v >= 80) return '#1baf7a';
    if (v >= 60) return 'var(--warning)';
    return 'var(--critical)';
  }

  // Mesma regra do formatTelefoneWhats/linkWhatsApp original: exige pelo
  // menos DDD+número (10 dígitos) e prefixa 55 quando faltar o DDI.
  function whatsLink(tel) {
    const n = String(tel || '').replace(/\D/g, '');
    if (n.length < 10) return '';
    return 'https://wa.me/' + (n.length <= 11 ? '55' + n : n);
  }

  function renderBancoTalentos(el, f) {
    const todos = getBanco();
    const origens = ['Etapa RH', 'Resultado Final', 'Tag'];
    const cargosPossiveisSet = new Set();
    todos.forEach(c => (c.cargosPossiveis || []).forEach(cp => cp && cargosPossiveisSet.add(cp)));
    const cargosPossiveis = U.uniqueSorted(Array.from(cargosPossiveisSet));
    const vagas = (window.HUB_RECRUIT_DATA && window.HUB_RECRUIT_DATA.vagas) || [];
    const recrutadores = HUB_RECRUIT.activeNames('recrutadores');

    const total = todos.length;
    const fitMedio = total ? Math.round(todos.reduce((s, c) => s + (c.fitPct || 0), 0) / total) : 0;
    const fitAlto = todos.filter(c => (c.fitPct || 0) >= 80).length;
    const recrutsSet = new Set(todos.map(c => c.entrevistadoPor).filter(Boolean));

    el.innerHTML = `
      <div class="kpi-grid">
        ${kpi('Total no banco', U.fmtInt(total), 'Candidatos aproveitáveis', 'var(--p1)')}
        ${kpi('FIT médio', fitMedio + '%', 'Média geral do banco', '#1baf7a')}
        ${kpi('FIT ≥ 80%', U.fmtInt(fitAlto), 'Alto potencial', 'var(--p2)')}
        ${kpi('Recrutadores envolvidos', U.fmtInt(recrutsSet.size), 'Distribuição da carteira', '#4a3aa7')}
      </div>
      ${card('Candidatos no banco de talentos', '&#127942;', `
        <div class="toolbar">
          <input type="text" id="bt-search" placeholder="Buscar nome, e-mail, vaga..." value="${U.escapeHtml(btState.search)}">
          <select id="bt-vaga">
            <option value="todas">Todas vagas de origem</option>
            ${vagas.map(v => `<option value="${U.escapeHtml(v.id)}" ${btState.vaga === v.id ? 'selected' : ''}>${U.escapeHtml(v.id)} — ${U.escapeHtml(v.cargo || '')}</option>`).join('')}
          </select>
          <select id="bt-recrut">
            <option value="todos">Todos recrutadores</option>
            ${recrutadores.map(r => `<option value="${U.escapeHtml(r)}" ${btState.recrut === r ? 'selected' : ''}>${U.escapeHtml(r)}</option>`).join('')}
          </select>
          <select id="bt-origem">
            <option value="todos">Todas as origens</option>
            ${origens.map(o => `<option value="${U.escapeHtml(o)}" ${btState.origem === o ? 'selected' : ''}>Origem: ${o}</option>`).join('')}
          </select>
          <select id="bt-cargo">
            <option value="todos">Todos os cargos possíveis</option>
            ${cargosPossiveis.map(c => `<option value="${U.escapeHtml(c)}" ${btState.cargoPossivel === c ? 'selected' : ''}>${U.escapeHtml(c)}</option>`).join('')}
          </select>
        </div>
        <div id="bt-table-wrap"></div>
      `, { full: true })}
    `;

    document.getElementById('bt-search').addEventListener('input', e => { btState.search = e.target.value; renderTable(el); });
    document.getElementById('bt-vaga').addEventListener('change', e => { btState.vaga = e.target.value; renderTable(el); });
    document.getElementById('bt-recrut').addEventListener('change', e => { btState.recrut = e.target.value; renderTable(el); });
    document.getElementById('bt-origem').addEventListener('change', e => { btState.origem = e.target.value; renderTable(el); });
    document.getElementById('bt-cargo').addEventListener('change', e => { btState.cargoPossivel = e.target.value; renderTable(el); });

    renderTable(el);
  }

  function renderTable(el) {
    const wrap = document.getElementById('bt-table-wrap');
    if (!wrap) return;
    let lista = getBanco();

    const s = U.normalizeText(btState.search);
    if (s) lista = lista.filter(c => Object.values(c).some(v => U.normalizeText(v).includes(s)));
    if (btState.vaga !== 'todas') lista = lista.filter(c => c.vagaId === btState.vaga);
    if (btState.recrut !== 'todos') lista = lista.filter(c => c.entrevistadoPor === btState.recrut);
    if (btState.origem !== 'todos') lista = lista.filter(c => (c.origemBT || '').includes(btState.origem));
    if (btState.cargoPossivel !== 'todos') lista = lista.filter(c => (c.cargosPossiveis || []).includes(btState.cargoPossivel));

    if (!lista.length) {
      wrap.innerHTML = empty('Banco de talentos vazio.', 'Nenhum candidato foi classificado como "Banco de Talentos" ainda — classifique candidatos na etapa RH ou no resultado final para que apareçam aqui.');
      return;
    }

    const podeGerenciar = canManage();
    const decisaoDireta = canDecideDireto();

    wrap.innerHTML = `<div class="table-wrap"><table class="dt"><thead><tr>
      <th>Candidato</th><th>Vaga de origem</th><th>Cargo</th><th>Unidade</th><th>Recrutador</th>
      <th>% FIT</th><th>Origem</th><th>Cargos possíveis</th><th>Contato</th><th>Classificado em</th><th></th>
    </tr></thead><tbody>
      ${lista.map(c => {
        const wa = whatsLink(c.contato);
        const v = Math.max(0, Math.min(100, c.fitPct || 0));
        return `<tr>
          <td>
            <div style="display:flex;align-items:center;gap:7px">
              <span class="fit-dot" style="background:${fitDotColor(c.fitPct)}" title="FIT ${v}%"></span>
              ${U.escapeHtml(c.nome || '')}
            </div>
            <div class="sub" style="color:var(--muted);font-size:11px;margin-left:16px">${U.escapeHtml(c.email || '')}</div>
          </td>
          <td>${U.escapeHtml(c.vagaId || '—')}</td>
          <td>${U.escapeHtml(c.cargo || '')}</td>
          <td>${U.escapeHtml(c.unidade || '')}</td>
          <td>${U.escapeHtml(c.entrevistadoPor || '—')}</td>
          <td>
            <div style="display:flex;align-items:center;gap:6px;min-width:120px">
              <div class="fit-bar-track"><div class="fit-bar-fill" style="width:${v}%;background:${fitColor(c.fitPct)}"></div></div>
              <span style="font-size:11px;font-weight:700;color:${fitColor(c.fitPct)}">${v}%</span>
            </div>
          </td>
          <td><span class="badge b1">${U.escapeHtml(c.origemBT)}</span></td>
          <td>${(c.cargosPossiveis || []).length ? `<div class="tag-list">${c.cargosPossiveis.map(cp => `<span class="tag-chip">${U.escapeHtml(cp)}</span>`).join('')}</div>` : '—'}</td>
          <td>${wa ? `<a class="wa-link" href="${wa}" target="_blank" rel="noopener">${U.escapeHtml(c.contato)}</a>` : U.escapeHtml(c.contato || '—')}</td>
          <td>${U.fmtDateBR((c.atualizadoEm || c.criadoEm || '').slice(0, 10))}</td>
          <td style="white-space:nowrap">${podeGerenciar ? `<div class="row-actions"><button class="btn btn-danger btn-sm" data-del="${c.id}">${decisaoDireta ? 'Excluir' : 'Solicitar exclusão'}</button></div>` : ''}</td>
        </tr>`;
      }).join('')}
    </tbody></table></div>`;

    wrap.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => handleExcluir(el, b.dataset.del)));
  }

  // Mesma regra do acaoExcluirCandidato original: quem decide aprovações
  // exclui na hora; quem não decide manda uma solicitação (tipo
  // excluir-candidato) para a fila de Aprovações.
  async function handleExcluir(el, candId) {
    const candidatos = (window.HUB_RECRUIT_DATA && window.HUB_RECRUIT_DATA.candidatos) || [];
    const c = candidatos.find(x => x.id === candId);
    if (!c) return;

    if (canDecideDireto()) {
      if (!confirm(`Excluir definitivamente o candidato ${c.nome} (${c.id})?\n\nEsta ação não pode ser desfeita.`)) return;
      try {
        await HUB_RECRUIT.deleteRow('candidatos', candId);
        await HUB_RECRUIT.logAcao({ acao: 'Exclusão de Candidato', vagaId: c.vagaId, detalhes: `Candidato excluído: ${c.nome} (${c.id})` });
        await HUB_RECRUIT.reload();
        renderBancoTalentos(el, {});
      } catch (err) {
        alert('Erro ao excluir candidato: ' + err.message);
      }
    } else {
      const motivo = prompt(`Solicitar exclusão do candidato ${c.nome} (${c.id}).\n\nInforme o motivo:`);
      if (motivo === null) return;
      try {
        await HUB_RECRUIT.criarSolicitacao({
          tipo: 'excluir-candidato',
          payload: { candidatoId: candId, nome: c.nome, vagaId: c.vagaId },
          descricao: `Excluir candidato ${c.nome} (${c.id}). Motivo: ${motivo || 'não informado'}`
        });
        await HUB_RECRUIT.logAcao({ acao: 'Solicitação Criada', detalhes: `Excluir candidato ${c.nome} (${c.id}) · solicitante: ${(HUB_USER && (HUB_USER.nome || HUB_USER.email)) || 'Desconhecido'}` });
        alert('Solicitação de exclusão enviada para aprovação.');
      } catch (err) {
        alert('Erro ao enviar solicitação: ' + err.message);
      }
    }
  }

  window.HUB_SECTIONS = window.HUB_SECTIONS || {};
  window.HUB_SECTIONS.renderBancoTalentos = renderBancoTalentos;
})();
