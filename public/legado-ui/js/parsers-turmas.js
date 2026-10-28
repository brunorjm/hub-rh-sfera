// Leitura da planilha "Controle de Treinamentos" de cada multiplicadora
// (Treinamento e Desenvolvimento → Turmas e Multiplicadoras). Uma linha por TURMA:
// Data, Mês Ref., Tema, Modalidade, Local, Início, Fim, Volume de horas, Alvo,
// Origem, Marca, Canal, Convocados, Presentes, Taxa de Adesão, Multiplicador(a).
//
// Padroniza o que vem digitado de vários jeitos (Levi's/Levis, Liderado/
// Liderdados, erros nos temas, marcas juntas como "Sfera/Boti") e devolve os
// avisos de qualidade. A planilha pertence à multiplicadora que mais aparece
// nela; reenviar substitui só as turmas dessa planilha (supabase-treinamento-turmas.sql).
(function () {
  const I = HUB_PARSERS._internal;
  const N = s => HUB_UTILS.normalizeText(s == null ? '' : s);
  const COLUNAS = ['Data', 'Tema', 'Convocados', 'Presentes'];
  // A coluna de quem deu a turma: "Multiplicador(a)" (Levi's/Hering) ou "Instrutor" (Boticário).
  const COL_MULTI = ['Multiplicador(a)', 'Multiplicadora', 'Multiplicador', 'Instrutor', 'Instrutora', 'Instrutor(a)'];

  // ------------------------------------------------------------------
  // Padronização
  // ------------------------------------------------------------------
  // Comparação sem espaços: "OBoticário", "O  Boticario". "O Boticário VD" é marca própria (decisão de 14/10/2026).
  const MARCAS = [
    [/^levi'?s$|^levis$/, "Levi's"], [/^hering$/, 'Hering'], [/^sfera$/, 'Sfera'],
    [/^o?boticariovd$/, 'O Boticário VD'], [/^o?boticario$|^boti$/, 'O Boticário'], [/^quemdisse,?beren\w*\??$|^qdb$/, 'Quem disse, Berenice?']
  ];
  function marcas(v) {
    // Sem vírgula: "Quem disse, Berenice?" é uma marca só.
    const partes = String(v || '').split(/\s*(?:\/|&|\+|\||\be\b)\s*/i).map(s => s.trim()).filter(Boolean);
    const out = [];
    for (const p of partes) {
      const k = N(p).replace(/[’`]/g, "'").replace(/\s+/g, '');
      const m = MARCAS.find(([re]) => re.test(k));
      const nome = m ? m[1] : p;
      if (!out.includes(nome)) out.push(nome);
    }
    return out;
  }

  // Liderados | Líderes | Líderes e liderados | Revendedores. Aceita as grafias das
  // planilhas: "Liderança", "Liderados | Liderança", "Lideraados", "Liderandos", "Equipe"...
  function publico(v) {
    const k = N(v);
    if (!k) return null;
    if (/^ambos$/.test(k)) return 'Líderes e liderados';
    if (/revendedor/.test(k)) return 'Revendedores';
    const semLider = k.replace(/liderancas?/g, ' ').replace(/\blider(es)?\b/g, ' ');
    const temLider = semLider !== k;
    const temLiderado = /l+id\w*d\w*|equipe/.test(semLider);
    if (temLider && temLiderado) return 'Líderes e liderados';
    if (temLider) return 'Líderes';
    if (temLiderado) return 'Liderados';
    return String(v).trim();
  }

  // Loja | VD | Escritório e as combinações ("LOJA| VD", "Escritório/Loja").
  function canal(v) {
    const k = N(v);
    if (!k) return null;
    const partes = [/loja/.test(k) && 'Loja', /\bvd\b/.test(k) && 'VD', /escritorio/.test(k) && 'Escritório'].filter(Boolean);
    return partes.length ? partes.join(' e ') : String(v).trim();
  }

  function modalidade(v) {
    const k = N(v);
    if (!k) return null;
    return /hibrid/.test(k) ? 'Híbrido' : /on-?line|remot/.test(k) ? 'Online' : /presencial/.test(k) ? 'Presencial' : String(v).trim();
  }

  // Erros de digitação já vistos nos temas.
  const CORRECOES = [[/^NTEGRA/, 'INTEGRA'], [/OMBOARDING/g, 'ONBOARDING'], [/TREINEMANETO/g, 'TREINAMENTO'], [/\s+/g, ' ']];
  function tema(v) {
    let s = String(v || '').trim().toUpperCase();
    for (const [re, por] of CORRECOES) s = s.replace(re, por);
    return s || null;
  }
  // Tipo de turma, pelo tema.
  function categoria(t) {
    const k = N(t);
    if (/integra|onboarding|boas[ -]?vindas|cultura sfera/.test(k)) return 'Integração e onboarding';
    if (/lideranca|comportament|feedback|comunicacao/.test(k)) return 'Liderança e comportamento';
    // Reunião/encontro de ciclo (lançamento do ciclo comercial do Boticário), com as grafias
    // erradas das planilhas ("ENCOTRO", "CILO", "C05"). Se trouxer treinamento junto, conta como produto.
    if (/ciclo|\bcilo\b|\bc\d{2}\b/.test(k) && !/treinamento/.test(k)) return 'Encontro de ciclo';
    if (/produto|colecao|jornada|peak|marca|conversao|venda|live in|treinamento|skin|make|botik|botileza|servico|perfumaria|cabelo|beautybox|categorias|iaf|pratica|tecnologia|\bume\b/.test(k)) return 'Produto e vendas';
    return 'Outros';
  }

  const LOCAIS = [[/^sala todos somos sfera$/, 'Sala Somos Todos Sfera']];
  function local(v) {
    const s = String(v || '').replace(/\s+/g, ' ').trim();
    const m = LOCAIS.find(([re]) => re.test(N(s)));
    return m ? m[1] : s || null;
  }

  function multiplicadoras(v) {
    return String(v || '').split(/\s*(?:&|\/|,|\be\b)\s*/i).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  // Hora do Excel (fração do dia, Date ou texto "09:30") → "HH:MM".
  function hora(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : `${String(v.getHours()).padStart(2, '0')}:${String(v.getMinutes()).padStart(2, '0')}`;
    if (typeof v === 'number') { const min = Math.round((v % 1) * 1440); return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`; }
    const m = String(v).trim().match(/^(\d{1,2}):(\d{2})/);
    return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
  }
  const minutos = h => (h ? +h.slice(0, 2) * 60 + +h.slice(3, 5) : null);
  // "Volume de horas": fração do dia (formato hora) ou número de horas.
  function duracao(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return I.num(v);
    if (typeof v === 'number') return v < 1 ? v * 24 : v;
    const m = String(v).trim().match(/^(\d+):(\d{2})/);
    return m ? +m[1] + +m[2] / 60 : I.num(v);
  }
  const inteiro = v => { const n = I.num(v); return n == null ? null : Math.round(n); };

  // ------------------------------------------------------------------
  function escolherAba(wb) {
    const ocultas = new Set(((wb.Workbook && wb.Workbook.Sheets) || []).filter(s => s.Hidden).map(s => s.name));
    let melhor = null;
    for (const nome of wb.SheetNames) {
      const ws = wb.Sheets[nome];
      // O cabeçalho pode não estar na 1ª linha (a aba antiga tem título em cima).
      const matriz = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
      // Texto formatado ("10:00", "08:00"): horário lido como Date sai deslocado no SheetJS.
      const texto = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
      const iCab = matriz.findIndex(l => COLUNAS.every(c => l.some(x => N(x) === N(c))) && COL_MULTI.some(c => l.some(x => N(x) === N(c))));
      if (iCab < 0) continue;
      const cab = matriz[iCab].map(x => String(x).trim());
      const linhas = matriz.slice(iCab + 1).map((l, i) => ({ l, t: texto[iCab + 1 + i] || [], n: iCab + i + 2 })).filter(x => x.l.some(v => v !== '' && v != null));
      const cand = { nome, cab, linhas, oculta: ocultas.has(nome) };
      // Prefere a aba visível; entre iguais, a com mais linhas.
      if (!melhor || (melhor.oculta && !cand.oculta) || (melhor.oculta === cand.oculta && cand.linhas.length > melhor.linhas.length)) melhor = cand;
    }
    if (!melhor) throw new Error('Não encontrei a aba de controle de treinamentos (colunas ' + COLUNAS.join(', ') + ' e Multiplicador(a) ou Instrutor).');
    return melhor;
  }

  function parse(wb, opts) {
    opts = opts || {};
    const aba = escolherAba(wb);
    const idx = {};
    aba.cab.forEach((c, i) => { const k = N(c); if (k && !(k in idx)) idx[k] = i; });
    const col = (l, ...nomes) => { for (const n of nomes) { const i = idx[N(n)]; if (i !== undefined && l[i] !== '' && l[i] != null) return l[i]; } return ''; };

    const avisos = [];
    const turmas = [];
    let semData = 0;
    const foraDoPrazo = [];
    const hoje = opts.hoje || new Date().toISOString().slice(0, 10);
    // Data só com o dia ("09.") e o mês por extenso em "Mês de Ref." ("Setembro"),
    // como na planilha da Anna: ano corrente, ou o anterior se o mês ainda não chegou.
    const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const hojeRef = opts.hoje || new Date().toISOString().slice(0, 10);
    function dataDaLinha(l) {
      const v = col(l, 'Data');
      const soDia = String(v).trim().match(/^(\d{1,2})\.?$/);
      const mesRef = N(col(l, 'Mês de Ref.:', 'Mês Ref.:', 'Mês de Ref.', 'Mês Ref.', 'Mês'));
      const mes = MESES.findIndex(m => mesRef.startsWith(m.slice(0, 3)));
      if (soDia && mes >= 0) {
        let ano = +hojeRef.slice(0, 4);
        if (mes + 1 > +hojeRef.slice(5, 7)) ano--;
        return `${ano}-${String(mes + 1).padStart(2, '0')}-${soDia[1].padStart(2, '0')}`;
      }
      return I.toISODate(v);
    }
    for (const { l, t: lt, n } of aba.linhas) {
      const data = dataDaLinha(l);
      const t = tema(col(l, 'Tema'));
      if (!t && !data) continue;
      if (!data) { semData++; continue; }
      // Data digitada errada (ex.: 2029, 2001): fica de fora e vira aviso.
      if (data > hoje || data < '2020-01-01') { foraDoPrazo.push(`linha ${n} (${data.split('-').reverse().join('/')})`); continue; }
      const hi = hora(col(lt, 'Início', 'Inicio') || col(l, 'Início', 'Inicio')), hf = hora(col(lt, 'Fim') || col(l, 'Fim'));
      const volTexto = String(col(lt, 'Volume de horas', 'Volume de Horas')).trim();
      let horas = /^\d+:\d{2}/.test(volTexto) ? duracao(volTexto) : duracao(col(l, 'Volume de horas', 'Volume de Horas'));
      const pelaAgenda = hi && hf ? (minutos(hf) - minutos(hi)) / 60 : null;
      if (horas == null && pelaAgenda > 0) horas = pelaAgenda;
      // "####" do Excel (hora negativa, fim em branco): vira "sem duração", nunca horas negativas.
      const durInvalida = horas != null && !(horas > 0);
      if (durInvalida) horas = null;
      const conv = inteiro(col(l, 'Convocados')), pres = inteiro(col(l, 'Presentes'));
      const alertas = [];
      if (conv != null && pres != null && pres > conv) alertas.push(`presentes (${pres}) maior que convocados (${conv})`);
      if (horas != null && pelaAgenda > 0 && Math.abs(horas - pelaAgenda) > 0.05) alertas.push(`volume de horas (${horas.toFixed(2).replace('.', ',')} h) diferente do horário (${pelaAgenda.toFixed(2).replace('.', ',')} h)`);
      if (conv == null || pres == null) alertas.push('sem convocados ou presentes');
      if (durInvalida) alertas.push('duração negativa ou zerada (horário de fim em branco?)');
      const marcaOrig = I.str(col(l, 'Marca')) || I.str(col(l, 'Origem'));
      const ms = marcas(marcaOrig);
      if (!ms.length) alertas.push('sem marca');
      const multisOrig = I.str(col(l, ...COL_MULTI));
      const multis = multiplicadoras(multisOrig);
      if (!multis.length) alertas.push('sem multiplicadora');
      turmas.push({
        linha: n, data, tema: t, tema_original: I.str(col(l, 'Tema')), categoria: categoria(t),
        modalidade: modalidade(col(l, 'Modalidade')), local: local(col(l, 'Local', 'Local do Treinamento')),
        hora_inicio: hi, hora_fim: hf, horas: horas == null ? null : Math.round(horas * 100) / 100,
        publico: publico(col(l, 'Alvo', 'Público')), marcas: ms, marca_original: marcaOrig,
        canal: canal(col(l, 'Canal')), convocados: conv, presentes: pres,
        multiplicadoras: multis, multiplicador_original: multisOrig, alertas
      });
    }
    if (!turmas.length) throw new Error('A planilha não tem turmas com data válida' + (foraDoPrazo.length ? ` (datas fora do esperado: ${foraDoPrazo.slice(0, 5).join(', ')})` : '') + '.');

    // Nome curto da instrutora ("Myllena", "Anna") vira o nome completo do arquivo
    // ("Controle Treinamento_ Myllena Figueiredo.xlsx"), se o primeiro nome bater.
    const doArquivo = String(opts.arquivo || '').replace(/\.[^.]+$/, '').replace(/\(\d+\)\s*$/, '').split('_').slice(1).join(' ').replace(/\s+/g, ' ').trim();
    if (doArquivo) {
      const ta = N(doArquivo).split(' ');
      const expandir = m => { const tm = N(m).split(' '); return tm.length < ta.length && tm[0] === ta[0] && tm.every(x => ta.includes(x)) ? doArquivo : m; };
      turmas.forEach(t => { t.multiplicadoras = t.multiplicadoras.map(expandir).filter((v, i, a) => a.indexOf(v) === i); });
    }

    // Dona da planilha: a multiplicadora que mais aparece nas turmas.
    const conta = new Map();
    turmas.forEach(t => t.multiplicadoras.forEach(m => conta.set(m, (conta.get(m) || 0) + 1)));
    const planilha = Array.from(conta.entries()).sort((a, b) => b[1] - a[1])[0];
    if (!planilha) throw new Error('Nenhuma turma tem multiplicadora preenchida.');

    // Mesma turma já enviada na planilha de outra multiplicadora (turma em dupla).
    const chave = t => [t.data, t.hora_inicio || '', N(t.tema)].join('|');
    // Outras planilhas e qualquer turma já lançada no Hub (inclusive da própria multiplicadora).
    const outras = new Map((opts.existentes || []).filter(x => x.planilha !== planilha[0] || x.origem === 'hub').map(x => [chave(x), x.origem === 'hub' ? 'lançamentos do Hub' : 'planilha de ' + x.planilha]));
    const repetidas = turmas.filter(t => outras.has(chave(t)));
    if (repetidas.length) avisos.push(`${repetidas.length} turma(s) também estão em ${Array.from(new Set(repetidas.map(t => outras.get(chave(t))))).join(', ')} (mesma data, horário e tema) e vão contar duas vezes: ${repetidas.slice(0, 5).map(t => `${t.data.split('-').reverse().join('/')} ${t.tema}`).join('; ')}. Mantenha a turma em um lugar só.`);

    const comAlerta = turmas.filter(t => t.alertas.length);
    if (comAlerta.length) avisos.push(`${comAlerta.length} turma(s) com inconsistência: ` + comAlerta.slice(0, 8).map(t => `linha ${t.linha} (${t.alertas.join('; ')})`).join(' · ') + (comAlerta.length > 8 ? ' ...' : '') + '.');
    if (semData) avisos.push(`${semData} linha(s) sem data ficaram de fora.`);
    if (foraDoPrazo.length) avisos.push(`${foraDoPrazo.length} linha(s) com data fora do esperado (no futuro ou antes de 2020) ficaram de fora — corrija na planilha: ${foraDoPrazo.slice(0, 8).join(', ')}${foraDoPrazo.length > 8 ? ' ...' : ''}.`);
    const ajustadas = turmas.filter(t => t.tema !== String(t.tema_original || '').trim().toUpperCase().replace(/\s+/g, ' ')).length;
    if (ajustadas) avisos.push(`${ajustadas} tema(s) com erro de digitação corrigido(s) (ex.: "NTEGRAÇÃO" → "INTEGRAÇÃO").`);

    const datas = turmas.map(t => t.data).sort();
    return {
      planilha: planilha[0], aba: aba.nome, turmas, avisos,
      resumo: { turmas: turmas.length, de: datas[0], ate: datas[datas.length - 1], horas: turmas.reduce((s, t) => s + (t.horas || 0), 0), presentes: turmas.reduce((s, t) => s + (t.presentes || 0), 0) }
    };
  }

  window.HUB_PARSERS_TURMAS = { parse, _internal: { marcas, publico, canal, modalidade, tema, categoria, local, multiplicadoras, hora, duracao } };
})();
