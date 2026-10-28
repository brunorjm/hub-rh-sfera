// Indicadores → Avaliação da Experiência → aba "Extra Natal": acompanhamento
// do período de experiência dos contratados de Extra Natal (tag
// "extra.natal.AAAA" nos Grupos do Headcount). O período deles não segue os
// 45/90 dias da admissão: as datas vêm do calendário do DP (planilha
// calendario_extranatal_AAAA.xlsx), em que cada faixa de admissão tem um
// PRAZO DE ENTREGA da avaliação (colunas E e I) e um FIM DO PERÍODO de
// experiência (colunas F e J — quando o gestor responde ao DP se fica com o
// colaborador). A liberação no Feedz é manual e deve acontecer 7 dias antes
// do prazo de entrega; as respostas chegam pelas mesmas planilhas AVE 45 DIAS
// (1º período) e AVE 90 DIAS (prorrogação). Quem foi admitido em setembro é
// Extra Natal, mas segue os prazos normais (dia 40/45 e 85/90 da admissão).
(function () {
  const U = HUB_UTILS;
  const M = HUB_EXP_METRICS;
  const { kpi, empty, card } = HUB_UI;
  const esc = U.escapeHtml;
  const pct = v => U.fmtPct(v, 0);

  // Calendário por ano. Cada faixa: [admissão até, fim da 1ª experiência, fim
  // da prorrogação]. Dia sem linha na planilha (domingo/feriado) cai na faixa
  // do dia útil seguinte. "evitar" = admissões que a planilha marca como
  // EVITAR (experiência curta).
  const CALENDARIOS = {
    2026: {
      faixas: [
        ['2026-10-17', '2026-11-14', '2026-12-31'],
        ['2026-10-31', '2026-11-29', '2026-12-31'],
        ['2026-11-16', '2026-11-29', '2027-01-31'],
        ['2026-12-24', '2026-12-31', '2027-01-31'],
        ['2026-12-31', '2027-01-31', '2027-02-21']
      ],
      evitar: [['2026-10-13', '2026-10-17'], ['2026-11-11', '2026-11-16'], ['2026-12-12', '2026-12-17'], ['2026-12-26', '2026-12-31']]
    }
  };
  const ENTREGA_ANTES = 6;  // prazo de entrega = 6 dias antes do fim do período (colunas E/I x F/J)
  const LIBERAR_ANTES = 7;  // liberar no Feedz 7 dias antes do prazo de entrega

  // Datas dos dois períodos. Setembro (antes de outubro) = regra normal.
  function periodos(ano, adm) {
    if (!adm) return null;
    if (adm < `${ano}-10-01`) {
      return { regra: 'normal', prazo1: U.addDays(adm, 40), fim1: U.addDays(adm, 45), prazo2: U.addDays(adm, 85), fim2: U.addDays(adm, 90), evitar: false };
    }
    const c = CALENDARIOS[ano];
    const fx = c && c.faixas.find(x => adm <= x[0]);
    if (!fx) return null;
    return {
      regra: 'calendario', prazo1: U.addDays(fx[1], -ENTREGA_ANTES), fim1: fx[1], prazo2: U.addDays(fx[2], -ENTREGA_ANTES), fim2: fx[2],
      evitar: c.evitar.some(e => adm >= e[0] && adm <= e[1])
    };
  }

  const norm = s => U.normalizeText(s || '');
  const dias = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);
  const media = arr => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);

  function anosDisponiveis() {
    const set = new Set(Object.keys(CALENDARIOS).map(Number));
    for (const c of (window.HUB_DATA && window.HUB_DATA.colaboradores) || []) for (const a of M.anosNatal(c.grupos)) set.add(a);
    return Array.from(set).sort((a, b) => b - a);
  }

  // Situação de cada período. "row" = linha da AVE (45 ou 90) do colaborador:
  // só existe depois que a avaliação é liberada no Feedz e a planilha sobe.
  function etapa(row, prazo, fim, hoje, saida) {
    const lib = prazo ? U.addDays(prazo, -LIBERAR_ANTES) : null;
    const e = { row, lib, prazo, fim, sit: null, dias: null, martelo: row ? row.martelo : null, nota: null, data: row ? row.data_avaliacao : null };
    if (row) e.nota = media(M.CORE.map(c => (row.notas_gestor || {})[c]).filter(v => v >= 1 && v <= 4));
    if (row && row.status_gestor === 'concluida') {
      e.sit = !prazo || !e.data || e.data <= prazo ? 'concluida' : e.data <= fim ? 'concluida_atraso' : 'concluida_fora';
      return e;
    }
    if (saida) { e.sit = lib && saida < lib ? 'saiu_antes' : 'saiu_sem'; return e; }
    if (!prazo) { e.sit = row ? 'em_andamento' : 'sem_calendario'; return e; }
    if (hoje > fim) { e.sit = row ? 'vencida' : 'vencida_nao_liberada'; e.dias = dias(fim, hoje); return e; }
    if (hoje > prazo) { e.sit = row ? 'atrasada' : 'atrasada_nao_liberada'; e.dias = dias(prazo, hoje); return e; }
    if (row) { e.sit = 'em_andamento'; e.dias = dias(hoje, prazo); return e; }
    if (hoje < lib) { e.sit = 'aguardando'; e.dias = dias(hoje, lib); return e; }
    e.sit = 'liberar'; e.dias = dias(hoje, prazo);
    return e;
  }

  function tipoDeslig(t) {
    const n = norm(t);
    if (n.startsWith('involunt')) return 'Involuntário';
    if (n.startsWith('volunt')) return 'Voluntário';
    return 'Não informado';
  }

  // ------------------------------------------------------------------
  // Reposição após o Extra Natal: vagas de substituição (Controle de Vagas)
  // abertas na MESMA LOJA e MESMA FAMÍLIA DE CARGO em até 60 dias depois da
  // saída. A vaga não registra quem foi substituído, então o vínculo é por
  // loja + cargo + data; cada vaga conta para um desligado só.
  // ------------------------------------------------------------------
  const JANELA_REPOSICAO = 60;
  let vagasCache = null, vagasErro = null, vagasPromise = null;
  function carregarVagas() {
    if (vagasCache) return Promise.resolve(vagasCache);
    if (vagasPromise) return vagasPromise;
    vagasPromise = (async () => {
      const all = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await window.sb.from('vagas').select('id,data_abertura,unidade,departamento,cargo,status,tipo_movimentacao').order('id', { ascending: true }).range(de, de + 999);
        if (error) throw error;
        all.push(...data);
        if (data.length < 1000) break;
      }
      vagasCache = all.map(r => ({ id: r.id, abertura: r.data_abertura ? String(r.data_abertura).slice(0, 10) : null, loja: r.departamento, cargo: r.cargo, status: r.status, tipo: r.tipo_movimentacao }));
      return vagasCache;
    })().catch(err => { vagasErro = err.message || 'erro'; vagasPromise = null; return null; });
    return vagasPromise;
  }

  // Família do cargo: "Consultor(a) de Vendas" = "Consultor De Vendas",
  // "Vendedor(a) Hering" = "Vendedor", "Caixa Hering" = "Caixa".
  function familiaCargo(c) {
    return norm(c).replace(/\((?:a|as|o)\)/g, '').replace(/[^a-z0-9]+/g, ' ')
      .replace(/\b(o boticario|boticario|hering|levi s|levis|quem disse berenice)\b/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function aplicarReposicao(rows, vagas) {
    const porLoja = new Map();
    for (const v of vagas) {
      if (!v.abertura || !v.loja || !norm(v.tipo).startsWith('substitui') || norm(v.status) === 'cancelada') continue;
      const k = norm(v.loja);
      if (!porLoja.has(k)) porLoja.set(k, []);
      porLoja.get(k).push({ v, fam: familiaCargo(v.cargo), usadaCargo: false, usadaLoja: false });
    }
    for (const l of porLoja.values()) l.sort((a, b) => a.v.abertura.localeCompare(b.v.abertura));
    const des = rows.filter(r => r.desligado && r.saida && r.departamento).sort((a, b) => a.saida.localeCompare(b.saida));
    for (const r of des) {
      const lista = porLoja.get(norm(r.departamento)) || [];
      const limite = U.addDays(r.saida, JANELA_REPOSICAO), fam = familiaCargo(r.cargo);
      const naJanela = x => x.v.abertura >= r.saida && x.v.abertura <= limite;
      const x = lista.find(x => !x.usadaCargo && x.fam === fam && naJanela(x));
      if (x) { x.usadaCargo = true; r.reposicao = { id: x.v.id, abertura: x.v.abertura, cargo: x.v.cargo, dias: dias(r.saida, x.v.abertura) }; }
      const y = lista.find(y => !y.usadaLoja && naJanela(y));
      if (y) { y.usadaLoja = true; r.reposicaoLoja = true; }
    }
  }

  function montar(ano, f, vagas) {
    const hoje = U.todayISO();
    const ini = `${ano}-08-01`, fimJanela = `${ano + 1}-02-28`;
    const naJanela = d => !!d && d >= ini && d <= fimJanela;
    const idx = rows => {
      const m = new Map();
      const add = (k, r) => { if (!m.has(k)) m.set(k, []); m.get(k).push(r); };
      for (const r of rows || []) {
        if (r.cpf != null && String(r.cpf).trim()) add('c:' + String(r.cpf).trim(), r);
        const n = norm(r.nome); if (n) add('n:' + n, r);
      }
      return m;
    };
    const i45 = idx(window.HUB_EXPERIENCIA_DATA[45]), i90 = idx(window.HUB_EXPERIENCIA_DATA[90]);
    const achar = (m, c, admHC) => {
      const cand = (c.cpf && String(c.cpf).trim() && m.get('c:' + String(c.cpf).trim())) || m.get('n:' + norm(c.nome_completo || c.nome)) || [];
      const adm = r => String(r.data_admissao || '').slice(0, 10);
      return cand.find(r => admHC && adm(r) === admHC) || cand.find(r => naJanela(adm(r))) || null;
    };
    const out = [];
    for (const c of (window.HUB_DATA && window.HUB_DATA.colaboradores) || []) {
      if (!M.anosNatal(c.grupos).includes(ano)) continue;
      if (f) {
        if (!U.matchesAny(c.unidade, f.unidade) || !U.matchesAny(c.departamento, f.departamento)) continue;
        if (f.gestor && !U.normIncludes(c.gestor_direto, f.gestor)) continue;
        if (f.colaborador && !U.normIncludes(c.nome_completo || c.nome, f.colaborador)) continue;
      }
      const admHC = c.data_admissao ? String(c.data_admissao).slice(0, 10) : null;
      const admOk = naJanela(admHC) ? admHC : null;
      const r45 = achar(i45, c, admOk), r90 = achar(i90, c, admOk);
      const adm = admOk || [r45, r90].filter(Boolean).map(r => String(r.data_admissao || '').slice(0, 10)).find(naJanela) || null;
      const sit = norm(c.situacao);
      const saidaHC = c.ultimo_dia_trabalhado ? String(c.ultimo_dia_trabalhado).slice(0, 10) : null;
      // Recontratado depois da temporada: a situação/saída atual do Headcount não é a do contrato de Natal.
      const desligado = sit === 'desligado' && !!admOk;
      const p = periodos(ano, adm) || {};
      const e1 = etapa(r45, p.prazo1 || null, p.fim1 || null, hoje, desligado ? (saidaHC || hoje) : null);
      const e2 = etapa(r90, p.prazo2 || null, p.fim2 || null, hoje, desligado ? (saidaHC || hoje) : null);
      // Fim da experiência do contrato de Natal; sem calendário (histórico), o fim da temporada.
      const fimRef = p.fim2 || fimJanela;
      const ultima = FEITAS.includes(e2.sit) ? e2 : FEITAS.includes(e1.sit) ? e1 : null;
      out.push({
        nome: c.nome_completo || c.nome, cargo: c.cargo || 'Não informado', unidade: c.unidade || 'Não informado', departamento: c.departamento,
        gestor: c.gestor_direto || 'Não informado', adm, situacao: admOk ? sit : null, saida: desligado ? saidaHC : null,
        regra: p.regra || null, evitar: !!p.evitar, e1, e2, fimRef,
        desligado, tipoDeslig: desligado ? tipoDeslig(c.desligamento_tipo) : null, tipoDesligTxt: desligado ? (c.desligamento_tipo || '') : '',
        motivo: desligado ? (c.desligamento_motivo || 'Não informado') : null,
        momento: !desligado || !saidaHC ? null : (p.fim1 && saidaHC <= p.fim1 ? '1º período' : p.fim2 && saidaHC <= p.fim2 ? 'Prorrogação' : saidaHC <= fimRef ? 'Durante a temporada' : 'Após a experiência'),
        // Aproveitado = seguiu na empresa depois do fim da experiência de Natal (só dá para dizer quando ela já acabou).
        encerrado: fimRef < hoje, aproveitado: fimRef < hoje && (!desligado || (!!saidaHC && saidaHC > fimRef)),
        ultimoMartelo: ultima ? ultima.martelo : null
      });
    }
    if (vagas) aplicarReposicao(out, vagas);
    return out;
  }

  const SIT = {
    liberar: ['#d03b3b', 'Liberar no Feedz'], aguardando: ['#8A8F98', 'Aguardando liberação'], em_andamento: ['#eda100', 'Liberada — sem resposta'],
    atrasada: ['#e5533d', 'Atrasada — sem resposta'], atrasada_nao_liberada: ['#d03b3b', 'Atrasada — não liberada'],
    concluida: ['#1baf7a', 'Entregue no prazo'], concluida_atraso: ['#6cbf6c', 'Entregue após o prazo'], concluida_fora: ['#f29a3d', 'Entregue após o fim do período'],
    vencida: ['#9b1c1c', 'Vencida — sem resposta'], vencida_nao_liberada: ['#9b1c1c', 'Vencida — não liberada'],
    saiu_antes: ['#8A8F98', 'Saiu antes da liberação'], saiu_sem: ['#e5533d', 'Desligado sem avaliação'], sem_calendario: ['#C9D0DA', 'Sem calendário']
  };
  const FEITAS = ['concluida', 'concluida_atraso', 'concluida_fora'];
  const ATRASADAS = ['atrasada', 'atrasada_nao_liberada'];
  const VENCIDAS = ['vencida', 'vencida_nao_liberada'];
  const A_LIBERAR = ['liberar', 'atrasada_nao_liberada'];

  function pillEtapa(e) {
    const [cor, txt] = SIT[e.sit] || SIT.sem_calendario;
    let extra = '';
    if (e.sit === 'aguardando') extra = ` · liberar em ${e.dias}d`;
    else if (e.sit === 'liberar' || e.sit === 'em_andamento') extra = e.dias === null ? '' : ` · entrega em ${e.dias}d`;
    else if (ATRASADAS.includes(e.sit) || VENCIDAS.includes(e.sit)) extra = ` · há ${e.dias}d`;
    return `<span class="ave-pill" style="--c:${cor}">${txt}${extra}</span>`;
  }
  function celEtapa(e) {
    const datas = e.prazo ? `<div style="font-size:10.5px;color:var(--muted)" title="Liberar no Feedz até ${U.fmtDateBR(e.lib)} (7 dias antes do prazo de entrega)">entregar até ${U.fmtDateBR(e.prazo)} · fim do período ${U.fmtDateBR(e.fim)}</div>` : '';
    const res = FEITAS.includes(e.sit)
      ? `<div style="font-size:10.5px;margin-top:2px">${e.martelo ? `<b style="color:${M.CORES_MARTELO[e.martelo]}">${esc(M.MARTELO_CURTO[e.martelo])}</b>` : 'Sem decisão'}${e.nota === null ? '' : ` · nota ${U.fmt1(e.nota)}`}${e.data ? ` · ${U.fmtDateBR(e.data)}` : ''}</div>` : '';
    return `<td>${pillEtapa(e)}${datas}${res}</td>`;
  }

  const estado = { ano: null, busca: '', filtro: 'todos' };
  const algum = (r, fn) => fn(r.e1) || fn(r.e2);
  const aprovadoDesligado = r => r.desligado && r.tipoDeslig === 'Involuntário' && r.ultimoMartelo >= 3;
  const FILTROS = {
    todos: ['Situação: todas', () => true],
    liberar: ['Liberar no Feedz agora', r => algum(r, e => A_LIBERAR.includes(e.sit))],
    proximas: ['Liberam nos próximos 7 dias', r => algum(r, e => e.sit === 'aguardando' && e.dias <= 7)],
    andamento: ['Liberadas — sem resposta do gestor', r => algum(r, e => e.sit === 'em_andamento' || e.sit === 'atrasada')],
    atrasadas: ['Atrasadas (prazo de entrega vencido)', r => algum(r, e => ATRASADAS.includes(e.sit))],
    vencidas: ['Vencidas (período encerrado)', r => algum(r, e => VENCIDAS.includes(e.sit))],
    concluidas: ['Com avaliação entregue', r => algum(r, e => FEITAS.includes(e.sit))],
    desl_vol: ['Desligados — voluntário', r => r.tipoDeslig === 'Voluntário'],
    desl_inv: ['Desligados — involuntário', r => r.tipoDeslig === 'Involuntário'],
    aprov_desl: ['Aprovados na avaliação e desligados pela empresa', aprovadoDesligado],
    reposicao: ['Desligados com vaga de reposição aberta em seguida', r => !!r.reposicao],
    deslig: ['Desligados sem avaliação', r => r.desligado && !algum(r, e => FEITAS.includes(e.sit))],
    evitar: ['Admissão em data a evitar', r => r.evitar]
  };

  function resumoEtapa(rows, k) {
    const es = rows.map(r => r[k]);
    const n = arr => es.filter(e => arr.includes(e.sit)).length;
    const feitas = es.filter(e => FEITAS.includes(e.sit));
    const dec = feitas.filter(e => e.martelo >= 1 && e.martelo <= 4);
    const base = es.filter(e => !['aguardando', 'liberar', 'saiu_antes', 'sem_calendario'].includes(e.sit)).length;
    return {
      liberar: n(A_LIBERAR), aguardando: n(['aguardando']), andamento: n(['em_andamento', 'atrasada']), atrasadas: n(ATRASADAS), vencidas: n(VENCIDAS),
      feitas: feitas.length, noPrazo: n(['concluida']), base, taxa: base ? feitas.length / base : null,
      aprov: dec.filter(e => e.martelo >= 3).length, reprov: dec.filter(e => e.martelo <= 2).length, decididos: dec.length,
      nota: media(feitas.map(e => e.nota).filter(v => v !== null))
    };
  }

  // Desligamentos e aproveitamento de um grupo de contratados.
  function resumoDeslig(rs) {
    const d = rs.filter(r => r.desligado);
    const enc = rs.filter(r => r.encerrado);
    return {
      total: rs.length, deslig: d.length,
      vol: d.filter(r => r.tipoDeslig === 'Voluntário').length, inv: d.filter(r => r.tipoDeslig === 'Involuntário').length,
      encerrados: enc.length, aproveitados: enc.filter(r => r.aproveitado).length,
      taxaAprov: enc.length ? enc.filter(r => r.aproveitado).length / enc.length : null,
      aprovDeslig: rs.filter(aprovadoDesligado).length,
      semAval: d.filter(r => !algum(r, e => FEITAS.includes(e.sit))).length
    };
  }
  function contar(rs, fn) {
    const m = new Map();
    for (const r of rs) { const k = fn(r); if (k == null) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
    return Array.from(m.entries());
  }

  function exportar(rows, ano) {
    const cab = ['Colaborador', 'Situação', 'Cargo', 'Unidade', 'Departamento', 'Gestor', 'Admissão', 'Regra de prazo', 'Data a evitar', 'Saída',
      'Desligamento — tipo', 'Desligamento — motivo', 'Momento da saída', 'Aproveitado após a experiência', 'Vaga de reposição (mesma loja e cargo, até 60 dias)', 'Vaga aberta em', 'Dias após a saída',
      '1º período — liberar até', '1º período — entregar até', '1º período — fim do período', '1º período — situação', '1º período — avaliado em', '1º período — Batendo o Martelo', '1º período — nota gestor',
      '2º período — liberar até', '2º período — entregar até', '2º período — fim do período', '2º período — situação', '2º período — avaliado em', '2º período — Batendo o Martelo', '2º período — nota gestor'];
    const cel = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const et = e => [e.lib, e.prazo, e.fim, (SIT[e.sit] || [])[1], e.data, e.martelo ? M.MARTELO[e.martelo] : '', e.nota === null ? '' : e.nota.toFixed(2).replace('.', ',')];
    const linhas = rows.map(r => [r.nome, r.situacao ? M.SITUACOES[r.situacao] || r.situacao : '', r.cargo, r.unidade, r.departamento, r.gestor, r.adm,
      r.regra === 'normal' ? 'Normal (admissão em setembro)' : r.regra === 'calendario' ? 'Calendário Extra Natal' : '', r.evitar ? 'Sim' : '', r.saida,
      r.tipoDesligTxt, r.motivo, r.momento, r.encerrado ? (r.aproveitado ? 'Sim' : 'Não') : 'Em experiência',
      r.reposicao ? r.reposicao.id : '', r.reposicao ? r.reposicao.abertura : '', r.reposicao ? r.reposicao.dias : '']
      .concat(et(r.e1)).concat(et(r.e2)).map(cel).join(';'));
    const blob = new Blob(['﻿' + [cab.map(cel).join(';')].concat(linhas).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `avaliacao-experiencia-extra-natal-${ano}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const SUB = 'font-size:11.5px;color:var(--muted)';
  const zero = '<span style="color:var(--muted)">0</span>';
  const forte = (n, cor) => (n ? `<b style="color:${cor || 'var(--critical)'}">${U.fmtInt(n)}</b>` : zero);

  function blocoDesligamentos(rows, ano) {
    const g = resumoDeslig(rows);
    const d = rows.filter(r => r.desligado);
    if (!d.length) return card('Desligamentos e aproveitamento', '&#128682;', empty(`Nenhum desligamento entre os contratados do Extra Natal ${ano}.`));
    const p = (n, t) => (t ? pct(n / t) : '—');
    const kpis = `<div class="kpi-grid">
      ${kpi('Desligados', U.fmtInt(g.deslig), `${p(g.deslig, g.total)} dos ${U.fmtInt(g.total)} contratados`, 'var(--critical)')}
      ${kpi('Involuntários (decisão da empresa)', U.fmtInt(g.inv), `${p(g.inv, g.deslig)} dos desligamentos`, '#9b1c1c')}
      ${kpi('Voluntários (pedido do colaborador)', U.fmtInt(g.vol), `${p(g.vol, g.deslig)} dos desligamentos`, '#eb6834')}
      ${kpi('Taxa de aproveitamento', g.taxaAprov === null ? '—' : pct(g.taxaAprov), g.encerrados ? `${U.fmtInt(g.aproveitados)} de ${U.fmtInt(g.encerrados)} seguiram após o fim da experiência` : 'experiência ainda em andamento', '#1baf7a')}
      ${kpi('Aprovados e desligados pela empresa', U.fmtInt(g.aprovDeslig), 'aprovados pelo gestor na última avaliação e desligados involuntariamente', g.aprovDeslig ? 'var(--critical)' : '#1baf7a')}
      ${kpi('Desligados sem avaliação', U.fmtInt(g.semAval), `${p(g.semAval, g.deslig)} dos desligados saíram sem registro avaliativo`, g.semAval ? '#eda100' : '#1baf7a')}
    </div>`;
    const tab = (cab, linhas) => `<div class="table-wrap"><table class="dt"><thead><tr>${cab.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${linhas.join('')}</tbody></table></div>`;
    const cols = rs => { const v = rs.filter(r => r.tipoDeslig === 'Voluntário').length, i = rs.filter(r => r.tipoDeslig === 'Involuntário').length; return `<td><b>${U.fmtInt(rs.length)}</b></td><td>${i ? U.fmtInt(i) : zero}</td><td>${v ? U.fmtInt(v) : zero}</td>`; };
    const cab3 = ['Desligados', 'Involuntário', 'Voluntário'];
    const motivos = contar(d, r => r.motivo).sort((a, b) => b[1].length - a[1].length).slice(0, 10).map(([k, rs]) => `<tr><td>${esc(k)}</td>${cols(rs)}</tr>`);
    const meses = contar(d, r => (r.saida ? r.saida.slice(0, 7) : 'Sem data')).sort((a, b) => a[0].localeCompare(b[0])).map(([k, rs]) => `<tr><td>${k === 'Sem data' ? k : esc(U.monthLabel(k))}</td>${cols(rs)}</tr>`);
    const ordemMom = ['1º período', 'Prorrogação', 'Durante a temporada', 'Após a experiência'];
    const momentos = contar(d, r => r.momento || 'Sem data').sort((a, b) => ordemMom.indexOf(a[0]) - ordemMom.indexOf(b[0])).map(([k, rs]) => `<tr><td>${esc(k)}</td>${cols(rs)}</tr>`);
    const grupo = fn => contar(rows, fn).map(([k, rs]) => [k, resumoDeslig(rs)]).sort((a, b) => b[1].deslig - a[1].deslig || b[1].total - a[1].total);
    const linhaGrupo = ([k, x]) => `<tr><td>${esc(k)}</td><td>${U.fmtInt(x.total)}</td><td>${forte(x.deslig)}</td><td>${x.inv ? U.fmtInt(x.inv) : zero}</td><td>${x.vol ? U.fmtInt(x.vol) : zero}</td><td>${x.taxaAprov === null ? '—' : pct(x.taxaAprov)}</td><td>${forte(x.aprovDeslig)}</td></tr>`;
    const cabGrupo = n => [n, 'Contratados', 'Desligados', 'Involuntário', 'Voluntário', 'Aproveitamento', '<span title="Aprovados pelo gestor na última avaliação e desligados pela empresa">Aprovados e desligados</span>'];
    const gestores = grupo(r => r.gestor).filter(x => x[1].deslig > 0).slice(0, 12);
    return `
      <h3 style="font-size:14px;margin:22px 0 12px">Desligamentos e aproveitamento — Extra Natal ${ano}</h3>
      ${kpis}
      <div class="grid2">
        ${card('Motivos do desligamento', '&#128221;', tab(['Motivo'].concat(cab3), motivos))}
        ${card('Quando saíram', '&#128197;', tab(['Mês da saída'].concat(cab3), meses) + `<div style="margin-top:12px">${tab(['Momento da experiência'].concat(cab3), momentos)}</div>`)}
        ${card('Desligamentos por unidade', '&#128205;', tab(cabGrupo('Unidade'), grupo(r => r.unidade).map(linhaGrupo)))}
        ${card('Desligamentos por gestor (maiores volumes)', '&#128104;&#8205;&#128188;', gestores.length ? tab(cabGrupo('Gestor'), gestores.map(linhaGrupo)) : empty('Sem desligamentos.'))}
      </div>
      <p style="${SUB};margin-top:8px">Tipo e motivo vêm do Headcount (Desligamento - Tipo / Motivo). <b>Aproveitamento</b> = seguiu na empresa depois do fim da experiência de Natal${CALENDARIOS[ano] ? '' : ` (sem calendário para ${ano}: considera o fim da temporada, 28/02/${ano + 1})`}; só entra na conta quem já passou dessa data.</p>`;
  }

  function blocoReposicao(rows, ano, vagas) {
    const titulo = '<h3 style="font-size:14px;margin:22px 0 12px">Reposição após o Extra Natal ' + ano + '</h3>';
    if (!vagas) return titulo + card('Vagas de reposição', '&#128269;', empty(vagasErro ? 'Não consegui ler o Controle de Vagas.' : 'Carregando o Controle de Vagas...', vagasErro ? 'O cruzamento com as vagas de substituição depende do acesso ao módulo de Recrutamento.' : ''));
    const d = rows.filter(r => r.desligado && r.saida);
    if (!d.length) return '';
    const inv = d.filter(r => r.tipoDeslig === 'Involuntário'), vol = d.filter(r => r.tipoDeslig === 'Voluntário');
    const rep = arr => arr.filter(r => r.reposicao).length;
    const aprov = d.filter(aprovadoDesligado);
    const p = (n, t) => (t ? pct(n / t) : '—');
    const naLoja = d.filter(r => r.reposicaoLoja).length;
    const ultima = vagas.map(v => v.abertura).filter(Boolean).sort().pop();
    const kpis = '<div class="kpi-grid">' +
      kpi('Desligados com vaga de reposição', U.fmtInt(rep(d)), p(rep(d), d.length) + ' dos ' + U.fmtInt(d.length) + ' desligados · mesma loja e cargo, em até ' + JANELA_REPOSICAO + ' dias', 'var(--p1)') +
      kpi('Vagas que poderiam ter sido evitadas', U.fmtInt(rep(inv)), p(rep(inv), inv.length) + ' dos ' + U.fmtInt(inv.length) + ' desligados pela empresa tiveram vaga de substituição aberta em seguida', rep(inv) ? 'var(--critical)' : '#1baf7a') +
      kpi('Aprovados, desligados e repostos', U.fmtInt(rep(aprov)), 'de ' + U.fmtInt(aprov.length) + ' aprovados na avaliação e desligados pela empresa', rep(aprov) ? 'var(--critical)' : '#1baf7a') +
      kpi('Reposição de saídas voluntárias', U.fmtInt(rep(vol)), p(rep(vol), vol.length) + ' dos ' + U.fmtInt(vol.length) + ' que pediram para sair', '#eb6834') +
      kpi('Mesma loja, qualquer cargo', U.fmtInt(naLoja), p(naLoja, d.length) + ' dos desligados — leitura mais ampla, sem exigir o mesmo cargo', '#8A8F98') +
      '</div>';
    const lojas = contar(d, r => r.departamento || 'Não informado').map(([k, rs]) => {
      const i = rs.filter(r => r.tipoDeslig === 'Involuntário');
      return { k, un: rs[0].unidade, n: rs.length, inv: i.length, rep: rep(rs), repInv: rep(i), repAprov: rep(rs.filter(aprovadoDesligado)) };
    }).filter(x => x.rep > 0).sort((a, b) => b.repInv - a.repInv || b.rep - a.rep).slice(0, 15);
    const linhas = lojas.map(x => '<tr><td>' + esc(x.k) + '<div style="color:var(--muted);font-size:10.5px">' + esc(x.un) + '</div></td><td>' + U.fmtInt(x.n) + '</td><td>' + (x.inv ? U.fmtInt(x.inv) : zero) + '</td><td><b>' + U.fmtInt(x.rep) + '</b></td><td>' + forte(x.repInv) + '</td><td>' + forte(x.repAprov) + '</td></tr>').join('');
    const tab = lojas.length
      ? '<div class="table-wrap"><table class="dt"><thead><tr><th>Loja</th><th>Desligados do Extra Natal</th><th>Pela empresa</th><th title="Vagas de substituição abertas na mesma loja e cargo, em até ' + JANELA_REPOSICAO + ' dias">Vagas de reposição</th><th>Reposição de desligados pela empresa</th><th title="Aprovados pelo gestor na última avaliação, desligados pela empresa e com vaga de reposição">Aprovados repostos</th></tr></thead><tbody>' + linhas + '</tbody></table></div>'
      : empty('Nenhuma vaga de substituição aberta na mesma loja e cargo depois das saídas.');
    return titulo + kpis + card('Lojas que desligaram e abriram vaga em seguida', '&#128260;', tab) +
      '<p style="' + SUB + ';margin-top:8px">Considera vagas de <b>Substituição</b> e <b>Substituição - Extra Natal</b> do Controle de Vagas (sem as canceladas), abertas na mesma loja e na mesma família de cargo em até ' + JANELA_REPOSICAO + ' dias depois da saída. A vaga não registra quem foi substituído, então o vínculo é por loja, cargo e data; cada vaga conta para um desligado só. Última vaga aberta no Controle de Vagas: ' + (ultima ? U.fmtDateBR(ultima) : '—') + '.</p>';
  }

  function render(body, f) {
    const anos = anosDisponiveis();
    if (!estado.ano || !anos.includes(estado.ano)) estado.ano = anos.includes(new Date().getFullYear()) ? new Date().getFullYear() : anos[0];
    const ano = estado.ano;
    const cal = CALENDARIOS[ano];
    const vagas = vagasCache;
    if (!vagas && !vagasErro) carregarVagas().then(() => { if (body.isConnected && body.querySelector('#natal-ano')) render(body, f); });
    const rows = montar(ano, f, vagas);
    const a1 = resumoEtapa(rows, 'e1'), a2 = resumoEtapa(rows, 'e2');
    const ativos = rows.filter(r => !r.desligado).length;
    const prox7 = rows.filter(FILTROS.proximas[1]).length;
    const normais = rows.filter(r => r.regra === 'normal').length;

    const seletor = `<div class="toolbar">
      <span style="font-size:12px;color:var(--text2);font-weight:700">Ano do Extra Natal</span>
      <select id="natal-ano">${anos.map(a => `<option value="${a}" ${a === ano ? 'selected' : ''}>${a}${CALENDARIOS[a] ? '' : ' (histórico)'}</option>`).join('')}</select>
      <span style="font-size:11.5px;color:var(--muted)">Colaboradores com a tag <b>extra.natal.${ano}</b> no Headcount. O filtro de datas da barra superior não se aplica aqui.</span>
    </div>`;

    if (!rows.length) {
      body.innerHTML = seletor + empty(`Nenhum colaborador com a tag extra.natal.${ano} nos filtros selecionados.`, 'A tag vem da coluna Grupos do Headcount (planilha de Colaboradores).');
      body.querySelector('#natal-ano').addEventListener('change', e => { estado.ano = Number(e.target.value); render(body, f); });
      return;
    }

    const aviso = cal ? '' : `<div class="insight info" style="margin-bottom:16px"><span class="ic">&#8505;&#65039;</span><span><strong>Histórico:</strong> não há calendário de experiência cadastrado para ${ano}. Os prazos de quem entrou a partir de outubro não são calculados — a tela mostra as avaliações respondidas (planilhas AVE 45 e 90 dias) e os desligamentos.</span></div>`;
    const kpis = `<div class="kpi-grid">
      ${kpi('Contratados Extra Natal', U.fmtInt(rows.length), `${U.fmtInt(ativos)} ativos · ${U.fmtInt(rows.length - ativos)} desligados${normais ? ` · ${U.fmtInt(normais)} de setembro (prazo normal)` : ''}`, 'var(--p1)')}
      ${kpi('Liberar no Feedz agora', U.fmtInt(a1.liberar + a2.liberar), `faltam ${LIBERAR_ANTES} dias ou menos para o prazo de entrega · ${U.fmtInt(a1.liberar)} do 1º período · ${U.fmtInt(a2.liberar)} do 2º${prox7 ? ` · +${U.fmtInt(prox7)} entram em 7 dias` : ''}`, a1.liberar + a2.liberar ? 'var(--critical)' : '#1baf7a')}
      ${kpi('Liberadas sem resposta do gestor', U.fmtInt(a1.andamento + a2.andamento), `${U.fmtInt(a1.andamento)} do 1º período · ${U.fmtInt(a2.andamento)} do 2º`, a1.andamento + a2.andamento ? '#eda100' : '#1baf7a')}
      ${kpi('Atrasadas', U.fmtInt(a1.atrasadas + a2.atrasadas), `prazo de entrega vencido, período ainda aberto · ${U.fmtInt(a1.atrasadas)} do 1º · ${U.fmtInt(a2.atrasadas)} do 2º`, a1.atrasadas + a2.atrasadas ? 'var(--critical)' : '#1baf7a')}
      ${kpi('Vencidas', U.fmtInt(a1.vencidas + a2.vencidas), `período encerrado sem avaliação · ${U.fmtInt(a1.vencidas)} do 1º · ${U.fmtInt(a2.vencidas)} do 2º`, a1.vencidas + a2.vencidas ? 'var(--critical)' : '#1baf7a')}
      ${kpi('1º período — entregues', a1.taxa === null ? U.fmtInt(a1.feitas) : pct(a1.taxa), a1.base ? `${U.fmtInt(a1.feitas)} de ${U.fmtInt(a1.base)} · ${U.fmtInt(a1.noPrazo)} no prazo${a1.aguardando ? ` · ${U.fmtInt(a1.aguardando)} aguardando liberação` : ''}` : (a1.aguardando ? `${U.fmtInt(a1.aguardando)} aguardando liberação` : 'nenhuma liberada'), '#4a3aa7')}
      ${kpi('2º período — entregues', a2.taxa === null ? U.fmtInt(a2.feitas) : pct(a2.taxa), a2.base ? `${U.fmtInt(a2.feitas)} de ${U.fmtInt(a2.base)} · ${U.fmtInt(a2.noPrazo)} no prazo${a2.aguardando ? ` · ${U.fmtInt(a2.aguardando)} aguardando liberação` : ''}` : (a2.aguardando ? `${U.fmtInt(a2.aguardando)} aguardando liberação` : 'nenhuma liberada'), '#805AD5')}
      ${kpi('Aprovados (1º período)', a1.decididos ? pct(a1.aprov / a1.decididos) : '—', `${U.fmtInt(a1.aprov)} aprovados · ${U.fmtInt(a1.reprov)} reprovados de ${U.fmtInt(a1.decididos)} decisões`, '#1baf7a')}
      ${kpi('Aprovados (2º período)', a2.decididos ? pct(a2.aprov / a2.decididos) : '—', `${U.fmtInt(a2.aprov)} aprovados · ${U.fmtInt(a2.reprov)} reprovados de ${U.fmtInt(a2.decididos)} decisões`, '#1baf7a')}
      ${kpi('Nota média do gestor', a1.nota === null ? '—' : U.fmt1(a1.nota), a2.nota === null ? '1º período' : `1º período · ${U.fmt1(a2.nota)} no 2º`, '#4a3aa7')}
    </div>`;

    // Avaliações por unidade
    const linhasUn = contar(rows, r => r.unidade).sort((a, b) => b[1].length - a[1].length).map(([u, rs]) => {
      const x1 = resumoEtapa(rs, 'e1'), x2 = resumoEtapa(rs, 'e2');
      const pend = x1.liberar + x2.liberar + x1.andamento + x2.andamento + x1.vencidas + x2.vencidas;
      return `<tr><td>${esc(u)}</td><td><b>${U.fmtInt(rs.length)}</b></td><td>${U.fmtInt(x1.feitas)}</td><td>${U.fmtInt(x2.feitas)}</td><td>${forte(pend)}</td></tr>`;
    }).join('');
    const tabUn = `<div class="table-wrap"><table class="dt"><thead><tr><th>Unidade</th><th>Contratados</th><th>1º período entregues</th><th>2º período entregues</th><th title="A liberar agora, liberadas sem resposta, atrasadas ou vencidas">Pendências</th></tr></thead><tbody>${linhasUn}</tbody></table></div>`;

    const tabCal = cal ? `<div class="table-wrap"><table class="dt"><thead><tr><th>Admissão</th><th>Entregar a 1ª avaliação até</th><th>Fim da 1ª experiência</th><th>Entregar a 2ª avaliação até</th><th>Fim da prorrogação</th></tr></thead><tbody>
      <tr><td>Setembro</td><td>dia 40 da admissão</td><td>dia 45</td><td>dia 85 da admissão</td><td>dia 90</td></tr>${cal.faixas.map((x, i) => {
      const de = i === 0 ? `${ano}-10-01` : U.addDays(cal.faixas[i - 1][0], 1);
      return `<tr><td>${U.fmtDateBR(de)} a ${U.fmtDateBR(x[0])}</td><td>${U.fmtDateBR(U.addDays(x[1], -ENTREGA_ANTES))}</td><td>${U.fmtDateBR(x[1])}</td><td>${U.fmtDateBR(U.addDays(x[2], -ENTREGA_ANTES))}</td><td>${U.fmtDateBR(x[2])}</td></tr>`;
    }).join('')}</tbody></table></div><p style="${SUB};margin-top:8px">Calendário do DP (calendario_extranatal_${ano}.xlsx). No fim de cada período o gestor responde ao DP se fica com o colaborador. A liberação no Feedz é manual: a tela pede a liberação ${LIBERAR_ANTES} dias antes do prazo de entrega. Admitidos em setembro seguem o prazo normal.</p>` : '';

    body.innerHTML = `
      ${seletor}${aviso}${kpis}
      <div class="grid2">
        ${card('Avaliações por unidade', '&#128205;', tabUn)}
        ${cal ? card(`Calendário de experiência — Extra Natal ${ano}`, '&#128197;', tabCal) : ''}
      </div>
      ${blocoDesligamentos(rows, ano)}
      ${blocoReposicao(rows, ano, vagas)}
      <h3 style="font-size:14px;margin:22px 0 12px">Colaboradores</h3>
      <div class="toolbar">
        <input type="text" id="natal-busca" placeholder="Buscar colaborador, cargo, unidade ou gestor..." value="${esc(estado.busca)}">
        <select id="natal-filtro">${Object.keys(FILTROS).map(k => `<option value="${k}" ${estado.filtro === k ? 'selected' : ''}>${FILTROS[k][0]}</option>`).join('')}</select>
        <button type="button" class="btn btn-outline btn-sm" id="natal-csv" style="width:auto">Exportar CSV</button>
      </div>
      <div id="natal-tabela"></div>`;

    let visiveis = [];
    const chaveOrdem = r => { const e = [r.e1, r.e2].find(x => x.prazo && !FEITAS.includes(x.sit) && x.sit !== 'saiu_antes' && x.sit !== 'saiu_sem'); return e ? e.prazo : '9999'; };
    const desenhar = () => {
      const b = norm(estado.busca);
      visiveis = rows.filter(FILTROS[estado.filtro][1]).filter(r => !b || norm([r.nome, r.cargo, r.unidade, r.gestor].join(' ')).includes(b))
        .sort((x, y) => chaveOrdem(x).localeCompare(chaveOrdem(y)) || String(x.adm || '').localeCompare(String(y.adm || '')) || x.nome.localeCompare(y.nome, 'pt-BR'));
      const alvo = body.querySelector('#natal-tabela');
      if (!visiveis.length) { alvo.innerHTML = empty('Nenhum colaborador encontrado com esses filtros.'); return; }
      alvo.innerHTML = `<p style="${SUB};margin-bottom:8px">${U.fmtInt(visiveis.length)} de ${U.fmtInt(rows.length)} colaboradores · ordenados pelo próximo prazo de entrega em aberto</p>
        <div class="table-wrap" style="max-height:none"><table class="dt"><thead><tr><th>Colaborador</th><th>Unidade / gestor</th><th>Admissão</th><th title="Respostas da planilha AVE 45 DIAS">1º período</th><th title="Respostas da planilha AVE 90 DIAS">2º período (prorrogação)</th><th>Desligamento</th></tr></thead><tbody>${visiveis.map(r => `<tr>
          <td><b>${esc(r.nome)}</b> ${r.situacao && M.SITUACOES[r.situacao] ? `<span class="ave-pill" style="--c:${M.CORES_SITUACAO[r.situacao]}">${M.SITUACOES[r.situacao]}</span>` : ''}<div style="color:var(--muted);font-size:10.5px">${esc(r.cargo)}</div></td>
          <td>${esc(r.unidade)}<div style="color:var(--muted);font-size:10.5px">${esc(r.gestor)}</div></td>
          <td>${r.adm ? U.fmtDateBR(r.adm) : '—'}${r.regra === 'normal' ? '<div style="color:var(--muted);font-size:10.5px" title="Admissão em setembro: segue o prazo normal de 45/90 dias">prazo normal</div>' : ''}${r.evitar ? '<div><span class="ave-pill" style="--c:#eb6834" title="A planilha do DP marca esta data de admissão como EVITAR (experiência curta)">Data a evitar</span></div>' : ''}</td>
          ${celEtapa(r.e1)}${celEtapa(r.e2)}
          <td>${r.desligado ? `<span class="ave-pill" style="--c:${r.tipoDeslig === 'Voluntário' ? '#eb6834' : r.tipoDeslig === 'Involuntário' ? '#9b1c1c' : '#8A8F98'}" title="${esc(r.tipoDesligTxt)}">${r.tipoDeslig}</span><div style="font-size:10.5px;color:var(--muted)">${esc(r.motivo)}${r.saida ? ` · ${U.fmtDateBR(r.saida)}` : ''}</div>${aprovadoDesligado(r) ? '<div style="font-size:10.5px;color:var(--critical);font-weight:700">aprovado na avaliação</div>' : ''}${r.reposicao ? '<div style="font-size:10.5px;color:var(--p1);font-weight:700" title="' + esc(r.reposicao.id) + ' · ' + esc(r.reposicao.cargo || '') + '">vaga de reposição em ' + U.fmtDateBR(r.reposicao.abertura) + ' (' + r.reposicao.dias + 'd depois)</div>' : ''}` : '<span style="color:var(--muted)">—</span>'}</td></tr>`).join('')}</tbody></table></div>`;
    };
    desenhar();
    body.querySelector('#natal-ano').addEventListener('change', e => { estado.ano = Number(e.target.value); render(body, f); });
    body.querySelector('#natal-busca').addEventListener('input', e => { estado.busca = e.target.value; desenhar(); });
    body.querySelector('#natal-filtro').addEventListener('change', e => { estado.filtro = e.target.value; desenhar(); });
    body.querySelector('#natal-csv').addEventListener('click', () => exportar(visiveis, ano));
  }

  function contagemAtual() {
    const ano = new Date().getFullYear();
    return ((window.HUB_DATA && window.HUB_DATA.colaboradores) || []).filter(c => M.anosNatal(c.grupos).includes(ano)).length;
  }

  window.HUB_EXP_NATAL = { CALENDARIOS, periodos, montar, render, contagemAtual };
})();
