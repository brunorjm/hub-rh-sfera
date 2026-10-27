// Motor de cálculo da Pesquisa de Satisfação com o Suporte do Escritório
// (Indicadores → Pesquisa de Satisfação). Não acessa o banco nem o DOM — pode
// ser testado em Node (test/satisfacao.test.js).
//
// Entrada: linhas de satisfacao_dados() — { pesquisa, area, nota, melhorar[],
// extra, comentario, unidade, departamento, chave, triagem, loja_liberada } — e
// os ciclos (satisfacao_ciclo).
//
// SIGILO: o banco já devolve só as áreas liberadas no perfil, sem loja para quem
// não tem a visão completa. recortar() repete a mesma regra no navegador para o
// "Visualizar como" (a sessão real é do Administrador, que recebe tudo).
(function () {
  const U = HUB_UTILS;
  const N = s => U.normalizeText(s == null ? '' : s);

  const PERM = 'indicadores.satisfacao';
  const PERM_COMPLETO = 'indicadores.satisfacao_completo';

  // Nota média (0 a 10).
  const FAIXAS = [
    { min: 9, id: 'otimo', rotulo: 'Ótimo', cor: '#0f8a4c', fundo: '#DDF5E8' },
    { min: 8, id: 'bom', rotulo: 'Bom', cor: '#1baf7a', fundo: '#EEF9F3' },
    { min: 7, id: 'atencao', rotulo: 'Atenção', cor: '#c98500', fundo: '#FFF6E0' },
    { min: -Infinity, id: 'critico', rotulo: 'Crítico', cor: '#d03b3b', fundo: '#FDECEC' }
  ];
  // NPS (% notas 9-10 − % notas 0-6), zonas usuais.
  const ZONAS_NPS = [
    { min: 75, rotulo: 'Excelência', cor: '#0f8a4c' },
    { min: 50, rotulo: 'Qualidade', cor: '#1baf7a' },
    { min: 0, rotulo: 'Aperfeiçoamento', cor: '#c98500' },
    { min: -Infinity, rotulo: 'Crítica', cor: '#d03b3b' }
  ];
  // Opções do "O que melhorar?" no formulário.
  const MELHORAR = ['Tempo de resposta', 'Tempo para resolução', 'Qualidade da solução', 'Educação e cordialidade'];
  const NADA = 'Nada a melhorar';
  // Ordem das áreas (a do formulário); área nova entra no fim, em ordem alfabética.
  // Compras vem dividido pela operação de quem respondeu (parsers-boletim.js, areaDaResposta).
  const ORDEM_AREAS = ['Financeiro', 'Compras O Boticário', 'Compras Hering e Levis', 'Recrutamento e Seleção', 'DHO', 'T&D', 'DP', 'TI', 'Manutenção', 'Auditoria', 'Administrativo', 'Marketing', 'Jurídico', 'Suprimentos Indiretos'];
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  const mesISO = v => String(v || '').slice(0, 7);
  const rotuloMes = m => { const [a, n] = mesISO(m).split('-'); return MESES[Number(n) - 1] + '/' + a.slice(2); };
  const rotuloMesLongo = m => { const [a, n] = mesISO(m).split('-'); return MESES_LONGOS[Number(n) - 1] + ' de ' + a; };
  // A pesquisa aplicada num mês avalia o MÊS ANTERIOR (a de set/26 avalia agosto/26).
  const mesReferencia = m => { const [a, n] = mesISO(m).split('-').map(Number); return n === 1 ? (a - 1) + '-12' : a + '-' + String(n - 1).padStart(2, '0'); };
  const rotuloCiclo = m => rotuloMes(m) + ' (ref. ' + rotuloMes(mesReferencia(m)) + ')';
  const rotuloCicloLongo = m => { const [a, n] = mesISO(m).split('-'); const r = mesReferencia(m).split('-'); return 'Pesquisa de ' + MESES[Number(n) - 1] + '/' + a + ' · avalia ' + MESES_LONGOS[Number(r[1]) - 1] + '/' + r[0]; };
  const faixa = v => v == null ? null : FAIXAS.find(f => v >= f.min);
  const zonaNps = v => v == null ? null : ZONAS_NPS.find(z => v >= z.min);
  const fmtNota = v => v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmtNps = v => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v));
  const fmtVarNota = v => v == null ? '' : (Math.abs(v) < 0.05 ? '= 0,0' : (v > 0 ? '▲ ' : '▼ ') + fmtNota(Math.abs(v)));
  const fmtVarNps = v => v == null ? '' : (Math.round(v) === 0 ? '= 0' : (v > 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(v)));

  function ordenarAreas(areas) {
    return Array.from(new Set(areas)).sort((a, b) => {
      const ia = ORDEM_AREAS.indexOf(a), ib = ORDEM_AREAS.indexOf(b);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a.localeCompare(b, 'pt-BR');
    });
  }

  // ------------------------------------------------------------------
  // Acesso (mesma regra de satisfacao_dados() no banco)
  // ------------------------------------------------------------------
  function acessoDe(user) {
    const P = window.HUB_PERMISSIONS;
    const tem = k => P ? P.hasPerm(user, k) : !!(user && (user.perfil === 'admin' || (user.permissoes || {})[k] === true));
    const completo = tem(PERM_COMPLETO);
    const modulo = completo || tem(PERM);
    return { modulo, completo, areas: completo ? null : ((user && user.satisfacao_areas) || []).slice() };
  }

  // Triagem dos comentários (exceções marcadas por quem tem a visão completa).
  // Sem marca, o comentário vai para a área sem a loja.
  const TRIAGEM = {
    ocultar: { rotulo: 'Oculto da área', acao: 'Ocultar da área', escondeDaArea: true },
    individual: { rotulo: 'Tratar individualmente', acao: 'Tratar individualmente (não vai para a área)', escondeDaArea: true },
    loja: { rotulo: 'Loja liberada para a área', acao: 'Liberar a loja para a área', escondeDaArea: false }
  };
  const triagemDe = r => (r && r.triagem && TRIAGEM[r.triagem]) ? r.triagem : null;

  // Sem a visão completa: só as áreas liberadas, sem loja; comentário marcado como
  // "ocultar" ou "individual" some (a nota fica), e o marcado como "loja" leva o
  // nome da loja em loja_liberada. Mesma regra de satisfacao_dados() no banco.
  function recortar(respostas, acesso) {
    if (!acesso || !acesso.modulo) return [];
    if (acesso.completo) return respostas;
    const ok = new Set(acesso.areas.map(N));
    return respostas.filter(r => ok.has(N(r.area))).map(r => {
      const t = triagemDe(r);
      return Object.assign({}, r, {
        unidade: null, departamento: null, chave: null, triagem: null,
        comentario: t && TRIAGEM[t].escondeDaArea ? null : r.comentario,
        loja_liberada: r.loja_liberada || (t === 'loja' ? (r.departamento || r.unidade || null) : null)
      });
    });
  }

  // ------------------------------------------------------------------
  // Estatísticas de um conjunto de respostas
  // ------------------------------------------------------------------
  function stats(rows) {
    const dist = new Array(11).fill(0);
    const melhorar = {};
    let n = 0, soma = 0, prom = 0, det = 0, comMelhorar = 0;
    for (const r of rows) {
      const v = r.nota == null || r.nota === '' ? null : Number(r.nota);
      if (v != null && !isNaN(v)) {
        n++; soma += v;
        dist[Math.max(0, Math.min(10, Math.round(v)))]++;
        if (v >= 9) prom++; else if (v <= 6) det++;
      }
      const ops = r.melhorar || [];
      if (ops.length) comMelhorar++;
      for (const o of ops) melhorar[o] = (melhorar[o] || 0) + 1;
    }
    const media = n ? soma / n : null;
    const nps = n ? (prom - det) / n * 100 : null;
    // Principal ponto a melhorar: a opção (fora "Nada a melhorar") mais marcada.
    const pontos = Object.entries(melhorar).filter(([k]) => N(k) !== N(NADA)).sort((a, b) => b[1] - a[1]);
    return {
      respostas: rows.length, n, soma, media, nps, promotores: prom, detratores: det, neutros: n - prom - det,
      pctPromotores: n ? prom / n : null, pctDetratores: n ? det / n : null,
      dist, melhorar, comMelhorar, principal: pontos.length ? pontos[0][0] : null,
      pctNada: comMelhorar ? (melhorar[NADA] || 0) / comMelhorar : null
    };
  }

  // ------------------------------------------------------------------
  // Índice: área → ciclo → linhas
  // ------------------------------------------------------------------
  function indexar(respostas) {
    const porArea = new Map();
    const ciclos = new Set();
    for (const r of respostas) {
      const m = mesISO(r.pesquisa);
      if (!m) continue;
      ciclos.add(m);
      if (!porArea.has(r.area)) porArea.set(r.area, new Map());
      const pa = porArea.get(r.area);
      if (!pa.has(m)) pa.set(m, []);
      pa.get(m).push(r);
    }
    return { porArea, ciclos: Array.from(ciclos).sort(), areas: ordenarAreas(Array.from(porArea.keys())) };
  }

  // Ciclo anterior em que a área foi avaliada.
  function anteriorDa(idx, area, ciclo) {
    const pa = idx.porArea.get(area);
    if (!pa) return null;
    const antes = Array.from(pa.keys()).filter(m => m < ciclo).sort();
    return antes.length ? antes[antes.length - 1] : null;
  }

  function resumoArea(idx, area, ciclo) {
    const pa = idx.porArea.get(area) || new Map();
    const atual = pa.has(ciclo) ? stats(pa.get(ciclo)) : null;
    const mAnt = anteriorDa(idx, area, ciclo);
    const ant = mAnt ? stats(pa.get(mAnt)) : null;
    return {
      area, ciclo, atual, anterior: ant, cicloAnterior: mAnt,
      varNota: atual && ant && atual.media != null && ant.media != null ? atual.media - ant.media : null,
      varNps: atual && ant && atual.nps != null && ant.nps != null ? atual.nps - ant.nps : null
    };
  }

  function serieArea(idx, area, ciclos) {
    const pa = idx.porArea.get(area) || new Map();
    return ciclos.map(m => ({ ciclo: m, s: pa.has(m) ? stats(pa.get(m)) : null }));
  }

  // Visão geral do ciclo: ranking das áreas e números consolidados.
  function visaoGeral(idx, ciclo, ciclosTab) {
    const areas = idx.areas.map(a => resumoArea(idx, a, ciclo)).filter(x => x.atual && x.atual.n);
    const todas = [];
    for (const a of idx.areas) { const pa = idx.porArea.get(a); if (pa.has(ciclo)) todas.push(...pa.get(ciclo)); }
    const ant = idx.ciclos.filter(m => m < ciclo).pop() || null;
    const todasAnt = [];
    if (ant) for (const a of idx.areas) { const pa = idx.porArea.get(a); if (pa.has(ant)) todasAnt.push(...pa.get(ant)); }
    const geral = stats(todas), geralAnt = ant ? stats(todasAnt) : null;
    const tab = new Map((ciclosTab || []).map(c => [mesISO(c.pesquisa), c]));
    const cAt = tab.get(ciclo) || null, cAnt = ant ? tab.get(ant) || null : null;
    // O NPS é o indicador principal: o ranking segue ele (a nota desempata).
    const ranking = areas.slice().sort((a, b) => b.atual.nps - a.atual.nps || b.atual.media - a.atual.media);
    return {
      ciclo, cicloAnterior: ant, areas: ranking, geral, geralAnterior: geralAnt,
      varNota: geralAnt && geral.media != null && geralAnt.media != null ? geral.media - geralAnt.media : null,
      varNps: geralAnt && geral.nps != null && geralAnt.nps != null ? geral.nps - geralAnt.nps : null,
      respondentes: cAt ? cAt.respondentes : null,
      respondentesAnt: cAnt ? cAnt.respondentes : null,
      aptos: cAt ? cAt.aptos : null,
      participacao: cAt && cAt.aptos ? Math.min(1, cAt.respondentes / cAt.aptos) : null,
      melhor: ranking[0] || null, pior: ranking.length > 1 ? ranking[ranking.length - 1] : null
    };
  }

  // Mapa de calor: área × ciclo (nota média e n).
  function mapaCalor(idx, ciclos) {
    return idx.areas.map(a => ({ area: a, celulas: serieArea(idx, a, ciclos) }));
  }

  // ------------------------------------------------------------------
  // Recortes da visão completa (exigem unidade/departamento)
  // ------------------------------------------------------------------
  function operacaoDe(r) {
    const MB = window.HUB_METRICS_BOLETIM;
    const id = MB ? MB.operacaoDe(r.unidade, r.departamento) : null;
    const op = id && MB.OP_POR_ID ? MB.OP_POR_ID.get(id) : null;
    return { id: id || 'outras', nome: op ? op.nome : (r.unidade || 'Sem unidade') };
  }

  // [{ id, nome, s }] por operação, para uma área (ou todas, area = null) no ciclo.
  function porOperacao(respostas, ciclo, area) {
    const g = new Map();
    for (const r of respostas) {
      if (mesISO(r.pesquisa) !== ciclo || (area && r.area !== area) || r.unidade == null) continue;
      const op = operacaoDe(r);
      if (!g.has(op.id)) g.set(op.id, { id: op.id, nome: op.nome, rows: [] });
      g.get(op.id).rows.push(r);
    }
    const MB = window.HUB_METRICS_BOLETIM;
    const ordem = MB ? MB.OPERACOES.map(o => o.id) : [];
    return Array.from(g.values()).map(x => ({ id: x.id, nome: x.nome, s: stats(x.rows) }))
      .sort((a, b) => ((ordem.indexOf(a.id) + 1) || 99) - ((ordem.indexOf(b.id) + 1) || 99) || a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  // Matriz operação × área no ciclo (nota média e n).
  function matrizOperacoes(respostas, ciclo, areas) {
    const ops = porOperacao(respostas, ciclo, null);
    return ops.map(o => ({
      id: o.id, nome: o.nome, total: o.s,
      areas: areas.map(a => stats(respostas.filter(r => mesISO(r.pesquisa) === ciclo && r.area === a && r.unidade != null && operacaoDe(r).id === o.id)))
    }));
  }

  function porLoja(respostas, ciclo, area) {
    const g = new Map();
    for (const r of respostas) {
      if (mesISO(r.pesquisa) !== ciclo || r.area !== area || r.unidade == null) continue;
      const k = (r.unidade || '') + '\u0001' + (r.departamento || '');
      if (!g.has(k)) g.set(k, { unidade: r.unidade, departamento: r.departamento, operacao: operacaoDe(r).nome, rows: [] });
      g.get(k).rows.push(r);
    }
    return Array.from(g.values()).map(x => ({ unidade: x.unidade, departamento: x.departamento, operacao: x.operacao, s: stats(x.rows) }))
      .sort((a, b) => (a.s.media == null ? 99 : a.s.media) - (b.s.media == null ? 99 : b.s.media) || String(a.departamento).localeCompare(String(b.departamento), 'pt-BR'));
  }

  // ------------------------------------------------------------------
  // Comentários
  // ------------------------------------------------------------------
  // "." / "ok" / "nada a declarar" / "sem comentários" e afins: sem conteúdo.
  const VAZIO_RE = /^(nada|nenhum|nenhuma|sem|tudo ok|ok|bom|boa|bons|otimo|otima|otimos|otimas|n a|na|nao|nada de negativo|neutra|indiferente)( (a|de|para|ha|com))?( (declarar|comentar|comentario|comentarios|melhorar|melhoras|falar|reclamar|acrescentar|objecao|objecoes|ressalva|ressalvas|dizer))?$/;
  function comentarioVazio(s) {
    const t = N(s).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (t.replace(/[^a-z]/g, '').length < 3) return true;
    return VAZIO_RE.test(t);
  }

  function comentarios(respostas, ciclo, area, opts) {
    opts = opts || {};
    const busca = N(opts.busca || '');
    return respostas
      .filter(r => mesISO(r.pesquisa) === ciclo && r.area === area && r.comentario)
      .filter(r => opts.todos || !comentarioVazio(r.comentario))
      .filter(r => !busca || N(r.comentario).includes(busca))
      .filter(r => !opts.soTriados || triagemDe(r))
      .map(r => ({
        nota: r.nota == null ? null : Number(r.nota), melhorar: r.melhorar || [], comentario: r.comentario,
        operacao: r.unidade != null ? operacaoDe(r).nome : null, sinal: sinalDe(r),
        // Visão completa: a loja de quem escreveu, a chave e a marca da triagem.
        // Responsável da área: a loja só quando o DHO liberou.
        loja: r.unidade != null || r.departamento != null ? (r.departamento || r.unidade) : (r.loja_liberada || null),
        lojaLiberada: r.unidade == null && r.departamento == null && !!r.loja_liberada,
        chave: r.chave || null, triagem: triagemDe(r)
      }))
      .sort((a, b) => opts.ordem === 'maior'
        ? (b.nota == null ? -1 : b.nota) - (a.nota == null ? -1 : a.nota)
        : (a.nota == null ? 99 : a.nota) - (b.nota == null ? 99 : b.nota));
  }

  // Compras: "Quantas reuniões o time realizou com você este mês?"
  function distribuicaoExtra(rows) {
    const c = {};
    for (const r of rows) if (r.extra) c[r.extra] = (c[r.extra] || 0) + 1;
    const ordem = ['0 reuniões', '1 reunião', '2 reuniões', '3 reuniões ou mais', 'Não sei / Não se aplica'];
    return Object.entries(c).sort((a, b) => ((ordem.indexOf(a[0]) + 1) || 99) - ((ordem.indexOf(b[0]) + 1) || 99));
  }

  // ------------------------------------------------------------------
  // NPS como indicador principal: leituras de apoio
  // ------------------------------------------------------------------
  const CICLOS_ACUMULADO = 3;

  // Quanto UMA resposta move o NPS: detrator → neutro (ou neutro → promotor) = 100/n
  // pontos; detrator → promotor = 200/n. Variação menor que isso é uma loja só.
  function pesoResposta(n) { return n ? { umPasso: 100 / n, doisPassos: 200 / n } : null; }

  // NPS acumulado: junta as respostas dos últimos k ciclos em que a área foi
  // avaliada (até o ciclo escolhido). Com o triplo de respostas, oscila bem menos.
  function acumulado(idx, area, ciclo, k) {
    const pa = idx.porArea.get(area);
    if (!pa) return null;
    const ms = Array.from(pa.keys()).filter(m => m <= ciclo).sort().slice(-(k || CICLOS_ACUMULADO));
    return ms.length ? { ciclos: ms, s: stats(ms.flatMap(m => pa.get(m))) } : null;
  }
  function acumuladoGeral(idx, ciclo, k) {
    const ms = idx.ciclos.filter(m => m <= ciclo).slice(-(k || CICLOS_ACUMULADO));
    if (!ms.length) return null;
    const rows = [];
    for (const a of idx.areas) { const pa = idx.porArea.get(a); for (const m of ms) if (pa.has(m)) rows.push(...pa.get(m)); }
    return { ciclos: ms, s: stats(rows) };
  }

  // Tendência: três variações seguidas do NPS na mesma direção (4 ciclos avaliados).
  // Recebe os NPS em ordem cronológica (null = ciclo sem avaliação, ignorado).
  function tendencia(valores) {
    const v = (valores || []).filter(x => x != null).map(x => Math.round(x)).slice(-4);
    if (v.length < 4) return null;
    const d = [v[1] - v[0], v[2] - v[1], v[3] - v[2]];
    return d.every(x => x > 0) ? 'subindo' : d.every(x => x < 0) ? 'caindo' : null;
  }
  function tendenciaArea(idx, area, ciclo) {
    const pa = idx.porArea.get(area);
    if (!pa) return null;
    return tendencia(Array.from(pa.keys()).filter(m => m <= ciclo).sort().map(m => stats(pa.get(m)).nps));
  }
  function tendenciaGeral(idx, ciclo) {
    return tendencia(idx.ciclos.filter(m => m <= ciclo).map(m => stats(idx.areas.flatMap(a => idx.porArea.get(a).get(m) || [])).nps));
  }

  // ------------------------------------------------------------------
  // Mesmas lojas: comparação só com quem respondeu nos dois ciclos (visão completa)
  // ------------------------------------------------------------------
  const chaveLoja = r => r.unidade == null && r.departamento == null ? null : N(r.unidade) + '\u0001' + N(r.departamento);

  // area = null → todas as áreas. Devolve null sem loja (perfil sem a visão completa)
  // ou sem nenhuma loja em comum.
  function mesmasLojas(respostas, ciclo, cicloAnt, area) {
    if (!cicloAnt) return null;
    const at = new Set(), an = new Set(), rowsAt = [], rowsAn = [];
    for (const r of respostas) {
      if (area && r.area !== area) continue;
      const m = mesISO(r.pesquisa);
      if (m !== ciclo && m !== cicloAnt) continue;
      const k = chaveLoja(r);
      if (!k) continue;
      if (m === ciclo) { at.add(k); rowsAt.push(r); } else { an.add(k); rowsAn.push(r); }
    }
    const ambos = new Set(Array.from(at).filter(k => an.has(k)));
    if (!ambos.size) return null;
    const a = stats(rowsAt.filter(r => ambos.has(chaveLoja(r)))), b = stats(rowsAn.filter(r => ambos.has(chaveLoja(r))));
    return {
      lojas: ambos.size, lojasAtual: at.size, lojasAnterior: an.size, entraram: at.size - ambos.size, sairam: an.size - ambos.size,
      atual: a, anterior: b,
      varNota: a.media != null && b.media != null ? a.media - b.media : null,
      varNps: a.nps != null && b.nps != null ? a.nps - b.nps : null
    };
  }

  // ------------------------------------------------------------------
  // Respostas para conferir (a nota pode não medir o serviço)
  // ------------------------------------------------------------------
  const SINAIS = {
    incoerente: 'Nota de 0 a 6 marcando só "Nada a melhorar"',
    pouco_contato: 'Diz ter pouco ou nenhum contato com a área'
  };
  const POUCO_CONTATO_RE = /(pouco|nenhum|quase nao tenho|nao tenho|nao tenho (muito|tanto)|nao tive|sem) contato|nao utiliz|nao uso\b|nunca (utilizei|usei|precisei)|nao (tive|tivemos|houve) necessidade|nao precisei|desconhec/;
  const notaDe = r => (r.nota == null || r.nota === '' || isNaN(Number(r.nota))) ? null : Number(r.nota);
  function sinalDe(r) {
    const v = notaDe(r);
    const ops = r.melhorar || [];
    // O comentário explica mais que a nota: 'não utilizo' vem antes da incoerência.
    if (r.comentario && POUCO_CONTATO_RE.test(N(r.comentario))) return 'pouco_contato';
    if (v != null && v <= 6 && ops.length && ops.every(o => N(o) === N(NADA))) return 'incoerente';
    return null;
  }
  // Avaliações sinalizadas no ciclo, menor nota primeiro. Com loja só na visão completa.
  function sinalizadas(respostas, ciclo, area) {
    const out = [];
    for (const r of respostas) {
      if (mesISO(r.pesquisa) !== ciclo || (area && r.area !== area)) continue;
      const sinal = sinalDe(r);
      if (!sinal) continue;
      out.push({
        area: r.area, nota: notaDe(r), sinal, motivo: SINAIS[sinal], comentario: r.comentario || null,
        loja: r.unidade != null || r.departamento != null ? (r.departamento || r.unidade) : null,
        operacao: r.unidade != null ? operacaoDe(r).nome : null
      });
    }
    return out.sort((a, b) => (a.nota == null ? 99 : a.nota) - (b.nota == null ? 99 : b.nota) || a.area.localeCompare(b.area, 'pt-BR'));
  }
  // Simulação: os mesmos dados sem as avaliações sinalizadas (em todos os ciclos, para a variação continuar comparável).
  function semSinalizadas(respostas) { return respostas.filter(r => !sinalDe(r)); }

  // ------------------------------------------------------------------
  // Onde está a insatisfação: lojas que concentram as notas de 0 a 6 (visão completa)
  // ------------------------------------------------------------------
  const LIMITE_LOJA = 6.5;       // média da loja em todas as áreas abaixo disso = loja crítica
  const CICLOS_RECORRENTE = 3;   // crítica em 3 ou mais ciclos da janela = recorrente
  const SUSPEITAS_LOJA = 3;      // 3+ avaliações sinalizadas na mesma loja = conferir as notas com ela

  // ciclosJanela: ciclos (em ordem) para o histórico de cada loja, terminando no ciclo escolhido.
  function lojasInsatisfacao(respostas, ciclo, ciclosJanela) {
    const janela = (ciclosJanela && ciclosJanela.length ? ciclosJanela : [ciclo]).slice();
    const dentro = new Set(janela.concat([ciclo]));
    const mapa = new Map();
    for (const r of respostas) {
      const m = mesISO(r.pesquisa);
      if (!dentro.has(m)) continue;
      const k = chaveLoja(r);
      if (!k) continue;
      if (!mapa.has(k)) mapa.set(k, { nome: r.departamento || r.unidade || '—', unidade: r.unidade, operacao: operacaoDe(r).nome, porCiclo: new Map() });
      const l = mapa.get(k);
      if (!l.porCiclo.has(m)) l.porCiclo.set(m, []);
      l.porCiclo.get(m).push(r);
    }
    const mediaDe = rows => rows ? stats(rows).media : null;
    const anterior = janela.filter(m => m < ciclo).pop() || null;
    const lojas = [], ausentes = [];
    for (const l of mapa.values()) {
      const historico = janela.map(m => ({ ciclo: m, media: mediaDe(l.porCiclo.get(m)) }));
      if (!l.porCiclo.has(ciclo)) {
        // Loja crítica no ciclo anterior que não respondeu agora: o NPS pode subir só por isso.
        const ant = anterior ? mediaDe(l.porCiclo.get(anterior)) : null;
        if (ant != null && ant < LIMITE_LOJA) ausentes.push({ nome: l.nome, operacao: l.operacao, mediaAnterior: ant });
        continue;
      }
      const rows = l.porCiclo.get(ciclo), s = stats(rows);
      if (!s.n) continue;
      const respondidos = historico.filter(x => x.media != null);
      const ciclosBaixos = respondidos.filter(x => x.media < LIMITE_LOJA).length;
      const suspeitas = rows.filter(r => sinalDe(r)).length;
      lojas.push({
        nome: l.nome, unidade: l.unidade, operacao: l.operacao, media: s.media, avaliacoes: s.n, detratores: s.detratores,
        zeros: rows.filter(r => notaDe(r) === 0).length,
        areasZero: ordenarAreas(rows.filter(r => notaDe(r) === 0).map(r => r.area)),
        areasBaixas: ordenarAreas(rows.filter(r => notaDe(r) != null && notaDe(r) <= 6).map(r => r.area)),
        historico, ciclosRespondidos: respondidos.length, ciclosBaixos,
        recorrente: ciclosBaixos >= CICLOS_RECORRENTE, suspeitas, conferir: suspeitas >= SUSPEITAS_LOJA
      });
    }
    const totalDet = lojas.reduce((t, l) => t + l.detratores, 0);
    const criticas = lojas.filter(l => l.media < LIMITE_LOJA).sort((a, b) => a.media - b.media);
    const detCriticas = criticas.reduce((t, l) => t + l.detratores, 0);
    const outras = lojas.filter(l => l.media >= LIMITE_LOJA && l.detratores > 0);
    return {
      limite: LIMITE_LOJA, janela, lojas: lojas.length, totalDet, criticas, detCriticas,
      pctCriticas: totalDet ? detCriticas / totalDet : null,
      outras: { lojas: outras.length, detratores: outras.reduce((t, l) => t + l.detratores, 0) },
      ausentes: ausentes.sort((a, b) => a.mediaAnterior - b.mediaAnterior), cicloAnterior: anterior
    };
  }

  // ------------------------------------------------------------------
  // Compras: lojas sem nenhuma reunião com o time no mês
  // ------------------------------------------------------------------
  function semReuniao(rows) {
    const c = (rows || []).filter(r => r.extra);
    if (!c.length) return null;
    const zero = c.filter(r => /^0\b/.test(N(r.extra))).length;
    return { n: c.length, zero, pct: zero / c.length };
  }

  window.HUB_METRICS_SATISFACAO = {
    PERM, PERM_COMPLETO, FAIXAS, ZONAS_NPS, MELHORAR, NADA, ORDEM_AREAS, TRIAGEM, triagemDe,
    acessoDe, recortar, stats, indexar, resumoArea, serieArea, visaoGeral, mapaCalor,
    porOperacao, matrizOperacoes, porLoja, comentarios, comentarioVazio, distribuicaoExtra, ordenarAreas,
    CICLOS_ACUMULADO, LIMITE_LOJA, SINAIS, pesoResposta, acumulado, acumuladoGeral, tendencia, tendenciaArea, tendenciaGeral,
    mesmasLojas, sinalDe, sinalizadas, semSinalizadas, lojasInsatisfacao, semReuniao,
    faixa, zonaNps, fmtNota, fmtNps, fmtVarNota, fmtVarNps, rotuloMes, rotuloMesLongo, mesReferencia, rotuloCiclo, rotuloCicloLongo, mesISO
  };
})();
