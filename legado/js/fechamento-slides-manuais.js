// Fechamento do Período — slides escritos pelo RH (projetos, próximos passos,
// endomarketing, rituais...), resumo executivo e contracapa.
//
// Slide manual = { titulo, subtitulo, cards: [{ titulo, texto }] } (até 4 cards).
// No texto, cada linha vira um parágrafo; linha começando com "-" ou "•" vira
// tópico; **negrito** como no resto do Fechamento. Slide sem conteúdo não entra
// na apresentação.
(function () {
  const S = () => window.HUB_FECHAMENTO_SLIDES;

  // Slides manuais do deck, na ordem em que aparecem (depois = id do slide que vem antes).
  const MANUAIS = [
    { id: 'man-rs-projetos', depois: 'rs-projecao', titulo: 'PROJETOS EM ANDAMENTO — R&S', dica: 'Um card por projeto: objetivo, status e o que foi feito.' },
    { id: 'man-dho-boletim', depois: 'cult-satisfacao', alt: 'cult-engajamento', titulo: 'BOLETIM DA LIDERANÇA', dica: 'Aderência da liderança ao último boletim, por operação.' },
    { id: 'man-dho-projetos', depois: 'man-dho-boletim', titulo: 'PROJETOS EM ANDAMENTO — DHO', dica: 'Um card por projeto: objetivo, status e o que foi feito.' },
    { id: 'man-dho-proximos', depois: 'man-dho-projetos', titulo: 'PRÓXIMOS PASSOS', dica: 'Avaliação de Desempenho, calendário de ciclos, política de carreiras...' },
    { id: 'man-dho-endomarketing', depois: 'man-dho-proximos', titulo: 'AÇÕES DE ENDOMARKETING', dica: 'Ações realizadas no período e próximas datas.' },
    // Depois do slide automático das multiplicadoras; sem ele (nenhuma turma no Hub), depois de Unibê e Academia.
    { id: 'man-td-horas', depois: 'td-multis', alt: 'td-academia', titulo: 'DASHBOARD DE TREINAMENTOS — ESFORÇO MULTIPLICADORA', dica: 'Complemento ao slide automático "Esforço das multiplicadoras" (que sai das planilhas importadas em Turmas e Multiplicadoras): destaques, projetos, multiplicadoras que ainda não estão no Hub.' },
    { id: 'man-td-projetos', depois: 'man-td-horas', titulo: 'PROJETOS EM ANDAMENTO — T&D', dica: 'Um card por projeto: objetivo, status e o que foi feito.' },
    { id: 'man-rituais', depois: 'man-td-projetos', titulo: 'RITUAIS DO RH', dica: 'Rituais e reuniões recorrentes do time.' }
  ];

  const temConteudo = m => !!(m && ((m.subtitulo || '').trim() || (m.cards || []).some(c => (c.titulo || '').trim() || (c.texto || '').trim())));

  function parasDoTexto(texto, para) {
    return String(texto || '').split(/\r?\n/).map(l => l.trimEnd()).filter((l, i, arr) => l || (i > 0 && arr[i - 1])).map(l => {
      const bullet = /^\s*[-•]\s+/.test(l);
      return para(bullet ? l.replace(/^\s*[-•]\s+/, '') : (l || ' '), { bullet, spaceAfter: 3 });
    });
  }

  function slideManual(def, m) {
    const { COR, para, titulo, card } = S().pecas;
    const cards = (m.cards || []).filter(c => (c.titulo || '').trim() || (c.texto || '').trim()).slice(0, 4);
    const sub = (m.subtitulo || '').trim();
    const y0 = sub ? 112 : 95, alt = 490 - y0;
    const els = [].concat(titulo((m.titulo || def.titulo).toUpperCase()));
    if (sub) els.push({ t: 'text', x: 40, y: 76, w: 830, h: 30, size: 11, color: COR.branco, paras: [para(sub)] });
    const n = cards.length;
    const cols = n === 4 ? 2 : Math.max(n, 1), linhas = n === 4 ? 2 : 1;
    const gap = 10, W = (910 - gap * (cols - 1)) / cols, H = (alt - gap * (linhas - 1)) / linhas;
    cards.forEach((c, i) => {
      const x = 25 + (i % cols) * (W + gap), y = y0 + Math.floor(i / cols) * (H + gap);
      const corpo = parasDoTexto(c.texto, para);
      const len = String(c.texto || '').length;
      const size = len > 700 / (n || 1) * 2 ? 8.5 : len > 350 ? 9.5 : 10.5;
      els.push(card(x, y, W, H),
        { t: 'text', x: x + 14, y: y + 10, w: W - 28, h: 22, size: 13, bold: true, color: COR.azul, paras: [para(c.titulo || '')] },
        { t: 'text', x: x + 14, y: y + 36, w: W - 28, h: H - 46, size, color: COR.branco, paras: corpo.length ? corpo : [para(' ')] });
    });
    return { id: def.id, nome: m.titulo || def.titulo, fundo: 'conteudo', manual: true, els, notas: 'Slide escrito pelo RH no Fechamento do Período.' };
  }

  // ------------------------------------------------------------------
  // Resumo executivo: os números principais de cada bloco, numa página.
  function resumo(p, dados, deck) {
    const { COR, para, titulo, card, fmtInt, fmtPct, pp } = S().pecas;
    const pa = S().mesmoPeriodoAnoAnterior(p);
    const M = window.HUB_METRICS_FECHAMENTO;
    const tiles = [];
    if (M && dados.vagas && dados.vagas.length) {
      const r = M.periodo(dados.vagas, p.de, p.ate), a = M.periodo(dados.vagas, pa.de, pa.ate);
      tiles.push({ bloco: 'R&S', rotulo: 'Vagas fechadas', valor: fmtInt(r.fechadas), sub: `${fmtInt(a.fechadas)} em ${pa.curto}` });
      tiles.push({ bloco: 'R&S', rotulo: 'Dentro do prazo (SLA)', valor: fmtPct(r.noPrazo), sub: `${fmtPct(a.noPrazo)} em ${pa.curto}` + (pp(r.noPrazo, a.noPrazo) ? ` (${pp(r.noPrazo, a.noPrazo)})` : '') });
    }
    const dho = dados.dho;
    if (dho && dho.rot) {
      const f = (de, ate) => ({ start: de, end: ate, unidade: [], departamento: [], gestor: '', colaborador: '' });
      const r = dho.rot(f(p.de, p.ate)), a = dho.rot(f(pa.de, pa.ate));
      const demo = deck.find(s => s.id === 'demografia');
      const hc = demo ? demo.els.find(e => e.t === 'text' && e.size === 60) : null;
      if (hc) tiles.push({ bloco: 'PESSOAS', rotulo: 'Headcount', valor: hc.paras[0].runs.map(x => x.text).join(''), sub: `em ${p.ate.split('-').reverse().join('/')}` });
      tiles.push({ bloco: 'DHO', rotulo: 'Turnover médio (ao mês)', valor: fmtPct(r.turnoverMedio, 1), sub: `${fmtPct(a.turnoverMedio, 1)} em ${pa.curto}` });
      if (dho.ent) {
        const e = dho.ent(f(p.de, p.ate));
        tiles.push({ bloco: 'DHO', rotulo: 'NPS de desligamento', valor: e.nps == null ? '—' : (e.nps > 0 ? '+' : '') + e.nps, sub: `${fmtInt(e.totalRespostas)} respostas` });
      }
    }
    const cult = dados.cult;
    if (cult) {
      const C = window.HUB_FECHAMENTO_CULTURA._internal;
      const ms = C.mesesDe(p);
      const eng = C.valor(cult, ms, 'engajamento_feedz');
      const pe = C.engajamentoDe(cult, p.de, p.ate);
      const nota = pe ? pe.nota : C.valor(cult, ms, 'pesquisa_nota');
      // T&D do período: cursos concluídos na Twygo (não o progresso acumulado da plataforma).
      const tw = C.twygoDoPeriodo ? C.twygoDoPeriodo(p) : null;
      tiles.push({ bloco: 'CULTURA', rotulo: 'Engajamento na Feedz', valor: fmtPct(eng), sub: 'índice do Boletim da Liderança' });
      tiles.push({ bloco: 'CULTURA', rotulo: 'Pesquisa de Engajamento', valor: nota == null ? '—' : nota.toFixed(1).replace('.', ',') + ' / 5', sub: 'nota média' });
      if (tw && tw.hist && tw.hist.temDatas) tiles.push({ bloco: 'T&D', rotulo: 'Cursos concluídos na Twygo', valor: fmtInt(tw.hist.conclusoes), sub: `${fmtInt(Math.round(tw.hist.horas))} h · ${fmtInt(tw.hist.pessoas)} pessoas no período` });
    }
    const els = [].concat(
      titulo(`RESUMO EXECUTIVO — ${p.label.toUpperCase()}`),
      { t: 'text', x: 40, y: 76, w: 830, h: 20, size: 11, color: COR.branco, paras: [para('Os principais números do período. O detalhe de cada um está no bloco correspondente.')] }
    );
    const W = 220, H = 175, G = 10;
    tiles.slice(0, 8).forEach((t, i) => {
      const x = 25 + (i % 4) * (W + G), y = 110 + Math.floor(i / 4) * (H + G);
      els.push(card(x, y, W, H),
        { t: 'text', x: x + 14, y: y + 12, w: W - 28, h: 14, size: 8, bold: true, color: COR.suave, paras: [para(t.bloco)] },
        { t: 'text', x: x + 14, y: y + 28, w: W - 28, h: 34, size: 12, bold: true, color: COR.claro, paras: [para(t.rotulo)] },
        { t: 'text', x: x + 14, y: y + 68, w: W - 28, h: 56, size: 34, bold: true, color: COR.branco, valign: 'middle', paras: [para(t.valor)] },
        { t: 'text', x: x + 14, y: y + 132, w: W - 28, h: 32, size: 9, color: COR.suave, paras: [para(t.sub)] });
    });
    return { id: 'resumo', nome: 'Resumo Executivo', fundo: 'conteudo', els, notas: 'Números calculados nos blocos de R&S, DHO, Cultura e T&D deste mesmo Fechamento.' };
  }

  function contracapa(p) {
    const { COR, para } = S().pecas;
    return {
      id: 'contracapa', nome: 'Encerramento', fundo: 'capa',
      els: [
        { t: 'rect', x: 96, y: 160, w: 9, h: 100, fill: COR.azul, r: 4 },
        { t: 'text', x: 117, y: 158, w: 640, h: 50, size: 36, bold: true, color: COR.azul, valign: 'middle', paras: [para('FECHAMENTO')] },
        { t: 'text', x: 117, y: 205, w: 640, h: 50, size: 36, bold: true, color: COR.branco, valign: 'middle', paras: [para('RECURSOS HUMANOS')] },
        { t: 'text', x: 117, y: 268, w: 640, h: 26, size: 16, bold: true, color: COR.branco, valign: 'middle', paras: [para('RELATÓRIO – ' + p.label.toUpperCase())] },
        { t: 'text', x: 117, y: 300, w: 640, h: 22, size: 12, color: COR.claro, valign: 'middle', paras: [para('Obrigado!')] }
      ]
    };
  }

  window.HUB_FECHAMENTO_MANUAIS = { MANUAIS, temConteudo, slideManual, resumo, contracapa };
})();
