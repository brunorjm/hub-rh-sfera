// Leitura das planilhas de treinamento que não vêm do Twygo:
//   27.1 Unibê.xlsx            abas "Visão Geral - PDV" (adesão oficial da loja) e
//                              "Visão Geral - Pessoa" (adesão de cada pessoa)
//   27.2 Academia Hering.xlsx  aba "Dados Exportados" (horas e performance por pessoa)
//
// As duas são uma foto do dia da exportação, sem data: o mês de referência é
// escolhido no card de upload. Cada pessoa é casada com o cadastro de
// Colaboradores pelo nome para herdar unidade e departamento (é isso que o
// recorte de acesso e o Boletim usam); a loja/PDV fica com o departamento da
// maioria das pessoas dela. Ver supabase-treinamentos.sql.
(function () {
  const I = HUB_PARSERS._internal;
  const N = s => HUB_UTILS.normalizeText(s == null ? '' : s);
  const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  const tokens = s => N(s).split(' ').filter(t => t && !PARTICULAS.has(t));

  // Datas que vêm como TEXTO no padrão brasileiro ("05/10/2026 10:13"). Célula
  // de data de verdade (Date/número) segue o leitor comum.
  function dataBR(v) {
    if (typeof v === 'string') {
      const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
    return I.toISODate(v);
  }

  // "51:20" (horas:minutos, texto) → 51,33. Número/Date seguem o leitor comum.
  function horas(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'string') {
      const m = v.trim().match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
      if (m) return +m[1] + +m[2] / 60 + (m[3] ? +m[3] / 3600 : 0);
    }
    return I.num(v);
  }

  // Adesão em 0–1: aceita 0,8921 / "89,21%" / 89,21.
  function fracao(v) {
    const n = I.num(v);
    if (n == null) return null;
    return n > 1.0001 ? n / 100 : n;
  }

  // ------------------------------------------------------------------
  // Casamento com o cadastro de Colaboradores
  // ------------------------------------------------------------------
  // 1º nome completo exato; senão, mesmo primeiro nome e todas as outras partes
  // do nome da planilha presentes no cadastro ("ODIR GARCEZ" = "Odir Luiz
  // Ferreira Garcez"), desde que só uma pessoa bata (ativos têm preferência).
  // `aceita(c)` limita a busca às unidades da plataforma (Unibê = Boticário,
  // Academia = Hering), o que evita homônimos de outras operações.
  function indiceColaboradores(colaboradores, aceita) {
    const lista = (colaboradores || []).filter(c => c && (c.nome_completo || c.nome) && aceita(c));
    const porNome = new Map();
    const ativo = c => N(c.situacao) !== 'desligado';
    for (const c of lista) {
      const k = N(c.nome_completo || c.nome);
      const atual = porNome.get(k);
      if (!atual || (ativo(c) && !ativo(atual))) porNome.set(k, c);
    }
    const tk = lista.map(c => ({ c, t: new Set(tokens(c.nome_completo || c.nome)), p: tokens(c.nome_completo || c.nome)[0] }));
    return function achar(nome) {
      const k = N(nome);
      if (!k) return null;
      if (porNome.has(k)) return porNome.get(k);
      const t = tokens(nome);
      if (t.length < 2) return null;
      const achados = tk.filter(x => x.p === t[0] && t.every(p => x.t.has(p))).map(x => x.c);
      if (achados.length === 1) return achados[0];
      const ativos = achados.filter(ativo);
      return ativos.length === 1 ? ativos[0] : null;
    };
  }

  // Departamento/unidade mais comum entre as pessoas casadas de cada grupo (PDV ou loja).
  function maioria(pessoas) {
    const m = new Map();
    for (const p of pessoas) {
      if (!p.c || !p.c.departamento) continue;
      const k = p.c.unidade + '|' + p.c.departamento;
      const x = m.get(k) || { unidade: p.c.unidade, departamento: p.c.departamento, n: 0 };
      x.n++;
      m.set(k, x);
    }
    return Array.from(m.values()).sort((a, b) => b.n - a.n)[0] || null;
  }

  // Sem ninguém casado: compara o nome da loja com os departamentos do cadastro,
  // sem as palavras genéricas ("O Boticário Ipanema (MG)" ~ "O Boticário Ipanema").
  function porNomeDaLoja(nomeLoja, colaboradores, aceita, genericas) {
    const nucleo = s => tokens(s).filter(t => !genericas.has(t)).join(' ');
    const alvo = nucleo(nomeLoja);
    if (!alvo) return null;
    const vd = /\bvd\b/.test(N(nomeLoja));
    const achados = new Map();
    for (const c of colaboradores || []) {
      if (!c.departamento || !aceita(c)) continue;
      if (nucleo(c.departamento) !== alvo || /\bvd\b/.test(N(c.departamento)) !== vd) continue;
      achados.set(c.unidade + '|' + c.departamento, { unidade: c.unidade, departamento: c.departamento });
    }
    return achados.size === 1 ? Array.from(achados.values())[0] : null;
  }

  function abaPorCabecalho(wb, cabecalhos, rotulo) {
    for (const nome of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[nome], { defval: '', raw: true });
      if (!rows.length) continue;
      const idx = Object.keys(rows[0]).map(k => N(k));
      if (cabecalhos.every(c => idx.includes(N(c)))) return { nome, rows };
    }
    throw new Error(`Não encontrei a aba ${rotulo} (colunas ${cabecalhos.join(', ')}).`);
  }

  function leitor(row) {
    const idx = {};
    for (const k of Object.keys(row)) { const n = N(k); if (!(n in idx)) idx[n] = k; }
    return (...nomes) => {
      for (const n of nomes) { const k = idx[N(n)]; if (k !== undefined && row[k] !== '' && row[k] != null) return row[k]; }
      return '';
    };
  }

  const ehBoticario = c => /^(boticario|quem disse)/.test(N(c.unidade));
  const ehHering = c => /^hering/.test(N(c.unidade));

  // ------------------------------------------------------------------
  // 27.1 Unibê
  // ------------------------------------------------------------------
  function parseUnibe(wb, opts) {
    opts = opts || {};
    const colabs = opts.colaboradores || [];
    const achar = indiceColaboradores(colabs, ehBoticario);
    const abaPdv = abaPorCabecalho(wb, ['PDV', 'NOME PDV', 'ADESÃO ATUAL'], '"Visão Geral - PDV"');
    const abaPes = abaPorCabecalho(wb, ['NOME', 'CÓDIGO DE PDV', 'ADESÃO IAF'], '"Visão Geral - Pessoa"');
    const avisos = [];

    const pessoas = abaPes.rows.map(r => {
      const g = leitor(r);
      const nome = I.str(g('NOME'));
      return nome && {
        nome, cargo: I.str(g('CARGO')), pdv: I.str(g('CÓDIGO DE PDV')), nome_pdv: I.str(g('NOME PDV')),
        regiao: I.str(g('REGIÃO')), segmento: I.str(g('SEGMENTO')), adesao: fracao(g('ADESÃO IAF')), c: achar(nome)
      };
    }).filter(Boolean).map(p => Object.assign(p, { pdv: p.pdv && String(p.pdv).replace(/\.0+$/, '') }));

    const porPdv = new Map();
    for (const p of pessoas) { if (!porPdv.has(p.pdv)) porPdv.set(p.pdv, []); porPdv.get(p.pdv).push(p); }

    const semLoja = [];
    const genericas = new Set(['o', 'boticario', 'mg', '(mg)', 'vd']);
    const pdvs = abaPdv.rows.map(r => {
      const g = leitor(r);
      const pdv = I.str(g('PDV'));
      if (!pdv) return null;
      const codigo = String(pdv).replace(/\.0+$/, '');
      const nomePdv = I.str(g('NOME PDV'));
      const dele = porPdv.get(codigo) || [];
      const loc = maioria(dele) || porNomeDaLoja(nomePdv, colabs, ehBoticario, genericas);
      if (!loc) semLoja.push(nomePdv || codigo);
      // Gerente "SEGMENTO" é erro de preenchimento conhecido da planilha.
      const gerente = I.str(g('Gerente', 'GERENTE'));
      return {
        pdv: codigo, nome_pdv: nomePdv, regiao: I.str(g('REGIÃO')), segmento: I.str(g('SEGMENTO')),
        gerente: N(gerente) === 'segmento' ? null : gerente,
        supervisao: I.str(g('SUPERVISÃO')), multi: I.str(g('MULTI')), adesao: fracao(g('ADESÃO ATUAL')),
        pessoas: dele.length, unidade: loc ? loc.unidade : null, departamento: loc ? loc.departamento : null
      };
    }).filter(Boolean);
    if (!pdvs.length) throw new Error('A aba "Visão Geral - PDV" está vazia.');

    const locPdv = new Map(pdvs.map(p => [p.pdv, p]));
    const linhasPessoas = pessoas.map(p => {
      const loja = locPdv.get(p.pdv);
      return {
        nome: p.nome, cargo: p.cargo, pdv: p.pdv, nome_pdv: p.nome_pdv || (loja && loja.nome_pdv), regiao: p.regiao, segmento: p.segmento, adesao: p.adesao,
        unidade: p.c ? p.c.unidade : loja && loja.unidade, departamento: p.c ? p.c.departamento : loja && loja.departamento, no_cadastro: !!p.c,
        nome_cadastro: p.c ? p.c.nome_completo || p.c.nome : null
      };
    });

    const fora = pessoas.filter(p => !p.c).length;
    const semPdv = pessoas.filter(p => !locPdv.has(p.pdv)).length;
    if (semLoja.length) avisos.push(`${semLoja.length} PDV(s) sem loja correspondente no cadastro de Colaboradores (ficam fora do Boletim e só aparecem para quem vê tudo): ${semLoja.join('; ')}.`);
    if (fora) avisos.push(`${fora} de ${pessoas.length} pessoa(s) não foram achadas no cadastro de Colaboradores pelo nome; elas ficam na loja do PDV.`);
    if (semPdv) avisos.push(`${semPdv} pessoa(s) com código de PDV que não está na aba "Visão Geral - PDV".`);
    const vals = pdvs.map(p => p.adesao).filter(v => v != null);
    return {
      pdvs, pessoas: linhasPessoas, avisos,
      resumo: { pdvs: pdvs.length, pessoas: linhasPessoas.length, adesaoMedia: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null, noCadastro: pessoas.length - fora }
    };
  }

  // ------------------------------------------------------------------
  // 27.2 Academia Hering
  // ------------------------------------------------------------------
  function parseAcademia(wb, opts) {
    opts = opts || {};
    const colabs = opts.colaboradores || [];
    const achar = indiceColaboradores(colabs, ehHering);
    const aba = abaPorCabecalho(wb, ['Nome Completo', 'Loja', 'Horas de Treinamento', 'Performance'], 'da Academia Hering');
    // "Horas de Treinamento" pode vir como duração do Excel: lê também o texto formatado.
    const texto = XLSX.utils.sheet_to_json(wb.Sheets[aba.nome], { defval: '', raw: false });
    const pessoas = aba.rows.map((r, i) => {
      const g = leitor(r);
      const gt = leitor(texto[i] || {});
      const nome = I.str(g('Nome Completo'));
      if (!nome) return null;
      const ht = horas(gt('Horas de Treinamento'));
      const h = ht != null ? ht : horas(g('Horas de Treinamento'));
      return {
        nome: nome.replace(/\s+/g, ' ').trim(), cargo: I.str(g('Cargo')), loja: I.str(g('Loja')),
        ultimo_acesso: dataBR(g('Último Acesso')), horas: h, performance: I.num(g('Performance')), c: achar(nome)
      };
    }).filter(Boolean);
    if (!pessoas.length) throw new Error('A planilha da Academia Hering está vazia.');

    const porLoja = new Map();
    for (const p of pessoas) { if (!porLoja.has(p.loja)) porLoja.set(p.loja, []); porLoja.get(p.loja).push(p); }
    const genericas = new Set(['hering', 'store', 'mega', 'shopping', 'rua', 'avenida', 'av', '-']);
    const locLoja = new Map();
    const semLoja = [];
    for (const [loja, lista] of porLoja) {
      const loc = maioria(lista) || porNomeDaLoja(loja, colabs, ehHering, genericas);
      if (!loc) semLoja.push(loja);
      locLoja.set(loja, loc);
    }
    // Loja não achada: fica na unidade Hering mais comum do cadastro (nunca sem
    // unidade, para não aparecer a quem não tem a marca — ver supabase-treinamentos.sql).
    const contaHering = new Map();
    for (const c of colabs) if (ehHering(c)) contaHering.set(c.unidade, (contaHering.get(c.unidade) || 0) + 1);
    const unidadeHering = Array.from(contaHering.entries()).sort((a, b) => b[1] - a[1]).map(x => x[0])[0] || 'Hering';
    const linhas = pessoas.map(p => {
      const loc = locLoja.get(p.loja) || { unidade: unidadeHering, departamento: null };
      return {
        nome: p.nome, cargo: p.cargo, loja: p.loja, ultimo_acesso: p.ultimo_acesso, horas: p.horas, performance: p.performance,
        unidade: p.c ? p.c.unidade : loc && loc.unidade, departamento: p.c ? p.c.departamento : loc && loc.departamento, no_cadastro: !!p.c,
        nome_cadastro: p.c ? p.c.nome_completo || p.c.nome : null
      };
    });
    const avisos = [];
    const fora = pessoas.filter(p => !p.c).length;
    if (semLoja.length) avisos.push(`${semLoja.length} loja(s) sem departamento correspondente no cadastro de Colaboradores: ${semLoja.join('; ')}.`);
    if (fora) avisos.push(`${fora} de ${pessoas.length} pessoa(s) não foram achadas no cadastro de Colaboradores pelo nome; elas ficam na loja da planilha.`);
    const soma = (k) => linhas.reduce((s, l) => s + (l[k] || 0), 0);
    return {
      linhas, avisos,
      resumo: { pessoas: linhas.length, lojas: porLoja.size, horas: soma('horas'), performanceMedia: soma('performance') / linhas.length, noCadastro: pessoas.length - fora }
    };
  }

  window.HUB_PARSERS_TREINAMENTOS = { parseUnibe, parseAcademia, _internal: { dataBR, horas, fracao, indiceColaboradores } };
})();
