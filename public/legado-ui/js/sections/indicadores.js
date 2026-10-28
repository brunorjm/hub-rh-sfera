// Montagem do HTML + gráficos de cada tela do módulo Indicadores (exceto
// Recrutamento, que fica em sections/recrutamento-dashboard.js, e exceto
// Administração, que fica em js/admin/*). Cada renderX(container, filters)
// recebe os indicadores já calculados por metrics-indicadores.js e só cuida
// de layout/gráficos — os componentes visuais (kpi/card/gráficos) vêm de
// ui-charts.js, compartilhados com o indicador ao vivo de Recrutamento.
(function () {
  const U = HUB_UTILS;
  const M = HUB_METRICS;
  const { kpi, empty, card, insightsCard, insightsList, noDataGate, barChart, lineChart, doughnutChart, topRows } = HUB_UI;

  function canUpload() { return HUB_PERMISSIONS.hasPerm(HUB_USER, 'admin.upload'); }

  // Regra do galho no Headcount (e nos números de headcount do Dashboard):
  // sem indicadores.headcount_completo, a pessoa vê só a si mesma e a equipe
  // abaixo dela (direta e indireta), igual ao Organograma — ver js/galho.js.
  // Devolve os filtros com `galho` preenchido, ou null enquanto o galho carrega
  // (a tela é redesenhada sozinha quando ele chega).
  function comGalho(el, f) {
    if (HUB_PERMISSIONS.hasPerm(HUB_USER, 'indicadores.headcount_completo')) return f;
    const res = HUB_GALHO.cached();
    if (!res) {
      el.innerHTML = '<p class="sub" style="color:var(--muted);padding:24px">Carregando a sua equipe...</p>';
      HUB_GALHO.get().then(() => HUB_RENDER_CURRENT());
      return null;
    }
    return Object.assign({}, f, { galho: res.ids, galhoRes: res });
  }
  function avisoGalho(f) {
    if (!f.galho) return '';
    const texto = f.galho.size
      ? `Você está vendo só você e a sua equipe (quem responde a você, direta ou indiretamente): ${U.fmtInt(f.galho.size)} pessoa(s) na planilha de Colaboradores. A visão da empresa inteira fica liberada para RH e Administração.`
      : HUB_GALHO.motivo(f.galhoRes);
    return `<div class="insight info" style="margin-bottom:18px"><span class="ic">&#8505;&#65039;</span><span>${U.escapeHtml(texto)}</span></div>`;
  }

  // ==================================================================
  // DASHBOARD
  // ==================================================================
  // Módulos que só buscam os dados na primeira abertura da tela deles
  // (Avaliação da Experiência, Engajamento, Satisfação, Boletim): o Dashboard
  // dispara a busca e se redesenha quando ela termina. Uma falha não é
  // repetida a cada redesenho — o cartão mostra o erro até recarregar a página.
  const DASH_CARGA = { andamento: {}, falhou: {} };
  function dashCarga(chave, pronto, carregar) {
    if (pronto()) return 'ok';
    if (DASH_CARGA.falhou[chave]) return 'erro';
    if (!DASH_CARGA.andamento[chave]) {
      const fim = () => {
        delete DASH_CARGA.andamento[chave];
        const sec = document.getElementById('sec-dashboard');
        if (sec && sec.classList.contains('active') && window.HUB_RENDER_CURRENT) HUB_RENDER_CURRENT();
      };
      DASH_CARGA.andamento[chave] = carregar().then(fim).catch(err => { DASH_CARGA.falhou[chave] = (err && err.message) || 'erro'; fim(); });
    }
    return 'carregando';
  }

  // Cartão clicável: data-goto = seção para abrir; data-ave = ciclo da AvE.
  function kpiLink(html, attrs) {
    return html.replace('<div class="kpi"', `<div class="kpi kpi-link" role="button" tabindex="0" title="Abrir o módulo" ${attrs}`);
  }
  const kpiCarregando = (rotulo, estado, chave) => kpi(rotulo, '…', estado === 'erro' ? 'não consegui carregar: ' + U.escapeHtml(DASH_CARGA.falhou[chave] || '') : 'carregando…', 'var(--muted)');
  const CINZA = '#C9D0DA';
  const corDoFiltro = (labels, sel, base) => {
    if (!sel || sel.length !== 1) return undefined;
    const alvo = U.normalizeText(sel[0]);
    return labels.map((l, i) => U.normalizeText(l) === alvo ? (base ? base[i] : 'var(--p1)') : CINZA).map(c => c === 'var(--p1)' ? '#1C7CEC' : c);
  };

  function renderDashboard(el, f) {
    if (noDataGate(el, null, canUpload())) return;
    f = comGalho(el, f);
    if (!f) return;
    const d = M.dashboardMetrics(f);
    // Cada cartão/gráfico só aparece pra quem tem permissão de abrir o módulo
    // de onde ele vem — o Dashboard é a única tela sem permissão própria, e
    // antes mostrava os números de todos os módulos pra qualquer usuário.
    const pode = k => HUB_PERMISSIONS.hasPerm(HUB_USER, 'indicadores.' + k);
    const equipe = f.galho ? ' da sua equipe' : '';
    const semData = pode('rotatividade') && d.rot.semDataSaida
      ? `<div class="insight info" style="margin-bottom:18px"><span class="ic">&#8505;&#65039;</span><span>${U.fmtInt(d.rot.semDataSaida)} desligado(s)${equipe} estão sem "Último dia trabalhado" na planilha de Colaboradores e ficam fora do turnover e do gráfico de desligamentos (não dá pra saber em que mês saíram). Corrija a data na planilha e reenvie para eles entrarem na conta.</span></div>`
      : '';
    const go = s => `data-goto="${s}"`;
    const kpis = [
      pode('headcount') && kpiLink(kpi('Colaboradores ativos', U.fmtInt(d.colab.ativos), `hoje · ${U.fmtInt(d.colab.total)} no total (ativos+desativados)${equipe}`, 'var(--p1)'), go('ind-headcount')),
      pode('rotatividade') && kpiLink(kpi('Turnover no período', U.fmtPct(d.rot.taxaTurnoverGeral), `${U.fmtInt(d.rot.totalDesligados)} desligamento(s)${equipe}`, 'var(--critical)'), go('ind-rotatividade')),
      pode('desligamento') && kpiLink(kpi('eNPS desligados', d.entr.nps === null ? '—' : d.entr.nps, `${U.fmtInt(d.entr.totalRespostas)} resposta(s) no período`, 'var(--p2)'), go('ind-desligamento')),
      pode('celebracoes') && kpiLink(kpi('Celebrações', U.fmtInt(d.cel.total), 'no período', '#e87ba4'), go('ind-celebracoes')),
      pode('feedbacks') && kpiLink(kpi('Feedbacks', U.fmtInt(d.fb.total), 'no período', '#1baf7a'), go('ind-feedbacks')),
      pode('oneonone') && kpiLink(kpi('1:1 realizados', U.fmtInt(d.oo.realizados), 'no período', '#4a3aa7'), go('ind-oneonone')),
      pode('treinamentos') && kpiLink(kpi('Conclusão treinamentos', U.fmtPct(d.tr.taxaConclusao), `${U.fmtInt(d.tr.totalInscricoes)} inscrição(ões) no período`, '#eda100'), go('ind-treinamentos'))
    ].filter(Boolean).concat(kpisModulos(f, pode));

    // ---- Gráficos (clique = filtro na barra do topo) ----
    const desenhar = [];
    const graficos = [];
    if (pode('headcount')) {
      const pu = d.colab.porUnidade.slice(0, 10);
      const pd = d.colab.porDepartamento.slice(0, 12);
      graficos.push(card(`Colaboradores por unidade${equipe}`, '&#128101;', '<div class="chart-h"><canvas id="c-dash-unidade"></canvas></div><p class="dash-dica">Clique numa barra para filtrar pela unidade; clique de novo para limpar.</p>'));
      graficos.push(card(`Colaboradores por departamento${equipe}`, '&#128194;', `<div class="chart-h" style="height:${Math.max(260, pd.length * 28 + 60)}px"><canvas id="c-dash-depto"></canvas></div><p class="dash-dica">Os 12 maiores. Clique numa barra para filtrar pelo departamento.</p>`));
      desenhar.push(() => barChart('c-dash-unidade', pu.map(x => x.label), pu.map(x => x.value), { colors: corDoFiltro(pu.map(x => x.label), f.unidade), onClick: l => HUB_FILTRAR_POR('unidade', l) }));
      desenhar.push(() => barChart('c-dash-depto', pd.map(x => x.label), pd.map(x => x.value), { horizontal: true, colors: corDoFiltro(pd.map(x => x.label), f.departamento), onClick: l => HUB_FILTRAR_POR('departamento', l) }));
    }
    if (pode('rotatividade')) {
      const s = d.rot.serie;
      const mesSel = f.start && f.end && f.start.slice(0, 7) === f.end.slice(0, 7) && f.start.endsWith('-01') ? f.start.slice(0, 7) : null;
      graficos.push(card(`Desligamentos por mês${equipe}`, '&#128260;', '<div class="chart-h"><canvas id="c-dash-turnover"></canvas></div><p class="dash-dica">Clique num mês para ver só aquele mês; clique de novo para voltar ao período padrão.</p>'));
      desenhar.push(() => lineChart('c-dash-turnover', s.map(x => x.label), [{ label: 'Desligamentos', data: s.map(x => x.desligamentos) }], {
        onClick: i => HUB_FILTRAR_POR('mes', s[i].mes),
        pointColors: mesSel ? s.map(x => x.mes === mesSel ? '#d03b3b' : CINZA) : undefined
      }));
    }
    const eng = engajamentoPorUnidade(f, pode);
    if (eng) { graficos.push(eng.html); desenhar.push(eng.desenhar); }

    const boletim = blocoBoletim(pode);
    if (!kpis.length && !graficos.length && !boletim) {
      el.innerHTML = empty('Nenhum indicador liberado para o seu acesso.', 'Os módulos que você pode abrir aparecem no menu ao lado.');
      return;
    }
    el.innerHTML = `${avisoGalho(f)}${semData}
      ${kpis.length ? `<div class="kpi-grid">${kpis.join('')}</div>` : ''}
      ${graficos.length ? `<div class="grid2">${graficos.join('')}</div>` : ''}
      ${boletim}`;
    desenhar.forEach(fn => fn());

    const abrir = k => {
      if (k.dataset.ave) return HUB_EXPERIENCIA_ABRIR(Number(k.dataset.ave));
      if (k.dataset.goto) HUB_GOTO_SECTION(k.dataset.goto);
    };
    el.querySelectorAll('.kpi-link').forEach(k => {
      k.addEventListener('click', () => abrir(k));
      k.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(k); } });
    });
    el.querySelectorAll('.bl-mx tr[data-op]').forEach(tr => tr.addEventListener('click', () => HUB_BOLETIM_UI.abrir(tr.dataset.op)));
  }

  // Cartões dos módulos que carregam sob demanda (AvE, Engajamento, Satisfação).
  function kpisModulos(f, pode) {
    const out = [];
    if (pode('experiencia') && window.HUB_EXPERIENCIA && window.HUB_EXP_METRICS) {
      const XM = HUB_EXP_METRICS;
      const st = dashCarga('ave', () => HUB_EXPERIENCIA_DATA[45] && HUB_EXPERIENCIA_DATA[90], () => Promise.all([HUB_EXPERIENCIA.carregar(45), HUB_EXPERIENCIA.carregar(90)]));
      for (const c of [45, 90]) {
        const rotulo = `AvE ${c} dias — avaliação do gestor`;
        if (st !== 'ok') { out.push(kpiLink(kpiCarregando(rotulo, st, 'ave'), `data-ave="${c}"`)); continue; }
        const rows = HUB_EXPERIENCIA_DATA[c] || [];
        XM.preparar(rows, c);
        const filtradas = XM.filtrar(rows, f);
        if (!filtradas.length) { out.push(kpiLink(kpi(rotulo, '—', 'nenhuma avaliação no período', 'var(--muted)'), `data-ave="${c}"`)); continue; }
        const r = XM.calcular(filtradas, c);
        const taxa = r.gestor.taxa;
        // Em aberto = pendentes + em rascunho (não concluídas), no período filtrado.
        const sub = `${U.fmtInt(r.gestor.concluidas)} feita(s) · ${U.fmtInt(r.gestor.pendentes + r.gestor.rascunho)} em aberto no período`;
        out.push(kpiLink(kpi(rotulo, taxa === null ? '—' : U.fmtPct(taxa, 0), sub, taxa !== null && taxa < 0.8 ? 'var(--critical)' : '#1baf7a'), `data-ave="${c}"`));
      }
    }
    if (pode('engajamento') && window.HUB_ENGAJAMENTO && window.HUB_METRICS_ENGAJAMENTO) {
      const rotulo = 'Pesquisa de Engajamento — adesão';
      const st = dashCarga('eng', () => HUB_ENGAJAMENTO.jaCarregado(), () => HUB_ENGAJAMENTO.carregar());
      if (st !== 'ok') out.push(kpiLink(kpiCarregando(rotulo, st, 'eng'), 'data-goto="ind-engajamento"'));
      else {
        const EM = HUB_METRICS_ENGAJAMENTO;
        const e = EM.engajamentoMetrics(f);
        if (!e.temDados || e.vazio) out.push(kpiLink(kpi(rotulo, '—', e.temDados ? 'nenhum pulso no período' : 'nenhum pulso importado', 'var(--muted)'), 'data-goto="ind-engajamento"'));
        else {
          const s = e.sel;
          const prazo = !s.p.parcial ? 'encerrado' : e.diasRestantes === null ? 'período terminou' : e.diasRestantes === 0 ? 'encerra hoje' : `encerra em ${e.diasRestantes} dia(s)`;
          const cor = { ok: '#1baf7a', atencao: '#e0a100', critico: 'var(--critical)' }[EM.statusDe(s.pct)] || 'var(--muted)';
          out.push(kpiLink(kpi(rotulo, s.pct === null ? '—' : U.fmtPct(s.pct, 0), `${U.fmtInt(s.resp)} de ${U.fmtInt(s.conv)} · meta ${U.fmtPct(EM.META, 0)} · ${prazo}`, cor), 'data-goto="ind-engajamento"'));
        }
      }
    }
    const sat = cartaoSatisfacao(f);
    if (sat) out.push(sat);
    return out;
  }

  // Satisfação com o Escritório: só faz sentido no Escritório (as lojas não
  // são avaliadas — elas avaliam). Aparece sem filtro de unidade ou com uma
  // unidade do Escritório selecionada. Com um departamento selecionado que seja
  // uma área avaliada, mostra a média dessa área; senão, a média de todas as
  // áreas que o acesso da pessoa permite ver (mesmo sigilo do módulo).
  function cartaoSatisfacao(f) {
    const SM = window.HUB_METRICS_SATISFACAO;
    if (!SM || !window.HUB_SATISFACAO) return null;
    const acesso = SM.acessoDe(window.HUB_USER);
    if (!acesso.modulo || (!acesso.completo && !acesso.areas.length)) return null;
    const unid = f.unidade || [];
    if (unid.length && !unid.some(u => U.normalizeText(u).startsWith('escritorio'))) return null;
    const rotulo = 'Satisfação com o Escritório';
    const st = dashCarga('sat', () => HUB_SATISFACAO.jaCarregado(), () => HUB_SATISFACAO.carregar());
    if (st !== 'ok') return kpiLink(kpiCarregando(rotulo, st, 'sat'), 'data-goto="ind-satisfacao"');
    const D = window.HUB_SATISFACAO_DATA;
    const idx = SM.indexar(SM.recortar(D.respostas || [], acesso));
    if (!idx.ciclos.length) return kpiLink(kpi(rotulo, '—', 'sem respostas para as áreas do seu acesso', 'var(--muted)'), 'data-goto="ind-satisfacao"');
    const ciclo = idx.ciclos[idx.ciclos.length - 1];
    const dep = (f.departamento || []).length === 1 ? U.normalizeText(f.departamento[0]) : null;
    const area = dep ? idx.areas.find(a => U.normalizeText(a) === dep) : null;
    const s = area ? (SM.resumoArea(idx, area, ciclo).atual) : SM.visaoGeral(idx, ciclo, D.ciclos || []).geral;
    const media = s ? s.media : null;
    const fx = SM.faixa(media);
    const quem = area ? area : dep ? 'média de todas as áreas (o departamento filtrado não é avaliado)' : 'média de todas as áreas';
    return kpiLink(kpi(area ? `${rotulo} — ${U.escapeHtml(area)}` : rotulo, SM.fmtNota(media), `${U.escapeHtml(quem)} · NPS ${SM.fmtNps(s ? s.nps : null)} · ${U.escapeHtml(SM.rotuloCiclo(ciclo))}`, fx ? fx.cor : 'var(--p1)'), 'data-goto="ind-satisfacao"');
  }

  // Adesão do pulso atual por unidade (clique = filtro de unidade).
  function engajamentoPorUnidade(f, pode) {
    if (!pode('engajamento') || !window.HUB_ENGAJAMENTO || !HUB_ENGAJAMENTO.jaCarregado()) return null;
    const EM = HUB_METRICS_ENGAJAMENTO;
    const e = EM.engajamentoMetrics(f);
    if (!e.temDados || e.vazio || !e.unidades.length) return null;
    const us = e.unidades.filter(u => u.pct !== null).sort((a, b) => a.pct - b.pct);
    if (!us.length) return null;
    const base = us.map(u => ({ ok: '#1baf7a', atencao: '#e0a100', critico: '#d03b3b' }[u.status] || '#8A8F98'));
    return {
      html: card(`Pesquisa de Engajamento — adesão por unidade (${U.escapeHtml(e.sel.rotuloLongo || e.sel.periodo || 'pulso atual')})`, '&#128200;', `<div class="chart-h" style="height:${Math.max(260, us.length * 26 + 60)}px"><canvas id="c-dash-eng"></canvas></div><p class="dash-dica">Meta ${U.fmtPct(EM.META, 0)}. Clique numa barra para filtrar pela unidade.</p>`),
      desenhar: () => barChart('c-dash-eng', us.map(u => u.label), us.map(u => u.pct), { horizontal: true, pct: true, colors: corDoFiltro(us.map(u => u.label), f.unidade, base) || base, onClick: l => HUB_FILTRAR_POR('unidade', l) })
    };
  }

  // Resumo do Boletim da Liderança: a mesma matriz "Todas as operações" do
  // módulo, no mês selecionado lá (padrão: mês anterior). Usa o mês do Boletim,
  // não os filtros do topo. Clique numa operação = abre o boletim dela.
  // Quem NÃO tem o módulo (gestores): os números publicados do último mês
  // fechado, só da(s) operação(ões) do acesso da pessoa — o banco faz o
  // recorte (boletim_resumo_publicado, supabase-boletim-resumo.sql). Sem a
  // função no banco ou sem mês fechado, o bloco simplesmente não aparece.
  // Guardado por conta: no "Visualizar como" o banco devolve o resumo da conta
  // simulada (p_profile_id — só vale para quem tem admin.usuarios).
  const BOLETIM_PUBLICADO = { linhas: null, conta: null };
  function blocoBoletimPublicado() {
    if (!window.HUB_BOLETIM_UI) return '';
    const simulando = !!(window.HUB_VIEW_AS && HUB_VIEW_AS.isActive());
    const conta = (simulando ? 'sim:' : '') + ((HUB_USER && HUB_USER.id) || '');
    if (BOLETIM_PUBLICADO.conta !== conta) {
      BOLETIM_PUBLICADO.linhas = null;
      BOLETIM_PUBLICADO.conta = conta;
      delete DASH_CARGA.falhou.boletimPublicado;
    }
    const st = dashCarga('boletimPublicado', () => BOLETIM_PUBLICADO.linhas !== null, async () => {
      const args = simulando && HUB_USER && HUB_USER.id ? { p_profile_id: HUB_USER.id } : {};
      const { data, error } = await sb.rpc('boletim_resumo_publicado', args);
      if (BOLETIM_PUBLICADO.conta !== conta) return; // trocou de conta no meio da busca
      if (error) { console.warn('Resumo do Boletim (publicado):', error.message); BOLETIM_PUBLICADO.linhas = []; return; }
      BOLETIM_PUBLICADO.linhas = data || [];
    });
    if (st !== 'ok') return '';
    const html = HUB_BOLETIM_UI.resumoPublicadoHtml(BOLETIM_PUBLICADO.linhas);
    return html ? `<div style="margin-top:18px" class="dash-boletim">${html}</div>` : '';
  }

  function blocoBoletim(pode) {
    if (!pode('boletim')) return blocoBoletimPublicado();
    if (!window.HUB_BOLETIM || !window.HUB_BOLETIM_UI) return '';
    const st = dashCarga('boletim', () => HUB_BOLETIM.jaCarregado(), () => HUB_BOLETIM.carregar().then(() => HUB_METRICS_BOLETIM._invalidar()));
    if (st !== 'ok') return `<div style="margin-top:18px">${card('Boletim da Liderança', '&#128202;', st === 'erro' ? empty('Não consegui carregar o Boletim da Liderança.', U.escapeHtml(DASH_CARGA.falhou.boletim || '')) : '<p class="dash-dica">Carregando o resumo do Boletim...</p>')}</div>`;
    try {
      return `<div style="margin-top:18px" class="dash-boletim"><p class="dash-dica" style="margin:0 0 8px">Resumo do Boletim da Liderança — usa o mês escolhido no módulo, não os filtros do topo.</p>${HUB_BOLETIM_UI.resumoHtml()}</div>`;
    } catch (err) {
      return `<div style="margin-top:18px">${card('Boletim da Liderança', '&#128202;', empty('Não consegui calcular o resumo do Boletim.', U.escapeHtml(err.message || '')))}</div>`;
    }
  }

  // ==================================================================
  // HEADCOUNT (Colaboradores)
  // ==================================================================
  // Badges de identificação ao lado do nome, na Lista de colaboradores —
  // cota PCD/Jovem Aprendiz e afastamento INSS/Maternidade (mesmas tags de
  // colaboradores.grupos usadas nos 4 cards do topo, ver M.temGrupo).
  function tagsDoColaborador(r) {
    const tags = [];
    if (M.temGrupo(r, 'cota.pcd')) tags.push(['PCD', 'b5']);
    if (M.temGrupo(r, 'cota.aprendiz')) tags.push(['Jovem Aprendiz', 'b4']);
    if (M.temGrupo(r, 'afastamento.inss')) tags.push(['INSS', 'b3']);
    if (M.temGrupo(r, 'afastamento.maternidade')) tags.push(['Maternidade', 'b1']);
    if (emFerias(r)) tags.push(['Férias', 'b-ferias']);
    return tags;
  }
  function badgesGruposHTML(r) {
    const tags = tagsDoColaborador(r);
    return tags.map(([label, cls]) => ` <span class="badge ${cls}" style="font-size:9.5px;padding:2px 6px">${label}</span>`).join('');
  }

  // Mesma regra do cartão "Férias": desativado sem tag de afastamento.
  const desativado = r => String(r.situacao || '').trim().toLowerCase() === 'desativado';
  function emFerias(r) {
    return desativado(r) && !M.temGrupo(r, 'afastamento.inss') && !M.temGrupo(r, 'afastamento.maternidade');
  }

  // Lista de colaboradores do Headcount: filtro "Mostrar" e ordenação pelo
  // título da coluna. A escolha fica guardada enquanto a página está aberta.
  const HC_LISTA = { mostrar: '', coluna: '', dir: 1 };
  const HC_MOSTRAR = [
    ['', 'Todos'],
    ['ativos', 'Ativos', r => !desativado(r)],
    ['desativados', 'Desativados', desativado],
    ['ferias', 'Férias', emFerias],
    ['inss', 'Afastamento INSS', r => M.temGrupo(r, 'afastamento.inss')],
    ['maternidade', 'Licença Maternidade', r => M.temGrupo(r, 'afastamento.maternidade')],
    ['pcd', 'Cota PCD', r => M.temGrupo(r, 'cota.pcd')],
    ['aprendiz', 'Cota Jovem Aprendiz', r => M.temGrupo(r, 'cota.aprendiz')]
  ];
  const HC_COLUNAS = [
    ['nome', 'Nome', r => r.nome_completo || r.nome || ''],
    ['cargo', 'Cargo', r => r.cargo || ''],
    ['unidade', 'Unidade', r => r.unidade || ''],
    ['departamento', 'Departamento', r => r.departamento || ''],
    ['gestor', 'Gestor', r => r.gestor_direto || ''],
    ['situacao', 'Situação', r => r.situacao || ''],
    ['admissao', 'Admissão', r => r.data_admissao || ''],
    ['fim45', 'Fim experiência (45d)', r => r.data_admissao || ''],
    ['fim90', 'Fim prorrogação (90d)', r => r.data_admissao || '']
  ];
  const HC_MAX = 300;

  // Exporta a lista como está na tela (filtro "Mostrar" + ordenação), mas
  // inteira — sem o corte de HC_MAX linhas. Datas vão como data do Excel.
  function exportarListaHeadcount(rows) {
    if (!window.XLSX) { alert('Não foi possível gerar o Excel: a biblioteca de planilhas não carregou. Recarregue a página e tente de novo.'); return; }
    const data = iso => {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
      if (!m) return null;
      return { t: 'n', z: 'dd/mm/yyyy', v: (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000 };
    };
    const cab = ['Nome', 'Cargo', 'Unidade', 'Departamento', 'Gestor', 'Situação', 'Identificação', 'Admissão', 'Fim experiência (45d)', 'Fim prorrogação (90d)'];
    const linhas = rows.map(r => [
      r.nome_completo || r.nome || '', r.cargo || '', r.unidade || '', r.departamento || '', r.gestor_direto || '', r.situacao || '',
      tagsDoColaborador(r).map(t => t[0]).join(', '),
      data(r.data_admissao), data(r.data_admissao && U.addDays(r.data_admissao, 45)), data(r.data_admissao && U.addDays(r.data_admissao, 90))
    ]);
    const ws = XLSX.utils.aoa_to_sheet([cab].concat(linhas));
    ws['!cols'] = [38, 32, 28, 34, 28, 12, 22, 12, 20, 20].map(wch => ({ wch }));
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: linhas.length, c: cab.length - 1 } }) };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Colaboradores');
    const filtro = HC_LISTA.mostrar ? '_' + HC_LISTA.mostrar : '';
    XLSX.writeFile(wb, `headcount-colaboradores${filtro}_${U.todayISO()}.xlsx`);
  }

  function desenharListaHeadcount(lista) {
    const box = document.getElementById('hc-lista');
    if (!box) return;
    const filtro = HC_MOSTRAR.find(o => o[0] === HC_LISTA.mostrar);
    const rows = filtro && filtro[2] ? lista.filter(filtro[2]) : lista.slice();
    const col = HC_COLUNAS.find(c => c[0] === HC_LISTA.coluna);
    if (col) {
      // Vazios sempre no fim, em qualquer direção.
      rows.sort((a, b) => {
        const va = String(col[2](a)), vb = String(col[2](b));
        if (!va || !vb) return va ? -1 : vb ? 1 : 0;
        return va.localeCompare(vb, 'pt-BR', { sensitivity: 'base' }) * HC_LISTA.dir;
      });
    }
    const seta = id => HC_LISTA.coluna === id ? (HC_LISTA.dir === 1 ? ' &#9650;' : ' &#9660;') : '';
    const corpo = rows.slice(0, HC_MAX).map(r => `<tr><td>${U.escapeHtml(r.nome_completo || r.nome || '')}${badgesGruposHTML(r)}</td><td>${U.escapeHtml(r.cargo || '')}</td><td>${U.escapeHtml(r.unidade || '')}</td><td>${U.escapeHtml(r.departamento || '')}</td><td>${U.escapeHtml(r.gestor_direto || '')}</td><td><span class="badge ${r.situacao === 'Ativo' ? 'b2' : 'b4'}">${U.escapeHtml(r.situacao || '')}</span></td><td>${U.fmtDateBR(r.data_admissao)}</td><td>${r.data_admissao ? U.fmtDateBR(U.addDays(r.data_admissao, 45)) : '—'}</td><td>${r.data_admissao ? U.fmtDateBR(U.addDays(r.data_admissao, 90)) : '—'}</td></tr>`).join('');
    box.innerHTML = `<div class="hc-lista-bar">
        <label for="hc-mostrar">Mostrar</label>
        <select id="hc-mostrar">${HC_MOSTRAR.map(o => `<option value="${o[0]}"${o[0] === HC_LISTA.mostrar ? ' selected' : ''}>${o[1]}</option>`).join('')}</select>
        <span class="hc-lista-n">${U.fmtInt(rows.length)} colaborador(es)</span>
        <span class="dash-dica" style="margin:0 0 0 auto">Clique no título de uma coluna para ordenar.</span>
        <button type="button" class="btn btn-outline btn-sm" id="hc-exportar"${rows.length ? '' : ' disabled'} title="Baixa a lista inteira deste filtro, na ordem da tela">Exportar Excel</button>
      </div>
      ${rows.length ? `<div class="table-wrap"><table class="dt hc-lista-t"><thead><tr>${HC_COLUNAS.map(c => `<th data-col="${c[0]}" tabindex="0" role="button" title="Ordenar por ${c[1]}">${c[1]}${seta(c[0])}</th>`).join('')}</tr></thead><tbody>${corpo}</tbody></table></div>` : empty('Nenhum colaborador nesse filtro.')}
      ${rows.length > HC_MAX ? `<p class="sub" style="margin-top:8px">Exibindo ${HC_MAX} de ${U.fmtInt(rows.length)}. Refine os filtros para ver outros.</p>` : ''}`;
    box.querySelector('#hc-mostrar').addEventListener('change', e => { HC_LISTA.mostrar = e.target.value; desenharListaHeadcount(lista); });
    box.querySelector('#hc-exportar').addEventListener('click', () => exportarListaHeadcount(rows));
    const ordenar = id => {
      if (HC_LISTA.coluna === id) { if (HC_LISTA.dir === 1) HC_LISTA.dir = -1; else { HC_LISTA.coluna = ''; HC_LISTA.dir = 1; } }
      else { HC_LISTA.coluna = id; HC_LISTA.dir = 1; }
      desenharListaHeadcount(lista);
    };
    box.querySelectorAll('th[data-col]').forEach(th => {
      th.addEventListener('click', () => ordenar(th.dataset.col));
      th.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ordenar(th.dataset.col); } });
    });
  }

  function renderHeadcount(el, f) {
    if (noDataGate(el, ['colaboradores'], canUpload())) return;
    f = comGalho(el, f);
    if (!f) return;
    if (f.galho && !f.galho.size) { el.innerHTML = avisoGalho(f); return; }
    const d = M.colaboradoresMetrics(f);
    el.innerHTML = `${avisoGalho(f)}
      <div class="kpi-grid">
        ${kpi('Headcount', U.fmtInt(d.total), 'Ativos + desativados (sem duplicidade)', 'var(--p1)')}
        ${kpi('Ativos', U.fmtInt(d.ativos), '', '#1baf7a')}
        ${kpi('Desativados', U.fmtInt(d.desativados), '', 'var(--warning)')}
        ${kpi('Em período de experiência', U.fmtInt(d.emExperiencia), 'até 90 dias da admissão', '#eb6834')}
        ${kpi('Cota PCD', U.fmtInt(d.cotaPcd), '', '#e87ba4')}
        ${kpi('Cota Jovem Aprendiz', U.fmtInt(d.cotaAprendiz), '', '#eda100')}
        ${kpi('Afastamentos INSS', U.fmtInt(d.afastamentoInss), '', 'var(--critical)')}
        ${kpi('Licença Maternidade', U.fmtInt(d.afastamentoMaternidade), '', '#805AD5')}
        ${kpi('Férias', U.fmtInt(d.ferias), 'desativados sem afastamento (INSS ou maternidade)', '#0e9aa7')}
        ${kpi('Tempo médio de casa', U.tenureLabel(Math.round(d.tempoMedioMeses)), '', '#4a3aa7')}
      </div>
      <div class="grid2">
        ${card('Headcount por unidade', '&#127970;', '<div class="chart-h"><canvas id="c-col-unidade"></canvas></div>')}
        ${card('Headcount por departamento', '&#128194;', '<div class="chart-h"><canvas id="c-col-depto"></canvas></div>')}
        ${card('Distribuição por sexo', '&#9878;&#65039;', '<div class="chart-h short"><canvas id="c-col-sexo"></canvas></div>')}
        ${card('Aniversariantes (próx. 30 dias)', '&#127874;', d.aniversariantes.length ? `<div class="table-wrap"><table class="dt"><thead><tr><th>Nome</th><th>Cargo</th><th>Data</th><th>Departamento</th></tr></thead><tbody>${d.aniversariantes.map(a => `<tr><td>${U.escapeHtml(a.nome)}</td><td>${U.escapeHtml(a.cargo || '')}</td><td>${U.fmtDateBR(a.data)}</td><td>${U.escapeHtml(a.departamento || '')}</td></tr>`).join('')}</tbody></table></div>` : empty('Nenhum aniversariante nos próximos 30 dias.'))}
        ${card('Lista de colaboradores', '&#128203;', '<div id="hc-lista"></div>', { full: true })}
      </div>`;
    const pu = d.porUnidade, pd = d.porDepartamento.slice(0, 12), ps = d.porSexo;
    barChart('c-col-unidade', pu.map(x => x.label), pu.map(x => x.value));
    barChart('c-col-depto', pd.map(x => x.label), pd.map(x => x.value), { horizontal: true });
    doughnutChart('c-col-sexo', ps.map(x => x.label), ps.map(x => x.value));
    desenharListaHeadcount(d.lista);
  }

  // ==================================================================
  // ROTATIVIDADE
  // ==================================================================
  function renderRotatividade(el, f) {
    if (noDataGate(el, ['colaboradores'], canUpload())) return;
    const d = M.rotatividadeMetrics(f);
    el.innerHTML = `
      ${d.semDataSaida ? `<div class="insight info" style="margin-bottom:18px"><span class="ic">&#8505;&#65039;</span><span>${U.fmtInt(d.semDataSaida)} desligado(s) estão sem "Último dia trabalhado" na planilha de Colaboradores e ficam fora do turnover, dos gráficos e da lista abaixo (não dá pra saber em que mês saíram). Corrija a data na planilha e reenvie para eles entrarem na conta.</span></div>` : ''}
      <div class="kpi-grid">
        ${kpi('Turnover geral', U.fmtPct(d.taxaTurnoverGeral), `${U.fmtInt(d.totalAdmitidos)} admissão(ões), ${U.fmtInt(d.totalDesligados)} desligamento(s)`, 'var(--critical)')}
        ${kpi('Turnover geral na experiência', U.fmtPct(d.taxaTurnoverExperiencia), `${U.fmtInt(d.totalDesligadosExperiencia)} de ${U.fmtInt(d.totalAdmitidos)} admitido(s) saíram em até 3 meses`, '#eb6834')}
        ${kpi('Turnover voluntário', U.fmtPct(d.taxaVoluntaria), `${U.fmtInt(d.voluntarios)} caso(s)`, 'var(--warning)')}
        ${kpi('Turnover involuntário', U.fmtPct(d.taxaInvoluntaria), `${U.fmtInt(d.involuntarios)} caso(s)`, '#805AD5')}
        ${kpi('Taxa de desligamento geral', U.fmtPct(d.taxaDesligamentoGeral), 'do período filtrado', 'var(--p1)')}
        ${kpi('Turnover médio', U.fmtPct(d.turnoverMedio), 'média dos meses do período', '#1baf7a')}
        ${kpi('Taxa de desligamento média', U.fmtPct(d.taxaDesligamentoMedia), 'média dos meses do período', '#e87ba4')}
      </div>
      <div class="insight info" style="margin-bottom:18px">
        <span class="ic">${HUB_ICON('info')}</span>
        <span><strong>Como calculamos:</strong> Turnover = ((Admissões + Desligamentos) ÷ 2) ÷ Headcount médio do período — mede a movimentação total do quadro, entradas e saídas juntas. Taxa de Desligamento = Desligamentos ÷ Headcount médio do período — mede só quem saiu, sem contar quem entrou. Os dois "médio(s)" usam a média do headcount de início de cada mês do período filtrado.</span>
      </div>
      <div class="grid2">
        ${card('Desligamentos ao longo do tempo', '&#128200;', '<div class="chart-h tall"><canvas id="c-rot-serie"></canvas></div>', { full: true })}
        ${card('Voluntário vs. involuntário por mês', '&#9878;&#65039;', '<div class="chart-h"><canvas id="c-rot-tipo"></canvas></div>')}
        ${card('Motivos de desligamento', '&#128172;', d.motivos.length ? '<div class="chart-h"><canvas id="c-rot-motivos"></canvas></div>' : empty('Sem motivos informados.'))}
        ${card('Top 10 cargos com maior rotatividade', '&#128188;', d.cargosDesligados.length ? '<div class="chart-h"><canvas id="c-rot-cargos"></canvas></div>' : empty('Sem cargos informados.'))}
        ${card('Desligados no período', '&#128203;', d.listaDesligados.length ? `<div class="table-wrap"><table class="dt"><thead><tr><th>Nome</th><th>Cargo</th><th>Unidade</th><th>Departamento</th><th>Tipo</th><th>Data</th></tr></thead><tbody>${d.listaDesligados.map(r => `<tr><td>${U.escapeHtml(r.nome || '')}</td><td>${U.escapeHtml(r.cargo || '')}</td><td>${U.escapeHtml(r.unidade || '')}</td><td>${U.escapeHtml(r.departamento || '')}</td><td>${U.escapeHtml(r.tipo || '')}</td><td>${U.fmtDateBR(r.data)}</td></tr>`).join('')}</tbody></table></div>` : empty('Nenhum desligamento no período.'), { full: true })}
        ${insightsCard('Insights e plano de ação', '&#129504;', insightsList(d.insights) || empty('Sem dados suficientes para gerar insights.'), { full: true })}
      </div>
      <h3 style="font-size:13px;margin:20px 0 12px">Rotatividade no período de experiência (até 90 dias após a admissão)</h3>
      <div class="grid2">
        ${card('Voluntário vs. involuntário por mês — experiência', '&#9878;&#65039;', '<div class="chart-h"><canvas id="c-rot-tipo-exp"></canvas></div>')}
        ${card('Motivos de desligamento — experiência', '&#128172;', d.motivosExperiencia.length ? '<div class="chart-h"><canvas id="c-rot-motivos-exp"></canvas></div>' : empty('Sem motivos informados.'))}
        ${card('Top 10 cargos com maior rotatividade — experiência', '&#128188;', d.cargosDesligadosExperiencia.length ? '<div class="chart-h"><canvas id="c-rot-cargos-exp"></canvas></div>' : empty('Sem cargos informados.'))}
      </div>`;
    lineChart('c-rot-serie', d.serie.map(x => x.label), [
      { label: 'Desligamentos', data: d.serie.map(x => x.desligamentos) },
      { label: 'Admissões', data: d.serie.map(x => x.admissoes) },
      { label: 'Taxa de desligamento (%)', data: d.serie.map(x => +(x.taxaDesligamento * 100).toFixed(2)) },
      { label: 'Turnover (%)', data: d.serie.map(x => +(x.taxaTurnover * 100).toFixed(2)) }
    ]);
    HUB_CHART('c-rot-tipo', {
      type: 'bar',
      data: {
        labels: d.serie.map(x => x.label),
        datasets: [
          { label: 'Voluntário', data: d.serie.map(x => x.voluntarios), backgroundColor: U.color(3), borderRadius: 4 },
          { label: 'Involuntário', data: d.serie.map(x => x.involuntarios), backgroundColor: U.color(6), borderRadius: 4 }
        ]
      },
      options: {
        plugins: {
          legend: { display: true },
          datalabels: { color: '#fff', font: { size: 9, weight: '700' }, formatter: v => v || '' }
        },
        scales: { x: { stacked: true }, y: { stacked: true } }
      }
    });
    if (d.motivos.length) {
      const top = d.motivos.slice(0, 8);
      barChart('c-rot-motivos', top.map(x => x.label), top.map(x => x.value), { horizontal: true });
    }
    if (d.cargosDesligados.length) {
      const topCargos = d.cargosDesligados.slice(0, 10);
      barChart('c-rot-cargos', topCargos.map(x => x.label), topCargos.map(x => x.value), { horizontal: true });
    }
    HUB_CHART('c-rot-tipo-exp', {
      type: 'bar',
      data: {
        labels: d.serieExperiencia.map(x => x.label),
        datasets: [
          { label: 'Voluntário', data: d.serieExperiencia.map(x => x.voluntarios), backgroundColor: U.color(3), borderRadius: 4 },
          { label: 'Involuntário', data: d.serieExperiencia.map(x => x.involuntarios), backgroundColor: U.color(6), borderRadius: 4 }
        ]
      },
      options: {
        plugins: {
          legend: { display: true },
          datalabels: { color: '#fff', font: { size: 9, weight: '700' }, formatter: v => v || '' }
        },
        scales: { x: { stacked: true }, y: { stacked: true } }
      }
    });
    if (d.motivosExperiencia.length) {
      const top = d.motivosExperiencia.slice(0, 8);
      barChart('c-rot-motivos-exp', top.map(x => x.label), top.map(x => x.value), { horizontal: true });
    }
    if (d.cargosDesligadosExperiencia.length) {
      const topCargos = d.cargosDesligadosExperiencia.slice(0, 10);
      barChart('c-rot-cargos-exp', topCargos.map(x => x.label), topCargos.map(x => x.value), { horizontal: true });
    }
  }

  // ==================================================================
  // ENTREVISTA DE DESLIGAMENTO
  // ==================================================================
  function splitMulti(v) {
    return v ? String(v).split(';').map(s => s.trim()).filter(Boolean) : [];
  }

  function renderNpsScale(np) {
    if (!np || !np.total) return '';
    const segs = [
      { key: 'detrator', label: 'Detratores (0-6)', pct: np.pctDetratores, n: np.detratores },
      { key: 'neutro', label: 'Neutros (7-8)', pct: np.pctNeutros, n: np.neutros },
      { key: 'promotor', label: 'Promotores (9-10)', pct: np.pctPromotores, n: np.promotores }
    ];
    return `<div class="nps-scale">` + segs.map(s =>
      `<div class="nps-seg ${s.key}" style="width:${Math.max(s.pct * 100, s.n ? 4 : 0)}%"><span class="n">${U.fmtPct(s.pct, 0)}</span><span class="lbl">${s.label} · ${U.fmtInt(s.n)}</span></div>`
    ).join('') + `</div>`;
  }

  function comentariosHtml(list, emptyMsg) {
    if (!list.length) return empty(emptyMsg || 'Sem comentários.');
    return list.slice(0, 20).map(c => `<div class="comment">${c.unidade || c.departamento ? `<div class="meta">${U.escapeHtml(c.unidade || '')}${c.unidade && c.departamento ? ' · ' : ''}${U.escapeHtml(c.departamento || '')}</div>` : ''}${U.escapeHtml(c.texto)}</div>`).join('');
  }

  // Cada índice vira um par de cards: o principal (pergunta fechada, sempre
  // visível) e um "Detalhamento" que só ganha conteúdo quando o usuário
  // clica numa barra do principal — mesma ideia do drill-down de Motivos ->
  // Submotivos, só que reaproveitada pros 10 índices com 2 (ou 3) níveis.
  function perguntaHtml(texto) {
    return texto ? `<p class="sub" style="margin-bottom:10px">${U.escapeHtml(texto)}</p>` : '';
  }

  function renderIndiceDesligamentoCard(idx, i) {
    const mainBody = perguntaHtml(idx.pergunta) + (idx.principal.length ? `<div class="chart-h"><canvas id="c-desl-idx-${i}"></canvas></div>` : empty('Sem dados.'));
    if (idx.simples) return card(idx.titulo, '&#128202;', mainBody, { full: true });
    const secBody = `<p class="sub" style="margin-bottom:8px">Clique numa opção do gráfico ao lado para detalhar.</p><div id="desl-idx-sec-${i}">${empty('Selecione uma opção ao lado.')}</div>`;
    return card(idx.titulo, '&#128202;', mainBody) + card('Detalhamento', '&#128269;', secBody);
  }

  function wireIndiceDesligamento(idx, i) {
    if (!idx.principal.length) return;
    const t = idx.principal;
    barChart(`c-desl-idx-${i}`, t.map(x => x.label), t.map(x => x.value), {
      horizontal: true,
      onClick: idx.simples ? undefined : (label => renderIndiceSecundaria(idx, i, label))
    });
  }

  function renderIndiceSecundaria(idx, i, respostaPrincipal) {
    const container = document.getElementById(`desl-idx-sec-${i}`);
    if (!container) return;
    const linhasResp = idx.linhas.filter(l => l.principal === respostaPrincipal);
    const bucket = linhasResp.length ? linhasResp[0].bucket : null;
    const multi = bucket === 'negativo' && idx.negativaMulti;
    const counts = M.countAnswers(linhasResp.map(l => l.secundaria), { multi });
    const secCanvas = `c-desl-idx-${i}-sec`;
    const terId = `desl-idx-ter-${i}`;
    const temTerciaria = bucket === 'negativo' && idx.temTerciaria;
    const perguntaSec = bucket === 'positivo' ? idx.perguntaPositiva : idx.perguntaNegativa;
    container.innerHTML = `<p class="sub" style="margin-bottom:2px"><strong>${U.escapeHtml(respostaPrincipal)}</strong> — ${U.fmtInt(linhasResp.length)} resposta(s)</p>` +
      perguntaHtml(perguntaSec) +
      (counts.length ? `<div class="chart-h short"><canvas id="${secCanvas}"></canvas></div>` : empty('Sem detalhamento disponível para esta opção.')) +
      (temTerciaria ? `<div id="${terId}" style="margin-top:14px"></div>` : '');
    if (!counts.length) return;
    barChart(secCanvas, counts.map(x => x.label), counts.map(x => x.value), {
      horizontal: true,
      onClick: temTerciaria ? (label2 => renderIndiceTerciaria(idx, terId, linhasResp, label2, multi)) : undefined
    });
  }

  function renderIndiceTerciaria(idx, terId, linhasResp, label2, multi) {
    const terEl = document.getElementById(terId);
    if (!terEl) return;
    if (idx.outrosGatilho && label2 !== idx.outrosGatilho) { terEl.innerHTML = ''; return; }
    const sub = linhasResp.filter(l => multi ? splitMulti(l.secundaria).includes(label2) : l.secundaria === label2);
    const comentarios = sub.map(l => ({ unidade: l.unidade, departamento: l.departamento, texto: l.terciaria })).filter(c => c.texto);
    terEl.innerHTML = `<p class="sub" style="margin-bottom:8px"><strong>Comentários adicionais</strong> — ${U.fmtInt(comentarios.length)}</p>` + comentariosHtml(comentarios, 'Sem comentários adicionais para esta opção.');
  }

  // Duas subabas: "Indicadores" (gráficos anonimizados, sem nome de quem
  // respondeu) e "Lista de Colaboradores" (pra quem foi gerado o link —
  // essa sim mostra nome, porque é acompanhamento operacional de envio, não
  // conteúdo de resposta). Estado de qual subaba está aberta persiste em
  // memória do módulo (mesmo padrão de admin/cadastros.js).
  // A entrevista mantém seus indicadores; a operação é um módulo independente.
  function renderDesligamento(el, f) {
    const podeControle=HUB_PERMISSIONS.hasPerm(HUB_USER,'indicadores.controle_desligamento');
    el.innerHTML=`<div class="toolbar" style="justify-content:space-between;align-items:center"><p class="sub" style="margin:0">Resultados e análises das entrevistas de desligamento no período e filtros selecionados.</p>${podeControle?'<button type="button" class="btn btn-outline btn-sm" style="width:auto" data-abrir-controle>Abrir Controle de Desligamento</button>':''}</div><div data-entrevista-indicadores></div>`;
    el.querySelector('[data-abrir-controle]')?.addEventListener('click',()=>HUB_GOTO_SECTION('do-controle-desligamento'));
    renderDesligamentoIndicadores(el.querySelector('[data-entrevista-indicadores]'),f);
  }

  function renderDesligamentoIndicadores(el, f) {
    // "entrevistas_desligamento" mora em HUB_RECRUIT_DATA (não HUB_DATA) —
    // um source combinado só pra este noDataGate, sem tocar HUB_DATA.
    const linksGerados = window.HUB_METRICS_LINKS ? HUB_METRICS_LINKS() : ((window.HUB_RECRUIT_DATA && window.HUB_RECRUIT_DATA.entrevistas_desligamento) || []);
    const gateSource = Object.assign({}, HUB_DATA, { entrevistas_desligamento: linksGerados });
    if (noDataGate(el, ['entrevista_pesquisa', 'entrevista_solicitacao', 'entrevistas_desligamento'], canUpload(),
      'Importe o histórico em Administração ou acompanhe os links no módulo Controle de Desligamento, em Desenvolvimento Organizacional.', gateSource)) return;
    const d = M.entrevistaMetrics(f);
    // Drivers de Atração (simples) abre a sequência; Motivos/Submotivos
    // entram logo em seguida como um par, antes dos demais índices — o
    // resto segue a ordem normal, cada um como um par índice+detalhamento.
    const [primeiroIndice, ...demaisIndices] = d.indicesDesligamento;
    const motivosSubmotivosPair =
      card('Motivos de desligamento', '&#128172;', d.motivos.length ? '<div class="chart-h"><canvas id="c-desl-motivos"></canvas></div>' : empty('Sem dados.')) +
      card('Submotivos', '&#128269;', '<p class="sub" style="margin-bottom:8px">Clique numa barra de "Motivos de desligamento" para detalhar.</p><div id="submotivos-body">' + empty('Selecione um motivo ao lado.') + '</div>');
    el.innerHTML = `
      <div class="kpi-grid">
        ${kpi('Respostas de pesquisa', U.fmtInt(d.totalRespostas), 'respondidas no período', 'var(--p1)')}
        ${kpi('Trabalhariam novamente', d.totalRespostas ? U.fmtPct(d.positivos / d.totalRespostas) : '—', `${U.fmtInt(d.positivos)} de ${U.fmtInt(d.totalRespostas)}`, '#1baf7a')}
        ${kpi('eNPS', d.nps === null ? '—' : d.nps, 'das respostas do período', 'var(--p2)')}
        ${kpi('Solicitações de desligamento', U.fmtInt(d.totalSolicitacoes), 'desligados no período (data da demissão)', 'var(--warning)')}
        ${kpi('Participação na entrevista', d.participacao === null ? '—' : U.fmtPct(d.participacao),
          `${U.fmtInt(d.entrevistasRealizadas)} de ${U.fmtInt(d.totalSolicitacoes)} desligados no período` +
          (d.participacaoElegiveis === null ? '' : ` · ${U.fmtPct(d.participacaoElegiveis)} dos elegíveis`), '#4a3aa7')}
      </div>
      ${renderNpsScale(d.npsDetalhe)}
      <div class="insight info" style="margin-bottom:18px">
        <span class="ic">${HUB_ICON('info')}</span>
        <span><strong>Como calculamos o eNPS:</strong> cada resposta de 0 a 10 (probabilidade de indicar a empresa) entra num de três grupos — Detratores (nota 0 a 6), Neutros (7 a 8) e Promotores (9 a 10). eNPS = ((nº de Promotores − nº de Detratores) ÷ total de respostas) × 100. O resultado varia de -100 (todo mundo detrator) a +100 (todo mundo promotor); Neutros contam no total mas não entram na conta de cima nem de baixo.</span>
      </div>
      <div class="grid2-fixed">
        ${renderIndiceDesligamentoCard(primeiroIndice, 0)}
        ${motivosSubmotivosPair}
        ${demaisIndices.map((idx, i) => renderIndiceDesligamentoCard(idx, i + 1)).join('')}
      </div>
      <div class="grid2">
        ${card('Status da entrevista', '&#9989;', d.statusEntrevista.length ? '<div class="chart-h short"><canvas id="c-desl-status"></canvas></div>' : empty('Sem dados.'))}
        ${card('Comentários positivos (anônimos)', '&#128172;', `<div class="scroll-box">${comentariosHtml(d.comentariosPositivos)}</div>`)}
        ${card('Comentários negativos (anônimos)', '&#128172;', `<div class="scroll-box">${comentariosHtml(d.comentariosNegativos)}</div>`)}
        ${card('Pessoas citadas nos depoimentos', '&#128100;', d.pessoasCitadas.length ? `<div class="scroll-box">${topRows(d.pessoasCitadas.map(p => ({ label: p.nome, value: p.count })), 'Menções')}</div>` : empty('Nenhuma pessoa identificada nos textos.'))}
        ${insightsCard('Insights e plano de ação', '&#129504;', insightsList(d.insights), { full: true })}
      </div>`;
    d.indicesDesligamento.forEach((idx, i) => wireIndiceDesligamento(idx, i));
    if (d.motivos.length) {
      const t = d.motivos.slice(0, 8);
      barChart('c-desl-motivos', t.map(x => x.label), t.map(x => x.value), {
        horizontal: true,
        onClick: motivo => renderSubmotivos(motivo, d.motivoSubmotivoPairs)
      });
    }
    if (d.statusEntrevista.length) doughnutChart('c-desl-status', d.statusEntrevista.map(x => x.label), d.statusEntrevista.map(x => x.value));
  }

  function renderSubmotivos(motivo, pairs) {
    const body = document.getElementById('submotivos-body');
    if (!body) return;
    const sub = pairs.filter(p => p.motivo === motivo);
    const counts = M.countBy(sub, 'submotivo');
    body.innerHTML = `<p class="sub" style="margin-bottom:8px"><strong>${U.escapeHtml(motivo)}</strong> — ${U.fmtInt(sub.length)} caso(s)</p>` +
      (counts.length ? '<div class="chart-h short"><canvas id="c-desl-submotivos"></canvas></div>' : empty('Sem submotivo informado para este motivo.'));
    if (counts.length) barChart('c-desl-submotivos', counts.map(x => x.label), counts.map(x => x.value), { horizontal: true });
  }

  // ==================================================================
  // CELEBRAÇÕES
  // ==================================================================
  function renderCelebracoes(el, f) {
    if (noDataGate(el, ['celebracoes'], canUpload())) return;
    const d = M.celebracoesMetrics(f);
    el.innerHTML = `
      <div class="kpi-grid">
        ${kpi('Celebrações enviadas', U.fmtInt(d.total), '', '#e87ba4')}
        ${kpi('Curtidas', U.fmtInt(d.curtidas), '', 'var(--p1)')}
        ${kpi('Comentários', U.fmtInt(d.comentarios), '', 'var(--p2)')}
      </div>
      <div class="grid2">
        ${card('Por departamento', '&#128194;', d.porDepartamento.length ? '<div class="chart-h"><canvas id="c-cel-depto"></canvas></div>' : empty('Sem dados.'))}
        ${card('Evolução mensal', '&#128200;', d.serie.length ? '<div class="chart-h"><canvas id="c-cel-serie"></canvas></div>' : empty('Sem dados.'))}
        ${card('Gestores que mais enviaram', '&#127942;', topRows(d.porGestor, 'Enviadas'))}
        ${card('Top remetentes', '&#128101;', topRows(d.porRemetente, 'Enviadas'))}
      </div>
      <div style="height:16px"></div>
      <div id="cel-semanas"></div>`;
    if (d.porDepartamento.length) { const t = d.porDepartamento.slice(0, 12); barChart('c-cel-depto', t.map(x => x.label), t.map(x => x.value), { horizontal: true }); }
    if (d.serie.length) lineChart('c-cel-serie', d.serie.map(x => x.label), [{ label: 'Celebrações', data: d.serie.map(x => x.value) }]);
    renderCelebracoesSemanas(el.querySelector('#cel-semanas'), f);
  }

  // Ritmo semanal das celebrações: lojas × semanas do mês. A meta é 1
  // celebração do gestor para o próprio time por semana — o total do mês
  // esconde quem concentrou tudo numa semana só. Mesma regra do Boletim da
  // Liderança (metrics-boletim.js: celebração conta uma vez, só do gestor para
  // o time, sem o usuário automático de aniversários).
  let celSemMes = null;
  function renderCelebracoesSemanas(el, f) {
    if (!el || !window.HUB_METRICS_BOLETIM) return;
    const MB = HUB_METRICS_BOLETIM;
    const fim = (f.end || U.todayISO()).slice(0, 7);
    const ini = (f.start || fim + '-01').slice(0, 7);
    const meses = U.monthsBetween(ini, fim).reverse().slice(0, 24);
    if (!meses.length) meses.push(fim);
    if (!celSemMes || !meses.includes(celSemMes)) celSemMes = meses[0];
    const mes = celSemMes;
    // Filtros do topo: departamento direto; unidade pelos departamentos que existem nela.
    const deps = new Set((HUB_DATA.colaboradores || []).filter(c => U.matchesAny(c.unidade, f.unidade)).map(c => U.normalizeText(c.departamento || '')));
    const r = MB.calcularMes(mes);
    const linhas = [];
    for (const op of MB.OPERACOES) for (const l of r.operacoes[op.id].lojas) {
      if (l.apoio || !l.cel_semanas) continue;
      if (f.unidade && f.unidade.length && !deps.has(U.normalizeText(l.departamento))) continue;
      if (!U.matchesAny(l.departamento, f.departamento)) continue;
      linhas.push({ op: op.nome, nome: l.nome, sem: l.cel_semanas, total: l.ind.celebracoes });
    }
    const ultimoDia = Number(MB.fimDoMes(mes).slice(8, 10));
    const semanas = [[1, 7], [8, 14], [15, 21], [22, 28], [29, ultimoDia]].filter(([a]) => a <= ultimoDia);
    const n = semanas.length;
    const com = x => x.sem.slice(0, n).filter(v => v > 0).length;
    linhas.sort((a, b) => com(b) - com(a) || b.total - a.total || a.op.localeCompare(b.op, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'));
    const dd = x => String(x).padStart(2, '0'), mm = mes.slice(5, 7);
    const cel = v => v
      ? `<td style="background:#1baf7a;color:#fff;font-weight:700;text-align:center">${U.fmtInt(v)}</td>`
      : '<td style="background:#F1F3F6;color:#B5BCC8;text-align:center">—</td>';
    const resumo = x => { const k = com(x); const cor = k >= n - 1 ? '#0f8a4c' : k > 0 ? '#9a6b00' : 'var(--critical)'; return `<td style="text-align:center;font-weight:700;color:${cor}">${k} de ${n}</td>`; };
    const sel = `<select id="cel-sem-mes" style="margin-left:auto;padding:5px 8px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:12px">${meses.map(m => `<option value="${m}"${m === mes ? ' selected' : ''}>${U.escapeHtml(MB.nomeDoMes(m, true))}/${m.slice(0, 4)}</option>`).join('')}</select>`;
    const todas = linhas.filter(x => com(x) === n).length, nenhuma = linhas.filter(x => !com(x)).length;
    el.innerHTML = card(`Ritmo semanal das celebrações das lideranças ${sel}`, '&#128197;', linhas.length ? `
      <div class="table-wrap" style="max-height:620px"><table class="dt" style="border-collapse:separate;border-spacing:3px"><thead><tr><th>Operação</th><th>Loja / área</th>
        ${semanas.map(([a, b], i) => `<th style="text-align:center">${i + 1}ª semana<br><span style="font-weight:400">${dd(a)}/${mm} a ${dd(b)}/${mm}</span></th>`).join('')}
        <th style="text-align:center">Semanas com<br>celebração</th><th style="text-align:center">Total</th></tr></thead><tbody>
        ${linhas.map(x => `<tr><td>${U.escapeHtml(x.op)}</td><td>${U.escapeHtml(x.nome)}</td>${x.sem.slice(0, n).map(cel).join('')}${resumo(x)}<td style="text-align:center">${U.fmtInt(x.total)}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="sub" style="color:var(--muted);font-size:11.5px;margin-top:8px">Cada quadrado verde é uma semana em que o gestor celebrou o próprio time (liderados diretos, mesma loja ou @todos); o número é quantas celebrações. A meta é 1 por semana: o ideal é a linha toda verde. ${todas} de ${linhas.length} lojas/áreas celebraram em todas as semanas; ${nenhuma} não celebraram nenhuma vez. Cada celebração conta uma vez (o export repete a linha por destinatário) e o usuário automático de aniversários não entra.</p>`
      : empty('Nenhuma loja no recorte dos filtros.'), { full: true });
    el.querySelector('#cel-sem-mes').addEventListener('change', e => { celSemMes = e.target.value; renderCelebracoesSemanas(el, f); });
  }

  // ==================================================================
  // FEEDBACKS
  // ==================================================================
  function renderFeedbacks(el, f) {
    if (noDataGate(el, ['feedbacks'], canUpload())) return;
    const d = M.feedbacksMetrics(f);
    el.innerHTML = `
      <div class="kpi-grid">${kpi('Feedbacks enviados', U.fmtInt(d.total), '', '#1baf7a')}</div>
      <div class="grid2">
        ${card('Por departamento', '&#128194;', d.porDepartamento.length ? '<div class="chart-h"><canvas id="c-fb-depto"></canvas></div>' : empty('Sem dados.'))}
        ${card('Evolução mensal', '&#128200;', d.serie.length ? '<div class="chart-h"><canvas id="c-fb-serie"></canvas></div>' : empty('Sem dados.'))}
        ${card('Quem mais enviou (gestor/remetente)', '&#127942;', topRows(d.porGestor, 'Enviados'))}
        ${card('Quem mais recebeu', '&#128101;', topRows(d.porDestinatario, 'Recebidos'))}
      </div>`;
    if (d.porDepartamento.length) { const t = d.porDepartamento.slice(0, 12); barChart('c-fb-depto', t.map(x => x.label), t.map(x => x.value), { horizontal: true }); }
    if (d.serie.length) lineChart('c-fb-serie', d.serie.map(x => x.label), [{ label: 'Feedbacks', data: d.serie.map(x => x.value) }]);
  }

  // ==================================================================
  // 1:1
  // ==================================================================
  // Tabela "Gestores que mais realizaram 1:1": Nome | Headcount liderado |
  // Realizados | % de 1:1 realizados (Realizados ÷ Headcount liderado).
  function gestoresOneOnOneTabela(lista) {
    if (!lista.length) return empty('Sem registros.');
    return `<div class="table-wrap"><table class="dt"><thead><tr><th>Nome</th><th>Headcount liderado</th><th>Realizados</th><th>% de 1:1 realizados</th></tr></thead><tbody>${lista.map(g =>
      `<tr><td>${U.escapeHtml(g.label)}</td><td>${g.headcount ? U.fmtInt(g.headcount) : '—'}</td><td>${U.fmtInt(g.realizados)}</td><td>${g.pctRealizados === null ? '—' : U.fmtPct(g.pctRealizados, 0)}</td></tr>`).join('')}</tbody></table></div>
      <p class="sub" style="margin-top:8px;font-size:11px;color:var(--muted)">Headcount liderado = pessoas ativas e desativadas que respondem diretamente ao gestor na planilha de Colaboradores. % de 1:1 realizados = Realizados ÷ Headcount liderado; pode passar de 100% quando há mais de um 1:1 com a mesma pessoa no período filtrado.</p>`;
  }

  function renderOneOnOne(el, f) {
    if (noDataGate(el, ['one_on_one'], canUpload())) return;
    const d = M.oneOnOneMetrics(f);
    el.innerHTML = `
      <div class="kpi-grid">
        ${kpi('1:1 registrados', U.fmtInt(d.total), '', '#4a3aa7')}
        ${kpi('Realizados', U.fmtInt(d.realizados), d.total ? U.fmtPct(d.realizados / d.total) : '', '#1baf7a')}
        ${kpi('Agendados', U.fmtInt(d.agendados), '', 'var(--warning)')}
      </div>
      <div class="grid2">
        ${card('Realizados por departamento', '&#128194;', d.porDepartamento.length ? '<div class="chart-h"><canvas id="c-oo-depto"></canvas></div>' : empty('Sem dados.'))}
        ${card('Evolução mensal', '&#128200;', d.serie.length ? '<div class="chart-h"><canvas id="c-oo-serie"></canvas></div>' : empty('Sem dados.'))}
        ${card('Gestores que mais realizaram 1:1', '&#127942;', gestoresOneOnOneTabela(d.porGestor), { full: true })}
      </div>`;
    if (d.porDepartamento.length) { const t = d.porDepartamento.slice(0, 12); barChart('c-oo-depto', t.map(x => x.label), t.map(x => x.value), { horizontal: true }); }
    if (d.serie.length) lineChart('c-oo-serie', d.serie.map(x => x.label), [{ label: '1:1 realizados', data: d.serie.map(x => x.value) }]);
  }

  // Treinamentos: js/sections/treinamentos.js (abas Visão geral, Twygo, Unibê e Academia Hering).

  window.HUB_SECTIONS = {
    renderDashboard, renderHeadcount, renderRotatividade, renderDesligamento,
    renderCelebracoes, renderFeedbacks, renderOneOnOne
  };
})();
