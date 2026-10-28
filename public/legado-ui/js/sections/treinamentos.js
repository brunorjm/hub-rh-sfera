// Indicadores → Treinamentos, em abas:
//   Visão geral      as três plataformas lado a lado, por operação
//   Twygo            carteira atual (inscrições confirmadas, ambiente ativo),
//                    conclusões por mês e pendências
//   Unibê            foto mensal da adesão (planilha 27.1)
//   Academia Hering  foto mensal de horas e performance (planilha 27.2)
// As contas ficam em metrics-indicadores.js (treinamentosMetrics, carteira do
// Twygo) e metrics-treinamentos.js (o resto).
(function () {
  const U = HUB_UTILS;
  const M = HUB_METRICS;
  const T = HUB_METRICS_TREINAMENTOS;
  const { kpi, empty, card, barChart, lineChart, rankingTable, comboChart } = HUB_UI;
  const esc = s => U.escapeHtml(s == null ? '' : String(s));

  const state = { aba: 'geral', mesUnibe: null, mesAcademia: null, grupoUnibe: 'regiao' };
  const ABAS = [['geral', 'Visão geral'], ['twygo', 'Twygo'], ['unibe', 'Unibê'], ['academia', 'Academia Hering']];
  const COR = { ok: '#0f8a4c', atencao: '#b7791f', critico: 'var(--critical)' };

  function canUpload() { return HUB_PERMISSIONS.hasPerm(HUB_USER, 'admin.upload'); }
  // Unibê é do Boticário (loja e VD) e do Escritório; Academia só da Hering: a RLS já entrega
  // só as linhas das unidades liberadas a cada pessoa; quem não recebe nenhuma
  // linha da plataforma nem vê a aba (o administrador vê sempre, para orientar o upload).
  // O Twygo vale para todos com a permissão de Treinamentos.
  const veUnibe = () => canUpload() || ((window.HUB_DATA || {}).unibe_pdv || []).length > 0;
  const veAcademia = () => canUpload() || ((window.HUB_DATA || {}).academia_hering || []).length > 0;
  function abasVisiveis() {
    return ABAS.filter(([k]) => (k !== 'unibe' || veUnibe()) && (k !== 'academia' || veAcademia()));
  }
  const pct = (v, c) => (v == null ? '—' : U.fmtPct(v, c == null ? 0 : c));
  const int = v => (v == null ? '—' : U.fmtInt(Math.round(v)));
  const horas = v => (v == null ? '—' : U.fmt1(v) + ' h');
  const mesLabel = m => (m ? U.monthLabel(m) : '—');
  function corMeta(v, meta) { return v == null ? 'inherit' : v >= meta ? COR.ok : v >= meta * 0.7 ? COR.atencao : COR.critico; }
  const comCor = (v, meta, c) => `<b style="color:${corMeta(v, meta)}">${pct(v, c)}</b>`;
  // Diferença contra a foto anterior: "▲ 1,2 p.p." / "▼ 35".
  function delta(atual, anterior, emPct) {
    if (atual == null || anterior == null) return '';
    const d = emPct ? (atual - anterior) * 100 : atual - anterior;
    if (Math.abs(d) < (emPct ? 0.05 : 0.5)) return '= ao mês anterior';
    const n = emPct ? Math.abs(d).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' p.p.' : U.fmtInt(Math.round(Math.abs(d)));
    return `<span style="color:${d > 0 ? COR.ok : COR.critico}">${d > 0 ? '▲' : '▼'} ${n}</span> vs. mês anterior`;
  }
  const nota = txt => `<p class="sub" style="color:var(--muted);font-size:11.5px;margin:0 0 14px">${txt}</p>`;
  const info = txt => `<div class="insight info" style="margin-bottom:16px"><span class="ic">${HUB_ICON('info')}</span><span>${txt}</span></div>`;

  // Seletor de foto (Unibê/Academia): só os meses dentro do período do filtro.
  function seletorMes(id, meses, atual) {
    if (meses.length < 2) return '';
    return `<label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;margin:0 0 14px">Foto de
      <select id="${id}" style="font-size:12px">${meses.slice().reverse().map(m => `<option value="${m}"${m === atual ? ' selected' : ''}>${esc(mesLabel(m))}</option>`).join('')}</select></label>`;
  }

  // nome já com o artigo ("do Twygo", "da Unibê"); comMes = foto mensal (Unibê, Academia).
  function semPlanilha(nome, arquivo, comMes) {
    return empty(`Ainda não há dados ${nome}.`, canUpload()
      ? `Envie a planilha ${arquivo} em Administração → Upload de Planilhas${comMes ? ', escolhendo o mês de referência' : ''}.`
      : 'Peça para um administrador enviar a planilha.');
  }
  function foraDoPeriodo(nome) {
    return empty(`Sem foto ${nome} no período do filtro.`, 'Amplie as datas da barra de filtros: cada upload vale para o mês de referência escolhido.');
  }

  // ==================================================================
  // VISÃO GERAL
  // ==================================================================
  function abaGeral(f) {
    const v = T.visaoGeral(f);
    const tw = v.tw, h = v.hist, ub = v.ub, ac = v.ac;
    const periodoConclusoes = h.janela ? `de ${h.janela}` : 'no período';
    const vu = veUnibe(), va = veAcademia();
    const linhas = v.ops.map(o => `<tr>
        <td>${esc(o.nome)}</td>
        <td>${o.twygoInscricoes ? comCor(o.twygoProgresso, v.metaTwygo) : '—'}</td>
        <td>${o.twygoInscricoes ? pct(o.twygoConclusao) : '—'}</td>
        <td>${o.horasConcluidas ? U.fmtInt(Math.round(o.horasConcluidas)) + ' h' : '—'}</td>
        ${vu ? `<td>${o.unibe != null ? comCor(o.unibe, T.META_UNIBE, 1) : '—'}</td>` : ''}
        ${va ? `<td>${o.academiaPerformance != null ? int(o.academiaPerformance) + ' pts' : '—'}</td><td>${o.academiaHoras != null ? horas(o.academiaHoras) : '—'}</td>` : ''}</tr>`).join('');
    const html = `
      <div class="kpi-grid">
        ${kpi('Twygo — progresso médio', tw.totalInscricoes ? pct(tw.progressoMedio) : '—', `${U.fmtInt(tw.totalInscricoes)} inscrições confirmadas · meta ${pct(v.metaTwygo)}`, 'var(--p1)')}
        ${kpi('Twygo — taxa de conclusão', tw.totalInscricoes ? pct(tw.taxaConclusao) : '—', `${U.fmtInt(tw.totalConcluidos)} concluídas`, '#1baf7a')}
        ${kpi('Cursos concluídos', h.temDatas ? U.fmtInt(h.conclusoes) : '—', h.temDatas ? `${periodoConclusoes} · ${U.fmtInt(Math.round(h.horas))} h · ${U.fmtInt(h.pessoas)} pessoas` : 'reenvie a planilha 27. Twygo', '#4a3aa7')}
        ${!vu ? '' : kpi('Unibê — adesão', ub.mes ? pct(ub.adesaoMedia, 1) : '—', ub.mes ? `foto de ${mesLabel(ub.mes)} · ${ub.pdvsNaMeta}/${ub.totalPdvs} PDVs na meta` : 'sem foto no período', '#B45CD6')}
        ${!va ? '' : kpi('Academia Hering — performance', ac.mes ? int(ac.performanceMedia) + ' pts' : '—', ac.mes ? `foto de ${mesLabel(ac.mes)} · ${U.fmt1(ac.horasMedia)} h por pessoa` : 'sem foto no período', '#eda100')}
      </div>
      <div class="grid2">
        ${card('Treinamentos por operação', '&#127970;', v.ops.length ? `
          ${nota(`Twygo: inscrições confirmadas de quem está ativo no Twygo (período pela data de inscrição; meta de progresso ${pct(v.metaTwygo)}, a mesma do Boletim). Horas concluídas: carga horária dos cursos que chegaram a 100% ${periodoConclusoes}. ${[vu ? `Unibê (meta ${pct(T.META_UNIBE)})` : '', va ? 'Academia Hering' : ''].filter(Boolean).join(' e ')}${vu || va ? ': foto do mês mais recente do período.' : ''}`)}
          <div class="table-wrap fit"><table class="dt fit"><thead><tr><th>Operação</th><th>Twygo — progresso</th><th>Twygo — conclusão</th><th>Horas concluídas</th>${vu ? '<th>Unibê — adesão</th>' : ''}${va ? '<th>Academia — performance</th><th>Academia — horas/pessoa</th>' : ''}</tr></thead>
          <tbody>${linhas}</tbody></table></div>` : empty('Sem dados.'), { full: true })}
        ${card('Twygo — cursos concluídos e horas por mês', '&#128200;', h.serie.length
          ? `${nota('Pela data em que o curso chegou a 100%. Inclui quem já saiu da empresa (o curso foi feito quando a pessoa estava aqui).')}<div class="chart-h"><canvas id="c-trg-serie"></canvas></div>`
          : empty(h.temDatas ? 'Nenhum curso concluído no período.' : 'A data de conclusão ainda não foi importada.', h.temDatas ? '' : 'Reenvie a planilha 27. Twygo em Administração → Upload de Planilhas (a coluna "Conclusão 100%" passou a ser guardada agora).'), { full: true })}
      </div>`;
    return { html, depois: () => { if (h.serie.length) comboChart('c-trg-serie', h.serie.map(x => x.label), { label: 'Cursos concluídos', data: h.serie.map(x => x.conclusoes) }, { label: 'Horas concluídas', data: h.serie.map(x => Math.round(x.horas)) }); } };
  }

  // ==================================================================
  // TWYGO
  // ==================================================================
  function abaTwygo(f) {
    if (!(HUB_DATA.twygo_participantes || []).length) return { html: semPlanilha('do Twygo', '27. Twygo') };
    const d = M.treinamentosMetrics(f);
    const h = T.twygoHistorico(f);
    const p = T.twygoPendencias(f);
    let drill = '';
    if (f.colaborador && d.porColaborador && d.porColaborador.totalCursos !== undefined) {
      const c = d.porColaborador;
      drill = card(`Detalhe de treinamentos — ${esc(f.colaborador)}`, '&#127891;', `
        <div class="kpi-grid" style="margin-bottom:16px">
          ${kpi('Progresso geral', c.progressoGeral == null ? '—' : U.fmtPct(c.progressoGeral), '', 'var(--p1)')}
          ${kpi('Pontuação', c.pontuacao == null ? '—' : U.fmtInt(c.pontuacao), '', '#eda100')}
          ${kpi('Horas de treinamento', U.fmt1(c.horasTotais), '', '#1baf7a')}
          ${kpi('Cursos concluídos', `${c.cursosConcluidos}/${c.totalCursos}`, '', '#4a3aa7')}
        </div>
        <div class="table-wrap"><table class="dt"><thead><tr><th>Curso</th><th>Situação</th><th>Progresso</th><th>Nota</th><th>Carga horária</th><th>Último acesso</th></tr></thead><tbody>
          ${c.cursos.map(x => `<tr><td>${esc(x.curso)}</td><td>${esc(x.situacao)}</td><td>${x.progresso == null ? '—' : U.fmtPct(x.progresso)}</td><td>${x.nota == null ? '—' : U.fmt1(x.nota)}</td><td>${x.cargaHoraria == null ? '—' : U.fmt1(x.cargaHoraria) + 'h'}</td><td>${U.fmtDateBR(x.ultimoAcesso)}</td></tr>`).join('') || '<tr><td colspan="6">Nenhum curso encontrado para esta pessoa.</td></tr>'}
        </tbody></table></div>`, { full: true });
    }
    const pessoasHtml = p.porPessoa.length ? `<div class="table-wrap" style="max-height:480px"><table class="dt"><thead><tr><th>Colaborador</th><th>Cargo</th><th>Departamento</th><th>Pendentes</th><th>Não iniciados</th><th>Conclusão</th><th>Inscrição mais antiga pendente</th><th>Último acesso</th></tr></thead><tbody>
        ${p.porPessoa.map(x => `<tr><td>${esc(x.nome)}</td><td>${esc(x.cargo)}</td><td>${esc(x.departamento)}</td><td>${U.fmtInt(x.pendentes)}</td><td>${U.fmtInt(x.naoIniciados)}</td><td>${pct(x.conclusao)}</td><td>${U.fmtDateBR(x.maisAntiga)}</td><td>${x.ultimoAcesso ? U.fmtDateBR(x.ultimoAcesso) : '—'}</td></tr>`).join('')}
      </tbody></table></div>` : empty('Ninguém com curso pendente no recorte.');
    const cursosHtml = p.porCurso.length ? `<div class="table-wrap" style="max-height:480px"><table class="dt"><thead><tr><th>Curso</th><th>Inscritos</th><th>Concluídos</th><th>Pendentes</th><th>Não iniciados</th><th>Conclusão</th></tr></thead><tbody>
        ${p.porCurso.map(x => `<tr><td>${esc(x.label)}</td><td>${U.fmtInt(x.inscritos)}</td><td>${U.fmtInt(x.concluidos)}</td><td>${U.fmtInt(x.pendentes)}</td><td>${U.fmtInt(x.naoIniciados)}</td><td>${comCor(x.taxa, T.META_TWYGO)}</td></tr>`).join('')}
      </tbody></table></div>` : empty('Nenhum curso com pendência.');
    const pioresHtml = p.piores.length ? `<div class="table-wrap fit"><table class="dt fit"><thead><tr><th>Departamento</th><th>Unidade</th><th>Pessoas</th><th>Inscrições</th><th>Pendentes</th><th>Conclusão</th><th>Progresso médio</th></tr></thead><tbody>
        ${p.piores.map(x => `<tr><td>${esc(x.label)}</td><td>${esc(x.unidade)}</td><td>${U.fmtInt(x.pessoas)}</td><td>${U.fmtInt(x.inscritos)}</td><td>${U.fmtInt(x.pendentes)}</td><td>${comCor(x.taxa, T.META_TWYGO)}</td><td>${pct(x.progresso)}</td></tr>`).join('')}
      </tbody></table></div>` : empty('Sem departamentos com 5 ou mais inscrições.');

    const html = `
      <div class="kpi-grid">
        ${kpi('Inscrições confirmadas', U.fmtInt(d.totalInscricoes), 'ambiente ativo; cancelamentos não entram', 'var(--p1)')}
        ${kpi('Taxa de conclusão', U.fmtPct(d.taxaConclusao), `${U.fmtInt(d.totalConcluidos)} concluída(s)`, '#1baf7a')}
        ${kpi('Progresso médio', U.fmtPct(d.progressoMedio), `meta do Boletim: ${pct(T.META_TWYGO)}`, 'var(--p2)')}
        ${kpi('Horas de treinamento (soma)', U.fmt1(d.horasTotais), 'carga horária das inscrições', '#eda100')}
        ${kpi('Cursos em andamento', U.fmtInt(d.totalEmAndamento), '', '#eda100')}
        ${kpi('Cursos não iniciados', U.fmtInt(d.totalNaoIniciados), '0% de progresso', 'var(--critical)')}
        ${kpi('Pessoas com pendência', U.fmtInt(p.pessoasComPendencia), `${U.fmtInt(p.totalPendentes)} curso(s) pendente(s)`, 'var(--critical)')}
        ${kpi('Concluídos por data de conclusão', h.temDatas ? U.fmtInt(h.conclusoes) : '—', h.temDatas ? `${h.janela ? h.janela : 'no período'} · ${U.fmtInt(Math.round(h.horas))} h` : 'reenvie a planilha 27. Twygo', '#4a3aa7')}
      </div>
      ${drill}
      <div class="grid2">
        ${card('Cursos concluídos e horas por mês', '&#128200;', h.serie.length
          ? `${nota('Pela data em que o curso chegou a 100% (coluna "Conclusão 100%"; sem ela, a data de aprovação). Inclui quem já saiu da empresa.')}<div class="chart-h"><canvas id="c-tr-concl"></canvas></div>`
          : empty(h.temDatas ? 'Nenhum curso concluído no período.' : 'A data de conclusão ainda não foi importada.', h.temDatas ? '' : 'Reenvie a planilha 27. Twygo em Administração → Upload de Planilhas.'), { full: true })}
        ${card('Evolução de inscrições', '&#128200;', d.serie.length ? '<div class="chart-h"><canvas id="c-tr-serie"></canvas></div>' : empty('Sem dados.'), { full: true })}
        ${card('Departamentos com menor conclusão', '&#128680;', nota('Departamentos com 5 ou mais inscrições no recorte, do menor para o maior % de conclusão.') + pioresHtml, { full: true })}
        ${card('Top 10 departamentos — conclusão e progresso', '&#127942;', rankingTable(d.topDepartamentos, 'Departamento'))}
        ${card('Top 10 colaboradores — conclusão e progresso', '&#127942;', rankingTable(d.topColaboradores, 'Colaborador'))}
        ${card('Cursos com mais pendências', '&#128218;', cursosHtml, { full: true })}
        ${card('Colaboradores com cursos pendentes', '&#128101;', pessoasHtml, { full: true })}
        ${card('Progresso por curso', '&#128218;', d.progressoPorCurso.length ? `<div class="chart-scroll"><div class="chart-inner" id="c-tr-cursos-wrap"><canvas id="c-tr-cursos"></canvas></div></div>` : empty('Sem dados.'), { full: true })}
      </div>`;
    return {
      html, depois: () => {
        if (h.serie.length) comboChart('c-tr-concl', h.serie.map(x => x.label), { label: 'Cursos concluídos', data: h.serie.map(x => x.conclusoes) }, { label: 'Horas concluídas', data: h.serie.map(x => Math.round(x.horas)) });
        if (d.serie.length) lineChart('c-tr-serie', d.serie.map(x => x.label), [{ label: 'Inscrições', data: d.serie.map(x => x.value) }]);
        if (d.progressoPorCurso.length) {
          // A altura acompanha a quantidade de cursos; o card rola por dentro.
          document.getElementById('c-tr-cursos-wrap').style.height = Math.max(d.progressoPorCurso.length * 32, 200) + 'px';
          barChart('c-tr-cursos', d.progressoPorCurso.map(x => x.label), d.progressoPorCurso.map(x => x.value), { horizontal: true, pct: true });
        }
      }
    };
  }

  // ==================================================================
  // UNIBÊ
  // ==================================================================
  const GRUPOS_UNIBE = [['regiao', 'Região', 'porRegiao'], ['segmento', 'Segmento', 'porSegmento'], ['supervisao', 'Supervisão', 'porSupervisao'], ['multi', 'Multiplicadora', 'porMulti'], ['operacao', 'Operação', 'porOperacao']];

  function abaUnibe(f) {
    const u = T.unibeMetrics(f, state.mesUnibe);
    if (!u.temDados) return { html: semPlanilha('da Unibê', '27.1 Unibê', true) };
    if (!u.mes) return { html: foraDoPeriodo('da Unibê') };
    const g = GRUPOS_UNIBE.find(x => x[0] === state.grupoUnibe) || GRUPOS_UNIBE[0];
    const grupo = u[g[2]];
    const grupoHtml = `<label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;margin-bottom:10px">Agrupar por
        <select id="tr-ub-grupo" style="font-size:12px">${GRUPOS_UNIBE.map(x => `<option value="${x[0]}"${x[0] === g[0] ? ' selected' : ''}>${x[1]}</option>`).join('')}</select></label>
      <div class="table-wrap fit"><table class="dt fit"><thead><tr><th>${g[1]}</th><th>PDVs</th><th>Adesão média</th>${g[0] === 'operacao' ? '' : '<th>PDVs na meta</th>'}</tr></thead><tbody>
        ${grupo.map(x => `<tr><td>${esc(x.label)}</td><td>${U.fmtInt(x.pdvs)}</td><td>${comCor(x.adesao, u.meta, 1)}</td>${g[0] === 'operacao' ? '' : `<td>${U.fmtInt(x.naMeta)}</td>`}</tr>`).join('') || '<tr><td colspan="4">Sem dados.</td></tr>'}
      </tbody></table></div>`;
    const cargoHtml = `<div class="table-wrap fit"><table class="dt fit"><thead><tr><th>Cargo</th><th>Pessoas</th><th>Adesão média</th><th>Abaixo da meta</th></tr></thead><tbody>
        ${u.porCargo.map(x => `<tr><td>${esc(x.label)}</td><td>${U.fmtInt(x.pessoas)}</td><td>${comCor(x.adesao, u.meta, 1)}</td><td>${U.fmtInt(x.abaixo)}</td></tr>`).join('') || '<tr><td colspan="4">Sem dados.</td></tr>'}
      </tbody></table></div>`;
    const abaixoHtml = u.abaixo.length ? `<div class="table-wrap" style="max-height:480px"><table class="dt"><thead><tr><th>Nome</th><th>Cargo</th><th>PDV</th><th>Adesão</th></tr></thead><tbody>
        ${u.abaixo.map(x => `<tr><td>${esc(x.nome)}${x.no_cadastro ? '' : ' <span class="sub" style="color:var(--muted)" title="Não achado no cadastro de Colaboradores pelo nome">*</span>'}</td><td>${esc(x.cargo)}</td><td>${esc(x.nome_pdv || x.pdv)}</td><td>${comCor(x.adesao, u.meta, 1)}</td></tr>`).join('')}
      </tbody></table></div>` : empty('Todos na meta.');
    const pdvsHtml = `<div class="table-wrap" style="max-height:480px"><table class="dt"><thead><tr><th>PDV</th><th>Região</th><th>Segmento</th><th>Gerente</th><th>Supervisão</th><th>Multiplicadora</th><th>Pessoas</th><th>Adesão</th></tr></thead><tbody>
        ${u.porPdv.map(x => `<tr><td>${esc(x.label)}${x.departamento ? '' : ' <span class="sub" style="color:var(--muted)" title="Sem loja correspondente no cadastro de Colaboradores">*</span>'}</td><td>${esc(x.regiao)}</td><td>${esc(x.segmento)}</td><td>${esc(x.gerente || '—')}</td><td>${esc(x.supervisao)}</td><td>${esc(x.multi)}</td><td>${U.fmtInt(x.pessoas)}</td><td>${comCor(x.adesao, u.meta, 1)}</td></tr>`).join('')}
      </tbody></table></div>`;
    const html = `
      ${seletorMes('tr-ub-mes', u.meses, u.mes)}
      <div class="kpi-grid">
        ${kpi('Adesão média (PDVs)', pct(u.adesaoMedia, 1), delta(u.adesaoMedia, u.adesaoAnterior, true) || `foto de ${mesLabel(u.mes)} · meta ${pct(u.meta)}`, '#B45CD6')}
        ${kpi('PDVs na meta', `${U.fmtInt(u.pdvsNaMeta)}/${U.fmtInt(u.totalPdvs)}`, `adesão de ${pct(u.meta)} ou mais`, '#1baf7a')}
        ${kpi('Pessoas', U.fmtInt(u.totalPessoas), `adesão média das pessoas: ${pct(u.adesaoPessoas, 1)}`, 'var(--p1)')}
        ${kpi('Pessoas abaixo da meta', U.fmtInt(u.pessoasAbaixo), `${U.fmtInt(u.pessoasZeradas)} com 0%`, 'var(--critical)')}
      </div>
      ${nota(`Foto de ${mesLabel(u.mes)} (planilha 27.1, mês escolhido no upload). A adesão da loja é a oficial da Unibê (aba PDV) e não é a média das pessoas da aba Pessoa, que lista só quem está no PDV hoje. Meta de ${pct(u.meta)}, a mesma do Boletim da Liderança. * = sem correspondência no cadastro de Colaboradores.`)}
      <div class="grid2">
        ${card('Adesão por PDV', '&#127891;', `<div class="chart-scroll"><div class="chart-inner" id="c-ub-pdv-wrap"><canvas id="c-ub-pdv"></canvas></div></div>`, { full: true })}
        ${card('Adesão por grupo', '&#128202;', grupoHtml)}
        ${card('Adesão por cargo', '&#128188;', cargoHtml)}
        ${u.serie.length > 1 ? card('Evolução da adesão', '&#128200;', '<div class="chart-h"><canvas id="c-ub-serie"></canvas></div>', { full: true }) : ''}
        ${card(`Pessoas abaixo da meta (${U.fmtInt(u.abaixo.length)})`, '&#128680;', abaixoHtml, { full: true })}
        ${card('PDVs', '&#127970;', pdvsHtml, { full: true })}
      </div>
      ${u.serie.length > 1 ? '' : nota('A evolução mês a mês aparece a partir da segunda foto enviada.')}`;
    return {
      html, depois: el => {
        document.getElementById('c-ub-pdv-wrap').style.height = Math.max(u.porPdv.length * 26, 200) + 'px';
        barChart('c-ub-pdv', u.porPdv.map(x => x.label), u.porPdv.map(x => x.adesao), { horizontal: true, pct: true, colors: u.porPdv.map(x => x.adesao >= u.meta ? '#2EC4A0' : x.adesao >= u.meta * 0.7 ? '#eda100' : '#E8604C') });
        if (u.serie.length > 1) lineChart('c-ub-serie', u.serie.map(x => x.label), [{ label: 'Adesão média (%)', data: u.serie.map(x => +(x.adesao * 100).toFixed(1)) }]);
        const sel = el.querySelector('#tr-ub-mes');
        if (sel) sel.addEventListener('change', () => { state.mesUnibe = sel.value; HUB_RENDER_CURRENT(); });
        el.querySelector('#tr-ub-grupo').addEventListener('change', e => { state.grupoUnibe = e.target.value; HUB_RENDER_CURRENT(); });
      }
    };
  }

  // ==================================================================
  // ACADEMIA HERING
  // ==================================================================
  function abaAcademia(f) {
    const a = T.academiaMetrics(f, state.mesAcademia);
    if (!a.temDados) return { html: semPlanilha('da Academia Hering', '27.2 Academia Hering', true) };
    if (!a.mes) return { html: foraDoPeriodo('da Academia Hering') };
    const lojasHtml = `<div class="table-wrap fit"><table class="dt fit"><thead><tr><th>Loja</th><th>Pessoas</th><th>Horas (soma)</th><th>Horas por pessoa</th><th>Performance média</th><th>Sem acesso há +${a.diasSemAcesso} dias</th></tr></thead><tbody>
        ${a.porLoja.map(x => `<tr><td>${esc(x.label)}</td><td>${U.fmtInt(x.pessoas)}</td><td>${U.fmtInt(Math.round(x.horas))}</td><td>${horas(x.horasMedia)}</td><td>${int(x.performanceMedia)}</td><td>${U.fmtInt(x.semAcesso)}</td></tr>`).join('')}
      </tbody></table></div>`;
    const cargoHtml = `<div class="table-wrap fit"><table class="dt fit"><thead><tr><th>Cargo</th><th>Pessoas</th><th>Horas por pessoa</th><th>Performance média</th></tr></thead><tbody>
        ${a.porCargo.map(x => `<tr><td>${esc(x.label)}</td><td>${U.fmtInt(x.pessoas)}</td><td>${horas(x.horasMedia)}</td><td>${int(x.performanceMedia)}</td></tr>`).join('')}
      </tbody></table></div>`;
    const pessoa = x => `${esc(x.nome_cadastro || x.nome)}${x.no_cadastro ? '' : ' <span class="sub" style="color:var(--muted)" title="Não achado no cadastro de Colaboradores pelo nome">*</span>'}`;
    const topHtml = `<div class="table-wrap fit"><table class="dt fit"><thead><tr><th>Nome</th><th>Cargo</th><th>Loja</th><th>Horas</th><th>Performance</th></tr></thead><tbody>
        ${a.top.map(x => `<tr><td>${pessoa(x)}</td><td>${esc(x.cargo)}</td><td>${esc(T.lojaCurta(x.loja))}</td><td>${horas(x.horas)}</td><td>${int(x.performance)}</td></tr>`).join('')}
      </tbody></table></div>`;
    const semAcessoHtml = a.listaSemAcesso.length ? `<div class="table-wrap" style="max-height:420px"><table class="dt"><thead><tr><th>Nome</th><th>Cargo</th><th>Loja</th><th>Último acesso</th><th>Horas</th></tr></thead><tbody>
        ${a.listaSemAcesso.map(x => `<tr><td>${pessoa(x)}</td><td>${esc(x.cargo)}</td><td>${esc(T.lojaCurta(x.loja))}</td><td>${x.ultimo_acesso ? U.fmtDateBR(x.ultimo_acesso) : 'nunca acessou'}</td><td>${horas(x.horas)}</td></tr>`).join('')}
      </tbody></table></div>` : empty(`Todos acessaram nos últimos ${a.diasSemAcesso} dias.`);
    const html = `
      ${seletorMes('tr-ac-mes', a.meses, a.mes)}
      <div class="kpi-grid">
        ${kpi('Performance média', int(a.performanceMedia) + ' pts', delta(a.performanceMedia, a.performanceAnterior, false) || `foto de ${mesLabel(a.mes)}`, '#eda100')}
        ${kpi('Horas por pessoa', horas(a.horasMedia), delta(a.horasMedia, a.horasMediaAnterior, false) || `${U.fmtInt(Math.round(a.horasTotais))} h no total`, '#1baf7a')}
        ${kpi('Pessoas', U.fmtInt(a.totalPessoas), `${a.porLoja.length} lojas`, 'var(--p1)')}
        ${kpi(`Sem acesso há +${a.diasSemAcesso} dias`, U.fmtInt(a.semAcesso), `${U.fmtInt(a.nuncaAcessou)} nunca acessaram`, 'var(--critical)')}
      </div>
      ${nota(`Foto de ${mesLabel(a.mes)} (planilha 27.2, mês escolhido no upload). Horas e performance são o acumulado de cada pessoa na Academia até o dia da exportação. "Sem acesso" conta a partir do acesso mais recente da foto (${U.fmtDateBR(a.referencia)}). * = sem correspondência no cadastro de Colaboradores.`)}
      <div class="grid2">
        ${card('Performance e horas por loja', '&#127970;', '<div class="chart-h"><canvas id="c-ac-loja"></canvas></div>', { full: true })}
        ${card('Lojas', '&#128202;', lojasHtml, { full: true })}
        ${card('Por cargo', '&#128188;', cargoHtml)}
        ${card('Top 10 — performance', '&#127942;', topHtml)}
        ${a.serie.length > 1 ? card('Evolução', '&#128200;', '<div class="chart-h"><canvas id="c-ac-serie"></canvas></div>', { full: true }) : ''}
        ${card(`Sem acesso há mais de ${a.diasSemAcesso} dias (${U.fmtInt(a.listaSemAcesso.length)})`, '&#128680;', semAcessoHtml, { full: true })}
      </div>
      ${a.serie.length > 1 ? '' : nota('A evolução mês a mês aparece a partir da segunda foto enviada.')}`;
    return {
      html, depois: el => {
        comboChart('c-ac-loja', a.porLoja.map(x => x.label), { label: 'Performance média (pts)', data: a.porLoja.map(x => Math.round(x.performanceMedia || 0)) }, { label: 'Horas por pessoa', data: a.porLoja.map(x => +(x.horasMedia || 0).toFixed(1)), fmt: v => U.fmt1(v) });
        if (a.serie.length > 1) comboChart('c-ac-serie', a.serie.map(x => x.label), { label: 'Performance média (pts)', data: a.serie.map(x => Math.round(x.performanceMedia || 0)) }, { label: 'Horas por pessoa', data: a.serie.map(x => +(x.horasMedia || 0).toFixed(1)), fmt: v => U.fmt1(v) });
        const sel = el.querySelector('#tr-ac-mes');
        if (sel) sel.addEventListener('change', () => { state.mesAcademia = sel.value; HUB_RENDER_CURRENT(); });
      }
    };
  }

  // ==================================================================
  function renderTreinamentos(el, f) {
    const D = window.HUB_DATA || {};
    const algum = ['twygo_participantes', 'unibe_pdv', 'academia_hering'].some(t => (D[t] || []).length);
    if (!algum) {
      el.innerHTML = empty('Sem dados de treinamento ainda.', canUpload() ? 'Envie as planilhas 27. Twygo, 27.1 Unibê e 27.2 Academia Hering em Administração → Upload de Planilhas.' : 'Peça para um administrador importar os dados.');
      return;
    }
    // Trilha e Conteúdo só filtram o Twygo.
    const twygoAba = state.aba === 'geral' || state.aba === 'twygo';
    ['#fg-trilha', '#fg-conteudo'].forEach(s => { const x = document.querySelector(s); if (x) x.style.display = twygoAba ? 'flex' : 'none'; });
    const abas = abasVisiveis();
    if (!abas.some(([k]) => k === state.aba)) state.aba = 'geral';
    const r = { geral: abaGeral, twygo: abaTwygo, unibe: abaUnibe, academia: abaAcademia }[state.aba](f);
    el.innerHTML = `<div class="tab-bar">${abas.map(([k, l]) => `<button class="tab-btn${state.aba === k ? ' active' : ''}" data-aba="${k}">${l}</button>`).join('')}</div>` + r.html;
    el.querySelectorAll('.tab-btn[data-aba]').forEach(b => b.addEventListener('click', () => { state.aba = b.dataset.aba; HUB_RENDER_CURRENT(); }));
    if (r.depois) r.depois(el);
  }

  window.HUB_SECTIONS = window.HUB_SECTIONS || {};
  window.HUB_SECTIONS.renderTreinamentos = renderTreinamentos;
})();
