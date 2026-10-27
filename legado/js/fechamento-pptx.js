// Fechamento do Período → PowerPoint. Desenha a descrição de
// fechamento-slides.js com o PptxGenJS: texto editável, gráficos nativos (dá
// para editar os dados no PowerPoint) e o fundo da marca como imagem do slide.
// No navegador o PptxGenJS é carregado só ao clicar em "Baixar PPTX".
(function () {
  // O deck do RH é 13,33 × 7,5 pol. (LAYOUT_WIDE): as medidas de
  // fechamento-slides.js são pontos (960 × 540 pt), 72 pt = 1 pol.
  const pol = v => v / 72;
  const FONTE = 'Ubuntu';
  const PPTXGEN_URL = 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';

  function carregarBiblioteca() {
    if (window.PptxGenJS) return Promise.resolve(window.PptxGenJS);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PPTXGEN_URL;
      s.onload = () => (window.PptxGenJS ? resolve(window.PptxGenJS) : reject(new Error('Não consegui carregar o gerador de PowerPoint.')));
      s.onerror = () => reject(new Error('Não consegui carregar o gerador de PowerPoint (verifique a conexão).'));
      document.head.appendChild(s);
    });
  }

  function texto(slide, el) {
    const arr = [];
    el.paras.forEach((p, i) => {
      const ultimoPara = i === el.paras.length - 1;
      const rs = p.runs.length ? p.runs : [{ text: '' }];
      rs.forEach((r, j) => {
        const o = {
          bold: r.bold != null ? r.bold : !!el.bold, italic: !!r.italic,
          color: r.color || el.color, fontSize: r.size || el.size, fontFace: FONTE,
          align: p.align || el.align || 'left'
        };
        if (p.bullet) o.bullet = { indent: 12 };
        if (p.spaceAfter) o.paraSpaceAfter = p.spaceAfter;
        if (p.spaceBefore) o.paraSpaceBefore = p.spaceBefore;
        if (j === rs.length - 1 && !ultimoPara) o.breakLine = true;
        arr.push({ text: r.text, options: o });
      });
    });
    slide.addText(arr, {
      x: pol(el.x), y: pol(el.y), w: pol(el.w), h: pol(el.h), margin: 0, valign: el.valign || 'top',
      fontFace: FONTE, fontSize: el.size, color: el.color, isTextBox: true, fit: 'none'
    });
  }

  function retangulo(pres, slide, el) {
    const o = { x: pol(el.x), y: pol(el.y), w: pol(el.w), h: pol(el.h), fill: { color: el.fill, transparency: el.transp || 0 } };
    o.line = el.line ? { color: el.line, width: 0.75 } : { type: 'none' };
    if (el.r) { o.rectRadius = pol(el.r); slide.addShape(pres.shapes.ROUNDED_RECTANGLE, o); }
    else slide.addShape(pres.shapes.RECTANGLE, o);
  }

  // Formato dos rótulos (código de número do Excel). Na contagem os zeros somem.
  const FORMATOS = { int: '0;-0;;', pct: '0.0%', pct0: '0%', nps: '+0;-0;0', dec1: '0.0' };
  const formato = el => FORMATOS[el.fmt || (el.pct ? 'pct' : 'int')];

  function grafico(pres, slide, el, COR) {
    const base = {
      x: pol(el.x), y: pol(el.y), w: pol(el.w), h: pol(el.h),
      showTitle: !!el.title, title: el.title, titleColor: COR.branco, titleFontSize: 11, titleFontFace: FONTE, titleBold: true,
      showLegend: !!el.legend && el.series.length > 1, legendPos: 't', legendColor: COR.claro, legendFontSize: 9, legendFontFace: FONTE,
      catAxisLabelColor: COR.claro, catAxisLabelFontSize: el.catSize || 9, catAxisLabelPos: el.negativos ? 'low' : 'nextTo', catAxisLabelFontFace: FONTE, catAxisLineShow: true, catAxisLineColor: '5C76A8',
      valAxisHidden: true, valGridLine: { style: 'none' }, catGridLine: { style: 'none' },
      showValue: true, dataLabelColor: COR.branco, dataLabelFontSize: el.labelSize || 9, dataLabelFontFace: FONTE, dataLabelFontBold: true,
      dataLabelFormatCode: formato(el)
    };
    const dados = el.series.map(s => ({ name: s.name, labels: el.labels, values: s.values.map(v => (v == null ? null : v)) }));
    if (!el.labels.length) {
      slide.addText('Sem dados no período', { x: base.x, y: base.y + base.h / 2 - 0.15, w: base.w, h: 0.3, align: 'center', fontFace: FONTE, fontSize: 10, color: COR.suave, isTextBox: true });
      if (el.title) slide.addText(el.title, { x: base.x, y: base.y, w: base.w, h: 0.3, align: 'center', fontFace: FONTE, fontSize: 11, bold: true, color: COR.branco, isTextBox: true });
      return;
    }
    if (el.kind === 'combo') {
      const barras = el.series.filter(s => !s.line), linhas = el.series.filter(s => s.line);
      slide.addChart([
        // A posição do rótulo vai em cada tipo: 't' (acima) só vale para linha —
        // numa barra deixa o arquivo inválido para o PowerPoint.
        { type: pres.charts.BAR, data: dados.filter((d, i) => !el.series[i].line), options: { barDir: 'col', barGrouping: 'clustered', chartColors: barras.map(s => s.color), barGapWidthPct: 60, dataLabelPosition: 'inBase' } },
        { type: pres.charts.LINE, data: dados.filter((d, i) => el.series[i].line), options: { chartColors: linhas.map(s => s.color), lineSize: 2, lineDataSymbol: 'circle', lineDataSymbolSize: 5, dataLabelPosition: 't', dataLabelColor: 'FFD9B3' } }
      ], Object.assign(base, { showLegend: true, dataLabelFontSize: 8 }));
      return;
    }
    const horizontal = el.kind === 'bar';
    slide.addChart(pres.charts.BAR, dados, Object.assign(base, {
      barDir: horizontal ? 'bar' : 'col', barGrouping: el.stacked ? 'stacked' : 'clustered', chartColors: el.series.map(s => s.color), barGapWidthPct: horizontal ? 40 : 60,
      // Em barra empilhada 'outEnd' deixa o arquivo inválido: só ctr, inEnd ou inBase.
      dataLabelPosition: el.stacked ? 'inEnd' : 'outEnd', catAxisOrientation: horizontal ? 'maxMin' : 'minMax'
    }));
  }

  // fundos = { capa, divisor, conteudo } em data URL.
  async function gerar(slides, opts) {
    const PptxGenJS = opts.PptxGenJS || await carregarBiblioteca();
    const S = window.HUB_FECHAMENTO_SLIDES;
    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE';
    pres.author = 'Hub RH Sfera';
    pres.company = 'Sfera Multifranquias';
    pres.title = opts.titulo || 'Fechamento RH';
    pres.theme = { headFontFace: FONTE, bodyFontFace: FONTE };
    for (const sd of slides) {
      const slide = pres.addSlide();
      // O PptxGenJS quer "image/jpeg;base64,..." (sem o "data:" da URL).
      slide.background = opts.fundos && opts.fundos[sd.fundo] ? { data: opts.fundos[sd.fundo].replace(/^data:/, '') } : { color: '1E3461' };
      for (const el of sd.els) {
        if (el.t === 'rect') retangulo(pres, slide, el);
        else if (el.t === 'text') texto(slide, el);
        else if (el.t === 'chart') grafico(pres, slide, el, S.COR);
      }
      if (sd.notas) slide.addNotes(sd.notas);
    }
    return pres;
  }

  window.HUB_FECHAMENTO_PPTX = { gerar, carregarBiblioteca };
})();
