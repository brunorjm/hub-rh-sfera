// Indicadores da Pesquisa de Engajamento — SÓ participação (convidados ×
// responderam), por pulso, unidade e departamento. Lê HUB_DATA.engajamento_pulso
// e HUB_DATA.engajamento_participacao (ver dal-engajamento.js); nada aqui toca
// em resposta, nota ou comentário.
//
// De onde vem cada número (planilha 33 → tabelas engajamento_*):
//   • Total oficial de cada pulso (convidados/respondentes): aba Adesão da planilha.
//     Sem filtro, é o número mostrado nos cartões.
//   • Respondentes por unidade/departamento: contados nas Respostas e ajustados ao total
//     oficial do pulso.
//   • Base de convidados por unidade/departamento: "foto" do headcount ativo gravada no
//     pulso mais recente a cada upload (congela quando o pulso encerra). Nos pulsos
//     anteriores à foto usa-se o headcount ativo ATUAL (planilha de Colaboradores) —
//     percentual ESTIMADO, sinalizado com "~" na tela.
(function () {
  const U = HUB_UTILS;
  // Meta de participação acordada com o RH (60%). Para mudar, altere aqui.
  const META = 0.6;
  // Abaixo disso a unidade/departamento aparece como "Crítico" (vermelho).
  const LIMITE_CRITICO = 0.4;
  // Equipes até esse tamanho: cada resposta pesa muito no percentual.
  const EQUIPE_PEQUENA = 3;
  // Intervalo máximo entre dois pulsos para contar como semanal (senão, mensal).
  const DIAS_SEMANAL = 8;

  const norm = U.normalizeText;
  const chave = (u, d) => norm(u) + '|' + norm(d);

  function pulsosOrdenados() {
    return (window.HUB_DATA.engajamento_pulso || []).slice().sort((a, b) => a.inicio.localeCompare(b.inicio));
  }

  function hojeLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function dias(deIso, ateIso) {
    return Math.round((new Date(ateIso + 'T12:00:00Z') - new Date(deIso + 'T12:00:00Z')) / 86400000);
  }
  const fmtDM = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '';

  function statusDe(pct) {
    if (pct === null || pct === undefined) return 'sem';
    if (pct >= META) return 'ok';
    if (pct >= LIMITE_CRITICO) return 'atencao';
    return 'critico';
  }
  // Quantas respostas a mais para chegar na meta (0 se já atingiu).
  function faltamMeta(conv, resp) {
    if (!conv) return 0;
    return Math.max(0, Math.ceil(META * conv - 1e-9) - resp);
  }

  // Quem vê a empresa inteira (RLS sem recorte): admin, ou RH/gestor sem
  // unidade/departamento restritos. Só nesse caso o total oficial do pulso
  // (tabela engajamento_pulso) representa o que a pessoa enxerga.
  function escopoTotal() {
    const u = window.HUB_USER || {};
    if (u.perfil === 'admin') return true;
    return !(u.unidades || []).length && !(u.departamentos || []).length;
  }
  const semFiltro = f => !(f.unidade && f.unidade.length) && !(f.departamento && f.departamento.length) && !f.gestor;

  function rotuloCurto(p) { return p.numero ? `${p.numero}º` : fmtDM(p.inicio); }
  function rotuloLongo(p) { return p.numero ? `${p.numero}º pulso` : `Pulso de ${fmtDM(p.inicio)}`; }
  function periodo(p) { return `${fmtDM(p.inicio)} a ${fmtDM(p.fim)}`; }

  function agregar(linhas) {
    let resp = 0, conv = 0, respBase = 0, est = false;
    for (const l of linhas) {
      resp += l.resp;
      if (l.conv !== null && l.conv !== undefined) { conv += l.conv; respBase += l.resp; }
      if (l.est) est = true;
    }
    const temBase = linhas.some(l => l.conv !== null && l.conv !== undefined);
    return {
      resp, conv: temBase ? conv : null,
      pend: temBase ? Math.max(0, conv - respBase) : null,
      pct: temBase && conv > 0 ? respBase / conv : null,
      est, n: linhas.length
    };
  }

  function engajamentoMetrics(f, opts) {
    opts = opts || {};
    const todos = pulsosOrdenados();
    if (!todos.length) return { temDados: false };

    const partPorPulso = new Map();
    for (const r of (window.HUB_DATA.engajamento_participacao || [])) {
      if (!partPorPulso.has(r.pulso_inicio)) partPorPulso.set(r.pulso_inicio, []);
      partPorPulso.get(r.pulso_inicio).push(r);
    }

    // Cadência: intervalo até o pulso anterior (≤ 8 dias = semanal, senão mensal).
    const cadencia = new Map();
    todos.forEach((p, i) => {
      const gap = i > 0 ? dias(todos[i - 1].inicio, p.inicio) : (todos[1] ? dias(p.inicio, todos[1].inicio) : 7);
      cadencia.set(p.inicio, gap <= DIAS_SEMANAL ? 'Semanal' : 'Mensal');
    });

    // Referência para estimar os pulsos sem "foto": headcount ativo atual (Colaboradores).
    const ref = new Map();
    for (const c of (window.HUB_DATA.colaboradores || [])) {
      if (norm(c.situacao) !== 'ativo' || !c.unidade || !c.departamento) continue;
      const k = chave(c.unidade, c.departamento);
      if (!ref.has(k)) ref.set(k, { unidade: c.unidade, departamento: c.departamento, conv: 0, gestores: new Map() });
      const h = ref.get(k);
      h.conv++;
      if (c.gestor_direto) h.gestores.set(c.gestor_direto, (h.gestores.get(c.gestor_direto) || 0) + 1);
    }
    for (const h of ref.values()) {
      h.gestor = Array.from(h.gestores.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).map(e => e[0])[0] || null;
    }

    function linhasDe(p) {
      const rows = partPorPulso.get(p.inicio) || [];
      const temFoto = rows.some(r => r.convidados !== null && r.convidados !== undefined);
      const out = [];
      const vistos = new Set();
      const add = (unidade, departamento, gestorRow, convRow, resp) => {
        const rf = ref.get(chave(unidade, departamento));
        const gestor = gestorRow || (rf && rf.gestor) || null;
        if (!U.matchesAny(unidade, f.unidade)) return;
        if (!U.matchesAny(departamento, f.departamento)) return;
        if (f.gestor && !U.normIncludes(gestor, f.gestor)) return;
        const proprio = convRow !== null && convRow !== undefined;
        out.push({
          unidade: unidade || 'Sem unidade', departamento: departamento || 'Sem departamento', gestor,
          conv: proprio ? convRow : (rf ? rf.conv : null), resp: resp || 0, est: !proprio
        });
      };
      for (const r of rows) { add(r.unidade, r.departamento, r.gestor, r.convidados, r.respondentes); vistos.add(chave(r.unidade, r.departamento)); }
      // Pulsos sem "foto" só têm as linhas com resposta: acrescenta os departamentos do
      // headcount ativo que não responderam (0%), para aparecerem na lista.
      if (!temFoto) for (const [k, h] of ref) if (!vistos.has(k)) add(h.unidade, h.departamento, h.gestor, null, 0);
      return out;
    }

    function visao(p) {
      if (semFiltro(f) && escopoTotal()) {
        return { resp: p.respondentes, conv: p.convidados, pend: Math.max(0, p.convidados - p.respondentes),
          pct: p.convidados ? p.respondentes / p.convidados : null, est: false, oficial: true, n: 0 };
      }
      return agregar(linhasDe(p));
    }

    const noPeriodo = todos.filter(p => U.inRange(p.inicio, f.start, f.end));
    if (!noPeriodo.length) return { temDados: true, vazio: true, pulsos: [] };

    const serie = noPeriodo.map(p => Object.assign({ p, rotulo: rotuloCurto(p), rotuloLongo: rotuloLongo(p), periodo: periodo(p), cadencia: cadencia.get(p.inicio) }, visao(p), {}))
      .map(s => Object.assign(s, { status: statusDe(s.pct) }));
    const achado = serie.findIndex(s => s.p.inicio === opts.pulso);
    const iSel = achado >= 0 ? achado : serie.length - 1;
    const sel = serie[iSel];
    const anterior = iSel > 0 ? serie[iSel - 1] : null;
    const comPct = serie.filter(s => s.pct !== null);
    const media = comPct.length ? comPct.reduce((a, s) => a + s.pct, 0) / comPct.length : null;

    // ---- Detalhe do pulso selecionado ---------------------------------------
    const linhas = linhasDe(sel.p);
    const porUnidade = new Map();
    for (const l of linhas) {
      const k = norm(l.unidade);
      if (!porUnidade.has(k)) porUnidade.set(k, { label: l.unidade, linhas: [] });
      porUnidade.get(k).linhas.push(l);
    }
    const unidades = Array.from(porUnidade.values()).map(g => {
      const a = agregar(g.linhas);
      return Object.assign({ label: g.label, deptos: g.linhas.length, status: statusDe(a.pct), faltam: faltamMeta(a.conv, a.resp) }, a);
    }).sort((a, b) => (a.pct === null) - (b.pct === null) || a.pct - b.pct || a.label.localeCompare(b.label, 'pt-BR'));

    const departamentos = linhas.map(l => {
      const pct = l.conv ? l.resp / l.conv : null;
      return {
        unidade: l.unidade, departamento: l.departamento, gestor: l.gestor, conv: l.conv, resp: l.resp,
        pend: l.conv === null ? null : Math.max(0, l.conv - l.resp), pct, status: statusDe(pct),
        faltam: faltamMeta(l.conv, l.resp), pequena: l.conv !== null && l.conv <= EQUIPE_PEQUENA, est: l.est
      };
    });

    const porGestor = new Map();
    for (const l of linhas) {
      const k = l.gestor ? norm(l.gestor) : '';
      if (!porGestor.has(k)) porGestor.set(k, { label: l.gestor || 'Sem gestor identificado', linhas: [] });
      porGestor.get(k).linhas.push(l);
    }
    const gestores = Array.from(porGestor.values()).map(g => {
      const a = agregar(g.linhas);
      return Object.assign({
        label: g.label, deptos: g.linhas.length,
        unidades: Array.from(new Set(g.linhas.map(l => l.unidade))).sort((x, y) => x.localeCompare(y, 'pt-BR')),
        status: statusDe(a.pct), faltam: faltamMeta(a.conv, a.resp)
      }, a);
    }).filter(g => g.pend > 0).sort((a, b) => b.faltam - a.faltam || b.pend - a.pend || a.label.localeCompare(b.label, 'pt-BR'));

    const prioridades = departamentos.filter(d => d.faltam > 0)
      .sort((a, b) => b.faltam - a.faltam || (a.pct - b.pct) || a.departamento.localeCompare(b.departamento, 'pt-BR'));

    // ---- Unidades × pulsos --------------------------------------------------
    const matrizMap = new Map();
    serie.forEach((s, j) => {
      const g = new Map();
      for (const l of linhasDe(s.p)) {
        const k = norm(l.unidade);
        if (!g.has(k)) g.set(k, { label: l.unidade, linhas: [] });
        g.get(k).linhas.push(l);
      }
      for (const [k, v] of g) {
        if (!matrizMap.has(k)) matrizMap.set(k, { label: v.label, celulas: new Array(serie.length).fill(null) });
        matrizMap.get(k).celulas[j] = agregar(v.linhas);
      }
    });
    const matriz = Array.from(matrizMap.values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

    // ---- Leituras rápidas ---------------------------------------------------
    const hoje = hojeLocal();
    const insights = [];
    const pct0 = v => U.fmtPct(v, 0);
    if (sel.pct !== null) {
      if (sel.pct >= META) {
        insights.push({ tipo: 'info', texto: `Adesão de ${pct0(sel.pct)} (${U.fmtInt(sel.resp)} de ${U.fmtInt(sel.conv)}): meta de ${pct0(META)} atingida.` });
      } else {
        const falta = faltamMeta(sel.conv, sel.resp);
        let t = `Adesão de ${pct0(sel.pct)} (${U.fmtInt(sel.resp)} de ${U.fmtInt(sel.conv)}): faltam ${U.fmtInt(falta)} resposta(s) para chegar à meta de ${pct0(META)}.`;
        if (sel.p.parcial && sel.p.fim >= hoje) {
          const d = dias(hoje, sel.p.fim);
          t += d === 0 ? ' O pulso encerra hoje.' : ` O pulso encerra em ${d} dia(s) (${fmtDM(sel.p.fim)}).`;
        }
        insights.push({ tipo: 'alerta', texto: t });
      }
    }
    const criticas = unidades.filter(u => u.status === 'critico');
    if (criticas.length) insights.push({ tipo: 'alerta', texto: `${criticas.length} unidade(s) abaixo de ${pct0(LIMITE_CRITICO)}: ${criticas.slice(0, 5).map(u => `${u.label} (${pct0(u.pct)})`).join(', ')}${criticas.length > 5 ? '…' : ''}.` });
    if (prioridades.length && sel.pct !== null && sel.pct < META) {
      insights.push({ tipo: 'acao', texto: `Onde mais ganhar respostas: ${prioridades.slice(0, 3).map(d => `${d.departamento} (${d.unidade}, faltam ${d.faltam})`).join('; ')}. Veja a aba "Plano de ação".` });
    }
    if (sel.p.parcial && sel.p.fim < hoje) {
      insights.push({ tipo: 'acao', texto: `O período deste pulso terminou em ${fmtDM(sel.p.fim)}, mas o último arquivo importado ainda é parcial — suba o export final do Feedz em Administração → Upload de Planilhas.` });
    } else if (sel.p.parcial && sel.p.atualizado_em) {
      const atraso = dias(String(sel.p.atualizado_em).slice(0, 10), hoje);
      if (atraso >= 2) insights.push({ tipo: 'info', texto: `Os números deste pulso foram atualizados há ${atraso} dias — suba um export novo do Feedz para acompanhar o andamento.` });
    }

    // Só pulsos fechados contam nesse retrospecto (o parcial ainda está em andamento).
    const fechados = comPct.filter(s => !s.p.parcial);
    const naMeta = fechados.filter(s => s.pct >= META).length;
    if (fechados.length >= 3) {
      insights.push({ tipo: 'info', texto: `Nos pulsos já encerrados, a meta de ${pct0(META)} foi atingida em ${naMeta} de ${fechados.length}. Maior adesão: ${pct0(Math.max(...fechados.map(s => s.pct)))}.` });
    }

    const diasRestantes = sel.p.parcial && sel.p.fim >= hoje ? dias(hoje, sel.p.fim) : null;
    const primeiraMensal = serie.find(s => s.cadencia === 'Mensal' && s.p.inicio > (serie[0].p.inicio));
    const temSemanal = serie.some(s => s.cadencia === 'Semanal');
    return {
      temDados: true, vazio: false, meta: META, limiteCritico: LIMITE_CRITICO, equipePequena: EQUIPE_PEQUENA,
      pulsos: serie, sel, anterior, media, diasRestantes, primeiraMensal: primeiraMensal || null,
      mistura: temSemanal && !!primeiraMensal, naMeta, fechados: fechados.length,
      faltamMeta: faltamMeta(sel.conv, sel.resp),
      unidades, departamentos, gestores, prioridades, matriz, insights, totalLinhas: agregar(linhas),
      estimado: sel.est, temHistoricoEstimado: serie.some(s => s.est)
    };
  }

  window.HUB_METRICS_ENGAJAMENTO = { engajamentoMetrics, META, LIMITE_CRITICO, EQUIPE_PEQUENA, statusDe, faltamMeta };
})();
