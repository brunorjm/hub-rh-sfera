// Recrutamento → Candidatos (+ "Novo Candidato"). Portado de
// renderCandidatos/renderCandTable/renderNovoCandidato/renderCandForm do
// Sfera Recruiter original (index.html antigo, ~7153-8436), adaptado às
// convenções do hub: sem Lucide (botões de texto), sem drawer (o cadastro
// troca o conteúdo da seção por um formulário de página inteira, com botão
// "Voltar", igual ao padrão adotado em vagas.js), blocos do formulário
// usam <details class="blk"> nativo em vez do toggleSection() customizado
// do app original.
//
// Campo legado `etapaRH` do app original (v1/v2, sempre 'Agendado(a)' no v3,
// sem nenhum <select> editável e sem coluna correspondente no schema deste
// hub) foi removido daqui — o mesmo dado, só que vivo, já existe no filtro
// "Result. RH" (sobre resultadoRh).
(function () {
  const U = HUB_UTILS;
  const R = HUB_RECRUIT;

  function D() { return window.HUB_RECRUIT_DATA || {}; }

  // Texto exibido/digitado no campo de Vaga (busca com autocompletar via
  // <datalist> — ver renderBody) — precisa ser único por vaga pra servir de
  // chave de busca reversa (texto -> vaga.id) no listener de 'change'.
  function vagaLabel(v) { return `${v.id} — ${v.cargo || ''} (${v.unidade || ''})`; }
  function canWrite() { return HUB_PERMISSIONS.hasPerm(HUB_USER, 'recrutamento.candidatos'); }
  function canApprove() { return HUB_PERMISSIONS.hasPerm(HUB_USER, 'recrutamento.aprovacoes'); }

  // ---- Enums fixos do domínio (fonte: index.html original ~2152-2193) ----
  const STATUS_ETAPA = ['Pendente', 'Em andamento', 'Concluída'];
  const RESULTADO_ETAPA_DETALHE = ['Em andamento', 'Aprovado', 'Reprovado', 'Banco de Talentos'];
  const RESULTADO_FINAL_V2 = ['Aprovado', 'Reprovado', 'Desistente', 'Banco de Talentos'];
  const MOTIVOS_ANALISE = ['Aprovado sem pendências', 'Processo Trabalhista', 'Processo Criminal', 'Restrição Cadastral', 'Documentação Incompleta'];
  const MOTIVOS_CHECAGEM = ['Aprovado sem pendências', 'Aprovado com pendências', 'Reprovado', 'Referências Negativas', 'Referências Positivas'];
  const MOTIVOS_REPROVACAO_FINAL = ['Escala de trabalho', 'Competências técnicas', 'Competências comportamentais', 'Pretensão salarial superior', 'Modalidade de trabalho', 'Falta de identificação com a cultura', 'Aderência ao FIT', 'Processo trabalhista', 'Referências profissionais'];
  const SEGMENTOS_EMPRESA = ['Comércio Varejista', 'Varejo de Beleza', 'Varejo de Moda', 'Tecnologia', 'Alimentação / Food Service', 'Saúde', 'Educação', 'Financeiro / Bancário', 'Indústria', 'Logística / Transporte', 'Telecomunicações', 'Construção Civil', 'Agronegócio', 'Turismo / Hotelaria', 'Serviços Gerais', 'Outro'];
  const GENERO_OPCOES = ['Feminino', 'Masculino', 'Não-binário', 'Prefiro não informar'];
  const FAIXAS_ETARIAS = ['Até 18 anos', '18 a 24 anos', '25 a 34 anos', '35 a 44 anos', '45 a 54 anos', '55 a 64 anos', '65 anos ou mais'];
  const ESCOLARIDADE_OPCOES = ['Ensino Fundamental Incompleto', 'Ensino Fundamental Completo', 'Ensino Médio Incompleto', 'Ensino Médio Completo', 'Ensino Técnico', 'Ensino Superior Incompleto', 'Ensino Superior Completo', 'Pós-graduação', 'Mestrado', 'Doutorado'];
  const TURNOS_ESTUDO = ['Manhã', 'Tarde', 'Noite', 'Integral'];
  const ESTADO_CIVIL_OPCOES = ['Solteiro(a)', 'Casado(a)', 'União Estável', 'Divorciado(a)', 'Viúvo(a)', 'Separado(a)'];
  const QUANTIDADE_FILHOS_OPCOES = Array.from({ length: 10 }, (_, i) => String(i + 1));
  // Dados de transporte para o Onboarding — preenchidos aqui pelo(a)
  // recrutador(a) ao aprovar o candidato (antes ficavam na tela de
  // Onboarding, preenchidos pelo treinador).
  const TIPOS_TRANSPORTE = ['Ônibus', 'Metrô', 'Van/Fretado', 'Aplicativo (Uber/99)', 'Veículo próprio', 'A pé', 'Outro'];

  function recrutadoresAtivos() { return R.activeNames('recrutadores'); }
  function fontesAtivas() { return R.activeNames('fontes_captacao'); }
  function cargosAtivos() { return R.activeNames('cargos'); }

  // ---- Telefone/WhatsApp (portado de formatTelefoneWhats/linkWhatsApp/mascararTelefone, ~2987-3007) ----
  function formatTelefoneWhats(tel) {
    if (!tel) return '';
    const limpo = String(tel).replace(/\D/g, '');
    if (limpo.length < 10) return '';
    return limpo.length <= 11 ? '55' + limpo : limpo;
  }
  function linkWhatsApp(tel) { const n = formatTelefoneWhats(tel); return n ? `https://wa.me/${n}` : ''; }
  function mascararTelefone(valor) {
    const n = String(valor || '').replace(/\D/g, '').slice(0, 11);
    if (n.length === 0) return '';
    if (n.length <= 2) return `(${n}`;
    if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
    if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
    return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  }

  // ---- SLA entre datas (mesma observação de vagas.js: metrics-recrutamento.js
  // não exporta slaEntreDatas, então é reimplementado aqui) ----
  function slaEntreDatas(dContato, dAgendada) {
    if (!dContato || !dAgendada) return null;
    const c = new Date(dContato), a = new Date(dAgendada);
    if (isNaN(c) || isNaN(a)) return null;
    return Math.max(0, Math.round((a - c) / 86400000));
  }
  function frasSLAEtapa(dContato, dAgendada) {
    if (!dContato && !dAgendada) return 'Preencha data de contato e data agendada para calcular o SLA da etapa.';
    if (!dContato) return `Data agendada: ${U.fmtDateBR(dAgendada)} — aguardando data de contato.`;
    if (!dAgendada) return `Contato em ${U.fmtDateBR(dContato)} — aguardando data agendada.`;
    const sla = slaEntreDatas(dContato, dAgendada);
    const cor = sla > 7 ? 'var(--critical)' : (sla > 3 ? 'var(--warning)' : 'var(--good)');
    return `Contato em <strong>${U.fmtDateBR(dContato)}</strong> para agendar em <strong>${U.fmtDateBR(dAgendada)}</strong> · <span style="color:${cor};font-weight:700">SLA: ${sla} dia${sla === 1 ? '' : 's'}</span>`;
  }

  // ---- Badges (portados de badgeEtapaCandidato/badgeResultadoFinal, ~3164-3195) ----
  function badgeEtapaCandidato(resultado, resultadosAnteriores) {
    const reprovouAntes = (resultadosAnteriores || []).some(r => r === 'Reprovado' || r === 'Banco de Talentos');
    if (reprovouAntes) return '<span style="color:var(--muted)">—</span>';
    if (!resultado || resultado === 'Em andamento') return '<span class="badge b4">Em andamento</span>';
    if (resultado === 'Aprovado') return '<span class="badge b2">Aprovado</span>';
    if (resultado === 'Reprovado') return '<span class="badge b3">Reprovado</span>';
    if (resultado === 'Banco de Talentos') return '<span class="badge b1">Banco Talentos</span>';
    return `<span class="badge b5">${U.escapeHtml(resultado)}</span>`;
  }
  function badgeResultadoFinal(r) {
    if (!r) return '<span class="badge b1">Em andamento</span>';
    if (r === 'Aprovado') return '<span class="badge b2">Aprovado</span>';
    if (r === 'Reprovado') return '<span class="badge b3">Reprovado</span>';
    if (r === 'Desistente') return '<span class="badge b4">Desistente</span>';
    return `<span class="badge b5">${U.escapeHtml(r)}</span>`;
  }
  function fitBarHTML(fit) {
    const v = Math.max(0, Math.min(100, fit || 0));
    const color = U.fitColor(v);
    return `<div style="display:flex;align-items:center;gap:8px;min-width:120px">
      <div class="fit-bar-track"><div class="fit-bar-fill" style="width:${v}%;background:${color}"></div></div>
      <span style="font-weight:700;color:${color};font-size:11.5px">${v}%</span>
    </div>`;
  }
  function fitDotColor(fit) { return U.fitColor(fit); }

  // ---- Selo de vaga-cota PCD, propagado da vaga vinculada (mesmo símbolo
  // usado em vagas.js) para o nome do candidato, na lista e no formulário ----
  const PCD_SIMBOLO = '<span title="Vaga PCD" style="font-size:14px">&#9855;</span>';
  function pcdBadgeCandidato(c) {
    const vaga = (D().vagas || []).find(v => v.id === c.vagaId);
    return vaga && vaga.cota === 'Sim' && vaga.tipoCota === 'PCD' ? ' ' + PCD_SIMBOLO : '';
  }

  // ---- Modal genérico autocontido (mesmo padrão de abrirModal em vagas.js,
  // duplicado aqui pois cada seção é um IIFE isolado) ----
  function abrirModal(titulo, subtitulo, corpoHTML) {
    const existente = document.getElementById('hub-cd-modal');
    if (existente) existente.remove();
    const modal = document.createElement('div');
    modal.id = 'hub-cd-modal';
    modal.innerHTML = `
      <div data-fechar style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:998"></div>
      <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.3);width:92%;max-width:760px;max-height:85vh;z-index:999;display:flex;flex-direction:column">
        <div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:10px">
          <div><div style="font-size:16px;font-weight:700">${titulo}</div>${subtitulo ? `<div style="font-size:12px;color:var(--muted);margin-top:2px">${subtitulo}</div>` : ''}</div>
          <button data-fechar class="btn btn-outline btn-sm" style="width:auto">Fechar</button>
        </div>
        <div style="padding:18px 22px;overflow-y:auto;flex:1">${corpoHTML}</div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => modal.remove()));
  }

  // ---- Timeline do candidato (portado de eventosProcessoCandidato/
  // resumoCandidatoHTML/openTimelineCandidato, index.html original ~9116-9165) ----
  function eventosProcessoCandidato(c) {
    const eventos = [];
    if (c.criadoEm) eventos.push({ data: c.criadoEm.slice(0, 10), titulo: 'Candidato cadastrado', detalhe: `Vinculado à vaga ${c.vagaId} — ${c.cargo}` });
    if (c.dataEntrevista) eventos.push({ data: c.dataEntrevista, titulo: `Entrevista RH: ${c.resultadoRh || 'Em andamento'}`, detalhe: `Entrevistador: ${c.entrevistadoPor || '—'} · ${c.horarioEntrevista || ''}` });
    if (c.dataAnalise) eventos.push({ data: c.dataAnalise, titulo: `Análise: ${c.resultadoAnalise || 'Em andamento'}`, detalhe: c.motivoAnalise || '' });
    if (c.dataChecagem) eventos.push({ data: c.dataChecagem, titulo: `Checagem: ${c.resultadoChecagem || 'Em andamento'}`, detalhe: c.motivoChecagem || '' });
    if (c.dataTestePratico) eventos.push({ data: c.dataTestePratico, titulo: `Teste prático: ${c.testePratico || '—'}` });
    if (c.dataEntrevistaGestor) eventos.push({ data: c.dataEntrevistaGestor, titulo: `Entrevista Gestor: ${c.entrevistaGestor || c.resultadoGestor || 'Em andamento'}` });
    if (c.dataEntrevistaDiretoria) eventos.push({ data: c.dataEntrevistaDiretoria, titulo: `Entrevista Diretoria: ${c.entrevistaDiretoria || '—'}` });
    if (c.dataFechamento) eventos.push({ data: c.dataFechamento, titulo: `Resultado final: ${c.resultadoFinal || '—'}`, detalhe: c.motivoReprovacao || '' });
    if (c.dataAdmissao) eventos.push({ data: c.dataAdmissao, titulo: 'Admissão realizada', detalhe: 'Candidato admitido' });
    eventos.sort((a, b) => (a.data > b.data ? 1 : -1));
    return eventos;
  }
  function resumoCandidatoHTML(c) {
    const eventos = eventosProcessoCandidato(c);
    return `
      <div style="margin-bottom:14px;padding:12px;background:var(--bg);border-radius:8px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><strong>${U.escapeHtml(c.nome)}</strong>${pcdBadgeCandidato(c)} · <span style="font-family:monospace">${U.escapeHtml(c.id)}</span></div>
        <div style="font-size:12px;color:var(--muted)">Vaga: ${U.escapeHtml(c.vagaId || '—')} — ${U.escapeHtml(c.cargo || '')} (${U.escapeHtml(c.unidade || '')})</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px">E-mail: ${U.escapeHtml(c.email || '—')} · Contato: ${U.escapeHtml(c.contato || '—')} · FIT: ${c.fitPct || 0}%</div>
        ${c.observacoes && c.observacoes.trim() ? `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);font-size:12.5px"><strong>Observações internas:</strong><br>${U.escapeHtml(c.observacoes)}</div>` : ''}
      </div>
      ${eventos.length === 0 ? HUB_UI.empty('Sem eventos registrados ainda.') : `
        <div>${eventos.map(e => `
          <div style="padding:10px 0;border-bottom:1px solid var(--border)">
            <div style="font-weight:700;font-size:13px">${U.escapeHtml(e.titulo)}</div>
            <div style="font-size:11.5px;color:var(--muted);margin-top:2px">${U.fmtDateBR(e.data)}</div>
            ${e.detalhe ? `<div style="font-size:12.5px;margin-top:4px">${U.escapeHtml(e.detalhe)}</div>` : ''}
          </div>
        `).join('')}</div>
      `}`;
  }
  function abrirModalTimelineCandidato(candId) {
    const c = (D().candidatos || []).find(x => x.id === candId);
    if (!c) return;
    abrirModal(`Timeline — ${U.escapeHtml(c.nome)}`, `Candidato ${c.id}`, resumoCandidatoHTML(c));
  }

  function selOpts(arr, val, emptyLabel) {
    return `<option value="">${emptyLabel || '—'}</option>` + arr.map(o => `<option value="${U.escapeHtml(o)}" ${val === o ? 'selected' : ''}>${U.escapeHtml(o)}</option>`).join('');
  }

  // ================================================================
  // Estado do módulo
  // ================================================================
  let listState = {
    search: '', filterVaga: 'todas', filterRecrut: 'todos', filterResultado: 'todos',
    filterResultadoRH: 'todos', filterResultadoAnalise: 'todos', filterResultadoChecagem: 'todos', filterResultadoGestor: 'todos',
    filterDataIni: '', filterDataFim: '', page: 1, pageSize: 10
  };
  let view = 'list'; // 'list' | 'form'
  let rootEl = null;
  let editingCandId = null;
  let candForm = {};
  let salvando = false;

  // `f` (filtro compartilhado da barra superior) é ignorado de propósito —
  // esta é uma tela operacional com seu próprio painel de filtros. Parâmetro
  // mantido só para bater com a assinatura padrão function renderX(el, f).
  function renderCandidatos(el, f) {
    rootEl = el;
    render();
  }
  function render() {
    if (!rootEl) return;
    if (view === 'form') renderFormView(rootEl);
    else renderListView(rootEl);
  }
  async function reloadAndRender() {
    try { await R.reload(); } catch (err) { /* mantém dados antigos na tela mesmo se o reload falhar */ }
    render();
  }

  // ================================================================
  // LISTA
  // ================================================================
  function filtrarCandidatos() {
    let res = (D().candidatos || []).slice();
    const s = listState.search.toLowerCase().trim();
    if (s) res = res.filter(c => Object.values(c).some(v => Array.isArray(v) ? v.join(' ').toLowerCase().includes(s) : String(v || '').toLowerCase().includes(s)));
    if (listState.filterVaga !== 'todas') res = res.filter(c => c.vagaId === listState.filterVaga);
    if (listState.filterRecrut !== 'todos') res = res.filter(c => c.entrevistadoPor === listState.filterRecrut);
    if (listState.filterResultado !== 'todos') {
      res = listState.filterResultado === '__em_andamento__' ? res.filter(c => !c.resultadoFinal) : res.filter(c => c.resultadoFinal === listState.filterResultado);
    }
    if (listState.filterResultadoRH !== 'todos') res = res.filter(c => c.resultadoRh === listState.filterResultadoRH);
    if (listState.filterResultadoAnalise !== 'todos') res = res.filter(c => c.resultadoAnalise === listState.filterResultadoAnalise);
    if (listState.filterResultadoChecagem !== 'todos') res = res.filter(c => c.resultadoChecagem === listState.filterResultadoChecagem);
    if (listState.filterResultadoGestor !== 'todos') res = res.filter(c => c.resultadoGestor === listState.filterResultadoGestor);
    if (listState.filterDataIni) res = res.filter(c => (c.criadoEm || '').slice(0, 10) >= listState.filterDataIni);
    if (listState.filterDataFim) res = res.filter(c => (c.criadoEm || '').slice(0, 10) <= listState.filterDataFim);
    return res;
  }

  function renderListView(el) {
    const all = filtrarCandidatos();
    const total = all.length;
    const totalPages = Math.max(1, Math.ceil(total / listState.pageSize));
    if (listState.page > totalPages) listState.page = totalPages;
    const start = (listState.page - 1) * listState.pageSize;
    const page = all.slice(start, start + listState.pageSize);
    const vagas = D().vagas || [];

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div>
          <h2 style="font-size:16px">Candidatos</h2>
          <p class="sub" style="color:var(--muted);font-size:12px;margin-top:2px">Todos os candidatos cadastrados no processo seletivo</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-outline btn-sm" id="cd-export">Exportar CSV</button>
          ${canWrite() ? '<button class="btn btn-primary btn-sm" id="cd-novo">+ Novo candidato</button>' : ''}
        </div>
      </div>
      <div class="card full">
        <div class="toolbar">
          <input type="text" id="cd-search" placeholder="Buscar candidato, e-mail, vaga..." value="${U.escapeHtml(listState.search)}">
          <select id="cd-f-vaga"><option value="todas">Todas vagas</option>${vagas.map(v => `<option value="${v.id}" ${listState.filterVaga === v.id ? 'selected' : ''}>${v.id} — ${U.escapeHtml(v.cargo || '')}</option>`).join('')}</select>
          <select id="cd-f-recrut"><option value="todos">Todos recrutadores</option>${recrutadoresAtivos().map(r => `<option value="${U.escapeHtml(r)}" ${listState.filterRecrut === r ? 'selected' : ''}>${U.escapeHtml(r)}</option>`).join('')}</select>
          <select id="cd-f-resultado">
            <option value="todos">Todos resultados finais</option>
            <option value="__em_andamento__" ${listState.filterResultado === '__em_andamento__' ? 'selected' : ''}>Em andamento</option>
            ${RESULTADO_FINAL_V2.map(r => `<option value="${r}" ${listState.filterResultado === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
          <select id="cd-f-rh"><option value="todos">Result. RH: todos</option>${RESULTADO_ETAPA_DETALHE.map(r => `<option value="${r}" ${listState.filterResultadoRH === r ? 'selected' : ''}>RH: ${r}</option>`).join('')}</select>
          <select id="cd-f-anal"><option value="todos">Result. Análise: todos</option>${RESULTADO_ETAPA_DETALHE.map(r => `<option value="${r}" ${listState.filterResultadoAnalise === r ? 'selected' : ''}>Análise: ${r}</option>`).join('')}</select>
          <select id="cd-f-check"><option value="todos">Result. Checagem: todos</option>${RESULTADO_ETAPA_DETALHE.map(r => `<option value="${r}" ${listState.filterResultadoChecagem === r ? 'selected' : ''}>Checagem: ${r}</option>`).join('')}</select>
          <select id="cd-f-gest"><option value="todos">Result. Gestor: todos</option>${RESULTADO_ETAPA_DETALHE.map(r => `<option value="${r}" ${listState.filterResultadoGestor === r ? 'selected' : ''}>Gestor: ${r}</option>`).join('')}</select>
          <input type="date" id="cd-f-ini" value="${listState.filterDataIni}" title="Cadastro - de">
          <input type="date" id="cd-f-fim" value="${listState.filterDataFim}" title="Cadastro - até">
        </div>
        ${page.length === 0 ? HUB_UI.empty('Nenhum candidato encontrado.', 'Ajuste os filtros ou cadastre um novo candidato.') : `
        <div class="table-wrap"><table class="dt">
          <thead><tr>
            <th>ID</th><th>Candidato</th><th>Vaga</th><th>Cargo</th><th>Unidade</th><th>Recrutador</th><th>% FIT</th>
            <th>Etapa RH</th><th>Etapa Análise</th><th>Etapa Checagem</th><th>Etapa Gestor</th><th>Resultado Final</th><th>Contato</th><th></th>
          </tr></thead>
          <tbody>
            ${page.map(c => {
              const rRH = c.resultadoRh || '', rAnal = c.resultadoAnalise || '', rCheck = c.resultadoChecagem || '', rGest = c.resultadoGestor || '';
              const wa = linkWhatsApp(c.contato);
              return `<tr>
                <td>${U.escapeHtml(c.id)}</td>
                <td><span class="fit-dot" style="background:${fitDotColor(c.fitPct)}"></span> ${U.escapeHtml(c.nome || '')}${pcdBadgeCandidato(c)}</td>
                <td>${U.escapeHtml(c.vagaId || '')}</td>
                <td>${U.escapeHtml(c.cargo || '')}</td>
                <td>${U.escapeHtml(c.unidade || '')}</td>
                <td>${U.escapeHtml(c.entrevistadoPor || '—')}</td>
                <td>${fitBarHTML(c.fitPct)}</td>
                <td>${badgeEtapaCandidato(rRH, [])}</td>
                <td>${badgeEtapaCandidato(rAnal, [rRH])}</td>
                <td>${badgeEtapaCandidato(rCheck, [rRH, rAnal])}</td>
                <td>${badgeEtapaCandidato(rGest, [rRH, rAnal, rCheck])}</td>
                <td>${badgeResultadoFinal(c.resultadoFinal)}</td>
                <td>${U.escapeHtml(c.contato || '—')} ${wa ? `<a class="wa-link" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</td>
                <td class="row-actions">
                  <button class="btn btn-outline btn-sm" data-editar="${c.id}">${canWrite() ? 'Editar' : 'Ver'}</button>
                  <button class="btn btn-outline btn-sm" data-timeline="${c.id}">Timeline</button>
                  ${canWrite() ? `<button class="btn btn-danger btn-sm" data-excluir="${c.id}">${canApprove() ? 'Excluir' : 'Solicitar exclusão'}</button>` : ''}
                  ${canWrite() && podeEnviarParaOnboarding(c) ? `<button class="btn btn-outline btn-sm" data-onboarding="${c.id}" title="Enviar para Onboarding">Onboarding</button>` : ''}
                  ${candidatoJaEmOnboarding(c.id) ? '<span class="badge b2" title="Já está no Onboarding">Onboarding</span>' : ''}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;flex-wrap:wrap;gap:10px">
          <span style="font-size:12px;color:var(--muted)">Mostrando ${page.length} de ${total} candidato(s)</span>
          <div style="display:flex;gap:6px;align-items:center">
            <button class="btn btn-outline btn-sm" id="cd-prev" ${listState.page === 1 ? 'disabled' : ''}>‹ Anterior</button>
            <span style="font-size:12px">Página ${listState.page} de ${totalPages}</span>
            <button class="btn btn-outline btn-sm" id="cd-next" ${listState.page === totalPages ? 'disabled' : ''}>Próxima ›</button>
          </div>
        </div>`}
      </div>`;
    wireListEvents(el, totalPages);
    U.wireTableTopScroll(el);
  }

  function wireListEvents(el, totalPages) {
    const $ = sel => el.querySelector(sel);
    $('#cd-search').addEventListener('input', e => { listState.search = e.target.value; listState.page = 1; render(); });
    $('#cd-f-vaga').addEventListener('change', e => { listState.filterVaga = e.target.value; listState.page = 1; render(); });
    $('#cd-f-recrut').addEventListener('change', e => { listState.filterRecrut = e.target.value; listState.page = 1; render(); });
    $('#cd-f-resultado').addEventListener('change', e => { listState.filterResultado = e.target.value; listState.page = 1; render(); });
    $('#cd-f-rh').addEventListener('change', e => { listState.filterResultadoRH = e.target.value; listState.page = 1; render(); });
    $('#cd-f-anal').addEventListener('change', e => { listState.filterResultadoAnalise = e.target.value; listState.page = 1; render(); });
    $('#cd-f-check').addEventListener('change', e => { listState.filterResultadoChecagem = e.target.value; listState.page = 1; render(); });
    $('#cd-f-gest').addEventListener('change', e => { listState.filterResultadoGestor = e.target.value; listState.page = 1; render(); });
    $('#cd-f-ini').addEventListener('change', e => { listState.filterDataIni = e.target.value; listState.page = 1; render(); });
    $('#cd-f-fim').addEventListener('change', e => { listState.filterDataFim = e.target.value; listState.page = 1; render(); });
    el.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => openForm(b.dataset.editar)));
    el.querySelectorAll('[data-timeline]').forEach(b => b.addEventListener('click', () => abrirModalTimelineCandidato(b.dataset.timeline)));
    el.querySelectorAll('[data-excluir]').forEach(b => b.addEventListener('click', () => acaoExcluirCandidato(b.dataset.excluir)));
    el.querySelectorAll('[data-onboarding]').forEach(b => b.addEventListener('click', () => enviarParaOnboarding(b.dataset.onboarding)));
    $('#cd-export') && $('#cd-export').addEventListener('click', exportarCandidatosCSV);
    $('#cd-novo') && $('#cd-novo').addEventListener('click', () => openForm(null));
    $('#cd-prev') && $('#cd-prev').addEventListener('click', () => { if (listState.page > 1) { listState.page--; render(); } });
    $('#cd-next') && $('#cd-next').addEventListener('click', () => { if (listState.page < totalPages) { listState.page++; render(); } });
  }

  function exportarCandidatosCSV() {
    const header = ['ID', 'Nome', 'Vaga ID', 'Cargo', 'Unidade', 'Departamento', 'Nível', 'Recrutador', 'Data Entrevista', 'Horário', 'Contato', 'E-mail', '% FIT', 'Resultado RH', 'Motivo Reprovação', 'Resultado Análise', 'Resultado Checagem', 'Resultado Gestor', 'Resultado Final', 'Data Fechamento', 'Fonte', 'Data Admissão', 'Observações'];
    const rows = [header].concat((D().candidatos || []).map(c => [
      c.id, c.nome, c.vagaId, c.cargo, c.unidade, c.departamento, c.nivelVaga, c.entrevistadoPor, c.dataEntrevista, c.horarioEntrevista,
      c.contato, c.email, c.fitPct, c.resultadoRh, c.motivoReprovacao, c.resultadoAnalise, c.resultadoChecagem, c.resultadoGestor,
      c.resultadoFinal, c.dataFechamento, c.fonteCaptacao, c.dataAdmissao, c.observacoes
    ]));
    baixarCSV(`candidatos_${U.todayISO()}.csv`, rows);
  }
  function baixarCSV(filename, rows) {
    const csv = rows.map(r => r.map(v => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ================================================================
  // EXCLUIR (com fila de aprovação — portado de acaoExcluirCandidato)
  // ================================================================
  async function acaoExcluirCandidato(candId) {
    const c = (D().candidatos || []).find(x => x.id === candId);
    if (!c) return;
    if (canApprove()) {
      if (!confirm(`Excluir definitivamente o candidato ${c.nome} (${c.id})?\n\nEsta ação não pode ser desfeita.`)) return;
      try {
        await R.deleteRow('candidatos', candId);
        await R.logAcao({ acao: 'Exclusão de Candidato', vagaId: c.vagaId, detalhes: `Candidato excluído: ${c.nome} (${c.id})` });
      } catch (err) { alert('Erro ao excluir: ' + err.message); return; }
    } else {
      const motivo = prompt(`Solicitar exclusão do candidato ${c.nome} (${c.id}).\n\nInforme o motivo:`);
      if (motivo === null) return;
      try {
        await R.criarSolicitacao({ tipo: 'excluir-candidato', payload: { candidatoId: candId, nome: c.nome, vagaId: c.vagaId }, descricao: `Excluir candidato ${c.nome} (${c.id}). Motivo: ${motivo || 'não informado'}` });
      } catch (err) { alert('Erro ao enviar solicitação: ' + err.message); return; }
      alert('Solicitação de exclusão enviada para aprovação.');
    }
    await reloadAndRender();
  }

  // ================================================================
  // ENVIAR PARA ONBOARDING (portado de candidatoJaEmOnboarding/
  // podeEnviarParaOnboarding/enviarParaOnboarding, ~6840-6897) — só libera
  // quando o candidato foi Aprovado e a vaga dele já foi Finalizada; cria o
  // registro em `onboarding` (lido por Treinamento e Desenvolvimento →
  // Onboarding) e nunca mais aparece disponível pra reenviar depois disso.
  // ================================================================
  function candidatoJaEmOnboarding(candidatoId) {
    return (D().onboarding || []).find(o => o.candidatoId === candidatoId) || null;
  }
  function podeEnviarParaOnboarding(c) {
    if (!c || c.resultadoFinal !== 'Aprovado') return false;
    const vaga = (D().vagas || []).find(v => v.id === c.vagaId);
    if (!vaga || vaga.status !== 'Finalizada') return false;
    return !candidatoJaEmOnboarding(c.id);
  }
  async function enviarParaOnboarding(candidatoId) {
    const c = (D().candidatos || []).find(x => x.id === candidatoId);
    if (!c || !podeEnviarParaOnboarding(c)) { alert('Este candidato não pode ser enviado para onboarding no momento.'); return; }
    if (!confirm(`Enviar ${c.nome} para o Onboarding?`)) return;
    const vaga = (D().vagas || []).find(v => v.id === c.vagaId);
    try {
      await R.insertRow('onboarding', {
        candidatoId: c.id, candidatoNome: c.nome, vagaId: c.vagaId, cargo: c.cargo,
        departamento: c.departamento, unidade: vaga ? vaga.unidade : '', nivelVaga: c.nivelVaga,
        dataPrevistaAdmissao: (vaga && vaga.dataPrevistaAdmissao) || c.dataAdmissao || '',
        status: 'Pendente',
        enviadoPor: (HUB_USER && (HUB_USER.nome || HUB_USER.email)) || 'Desconhecido',
        enviadoEm: new Date().toISOString()
      });
      await R.logAcao({ acao: 'Onboarding', vagaId: c.vagaId, detalhes: `${c.nome} enviado(a) para Onboarding` });
    } catch (err) { alert('Erro ao enviar para onboarding: ' + err.message); return; }
    await reloadAndRender();
  }

  // ================================================================
  // NOVO/EDITAR CANDIDATO — formulário em blocos
  // ================================================================
  function defaultCandForm() {
    return {
      vagaId: '', nome: '', contato: '', email: '', linkedin: '', linkPandape: '',
      dataEntrevista: U.todayISO(), horarioEntrevista: '', fitPct: 0, motivoReprovacao: '',
      motivoAnalise: '', dataAnalise: '', dataChecagem: '',
      testePratico: 'Não aplicável', dataTestePratico: '', entrevistaGestor: '', dataEntrevistaGestor: '',
      entrevistaDiretoria: '', dataEntrevistaDiretoria: '',
      etapaRhStatus: 'Pendente', resultadoRh: 'Em andamento', dataContatoRh: '', dataAgendadaRh: '',
      etapaAnaliseStatus: 'Pendente', resultadoAnalise: 'Em andamento', dataContatoAnalise: '', dataAgendadaAnalise: '',
      etapaChecagemStatus: 'Pendente', resultadoChecagem: 'Em andamento', dataContatoChecagem: '', dataAgendadaChecagem: '',
      etapaGestorStatus: 'Pendente', resultadoGestor: 'Em andamento', dataContatoGestor: '', dataAgendadaGestor: '', horarioGestor: '',
      resultadoFinal: '', resultado: 'Em andamento', dataFechamento: '', fonteCaptacao: '', dataAdmissao: '',
      observacoes: '', tags: [], segmentoUltimaEmpresa: '', genero: '', faixaEtaria: '', distanciaKm: 0,
      escolaridade: '', estuda: '', turnoEstudo: '', cargosPossiveis: [], estadoCivil: '', temFilhos: '', quantidadeFilhos: '',
      tipoTransporte: '', quantidadePassagens: 0, valorTotalTransporte: 0
    };
  }

  function openForm(id) {
    editingCandId = id;
    const defaults = defaultCandForm();
    if (id) {
      const c = (D().candidatos || []).find(x => x.id === id);
      candForm = c ? Object.assign({}, defaults, c) : defaults;
      // Campos como Status da etapa/Resultado mostram um valor padrão só na
      // tela (ex.: "Em andamento") quando vêm null do banco (nunca foram
      // salvos) — sem isso, o <select> aparenta preenchido mas candForm
      // fica vazio de verdade, e o Salvar barra pedindo pra selecionar algo
      // que já parece selecionado.
      for (const k of Object.keys(defaults)) if (candForm[k] === null || candForm[k] === undefined) candForm[k] = defaults[k];
    } else {
      candForm = defaults;
    }
    view = 'form';
    render();
  }

  function computeAutoResultadoFinal(d) {
    const resultados = [d.resultadoRh, d.resultadoAnalise, d.resultadoChecagem, d.resultadoGestor];
    if (resultados.includes('Banco de Talentos')) return 'Banco de Talentos';
    if (resultados.includes('Reprovado')) return 'Reprovado';
    return null;
  }

  function renderFormView(el) {
    const readOnly = !canWrite();
    const titulo = editingCandId ? `${readOnly ? 'Ver' : 'Editar'} candidato ${editingCandId}` : 'Novo Candidato';
    const badgePcd = editingCandId ? pcdBadgeCandidato(candForm) : '';
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div><h2 style="font-size:16px">${U.escapeHtml(titulo)}${badgePcd}</h2><p class="sub" style="color:var(--muted);font-size:12px;margin-top:2px">Cadastre e acompanhe o processo seletivo do candidato</p></div>
        <div style="display:flex;gap:8px">
          ${editingCandId ? '<button class="btn btn-outline btn-sm" id="cf-timeline">Timeline</button>' : ''}
          <button class="btn btn-outline btn-sm" id="cf-voltar">‹ Voltar para a lista</button>
        </div>
      </div>
      <div id="cf-progress"></div>
      <div id="cf-body"></div>
      ${!readOnly ? `<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap">
        <button class="btn btn-outline" id="cf-salvar" style="width:auto">Salvar</button>
        ${!editingCandId ? '<button class="btn btn-outline" id="cf-salvar-novo" style="width:auto">Salvar e novo</button>' : ''}
        <button class="btn btn-primary" id="cf-salvar-voltar" style="width:auto">Salvar e voltar para a lista</button>
      </div>
      <div class="msg err" id="cf-msg"></div>` : ''}
    `;
    el.querySelector('#cf-voltar').addEventListener('click', () => { view = 'list'; render(); });
    const btnTl = el.querySelector('#cf-timeline');
    btnTl && btnTl.addEventListener('click', () => abrirModalTimelineCandidato(editingCandId));
    renderProgress(el);
    renderBody(el, readOnly);
    if (!readOnly) {
      el.querySelector('#cf-salvar').addEventListener('click', () => salvarCandidato(el, 'continuar'));
      const btnNovo = el.querySelector('#cf-salvar-novo');
      btnNovo && btnNovo.addEventListener('click', () => salvarCandidato(el, 'novo'));
      el.querySelector('#cf-salvar-voltar').addEventListener('click', () => salvarCandidato(el, 'lista'));
    }
  }

  function renderProgress(el) {
    const d = candForm;
    const steps = ['Agendado', 'RH', 'Análise', 'Checagem', 'Gestor', 'Proposta', 'Admissão'];
    let idx = 0;
    if (d.resultadoRh && d.resultadoRh !== 'Em andamento') idx = 1;
    if (d.resultadoAnalise && d.resultadoAnalise !== 'Em andamento') idx = Math.max(idx, 2);
    if (d.resultadoChecagem && d.resultadoChecagem !== 'Em andamento') idx = Math.max(idx, 3);
    if (d.resultadoGestor && d.resultadoGestor !== 'Em andamento') idx = Math.max(idx, 4);
    if (d.resultadoFinal === 'Aprovado' && d.dataFechamento) idx = Math.max(idx, 5);
    if (d.dataAdmissao) idx = 6;
    el.querySelector('#cf-progress').innerHTML = `<div class="card full" style="padding:16px 18px;margin-bottom:14px">
      <h4 style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">Progresso do processo seletivo</h4>
      <div class="progress-steps">${steps.map((s, i) => {
        let cls = i < idx ? 'done' : (i === idx ? 'active' : '');
        return `<div class="ps ${cls}"><div class="dot">${i < idx ? '✓' : i + 1}</div><div class="lbl">${s}</div></div>`;
      }).join('')}</div>
    </div>`;
  }

  function renderBody(el, readOnly) {
    const d = candForm;
    const vagasAtivas = (D().vagas || []).filter(v => v.status !== 'Finalizada' && v.status !== 'Cancelada')
      .sort((a, b) => (b.dataAbertura || '').localeCompare(a.dataAbertura || ''));
    const vaga = (D().vagas || []).find(v => v.id === d.vagaId);
    const wa = linkWhatsApp(d.contato);
    const dis = readOnly ? 'disabled' : '';

    let dup = '';
    if (!readOnly && (d.email || d.contato)) {
      const found = (D().candidatos || []).find(c => c.id !== editingCandId && ((d.email && c.email === d.email) || (d.contato && c.contato === d.contato)));
      if (found) dup = `<div class="msg err" style="display:block;margin-bottom:14px">Possível duplicidade: já existe candidato com este e-mail/telefone — ${U.escapeHtml(found.nome)} (${found.id}).</div>`;
    }

    const rhOk = d.resultadoRh === 'Aprovado';
    const analiseOk = rhOk && d.resultadoAnalise === 'Aprovado';
    const checagemOk = analiseOk && d.resultadoChecagem === 'Aprovado';
    const todasAprovadas = rhOk && analiseOk && checagemOk && d.resultadoGestor === 'Aprovado';
    const auto = computeAutoResultadoFinal(d);
    if (auto && d.resultadoFinal !== auto) d.resultadoFinal = auto;
    const finalBloqueado = !!auto || !todasAprovadas;

    el.querySelector('#cf-body').innerHTML = `
      ${dup}
      <details class="blk" open>
        <summary>Dados da Vaga</summary>
        <div class="blk-body">
          <div class="form-grid">
            <div class="field full"><label>Código da Vaga <span class="req">*</span></label>
              <div class="combo-wrap">
                <input type="text" id="cf_vagaId" placeholder="Digite o código, cargo ou unidade..." autocomplete="off" value="${U.escapeHtml(vaga ? vagaLabel(vaga) : '')}" ${dis}>
                <div class="combo-panel" id="cf-vaga-panel" hidden></div>
              </div>
            </div>
            <div class="field"><label>Cargo</label><input value="${vaga ? U.escapeHtml(vaga.cargo || '') : ''}" readonly style="background:var(--bg)"></div>
            <div class="field"><label>Unidade</label><input value="${vaga ? U.escapeHtml(vaga.unidade || '') : ''}" readonly style="background:var(--bg)"></div>
            <div class="field"><label>Departamento</label><input value="${vaga ? U.escapeHtml(vaga.departamento || '') : ''}" readonly style="background:var(--bg)"></div>
            <div class="field"><label>Nível da Vaga</label><input value="${vaga ? U.escapeHtml(vaga.nivelVaga || '') : ''}" readonly style="background:var(--bg)"></div>
          </div>
        </div>
      </details>

      <details class="blk" open>
        <summary>Dados do Candidato</summary>
        <div class="blk-body">
          <div class="form-grid">
            <div class="field full"><label>Nome completo <span class="req">*</span></label><input data-field="nome" value="${U.escapeHtml(d.nome || '')}" placeholder="Ex: Maria da Silva Santos" ${dis}></div>
            <div class="field"><label>E-mail <span class="req">*</span></label><input type="email" data-field="email" value="${U.escapeHtml(d.email || '')}" placeholder="candidato@email.com" ${dis}></div>
            <div class="field"><label>Telefone / WhatsApp <span class="req">*</span></label>
              <div style="display:flex;gap:8px;align-items:center">
                <input type="tel" id="cf_contato" value="${U.escapeHtml(d.contato || '')}" placeholder="(21) 99999-9999" style="flex:1" ${dis}>
                ${wa ? `<a class="wa-link" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
              </div>
            </div>
            <div class="field"><label>LinkedIn <span class="req">*</span></label><input data-field="linkedin" value="${U.escapeHtml(d.linkedin || '')}" placeholder="linkedin.com/in/..." ${dis}></div>
            <div class="field"><label>Link PandaPé <span class="req">*</span></label><input data-field="linkPandape" value="${U.escapeHtml(d.linkPandape || '')}" placeholder="pandape.infojobs.com.br/..." ${dis}></div>
            <div class="field"><label>Fonte de Captação <span class="req">*</span></label><select data-field="fonteCaptacao" ${dis}>${selOpts(fontesAtivas(), d.fonteCaptacao)}</select></div>
            <div class="field"><label>Segmento da Última Empresa <span class="req">*</span></label><select data-field="segmentoUltimaEmpresa" ${dis}>${selOpts(SEGMENTOS_EMPRESA, d.segmentoUltimaEmpresa)}</select></div>
            <div class="field"><label>Gênero <span class="req">*</span></label><select data-field="genero" ${dis}>${selOpts(GENERO_OPCOES, d.genero)}</select></div>
            <div class="field"><label>Faixa Etária <span class="req">*</span></label><select data-field="faixaEtaria" ${dis}>${selOpts(FAIXAS_ETARIAS, d.faixaEtaria)}</select></div>
            <div class="field"><label>Escolaridade <span class="req">*</span></label><select data-field="escolaridade" ${dis}>${selOpts(ESCOLARIDADE_OPCOES, d.escolaridade)}</select></div>
            <div class="field"><label>Está estudando atualmente? <span class="req">*</span></label><select id="cf_estuda" ${dis}>${selOpts(['Sim', 'Não'], d.estuda)}</select></div>
            ${d.estuda === 'Sim' ? `<div class="field"><label>Turno em que estuda <span class="req">*</span></label><select data-field="turnoEstudo" ${dis}>${selOpts(TURNOS_ESTUDO, d.turnoEstudo)}</select></div>` : ''}
            <div class="field"><label>Estado Civil <span class="req">*</span></label><select data-field="estadoCivil" ${dis}>${selOpts(ESTADO_CIVIL_OPCOES, d.estadoCivil)}</select></div>
            <div class="field"><label>Tem filhos? <span class="req">*</span></label><select id="cf_temFilhos" ${dis}>${selOpts(['Sim', 'Não'], d.temFilhos)}</select></div>
            ${d.temFilhos === 'Sim' ? `<div class="field"><label>Quantos filhos? <span class="req">*</span></label><select data-field="quantidadeFilhos" ${dis}>${selOpts(QUANTIDADE_FILHOS_OPCOES, d.quantidadeFilhos)}</select></div>` : ''}
            <div class="field full"><label>Distância de casa até o local da vaga: <strong id="cf_distanciaKmLabel">${d.distanciaKm || 0} km</strong></label>
              <input type="range" min="0" max="100" id="cf_distanciaKm" value="${d.distanciaKm || 0}" style="width:100%" ${dis}>
            </div>
            <div class="field full"><label>Tags</label>
              <div class="tag-list" id="cf_tags_list">${(d.tags || []).map(t => `<span class="tag-chip">${U.escapeHtml(t)} <span class="x" data-rm-tag="${U.escapeHtml(t)}">×</span></span>`).join('')}
                ${!readOnly ? `<input id="cf_newTag" placeholder="+ nova tag" style="max-width:160px">` : ''}
              </div>
            </div>
          </div>
        </div>
      </details>

      <details class="blk" open>
        <summary>Entrevista RH</summary>
        <div class="blk-body">
          <div class="form-grid">
            <div class="field"><label>Entrevistado por <span class="req">*</span></label><select data-field="entrevistadoPor" ${dis}>${selOpts(recrutadoresAtivos(), d.entrevistadoPor || (vaga && vaga.responsavel))}</select></div>
            <div class="field"><label>Data do contato do RH <span class="req">*</span></label><input type="date" id="cf_dataContatoRh" value="${d.dataContatoRh || ''}" ${dis}></div>
            <div class="field"><label>Data da entrevista <span class="req">*</span></label><input type="date" id="cf_dataEntrevista" value="${d.dataEntrevista || ''}" ${dis}></div>
            <div class="field"><label>Horário <span class="req">*</span></label><input type="time" data-field="horarioEntrevista" value="${U.escapeHtml(d.horarioEntrevista || '')}" ${dis}></div>
            <div class="field"><label>FIT Cultural (%) <span class="req">*</span></label>
              <div style="display:flex;align-items:center;gap:10px">
                <input type="range" min="0" max="100" id="cf_fit" value="${d.fitPct || 0}" style="flex:1" ${dis}>
                <span id="cf_fitVal" style="font-weight:700;min-width:42px;text-align:right">${d.fitPct || 0}%</span>
              </div>
            </div>
            <div class="field"><label>Status da etapa <span class="req">*</span></label><select data-field="etapaRhStatus" ${dis}>${selOpts(STATUS_ETAPA, d.etapaRhStatus || 'Pendente', 'Pendente')}</select></div>
            <div class="field"><label>Resultado <span class="req">*</span></label><select id="cf_resultadoRh" ${dis}>${selOpts(RESULTADO_ETAPA_DETALHE, d.resultadoRh || 'Em andamento', 'Em andamento')}</select></div>
            <div class="field full"><div class="sla-note">${frasSLAEtapa(d.dataContatoRh, d.dataEntrevista || d.dataAgendadaRh)}</div></div>
          </div>
        </div>
      </details>

      ${!rhOk ? `<div class="lock-note">Aprove o resultado da <strong>Entrevista RH</strong> para liberar a Etapa Análise Documental.</div>` : renderEtapaBlock('Análise Documental', 'analise', d, dis, {
        contato: 'dataContatoAnalise', agendada: 'dataAgendadaAnalise', etapaStatus: 'etapaAnaliseStatus', resultado: 'resultadoAnalise', motivo: 'motivoAnalise', motivos: MOTIVOS_ANALISE
      }) + (!analiseOk ? `<div class="lock-note">Aprove o resultado da <strong>Análise Documental</strong> para liberar a Etapa Checagem.</div>` :
        renderEtapaBlock('Checagem', 'checagem', d, dis, { contato: 'dataContatoChecagem', agendada: 'dataAgendadaChecagem', etapaStatus: 'etapaChecagemStatus', resultado: 'resultadoChecagem', motivo: 'motivoChecagem', motivos: MOTIVOS_CHECAGEM }) +
        (!checagemOk ? `<div class="lock-note">Aprove o resultado da <strong>Checagem</strong> para liberar a Etapa Entrevista Gestor.</div>` : renderGestorBlock(d, dis)))}

      <details class="blk" open>
        <summary>Resultado Final</summary>
        <div class="blk-body">
          <div class="form-grid">
            <div class="field"><label>Resultado Final ${auto ? '<span class="hint">(preenchido automaticamente)</span>' : (finalBloqueado ? '<span class="hint">(libera quando todas as etapas forem aprovadas)</span>' : '')}</label>
              <select id="cf_resultadoFinal" ${finalBloqueado || readOnly ? 'disabled' : ''} style="${finalBloqueado ? 'background:var(--bg)' : ''}">
                <option value="" ${!d.resultadoFinal ? 'selected' : ''}>— Em andamento</option>
                ${RESULTADO_FINAL_V2.map(o => `<option value="${o}" ${d.resultadoFinal === o ? 'selected' : ''}>${o}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>Data de Fechamento</label><input type="date" data-field="dataFechamento" value="${d.dataFechamento || ''}" ${dis}></div>
            ${d.resultadoFinal === 'Reprovado' ? `<div class="field full"><label>Motivo da Reprovação <span class="req">*</span></label><select data-field="motivoReprovacao" ${dis}>${selOpts(MOTIVOS_REPROVACAO_FINAL, d.motivoReprovacao)}</select></div>` : ''}
          </div>
        </div>
      </details>

      ${d.resultadoFinal === 'Aprovado' ? `<details class="blk" open>
        <summary>Dados de Transporte para o Onboarding</summary>
        <div class="blk-body">
          <p class="sub" style="color:var(--muted);font-size:12px;margin-bottom:10px">Preenchido pelo(a) recrutador(a) ao aprovar o candidato — o treinador do Onboarding usa essa informação, mas não a edita.</p>
          <div class="form-grid">
            <div class="field"><label>Tipo de Transporte <span class="req">*</span></label><select data-field="tipoTransporte" ${dis}>${selOpts(TIPOS_TRANSPORTE, d.tipoTransporte)}</select></div>
            <div class="field"><label>Quantidade de Passagens <span class="req">*</span></label><input type="number" min="0" data-field="quantidadePassagens" value="${d.quantidadePassagens || 0}" ${dis}></div>
            <div class="field"><label>Valor Total em Transporte (R$) <span class="req">*</span></label><input type="number" min="0" step="0.01" data-field="valorTotalTransporte" value="${d.valorTotalTransporte || 0}" ${dis}></div>
          </div>
        </div>
      </details>` : ''}

      ${editingCandId && d.resultadoFinal === 'Aprovado' ? (() => {
        const jaEnviado = candidatoJaEmOnboarding(editingCandId);
        if (jaEnviado) return `<div class="msg ok" style="display:flex;align-items:center;justify-content:space-between;gap:10px"><span>Enviado(a) para Onboarding.</span>${!readOnly ? `<button type="button" class="btn btn-outline btn-sm" id="cf-abrir-onboarding" style="width:auto">Abrir no Treinamento e Desenvolvimento</button>` : ''}</div>`;
        const cAtual = (D().candidatos || []).find(x => x.id === editingCandId) || d;
        if (!readOnly && podeEnviarParaOnboarding(cAtual)) return `<div class="field full"><button type="button" class="btn btn-primary" id="cf-enviar-onboarding" style="width:auto">Enviar para Onboarding</button></div>`;
        return '';
      })() : ''}

      ${d.resultadoFinal === 'Banco de Talentos' ? `<details class="blk" open>
        <summary>Cargos Possíveis</summary>
        <div class="blk-body">
          <div class="field full"><label>Para quais cargos esse candidato é aderente no Banco de Talentos? <span class="req">*</span> <span class="hint">(até 5)</span></label>
            <div class="tag-list" id="cf_cargos_list">${(d.cargosPossiveis || []).map(c => `<span class="tag-chip">${U.escapeHtml(c)} <span class="x" data-rm-cargo="${U.escapeHtml(c)}">×</span></span>`).join('')}
              ${!readOnly && (d.cargosPossiveis || []).length < 5 ? `<select id="cf_newCargoPossivel" style="max-width:220px"><option value="">+ selecionar cargo...</option>${cargosAtivos().filter(c => !(d.cargosPossiveis || []).includes(c)).map(c => `<option value="${U.escapeHtml(c)}">${U.escapeHtml(c)}</option>`).join('')}</select>` : ''}
            </div>
          </div>
        </div>
      </details>` : ''}

      <details class="blk" open>
        <summary>Admissão</summary>
        <div class="blk-body"><div class="form-grid"><div class="field"><label>Data de Admissão</label><input type="date" id="cf_dataAdmissao" value="${d.dataAdmissao || ''}" ${dis}></div></div></div>
      </details>

      <details class="blk" open>
        <summary>Observações Internas</summary>
        <div class="blk-body"><div class="field full"><label>Observações <span class="req">*</span></label><textarea data-field="observacoes" rows="4" placeholder="Observações visíveis apenas para o time de R&amp;S..." ${dis}>${U.escapeHtml(d.observacoes || '')}</textarea></div></div>
      </details>
    `;
    wireBodyEvents(el, readOnly);
  }

  function renderEtapaBlock(titulo, key, d, dis, cfg) {
    return `<details class="blk" open>
      <summary>Etapa ${U.escapeHtml(titulo)} — Agendamento e Resultado</summary>
      <div class="blk-body">
        <div class="form-grid">
          <div class="field"><label>Data de contato <span class="req">*</span></label><input type="date" class="cf-etapa-data" data-etapa="${key}" data-kind="contato" value="${d[cfg.contato] || ''}" ${dis}></div>
          <div class="field"><label>Data agendada <span class="req">*</span></label><input type="date" class="cf-etapa-data" data-etapa="${key}" data-kind="agendada" value="${d[cfg.agendada] || ''}" ${dis}></div>
          <div class="field full"><div class="sla-note" id="cf_sla_${key}">${frasSLAEtapa(d[cfg.contato], d[cfg.agendada])}</div></div>
          <div class="field"><label>Status da etapa <span class="req">*</span></label><select data-field="${cfg.etapaStatus}" ${dis}>${selOpts(STATUS_ETAPA, d[cfg.etapaStatus] || 'Pendente', 'Pendente')}</select></div>
          <div class="field"><label>Resultado <span class="req">*</span></label><select class="cf-etapa-resultado" data-etapa="${key}" data-field="${cfg.resultado}" ${dis}>${selOpts(RESULTADO_ETAPA_DETALHE, d[cfg.resultado] || 'Em andamento', 'Em andamento')}</select></div>
          <div class="field"><label>Detalhamento <span class="req">*</span></label><select data-field="${cfg.motivo}" ${dis}>${selOpts(cfg.motivos, d[cfg.motivo])}</select></div>
        </div>
      </div>
    </details>`;
  }

  // Modelo de parecer que o(a) gestor(a) vai preencher (ver
  // js/pareceres/modelo-*.js e js/sections/parecer-gestor.js) — um registro
  // pendente em `pareceres_gestor` é criado/atualizado assim que o(a)
  // recrutador(a) escolhe o modelo aqui. Uma vez que o(a) gestor(a) já
  // preencheu (status='Preenchido'), o campo trava — mudar o modelo depois
  // disso não faz sentido, o parecer já virou um registro histórico.
  function parecerGestorDoCandidato(candidatoId) {
    const lista = (D()['pareceres_gestor'] || []).filter(p => p.candidatoId === candidatoId);
    return lista.length ? lista[lista.length - 1] : null;
  }
  async function salvarModeloParecer(candidatoId, modelo) {
    const c = (D().candidatos || []).find(x => x.id === candidatoId);
    if (!c) return;
    const existente = parecerGestorDoCandidato(candidatoId);
    try {
      if (existente && existente.status === 'Pendente') {
        await R.updateRow('pareceres_gestor', existente.id, { modelo });
      } else if (!existente) {
        await U.insertWithRetryId('PG', (D()['pareceres_gestor'] || []).map(p => p.id), id => R.insertRow('pareceres_gestor', {
          id, candidatoId: c.id, candidatoNome: c.nome, vagaId: c.vagaId, cargo: c.cargo,
          unidade: c.unidade, departamento: c.departamento, modelo,
          recrutador: (HUB_USER && (HUB_USER.nome || HUB_USER.email)) || 'Desconhecido',
          status: 'Pendente', dados: {}
        }));
      }
    } catch (err) { alert('Erro ao definir o modelo de parecer: ' + err.message); }
    await reloadAndRender();
  }

  // Colaborador (Ativo/Desativado, papel Gestor/Administrador) que corresponde
  // ao Solicitante da vaga — mesmo nome usado pelo select de Solicitante em
  // vagas.js. É pra este e-mail que vai o link público do parecer.
  function colaboradorSolicitanteDaVaga(vagaId) {
    const vaga = (D().vagas || []).find(v => v.id === vagaId);
    if (!vaga || !vaga.solicitante) return null;
    return ((window.HUB_DATA || {}).colaboradores || []).find(c => (c.nome_completo || c.nome) === vaga.solicitante) || null;
  }

  // Botão "Gerar link e enviar por e-mail": cria (uma vez — reaproveita se já
  // existir) um token aleatório em pareceres_gestor.link_token, monta a URL
  // pública (parecer-publico.html?token=...) e abre o cliente de e-mail do(a)
  // próprio(a) recrutador(a) com o link pronto (mailto:, no mesmo molde do
  // link de WhatsApp já usado em candidatos.js/banco-talentos.js — quem
  // efetivamente envia é o(a) recrutador(a), não o Hub Sfera).
  function htmlBotaoLinkParecer(parecer) {
    if (!parecer || parecer.status !== 'Pendente') return '';
    const colaborador = colaboradorSolicitanteDaVaga(parecer.vagaId);
    if (!colaborador || !colaborador.email) {
      return `<div class="field full"><div class="hint">Para enviar o link do parecer por e-mail, defina o <strong>Solicitante</strong> da vaga (com e-mail cadastrado na planilha de Colaboradores).</div></div>`;
    }
    return `<div class="field full">
      <button type="button" class="btn btn-outline btn-sm" id="cf-parecer-link" style="width:auto">Gerar link do parecer e enviar por e-mail (${U.escapeHtml(colaborador.email)})</button>
    </div>`;
  }

  async function gerarEnviarLinkParecer(candidatoId) {
    const parecer = parecerGestorDoCandidato(candidatoId);
    if (!parecer || parecer.status !== 'Pendente') return;
    const colaborador = colaboradorSolicitanteDaVaga(parecer.vagaId);
    if (!colaborador || !colaborador.email) { alert('Defina o Solicitante da vaga (com e-mail na planilha de Colaboradores) antes de gerar o link.'); return; }
    let token = parecer.linkToken;
    if (!token) {
      token = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2));
      try {
        await R.updateRow('pareceres_gestor', parecer.id, { linkToken: token });
        parecer.linkToken = token;
      } catch (err) { alert('Erro ao gerar o link: ' + err.message); return; }
    }
    const link = new URL('parecer-publico.html?token=' + encodeURIComponent(token), location.href).href;
    const nomeColab = colaborador.nome_completo || colaborador.nome || '';
    const assunto = `Parecer do Gestor pendente — ${parecer.candidatoNome || ''} (${parecer.cargo || ''})`;
    const corpo = `Olá${nomeColab ? ', ' + nomeColab : ''}!\n\nVocê tem um parecer de gestor pendente para o(a) candidato(a) ${parecer.candidatoNome || ''} (${parecer.cargo || ''}).\n\nAcesse o link abaixo para preencher:\n${link}\n\nEste link é pessoal e de uso único — não repasse para outras pessoas.\n\nAtenciosamente,\nRecrutamento & Seleção`;
    const mailto = `mailto:${colaborador.email}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
    const a = document.createElement('a');
    a.href = mailto; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    try { await navigator.clipboard.writeText(link); } catch (e) { /* clipboard indisponível — o link já foi incluído no e-mail aberto */ }
  }

  function renderGestorBlock(d, dis) {
    const parecer = editingCandId ? parecerGestorDoCandidato(editingCandId) : null;
    const modelos = Object.values(window.HUB_PARECER_MODELOS || {});
    const modeloTravado = !!(parecer && parecer.status === 'Preenchido');
    return `<details class="blk" open>
      <summary>Etapa Entrevista Gestor — Agendamento e Resultado</summary>
      <div class="blk-body">
        <div class="form-grid">
          <div class="field"><label>Data de contato <span class="req">*</span></label><input type="date" class="cf-etapa-data" data-etapa="gestor" data-kind="contato" value="${d.dataContatoGestor || ''}" ${dis}></div>
          <div class="field"><label>Data agendada <span class="req">*</span></label><input type="date" class="cf-etapa-data" data-etapa="gestor" data-kind="agendada" value="${d.dataAgendadaGestor || ''}" ${dis}></div>
          <div class="field"><label>Horário <span class="req">*</span></label><input type="time" data-field="horarioGestor" value="${U.escapeHtml(d.horarioGestor || '')}" ${dis}></div>
          <div class="field full"><div class="sla-note" id="cf_sla_gestor">${frasSLAEtapa(d.dataContatoGestor, d.dataAgendadaGestor)}</div></div>
          <div class="field"><label>Status da etapa <span class="req">*</span></label><select data-field="etapaGestorStatus" ${dis}>${selOpts(STATUS_ETAPA, d.etapaGestorStatus || 'Pendente', 'Pendente')}</select></div>
          <div class="field"><label>Resultado <span class="req">*</span></label><select class="cf-etapa-resultado" data-etapa="gestor" data-field="resultadoGestor" ${dis}>${selOpts(RESULTADO_ETAPA_DETALHE, d.resultadoGestor || 'Em andamento', 'Em andamento')}</select></div>
          ${editingCandId ? `<div class="field full"><label>Modelo de parecer que o(a) gestor(a) vai preencher ${modeloTravado ? '<span class="hint">(já preenchido — não pode trocar)</span>' : ''}</label>
            <select id="cf-modelo-parecer" ${dis || modeloTravado ? 'disabled' : ''}>
              <option value="">Selecione o modelo...</option>
              ${modelos.map(m => `<option value="${m.id}" ${parecer && parecer.modelo === m.id ? 'selected' : ''}>${U.escapeHtml(m.nome)}</option>`).join('')}
            </select>
            ${parecer ? `<div class="hint" style="margin-top:4px">Status do parecer: ${parecer.status === 'Preenchido' ? 'Preenchido' : 'Pendente — já aparece na tela Parecer do Gestor'}</div>` : ''}
          </div>${!dis ? htmlBotaoLinkParecer(parecer) : ''}` : `<div class="field full"><div class="hint">Salve o candidato antes de escolher o modelo de parecer.</div></div>`}
        </div>
      </div>
    </details>`;
  }

  const ETAPA_FIELD_MAP = {
    analise: { contato: 'dataContatoAnalise', agendada: 'dataAgendadaAnalise' },
    checagem: { contato: 'dataContatoChecagem', agendada: 'dataAgendadaChecagem' },
    gestor: { contato: 'dataContatoGestor', agendada: 'dataAgendadaGestor' }
  };

  function wireBodyEvents(el, readOnly) {
    const d = candForm;
    if (readOnly) return;

    // Campos simples: atualizam candForm sem re-renderizar (preserva foco/cursor).
    // Exclui .cf-etapa-resultado, que já tem um listener próprio mais abaixo
    // (precisa re-renderizar pra liberar/bloquear a etapa seguinte).
    el.querySelectorAll('[data-field]:not(.cf-etapa-resultado)').forEach(inp => {
      const ev = inp.tagName === 'SELECT' ? 'change' : 'input';
      inp.addEventListener(ev, () => { d[inp.dataset.field] = inp.value; });
    });

    // Vaga: combobox próprio (não <datalist> nativo — a lista de sugestões
    // do navegador trava numa largura curta e corta o título da vaga, sem
    // nenhum controle via CSS; ver .combo-panel no index.html) com busca por
    // código, cargo ou unidade enquanto digita, ordenado por Data de
    // Abertura (mais recente primeiro). Recalculado aqui (não reaproveitado
    // de renderBody) — wireBodyEvents roda numa closure separada, sem acesso
    // às consts locais de lá.
    const vagaInp = el.querySelector('#cf_vagaId');
    const vagaPanel = el.querySelector('#cf-vaga-panel');
    if (vagaInp && vagaPanel) {
      const vagasOrdenadas = (D().vagas || []).filter(x => x.status !== 'Finalizada' && x.status !== 'Cancelada')
        .sort((a, b) => (b.dataAbertura || '').localeCompare(a.dataAbertura || ''));
      const renderPainel = termo => {
        const t = U.normalizeText(termo || '');
        const filtradas = t ? vagasOrdenadas.filter(v => U.normalizeText(vagaLabel(v)).includes(t)) : vagasOrdenadas;
        vagaPanel.innerHTML = filtradas.length
          ? filtradas.slice(0, 50).map(v => `<div class="combo-opt" data-id="${U.escapeHtml(v.id)}">${U.escapeHtml(vagaLabel(v))}</div>`).join('')
          : '<div class="combo-empty">Nenhuma vaga encontrada.</div>';
      };
      vagaInp.addEventListener('focus', () => { renderPainel(''); vagaPanel.hidden = false; vagaInp.select(); });
      vagaInp.addEventListener('input', () => { renderPainel(vagaInp.value); vagaPanel.hidden = false; });
      // mousedown (não click) + preventDefault: sem isso, o blur do campo
      // (abaixo) fecha o painel antes do clique na opção terminar de disparar.
      vagaPanel.addEventListener('mousedown', e => {
        const opt = e.target.closest('.combo-opt');
        if (!opt) return;
        e.preventDefault();
        const v = vagasOrdenadas.find(x => x.id === opt.dataset.id);
        if (!v) return;
        d.vagaId = v.id;
        if (!d.entrevistadoPor) d.entrevistadoPor = v.responsavel;
        if (!d.fonteCaptacao) d.fonteCaptacao = v.fonte;
        vagaPanel.hidden = true;
        renderBody(el, readOnly);
      });
      vagaInp.addEventListener('blur', () => {
        vagaPanel.hidden = true;
        const atual = (D().vagas || []).find(x => x.id === d.vagaId);
        vagaInp.value = atual ? vagaLabel(atual) : '';
      });
      vagaInp.addEventListener('keydown', e => { if (e.key === 'Escape') vagaInp.blur(); });
    }

    // Telefone com máscara + botão WhatsApp
    const contatoInp = el.querySelector('#cf_contato');
    contatoInp && contatoInp.addEventListener('input', () => {
      contatoInp.value = mascararTelefone(contatoInp.value);
      d.contato = contatoInp.value;
    });
    contatoInp && contatoInp.addEventListener('change', () => renderBody(el, readOnly));

    // FIT slider: atualiza valor exibido sem re-renderizar
    const fitInp = el.querySelector('#cf_fit');
    fitInp && fitInp.addEventListener('input', () => {
      d.fitPct = parseInt(fitInp.value, 10);
      el.querySelector('#cf_fitVal').textContent = fitInp.value + '%';
    });

    // Distância slider
    const distInp = el.querySelector('#cf_distanciaKm');
    distInp && distInp.addEventListener('input', () => {
      d.distanciaKm = parseInt(distInp.value, 10);
      el.querySelector('#cf_distanciaKmLabel').textContent = distInp.value + ' km';
    });

    // estuda / temFilhos: precisam re-renderizar para mostrar/esconder campo dependente
    const estudaSel = el.querySelector('#cf_estuda');
    estudaSel && estudaSel.addEventListener('change', () => { d.estuda = estudaSel.value; renderBody(el, readOnly); });
    const filhosSel = el.querySelector('#cf_temFilhos');
    filhosSel && filhosSel.addEventListener('change', () => { d.temFilhos = filhosSel.value; renderBody(el, readOnly); });

    // Tags
    const newTag = el.querySelector('#cf_newTag');
    newTag && newTag.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const v = newTag.value.trim();
      if (v) { d.tags = d.tags || []; if (!d.tags.includes(v)) d.tags.push(v); renderBody(el, readOnly); }
    });
    el.querySelectorAll('[data-rm-tag]').forEach(x => x.addEventListener('click', () => {
      d.tags = (d.tags || []).filter(t => t !== x.dataset.rmTag); renderBody(el, readOnly);
    }));

    // Cargos possíveis (Banco de Talentos)
    const newCargo = el.querySelector('#cf_newCargoPossivel');
    newCargo && newCargo.addEventListener('change', () => {
      if (!newCargo.value) return;
      d.cargosPossiveis = d.cargosPossiveis || [];
      if (d.cargosPossiveis.length < 5 && !d.cargosPossiveis.includes(newCargo.value)) d.cargosPossiveis.push(newCargo.value);
      renderBody(el, readOnly);
    });
    el.querySelectorAll('[data-rm-cargo]').forEach(x => x.addEventListener('click', () => {
      d.cargosPossiveis = (d.cargosPossiveis || []).filter(c => c !== x.dataset.rmCargo); renderBody(el, readOnly);
    }));

    // Datas de contato/agendada por etapa (RH + Análise/Checagem/Gestor): valida
    // ordem, atualiza nota de SLA. RH usa ids próprios (dataContatoRh/dataEntrevista)
    // por herdar o layout do app original; as demais usam a classe genérica.
    const dContatoRH = el.querySelector('#cf_dataContatoRh'), dEntrevista = el.querySelector('#cf_dataEntrevista');
    function syncRHSla() {
      d.dataContatoRh = dContatoRH.value; d.dataEntrevista = dEntrevista.value; d.dataAgendadaRh = dEntrevista.value;
      // Bloco RH é sempre o primeiro .sla-note do formulário (os blocos de
      // Análise/Checagem/Gestor só existem depois que a etapa anterior é
      // aprovada — ver renderBody).
      const slaEls = el.querySelectorAll('.sla-note');
      if (slaEls[0]) slaEls[0].innerHTML = frasSLAEtapa(d.dataContatoRh, d.dataEntrevista);
    }
    dContatoRH && dContatoRH.addEventListener('change', syncRHSla);
    dEntrevista && dEntrevista.addEventListener('change', syncRHSla);

    el.querySelectorAll('.cf-etapa-data').forEach(inp => inp.addEventListener('change', () => {
      const etapa = inp.dataset.etapa, kind = inp.dataset.kind;
      const map = ETAPA_FIELD_MAP[etapa];
      if (!map) return;
      const field = kind === 'contato' ? map.contato : map.agendada;
      d[field] = inp.value;
      const c = d[map.contato], a = d[map.agendada];
      if (c && a && a < c) {
        alert(`Etapa: data agendada não pode ser anterior à data de contato.`);
        d[map.agendada] = ''; inp.value = '';
      }
      const note = el.querySelector('#cf_sla_' + etapa);
      if (note) note.innerHTML = frasSLAEtapa(d[map.contato], d[map.agendada]);
    }));

    // Resultado por etapa: precisa re-renderizar (libera/bloqueia etapa seguinte,
    // recalcula Resultado Final automático)
    el.querySelectorAll('.cf-etapa-resultado').forEach(sel => sel.addEventListener('change', () => {
      d[sel.dataset.field] = sel.value; renderProgress(el); renderBody(el, readOnly);
    }));
    const rhResSel = el.querySelector('#cf_resultadoRh');
    rhResSel && rhResSel.addEventListener('change', () => { d.resultadoRh = rhResSel.value; renderProgress(el); renderBody(el, readOnly); });

    // Modelo de parecer do gestor: grava direto em pareceres_gestor (fora do
    // fluxo normal de "Salvar" do candidato) e recarrega, no mesmo molde do
    // botão "Enviar para Onboarding" logo abaixo.
    const modeloParecerSel = el.querySelector('#cf-modelo-parecer');
    modeloParecerSel && modeloParecerSel.addEventListener('change', () => {
      if (modeloParecerSel.value) salvarModeloParecer(editingCandId, modeloParecerSel.value);
    });
    const linkParecerBtn = el.querySelector('#cf-parecer-link');
    linkParecerBtn && linkParecerBtn.addEventListener('click', () => gerarEnviarLinkParecer(editingCandId));

    // Resultado Final manual + admissão
    const finalSel = el.querySelector('#cf_resultadoFinal');
    finalSel && finalSel.addEventListener('change', () => { d.resultadoFinal = finalSel.value; renderProgress(el); renderBody(el, readOnly); });
    const admInp = el.querySelector('#cf_dataAdmissao');
    admInp && admInp.addEventListener('change', () => { d.dataAdmissao = admInp.value; renderProgress(el); });

    // Onboarding: enviar (recarrega e re-renderiza o form, que passa a mostrar
    // o aviso "já enviado") ou navegar até o novo módulo Treinamento e
    // Desenvolvimento (o link abre a lista — não há deep-link pro registro
    // específico entre módulos nesta versão).
    const btnEnviarOb = el.querySelector('#cf-enviar-onboarding');
    btnEnviarOb && btnEnviarOb.addEventListener('click', () => editingCandId && enviarParaOnboarding(editingCandId));
    const btnAbrirOb = el.querySelector('#cf-abrir-onboarding');
    btnAbrirOb && btnAbrirOb.addEventListener('click', () => { if (window.HUB_GOTO_SECTION) HUB_GOTO_SECTION('tre-onboarding'); });
  }

  // ================================================================
  // SALVAR (validações + sincronização automática da Agenda de Entrevistas
  // — portado de salvarCandidato, ~8150-8377)
  // ================================================================
  function validar(el) {
    const d = candForm;
    const msg = el.querySelector('#cf-msg');
    function fail(text) { msg.textContent = text; msg.style.display = 'block'; return false; }
    msg.style.display = 'none';

    if (!d.vagaId) return fail('Selecione a vaga associada.');
    if (!d.nome || !d.nome.trim()) return fail('Informe o nome do candidato.');
    if (!d.email || !d.email.trim()) return fail('Informe o e-mail do candidato.');

    const obrig = [['contato', 'Telefone / WhatsApp'], ['linkedin', 'LinkedIn'], ['linkPandape', 'Link PandaPé'],
      ['fonteCaptacao', 'Fonte de Captação'], ['segmentoUltimaEmpresa', 'Segmento da Última Empresa'],
      ['genero', 'Gênero'], ['faixaEtaria', 'Faixa Etária'], ['escolaridade', 'Escolaridade'],
      ['estuda', 'Está estudando atualmente?'], ['estadoCivil', 'Estado Civil'], ['temFilhos', 'Tem filhos?']];
    for (const [c, l] of obrig) if (!d[c] || !String(d[c]).trim()) return fail(`Preencha o campo "${l}" em Dados do Candidato.`);
    if (d.estuda === 'Sim' && !d.turnoEstudo) return fail('Informe o turno em que o candidato estuda.');
    if (d.temFilhos === 'Sim' && !d.quantidadeFilhos) return fail('Informe quantos filhos o candidato tem.');

    if (!d.entrevistadoPor) return fail('Informe quem entrevistou o candidato (Entrevista RH).');
    if (!d.dataContatoRh) return fail('Informe a Data do contato do RH.');
    if (!d.dataEntrevista) return fail('Informe a Data da entrevista (RH).');
    if (!d.horarioEntrevista) return fail('Informe o Horário da entrevista (RH).');
    if (!d.fitPct) return fail('Informe o FIT Cultural (%) da Entrevista RH.');
    if (!d.etapaRhStatus) return fail('Selecione o Status da etapa da Entrevista RH.');
    if (!d.resultadoRh) return fail('Selecione o Resultado da Entrevista RH.');

    if (d.resultadoRh === 'Aprovado') {
      if (!d.dataContatoAnalise) return fail('Informe a Data de contato da Etapa Análise Documental.');
      if (!d.dataAgendadaAnalise) return fail('Informe a Data agendada da Etapa Análise Documental.');
      if (!d.etapaAnaliseStatus) return fail('Selecione o Status da etapa Análise Documental.');
      if (!d.resultadoAnalise) return fail('Selecione o Resultado da Etapa Análise Documental.');
      if (!d.motivoAnalise) return fail('Selecione o Detalhamento da Etapa Análise Documental.');
    }
    if (d.resultadoRh === 'Aprovado' && d.resultadoAnalise === 'Aprovado') {
      if (!d.dataContatoChecagem) return fail('Informe a Data de contato da Etapa Checagem.');
      if (!d.dataAgendadaChecagem) return fail('Informe a Data agendada da Etapa Checagem.');
      if (!d.etapaChecagemStatus) return fail('Selecione o Status da etapa Checagem.');
      if (!d.resultadoChecagem) return fail('Selecione o Resultado da Etapa Checagem.');
      if (!d.motivoChecagem) return fail('Selecione o Detalhamento da Etapa Checagem.');
    }
    if (d.resultadoRh === 'Aprovado' && d.resultadoAnalise === 'Aprovado' && d.resultadoChecagem === 'Aprovado') {
      if (!d.dataContatoGestor) return fail('Informe a Data de contato da Etapa Entrevista Gestor.');
      if (!d.dataAgendadaGestor) return fail('Informe a Data agendada da Etapa Entrevista Gestor.');
      if (!d.horarioGestor) return fail('Informe o Horário da Etapa Entrevista Gestor.');
      if (!d.etapaGestorStatus) return fail('Selecione o Status da etapa Entrevista Gestor.');
      if (!d.resultadoGestor) return fail('Selecione o Resultado da Etapa Entrevista Gestor.');
    }
    if (d.resultadoRh === 'Aprovado' && d.resultadoAnalise === 'Aprovado' && d.resultadoChecagem === 'Aprovado' && d.resultadoGestor === 'Aprovado' && !d.resultadoFinal) {
      return fail('Todas as etapas foram aprovadas — selecione o Resultado Final.');
    }
    const pares = [[d.dataContatoRh, d.dataAgendadaRh, 'RH'], [d.dataContatoAnalise, d.dataAgendadaAnalise, 'Análise'], [d.dataContatoChecagem, d.dataAgendadaChecagem, 'Checagem'], [d.dataContatoGestor, d.dataAgendadaGestor, 'Gestor']];
    for (const [c, a, n] of pares) if (c && a && a < c) return fail(`Etapa ${n}: data agendada anterior à data de contato.`);

    if (!d.observacoes || !d.observacoes.trim()) return fail('Preencha o campo "Observações" em Observações Internas.');

    const auto = computeAutoResultadoFinal(d);
    if (auto) d.resultadoFinal = auto;
    if (d.resultadoFinal === 'Reprovado' && !d.motivoReprovacao) return fail('Informe o Motivo da Reprovação para finalizar.');
    if (d.resultadoFinal === 'Banco de Talentos' && !(d.cargosPossiveis && d.cargosPossiveis.length)) {
      return fail('Selecione ao menos um Cargo Possível para mover o candidato para o Banco de Talentos.');
    }
    if (d.resultadoFinal === 'Aprovado') {
      if (!d.tipoTransporte) return fail('Informe o Tipo de Transporte em "Dados de Transporte para o Onboarding".');
      if (d.quantidadePassagens === undefined || d.quantidadePassagens === null || d.quantidadePassagens === '') return fail('Informe a Quantidade de Passagens em "Dados de Transporte para o Onboarding".');
      if (d.valorTotalTransporte === undefined || d.valorTotalTransporte === null || d.valorTotalTransporte === '') return fail('Informe o Valor Total em Transporte em "Dados de Transporte para o Onboarding".');
    }
    return true;
  }

  async function sincronizarEntrevistaRH(vaga) {
    const d = candForm;
    const entrevistas = D().entrevistas || [];
    const existente = entrevistas.find(e => e.candidatoId === editingCandId && e.etapa === 'Entrevista (RH)');
    if (existente) {
      if (existente.data !== d.dataEntrevista || existente.horario !== d.horarioEntrevista || existente.recrutador !== d.entrevistadoPor) {
        await R.updateRow('entrevistas', existente.id, { data: d.dataEntrevista || existente.data, horario: d.horarioEntrevista || existente.horario, recrutador: d.entrevistadoPor || existente.recrutador });
      }
    } else if (d.etapaRhStatus !== 'Concluída' && d.dataEntrevista && d.horarioEntrevista) {
      await R.insertRow('entrevistas', {
        candidatoId: editingCandId, candidatoNome: d.nome, vagaId: d.vagaId, cargo: d.cargo, unidade: d.unidade,
        recrutador: d.entrevistadoPor, etapa: 'Entrevista (RH)', tipoEntrevista: 'RH', data: d.dataEntrevista, horario: d.horarioEntrevista,
        duracao: 60, status: 'Agendada', tipoProcesso: vaga ? vaga.tipoRecrutamento : 'Externo', nivelVaga: d.nivelVaga, observacao: ''
      });
    }
  }

  async function salvarCandidato(el, opcao) {
    if (salvando) return;
    if (!validar(el)) return;
    const d = candForm;
    const vaga = (D().vagas || []).find(v => v.id === d.vagaId);
    if (vaga) { d.cargo = vaga.cargo; d.unidade = vaga.unidade; d.departamento = vaga.departamento; d.nivelVaga = vaga.nivelVaga || ''; }
    d.atualizadoPor = (HUB_USER && (HUB_USER.nome || HUB_USER.email)) || 'Desconhecido';

    salvando = true;
    const btn = el.querySelector('#cf-salvar-voltar');
    const btnSalvar = el.querySelector('#cf-salvar');
    const btnNovo = el.querySelector('#cf-salvar-novo');
    const btnTextoOriginal = btn ? btn.textContent : '';
    [btn, btnSalvar, btnNovo].forEach(b => { if (b) b.disabled = true; });
    if (btn) btn.textContent = 'Salvando...';
    try {
      if (editingCandId) {
        await R.updateRow('candidatos', editingCandId, d);
        await sincronizarEntrevistaRH(vaga);
        await R.logAcao({ acao: 'Edição de Candidato', vagaId: d.vagaId, detalhes: `Candidato ${editingCandId} atualizado: ${d.nome}` });
      } else {
        const novo = await U.insertWithRetryId('CAND', (D().candidatos || []).map(c => c.id), async id => {
          const row = Object.assign({}, d, { id, criadoEm: new Date().toISOString() });
          await R.insertRow('candidatos', row);
          return row;
        });
        editingCandId = novo.id;
        await R.logAcao({ acao: 'Novo Candidato', vagaId: novo.vagaId, detalhes: `Candidato ${novo.id} cadastrado: ${novo.nome}` });
        if (d.dataEntrevista && d.horarioEntrevista) {
          await R.insertRow('entrevistas', {
            candidatoId: novo.id, candidatoNome: novo.nome, vagaId: novo.vagaId, cargo: novo.cargo, unidade: novo.unidade,
            recrutador: novo.entrevistadoPor, etapa: 'Entrevista (RH)', tipoEntrevista: 'RH', data: novo.dataEntrevista, horario: novo.horarioEntrevista,
            duracao: 60, status: 'Agendada', tipoProcesso: vaga ? vaga.tipoRecrutamento : 'Externo', nivelVaga: novo.nivelVaga, observacao: ''
          });
        }
      }
      await R.reload();
      salvando = false;
      if (opcao === 'novo') { openForm(null); }
      else if (opcao === 'continuar') { openForm(editingCandId); }
      else { view = 'list'; render(); }
    } catch (err) {
      salvando = false;
      const msg = el.querySelector('#cf-msg');
      msg.textContent = 'Erro ao salvar: ' + err.message; msg.style.display = 'block';
      [btn, btnSalvar, btnNovo].forEach(b => { if (b) b.disabled = false; });
      if (btn) btn.textContent = btnTextoOriginal;
    }
  }

  window.HUB_SECTIONS = window.HUB_SECTIONS || {};
  window.HUB_SECTIONS.renderCandidatos = renderCandidatos;
})();
