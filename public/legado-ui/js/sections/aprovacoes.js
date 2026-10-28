// Aprovações — fila de solicitações (tabela `solicitacoes`) que precisam de
// decisão de quem tem a permissão recrutamento.aprovacoes (equivalente ao
// antigo isAdmin()). Porta renderAprovacoes/decidirSolicitacao +
// aprovarSolicitacao/rejeitarSolicitacao do Sfera Recruiter original
// (~linhas 6555-6810 e 2777-2955).
//
// window.HUB_RECRUIT_DATA.solicitacoes NÃO é recarregado automaticamente
// pelo app.js (só vagas/candidatos/entrevistas são) — por isso este arquivo
// busca a lista com HUB_RECRUIT.listSolicitacoes() toda vez que renderiza,
// em vez de ler HUB_RECRUIT_DATA.
//
// Tipos de solicitação e status usados pelo motor original (ground truth em
// criarSolicitacao/aprovarSolicitacao/rejeitarSolicitacao):
//   status: 'Pendente' | 'Aprovada' | 'Rejeitada'
//   tipo:   'excluir-vaga' | 'excluir-candidato' | 'congelar-vaga' |
//           'cancelar-vaga' | 'transferir-vaga'
// Aprovar não só marca a solicitação como 'Aprovada': também aplica o efeito
// (excluir a vaga/candidato de verdade, mudar o status da vaga, trocar o
// responsável) — isso é portado aqui via HUB_RECRUIT.updateRow/deleteRow,
// espelhando exatamente o que aprovarSolicitacao fazia por tipo. Rejeitar só
// atualiza o status da solicitação, sem efeito colateral.
(function () {
  const U = HUB_UTILS;
  const { kpi, empty, card } = HUB_UI;

  const TIPO_LABELS = {
    'excluir-vaga': 'Excluir Vaga',
    'excluir-candidato': 'Excluir Candidato',
    'congelar-vaga': 'Congelar Vaga',
    'cancelar-vaga': 'Cancelar Vaga',
    'transferir-vaga': 'Transferir Vaga'
  };
  function labelTipo(tipo) { return TIPO_LABELS[tipo] || tipo; }

  function canDecidir() { return HUB_PERMISSIONS.hasPerm(HUB_USER, 'recrutamento.aprovacoes'); }
  function usuarioAtual() { return (HUB_USER && (HUB_USER.nome || HUB_USER.email)) || 'Desconhecido'; }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  async function renderAprovacoes(el, f) {
    el.innerHTML = '<div class="empty"><p>Carregando solicitações...</p></div>';
    let solicitacoes;
    try {
      solicitacoes = await HUB_RECRUIT.listSolicitacoes();
    } catch (err) {
      el.innerHTML = `<div class="empty"><p>Erro ao carregar solicitações: ${U.escapeHtml(err.message)}</p></div>`;
      return;
    }

    const podeDecidir = canDecidir();
    const pendentes = solicitacoes.filter(s => s.status === 'Pendente');
    const decididas = solicitacoes.filter(s => s.status !== 'Pendente').slice(0, 50);

    el.innerHTML = `
      <div class="kpi-grid">
        ${kpi('Pendentes', U.fmtInt(pendentes.length), 'aguardando decisão', pendentes.length ? 'var(--warning)' : '#1baf7a')}
        ${kpi('Aprovadas', U.fmtInt(decididas.filter(s => s.status === 'Aprovada').length), 'últimas 50 decisões', '#1baf7a')}
        ${kpi('Rejeitadas', U.fmtInt(decididas.filter(s => s.status === 'Rejeitada').length), 'últimas 50 decisões', 'var(--critical)')}
      </div>
      ${card(`Pendentes (${pendentes.length})`, '&#9203;', pendentes.length
        ? `<div class="grid2">${pendentes.map(s => cardPendente(s, podeDecidir)).join('')}</div>`
        : empty('Nenhuma solicitação pendente no momento.'), { full: true })}
      ${card(`Histórico de decisões (${decididas.length})`, '&#128203;', decididas.length
        ? tabelaHistorico(decididas)
        : empty('Sem decisões no histórico.'), { full: true })}
    `;

    if (podeDecidir) {
      el.querySelectorAll('[data-aprovar]').forEach(b => b.addEventListener('click', () => decidir(el, f, solicitacoes, b.dataset.aprovar, true)));
      el.querySelectorAll('[data-rejeitar]').forEach(b => b.addEventListener('click', () => decidir(el, f, solicitacoes, b.dataset.rejeitar, false)));
    }
  }

  function cardPendente(s, podeDecidir) {
    return `<div class="card" style="border-left:4px solid var(--warning)">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div style="flex:1">
          <div style="font-weight:700;font-size:14px">${U.escapeHtml(labelTipo(s.tipo))}</div>
          <div class="sub" style="color:var(--muted);font-size:11.5px">${fmtDateTime(s.dataSolicitacao)}</div>
        </div>
        <span class="badge b4">Pendente</span>
      </div>
      <div style="font-size:13px;margin-bottom:8px">${U.escapeHtml(s.descricao || '')}</div>
      <div class="sub" style="color:var(--muted);font-size:11.5px;margin-bottom:12px">
        Solicitado por: <strong>${U.escapeHtml(s.solicitante || '')}</strong>${s.perfilSolicitante ? ` (${U.escapeHtml(s.perfilSolicitante)})` : ''}
      </div>
      ${podeDecidir
        ? `<div class="row-actions">
            <button class="btn btn-primary btn-sm" style="background:#1baf7a" data-aprovar="${s.id}">Aprovar</button>
            <button class="btn btn-danger btn-sm" data-rejeitar="${s.id}">Rejeitar</button>
          </div>`
        : `<div class="sub" style="text-align:center;padding:8px;background:#F7F9FC;border-radius:8px;color:var(--muted);font-size:11.5px">Aguardando decisão</div>`}
    </div>`;
  }

  function tabelaHistorico(lista) {
    return `<div class="table-wrap"><table class="dt"><thead><tr>
      <th>Data/Hora solicitação</th><th>Tipo</th><th>Descrição</th><th>Solicitante</th>
      <th>Status</th><th>Decidido por</th><th>Data decisão</th><th>Observação</th>
    </tr></thead><tbody>
      ${lista.map(s => `<tr>
        <td>${fmtDateTime(s.dataSolicitacao)}</td>
        <td><span class="badge b1">${U.escapeHtml(labelTipo(s.tipo))}</span></td>
        <td>${U.escapeHtml(s.descricao || '')}</td>
        <td>${U.escapeHtml(s.solicitante || '')}</td>
        <td><span class="badge ${s.status === 'Aprovada' ? 'b2' : 'b3'}">${U.escapeHtml(s.status)}</span></td>
        <td>${U.escapeHtml(s.aprovadoPor || '—')}</td>
        <td>${s.dataDecisao ? fmtDateTime(s.dataDecisao) : '—'}</td>
        <td>${U.escapeHtml(s.observacaoAdmin || '—')}</td>
      </tr>`).join('')}
    </tbody></table></div>`;
  }

  async function decidir(el, f, solicitacoes, id, aprovar) {
    if (!canDecidir()) return;
    const s = solicitacoes.find(x => x.id === id);
    if (!s || s.status !== 'Pendente') return;
    const obs = prompt(aprovar ? 'Observação (opcional) — aprovar esta solicitação?' : 'Motivo da rejeição (opcional):') || '';

    try {
      if (aprovar) {
        await aplicarEfeitoAprovacao(s);
        await HUB_RECRUIT.decidirSolicitacao(id, 'Aprovada', obs);
        await HUB_RECRUIT.logAcao({ acao: 'Solicitação Aprovada', detalhes: `${s.descricao} · aprovada por ${usuarioAtual()}` });
        await HUB_RECRUIT.reload();
      } else {
        await HUB_RECRUIT.decidirSolicitacao(id, 'Rejeitada', obs);
        await HUB_RECRUIT.logAcao({ acao: 'Solicitação Rejeitada', detalhes: `${s.descricao} · rejeitada por ${usuarioAtual()}` });
      }
    } catch (err) {
      alert('Erro ao decidir solicitação: ' + err.message);
    }
    renderAprovacoes(el, f);
  }

  // Espelha exatamente o switch(s.tipo) de aprovarSolicitacao no original:
  // cada tipo de solicitação aplica uma mutação diferente em vagas/
  // candidatos, além do log de auditoria correspondente.
  async function aplicarEfeitoAprovacao(s) {
    const p = s.payload || {};
    const vagas = (window.HUB_RECRUIT_DATA && window.HUB_RECRUIT_DATA.vagas) || [];

    if (s.tipo === 'excluir-vaga') {
      await HUB_RECRUIT.deleteRow('vagas', p.vagaId);
      await HUB_RECRUIT.logAcao({ acao: 'Exclusão de Vaga', vagaId: p.vagaId, detalhes: `Vaga excluída: ${p.cargo || ''} (${p.unidade || ''}) · aprovado via solicitação por ${usuarioAtual()}` });

    } else if (s.tipo === 'excluir-candidato') {
      await HUB_RECRUIT.deleteRow('candidatos', p.candidatoId);
      await HUB_RECRUIT.logAcao({ acao: 'Exclusão de Candidato', vagaId: p.vagaId, detalhes: `Candidato excluído: ${p.nome || ''} (${p.candidatoId}) · aprovado via solicitação por ${usuarioAtual()}` });

    } else if (s.tipo === 'congelar-vaga' || s.tipo === 'cancelar-vaga') {
      const vaga = vagas.find(v => v.id === p.vagaId);
      const patch = { status: p.novoStatus };
      if (p.novoStatus === 'Congelado' && !(vaga && vaga.dataCongelamento)) patch.dataCongelamento = U.todayISO();
      if (p.novoStatus === 'Cancelada' && !(vaga && vaga.dataCancelamento)) patch.dataCancelamento = U.todayISO();
      await HUB_RECRUIT.updateRow('vagas', p.vagaId, patch);
      await HUB_RECRUIT.logAcao({ acao: 'Edição de Vaga', vagaId: p.vagaId, campo: 'Status', valorAnterior: vaga ? vaga.status : null, valorNovo: p.novoStatus, detalhes: 'Aprovado via solicitação' });

    } else if (s.tipo === 'transferir-vaga') {
      const vaga = vagas.find(v => v.id === p.vagaId);
      await HUB_RECRUIT.updateRow('vagas', p.vagaId, { responsavel: p.novoRecrutador });
      await HUB_RECRUIT.logAcao({
        acao: 'Transferência', vagaId: p.vagaId, campo: 'Responsável',
        valorAnterior: vaga ? vaga.responsavel : null, valorNovo: p.novoRecrutador,
        detalhes: `Motivo: ${p.motivo || ''}${p.observacao ? ' · ' + p.observacao : ''} · Aprovado via solicitação`
      });
    }
  }

  window.HUB_SECTIONS = window.HUB_SECTIONS || {};
  window.HUB_SECTIONS.renderAprovacoes = renderAprovacoes;
})();
