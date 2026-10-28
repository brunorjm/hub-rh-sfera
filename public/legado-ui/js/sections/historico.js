// Histórico / Log de ações — porta renderHistorico/renderHistoricoTable do
// Sfera Recruiter original (~linhas 7001-7098), lendo a tabela `historico`
// (auditoria escrita por HUB_RECRUIT.logAcao em todo o hub — vagas.js,
// candidatos.js, aprovacoes.js, admin/cadastros.js etc.).
//
// window.HUB_RECRUIT_DATA não guarda `historico` (só vagas/candidatos/
// entrevistas são recarregados automaticamente pelo app.js) — por isso este
// arquivo busca a lista com HUB_RECRUIT.listHistorico() toda vez que
// renderiza. Diferente do original (que tinha uma lista fixa de tipos de
// ação no <select>), o filtro de "Ação" aqui é montado dinamicamente a
// partir dos valores que realmente aparecem nos dados carregados — mais
// robusto, já que o log é alimentado por várias telas com ações diferentes.
(function () {
  const U = HUB_UTILS;
  const { empty, card } = HUB_UI;

  let histState = { acao: 'todas', vagaId: '', dataIni: '', dataFim: '' };

  function fmtDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  async function renderHistorico(el, f) {
    el.innerHTML = '<div class="empty"><p>Carregando histórico...</p></div>';
    let rows;
    try {
      rows = await HUB_RECRUIT.listHistorico();
    } catch (err) {
      el.innerHTML = `<div class="empty"><p>Erro ao carregar histórico: ${U.escapeHtml(err.message)}</p></div>`;
      return;
    }

    const acoes = U.uniqueSorted(rows.map(r => r.acao));

    el.innerHTML = card(`Histórico de ações (${rows.length})`, '&#128203;', `
      <div class="toolbar">
        <select id="hist-acao">
          <option value="todas">Todos os tipos de ação</option>
          ${acoes.map(a => `<option value="${U.escapeHtml(a)}" ${histState.acao === a ? 'selected' : ''}>${U.escapeHtml(a)}</option>`).join('')}
        </select>
        <input type="text" id="hist-vaga" placeholder="Vaga ID (ex: VAG-2026-001)" value="${U.escapeHtml(histState.vagaId)}">
        <input type="date" id="hist-ini" title="De" value="${U.escapeHtml(histState.dataIni)}">
        <input type="date" id="hist-fim" title="Até" value="${U.escapeHtml(histState.dataFim)}">
      </div>
      <div id="hist-table-wrap"></div>
    `, { full: true });

    document.getElementById('hist-acao').addEventListener('change', e => { histState.acao = e.target.value; renderTable(rows); });
    document.getElementById('hist-vaga').addEventListener('input', e => { histState.vagaId = e.target.value; renderTable(rows); });
    document.getElementById('hist-ini').addEventListener('change', e => { histState.dataIni = e.target.value; renderTable(rows); });
    document.getElementById('hist-fim').addEventListener('change', e => { histState.dataFim = e.target.value; renderTable(rows); });

    renderTable(rows);
  }

  function renderTable(rows) {
    const wrap = document.getElementById('hist-table-wrap');
    if (!wrap) return;
    let data = rows;
    if (histState.acao !== 'todas') data = data.filter(l => l.acao === histState.acao);
    if (histState.vagaId) data = data.filter(l => U.normalizeText(l.vagaId || '').includes(U.normalizeText(histState.vagaId)));
    if (histState.dataIni) data = data.filter(l => (l.timestamp || '').slice(0, 10) >= histState.dataIni);
    if (histState.dataFim) data = data.filter(l => (l.timestamp || '').slice(0, 10) <= histState.dataFim);

    if (!data.length) {
      wrap.innerHTML = empty('Nenhum registro encontrado.', 'Ajuste os filtros para ver o histórico.');
      return;
    }

    wrap.innerHTML = `<div class="table-wrap"><table class="dt"><thead><tr>
      <th>Data/Hora</th><th>Ação</th><th>Vaga ID</th><th>Campo</th><th>Valor anterior</th><th>Novo valor</th><th>Detalhes</th><th>Usuário</th>
    </tr></thead><tbody>
      ${data.map(l => `<tr>
        <td>${fmtDateTime(l.timestamp)}</td>
        <td><span class="badge b1">${U.escapeHtml(l.acao || '')}</span></td>
        <td>${U.escapeHtml(l.vagaId || '—')}</td>
        <td>${U.escapeHtml(l.campo || '—')}</td>
        <td>${U.escapeHtml(l.valorAnterior || '—')}</td>
        <td>${U.escapeHtml(l.valorNovo || '—')}</td>
        <td>${U.escapeHtml(l.detalhes || '—')}</td>
        <td>${U.escapeHtml(l.usuario || '—')}</td>
      </tr>`).join('')}
    </tbody></table></div>`;
  }

  window.HUB_SECTIONS = window.HUB_SECTIONS || {};
  window.HUB_SECTIONS.renderHistorico = renderHistorico;
})();
