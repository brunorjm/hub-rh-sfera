// Fechamento do Período: monta os slides como uma lista de elementos
// posicionados num quadro de 960 × 540 PONTOS — o tamanho do deck do RH
// (13,33 × 7,5 pol., 16:9), com as mesmas posições dos slides originais. A mesma
// descrição é desenhada na tela (sections/fechamento.js) e exportada para
// PPTX (fechamento-pptx.js), então o que se vê é o que se baixa.
//
// Elementos:
//   { t:'rect', x, y, w, h, fill, transp (0–100), line, r (cantos, px) }
//   { t:'text', x, y, w, h, size (pt), color, bold, align, valign, paras:[{ runs:[{text,bold,color,size,italic}], bullet }] }
//   { t:'chart', x, y, w, h, kind:'col'|'bar'|'combo', title, labels, series:[{name, values, color, line}], legend,
//     fmt:'int'|'pct'|'pct0'|'nps'|'dec1', stacked, negativos (rótulos do eixo na borda), catSize, labelSize }
// Texto aceita **negrito** (ver txt()).
(function () {
  const COR = {
    azul: '1C7CEC', branco: 'FFFFFF', claro: 'CADCFC', suave: '8EA3CF', valor: '2F80ED',
    card: '0A1942', borda: '5C76A8', amarelo: 'F2B84B', laranja: 'F28C38', verde: '3CCB8B', vermelho: 'F46A6A', estr: 'C7D6F5'
  };
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const MES3 = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const pad = n => String(n).padStart(2, '0');
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  // ---------------------------------------------------------------------
  // Períodos: mensal (n = mês), bimestral (n = 1–6), semestral (1–2), anual.
  // ---------------------------------------------------------------------
  const TIPOS = {
    mensal: { qtd: 12, meses: 1 }, bimestral: { qtd: 6, meses: 2 }, semestral: { qtd: 2, meses: 6 }, anual: { qtd: 1, meses: 12 }
  };
  function periodo(tipo, ano, n) {
    const t = TIPOS[tipo];
    if (!t) throw new Error('Tipo de período inválido: ' + tipo);
    n = tipo === 'anual' ? 1 : n;
    const m1 = (n - 1) * t.meses + 1, m2 = m1 + t.meses - 1;
    const ultimoDia = new Date(Date.UTC(ano, m2, 0)).getUTCDate();
    const aa = String(ano).slice(2);
    let label, curto, nome;
    if (tipo === 'mensal') { label = `${MESES[m1 - 1]} ${ano}`; curto = `${MES3[m1 - 1].toLowerCase()}/${aa}`; nome = MESES[m1 - 1].toLowerCase(); }
    else if (tipo === 'bimestral') { label = `${MESES[m1 - 1]} e ${MESES[m2 - 1]} ${ano}`; curto = `${MES3[m1 - 1].toLowerCase()}–${MES3[m2 - 1].toLowerCase()}/${aa}`; nome = 'o bimestre'; }
    else if (tipo === 'semestral') { label = `${n}º Semestre ${ano}`; curto = `${n}S/${aa}`; nome = 'o semestre'; }
    else { label = `Ano ${ano}`; curto = String(ano); nome = 'o ano'; }
    return { tipo, ano, n, m1, m2, meses: t.meses, de: `${ano}-${pad(m1)}-01`, ate: `${ano}-${pad(m2)}-${pad(ultimoDia)}`, label, curto, nome };
  }
  const mesmoPeriodoAnoAnterior = p => periodo(p.tipo, p.ano - 1, p.n);
  // "em setembro 2026", "em julho e agosto 2026", "em 2026".
  const emPeriodo = p => 'em ' + (p.tipo === 'anual' ? String(p.ano) : p.label.toLowerCase());

  // ---------------------------------------------------------------------
  // Utilitários de texto e números
  // ---------------------------------------------------------------------
  const fmtInt = v => (v == null ? '—' : Math.round(v).toLocaleString('pt-BR'));
  const fmtPct = (v, casas) => (v == null ? '—' : (v * 100).toFixed(casas || 0).replace('.', ',') + '%');
  const fmtDias = v => (v == null ? '—' : Math.round(v) + ' dias');
  const fmtData = iso => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
  const pp = (a, b) => { if (a == null || b == null) return null; const d = Math.round((a - b) * 100); return (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d) + ' p.p.'; };
  const varPct = (a, b) => (b ? (a - b) / b : null);

  // "**92 vagas** fechadas" → runs com negrito.
  function runs(s, base) {
    const out = [];
    String(s).split(/(\*\*[^*]+\*\*)/).forEach(part => {
      if (!part) return;
      const b = /^\*\*.*\*\*$/.test(part);
      out.push(Object.assign({}, base || {}, { text: b ? part.slice(2, -2) : part }, b ? { bold: true } : {}));
    });
    return out;
  }
  const para = (s, opts) => Object.assign({ runs: runs(s, opts && opts.run) }, opts || {});

  // Natureza principal: "Substituição - Cota" conta como Substituição.
  const naturezaPrincipal = v => (v.natureza ? v.natureza.split(' - ')[0].trim() : '(não informado)');

  // ---------------------------------------------------------------------
  // Blocos visuais
  // ---------------------------------------------------------------------
  function titulo(texto) {
    return [
      { t: 'rect', x: 22, y: 38, w: 6, h: 30, fill: COR.azul, r: 3 },
      { t: 'text', x: 40, y: 37, w: 830, h: 34, size: 22, bold: true, color: COR.branco, valign: 'middle', paras: [para(texto)] }
    ];
  }
  function resumo(texto) {
    return { t: 'text', x: 40, y: 76, w: 830, h: 36, size: 11, color: COR.branco, valign: 'top', paras: [para(texto)] };
  }
  function card(x, y, w, h) {
    return { t: 'rect', x, y, w, h, fill: COR.card, transp: 45, line: COR.borda, r: 10 };
  }
  function kpi(x, y, w, h, rotulo, valor, sub, corValor) {
    return [
      card(x, y, w, h),
      { t: 'text', x: x + 12, y: y + 8, w: w - 24, h: 18, size: 10.5, bold: true, color: COR.claro, paras: [para(rotulo)] },
      { t: 'text', x: x + 12, y: y + 30, w: w - 24, h: 40, size: 28, bold: true, color: corValor || COR.valor, valign: 'middle', paras: [para(valor)] },
      { t: 'text', x: x + 12, y: y + h - 26, w: w - 24, h: 18, size: 9, color: COR.suave, paras: [para(sub || '')] }
    ];
  }

  // ---------------------------------------------------------------------
  // Slides
  // ---------------------------------------------------------------------
  function slideCapa(p) {
    return {
      id: 'capa', nome: 'Capa', fundo: 'capa',
      els: [
        { t: 'rect', x: 96, y: 139, w: 9, h: 123, fill: COR.azul, r: 4 },
        { t: 'text', x: 117, y: 132, w: 640, h: 68, size: 60, bold: true, color: COR.azul, valign: 'middle', paras: [para('FECHAMENTO')] },
        { t: 'text', x: 117, y: 195, w: 700, h: 81, size: 60, bold: true, color: COR.branco, valign: 'middle', paras: [para('RECURSOS HUMANOS')] },
        { t: 'text', x: 117, y: 271, w: 600, h: 29, size: 18, bold: true, color: COR.branco, valign: 'middle', paras: [para('RELATÓRIO – ' + p.label.toUpperCase())] }
      ]
    };
  }

  // size: 54 pt como no deck; linhas longas ("HUMANO E ORGANIZACIONAL") pedem menos.
  function slideDivisor(id, linha1, linha2, size) {
    size = size || 54;
    return {
      id, nome: linha1 + ' ' + linha2, fundo: 'divisor',
      els: [
        { t: 'rect', x: 106, y: 198, w: 11, h: 123, fill: COR.azul, r: 5 },
        { t: 'text', x: 129, y: 192, w: 645, h: 68, size, bold: true, color: COR.azul, valign: 'middle', paras: [para(linha1)] },
        { t: 'text', x: 129, y: 260, w: 645, h: 77, size, bold: true, color: COR.branco, valign: 'middle', paras: [para(linha2)] }
      ]
    };
  }

  function topFontes(lista) {
    const comFonte = lista.filter(f => f.nome !== '(não informado)');
    const total = comFonte.reduce((s, f) => s + f.qtd, 0);
    const top = comFonte.slice(0, 5);
    return { labels: top.map(f => f.nome), values: top.map(f => (total ? f.qtd / total : 0)), total };
  }

  const corta = (t, n) => (String(t).length > n ? String(t).slice(0, n - 1).trim() + '…' : String(t));
  // Período anterior do mesmo tipo (setembro → agosto; jul–ago → mai–jun).
  function periodoAnterior(p) {
    if (p.tipo === 'anual') return periodo('anual', p.ano - 1, 1);
    return p.n > 1 ? periodo(p.tipo, p.ano, p.n - 1) : periodo(p.tipo, p.ano - 1, TIPOS[p.tipo].qtd);
  }
  // "Boticário VD - Rio de Janeiro" → "Bot. VD Rio de Janeiro" (eixos e listas).
  const uniCurta = u => String(u || 'Não informado').replace(/^Botic[aá]rio VD - /, 'Bot. VD ').replace(/^Botic[aá]rio - /, 'Bot. ');
  const somaMetas = (metas, p, campo) => { let s = 0, ok = false; for (let m = p.m1; m <= p.m2; m++) { const x = metas.find(y => y.ano === p.ano && y.mes === m); if (x && x[campo] != null) { s += x[campo]; ok = true; } } return ok ? s : null; };

  function slideVagasFinalizadas(vagas, p, M, metas) {
    const r = M.periodo(vagas, p.de, p.ate);
    const pa = mesmoPeriodoAnoAnterior(p), pAnt = periodoAnterior(p);
    const a = M.periodo(vagas, pa.de, pa.ate), ant = M.periodo(vagas, pAnt.de, pAnt.ate);
    const pOp = r.fechadas ? r.operacional.fechadas / r.fechadas : null;
    const texto = r.fechadas
      ? `Fechamos ${p.nome} com **${fmtInt(r.fechadas)} vagas**, sendo ${fmtPct(pOp)} operacionais e ${fmtPct(1 - pOp)} estratégicas, com **${fmtPct(r.noPrazo)} dentro do prazo** de SLA (${fmtPct(ant.noPrazo)} em ${pAnt.curto}) e média de **${fmtDias(r.diasMedio)}**.`
      : `Nenhuma vaga fechada ${emPeriodo(p)}.`;

    // Natureza (principal) × tipo das vagas fechadas no período.
    const nat = {};
    r.lista.forEach(v => { const k = naturezaPrincipal(v); nat[k] = nat[k] || { op: 0, es: 0 }; nat[k][v.tipo_vaga === 'Estratégica' ? 'es' : 'op']++; });
    const naturezas = Object.keys(nat).sort((x, y) => (nat[y].op + nat[y].es) - (nat[x].op + nat[x].es)).slice(0, 5);
    const fOp = topFontes(r.fontesOperacional), fEs = topFontes(r.fontesEstrategica);
    const meta = somaMetas(metas || [], p, 'meta_fechadas');
    const subFechadas = [meta ? `${fmtPct(r.fechadas / meta)} da meta (${fmtInt(meta)})` : null, `${fmtInt(a.fechadas)} em ${pa.curto}`].filter(Boolean).join(' · ');

    const els = [].concat(
      titulo(`VAGAS FINALIZADAS — ${p.label.toUpperCase()}`),
      resumo(texto),
      kpi(25, 120, 190, 100, `VAGAS FECHADAS (${p.curto})`, fmtInt(r.fechadas), subFechadas),
      kpi(230, 120, 190, 100, 'DENTRO DO PRAZO (SLA)', `${fmtPct(r.noPrazo)}`, `${fmtInt(r.dentro)} de ${fmtInt(r.fechadas)} · ${fmtPct(a.noPrazo)} em ${pa.curto}`, r.noPrazo != null && r.noPrazo < 0.7 ? COR.amarelo : COR.valor),
      [card(435, 120, 330, 100),
        { t: 'text', x: 447, y: 128, w: 306, h: 18, size: 10.5, bold: true, color: COR.claro, align: 'center', paras: [para('SLA MÉDIO DE FECHAMENTO')] },
        { t: 'rect', x: 447, y: 150, w: 147, h: 60, fill: '1C3D7A', transp: 30, line: '3A6BC4', r: 6 },
        { t: 'text', x: 455, y: 153, w: 135, h: 54, size: 10, color: COR.claro, paras: [
          para('**Operacionais**'),
          { runs: [{ text: r.operacional.diasMedio == null ? '—' : String(Math.round(r.operacional.diasMedio)), bold: true, size: 16, color: '2BB3FF' }, { text: ' dias', size: 9, color: '2BB3FF' }] },
          para(`${fmtInt(r.operacional.fechadas)} vagas · ${fmtPct(r.operacional.noPrazo)} no prazo`, { run: { size: 8.5, color: COR.suave } })
        ] },
        { t: 'rect', x: 606, y: 150, w: 147, h: 60, fill: '3A3A3A', transp: 50, line: '7A6A3A', r: 6 },
        { t: 'text', x: 614, y: 153, w: 135, h: 54, size: 10, color: COR.claro, paras: [
          para('**Estratégicas**'),
          { runs: [{ text: r.estrategica.diasMedio == null ? '—' : String(Math.round(r.estrategica.diasMedio)), bold: true, size: 16, color: COR.amarelo }, { text: ' dias', size: 9, color: COR.amarelo }] },
          para(`${fmtInt(r.estrategica.fechadas)} vagas · ${fmtPct(r.estrategica.noPrazo)} no prazo`, { run: { size: 8.5, color: COR.suave } })
        ] }],
      [card(780, 120, 155, 100),
        { t: 'text', x: 790, y: 128, w: 135, h: 90, size: 9, color: COR.claro, paras: [
          { runs: [{ text: r.timeToHire == null ? '—' : `${Math.round(r.timeToHire)}d`, bold: true, size: 15, color: COR.branco }, { text: '  Time to Hire', size: 9 }] },
          para('abertura → início', { run: { size: 7.5, color: COR.suave }, spaceAfter: 6 }),
          { runs: [{ text: r.timeToFill == null ? '—' : `${Math.round(r.timeToFill)}d`, bold: true, size: 15, color: COR.branco }, { text: '  Time to Fill', size: 9 }] },
          para('abertura → fechamento', { run: { size: 7.5, color: COR.suave } })
        ] }],
      [
        { t: 'chart', x: 25, y: 238, w: 300, h: 232, kind: 'col', title: 'NATUREZA DA VAGA', legend: true, labels: naturezas,
          series: [{ name: 'Operacional', values: naturezas.map(k => nat[k].op), color: COR.azul }, { name: 'Estratégica', values: naturezas.map(k => nat[k].es), color: COR.estr }] },
        { t: 'chart', x: 335, y: 238, w: 300, h: 232, kind: 'bar', pct: true, title: 'TOP 5 FONTES — OPERACIONAL', labels: fOp.labels, series: [{ name: 'Operacional', values: fOp.values, color: COR.azul }] },
        { t: 'chart', x: 645, y: 238, w: 300, h: 232, kind: 'bar', pct: true, title: 'TOP 5 FONTES — ESTRATÉGICA', labels: fEs.labels, series: [{ name: 'Estratégica', values: fEs.values, color: COR.azul }] }
      ]
    );
    const notas = [
      `Fonte: planilha 18 (Controle Geral de Vagas), aba CTRL GERAL. Vagas com DATA DE FECHAMENTO entre ${fmtData(p.de)} e ${fmtData(p.ate)}, qualquer que seja o status: ${fmtInt(r.fechadas)} vagas, das quais ${fmtInt(r.aguardandoAdmissao)} ainda em "Andamento" (fechadas, aguardando admissão/início).`,
      `Dentro do prazo = vagas sem a marcação "Expirou SLA" na coluna Status SLA (${fmtInt(r.dentro)} de ${fmtInt(r.fechadas)}). Operacionais ${fmtPct(r.operacional.noPrazo)} · Estratégicas ${fmtPct(r.estrategica.noPrazo)}.`,
      'SLA médio = média da coluna SLA. Time to Fill = dias da abertura ao fechamento. Time to Hire = dias da abertura à DATA DE INÍCIO (só vagas com início preenchido).',
      `Fontes: % entre as vagas com FONTE preenchida (Operacional ${fOp.total}, Estratégica ${fEs.total}); ${fmtInt(r.semFonte)} vaga(s) sem fonte. Canceladas com data no período: ${fmtInt(r.canceladas)}.`
    ].join('\n');
    return { id: 'rs-finalizadas', nome: 'Vagas Finalizadas', fundo: 'conteudo', els, notas };
  }

  // Vagas fechadas por unidade, com as maiores e menores durações de SLA.
  function slidePorUnidade(vagas, p, M) {
    const r = M.periodo(vagas, p.de, p.ate);
    const grupo = v => { const n = naturezaPrincipal(v); return n === 'Substituição' ? 'sub' : n === 'Aumento de Quadro' ? 'aq' : /^Extra/.test(n) ? 'extra' : 'outra'; };
    const porUni = {};
    r.lista.forEach(v => { const k = v.unidade || 'Não informado'; const o = porUni[k] = porUni[k] || { sub: 0, aq: 0, extra: 0, outra: 0, total: 0 }; o[grupo(v)]++; o.total++; });
    const uniSub = Object.entries(porUni).filter(([, o]) => o.sub).sort((a, b) => b[1].sub - a[1].sub);
    const uniAq = Object.entries(porUni).filter(([, o]) => o.aq || o.extra).sort((a, b) => (b[1].aq + b[1].extra) - (a[1].aq + a[1].extra));
    const totSub = uniSub.reduce((s, [, o]) => s + o.sub, 0), totExtra = Object.values(porUni).reduce((s, o) => s + o.extra, 0);
    const top2 = Object.entries(porUni).sort((a, b) => b[1].total - a[1].total).slice(0, 2);
    const conc = r.fechadas ? top2.reduce((s, [, o]) => s + o.total, 0) / r.fechadas : null;
    const texto = r.fechadas
      ? `${cap(emPeriodo(p))}, **${fmtInt(totSub)} das ${fmtInt(r.fechadas)} vagas** fechadas foram de substituição (${fmtPct(totSub / r.fechadas)})${totExtra ? ` e ${fmtInt(totExtra)} de Extra Natal/Mães` : ''}; ${top2.map(([u, o]) => `**${uniCurta(u)} (${o.total})**`).join(' e ')} concentraram ${fmtPct(conc)} dos fechamentos.`
      : `Nenhuma vaga fechada ${emPeriodo(p)}.`;
    const linhaSla = (x, lista, campo, cor) => lista.map((it, i) => ({ t: 'text', x: x + 14, y: 372 + i * 20, w: 420, h: 18, size: 9, color: COR.branco, valign: 'middle', paras: [{ runs: [
      { text: `${it.dias}d  `, bold: true, color: cor }, { text: corta(it.cargo, 30), bold: true }, { text: ` · ${corta(it.local, 26)}`, color: COR.claro }, { text: `   ${corta(it[campo] || '—', 26)}`, color: COR.suave, size: 8 }] }] }));
    const fontesTxt = r.slaPorFonte.filter(f => f.qtd >= 2).slice(0, 5).map(f => `${f.fonte} ${Math.round(f.dias)}d`).join(' · ');
    const els = [].concat(
      titulo(`VAGAS FINALIZADAS POR UNIDADE — ${p.label.toUpperCase()}`),
      resumo(texto),
      { t: 'chart', x: 25, y: 115, w: 445, h: 225, kind: 'bar', catSize: 8.5, labelSize: 8.5, title: 'SUBSTITUIÇÃO (INCLUI COTA)', labels: uniSub.map(([u]) => uniCurta(u)), series: [{ name: 'Substituição', values: uniSub.map(([, o]) => o.sub), color: '8FA8DC' }] },
      { t: 'chart', x: 490, y: 115, w: 445, h: 225, kind: 'bar', stacked: true, legend: true, catSize: 8.5, labelSize: 8.5, title: 'AUMENTO DE QUADRO E EXTRA NATAL', labels: uniAq.map(([u]) => uniCurta(u)),
        series: [{ name: 'Aumento de Quadro', values: uniAq.map(([, o]) => o.aq || null), color: '8FA8DC' }, { name: 'Extra Natal/Mães', values: uniAq.map(([, o]) => o.extra || null), color: '3A63B8' }] },
      card(25, 345, 445, 145), card(490, 345, 445, 145),
      { t: 'text', x: 39, y: 351, w: 420, h: 18, size: 10.5, bold: true, color: COR.amarelo, paras: [para('▲ MAIORES SLAs — MOTIVO')] },
      linhaSla(25, r.maioresSla, 'motivo', COR.amarelo),
      { t: 'text', x: 504, y: 351, w: 420, h: 18, size: 10.5, bold: true, color: '3CCB8B', paras: [para('▼ MENORES SLAs — FONTE DE CAPTAÇÃO')] },
      linhaSla(490, r.menoresSla, 'fonte', '3CCB8B'),
      fontesTxt ? { t: 'text', x: 504, y: 472, w: 420, h: 14, size: 8, color: COR.suave, paras: [para(`**SLA médio por fonte:** ${fontesTxt}`)] } : []
    );
    const notas = `Vagas com DATA DE FECHAMENTO ${emPeriodo(p)} (${fmtInt(r.fechadas)}, incluindo ${fmtInt(r.aguardandoAdmissao)} ainda em Andamento aguardando admissão). Substituição inclui "Substituição – Cota"; Extra inclui Extra Natal e Extra Mães. SLA = coluna SLA da planilha; motivo = coluna Motivo SLA. SLA médio por fonte só para fontes com 2 ou mais vagas.`;
    return { id: 'rs-unidades', nome: 'Vagas Finalizadas por Unidade', fundo: 'conteudo', els, notas };
  }

  function slideComparativo(vagas, p) {
    const pa = mesmoPeriodoAnoAnterior(p);
    const abertasEm = q => vagas.filter(v => v.data_abertura >= q.de && v.data_abertura <= q.ate);
    const atual = abertasEm(p), ant = abertasEm(pa);
    const conta = (lista, nat, tipo) => lista.filter(v => naturezaPrincipal(v) === nat && (tipo == null || (v.tipo_vaga === 'Estratégica') === (tipo === 'Estratégica'))).length;
    // Das abertas no período, quantas têm DATA DE FECHAMENTO até o último dia dele (qualquer status).
    const fechadasNoPeriodo = (lista, q) => (lista.length ? lista.filter(v => v.data_fechamento && v.data_fechamento <= q.ate).length / lista.length : null);
    const yy = String(p.ano).slice(2), yyA = String(pa.ano).slice(2);

    // Maior variação entre natureza × tipo, para o texto.
    const linhas = [];
    const nats = Array.from(new Set(atual.concat(ant).map(naturezaPrincipal)));
    nats.forEach(n => ['Operacional', 'Estratégica'].forEach(t => linhas.push({ n, t, a: conta(ant, n, t), b: conta(atual, n, t) })));
    linhas.sort((x, y) => Math.abs(y.b - y.a) - Math.abs(x.b - x.a));
    const maior = linhas[0];
    const v = varPct(atual.length, ant.length);
    let texto = ant.length
      ? `No comparativo do mesmo período, o total de vagas abertas ${v < 0 ? 'caiu' : v > 0 ? 'subiu' : 'ficou estável'}${v ? ' ' + fmtPct(Math.abs(v)) : ''}, de **${fmtInt(ant.length)}** para **${fmtInt(atual.length)}**.`
      : `Sem vagas abertas em ${pa.curto} para comparar.`;
    if (maior && maior.a !== maior.b) {
      const vm = varPct(maior.b, maior.a);
      texto += ` A maior variação foi em **${maior.n} ${maior.t}**, de ${fmtInt(maior.a)} para ${fmtInt(maior.b)}${vm != null ? ` (${vm > 0 ? '+' : '−'}${fmtPct(Math.abs(vm))})` : ''}.`;
    }

    const serie = (rotulos, fn) => [{ name: String(pa.ano), values: rotulos.map(r => fn(ant, r)), color: COR.estr }, { name: String(p.ano), values: rotulos.map(r => fn(atual, r)), color: COR.azul }];
    const aq = ['Operacional', 'Estratégica'];
    const sx = [['Substituição', 'Operacional', 'Subst. Operacional'], ['Substituição', 'Estratégica', 'Subst. Estratégica'], ['Extra Natal', null, 'Extra Natal']];
    const caixa = (y, rotulo, total, pct, cor) => [
      card(650, y, 285, 135),
      { t: 'text', x: 665, y: y + 12, w: 255, h: 20, size: 12, bold: true, color: COR.claro, paras: [para(rotulo)] },
      { t: 'text', x: 665, y: y + 36, w: 255, h: 52, size: 40, bold: true, color: cor, valign: 'middle', paras: [para(fmtInt(total))] },
      { t: 'text', x: 665, y: y + 96, w: 255, h: 22, size: 11, color: COR.claro, paras: [para(`**${fmtPct(pct)}** fechadas no período`)] }
    ];
    const els = [].concat(
      titulo(`COMPARATIVO DE VAGAS ABERTAS — ${pa.curto.toUpperCase()} × ${p.curto.toUpperCase()}`),
      { t: 'text', x: 40, y: 76, w: 830, h: 54, size: 11, color: COR.branco, paras: [para(texto)] },
      { t: 'chart', x: 25, y: 150, w: 300, h: 300, kind: 'col', title: 'AUMENTO DE QUADRO', legend: true, labels: aq, series: serie(aq, (l, t) => conta(l, 'Aumento de Quadro', t)) },
      { t: 'chart', x: 335, y: 150, w: 300, h: 300, kind: 'col', title: 'SUBSTITUIÇÃO E EXTRA NATAL', legend: true, catSize: 8.5, labels: sx.map(x => x[2]), series: serie(sx, (l, x) => conta(l, x[0], x[1])) },
      caixa(150, `Abertas/${yyA}`, ant.length, fechadasNoPeriodo(ant, pa), COR.estr),
      caixa(300, `Abertas/${yy}`, atual.length, fechadasNoPeriodo(atual, p), COR.valor)
    );
    const outras = nats.filter(n => !['Aumento de Quadro', 'Substituição', 'Extra Natal'].includes(n)).map(n => `${n}: ${conta(ant, n)} → ${conta(atual, n)}`);
    const notas = [
      `Vagas pela DATA DE ABERTURA: ${fmtData(pa.de)} a ${fmtData(pa.ate)} contra ${fmtData(p.de)} a ${fmtData(p.ate)}. Inclui canceladas e congeladas. Substituição inclui "Substituição – Cota".`,
      '"Fechadas no período" = das vagas abertas no período, quantas têm DATA DE FECHAMENTO até o último dia dele (qualquer status).',
      outras.length ? 'Outras naturezas (ano anterior → atual): ' + outras.join('; ') + '.' : ''
    ].filter(Boolean).join('\n');
    return { id: 'rs-comparativo', nome: 'Comparativo de Vagas Abertas', fundo: 'conteudo', els, notas };
  }

  function slideAtivas(vagas, M, atualizadoEm, p) {
    const at = M.ativas(vagas, p.ate);
    const coluna = (x, rotulo, g, extra) => {
      const op = (g.porTipo.find(t => t.nome === 'Operacional') || { qtd: 0 }).qtd;
      const es = (g.porTipo.find(t => t.nome === 'Estratégica') || { qtd: 0 }).qtd;
      const paras = [
        para(`${rotulo} — ${fmtInt(g.total)} vagas`, { run: { size: 16, bold: true, color: COR.azul }, spaceAfter: 4 }),
        para(`Atualmente estamos com **${fmtInt(g.total)} vagas ${rotulo === 'EM ANDAMENTO' ? 'em andamento' : 'em aberto'}**, sendo ${fmtInt(op)} Operacionais (${fmtPct(g.total ? op / g.total : null)}) e ${fmtInt(es)} Estratégicas (${fmtPct(g.total ? es / g.total : null)}).`, { spaceAfter: 6 })
      ];
      g.porNatureza.forEach(n => paras.push(para(`**${n.nome}:** ${fmtInt(n.qtd)} ${n.qtd === 1 ? 'vaga' : 'vagas'}`, { bullet: true })));
      if (extra) paras.push(para(extra, { spaceBefore: 6, run: { size: 10.5 } }));
      paras.push(para(g.porUnidade.map(u => `${u.nome} (${u.qtd})`).join(', ') + '.', { run: { italic: true, color: COR.suave, size: 9.5 }, spaceBefore: 6 }));
      return [card(x, 100, 435, 390), { t: 'text', x: x + 18, y: 114, w: 400, h: 365, size: 11.5, color: COR.branco, paras }];
    };
    const etapas = at.andamento.porEtapa.map(e => `${e.nome} (${e.qtd})`).join(', ');
    const triagem = at.aberta.lista.filter(v => /triagem/i.test(v.etapa_vaga || '')).length;
    const els = [].concat(
      titulo(`VAGAS EM ANDAMENTO E EM ABERTO — ${fmtData(p.ate)}`),
      coluna(25, 'EM ANDAMENTO', at.andamento, etapas ? `**Etapas:** ${etapas}.` : null),
      coluna(475, 'EM ABERTO', at.aberta, at.aberta.total ? `**Atenção:** ${fmtInt(triagem)} ainda em triagem e ${fmtInt(at.aberta.expiradas)} com SLA expirado.` : null),
      { t: 'text', x: 40, y: 494, w: 600, h: 14, size: 8.5, italic: true, color: COR.suave, paras: [para(`Atualização – base de ${fmtData(atualizadoEm)} · vagas abertas até ${fmtData(p.ate)} · não inclui as ${fmtInt(at.aguardandoAdmissao.total)} vagas já fechadas que aguardam admissão (estão nas finalizadas).`, { run: { italic: true } })] }
    );
    const notas = `Posição na virada do período: vagas abertas até ${fmtData(p.ate)}, com o status da planilha 18 no último upload (${fmtData(atualizadoEm)}). Em andamento = status Andamento sem data de fechamento até ${fmtData(p.ate)}; em aberto = status Aberta. As ${fmtInt(at.aguardandoAdmissao.total)} em Andamento com data de fechamento no período já contam nas finalizadas. Vagas ativas na virada: ${fmtInt(at.andamento.total + at.aberta.total)}. Congeladas: ${fmtInt(at.congelada.total)}.`;
    return { id: 'rs-ativas', nome: 'Vagas em Andamento e em Aberto', fundo: 'conteudo', els, notas };
  }

  function slideProjecao(vagas, p, metas, M) {
    const ano = p.ano;
    const mensal = M.mensal(vagas, ano);
    const meta = mes => metas.find(m => m.ano === ano && m.mes === mes) || {};
    const temMeta = metas.some(m => m.ano === ano);
    const ate = p.m2;  // realizado só até o fim do período escolhido
    const real = campo => mensal.map(m => (m.mes <= ate ? m[campo] : null));
    const labels = MES3.slice();
    const grafico = (x, rotulo, campoMeta, campoReal) => ({
      t: 'chart', x, y: 125, w: 335, h: 340, kind: 'combo', legend: true, title: rotulo.toUpperCase(), labels,
      series: [{ name: rotulo + ' Projetado', values: mensal.map(m => (meta(m.mes)[campoMeta] == null ? 0 : meta(m.mes)[campoMeta])), color: COR.azul },
        { name: 'Realizado', values: real(campoReal), color: COR.laranja, line: true }]
    });

    const somaPer = campo => mensal.filter(m => m.mes >= p.m1 && m.mes <= p.m2).reduce((s, m) => s + m[campo], 0);
    const somaMeta = campo => { let s = 0, ok = false; for (let m = p.m1; m <= p.m2; m++) { const v = meta(m)[campo]; if (v != null) { s += v; ok = true; } } return ok ? s : null; };
    const ab = somaPer('abertas'), fe = somaPer('fechadas'), mAb = somaMeta('meta_abertas'), mFe = somaMeta('meta_fechadas');
    const acumAb = mensal.filter(m => m.mes <= ate).reduce((s, m) => s + m.abertas, 0);
    const acumFe = mensal.filter(m => m.mes <= ate).reduce((s, m) => s + m.fechadas, 0);
    const texto = temMeta
      ? `${cap(emPeriodo(p))}: abriram-se **${fmtInt(ab)} vagas** (${fmtPct(mAb ? ab / mAb : null)} da meta de ${fmtInt(mAb)}) e fecharam-se **${fmtInt(fe)}** (${fmtPct(mFe ? fe / mFe : null)} da meta de ${fmtInt(mFe)}).`
      : `Sem metas cadastradas para ${ano}. ${cap(emPeriodo(p))}: ${fmtInt(ab)} vagas abertas e ${fmtInt(fe)} fechadas.`;

    const insights = [para(`INSIGHTS — ${p.curto.toUpperCase()}`, { run: { bold: true, size: 11, color: COR.claro }, spaceAfter: 6 })];
    if (p.meses <= 2) {
      // Mês a mês (mensal e bimestral).
      for (let m = p.m1; m <= p.m2; m++) {
        const mm = mensal[m - 1], mt = meta(m);
        insights.push(para(`**${MESES[m - 1]}:** ${fmtInt(mm.abertas)} abertas${mt.meta_abertas != null ? ` (${fmtPct(mm.abertas / mt.meta_abertas)} da meta)` : ''} e ${fmtInt(mm.fechadas)} fechadas${mt.meta_fechadas != null ? ` (${fmtPct(mm.fechadas / mt.meta_fechadas)} da meta)` : ''}.`, { bullet: true, spaceAfter: 4 }));
      }
    } else {
      // Semestral/anual: melhor e pior mês de fechamento contra a meta.
      const comMeta = mensal.filter(m => m.mes >= p.m1 && m.mes <= Math.min(p.m2, ate) && meta(m.mes).meta_fechadas)
        .map(m => ({ m, r: m.fechadas / meta(m.mes).meta_fechadas })).sort((a, b) => b.r - a.r);
      if (comMeta.length) {
        const melhor = comMeta[0], pior = comMeta[comMeta.length - 1];
        insights.push(para(`**Melhor mês de fechamento:** ${MESES[melhor.m.mes - 1].toLowerCase()}, ${fmtInt(melhor.m.fechadas)} vagas (${fmtPct(melhor.r)} da meta).`, { bullet: true, spaceAfter: 4 }));
        insights.push(para(`**Mês mais abaixo da meta:** ${MESES[pior.m.mes - 1].toLowerCase()}, ${fmtInt(pior.m.fechadas)} vagas (${fmtPct(pior.r)} da meta).`, { bullet: true, spaceAfter: 4 }));
      }
    }
    insights.push(para(`**No ano até ${MES3[ate - 1].toLowerCase()}:** ${fmtInt(acumAb)} abertas e ${fmtInt(acumFe)} fechadas (saldo de ${acumAb - acumFe >= 0 ? '+' : '−'}${fmtInt(Math.abs(acumAb - acumFe))} vagas).`, { bullet: true }));

    const els = [].concat(
      titulo(`PROJEÇÃO DE VAGAS — ${ano}`),
      resumo(texto),
      grafico(25, 'Abertas', 'meta_abertas', 'abertas'),
      grafico(370, 'Fechadas', 'meta_fechadas', 'fechadas'),
      [card(718, 140, 222, 40 + 34 * (insights.length - 1)), { t: 'text', x: 732, y: 152, w: 196, h: 16 + 34 * (insights.length - 1), size: 10, color: COR.branco, paras: insights }]
    );
    const notas = 'Meta mensal: tabela metas_vagas (a de 2026 veio do slide "Projeção de Vagas" do Fechamento de Setembro). Realizado: abertas pela DATA DE ABERTURA e fechadas (status Finalizada) pela DATA DE FECHAMENTO, da planilha 18.';
    return { id: 'rs-projecao', nome: 'Projeção de Vagas', fundo: 'conteudo', els, notas };
  }

  // Texto de abertura de cada slide (a linha logo abaixo do título, em 40 × 76):
  // é o que o RH pode reescrever na tela; o texto salvo substitui o automático.
  const ehAbertura = e => e.t === 'text' && e.x === 40 && e.y === 76;
  function textoAbertura(sd) {
    const e = sd.els.find(ehAbertura);
    return e ? e.paras.map(p => p.runs.map(r => (r.bold ? `**${r.text}**` : r.text)).join('')).join('\n') : null;
  }
  function aplicarTexto(sd, texto) {
    const e = sd.els.find(ehAbertura);
    if (!e || texto == null || !String(texto).trim()) return sd;
    e.paras = String(texto).split(/\r?\n/).filter(l => l.trim()).map(l => para(l));
    e.editado = true;
    return sd;
  }

  // Deck do período, na ordem do Fechamento do RH:
  //   capa, resumo executivo, demografia, R&S, DHO (+ cultura e engajamento),
  //   T&D, slides escritos pelo RH (nos seus lugares) e contracapa.
  // dados = { vagas, metas, atualizadoEm } (R&S) e, opcionais:
  //   dho   → fechamento-slides-dho.js      cult → fechamento-slides-cultura.js
  //   manuais { id: { titulo, subtitulo, cards } } e textos { idSlide: texto }.
  // Sem dho/cult o deck sai só com R&S (é o que os testes usam).
  function montar(p, dados) {
    const M = window.HUB_METRICS_FECHAMENTO;
    const vagas = dados.vagas || [];
    const D = dados.dho && window.HUB_FECHAMENTO_DHO;
    const C = dados.cult && window.HUB_FECHAMENTO_CULTURA;
    const MAN = window.HUB_FECHAMENTO_MANUAIS;
    const completo = !!(D || C);
    let deck = [].concat(
      slideCapa(p),
      D ? D.demografia(p, dados.dho) : [],
      slideDivisor('rs-divisor', 'RECRUTAMENTO E', 'SELEÇÃO'),
      slideVagasFinalizadas(vagas, p, M, dados.metas || []),
      slidePorUnidade(vagas, p, M),
      slideComparativo(vagas, p),
      slideAtivas(vagas, M, dados.atualizadoEm, p),
      slideProjecao(vagas, p, dados.metas || [], M),
      D || C ? slideDivisor('dho-divisor', 'DESENVOLVIMENTO', 'HUMANO E ORGANIZACIONAL', 40) : [],
      D ? D.slides(p, dados.dho) : [],
      C ? C.cultura(p, dados.cult) : [],
      C ? [slideDivisor('td-divisor', 'TREINAMENTO E', 'DESENVOLVIMENTO')].concat(C.td(p, dados.cult)) : []
    );
    // Slides escritos pelo RH: entram depois do slide indicado, se tiverem conteúdo.
    if (MAN && completo) {
      for (const def of MAN.MANUAIS) {
        const m = (dados.manuais || {})[def.id];
        if (!MAN.temConteudo(m)) continue;
        // Se o slide de referência não está no deck (ex.: outro slide do RH vazio),
        // volta pela sequência até achar um que esteja.
        const noDeck = id => deck.some(s => s.id === id);
        const ancora = id => {
          if (!id) return null;
          if (noDeck(id)) return id;
          const d = MAN.MANUAIS.find(x => x.id === id);
          if (!d) return null;
          return ancora(d.depois) || (d.alt && noDeck(d.alt) ? d.alt : null);
        };
        const ref = ancora(def.depois) || (def.alt && noDeck(def.alt) ? def.alt : null);
        const i = deck.findIndex(s => s.id === ref);
        const sd = MAN.slideManual(def, m);
        if (i >= 0) deck.splice(i + 1, 0, sd); else deck.push(sd);
      }
    }
    // Textos de abertura reescritos pelo RH.
    const textos = dados.textos || {};
    deck = deck.map(sd => { sd.textoAuto = textoAbertura(sd); return textos[sd.id] ? aplicarTexto(sd, textos[sd.id]) : sd; });
    if (MAN && completo) {
      deck.splice(1, 0, MAN.resumo(p, dados, deck));
      deck.push(MAN.contracapa(p));
    }
    return deck;
  }

  // Peças compartilhadas com fechamento-slides-dho.js.
  const pecas = { COR, MESES, MES3, para, runs, titulo, resumo, card, kpi, fmtInt, fmtPct, fmtDias, fmtData, pp, varPct, emPeriodo, cap };

  window.HUB_FECHAMENTO_SLIDES = { COR, MESES, TIPOS, periodo, mesmoPeriodoAnoAnterior, montar, textoAbertura, pecas, _internal: { runs, naturezaPrincipal, fmtPct } };
})();
