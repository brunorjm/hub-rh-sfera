// Indicadores → Fechamento do Período: a apresentação do RH à diretoria,
// montada com os dados do Hub no layout do deck oficial. Só Administrador
// (indicadores.fechamento). Os slides vêm de fechamento-slides.js e são
// desenhados aqui em HTML (960 × 540 pt, escalados para caber na tela); o
// mesmo conteúdo vai para o PowerPoint por fechamento-pptx.js.
//
// Blocos: Resumo executivo, Demografia, Recrutamento e Seleção (planilha 18),
// DHO (Turnover, Pesquisa de Desligamento, Experiência, Cultura e Engajamento),
// T&D (Twygo, Unibê e Academia Hering) e os slides escritos pelo RH. Textos,
// slides ocultos e o "Fechar período" ficam em fechamento_periodo
// (supabase-fechamento-periodo.sql).
(function () {
  const S = () => window.HUB_FECHAMENTO_SLIDES;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const PT = 4 / 3;   // 1 pt = 1,333 px
  const FUNDOS = { capa: 'assets/fechamento/fundo-capa.jpg', divisor: 'assets/fechamento/fundo-divisor.jpg', conteudo: 'assets/fechamento/fundo-conteudo.jpg' };
  const ROTULO_TIPO = { mensal: 'Mensal', bimestral: 'Bimestral', semestral: 'Semestral', anual: 'Anual' };

  const state = { tipo: 'mensal', ano: null, n: null };
  let slidesAtuais = [];
  let elAtual = null;
  let experiencia = { 45: null, 90: null };

  // Demografia e DHO: as mesmas contas das telas Rotatividade, Entrevista
  // Desligamento e Avaliação da Experiência (ver fechamento-slides-dho.js).
  // O NPS por unidade chama a mesma conta várias vezes: guarda por filtro.
  // Os resultados ficam guardados enquanto a tela está aberta (salvar um texto,
  // ocultar um slide ou voltar a um período já visto não recalcula nada); a
  // abertura da tela (renderFechamento) e o "Atualizar dados" limpam.
  const CACHE = { rot: new Map(), ent: new Map(), mes: new Map() };
  function limparCache() { CACHE.rot.clear(); CACHE.ent.clear(); CACHE.mes.clear(); }
  function dadosDho() {
    const memo = (fn, c) => f => { const k = JSON.stringify(f); if (!c.has(k)) c.set(k, fn(f)); return c.get(k); };
    const cols = (window.HUB_DATA && HUB_DATA.colaboradores) || [];
    const unidades = Array.from(new Set(cols.map(c => c.unidade).concat(((window.HUB_DATA && HUB_DATA.entrevista_pesquisa) || []).map(r => r.unidade)).filter(Boolean)));
    return {
      colaboradores: cols, unidades,
      rot: memo(f => HUB_METRICS.rotatividadeMetrics(f), CACHE.rot),
      ent: memo(f => HUB_METRICS.entrevistaMetrics(f), CACHE.ent),
      exp: experiencia, X: window.HUB_EXP_METRICS
    };
  }

  const STYLE = `<style>
    #sec-ind-fechamento .fx-top{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:16px}
    #sec-ind-fechamento .fx-top label{display:flex;flex-direction:column;gap:4px;font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px}
    #sec-ind-fechamento .fx-top select{padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:12.5px;font-family:inherit;color:var(--text);background:#fff;min-width:150px}
    #sec-ind-fechamento .fx-acoes{display:flex;gap:8px;margin-left:auto;flex-wrap:wrap}
    #sec-ind-fechamento .fx-btn{display:inline-flex;align-items:center;gap:7px;padding:9px 14px;border-radius:9px;font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;border:1.5px solid var(--p1);background:#fff;color:var(--p1)}
    #sec-ind-fechamento .fx-btn.pri{background:var(--p1);color:#fff}
    #sec-ind-fechamento .fx-btn:disabled{opacity:.55;cursor:wait}
    #sec-ind-fechamento .fx-btn svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2}
    #sec-ind-fechamento .fx-info{font-size:11.5px;color:var(--muted);margin:-6px 0 14px;line-height:1.5}
    #sec-ind-fechamento .fx-lista{display:flex;flex-direction:column;gap:22px;max-width:1100px}
    #sec-ind-fechamento .fx-cab{display:flex;justify-content:space-between;align-items:baseline;font-size:12px;color:var(--text2);margin-bottom:6px}
    #sec-ind-fechamento .fx-cab b{color:var(--text)}
    #sec-ind-fechamento .fx-notas{font-size:11.5px;color:var(--muted);margin-top:6px}
    #sec-ind-fechamento .fx-notas summary{cursor:pointer}
    #sec-ind-fechamento .fx-notas p{white-space:pre-wrap;margin:6px 0 0;line-height:1.5}
    #sec-ind-fechamento .fx-faixa{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:10px 14px;border-radius:10px;background:#EAF2FE;color:#1d3f73;font-size:12.5px;margin-bottom:12px}
    #sec-ind-fechamento .fx-faixa.fechado{background:#E6F6EE;color:#0f5c36}
    #sec-ind-fechamento .fx-faixa.aviso{background:#FFF4E0;color:#7a3e00}
    #sec-ind-fechamento .fx-tag{font-size:10.5px;padding:2px 8px;border-radius:10px;background:#FFF4E0;color:#7a3e00;margin-left:6px}
    #sec-ind-fechamento .fx-incl{font-size:11.5px;color:var(--text2);display:inline-flex;gap:5px;align-items:center;cursor:pointer}
    #sec-ind-fechamento .fx-oculto .fx-quadro{opacity:.35}
    #sec-ind-fechamento .fx-edit textarea,#sec-ind-fechamento .fx-man textarea,#sec-ind-fechamento .fx-man input{width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font:12.5px/1.45 inherit;font-family:inherit;color:var(--text);background:#fff;margin-top:6px}
    #sec-ind-fechamento .fx-edit-acoes{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px}
    #sec-ind-fechamento .fx-edit-acoes span,#sec-ind-fechamento .fx-man-top span,#sec-ind-fechamento .fx-mcab span{font-size:11px;color:var(--muted)}
    #sec-ind-fechamento .fx-man{max-width:1100px;margin-bottom:18px}
    #sec-ind-fechamento .fx-man summary{cursor:pointer;font-size:13px}
    #sec-ind-fechamento .fx-man-top{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:12px 0}
    #sec-ind-fechamento .fx-mslide{border-top:1px solid var(--border);padding:14px 0}
    #sec-ind-fechamento .fx-mcab{display:flex;flex-direction:column;gap:2px;font-size:13px}
    #sec-ind-fechamento .fx-mlinha{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    #sec-ind-fechamento .fx-mcards{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px;margin:4px 0 10px}
    #sec-ind-fechamento .fx-histbox{max-width:1100px;margin-bottom:16px;font-size:12.5px}
    #sec-ind-fechamento .fx-histbox table{margin-top:8px}
    .fx-quadro{position:relative;overflow:hidden;border-radius:8px;box-shadow:0 2px 10px rgba(10,25,66,.18);background:#1E3461}
    .fx-slide{position:absolute;left:0;top:0;width:960pt;height:540pt;transform-origin:0 0;background-size:cover;background-position:center;font-family:'Ubuntu',system-ui,sans-serif;overflow:hidden}
    .fx-el{position:absolute;box-sizing:border-box}
    .fx-txt{display:flex;flex-direction:column;line-height:1.2;overflow:visible}
    .fx-txt p{margin:0}
    .fx-txt p.bul{position:relative;padding-left:12pt}
    .fx-txt p.bul::before{content:'•';position:absolute;left:2pt}
    .fx-chart canvas{width:100%!important;height:100%!important}
    .fx-palco{position:fixed;inset:0;background:#000;z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer}
    .fx-palco .fx-quadro{border-radius:0;box-shadow:none}
    .fx-palco .fx-pg{position:fixed;right:18px;bottom:12px;color:rgba(255,255,255,.45);font:12px 'Ubuntu',sans-serif}
  </style>`;

  const ICON = {
    baixar: '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>',
    apresentar: '<svg viewBox="0 0 24 24"><path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m7 21 5-5 5 5"/></svg>'
  };

  // ------------------------------------------------------------------
  // Desenho de um slide (mesma descrição que vai para o PPTX)
  // ------------------------------------------------------------------
  const hex = (c, transp) => {
    const n = parseInt(c, 16), a = transp == null ? 1 : 1 - transp / 100;
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const box = e => `left:${e.x}pt;top:${e.y}pt;width:${e.w}pt;height:${e.h}pt;`;

  function htmlTexto(e) {
    const just = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[e.valign || 'top'];
    const ps = e.paras.map(p => {
      const st = `text-align:${p.align || e.align || 'left'};` + (p.spaceAfter ? `margin-bottom:${p.spaceAfter}pt;` : '') + (p.spaceBefore ? `margin-top:${p.spaceBefore}pt;` : '');
      const rs = p.runs.map(r => {
        const bold = r.bold != null ? r.bold : !!e.bold;
        return `<span style="font-weight:${bold ? 700 : 400};${r.italic ? 'font-style:italic;' : ''}color:#${r.color || e.color};font-size:${r.size || e.size}pt">${esc(r.text)}</span>`;
      }).join('');
      return `<p class="${p.bullet ? 'bul' : ''}" style="${st}color:#${e.color};font-size:${e.size}pt">${rs || '&nbsp;'}</p>`;
    }).join('');
    return `<div class="fx-el fx-txt" style="${box(e)}justify-content:${just};font-size:${e.size}pt;color:#${e.color}">${ps}</div>`;
  }

  function htmlSlide(sd, prefixo) {
    let i = 0;
    const els = sd.els.map(e => {
      if (e.t === 'rect') return `<div class="fx-el" style="${box(e)}background:${hex(e.fill, e.transp)};${e.line ? `border:.75pt solid #${e.line};` : ''}${e.r ? `border-radius:${e.r}pt;` : ''}"></div>`;
      if (e.t === 'text') return htmlTexto(e);
      if (e.t === 'chart') return `<div class="fx-el fx-chart" style="${box(e)}"><canvas id="${prefixo}-c${i++}"></canvas></div>`;
      return '';
    }).join('');
    return `<div class="fx-slide" style="background-image:url('${FUNDOS[sd.fundo]}')">${els}</div>`;
  }

  // Mesmos formatos do PPTX (fechamento-pptx.js): int (sem zeros), pct, pct0, nps.
  function fmtValor(v, fmt) {
    if (v == null) return '';
    if (fmt === 'pct') return (v * 100).toFixed(1).replace('.', ',') + '%';
    if (fmt === 'pct0') return Math.round(v * 100) + '%';
    if (fmt === 'nps') return (v > 0 ? '+' : '') + Math.round(v);
    if (fmt === 'dec1') return v.toFixed(1).replace('.', ',');
    return v === 0 ? '' : Math.round(v).toLocaleString('pt-BR');
  }

  function configGrafico(e, C) {
    const px = pt => Math.round(pt * PT);
    const fonte = (pt, bold) => ({ family: 'Ubuntu', size: px(pt), weight: bold ? '700' : '400' });
    const claro = '#' + C.claro;
    const horizontal = e.kind === 'bar';
    const fmt = e.fmt || (e.pct ? 'pct' : 'int');
    const datasets = e.series.map(s => s.line
      ? { type: 'line', label: s.name, data: s.values, borderColor: '#' + s.color, backgroundColor: '#' + s.color, borderWidth: 2, pointRadius: 3, spanGaps: false, order: 0,
        datalabels: { anchor: 'end', align: 'top', color: '#FFD9B3', font: fonte(8, true), formatter: v => fmtValor(v, fmt) } }
      : { type: 'bar', label: s.name, data: s.values, backgroundColor: '#' + s.color, borderWidth: 0, categoryPercentage: horizontal ? 0.7 : 0.75, barPercentage: 0.9, order: 1,
        datalabels: e.kind === 'combo'
          ? { anchor: 'start', align: 'end', color: '#FFFFFF', font: fonte(8, true), formatter: v => fmtValor(v, fmt) }
          : e.stacked
            ? { anchor: 'end', align: 'start', color: '#FFFFFF', font: fonte(e.labelSize || 9, true), formatter: v => fmtValor(v, fmt) }
            : { anchor: 'end', align: 'end', color: '#FFFFFF', font: fonte(e.labelSize || 9, true), formatter: v => fmtValor(v, fmt) } });
    const eixoCat = { stacked: !!e.stacked, ticks: { color: claro, font: fonte(e.catSize || 9), autoSkip: false }, grid: { display: false }, border: { color: '#5C76A8' } };
    const eixoVal = { stacked: !!e.stacked, display: false, beginAtZero: true, grace: horizontal ? '28%' : '15%', grid: { display: false } };
    return {
      type: 'bar',
      data: { labels: e.labels, datasets },
      options: {
        indexAxis: horizontal ? 'y' : 'x', animation: false, responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 4, right: horizontal ? 8 : 4 } },
        scales: horizontal ? { y: eixoCat, x: eixoVal } : { x: eixoCat, y: eixoVal },
        plugins: {
          title: { display: !!e.title, text: e.title, color: '#FFFFFF', font: fonte(11, true), padding: { bottom: 6 } },
          legend: { display: !!e.legend && e.series.length > 1, position: 'top', labels: { color: claro, font: fonte(9), boxWidth: px(7), boxHeight: px(7) } },
          tooltip: { enabled: true },
          datalabels: { display: true, clamp: true }
        }
      }
    };
  }

  function desenharGraficos(sd, prefixo) {
    const C = S().COR;
    let i = 0;
    sd.els.filter(e => e.t === 'chart').forEach(e => {
      const id = `${prefixo}-c${i++}`;
      if (!e.labels.length) {
        const cv = document.getElementById(id);
        if (cv) cv.parentNode.innerHTML = `<div style="height:100%;display:flex;flex-direction:column;align-items:center;color:#${C.branco};font:700 11pt Ubuntu"><span>${esc(e.title || '')}</span><span style="margin:auto;font-weight:400;color:#${C.suave}">Sem dados no período</span></div>`;
        return;
      }
      HUB_CHART(id, configGrafico(e, C));
    });
  }

  function encaixar(quadro, largura) {
    const k = largura / (960 * PT);
    quadro.style.width = largura + 'px';
    quadro.style.height = Math.round(540 * PT * k) + 'px';
    quadro.querySelector('.fx-slide').style.transform = `scale(${k})`;
  }

  // ------------------------------------------------------------------
  // Período
  // ------------------------------------------------------------------
  function anosDisponiveis(vagas) {
    const anos = new Set();
    vagas.forEach(v => { if (v.data_abertura) anos.add(+v.data_abertura.slice(0, 4)); });
    return Array.from(anos).filter(a => a >= 2024).sort((a, b) => b - a);
  }

  // Último período completo antes de hoje.
  function periodoPadrao(tipo) {
    const hoje = new Date();
    let ano = hoje.getFullYear();
    const ultimoMesFechado = hoje.getMonth();   // 0 = janeiro → nenhum mês fechado no ano
    const meses = S().TIPOS[tipo].meses;
    let n = Math.floor(ultimoMesFechado / meses);
    if (n < 1) { ano -= 1; n = S().TIPOS[tipo].qtd; }
    return { ano, n };
  }

  function opcoesPeriodo(tipo) {
    const t = S().TIPOS[tipo];
    const out = [];
    for (let n = 1; n <= t.qtd; n++) {
      const p = S().periodo(tipo, 2000, n);
      out.push({ n, nome: tipo === 'mensal' ? S().MESES[n - 1] : tipo === 'anual' ? 'Ano inteiro' : p.label.replace(' 2000', '') });
    }
    return out;
  }

  // ------------------------------------------------------------------
  // Tela
  // ------------------------------------------------------------------
  // Cultura, Engajamento e T&D: o cálculo mensal do Boletim da Liderança
  // (precisa de HUB_BOLETIM.carregar, que também traz AvE e Engajamento).
  let cultOk = false;
  let satisfacaoOk = false;
  function dadosCult() {
    if (!cultOk || !window.HUB_METRICS_BOLETIM) return null;
    return {
      OPERACOES: HUB_METRICS_BOLETIM.OPERACOES,
      // Pesquisa de Engajamento: totais oficiais dos pulsos e notas diárias (ver engajamentoDe).
      // Turmas das multiplicadoras (slide de esforço em T&D).
      turmas: (window.HUB_DATA && HUB_DATA.treinamento_turmas) || [],
      colaboradores: (window.HUB_DATA && HUB_DATA.colaboradores) || [],
      engajamento: { pulsos: (window.HUB_DATA && HUB_DATA.engajamento_pulso) || [], notas: (window.HUB_BOLETIM_DATA && HUB_BOLETIM_DATA.engajamento_notas) || [], operacaoDe: HUB_METRICS_BOLETIM.operacaoDe },
      // Feedbacks (planilha 4), Humor (36, agregado) e Satisfação (16).
      feedbacks: (window.HUB_DATA && HUB_DATA.feedbacks) || null,
      humor: (window.HUB_BOLETIM_DATA && HUB_BOLETIM_DATA.humor_mensal) || null,
      rotuloHumor: HUB_METRICS_BOLETIM.rotuloHumor,
      satisfacao: satisfacaoOk && window.HUB_SATISFACAO_DATA ? { respostas: HUB_SATISFACAO_DATA.respostas, ciclos: HUB_SATISFACAO_DATA.ciclos } : null,
      headcount: ate => {
        const porUni = {};
        HUB_FECHAMENTO_DHO._internal.ativosEm((window.HUB_DATA && HUB_DATA.colaboradores) || [], ate).forEach(c => { const k = c.unidade || 'Não informado'; porUni[k] = (porUni[k] || 0) + 1; });
        return porUni;
      },
      mes: mk => { if (!CACHE.mes.has(mk)) CACHE.mes.set(mk, HUB_METRICS_BOLETIM.calcularMes(mk)); return CACHE.mes.get(mk); }
    };
  }

  // Registro do período (textos e slides do RH, ocultos, fechamento).
  let registro = null;      // linha de fechamento_periodo, ou null
  let registroId = null;
  let tabelaOk = true;
  const edicao = { textos: {}, manuais: {}, ocultos: [] };
  const fechado = () => !!(registro && registro.status === 'fechado' && registro.snapshot);
  const visiveis = () => slidesAtuais.filter(sd => !edicao.ocultos.includes(sd.id));
  const dataBr = iso => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');

  async function carregarRegistro(p) {
    const id = HUB_FECHAMENTO.periodoId(p.tipo, p.ano, p.n);
    if (registroId === id) return;
    registroId = id;
    const r = await HUB_FECHAMENTO.buscarPeriodo(id).catch(() => null);
    tabelaOk = !(r && r.indisponivel);
    registro = r && !r.indisponivel ? r : null;
    edicao.textos = Object.assign({}, (registro && registro.textos) || {});
    edicao.manuais = JSON.parse(JSON.stringify((registro && registro.manuais) || {}));
    edicao.ocultos = ((registro && registro.ocultos) || []).slice();
  }

  async function salvar(campos) {
    const p = S().periodo(state.tipo, state.ano, state.n);
    registro = await HUB_FECHAMENTO.salvarPeriodo(p, Object.assign({ textos: edicao.textos, manuais: edicao.manuais, ocultos: edicao.ocultos }, campos || {}));
    registroId = registro.id;
  }

  async function renderFechamento(el) {
    elAtual = el;
    el.innerHTML = STYLE + '<div class="card"><div class="empty">Carregando o Fechamento...</div></div>';
    try {
      await HUB_FECHAMENTO.carregar();
      // Avaliação da Experiência é carregada sob demanda; se falhar, o slide avisa.
      for (const c of [45, 90]) {
        try { experiencia[c] = HUB_EXP_METRICS.preparar(await HUB_EXPERIENCIA.carregar(c), c); } catch (err) { experiencia[c] = null; }
      }
      try { await HUB_BOLETIM.carregar(); cultOk = true; } catch (err) { cultOk = false; }
      try { await HUB_SATISFACAO.carregar(); satisfacaoOk = true; } catch (err) { satisfacaoOk = false; }
    } catch (err) {
      el.innerHTML = STYLE + `<div class="card"><div class="empty">${esc(err.message)}</div></div>`;
      return;
    }
    const d = window.HUB_FECHAMENTO_DATA;
    if (!d.vagas.length) {
      el.innerHTML = STYLE + '<div class="card"><div class="empty">Nenhuma vaga na base do Fechamento. Suba a planilha 18. Controle Geral de Vagas em Administração → Upload de Planilhas.</div></div>';
      return;
    }
    if (state.ano == null) Object.assign(state, periodoPadrao(state.tipo));
    registroId = null;
    limparCache();
    await desenhar(el);
    // Já baixa o gerador de PowerPoint em segundo plano (é o que mais demora no
    // primeiro "Baixar PPTX").
    HUB_FECHAMENTO_PPTX.carregarBiblioteca().catch(() => {});
  }

  async function desenhar(el) {
    const d = window.HUB_FECHAMENTO_DATA;
    const anos = anosDisponiveis(d.vagas);
    if (!anos.includes(state.ano)) anos.unshift(state.ano);
    const p = S().periodo(state.tipo, state.ano, state.n);
    await carregarRegistro(p);
    // Primeira montagem do período: avisa e deixa a tela pintar antes das contas
    // (no Anual, Cultura e T&D calculam até 24 meses do Boletim).
    if (!fechado() && cultOk && !CACHE.mes.has(`${p.ano}-${String(p.m2).padStart(2, '0')}`)) {
      el.innerHTML = STYLE + `<div class="card"><div class="empty">Calculando o Fechamento de ${esc(p.label)}... (alguns segundos na primeira vez)</div></div>`;
      await new Promise(r => setTimeout(r, 30));
    }
    const atualizadoEm = d.vagas.reduce((m, v) => (v.importado_em && v.importado_em > m ? v.importado_em : m), '').slice(0, 10);
    slidesAtuais = fechado()
      ? registro.snapshot
      : S().montar(p, { vagas: d.vagas, metas: d.metas, atualizadoEm, dho: dadosDho(), cult: dadosCult(), manuais: edicao.manuais, textos: edicao.textos });
    const travado = fechado();

    const faixa = !tabelaOk
      ? '<div class="fx-faixa aviso">Os textos do RH, os slides ocultos e o "Fechar período" precisam da tabela nova no Supabase (rode supabase-fechamento-periodo.sql). Os slides de dados funcionam normalmente.</div>'
      : travado
        ? `<div class="fx-faixa fechado"><span><b>Período fechado</b> em ${esc(dataBr(registro.fechado_em))}${registro.fechado_por ? ' por ' + esc(registro.fechado_por) : ''}. Os números estão congelados como foram apresentados.</span><button class="fx-btn" id="fx-reabrir">Reabrir período</button></div>`
        : `<div class="fx-faixa"><span><b>Rascunho</b> — os números são recalculados com os dados atuais do Hub.${registro && registro.atualizado_em ? ` Textos salvos em ${esc(dataBr(registro.atualizado_em))}${registro.atualizado_por ? ' por ' + esc(registro.atualizado_por) : ''}.` : ''}</span><button class="fx-btn pri" id="fx-fechar">Fechar período</button></div>`;

    el.innerHTML = STYLE + `
      <div class="fx-top">
        <label>Tipo<select id="fx-tipo">${Object.keys(ROTULO_TIPO).map(t => `<option value="${t}" ${t === state.tipo ? 'selected' : ''}>${ROTULO_TIPO[t]}</option>`).join('')}</select></label>
        <label>Ano<select id="fx-ano">${anos.map(a => `<option value="${a}" ${a === state.ano ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
        ${state.tipo === 'anual' ? '' : `<label>Período<select id="fx-n">${opcoesPeriodo(state.tipo).map(o => `<option value="${o.n}" ${o.n === state.n ? 'selected' : ''}>${esc(o.nome)}</option>`).join('')}</select></label>`}
        <div class="fx-acoes">
          <button class="fx-btn" id="fx-historico">Histórico</button>
          <button class="fx-btn" id="fx-apresentar">${ICON.apresentar}Apresentar</button>
          <button class="fx-btn pri" id="fx-baixar">${ICON.baixar}Baixar PPTX</button>
        </div>
      </div>
      ${faixa}
      <p class="fx-info"><b>${esc(p.label)}</b> (${esc(p.de.split('-').reverse().join('/'))} a ${esc(p.ate.split('-').reverse().join('/'))}) · ${visiveis().length} de ${slidesAtuais.length} slides na apresentação · R&S pela planilha 18 (atualizada em ${esc(atualizadoEm.split('-').reverse().join('/'))}); Demografia, DHO, Cultura e T&D pelas mesmas contas das telas do Hub e do Boletim da Liderança.${cultOk ? '' : ' <b>Cultura e T&D indisponíveis:</b> não consegui carregar o Boletim da Liderança.'}</p>
      <div id="fx-hist"></div>
      ${travado || !tabelaOk ? '' : painelManuais(p)}
      <div class="fx-lista">${slidesAtuais.map((sd, i) => {
        const oculto = edicao.ocultos.includes(sd.id);
        const podeEditar = !travado && tabelaOk && sd.textoAuto != null;
        return `
        <div class="${oculto ? 'fx-oculto' : ''}">
          <div class="fx-cab"><span><b>${i + 1}.</b> ${esc(sd.nome)}${oculto ? ' <span class="fx-tag">fora da apresentação</span>' : ''}</span>
            ${!travado && tabelaOk && sd.id !== 'capa' ? `<label class="fx-incl"><input type="checkbox" data-incluir="${esc(sd.id)}" ${oculto ? '' : 'checked'}> incluir na apresentação</label>` : ''}</div>
          <div class="fx-quadro" data-i="${i}">${htmlSlide(sd, 'fx' + i)}</div>
          ${podeEditar ? `<details class="fx-notas fx-edit"><summary>Editar o texto de abertura</summary>
            <textarea data-texto="${esc(sd.id)}" rows="3">${esc(edicao.textos[sd.id] || sd.textoAuto)}</textarea>
            <div class="fx-edit-acoes"><button class="fx-btn pri" data-salvar-texto="${esc(sd.id)}">Salvar texto</button>${edicao.textos[sd.id] ? `<button class="fx-btn" data-restaurar="${esc(sd.id)}">Voltar ao texto automático</button>` : ''}<span>Use **texto** para negrito.</span></div></details>` : ''}
          ${sd.notas ? `<details class="fx-notas"><summary>Como foi calculado</summary><p>${esc(sd.notas)}</p></details>` : ''}
        </div>`;
      }).join('')}
      </div>`;

    const lista = el.querySelector('.fx-lista');
    const largura = () => Math.min(lista.clientWidth || 1100, 1100);
    el.querySelectorAll('.fx-quadro').forEach(q => encaixar(q, largura()));
    slidesAtuais.forEach((sd, i) => desenharGraficos(sd, 'fx' + i));

    el.querySelector('#fx-tipo').addEventListener('change', e => { state.tipo = e.target.value; Object.assign(state, periodoPadrao(state.tipo)); desenhar(el); });
    el.querySelector('#fx-ano').addEventListener('change', e => { state.ano = +e.target.value; desenhar(el); });
    const selN = el.querySelector('#fx-n');
    if (selN) selN.addEventListener('change', e => { state.n = +e.target.value; desenhar(el); });
    el.querySelector('#fx-baixar').addEventListener('click', e => baixar(e.currentTarget, p));
    el.querySelector('#fx-apresentar').addEventListener('click', () => apresentar(0));
    el.querySelector('#fx-historico').addEventListener('click', () => mostrarHistorico(el));
    ligarAcoes(el, p);
  }

  // Ações de edição (salvar textos, ocultar slide, slides do RH, fechar/reabrir).
  function ligarAcoes(el, p) {
    const tentar = async (btn, fn) => {
      const txt = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
      try { await fn(); await desenhar(el); }
      catch (err) { alert(err.message || err); if (btn) { btn.disabled = false; btn.textContent = txt; } }
    };
    el.querySelectorAll('[data-salvar-texto]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.salvarTexto;
      const sd = slidesAtuais.find(s => s.id === id);
      const v = el.querySelector(`textarea[data-texto="${id}"]`).value.trim();
      if (!v || (sd && v === sd.textoAuto)) delete edicao.textos[id]; else edicao.textos[id] = v;
      tentar(b, () => salvar());
    }));
    el.querySelectorAll('[data-restaurar]').forEach(b => b.addEventListener('click', () => { delete edicao.textos[b.dataset.restaurar]; tentar(b, () => salvar()); }));
    el.querySelectorAll('[data-incluir]').forEach(c => c.addEventListener('change', () => {
      const id = c.dataset.incluir;
      edicao.ocultos = edicao.ocultos.filter(x => x !== id);
      if (!c.checked) edicao.ocultos.push(id);
      tentar(null, () => salvar());
    }));
    el.querySelectorAll('[data-salvar-manual]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.salvarManual;
      const caixa = el.querySelector(`[data-manual="${id}"]`);
      const cards = Array.from(caixa.querySelectorAll('.fx-mcard')).map(c => ({ titulo: c.querySelector('input').value.trim(), texto: c.querySelector('textarea').value.trim() }));
      edicao.manuais[id] = { titulo: caixa.querySelector('[data-campo="titulo"]').value.trim(), subtitulo: caixa.querySelector('[data-campo="subtitulo"]').value.trim(), cards };
      tentar(b, () => salvar());
    }));
    const copiar = el.querySelector('#fx-copiar');
    if (copiar) copiar.addEventListener('click', () => tentar(copiar, async () => {
      const lista = await HUB_FECHAMENTO.listarPeriodos();
      const atual = HUB_FECHAMENTO.periodoId(p.tipo, p.ano, p.n);
      const ordem = r => r.ano * 100 + (r.tipo === 'anual' ? 12 : r.n * S().TIPOS[r.tipo].meses);
      const anteriores = lista.filter(r => r.id !== atual && ordem(r) < p.ano * 100 + p.m2).sort((a, b) => ordem(b) - ordem(a));
      for (const r of anteriores) {
        const reg = await HUB_FECHAMENTO.buscarPeriodo(r.id);
        if (reg && reg.manuais && Object.keys(reg.manuais).some(k => HUB_FECHAMENTO_MANUAIS.temConteudo(reg.manuais[k]))) {
          edicao.manuais = JSON.parse(JSON.stringify(reg.manuais));
          await salvar();
          return;
        }
      }
      throw new Error('Nenhum fechamento anterior com slides do RH preenchidos.');
    }));
    const fechar = el.querySelector('#fx-fechar');
    if (fechar) fechar.addEventListener('click', () => {
      if (!confirm(`Fechar ${p.label}?\n\nOs números ficam congelados como estão agora (uploads novos não mudam mais este fechamento). Dá para reabrir depois.`)) return;
      tentar(fechar, () => salvar({ status: 'fechado', snapshot: slidesAtuais, fechado_em: new Date().toISOString(), fechado_por: (window.HUB_USER || {}).nome || null }));
    });
    const reabrir = el.querySelector('#fx-reabrir');
    if (reabrir) reabrir.addEventListener('click', () => {
      if (!confirm(`Reabrir ${p.label}?\n\nOs números voltam a ser recalculados com os dados atuais. Os textos do RH continuam salvos.`)) return;
      tentar(reabrir, async () => { await HUB_FECHAMENTO.reabrirPeriodo(p); registroId = null; });
    });
  }

  // Slides escritos pelo RH: título, subtítulo e até 4 cards cada.
  function painelManuais(p) {
    const MAN = window.HUB_FECHAMENTO_MANUAIS;
    if (!MAN) return '';
    const preenchidos = MAN.MANUAIS.filter(d => MAN.temConteudo(edicao.manuais[d.id])).length;
    return `<details class="card fx-man"><summary><b>Slides escritos pelo RH</b> — projetos, próximos passos, endomarketing, rituais... (${preenchidos} de ${MAN.MANUAIS.length} preenchidos; os vazios não entram na apresentação)</summary>
      <div class="fx-man-top"><button class="fx-btn" id="fx-copiar">Trazer do último fechamento</button><span>Cada linha do texto vira um parágrafo; linha começando com "-" vira tópico; **texto** fica em negrito.</span></div>
      ${MAN.MANUAIS.map(d => {
        const m = edicao.manuais[d.id] || {};
        const cards = (m.cards || []).concat([{}, {}, {}, {}]).slice(0, 4);
        return `<div class="fx-mslide" data-manual="${d.id}">
          <div class="fx-mcab"><b>${esc(d.titulo)}</b><span>${esc(d.dica)}</span></div>
          <div class="fx-mlinha"><input data-campo="titulo" placeholder="Título do slide (padrão: ${esc(d.titulo)})" value="${esc(m.titulo || '')}"><input data-campo="subtitulo" placeholder="Frase de abertura (opcional)" value="${esc(m.subtitulo || '')}"></div>
          <div class="fx-mcards">${cards.map((c, i) => `<div class="fx-mcard"><input placeholder="Card ${i + 1} — título" value="${esc(c.titulo || '')}"><textarea rows="5" placeholder="Texto do card ${i + 1}">${esc(c.texto || '')}</textarea></div>`).join('')}</div>
          <button class="fx-btn pri" data-salvar-manual="${d.id}">Salvar slide</button>
        </div>`;
      }).join('')}
    </details>`;
  }

  async function mostrarHistorico(el) {
    const box = el.querySelector('#fx-hist');
    if (box.innerHTML) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="card fx-histbox">Carregando...</div>';
    const lista = await HUB_FECHAMENTO.listarPeriodos().catch(() => []);
    if (!lista.length) { box.innerHTML = '<div class="card fx-histbox">Nenhum fechamento salvo ainda.</div>'; return; }
    box.innerHTML = `<div class="card fx-histbox"><b>Fechamentos salvos</b><table class="dt"><thead><tr><th>Período</th><th>Situação</th><th>Atualizado</th><th></th></tr></thead><tbody>${lista.map(r => {
      const pr = S().periodo(r.tipo, r.ano, r.n);
      return `<tr><td>${esc(ROTULO_TIPO[r.tipo])} · ${esc(pr.label)}</td><td>${r.status === 'fechado' ? `Fechado em ${esc(dataBr(r.fechado_em))}` : 'Rascunho'}</td><td>${esc(dataBr(r.atualizado_em))}${r.atualizado_por ? ' · ' + esc(r.atualizado_por) : ''}</td><td><button class="fx-btn" data-abrir="${esc(r.id)}">Abrir</button></td></tr>`;
    }).join('')}</tbody></table></div>`;
    box.querySelectorAll('[data-abrir]').forEach(b => b.addEventListener('click', () => {
      const r = lista.find(x => x.id === b.dataset.abrir);
      Object.assign(state, { tipo: r.tipo, ano: r.ano, n: r.n });
      desenhar(el);
    }));
  }

  // Redimensiona os quadros sem redesenhar os gráficos (o Chart.js se ajusta sozinho).
  window.addEventListener('resize', () => {
    if (!elAtual || !elAtual.classList.contains('active')) return;
    const lista = elAtual.querySelector('.fx-lista');
    if (!lista) return;
    elAtual.querySelectorAll('.fx-lista .fx-quadro').forEach(q => encaixar(q, Math.min(lista.clientWidth || 1100, 1100)));
  });

  // ------------------------------------------------------------------
  // PowerPoint
  // ------------------------------------------------------------------
  async function paraDataUrl(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('Não consegui carregar ' + url);
    const blob = await r.blob();
    return new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = reject; fr.readAsDataURL(blob); });
  }

  async function baixar(btn, p) {
    const txt = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'Gerando PPTX...';
    try {
      const fundos = {};
      for (const k of Object.keys(FUNDOS)) fundos[k] = await paraDataUrl(FUNDOS[k]);
      const pres = await HUB_FECHAMENTO_PPTX.gerar(visiveis(), { fundos, titulo: 'Fechamento RH — ' + p.label });
      await pres.writeFile({ fileName: `Fechamento RH - ${p.label}.pptx` });
    } catch (err) {
      alert('Não foi possível gerar o PowerPoint: ' + (err.message || err));
    } finally {
      btn.disabled = false;
      btn.innerHTML = txt;
    }
  }

  // ------------------------------------------------------------------
  // Modo apresentação: tela cheia, setas/espaço avançam, Esc sai.
  // ------------------------------------------------------------------
  function apresentar(inicio) {
    const deck = visiveis();
    let i = inicio;
    const palco = document.createElement('div');
    palco.className = 'fx-palco';
    document.body.appendChild(palco);
    const mostrar = () => {
      palco.innerHTML = `<div class="fx-quadro">${htmlSlide(deck[i], 'fxp')}</div><div class="fx-pg">${i + 1} / ${deck.length}</div>`;
      const q = palco.querySelector('.fx-quadro');
      encaixar(q, Math.min(window.innerWidth, window.innerHeight * 16 / 9));
      desenharGraficos(deck[i], 'fxp');
    };
    const sair = () => {
      document.removeEventListener('keydown', tecla);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      palco.remove();
    };
    const ir = delta => { const j = i + delta; if (j < 0) return; if (j >= deck.length) { sair(); return; } i = j; mostrar(); };
    function tecla(e) {
      if (e.key === 'Escape') sair();
      else if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); ir(1); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); ir(-1); }
    }
    document.addEventListener('keydown', tecla);
    palco.addEventListener('click', () => ir(1));
    document.addEventListener('fullscreenchange', function f() { if (!document.fullscreenElement) { document.removeEventListener('fullscreenchange', f); if (palco.isConnected) sair(); } });
    if (palco.requestFullscreen) palco.requestFullscreen().then(mostrar, mostrar); else mostrar();
  }

  window.HUB_SECTIONS = window.HUB_SECTIONS || {};
  window.HUB_SECTIONS.renderFechamento = renderFechamento;
})();
