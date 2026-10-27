// Utilitários genéricos: datas, texto, filtros, paleta de cores. Nada aqui
// conhece o formato de nenhuma planilha específica nem de nenhuma tela —
// isso fica em parsers.js (leitura) e em metrics-*.js (indicadores por menu).
(function () {
  // Paleta categórica validada (ordem fixa, não ciclar hue-a-hue) — slot 1
  // ajustado para o azul da marca Sfera; slots 2-8 mantidos do conjunto
  // validado (ver skill de dataviz: passa lightness band, chroma floor,
  // separação CVD e piso de visão normal em modo claro).
  const CHART_COLORS = [
    '#1C7CEC', '#eb6834', '#1baf7a', '#eda100',
    '#e87ba4', '#008300', '#4a3aa7', '#e34948'
  ];

  const STATUS_COLORS = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' };

  function color(i) { return CHART_COLORS[i % CHART_COLORS.length]; }

  function todayISO() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  function fmtDateBR(iso) {
    if (!iso) return '';
    const [y, m, d] = String(iso).slice(0, 10).split('-');
    if (!y || !m || !d) return '';
    return `${d}/${m}/${y}`;
  }

  // Soma dias a uma data ISO (YYYY-MM-DD), devolvendo outra data ISO — usa
  // meio-dia UTC pra não escorregar de dia por causa de fuso horário.
  function addDays(iso, days) {
    if (!iso) return null;
    const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
    if (isNaN(d)) return null;
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function fmtInt(n) {
    if (n === null || n === undefined || isNaN(n)) return '0';
    return Number(n).toLocaleString('pt-BR');
  }

  function fmtPct(n, digits) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return (n * 100).toFixed(digits == null ? 1 : digits).replace('.', ',') + '%';
  }

  function fmt1(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  }

  function inRange(iso, start, end) {
    if (!iso) return false;
    if (start && iso < start) return false;
    if (end && iso > end) return false;
    return true;
  }

  function monthKey(iso) {
    if (!iso) return null;
    return String(iso).slice(0, 7); // yyyy-mm
  }

  function monthLabel(key) {
    if (!key) return '';
    const [y, m] = key.split('-');
    const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    return meses[parseInt(m, 10) - 1] + '/' + y.slice(2);
  }

  function monthsBetween(start, end) {
    const out = [];
    if (!start || !end) return out;
    let [y, m] = start.split('-').map(Number);
    const [ey, em] = end.split('-').map(Number);
    while (y < ey || (y === ey && m <= em)) {
      out.push(`${y}-${String(m).padStart(2, '0')}`);
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return out;
  }

  function ageYears(birthIso, atIso) {
    if (!birthIso) return null;
    const b = new Date(birthIso + 'T00:00:00Z');
    const a = new Date((atIso || todayISO()) + 'T00:00:00Z');
    let age = a.getUTCFullYear() - b.getUTCFullYear();
    const m = a.getUTCMonth() - b.getUTCMonth();
    if (m < 0 || (m === 0 && a.getUTCDate() < b.getUTCDate())) age--;
    return age;
  }

  function tenureMonths(startIso, endIso) {
    if (!startIso) return null;
    const s = new Date(startIso + 'T00:00:00Z');
    const e = new Date((endIso || todayISO()) + 'T00:00:00Z');
    return (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth());
  }

  function tenureLabel(months) {
    if (months === null || months === undefined) return '—';
    const y = Math.floor(months / 12);
    const m = months % 12;
    if (y <= 0) return `${m}m`;
    return `${y}a ${m}m`;
  }

  function uniqueSorted(arr) {
    return Array.from(new Set(arr.filter(v => v !== null && v !== undefined && v !== ''))).sort((a, b) =>
      String(a).localeCompare(String(b), 'pt-BR')
    );
  }

  function normalizeText(s) {
    return String(s || '')
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/\s+/g, ' ').trim()
      .toLowerCase();
  }

  // Comparação de valores vindos de planilhas/telas diferentes: mesmo texto
  // pode ter espaços/maiúsculas/acentos inconsistentes entre uma origem e
  // outra (ex.: "Hering " com espaço sobrando numa e "Hering" na outra).
  function normEq(a, b) {
    if (a === null || a === undefined || b === null || b === undefined) return false;
    if (a === '' || b === '') return false;
    return normalizeText(a) === normalizeText(b);
  }

  // Usado pelos filtros de texto livre (unidade/departamento/gestor/
  // colaborador): "contém", não igualdade exata — assim funciona mesmo se a
  // pessoa não clicar exatamente na sugestão da lista, só digitar um trecho.
  function normIncludes(rowValue, filterValue) {
    if (rowValue === null || rowValue === undefined || !filterValue) return false;
    return normalizeText(rowValue).includes(normalizeText(filterValue));
  }

  // Filtro de seleção múltipla (Unidade/Departamento): lista vazia = sem
  // filtro, passa tudo. Com itens selecionados, casa por igualdade exata
  // (não "contém") — a lista vem de valores reais já existentes nos dados,
  // então igualdade é o comportamento certo aqui, diferente do campo de
  // busca por texto livre (normIncludes).
  function matchesAny(rowValue, selected) {
    if (!selected || !selected.length) return true;
    if (rowValue === null || rowValue === undefined) return false;
    const nv = normalizeText(rowValue);
    return selected.some(s => normalizeText(s) === nv);
  }

  // Deduplica valores que só diferem por espaço/caixa/acento, mantendo a
  // primeira grafia encontrada como rótulo de exibição.
  function uniqueSortedNormalized(arr) {
    const seen = new Map();
    for (const v of arr) {
      if (v === null || v === undefined) continue;
      const s = String(v).replace(/\s+/g, ' ').trim();
      if (!s) continue;
      const key = normalizeText(s);
      if (!seen.has(key)) seen.set(key, s);
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ------------------------------------------------------------------
  // Mineração de texto livre (menções a pessoas)
  // ------------------------------------------------------------------
  // Extrai pessoas citadas em textos livres cruzando com a base de nomes
  // completos de colaboradores (comparação sem acento/caixa).
  function extractMentions(texts, knownFullNames) {
    const names = knownFullNames.filter(n => n && n.trim().split(/\s+/).length >= 2);
    const normNames = names.map(n => ({ original: n, norm: normalizeText(n) }));
    const counts = new Map();
    for (const t of texts) {
      if (!t) continue;
      const nt = normalizeText(t);
      for (const { original, norm } of normNames) {
        if (nt.includes(norm)) counts.set(original, (counts.get(original) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([nome, count]) => ({ nome, count }));
  }

  // Gera um id legível com prefixo + ano + sequência (ex.: VAG-2026-001),
  // usado pelas tabelas operacionais do Recrutamento (vagas/candidatos) que
  // preferem um código de negócio em vez de um uuid puro.
  function nextCode(prefix, existingCodes) {
    const year = new Date().getFullYear();
    const re = new RegExp('^' + prefix + '-' + year + '-(\\d+)$');
    let max = 0;
    for (const c of existingCodes || []) {
      const m = re.exec(c || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `${prefix}-${year}-${String(max + 1).padStart(3, '0')}`;
  }

  // nextCode() calcula o próximo id a partir de uma lista carregada no
  // cliente — se duas pessoas (ou duas abas) salvarem quase ao mesmo tempo,
  // as duas podem calcular o MESMO "próximo" id antes que a primeira grave,
  // e a segunda gravação falha com "duplicate key" (constraint de chave
  // primária). insertWithRetryId tenta gravar com o id calculado e, se vier
  // esse erro específico, soma o id que já falhou à lista de existentes e
  // tenta de novo — sem precisar buscar dados novos do banco a cada vez.
  async function insertWithRetryId(prefix, existingCodes, buildAndInsert, maxAttempts) {
    maxAttempts = maxAttempts || 5;
    const ids = (existingCodes || []).slice();
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const id = nextCode(prefix, ids);
      try {
        return await buildAndInsert(id);
      } catch (err) {
        const isDupKey = err && (err.code === '23505' || /duplicate key/i.test(err.message || ''));
        if (!isDupKey || attempt === maxAttempts - 1) throw err;
        ids.push(id);
      }
    }
  }

  // Espelha uma barra de rolagem horizontal ACIMA de uma tabela larga
  // (dentro de .table-wrap), sincronizada com a rolagem nativa de baixo —
  // usado nas listas de Vagas/Candidatos para não obrigar o usuário a
  // descer até o fim da lista só para achar a barra de rolagem lateral.
  // Idempotente: pode ser chamado a cada render() sem duplicar listeners.
  function wireTableTopScroll(rootEl) {
    const wrap = rootEl.querySelector('.table-wrap');
    if (!wrap) return;
    const table = wrap.querySelector('table');
    if (!table) return;
    let top = rootEl.querySelector(':scope > .table-scroll-top') || wrap.previousElementSibling;
    if (!top || !top.classList || !top.classList.contains('table-scroll-top')) {
      top = document.createElement('div');
      top.className = 'table-scroll-top';
      top.innerHTML = '<div></div>';
      wrap.parentNode.insertBefore(top, wrap);
    }
    const inner = top.firstElementChild;
    inner.style.width = table.scrollWidth + 'px';
    top.style.display = table.scrollWidth > wrap.clientWidth + 2 ? '' : 'none';
    let syncing = false;
    top.onscroll = () => { if (syncing) return; syncing = true; wrap.scrollLeft = top.scrollLeft; syncing = false; };
    wrap.onscroll = () => { if (syncing) return; syncing = true; top.scrollLeft = wrap.scrollLeft; syncing = false; };
  }

  // Escala de cores do % FIT (Cultural/vaga), usada em vagas.js e
  // candidatos.js — faixas definidas pelo usuário: quanto mais próximo de
  // 100%, mais escuro o verde; abaixo de 65% já é vermelho/laranja.
  function fitColor(pct) {
    const v = Math.max(0, Math.min(100, pct || 0));
    if (v >= 95) return '#1B5E20';
    if (v >= 80) return '#4CAF50';
    if (v >= 70) return '#8BC34A';
    if (v >= 65) return '#FF9800';
    if (v >= 60) return '#EF6C60';
    return '#E53935';
  }

  window.HUB_UTILS = {
    color, CHART_COLORS, STATUS_COLORS, todayISO, fmtDateBR, addDays, fmtInt, fmtPct, fmt1,
    inRange, monthKey, monthLabel, monthsBetween, ageYears, tenureMonths, tenureLabel,
    uniqueSorted, uniqueSortedNormalized, normalizeText, normEq, normIncludes, matchesAny, escapeHtml,
    extractMentions, nextCode, insertWithRetryId, wireTableTopScroll, fitColor
  };
})();
