// Indicador ao vivo de Recrutamento — MESMO componente usado em
// "Indicadores → Recrutamento" e em "Recrutamento → Dashboard" (ver app.js).
// Lê window.HUB_RECRUIT_DATA (recarregada a cada entrada no módulo
// Recrutamento — dal-recrutamento.js) via metrics-recrutamento.js, e usa os
// mesmos componentes visuais do módulo Indicadores (ui-charts.js) para manter
// uma identidade única no hub em vez de dois estilos diferentes.
(function () {
  const U = HUB_UTILS;
  const MR = HUB_METRICS_RECRUTAMENTO;
  const { kpi, empty, card, insightsCard, insightsList, noDataGate, barChart, lineChart, doughnutChart, topRows } = HUB_UI;

  function canManage() { return HUB_PERMISSIONS.hasPerm(HUB_USER, 'recrutamento.vagas'); }

  function vagaRankRow(v, valueLabel) {
    return `<tr><td>${U.escapeHtml(v.cargo || '')}</td><td>${U.escapeHtml(v.id)} · ${U.escapeHtml(v.unidade || '')}</td><td>${valueLabel}</td></tr>`;
  }

  function rankTable(rows, cols) {
    if (!rows.length) return empty('Sem registros.');
    return `<div class="table-wrap"><table class="dt"><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // Gestor: só enxerga o volume/status das vagas do próprio escopo (já
  // restrito por unidade/departamento via RLS) e o andamento dos processos
  // seletivos — nada de indicadores que meçam desempenho de recrutador(a)
  // (SLA, taxa de conversão, no-show, fontes, rankings). RH e Administrador
  // continuam vendo o dashboard completo, igual ao Sfera Recruiter original.
  function visaoBasica() { return HUB_USER && HUB_USER.perfil === 'gestor'; }

  function renderRecrutamentoDashboard(el, f) {
    if (noDataGate(el, ['vagas'], canManage(), 'Cadastre vagas em Recrutamento → Controle de Vagas — os indicadores aparecem aqui automaticamente, sem upload.', HUB_RECRUIT_DATA)) return;
    const d = MR.recrutamentoMetrics(f);
    const k = d.kpis, sc = d.slaConsolidado, fc = d.fitConsolidado, c = d.charts, r = d.rankings;

    if (visaoBasica()) { renderVisaoBasica(el, k, c); return; }

    el.innerHTML = `
      <div class="kpi-grid">
        ${kpi('Vagas em aberto', U.fmtInt(k.emAberto), '', 'var(--p1)')}
        ${kpi('Vagas em andamento', U.fmtInt(k.emAndamento), '', '#eda100')}
        ${kpi('Finalizadas no mês', U.fmtInt(k.fechadasMes), '', '#1baf7a')}
        ${kpi('Backlog', U.fmtInt(k.backlog), 'em aberto/andamento desde antes deste mês', k.backlog > 0 ? 'var(--warning)' : '#1baf7a')}
        ${kpi('Em admissão', U.fmtInt(k.emAdm), '', '#4a3aa7')}
        ${kpi('SLA médio', U.fmt1(k.slaMedio) + ' dias', 'vagas finalizadas', '#e87ba4')}
        ${kpi('SLA expirado', U.fmtInt(k.slaExpirado), `${U.fmt1(k.dentroSLA)}% dentro do SLA`, k.slaExpirado > 0 ? 'var(--critical)' : '#1baf7a')}
        ${kpi('Taxa de conversão', U.fmt1(k.conversao) + '%', 'finalizadas / total', 'var(--p2)')}
        ${kpi('Candidatos ativos', U.fmtInt(k.candAtivos), `média ${U.fmt1(k.candPorVaga)} por vaga aberta`, 'var(--p1)')}
        ${kpi('Entrevistas (7 dias)', U.fmtInt(k.prox7), '', '#1baf7a')}
        ${kpi('Taxa de no-show geral', U.fmt1(k.noShowGeral.pct) + '%', `${U.fmtInt(k.noShowGeral.noShows)} de ${U.fmtInt(k.noShowGeral.total)}`, k.noShowGeral.pct > 15 ? 'var(--critical)' : 'var(--p2)')}
        ${kpi('No-show — Entrevista RH', U.fmt1(k.noShowRH.pct) + '%', `${U.fmtInt(k.noShowRH.noShows)} de ${U.fmtInt(k.noShowRH.total)}`, k.noShowRH.pct > 15 ? 'var(--critical)' : 'var(--p2)')}
        ${kpi('No-show — Entrevista Gestor', U.fmt1(k.noShowGestor.pct) + '%', `${U.fmtInt(k.noShowGestor.noShows)} de ${U.fmtInt(k.noShowGestor.total)}`, k.noShowGestor.pct > 15 ? 'var(--critical)' : 'var(--p2)')}
        ${kpi('Vagas congeladas', U.fmtInt(k.congeladas), '', k.congeladas > 0 ? 'var(--warning)' : '#1baf7a')}
      </div>

      <h3 style="font-size:13px;margin:6px 0 12px">SLA consolidado por etapa</h3>
      <div class="kpi-grid">
        ${kpi('SLA Etapa RH', sc.rh.media !== null ? U.fmt1(sc.rh.media) + 'd' : '—', `${sc.rh.count} registro(s) · ${sc.rh.vagas} vaga(s)`, sc.rh.media > 7 ? 'var(--critical)' : (sc.rh.media > 3 ? 'var(--warning)' : '#1baf7a'))}
        ${kpi('SLA Etapa Análise', sc.analise.media !== null ? U.fmt1(sc.analise.media) + 'd' : '—', `${sc.analise.count} registro(s) · ${sc.analise.vagas} vaga(s)`, sc.analise.media > 7 ? 'var(--critical)' : (sc.analise.media > 3 ? 'var(--warning)' : '#1baf7a'))}
        ${kpi('SLA Etapa Checagem', sc.checagem.media !== null ? U.fmt1(sc.checagem.media) + 'd' : '—', `${sc.checagem.count} registro(s) · ${sc.checagem.vagas} vaga(s)`, sc.checagem.media > 7 ? 'var(--critical)' : (sc.checagem.media > 3 ? 'var(--warning)' : '#1baf7a'))}
        ${kpi('SLA Etapa Gestor', sc.gestor.media !== null ? U.fmt1(sc.gestor.media) + 'd' : '—', `${sc.gestor.count} registro(s) · ${sc.gestor.vagas} vaga(s)`, sc.gestor.media > 7 ? 'var(--critical)' : (sc.gestor.media > 3 ? 'var(--warning)' : '#1baf7a'))}
        ${kpi('SLA Admissão', sc.admissao.media !== null ? U.fmt1(sc.admissao.media) + 'd' : '—', `${sc.admissao.count} vaga(s) com admissão`, '#4a3aa7')}
      </div>

      <h3 style="font-size:13px;margin:6px 0 12px">FIT consolidado — candidatos</h3>
      <div class="kpi-grid">
        ${kpi('Melhor FIT', fc.melhor !== null ? U.fmtInt(fc.melhor) + '%' : '—', fc.candMelhor ? U.escapeHtml(fc.candMelhor.nome) : 'Sem candidatos', '#1baf7a')}
        ${kpi('Menor FIT', fc.menor !== null ? U.fmtInt(fc.menor) + '%' : '—', fc.candMenor ? U.escapeHtml(fc.candMenor.nome) : 'Sem candidatos', fc.menor !== null && fc.menor < 60 ? 'var(--critical)' : 'var(--warning)')}
        ${kpi('Média geral FIT', fc.media !== null ? U.fmt1(fc.media) + '%' : '—', `${U.fmtInt(fc.totalCandidatos)} candidato(s)`, 'var(--p2)')}
        ${kpi('FIT de contratação', fc.mediaContratados !== null ? U.fmt1(fc.mediaContratados) + '%' : '—', `${U.fmtInt(fc.totalContratados)} contratado(s)`, 'var(--p1)')}
      </div>

      <div class="grid2">
        ${insightsCard('Alertas e ações recomendadas', '&#9888;&#65039;', insightsList(d.alertas), { full: true })}
        ${card('Vagas abertas por unidade', '&#127970;', c.porUnidade.length ? '<div class="chart-h"><canvas id="c-rc-unidade"></canvas></div>' : empty('Sem dados.'))}
        ${card('Distribuição por status', '&#128202;', c.porStatus.length ? '<div class="chart-h"><canvas id="c-rc-status"></canvas></div>' : empty('Sem dados.'))}
        ${card('Evolução mensal — abertas x fechadas', '&#128200;', c.evolucaoMensal.length ? '<div class="chart-h tall"><canvas id="c-rc-evolucao"></canvas></div>' : empty('Sem dados.'), { full: true })}
        ${card('SLA médio por recrutador(a)', '&#129504;', c.slaPorRecrutador.length ? '<div class="chart-h"><canvas id="c-rc-slarecrut"></canvas></div>' : empty('Sem dados.'))}
        ${card('Funil — vagas por etapa', '&#128268;', '<div class="chart-h"><canvas id="c-rc-funil"></canvas></div>')}
        ${card('SLA por etapa (dias médios x meta)', '&#9203;', '<div class="chart-h"><canvas id="c-rc-slaetapa"></canvas></div>')}
        ${card('Distribuição por fonte', '&#127919;', c.fontes.length ? '<div class="chart-h"><canvas id="c-rc-fonte"></canvas></div>' : empty('Sem dados.'))}
        ${card('Eficiência por fonte (% conversão)', '&#128200;', c.eficienciaPorFonte.length ? '<div class="chart-h"><canvas id="c-rc-efic"></canvas></div>' : empty('Sem dados.'))}
        ${card('Top motivos de reprovação/desistência', '&#128683;', c.motivosReprovacao.length ? '<div class="chart-h"><canvas id="c-rc-motivos"></canvas></div>' : empty('Sem dados.'))}
        ${card('Entrevistas por recrutador(a)', '&#128100;', c.entrevistasPorRecrutador.length ? '<div class="chart-h"><canvas id="c-rc-entrrec"></canvas></div>' : empty('Sem dados.'))}
        ${card('Entrevistas agendadas — próximos 14 dias', '&#128197;', '<div class="chart-h"><canvas id="c-rc-entrdia"></canvas></div>')}
        ${card('Aging das vagas em aberto', '&#8987;', '<div class="chart-h"><canvas id="c-rc-aging"></canvas></div>')}
      </div>

      <h3 style="font-size:13px;margin:20px 0 12px">Rankings e produtividade</h3>
      <div class="grid2">
        ${card('Top recrutadores(as) — vagas fechadas', '&#127942;', topRows(r.topRecrutadoresFinalizadas, 'Vagas fechadas'))}
        ${card('Vagas críticas (maior tempo aberto)', '&#128680;', rankTable(r.vagasCriticas.map(v => vagaRankRow(v, v.sla + 'd')).join(''), ['Cargo', 'Vaga', 'Dias']))}
        ${card('Vagas com melhor desempenho', '&#127894;', rankTable(r.vagasMelhores.map(v => vagaRankRow(v, v.sla + 'd')).join(''), ['Cargo', 'Vaga', 'Dias']))}
        ${card('Top fontes mais eficientes', '&#128225;', topRows(r.topFontes.map(x => ({ label: x.label, value: x.value })), '% conversão'))}
        ${card('Top motivos de perda', '&#10060;', topRows(r.topMotivos, 'Casos'))}
        ${card('Entrevistas por recrutador(a)', '&#127939;', topRows(r.topEntrevistasPorRecrutador, 'Entrevistas'))}
      </div>`;

    if (c.porUnidade.length) barChart('c-rc-unidade', c.porUnidade.map(x => x.label), c.porUnidade.map(x => x.value));
    if (c.porStatus.length) doughnutChart('c-rc-status', c.porStatus.map(x => x.label), c.porStatus.map(x => x.value));
    if (c.evolucaoMensal.length) {
      lineChart('c-rc-evolucao', c.evolucaoMensal.map(x => x.label), [
        { label: 'Abertas', data: c.evolucaoMensal.map(x => x.abertas) },
        { label: 'Fechadas', data: c.evolucaoMensal.map(x => x.fechadas) }
      ]);
    }
    if (c.slaPorRecrutador.length) barChart('c-rc-slarecrut', c.slaPorRecrutador.map(x => x.label), c.slaPorRecrutador.map(x => x.value), { horizontal: true });
    barChart('c-rc-funil', c.funilPorEtapa.map(x => x.label), c.funilPorEtapa.map(x => x.value), { horizontal: true });
    barChart('c-rc-slaetapa', c.slaPorEtapa.map(x => x.label), c.slaPorEtapa.map(x => x.value), { horizontal: true });
    if (c.fontes.length) doughnutChart('c-rc-fonte', c.fontes.map(x => x.label), c.fontes.map(x => x.value));
    if (c.eficienciaPorFonte.length) barChart('c-rc-efic', c.eficienciaPorFonte.map(x => x.label), c.eficienciaPorFonte.map(x => x.value), { horizontal: true, pct: false });
    if (c.motivosReprovacao.length) barChart('c-rc-motivos', c.motivosReprovacao.map(x => x.label), c.motivosReprovacao.map(x => x.value), { horizontal: true });
    if (c.entrevistasPorRecrutador.length) barChart('c-rc-entrrec', c.entrevistasPorRecrutador.map(x => x.label), c.entrevistasPorRecrutador.map(x => x.value));
    barChart('c-rc-entrdia', c.entrevistasProximos14.map(x => x.label), c.entrevistasProximos14.map(x => x.value));
    barChart('c-rc-aging', c.aging.map(x => x.label), c.aging.map(x => x.value), { horizontal: true });
  }

  // Visão básica (perfil gestor) — só volume/status de vagas e processos
  // seletivos do escopo dele, sem nenhum indicador de produtividade de
  // recrutador(a).
  function renderVisaoBasica(el, k, c) {
    el.innerHTML = `
      <div class="insight info" style="margin-bottom:16px"><span class="ic">&#8505;&#65039;</span><span>Visão básica de Recrutamento — mostra as vagas e processos seletivos do seu escopo. Indicadores de produtividade do time de recrutamento ficam disponíveis só para RH e Administração.</span></div>
      <div class="kpi-grid">
        ${kpi('Vagas em aberto', U.fmtInt(k.emAberto), '', 'var(--p1)')}
        ${kpi('Vagas em andamento', U.fmtInt(k.emAndamento), '', '#eda100')}
        ${kpi('Finalizadas no mês', U.fmtInt(k.fechadasMes), '', '#1baf7a')}
        ${kpi('Backlog', U.fmtInt(k.backlog), 'em aberto/andamento desde antes deste mês', k.backlog > 0 ? 'var(--warning)' : '#1baf7a')}
        ${kpi('Em admissão', U.fmtInt(k.emAdm), '', '#4a3aa7')}
        ${kpi('Vagas congeladas', U.fmtInt(k.congeladas), '', k.congeladas > 0 ? 'var(--warning)' : '#1baf7a')}
        ${kpi('Candidatos ativos', U.fmtInt(k.candAtivos), `média ${U.fmt1(k.candPorVaga)} por vaga aberta`, 'var(--p1)')}
        ${kpi('Entrevistas (7 dias)', U.fmtInt(k.prox7), '', '#1baf7a')}
      </div>
      <div class="grid2">
        ${card('Vagas abertas por unidade', '&#127970;', c.porUnidade.length ? '<div class="chart-h"><canvas id="c-rc-unidade"></canvas></div>' : empty('Sem dados.'))}
        ${card('Distribuição por status', '&#128202;', c.porStatus.length ? '<div class="chart-h"><canvas id="c-rc-status"></canvas></div>' : empty('Sem dados.'))}
        ${card('Evolução mensal — abertas x fechadas', '&#128200;', c.evolucaoMensal.length ? '<div class="chart-h tall"><canvas id="c-rc-evolucao"></canvas></div>' : empty('Sem dados.'), { full: true })}
        ${card('Funil — vagas por etapa', '&#128268;', '<div class="chart-h"><canvas id="c-rc-funil"></canvas></div>', { full: true })}
      </div>`;

    if (c.porUnidade.length) barChart('c-rc-unidade', c.porUnidade.map(x => x.label), c.porUnidade.map(x => x.value));
    if (c.porStatus.length) doughnutChart('c-rc-status', c.porStatus.map(x => x.label), c.porStatus.map(x => x.value));
    if (c.evolucaoMensal.length) {
      lineChart('c-rc-evolucao', c.evolucaoMensal.map(x => x.label), [
        { label: 'Abertas', data: c.evolucaoMensal.map(x => x.abertas) },
        { label: 'Fechadas', data: c.evolucaoMensal.map(x => x.fechadas) }
      ]);
    }
    barChart('c-rc-funil', c.funilPorEtapa.map(x => x.label), c.funilPorEtapa.map(x => x.value), { horizontal: true });
  }

  window.HUB_SECTIONS = window.HUB_SECTIONS || {};
  window.HUB_SECTIONS.renderRecrutamentoDashboard = renderRecrutamentoDashboard;
})();
