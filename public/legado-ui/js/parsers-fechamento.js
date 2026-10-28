// Leitura da planilha 18. Controle Geral de Vagas.xlsx (time de R&S) para o
// Fechamento do Período. Enquanto o módulo Recrutamento do Hub não é
// homologado, a planilha é a fonte oficial das vagas: o upload substitui a
// base inteira (tabela controle_vagas, ver supabase-fechamento-vagas.sql).
//
// Só a aba "CTRL GERAL" é lida (as outras abas são recortes dela ou bases de
// candidatos). Ficam de fora os campos com nome de pessoa (contratado,
// substituído, finalistas, quem indicou, solicitante) e a OBSERVAÇÃO, que
// traz nome e situação de candidatos. Em vaga sigilosa o cargo também não é
// gravado.
(function () {
  const P = window.HUB_PARSERS;
  const { normHeader, toISODate, num, str } = P._internal;

  const ASSINATURA = ['DATA DE ABERTURA', 'STATUS DA VAGA', 'TIPO DA VAGA', 'UNIDADE', 'DATA DE FECHAMENTO'];

  function acharAba(wb) {
    const nomes = wb.SheetNames.slice().sort((a, b) => (normHeader(b) === 'ctrl geral') - (normHeader(a) === 'ctrl geral'));
    for (const nome of nomes) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[nome], { defval: '', raw: true });
      if (!rows.length) continue;
      const cab = new Set(Object.keys(rows[0]).map(normHeader));
      if (ASSINATURA.every(h => cab.has(normHeader(h)))) return { nome, rows };
    }
    return null;
  }

  // Mesma fonte escrita de jeitos diferentes ("InfoJobs"/"Infojobs",
  // "Banco de Talentos " com espaço) vira uma só: vale a grafia mais usada.
  function chaveTexto(s) {
    return String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  function unificador(valores) {
    const cont = {};
    for (const v of valores) {
      if (!v) continue;
      const k = chaveTexto(v);
      cont[k] = cont[k] || {};
      cont[k][v] = (cont[k][v] || 0) + 1;
    }
    const canon = {};
    for (const k of Object.keys(cont)) canon[k] = Object.entries(cont[k]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    return v => (v ? canon[chaveTexto(v)] : null);
  }

  function simNao(v) {
    const s = chaveTexto(v == null ? '' : v);
    return s === 'sim' ? true : s === 'nao' ? false : null;
  }

  function parse(wb) {
    const aba = acharAba(wb);
    if (!aba) throw new Error('Não encontrei a aba "CTRL GERAL" (colunas DATA DE ABERTURA, STATUS DA VAGA, TIPO DA VAGA, UNIDADE e DATA DE FECHAMENTO). Confira se é a planilha 18. Controle Geral de Vagas.');

    const brutas = aba.rows.map((row, i) => {
      const idx = {};
      for (const k of Object.keys(row)) { const n = normHeader(k); if (!(n in idx)) idx[n] = k; }
      const g = h => { const k = idx[normHeader(h)]; return k === undefined ? null : row[k]; };
      const sigilosa = simNao(g('VAGA SIGILOSA?'));
      return {
        linha: i + 2,
        data_abertura: toISODate(g('DATA DE ABERTURA')),
        data_fechamento: toISODate(g('DATA DE FECHAMENTO')),
        data_inicio: toISODate(g('DATA DE INÍCIO')),
        data_cancelamento: toISODate(g('DATA DO CANCELAMENTO')),
        data_congelamento: toISODate(g('DATA DO CONGELAMENTO')),
        data_retorno: toISODate(g('DATA DO RETORNO')),
        dias_congelada: num(g('DIAS CONGELADA')),
        sla_dias_planilha: num(g('SLA')),
        status_sla_planilha: str(g('Status SLA')),
        motivo_sla: str(g('Motivo SLA')),
        unidade: str(g('UNIDADE')) || str(g('MARCA')),
        departamento: str(g('DEPARTAMENTO')),
        cargo: sigilosa ? null : str(g('CARGO')),
        sigilosa: sigilosa === true,
        tipo_vaga: str(g('TIPO DA VAGA')),
        responsavel: str(g('RESPONSÁVEL')),
        status_vaga: str(g('STATUS DA VAGA')),
        natureza: str(g('TIPO DA VAGA_1')),
        motivo_aumento_quadro: str(g('MOTIVO AUMENTO DE QUADRO')),
        tipo_recrutamento: str(g('TIPO DE RECRUTAMENTO')),
        etapa_vaga: str(g('ETAPA DA VAGA')),
        fit: num(g('%FIT')),
        fonte: str(g('FONTE'))
      };
    }).filter(r => r.data_abertura && (r.status_vaga || r.tipo_vaga));

    if (!brutas.length) throw new Error('A aba "' + aba.nome + '" não tem nenhuma vaga com DATA DE ABERTURA preenchida.');

    const uni = {
      fonte: unificador(brutas.map(r => r.fonte)),
      status_vaga: unificador(brutas.map(r => r.status_vaga)),
      tipo_vaga: unificador(brutas.map(r => r.tipo_vaga)),
      natureza: unificador(brutas.map(r => r.natureza)),
      etapa_vaga: unificador(brutas.map(r => r.etapa_vaga)),
      tipo_recrutamento: unificador(brutas.map(r => r.tipo_recrutamento))
    };
    const linhas = brutas.map(r => {
      const o = Object.assign({}, r);
      for (const k of Object.keys(uni)) o[k] = uni[k](r[k]);
      // %FIT vem como 0,8 (formato %) ou 80 (número): guarda sempre 0–1.
      if (o.fit != null && o.fit > 1) o.fit = o.fit / 100;
      return o;
    });

    return { aba: aba.nome, linhas, avisos: conferir(linhas) };
  }

  // Inconsistências de preenchimento que mudam os números do Fechamento.
  function conferir(linhas) {
    const avisos = [];
    const n = (filtro, texto) => { const q = linhas.filter(filtro).length; if (q) avisos.push(texto.replace('#', q)); };
    n(r => r.status_vaga === 'Finalizada' && !r.data_fechamento, '# vaga(s) Finalizada(s) sem DATA DE FECHAMENTO — ficam fora das vagas fechadas.');
    n(r => r.status_vaga === 'Cancelada' && !r.data_cancelamento, '# vaga(s) Cancelada(s) sem DATA DO CANCELAMENTO — não dá para saber em que mês foram canceladas.');
    // Vaga fechada = tem DATA DE FECHAMENTO (critério do RH): status que não combina com isso entra assim mesmo, mas avisa.
    n(r => r.status_vaga === 'Aberta' && r.data_fechamento, '# vaga(s) com status Aberta e DATA DE FECHAMENTO preenchida — entram como fechadas.');
    n(r => r.status_vaga === 'Cancelada' && r.data_fechamento, '# vaga(s) Cancelada(s) com DATA DE FECHAMENTO preenchida — entram como fechadas.');
    n(r => r.data_fechamento && r.data_fechamento < r.data_abertura, '# vaga(s) com DATA DE FECHAMENTO antes da DATA DE ABERTURA.');
    n(r => r.data_fechamento && !r.fonte && r.data_fechamento >= '2026-01-01', '# vaga(s) fechada(s) em 2026 sem FONTE.');
    return avisos;
  }

  window.HUB_PARSERS_FECHAMENTO = { parse, _internal: { unificador, chaveTexto } };
})();
