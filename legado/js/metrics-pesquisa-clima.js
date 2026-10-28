// Cálculo dos indicadores de "Indicadores → Pesquisa de Clima" a partir de
// window.HUB_DATA.pesquisa_clima (aba "Resposta por Dimensão" da pesquisa,
// upload em Administração — ver js/parsers.js). Uma linha = uma resposta a
// uma pergunta; não há id de respondente (a pesquisa é anônima), então o
// número de respondentes é contado pela pergunta "nps empresa", que todo
// respondente recebe exatamente uma vez.
//
// Regras:
//  - GPTW e NR-1 (escala 1-5): favorável = 4-5, neutro = 3, desfavorável = 1-2.
//    Perguntas negativas (ex.: "Tenho prazos impossíveis de cumprir") são
//    invertidas — ver PERGUNTAS_INVERTIDAS.
//  - NPS (escala 0-10): promotores 9-10, neutros 7-8, detratores 0-6 — mesmo
//    padrão do eNPS de Entrevista de Desligamento / Experiência do Candidato.
//  - Anonimato: recortes com menos de MIN_RESPONDENTES respondentes não exibem
//    resultado (hoje MIN_RESPONDENTES = 1, ou seja, sem bloqueio).
(function () {
  const U = HUB_UTILS;

  // Mínimo de respondentes para exibir um recorte. Estava em 5 (proteção de
  // anonimato); a decisão atual é exibir qualquer recorte, então vale 1. Para
  // voltar a proteger grupos pequenos, basta subir este número.
  const MIN_RESPONDENTES = 1;
  const DIM_REFERENCIA = 'nps empresa';

  const DIMENSOES = [
    { key: 'gptw camaradagem', label: 'Camaradagem', grupo: 'gptw' },
    { key: 'gptw credibilidade', label: 'Credibilidade', grupo: 'gptw' },
    { key: 'gptw imparcialidade', label: 'Imparcialidade', grupo: 'gptw' },
    { key: 'gptw orgulho', label: 'Orgulho', grupo: 'gptw' },
    { key: 'gptw respeito', label: 'Respeito', grupo: 'gptw' },
    { key: 'nr-1 demandas', label: 'NR-1 · Demandas', grupo: 'nr1' },
    { key: 'nr-1 relacionamento', label: 'NR-1 · Relacionamento', grupo: 'nr1' },
    { key: 'nps empresa', label: 'Empresa', grupo: 'nps' },
    { key: 'nps gestor', label: 'Gestor', grupo: 'nps' },
    { key: 'nps remuneração', label: 'Remuneração', grupo: 'nps' },
    { key: 'nps plano de carreir', label: 'Carreira', grupo: 'nps' },
    { key: 'nps benefícios', label: 'Benefícios', grupo: 'nps' }
  ];
  const DIM_BY_KEY = new Map(DIMENSOES.map(d => [d.key, d]));
  const GRUPO_LABEL = { gptw: 'Dimensões GPTW', nr1: 'NR-1 (riscos psicossociais)', nps: 'NPS (0 a 10)' };

  // Afirmações negativas: quanto MAIOR a concordância, PIOR o resultado.
  // Comparado sempre via normalizeText (minúsculas, sem acento), por isso o
  // texto aqui também passa por ele.
  const PERGUNTAS_INVERTIDAS = new Set(['Tenho prazos impossíveis de cumprir.'].map(U.normalizeText));

  function rows() { return (window.HUB_DATA && window.HUB_DATA.pesquisa_clima) || []; }

  function dimLabel(key) { const d = DIM_BY_KEY.get(key); return d ? d.label : key; }
  function dimGrupo(key) { const d = DIM_BY_KEY.get(key); return d ? d.grupo : 'gptw'; }
  function isLikert(r) { const g = dimGrupo(r.dimensao); return g === 'gptw' || g === 'nr1'; }
  function isInvertida(r) { return PERGUNTAS_INVERTIDAS.has(U.normalizeText(r.pergunta)); }

  // Nota "efetiva" numa escala em que 5 é sempre o melhor resultado.
  function notaEfetiva(r) {
    if (r.nota === null || r.nota === undefined) return null;
    return isInvertida(r) ? 6 - r.nota : r.nota;
  }

  // Defesa em profundidade: a RLS do Supabase (can_see) já entrega só as linhas
  // que o usuário pode ver; aqui repetimos a mesma regra no navegador para que
  // nenhum recorte extrapole a unidade/departamento liberados no perfil.
  function dentroDoEscopo(r) {
    const u = window.HUB_USER;
    if (!u || u.perfil === 'admin') return true;
    if (u.perfil !== 'gestor' && u.perfil !== 'rh') return false;
    const un = (u.unidades || []).map(U.normalizeText), dp = (u.departamentos || []).map(U.normalizeText);
    if (un.length && r.unidade && !un.includes(U.normalizeText(r.unidade))) return false;
    if (dp.length && !(r.departamento && dp.includes(U.normalizeText(r.departamento)))) return false;
    return true;
  }

  function filterRows(f) {
    return rows().filter(r => {
      if (!dentroDoEscopo(r)) return false;
      if ((f.start || f.end) && !U.inRange(r.data_resposta, f.start, f.end)) return false;
      if (!U.matchesAny(r.unidade, f.unidade)) return false;
      if (!U.matchesAny(r.departamento, f.departamento)) return false;
      if (f.gestor && !U.normIncludes(r.lider, f.gestor)) return false;
      return true;
    });
  }

  function respondentes(list) { return list.filter(r => r.dimensao === DIM_REFERENCIA).length; }

  // % favorável / neutro / desfavorável de um conjunto de respostas Likert.
  function likertDe(list) {
    const vals = list.filter(isLikert).map(notaEfetiva).filter(v => v !== null);
    const fav = vals.filter(v => v >= 4).length;
    const desf = vals.filter(v => v <= 2).length;
    const neu = vals.length - fav - desf;
    return {
      respostas: vals.length,
      media: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
      pctFav: vals.length ? fav / vals.length : null,
      pctNeutro: vals.length ? neu / vals.length : null,
      pctDesf: vals.length ? desf / vals.length : null
    };
  }

  function npsDe(list) {
    const vals = list.map(r => r.nota).filter(v => v !== null && v !== undefined);
    const prom = vals.filter(v => v >= 9).length;
    const detr = vals.filter(v => v <= 6).length;
    const neu = vals.length - prom - detr;
    return {
      total: vals.length, promotores: prom, neutros: neu, detratores: detr,
      nps: vals.length ? Math.round(((prom - detr) / vals.length) * 100) : null,
      media: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
      pctPromotores: vals.length ? prom / vals.length : 0,
      pctNeutros: vals.length ? neu / vals.length : 0,
      pctDetratores: vals.length ? detr / vals.length : 0
    };
  }

  function porDimensao(list) {
    const m = new Map();
    for (const r of list) { if (!m.has(r.dimensao)) m.set(r.dimensao, []); m.get(r.dimensao).push(r); }
    return DIMENSOES.filter(d => m.has(d.key)).map(d => {
      const l = m.get(d.key);
      return Object.assign({ key: d.key, label: d.label, grupo: d.grupo }, d.grupo === 'nps' ? { nps: npsDe(l) } : { likert: likertDe(l) });
    });
  }

  function porPergunta(list) {
    const m = new Map();
    for (const r of list) {
      if (!isLikert(r)) continue;
      if (!m.has(r.pergunta)) m.set(r.pergunta, []);
      m.get(r.pergunta).push(r);
    }
    return Array.from(m.entries()).map(([pergunta, l]) => {
      const lk = likertDe(l);
      return { pergunta, dimensao: l[0].dimensao, dimLabel: dimLabel(l[0].dimensao), invertida: isInvertida(l[0]), ...lk };
    }).sort((a, b) => b.pctFav - a.pctFav);
  }

  // Quebra por unidade / departamento / líder / posição / tempo de empresa.
  // Grupos com menos de MIN_RESPONDENTES ficam de fora (contados em `ocultos`).
  function quebra(list, field, keyFn) {
    const m = new Map();
    for (const r of list) {
      const k = keyFn ? keyFn(r) : r[field];
      if (!k) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    const out = [];
    let ocultos = 0;
    for (const [label, l] of m) {
      const n = respondentes(l);
      if (n < MIN_RESPONDENTES) { ocultos++; continue; }
      const gptw = likertDe(l.filter(r => dimGrupo(r.dimensao) === 'gptw'));
      out.push({
        label, n,
        gptw: gptw.pctFav,
        nr1: likertDe(l.filter(r => dimGrupo(r.dimensao) === 'nr1')).pctFav,
        npsEmpresa: npsDe(l.filter(r => r.dimensao === 'nps empresa')).nps,
        npsGestor: npsDe(l.filter(r => r.dimensao === 'nps gestor')).nps
      });
    }
    out.sort((a, b) => (b.gptw ?? -1) - (a.gptw ?? -1));
    return { itens: out, ocultos };
  }

  function faixaTempo(r) {
    const m = r.tempo_empresa_meses;
    if (m === null || m === undefined) return null;
    if (m < 6) return 'Até 6 meses';
    if (m < 12) return '6 a 12 meses';
    if (m < 24) return '1 a 2 anos';
    if (m < 60) return '2 a 5 anos';
    return 'Mais de 5 anos';
  }
  const ORDEM_TEMPO = ['Até 6 meses', '6 a 12 meses', '1 a 2 anos', '2 a 5 anos', 'Mais de 5 anos'];

  // Participação = respondentes ÷ headcount da época da pesquisa (aba
  // "Headcount" do Excel da pesquisa, tabela pesquisa_clima_hc — todos os
  // colaboradores da base, Ativos e Desativados), com o mesmo recorte dos filtros.
  function headcountBase(f) {
    return (window.HUB_DATA.pesquisa_clima_hc || []).filter(r =>
      dentroDoEscopo(r) && U.matchesAny(r.unidade, f.unidade) && U.matchesAny(r.departamento, f.departamento) &&
      (!f.gestor || U.normIncludes(r.lider, f.gestor)));
  }

  // Participação por unidade ou por departamento: HC (base), respondentes,
  // faltam e %. Inclui grupos com HC e nenhuma resposta. Só contagens — nenhuma
  // resposta individual é exposta, então não há corte mínimo aqui.
  function participacao(list, f, porDepto) {
    const key = r => porDepto ? (r.departamento ? U.normalizeText(r.departamento) + '|' + U.normalizeText(r.unidade) : null) : (r.unidade ? U.normalizeText(r.unidade) : null);
    const g = new Map();
    const get = r => { const k = key(r); if (!k) return null; if (!g.has(k)) g.set(k, { label: porDepto ? r.departamento : r.unidade, unidade: r.unidade, hc: 0, resp: 0 }); return g.get(k); };
    for (const r of headcountBase(f)) { const x = get(r); if (x) x.hc++; }
    for (const r of list) if (r.dimensao === DIM_REFERENCIA) { const x = get(r); if (x) x.resp++; }
    const itens = Array.from(g.values()).map(x => ({ ...x, faltam: Math.max(x.hc - x.resp, 0), pct: x.hc ? Math.min(x.resp / x.hc, 1) : null }))
      .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.resp - a.resp);
    const hc = itens.reduce((t, x) => t + x.hc, 0), resp = itens.reduce((t, x) => t + x.resp, 0);
    return { itens, total: { hc, resp, faltam: Math.max(hc - resp, 0), pct: hc ? Math.min(resp / hc, 1) : null } };
  }

  function comentarios(list) {
    const nPorUnidade = new Map();
    for (const r of list) if (r.dimensao === DIM_REFERENCIA && r.unidade) nPorUnidade.set(r.unidade, (nPorUnidade.get(r.unidade) || 0) + 1);
    return list.filter(r => r.comentario).map(r => {
      const lk = isLikert(r);
      const ef = lk ? notaEfetiva(r) : r.nota;
      let sentimento = 'neutro';
      if (lk) sentimento = ef >= 4 ? 'favoravel' : ef <= 2 ? 'desfavoravel' : 'neutro';
      else sentimento = ef >= 9 ? 'favoravel' : ef <= 6 ? 'desfavoravel' : 'neutro';
      // Anonimato: só unidade, dimensão, pergunta e nota — líder, posição,
      // tempo de empresa e departamento nunca vão pra tela de comentários.
      return { texto: r.comentario, unidade: (nPorUnidade.get(r.unidade) || 0) >= MIN_RESPONDENTES ? r.unidade : 'Unidade com poucas respostas', dimensao: r.dimensao, dimLabel: dimLabel(r.dimensao), pergunta: r.pergunta, nota: r.nota, sentimento };
    });
  }

  function insightsDe(dims, perguntas, nps, part) {
    const out = [];
    const gptw = dims.filter(d => d.grupo === 'gptw' && d.likert.pctFav !== null);
    if (gptw.length) {
      const pior = gptw.slice().sort((a, b) => a.likert.pctFav - b.likert.pctFav)[0];
      const melhor = gptw.slice().sort((a, b) => b.likert.pctFav - a.likert.pctFav)[0];
      out.push({ tipo: 'info', texto: `Melhor dimensão GPTW: ${melhor.label} (${U.fmtPct(melhor.likert.pctFav, 0)} favorável). Maior oportunidade: ${pior.label} (${U.fmtPct(pior.likert.pctFav, 0)}).` });
    }
    const piorPerg = perguntas.slice().reverse().find(p => p.respostas >= MIN_RESPONDENTES);
    if (piorPerg) out.push({ tipo: 'acao', texto: `Pergunta com menor favorabilidade: "${piorPerg.pergunta}" (${U.fmtPct(piorPerg.pctFav, 0)} favorável, ${U.fmtPct(piorPerg.pctDesf, 0)} desfavorável) — candidata a plano de ação.` });
    const npsEmp = nps.find(d => d.key === 'nps empresa');
    const npsGes = nps.find(d => d.key === 'nps gestor');
    if (npsEmp && npsGes && npsEmp.nps.nps !== null && npsGes.nps.nps !== null && npsGes.nps.nps - npsEmp.nps.nps >= 20) {
      out.push({ tipo: 'info', texto: `O gestor direto (eNPS ${npsGes.nps.nps}) é avaliado bem acima da empresa (eNPS ${npsEmp.nps.nps}) — a percepção negativa está mais ligada à empresa (ex.: remuneração/benefícios) do que à liderança imediata.` });
    }
    const npsBaixos = nps.filter(d => d.nps.nps !== null && d.nps.nps < 0 && d.key !== 'nps empresa').map(d => d.label);
    if (npsBaixos.length) out.push({ tipo: 'alerta', texto: `eNPS negativo em: ${npsBaixos.join(', ')}.` });
    if (part !== null && part < 0.6) out.push({ tipo: 'alerta', texto: `Participação de ${U.fmtPct(part, 0)} — abaixo de 60%, o que reduz a representatividade dos resultados.` });
    return out;
  }

  function pesquisaClimaMetrics(f) {
    const list = filterRows(f);
    const n = respondentes(list);
    const base = {
      n, minimo: MIN_RESPONDENTES,
      temDados: rows().length > 0,
      bloqueado: n > 0 && n < MIN_RESPONDENTES,
      vazio: n === 0
    };
    if (base.bloqueado || base.vazio) return base;

    const dims = porDimensao(list);
    const npsDims = dims.filter(d => d.grupo === 'nps');
    const perguntas = porPergunta(list);
    const gptw = likertDe(list.filter(r => dimGrupo(r.dimensao) === 'gptw'));
    const nr1 = likertDe(list.filter(r => dimGrupo(r.dimensao) === 'nr1'));
    const npsEmpresa = npsDe(list.filter(r => r.dimensao === 'nps empresa'));
    const hcTotal = headcountBase(f).length;
    const partGeral = hcTotal ? Math.min(n / hcTotal, 1) : null;
    const comLider = list.filter(r => r.posicao);

    return Object.assign(base, {
      gptw, nr1, npsEmpresa, hcTotal, participacao: partGeral,
      dimensoes: dims,
      npsDimensoes: npsDims,
      perguntas,
      melhores: perguntas.slice(0, 5),
      piores: perguntas.slice().reverse().slice(0, 5),
      partUnidade: participacao(list, f, false),
      partDepto: participacao(list, f, true),
      porUnidade: quebra(list, 'unidade'),
      porDepartamento: quebra(list, 'departamento'),
      porLider: quebra(list, 'lider'),
      porPosicao: quebra(comLider, 'posicao'),
      porTempo: (() => { const q = quebra(list, null, faixaTempo); q.itens.sort((a, b) => ORDEM_TEMPO.indexOf(a.label) - ORDEM_TEMPO.indexOf(b.label)); return q; })(),
      comentarios: comentarios(list),
      insights: insightsDe(dims, perguntas, npsDims, partGeral)
    });
  }

  window.HUB_METRICS_PESQUISA_CLIMA = { pesquisaClimaMetrics, DIMENSOES, GRUPO_LABEL, MIN_RESPONDENTES };
})();
