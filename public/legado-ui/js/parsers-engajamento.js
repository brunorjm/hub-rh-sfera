// Leitura da planilha "33. Pesquisa de Engajamento" — SÓ participação (quem foi
// convidado × quem respondeu, por unidade e departamento). Nenhuma resposta,
// nota ou comentário é lida daqui: a pesquisa é anônima e o módulo só conta.
//
// Uma planilha só alimenta o módulo (Administração → Upload de Planilhas):
//   • aba "Adesão": um pulso por linha (nº, participantes, respondentes, início e fim);
//   • aba "Respostas": cada resposta traz unidade, departamento e data/hora. Os
//     respondentes por unidade/departamento são contados a partir dela.
// A base de convidados por unidade/departamento vem do headcount ATIVO do Hub
// (planilha de Colaboradores), guardada como "foto" no pulso mais recente.
(function () {
  const I = HUB_PARSERS._internal;
  const norm = h => String(h == null ? '' : h).normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const chaveUD = (u, d) => norm(u) + '|' + norm(d);

  function aba(wb, nome) {
    const alvo = norm(nome);
    const real = (wb.SheetNames || []).find(n => norm(n) === alvo);
    return real ? wb.Sheets[real] : null;
  }
  function linhasObjeto(ws) {
    return XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
  }
  function inteiro(v) {
    const n = I.num(v);
    return n === null ? null : Math.round(n);
  }
  const p2 = n => String(n).padStart(2, '0');
  // Dias de tolerância depois do fim do último pulso da aba Adesão (ver parseBase).
  const GRACA_DIAS = 1;

  // Data e hora da resposta ("YYYY-MM-DDTHH:MM:SS"). A coluna vem como serial do
  // Excel (número) ou, com cellDates, como Date.
  function dataHora(v) {
    let d = null, u = false;
    if (v instanceof Date) d = v;
    else if (typeof v === 'number' && isFinite(v)) { d = new Date(Math.round((v - 25569) * 86400) * 1000); u = true; }
    else if (typeof v === 'string' && v.trim()) {
      const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):?(\d{2})?/.exec(v.trim());
      if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}`;
      return null;
    }
    if (!d || isNaN(d.getTime())) return null;
    const g = u
      ? [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]
      : [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()];
    return `${g[0]}-${p2(g[1])}-${p2(g[2])}T${p2(g[3])}:${p2(g[4])}:${p2(g[5])}`;
  }

  function somaDias(iso, n) {
    const d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  // Distribui `total` entre as contagens de forma proporcional (maior resto),
  // para que a soma dos departamentos feche exatamente com o total oficial.
  function escalarAoTotal(itens, total) {
    const soma = itens.reduce((s, i) => s + i.n, 0);
    if (!soma || soma === total) return;
    const parciais = itens.map(i => {
      const v = i.n * total / soma;
      return { i, base: Math.floor(v), resto: v - Math.floor(v) };
    });
    let sobra = total - parciais.reduce((s, p) => s + p.base, 0);
    parciais.sort((a, b) => b.resto - a.resto);
    for (const p of parciais) {
      const extra = sobra > 0 && p.resto > 0 ? 1 : 0;
      p.i.n = p.base + extra;
      sobra -= extra;
    }
  }

  // Headcount ativo por unidade+departamento (a partir das linhas de Colaboradores
  // com situação "Ativo") e o gestor direto mais frequente de cada um.
  function headcountAtivo(colaboradores) {
    const mapa = new Map();
    for (const c of colaboradores || []) {
      if (norm(c.situacao) !== 'ativo') continue;
      const u = I.str(c.unidade), d = I.str(c.departamento);
      if (!u || !d) continue;
      const k = chaveUD(u, d);
      if (!mapa.has(k)) mapa.set(k, { unidade: u, departamento: d, conv: 0, gestores: new Map() });
      const h = mapa.get(k);
      h.conv++;
      const g = I.str(c.gestor_direto);
      if (g) h.gestores.set(g, (h.gestores.get(g) || 0) + 1);
    }
    for (const h of mapa.values()) {
      const ord = Array.from(h.gestores.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
      h.gestor = ord.length ? ord[0][0] : null;
    }
    return mapa;
  }

  // ---------------------------------------------------------------------
  // ctx = { colaboradores: [...linhas da tabela colaboradores], hoje: 'YYYY-MM-DD' }
  // ---------------------------------------------------------------------
  function parseBase(wb, ctx) {
    ctx = ctx || {};
    const wsAd = aba(wb, 'Adesão');
    const wsRe = aba(wb, 'Respostas');
    if (!wsAd || !wsRe) throw new Error('Não encontrei as abas "Adesão" e "Respostas" — este não parece o arquivo "33. Pesquisa de Engajamento".');
    const hc = headcountAtivo(ctx.colaboradores);
    if (!hc.size) throw new Error('Não há colaboradores ativos carregados no Hub para servir de base de convidados. Envie primeiro a planilha "1. Colaboradores" e tente de novo.');
    const hcTotal = Array.from(hc.values()).reduce((s, h) => s + h.conv, 0);
    const hoje = ctx.hoje || new Date().toISOString().slice(0, 10);
    const avisos = [];

    // ---- Pulsos (aba Adesão) ------------------------------------------------
    const pulsos = [];
    for (const r of linhasObjeto(wsAd)) {
      const o = {};
      for (const k of Object.keys(r)) o[norm(k)] = r[k];
      const ini = I.toISODate(o['inicio do pulso']);
      const fim = I.toISODate(o['final do pulso']);
      const conv = inteiro(o['participantes']);
      const resp = inteiro(o['respondentes']);
      if (!ini || !fim || conv === null || resp === null) continue;
      const n = /\d+/.exec(String(o['numero do pulso'] || ''));
      pulsos.push({ inicio: ini, fim, numero: n ? parseInt(n[0], 10) : null, convidados: conv, respondentes: resp, auto: false });
    }
    if (!pulsos.length) throw new Error('A aba "Adesão" não trouxe nenhum pulso (colunas: Numero do Pulso, Participantes, Respondentes, Inicio do Pulso, Final do Pulso).');
    pulsos.sort((a, b) => a.inicio.localeCompare(b.inicio));

    // ---- Envios (aba Respostas) -----------------------------------------------
    // Um "envio" = todas as respostas da mesma pessoa, que saem com o mesmo
    // horário: contam-se envios distintos por unidade+departamento+horário.
    const envios = new Map();
    for (const r of linhasObjeto(wsRe)) {
      const o = {};
      for (const k of Object.keys(r)) o[norm(k)] = r[k];
      const bruto = o['data'] !== undefined && o['data'] !== '' ? o['data'] : o['data da resposta'];
      const dia = I.toISODate(bruto);
      if (!dia) continue;
      const un = I.str(o['unidade']) || 'Sem unidade';
      const dp = I.str(o['departamento']) || 'Sem departamento';
      const k = un + '\u0001' + dp + '\u0001' + (bruto instanceof Date ? bruto.getTime() : String(bruto));
      if (!envios.has(k)) envios.set(k, { un, dp, dia, ts: dataHora(bruto) });
    }
    const lista = Array.from(envios.values());

    // ---- Pulsos novos: respostas depois do último pulso da aba Adesão -----------
    // Tolerância: o pulso costuma ser encerrado no Feedz um dia depois do fim cadastrado
    // (ex.: fim 01/10, última resposta 02/10) — respostas até 1 dia depois do fim do último
    // pulso da aba Adesão contam para ele, não viram um pulso novo.
    let ultimo = pulsos[pulsos.length - 1];
    ultimo.fimContagem = somaDias(ultimo.fim, GRACA_DIAS);
    let alem = lista.filter(e => e.dia > ultimo.fimContagem).sort((a, b) => a.dia.localeCompare(b.dia));
    while (alem.length) {
      const inicio = alem[0].dia; // início = dia da primeira resposta; fim = 6 dias depois
      const fim = somaDias(inicio, 6);
      const n = alem.filter(e => e.dia <= fim).length;
      const novo = { inicio, fim, numero: ultimo.numero ? ultimo.numero + 1 : null, convidados: hcTotal, respondentes: n, auto: true };
      pulsos.push(novo);
      avisos.push(`${novo.numero ? novo.numero + 'º pulso' : 'Pulso'} (${inicio.slice(8, 10)}/${inicio.slice(5, 7)} a ${fim.slice(8, 10)}/${fim.slice(5, 7)}) não estava na aba Adesão: criado automaticamente com ${hcTotal} convidados (headcount ativo) e ${n} respondentes (contagem pelas respostas). Se preferir os números oficiais, preencha a linha na aba Adesão e envie de novo.`);
      alem = alem.filter(e => e.dia > fim);
      ultimo = novo;
    }

    // ---- Envios por pulso e por unidade/departamento --------------------------------
    const cont = new Map();
    const ultimaResp = new Map();
    const enviosPorPulso = new Map();
    let fora = 0;
    for (const e of lista) {
      const p = pulsos.find(x => e.dia >= x.inicio && e.dia <= (x.fimContagem || x.fim));
      if (!p) { fora++; continue; }
      enviosPorPulso.set(p.inicio, (enviosPorPulso.get(p.inicio) || 0) + 1);
      if (e.ts && (!ultimaResp.has(p.inicio) || e.ts > ultimaResp.get(p.inicio))) ultimaResp.set(p.inicio, e.ts);
      const k = p.inicio + '\u0001' + chaveUD(e.un, e.dp);
      if (!cont.has(k)) cont.set(k, { pulso_inicio: p.inicio, unidade: e.un, departamento: e.dp, n: 0 });
      cont.get(k).n++;
    }
    if (fora) avisos.push(`${fora} resposta(s) com data fora de qualquer pulso foram ignoradas.`);

    // A contagem de envios passa de 0 a 5% do total oficial (uma mesma pessoa pode
    // gravar respostas em horários um pouco diferentes): ajusta proporcionalmente
    // para a soma dos departamentos fechar com o total oficial da aba Adesão.
    const porPulso = new Map();
    for (const c of cont.values()) {
      if (!porPulso.has(c.pulso_inicio)) porPulso.set(c.pulso_inicio, []);
      porPulso.get(c.pulso_inicio).push(c);
    }
    // Pulso em andamento: a aba Adesão costuma ficar atrás das respostas. Se há mais
    // envios do que o total informado, estima-se o total pelas respostas, aplicando a
    // proporção (total oficial ÷ envios) dos últimos pulsos encerrados (~0,95).
    const razoes = pulsos.filter(p => !p.auto && p.fim < hoje && enviosPorPulso.get(p.inicio)).slice(-4)
      .map(p => Math.min(1, p.respondentes / enviosPorPulso.get(p.inicio)));
    const razao = razoes.length ? razoes.reduce((x, y) => x + y, 0) / razoes.length : 1;
    for (const p of pulsos) {
      const envs = enviosPorPulso.get(p.inicio) || 0;
      const nome = p.numero ? p.numero + 'º pulso' : 'Pulso de ' + p.inicio;
      if (p.fim >= hoje) {
        if (p.auto || envs > p.respondentes) {
          const est = Math.round(envs * razao);
          if (!p.auto) avisos.push(nome + ' em andamento: a aba Adesão informa ' + p.respondentes + ' respondentes e as Respostas têm ' + envs + ' envios — usei ' + est + ' (estimado pelas respostas).');
          p.respondentes = est;
        }
      } else if (envs > p.respondentes * 1.08 && envs - p.respondentes > 3) {
        avisos.push(nome + ': a aba Adesão informa ' + p.respondentes + ' respondentes, mas há ' + envs + ' envios nas Respostas — a aba Adesão parece desatualizada.');
      }
      if (porPulso.has(p.inicio)) escalarAoTotal(porPulso.get(p.inicio), p.respondentes);
    }

    // ---- Pulsos e linhas de saída ------------------------------------------------------
    for (const p of pulsos) {
      p.parcial = p.fim >= hoje;
      p.ultima_resposta = ultimaResp.get(p.inicio) || null;
    }
    const atual = pulsos[pulsos.length - 1];
    const linhas = [];
    const usados = new Set();
    for (const c of Array.from(cont.values()).filter(c => c.pulso_inicio !== atual.inicio && c.n > 0)) {
      linhas.push({ pulso_inicio: c.pulso_inicio, unidade: c.unidade, departamento: c.departamento, gestor: null, convidados: null, respondentes: c.n });
    }
    // Pulso mais recente: uma linha para CADA departamento do headcount ativo (mesmo
    // com 0 respostas) e a base de convidados daquele momento ("foto" do headcount).
    for (const [k, h] of hc) {
      const c = cont.get(atual.inicio + '\u0001' + k);
      if (c) usados.add(k);
      const resp = c ? c.n : 0;
      linhas.push({ pulso_inicio: atual.inicio, unidade: h.unidade, departamento: h.departamento, gestor: h.gestor, convidados: Math.max(h.conv, resp), respondentes: resp });
    }
    let semBase = 0;
    for (const c of cont.values()) {
      if (c.pulso_inicio !== atual.inicio || c.n <= 0 || usados.has(chaveUD(c.unidade, c.departamento))) continue;
      semBase += c.n;
      linhas.push({ pulso_inicio: atual.inicio, unidade: c.unidade, departamento: c.departamento, gestor: null, convidados: c.n, respondentes: c.n });
    }
    if (semBase) avisos.push(`${semBase} resposta(s) do pulso atual são de departamentos que não constam no headcount ativo do Hub.`);

    const dAtual = linhas.filter(l => l.pulso_inicio === atual.inicio);
    return {
      pulsos: pulsos.map(p => ({ inicio: p.inicio, fim: p.fim, numero: p.numero, convidados: p.convidados, respondentes: p.respondentes, parcial: p.parcial, ultima_resposta: p.ultima_resposta })),
      linhas, avisos,
      resumo: { pulsos: pulsos.length, linhas: linhas.length, atual, departamentosAtual: dAtual.length, hcTotal, hcDeptos: hc.size }
    };
  }

  window.HUB_PARSERS_ENGAJAMENTO = { parseBase };
})();
