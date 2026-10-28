// Cálculo dos indicadores de Recrutamento a partir de window.HUB_RECRUIT_DATA
// (vagas/candidatos/entrevistas, recarregadas sempre que se entra no módulo —
// ver dal-recrutamento.js). Portado das funções de cálculo do Dashboard do
// Sfera Recruiter original (renderKPIs, renderSLAConsolidadoCards,
// renderFITConsolidadoCards, renderAlertasExec, renderCharts, renderRankings,
// renderDashExtras) — a lógica de negócio é a mesma, só separada da
// renderização (que fica em sections/recrutamento-dashboard.js, usando os
// componentes visuais de ui-charts.js) e adaptada para ler os filtros
// compartilhados da barra superior do hub (data início/fim, unidade,
// departamento) em vez do painel de filtros próprio que o app original tinha.
//
// "Unidade" do filtro compartilhado do hub mapeia para vaga.unidade — mesma
// escolha feita no RLS, ver nota na seção 4 de supabase-migration.sql.
(function () {
  const U = HUB_UTILS;

  const ETAPAS = ['Divulgação', 'Triagem', 'Entrevista (RH)', 'Entrevista (Gestor)', 'Proposta', 'Admissão'];
  const SLA_META_DIAS = 30;
  const SLA_META_POR_ETAPA = { 'Divulgação': 3, 'Triagem': 5, 'Entrevista (RH)': 5, 'Entrevista (Gestor)': 7, 'Proposta': 5, 'Admissão': 5 };

  function diasEntre(d1, d2) {
    if (!d1) return 0;
    const date1 = new Date(d1);
    const date2 = d2 ? new Date(d2) : new Date();
    return Math.max(0, Math.floor((date2 - date1) / 86400000));
  }

  function calcularSLA(vaga) {
    const dataFim = (vaga.status === 'Finalizada' || vaga.status === 'Cancelada') ? vaga.dataFechamento : null;
    return diasEntre(vaga.dataAbertura, dataFim);
  }

  function statusSLA(vaga) {
    const sla = calcularSLA(vaga);
    if (vaga.status === 'Finalizada' || vaga.status === 'Cancelada') return sla > SLA_META_DIAS ? 'Expirou SLA' : 'No Prazo';
    if (vaga.status === 'Congelado') return 'No Prazo';
    if (sla > SLA_META_DIAS) return 'Expirou SLA';
    if ((sla / SLA_META_DIAS) * 100 > 80) return 'Atenção (>80%)';
    return 'No Prazo';
  }

  function slaEntreDatas(dContato, dAgendada) {
    if (!dContato || !dAgendada) return null;
    const c = new Date(dContato), a = new Date(dAgendada);
    if (isNaN(c) || isNaN(a)) return null;
    return Math.max(0, Math.round((a - c) / 86400000));
  }

  function slaAdmissaoVaga(vaga) {
    if (!vaga.dataFechamento || !vaga.dataPrevistaAdmissao) return null;
    return slaEntreDatas(vaga.dataFechamento, vaga.dataPrevistaAdmissao);
  }

  function fitContratadoDaVaga(vaga, candidatos) {
    const contratado = candidatos.find(c => c.vagaId === vaga.id && (c.resultadoFinal === 'Aprovado' || (c.dataAdmissao && c.dataAdmissao !== '')));
    if (contratado && typeof contratado.fitPct === 'number') return contratado.fitPct;
    if (vaga.contratado) {
      const byName = candidatos.find(c => c.vagaId === vaga.id && c.nome === vaga.contratado);
      if (byName && typeof byName.fitPct === 'number') return byName.fitPct;
    }
    if (vaga.status === 'Finalizada' && typeof vaga.fitPct === 'number' && vaga.fitPct > 0) return vaga.fitPct;
    return null;
  }

  function countBy(arr, keyFn) {
    const m = new Map();
    for (const x of arr) {
      const k = keyFn(x);
      if (k === null || k === undefined || k === '') continue;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  }

  // ------------------------------------------------------------------
  // Filtro: usa a barra superior compartilhada do hub (start/end sobre
  // vaga.dataAbertura, unidade sobre vaga.unidade, departamento sobre
  // vaga.departamento) — os filtros extras do dashboard original
  // (recrutador/vaga/nível/tipo/status) ficam só na tela operacional
  // "Controle de Vagas", que tem seu próprio painel de filtros mais rico.
  // ------------------------------------------------------------------
  function vagasFiltradas(f) {
    let rows = HUB_RECRUIT_DATA.vagas || [];
    if (f.start || f.end) rows = rows.filter(v => v.dataAbertura && U.inRange(v.dataAbertura, f.start, f.end));
    rows = rows.filter(v => U.matchesAny(v.unidade, f.unidade));
    rows = rows.filter(v => U.matchesAny(v.departamento, f.departamento));
    return rows;
  }

  function kpis(vagas, candidatos, entrevistas) {
    const emAberto = vagas.filter(v => v.status === 'Aberto').length;
    const emAndamento = vagas.filter(v => v.status === 'Andamento').length;
    const congeladas = vagas.filter(v => v.status === 'Congelado').length;
    const emAdm = vagas.filter(v => v.etapa === 'Admissão' && (v.status === 'Andamento' || v.status === 'Aberto')).length;
    const hj = new Date();
    const fechadasMes = vagas.filter(v => {
      if (v.status !== 'Finalizada' || !v.dataFechamento) return false;
      const df = new Date(v.dataFechamento);
      return df.getMonth() === hj.getMonth() && df.getFullYear() === hj.getFullYear();
    }).length;
    // Backlog: vagas Aberto/Andamento que já vinham de meses anteriores e
    // continuam sem fechar neste mês — não é "vagas em aberto" (esse já
    // conta tudo, incluindo as abertas este mês), é só o que "empilhou".
    const backlog = vagas.filter(v => {
      if (v.status !== 'Aberto' && v.status !== 'Andamento') return false;
      if (!v.dataAbertura) return false;
      const da = new Date(v.dataAbertura);
      return !(da.getMonth() === hj.getMonth() && da.getFullYear() === hj.getFullYear());
    }).length;
    const finalizadas = vagas.filter(v => v.status === 'Finalizada');
    const slaMedio = finalizadas.length ? (finalizadas.reduce((s, v) => s + calcularSLA(v), 0) / finalizadas.length) : 0;
    const slaExpirado = vagas.filter(v => (v.status === 'Aberto' || v.status === 'Andamento') && statusSLA(v) === 'Expirou SLA').length;
    const conversao = vagas.length ? (finalizadas.length / vagas.length) * 100 : 0;
    const dentroSLA = vagas.length ? ((vagas.length - slaExpirado) / vagas.length) * 100 : 100;

    const candAtivos = candidatos.filter(c => c.resultado === 'Em andamento').length;
    const abertas = emAberto + emAndamento;
    const candPorVaga = abertas ? candAtivos / abertas : 0;

    const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
    const prox7 = entrevistas.filter(e => {
      const d = new Date(e.data);
      return d >= hoje0 && d <= new Date(hoje0.getTime() + 7 * 86400000) && e.status === 'Agendada';
    }).length;

    function noShowRate(list) {
      const realizadasOuNoShow = list.filter(e => e.status === 'Realizado' || e.status === 'No Show').length;
      const noShows = list.filter(e => e.status === 'No Show').length;
      return { pct: realizadasOuNoShow ? (noShows / realizadasOuNoShow) * 100 : 0, noShows, total: realizadasOuNoShow };
    }
    const geral = noShowRate(entrevistas);
    const rh = noShowRate(entrevistas.filter(e => e.tipoEntrevista === 'RH'));
    const gestor = noShowRate(entrevistas.filter(e => e.tipoEntrevista === 'Gestor'));

    return {
      emAberto, emAndamento, abertas, congeladas, emAdm, fechadasMes, backlog,
      slaMedio, slaExpirado, conversao, dentroSLA,
      candAtivos, candPorVaga, prox7,
      noShowGeral: geral, noShowRH: rh, noShowGestor: gestor
    };
  }

  function slaConsolidado(vagas, candidatos) {
    const vagaIds = new Set(vagas.map(v => v.id));
    const cands = candidatos.filter(c => vagaIds.has(c.vagaId));
    function agrega(extract) {
      let soma = 0, n = 0; const vagasSet = new Set();
      for (const c of cands) {
        const s = extract(c);
        if (s !== null && s !== undefined && !isNaN(s)) { soma += s; n++; vagasSet.add(c.vagaId); }
      }
      return { media: n ? soma / n : null, count: n, vagas: vagasSet.size };
    }
    const rh = agrega(c => slaEntreDatas(c.dataContatoRh, c.dataAgendadaRh));
    const analise = agrega(c => slaEntreDatas(c.dataContatoAnalise, c.dataAgendadaAnalise));
    const checagem = agrega(c => slaEntreDatas(c.dataContatoChecagem, c.dataAgendadaChecagem));
    const gestor = agrega(c => slaEntreDatas(c.dataContatoGestor, c.dataAgendadaGestor));
    let somaAdm = 0, nAdm = 0;
    for (const v of vagas) { const s = slaAdmissaoVaga(v); if (s !== null) { somaAdm += s; nAdm++; } }
    const admissao = { media: nAdm ? somaAdm / nAdm : null, count: nAdm };
    return { rh, analise, checagem, gestor, admissao };
  }

  function fitConsolidado(vagas, candidatos) {
    const vagaIds = new Set(vagas.map(v => v.id));
    const cands = candidatos.filter(c => vagaIds.has(c.vagaId) && typeof c.fitPct === 'number' && c.fitPct > 0);
    const fits = cands.map(c => c.fitPct);
    const melhor = fits.length ? Math.max(...fits) : null;
    const menor = fits.length ? Math.min(...fits) : null;
    const media = fits.length ? fits.reduce((s, v) => s + v, 0) / fits.length : null;
    const candMelhor = fits.length ? cands.find(c => c.fitPct === melhor) : null;
    const candMenor = fits.length ? cands.find(c => c.fitPct === menor) : null;
    const fitsContratados = vagas.map(v => fitContratadoDaVaga(v, candidatos)).filter(v => v !== null && v > 0);
    const mediaContratados = fitsContratados.length ? fitsContratados.reduce((s, v) => s + v, 0) / fitsContratados.length : null;
    return { melhor, menor, media, candMelhor, candMenor, mediaContratados, totalCandidatos: fits.length, totalContratados: fitsContratados.length };
  }

  function alertas(vagas, candidatos, entrevistas) {
    const out = [];
    const slaExp = vagas.filter(v => (v.status === 'Aberto' || v.status === 'Andamento') && statusSLA(v) === 'Expirou SLA');
    if (slaExp.length) out.push({ tipo: 'alerta', texto: `${slaExp.length} vaga(s) com SLA expirado — revise estratégia, reforce divulgação ou realoque o recrutador responsável.` });

    const vagasSemCand = vagas.filter(v => {
      if (v.status !== 'Aberto' && v.status !== 'Andamento') return false;
      return calcularSLA(v) > 21 && !candidatos.some(c => c.vagaId === v.id);
    });
    if (vagasSemCand.length) out.push({ tipo: 'alerta', texto: `${vagasSemCand.length} vaga(s) sem candidatos há mais de 21 dias — considere ajustes em remuneração, perfil ou estratégia de captação.` });

    const hj = new Date(); hj.setHours(0, 0, 0, 0);
    const semFb = entrevistas.filter(e => e.status === 'Realizado' && (hj - new Date(e.data)) / 86400000 > 2 && !e.observacao);
    if (semFb.length) out.push({ tipo: 'acao', texto: `${semFb.length} entrevista(s) realizada(s) sem feedback registrado há mais de 2 dias.` });

    const emAdm = vagas.filter(v => v.etapa === 'Admissão' && v.status === 'Andamento');
    if (emAdm.length) out.push({ tipo: 'info', texto: `${emAdm.length} vaga(s) em fase de admissão — acompanhe documentação e preparação para o início.` });

    const noShows = entrevistas.filter(e => e.status === 'No Show' && (hj - new Date(e.data)) / 86400000 < 30);
    if (noShows.length > 2) out.push({ tipo: 'alerta', texto: `${noShows.length} no-shows nos últimos 30 dias — considere reforçar confirmação prévia antes das entrevistas.` });

    if (!out.length) out.push({ tipo: 'info', texto: 'Nenhum alerta crítico — operação saudável.' });
    return out;
  }

  function charts(vagas, candidatos, entrevistas) {
    const abertasAndamento = vagas.filter(v => v.status === 'Aberto' || v.status === 'Andamento');
    const porUnidade = countBy(abertasAndamento, v => v.unidade);
    const porStatus = countBy(vagas, v => v.status);

    const meses = new Map();
    for (const v of vagas) {
      if (v.dataAbertura) { const k = v.dataAbertura.slice(0, 7); if (!meses.has(k)) meses.set(k, { abertas: 0, fechadas: 0 }); meses.get(k).abertas++; }
      if (v.dataFechamento && v.status === 'Finalizada') { const k = v.dataFechamento.slice(0, 7); if (!meses.has(k)) meses.set(k, { abertas: 0, fechadas: 0 }); meses.get(k).fechadas++; }
    }
    const mesesOrd = Array.from(meses.keys()).sort();
    const evolucaoMensal = mesesOrd.map(k => ({ mes: k, label: U.monthLabel(k), abertas: meses.get(k).abertas, fechadas: meses.get(k).fechadas }));

    const recrutSla = new Map();
    for (const v of vagas) {
      if (!v.responsavel) continue;
      if (!recrutSla.has(v.responsavel)) recrutSla.set(v.responsavel, { total: 0, count: 0 });
      const e = recrutSla.get(v.responsavel);
      e.total += calcularSLA(v); e.count++;
    }
    const slaPorRecrutador = Array.from(recrutSla.entries()).map(([label, e]) => ({ label, value: e.count ? +(e.total / e.count).toFixed(1) : 0 })).sort((a, b) => b.value - a.value);

    const funilPorEtapa = ETAPAS.map(et => ({ label: et, value: abertasAndamento.filter(v => v.etapa === et).length }));

    const etapaStats = new Map(ETAPAS.map(e => [e, { total: 0, count: 0 }]));
    for (const v of abertasAndamento) { if (etapaStats.has(v.etapa)) { const e = etapaStats.get(v.etapa); e.total += calcularSLA(v); e.count++; } }
    const slaPorEtapa = ETAPAS.map(et => {
      const e = etapaStats.get(et);
      const media = e.count ? e.total / e.count : 0;
      return { label: et, value: +media.toFixed(1), meta: SLA_META_POR_ETAPA[et] || 5, acimaDaMeta: media > (SLA_META_POR_ETAPA[et] || 5) };
    });

    const fontesStats = new Map();
    for (const v of vagas) {
      if (!v.fonte) continue;
      if (!fontesStats.has(v.fonte)) fontesStats.set(v.fonte, { total: 0, fechadas: 0 });
      const e = fontesStats.get(v.fonte);
      e.total++; if (v.status === 'Finalizada') e.fechadas++;
    }
    const fontes = countBy(vagas.filter(v => v.fonte), v => v.fonte);
    const eficienciaPorFonte = Array.from(fontesStats.entries())
      .map(([label, e]) => ({ label, value: e.total ? +((e.fechadas / e.total) * 100).toFixed(0) : 0, fechadas: e.fechadas, total: e.total }))
      .sort((a, b) => b.value - a.value);

    const motivosReprovacao = countBy(candidatos.filter(c => c.motivoReprovacao), c => c.motivoReprovacao);
    const entrevistasPorRecrutador = countBy(entrevistas, e => e.recrutador);

    const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
    const entrevistasProximos14 = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(hoje0.getTime() + i * 86400000);
      const ds = d.toISOString().slice(0, 10);
      entrevistasProximos14.push({ label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), value: entrevistas.filter(e => e.data === ds && e.status === 'Agendada').length });
    }

    const buckets = [['0-7d', 0, 7], ['8-14d', 8, 14], ['15-21d', 15, 21], ['22-30d', 22, 30], ['30d+', 31, Infinity]];
    const aging = buckets.map(([label, min, max]) => ({
      label, value: abertasAndamento.filter(v => { const s = calcularSLA(v); return s >= min && s <= max; }).length
    }));

    return { porUnidade, porStatus, evolucaoMensal, slaPorRecrutador, funilPorEtapa, slaPorEtapa, fontes, eficienciaPorFonte, motivosReprovacao, entrevistasPorRecrutador, entrevistasProximos14, aging };
  }

  function rankings(vagas, candidatos, entrevistas) {
    const recrutadores = U.uniqueSorted(vagas.map(v => v.responsavel).concat(entrevistas.map(e => e.recrutador)).concat(candidatos.map(c => c.entrevistadoPor)));
    const prod = new Map(recrutadores.map(r => [r, { finalizadas: 0, slaTotal: 0, slaCount: 0, entrevistas: 0 }]));
    for (const v of vagas) {
      const p = prod.get(v.responsavel);
      if (!p) continue;
      if (v.status === 'Finalizada') { p.finalizadas++; p.slaTotal += calcularSLA(v); p.slaCount++; }
    }
    for (const e of entrevistas) { const p = prod.get(e.recrutador); if (p) p.entrevistas++; }

    const topRecrutadoresFinalizadas = Array.from(prod.entries())
      .map(([label, p]) => ({ label, value: p.finalizadas, sla: p.slaCount ? +(p.slaTotal / p.slaCount).toFixed(1) : null }))
      .filter(x => x.value > 0)
      .sort((a, b) => b.value - a.value).slice(0, 5);

    const abertas = vagas.filter(v => v.status === 'Aberto' || v.status === 'Andamento')
      .map(v => Object.assign({}, v, { sla: calcularSLA(v) })).sort((a, b) => b.sla - a.sla);
    const vagasCriticas = abertas.slice(0, 5);

    const finalizadas = vagas.filter(v => v.status === 'Finalizada');
    const vagasMelhores = [...finalizadas].sort((a, b) => calcularSLA(a) - calcularSLA(b)).slice(0, 5)
      .map(v => Object.assign({}, v, { sla: calcularSLA(v) }));

    const fonteStats = new Map();
    for (const v of vagas) {
      if (!v.fonte) continue;
      if (!fonteStats.has(v.fonte)) fonteStats.set(v.fonte, { total: 0, fechadas: 0 });
      const e = fonteStats.get(v.fonte);
      e.total++; if (v.status === 'Finalizada') e.fechadas++;
    }
    const topFontes = Array.from(fonteStats.entries())
      .map(([label, e]) => ({ label, total: e.total, fechadas: e.fechadas, value: e.total ? +((e.fechadas / e.total) * 100).toFixed(0) : 0 }))
      .sort((a, b) => b.value - a.value).slice(0, 5);

    const topMotivos = countBy(candidatos.filter(c => c.motivoReprovacao), c => c.motivoReprovacao).slice(0, 5);

    const topEntrevistasPorRecrutador = Array.from(prod.entries())
      .map(([label, p]) => ({ label, value: p.entrevistas }))
      .filter(x => x.value > 0)
      .sort((a, b) => b.value - a.value).slice(0, 5);

    return { topRecrutadoresFinalizadas, vagasCriticas, vagasMelhores, topFontes, topMotivos, topEntrevistasPorRecrutador };
  }

  function recrutamentoMetrics(f) {
    const vagas = vagasFiltradas(f);
    const vagaIds = new Set(vagas.map(v => v.id));
    const candidatos = (HUB_RECRUIT_DATA.candidatos || []).filter(c => vagaIds.has(c.vagaId));
    const entrevistas = (HUB_RECRUIT_DATA.entrevistas || []).filter(e => vagaIds.has(e.vagaId));

    return {
      total: vagas.length,
      kpis: kpis(vagas, candidatos, entrevistas),
      slaConsolidado: slaConsolidado(vagas, candidatos),
      fitConsolidado: fitConsolidado(vagas, candidatos),
      alertas: alertas(vagas, candidatos, entrevistas),
      charts: charts(vagas, candidatos, entrevistas),
      rankings: rankings(vagas, candidatos, entrevistas)
    };
  }

  window.HUB_METRICS_RECRUTAMENTO = { ETAPAS, SLA_META_DIAS, SLA_META_POR_ETAPA, calcularSLA, statusSLA, recrutamentoMetrics };
})();
