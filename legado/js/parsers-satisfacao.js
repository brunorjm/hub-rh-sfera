// Leitura da planilha "16. Base Pesquisa Feedz.xlsx" (aba "Worksheet"; o modelo
// antigo "61. Pesquisa de Satisfação", aba "Base Original", também é aceito)
// para o módulo Indicadores → Pesquisa de Satisfação. Gera uma linha por
// resposta × área avaliada, com nota, "O que melhorar?" e comentário — e SEM
// nome, CPF, e-mail, líder direto, data exata ou tempo de empresa (só o mês do
// ciclo e a loja/departamento de quem respondeu, que só a visão completa vê).
//
// As colunas de cada área são achadas por HUB_PARSERS_BOLETIM._internal.colunasSatisfacao
// (o mesmo upload alimenta também o agregado do Boletim da Liderança).
(function () {
  const I = HUB_PARSERS._internal;
  const B = HUB_PARSERS_BOLETIM._internal;
  const N = s => HUB_UTILS.normalizeText(s == null ? '' : s);

  // Tag do cadastro (coluna Grupos) de quem é convidado a responder.
  const TAG_APTOS = 'pesquisa.satisfacao';

  // "Tempo de resposta,Qualidade da solução," → ['Tempo de resposta', 'Qualidade da solução']
  function opcoes(v) {
    const vistos = new Set();
    return String(v == null ? '' : v).split(/[,;]/).map(s => s.replace(/\s+/g, ' ').trim()).filter(s => {
      if (!s || vistos.has(N(s))) return false;
      vistos.add(N(s));
      return true;
    });
  }
  function texto(v) {
    const s = I.str(v);
    return s ? s.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : null;
  }

  // Gestores aptos no fim do mês do ciclo: ativos naquela data e com a tag.
  // Mesma regra do Boletim (a tag é a do cadastro atual).
  function contarAptos(colaboradores, mesISO) {
    if (!colaboradores || !colaboradores.length) return null;
    const d = new Date(Number(mesISO.slice(0, 4)), Number(mesISO.slice(5, 7)), 0);
    const fim = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const iso = v => (v == null || v === '') ? null : String(v).slice(0, 10);
    let n = 0;
    for (const c of colaboradores) {
      if (!String(c.grupos || '').split(/[,;]/).some(g => N(g) === TAG_APTOS)) continue;
      const adm = iso(c.data_admissao);
      if (!adm || adm > fim) continue;
      if (N(c.situacao) === 'desligado' && (iso(c.ultimo_dia_trabalhado) || adm) <= fim) continue;
      n++;
    }
    return n;
  }

  // ------------------------------------------------------------------
  // Conferência da planilha. A base é montada colando exports do Feedz mês a
  // mês, e em out/2026 a 16 tinha erros de colagem que mudam as notas das áreas:
  // colunas de áreas trocadas (ago/26), bloco de um ciclo repetido em outro
  // (Suprimentos de jun/26 colado em ago/24) e resposta duplicada (jan/26).
  // Nada é corrigido aqui — só avisa no upload, para corrigir na planilha.
  // ------------------------------------------------------------------
  // Palavras que indicam de que área o comentário fala. Calibrado nos 26 ciclos
  // de ago/24 a set/26: nenhum alarme falso nos ciclos certos.
  const ASSUNTO = {
    'Financeiro': /financeir|pagamento|reembols|boleto|nota fiscal/,
    'Compras': /\bcompras?\b|pedido de (produto|mercadoria)|abastec|reposic/,
    'Recrutamento e Seleção': /recrut|vaga|candidat|selecao|contratac/,
    'DHO': /\bdho\b|engajament|clima|feedz|endomarketing/,
    'T&D': /treinament|twygo|capacitac|curso|unibe/,
    'DP': /\bdp\b|departamento pessoal|ponto|folha|ferias|holerite|rescis|beneficio/,
    'TI': /\bti\b|sistema|computador|internet|impressora|glpi|notebook|tecnologia/,
    'Manutenção': /manutenc|conserto|reparo|ar.condicionado|lampada|obra|infiltra/,
    'Auditoria': /auditor|inventario|contagem/,
    'Administrativo': /administrativ|malote|contrato|aluguel|correio/,
    'Marketing': /marketing|campanha|vitrine|instagram|cartaz|comunicac(ao)? visual/,
    'Jurídico': /juridic|advogad|trabalhista|notificac|processo judicial/,
    'Suprimentos Indiretos': /suprimento|sacola|insumo|material de (uso|limpeza|escritorio)/
  };
  const rotulo = m => ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(m.slice(5, 7)) - 1] + '/' + m.slice(2, 4);

  function validar(rows, colunas) {
    const avisos = [];
    const porCiclo = new Map();
    for (const row of rows) {
      const p = B.mesBR(row.PESQUISA != null ? row.PESQUISA : row.Pesquisa);
      if (!p) continue;
      if (!porCiclo.has(p)) porCiclo.set(p, []);
      porCiclo.get(p).push(row);
    }
    const ciclos = Array.from(porCiclo.keys()).sort();
    const val = v => v == null ? '' : String(v).replace(/\s+/g, ' ').trim();

    // 1. Respostas repetidas: mesma loja e mesmas notas, opções e comentários em todas as áreas.
    const rep = [];
    for (const p of ciclos) {
      const vistos = new Set();
      let n = 0;
      for (const r of porCiclo.get(p)) {
        const k = [val(r.Unidade), val(r.Departamento)].concat(colunas.flatMap(c => [val(r[c.k]), val(r[c.melhorar]), val(r[c.comentario])])).join('\u0001');
        if (vistos.has(k)) n++; else vistos.add(k);
      }
      if (n) rep.push(`${rotulo(p)} (${n})`);
    }
    if (rep.length) avisos.push(`Conferência: respostas repetidas (mesma loja, notas e comentários) em ${rep.join(', ')}. Confira se é colagem duplicada.`);

    // 2. Bloco de uma área idêntico ao de outro ciclo (colado no mês errado).
    for (const c of colunas) {
      const assinaturas = new Map();
      for (const p of ciclos) {
        const notas = porCiclo.get(p).map(r => [val(r[c.k]), val(r[c.melhorar]), val(r[c.comentario])].join('|')).filter(s => s !== '||');
        if (notas.length < 5) continue;
        const s = notas.join('\u0001');
        if (assinaturas.has(s)) avisos.push(`Conferência: as respostas de ${c.area} em ${rotulo(assinaturas.get(s))} e ${rotulo(p)} são idênticas, na mesma ordem — provável bloco colado no mês errado.`);
        else assinaturas.set(s, p);
      }
    }

    // 3. Comentários que falam de outra área: coluna trocada.
    const trocadas = new Map();
    for (const p of ciclos) {
      for (const c of colunas) {
        if (!c.comentario || !ASSUNTO[c.area]) continue;
        const cont = {};
        for (const r of porCiclo.get(p)) {
          const t = N(r[c.comentario]);
          if (!t) continue;
          for (const [a, re] of Object.entries(ASSUNTO)) if (re.test(t)) cont[a] = (cont[a] || 0) + 1;
        }
        const outra = Object.entries(cont).filter(([a]) => a !== c.area).sort((x, y) => y[1] - x[1])[0];
        if (!cont[c.area] && outra && outra[1] >= 3) {
          if (!trocadas.has(p)) trocadas.set(p, []);
          trocadas.get(p).push(`coluna ${c.area} fala de ${outra[0]}`);
        }
      }
    }
    for (const [p, l] of trocadas) avisos.push(`Conferência: em ${rotulo(p)} os comentários não batem com a área da coluna (${l.join('; ')}) — provável troca de colunas na colagem do Feedz.`);
    return avisos;
  }

  // opts.colaboradores: cadastro atual (HUB_DATA.colaboradores) para os aptos.
  function parse(wb, opts) {
    opts = opts || {};
    const rows = B.linhasSatisfacao(wb);
    const colunas = B.colunasSatisfacao(rows);
    if (!colunas.length) throw new Error('Não encontrei as colunas de nota das áreas ("Financeiro - 0 a 10", "Pergunta: Sobre o setor ...").');
    const linhas = [];
    const ciclos = new Map();
    let ignoradas = 0, foraDaEscala = 0;
    for (const row of rows) {
      const pesquisa = B.mesBR(row.PESQUISA != null ? row.PESQUISA : row.Pesquisa);
      if (!pesquisa) { ignoradas++; continue; }
      const unidade = B.txt(row.Unidade), departamento = B.txt(row.Departamento);
      if (!ciclos.has(pesquisa)) ciclos.set(pesquisa, { pesquisa, respondentes: 0, areas: new Set() });
      const ciclo = ciclos.get(pesquisa);
      ciclo.respondentes++;
      for (const c of colunas) {
        let nota = I.num(row[c.k]);
        if (nota != null && (nota < 0 || nota > 10)) { foraDaEscala++; nota = null; }
        const melhorar = c.melhorar ? opcoes(row[c.melhorar]) : [];
        const comentario = c.comentario ? texto(row[c.comentario]) : null;
        if (nota == null && !melhorar.length && !comentario) continue;   // área fora do formulário neste ciclo
        // Compras vira "Compras O Boticário" ou "Compras Hering e Levis" pela operação de quem respondeu.
        const area = B.areaDaResposta(c.area, unidade, departamento);
        linhas.push({ pesquisa, unidade, departamento, area, nota, melhorar, extra: c.extra ? texto(row[c.extra]) : null, comentario });
        ciclo.areas.add(area);
      }
    }
    if (!linhas.length) throw new Error('Não encontrei respostas com a coluna PESQUISA preenchida.');
    const lista = Array.from(ciclos.values()).sort((a, b) => a.pesquisa.localeCompare(b.pesquisa))
      .map(c => ({ pesquisa: c.pesquisa, respondentes: c.respondentes, areas: Array.from(c.areas), aptos: contarAptos(opts.colaboradores, c.pesquisa) }));
    const avisos = [];
    if (ignoradas) avisos.push(`${ignoradas} linha(s) sem a data da PESQUISA foram ignoradas.`);
    if (foraDaEscala) avisos.push(`${foraDaEscala} nota(s) fora da escala de 0 a 10 foram ignoradas.`);
    const sem = colunas.filter(c => c.semCabecalho).map(c => c.area);
    if (sem.length) avisos.push(`Colunas de nota sem título no fim da planilha lidas como: ${sem.join(', ')}. Coloque o título na planilha (ex.: "SUPRIMENTOS INDIRETOS - 0 a 10") para não depender disso.`);
    if (!opts.colaboradores || !opts.colaboradores.length) avisos.push('Cadastro de colaboradores não carregado: a participação (gestores aptos) ficou sem base nesta importação.');
    const semOp = linhas.filter(l => /operação não identificada/.test(l.area)).length;
    if (semOp) avisos.push(`${semOp} avaliação(ões) de Compras de quem não é de loja/área O Boticário, Hering ou Levi's ficaram como "Compras (operação não identificada)".`);
    const conferencia = validar(rows, colunas);
    return {
      linhas, ciclos: lista, avisos: avisos.concat(conferencia), conferencia,
      resumo: { inicio: lista[0].pesquisa, fim: lista[lista.length - 1].pesquisa, respondentes: lista.reduce((s, c) => s + c.respondentes, 0), areas: Array.from(new Set(linhas.map(l => l.area))) }
    };
  }

  window.HUB_PARSERS_SATISFACAO = { parse, contarAptos, TAG_APTOS, _internal: { opcoes, texto } };
})();
