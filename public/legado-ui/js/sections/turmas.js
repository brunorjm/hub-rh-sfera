// Treinamento e Desenvolvimento → Turmas e Multiplicadoras: turmas presenciais e
// online dadas pelas multiplicadoras (tabela treinamento_turmas). Duas abas:
//   Indicadores   contas sobre todas as turmas visíveis (metrics-turmas.js)
//   Lançamentos   a multiplicadora lança as próprias turmas (mesmo molde do
//                 Controle de Desligamento); turmas de planilha aparecem só para leitura
// Acesso (14/10/2026, supabase-treinamento-turmas-permissoes.sql — o banco aplica as mesmas regras):
//   treinamento_dev.turmas_gestor  gestor de T&D: vê, edita e exclui tudo, valida ou devolve
//                                  justificativas, pede ajustes, altera mês fechado
//   treinamento_dev.turmas_lancar  multiplicadora: vê e lança só as próprias turmas; edita até o
//                                  mês ser fechado no Fechamento do Período; justifica sempre
//   treinamento_dev.turmas         RH geral: vê tudo, somente leitura
//
// A tela tem seletores próprios (período, multiplicadora, marca, tipo): a barra
// de filtros do topo é de unidade/departamento, que estas turmas não têm.
(function () {
  const U = HUB_UTILS;
  const T = HUB_METRICS_TURMAS;
  const { kpi, empty, card, barChart, comboChart } = HUB_UI;
  const esc = s => U.escapeHtml(s == null ? '' : String(s));

  const hoje = new Date();
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  const state = { aba: null, de: `${hoje.getFullYear()}-01`, ate: mesAtual, multiplicadora: '', marca: '', categoria: '', mostrarTodas: false, busca: '', pendencia: '' };
  const tem = k => HUB_PERMISSIONS.hasPerm(window.HUB_USER, k);
  const ehGestor = () => tem('treinamento_dev.turmas_gestor');
  const podeVerTudo = () => ehGestor() || tem('treinamento_dev.turmas');
  const podeLancar = () => ehGestor() || tem('treinamento_dev.turmas_lancar');
  const dono = x => !!(x && x.criado_por && window.HUB_USER && x.criado_por === HUB_USER.id);

  // Meses fechados no Fechamento do Período ('AAAA-MM'), lidos uma vez por sessão.
  let fechados = null;
  const mesFechado = data => !!(fechados && data && fechados.includes(String(data).slice(0, 7)));
  // Editar todos os campos: o gestor sempre; a multiplicadora, a própria turma até o mês ser fechado.
  const podeEditar = x => ehGestor() || (podeLancar() && dono(x) && !mesFechado(x.data));
  // A justificativa continua liberada para a dona da turma mesmo com o mês fechado.
  const podeJustificar = x => ehGestor() || (podeLancar() && dono(x));

  const int = v => (v == null ? '—' : U.fmtInt(Math.round(v)));
  const hrs = v => (v == null ? '—' : `${U.fmt1(v)} h`);
  const pct = v => (v == null ? '—' : U.fmtPct(v, 0));
  const fimDoMes = m => { const [y, mm] = m.split('-').map(Number); return new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10); };
  const dataBR = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
  const nota = txt => `<p class="sub" style="color:var(--muted);font-size:11.5px;margin:0 0 12px">${txt}</p>`;

  // "▲ 12%" contra o mesmo período do ano anterior.
  function variacao(atual, anterior) {
    if (anterior == null || !anterior) return '';
    const v = (atual - anterior) / anterior;
    if (Math.abs(v) < 0.005) return '= ao ano anterior';
    return `<span style="color:${v > 0 ? '#0f8a4c' : 'var(--critical)'}">${v > 0 ? '▲' : '▼'} ${U.fmtPct(Math.abs(v), 0)}</span> vs. ano anterior`;
  }

  function tabela(linhas, primeira) {
    if (!linhas.length) return empty('Sem turmas.');
    return `<div class="table-wrap fit"><table class="dt fit"><thead><tr><th>${primeira}</th><th>Turmas</th><th>Horas de turma</th><th>Horas entregues</th><th>Presentes</th><th>Aderência</th></tr></thead><tbody>
      ${linhas.map(x => `<tr><td>${esc(x.label)}</td><td>${int(x.turmas)}</td><td>${hrs(x.horas)}</td><td>${int(x.horasPessoa)}</td><td>${int(x.presentes)}</td><td>${pct(x.presenca)}</td></tr>`).join('')}
    </tbody></table></div>`;
  }

  // Rótulo longo em duas ou mais linhas (o Chart.js aceita lista), para não cortar.
  function quebrar(texto, max) {
    const linhas = [];
    let atual = '';
    for (const p of String(texto).split(/\s+/)) {
      if (atual && (atual + ' ' + p).length > max) { linhas.push(atual); atual = p; } else atual = atual ? atual + ' ' + p : p;
    }
    if (atual) linhas.push(atual);
    return linhas.length > 1 ? linhas : texto;
  }

  // Quadro do fim da página: de onde vem e como é calculado cada número.
  function explicacao(f) {
    const itens = [
      ['De onde vêm os dados', 'Dos lançamentos das multiplicadoras na aba Lançamentos (desde 14/10/2026). O histórico até outubro/2026 veio das planilhas "Controle de Treinamentos" de cada multiplicadora e das abas antigas do time (2024–2025) e também virou lançamento. O período escolhido no topo filtra pela data da turma.'],
      ['Turmas', 'Quantidade de turmas realizadas no período. Turma dada por duas multiplicadoras conta uma vez no total.'],
      ['Horas de treinamento', 'Soma da duração das turmas (coluna "Volume de horas"). Mostra o tempo que as multiplicadoras passaram em sala — o esforço de quem treina, sem importar quantas pessoas estavam presentes.'],
      ['Horas entregues', 'Duração da turma × presentes, somado no período. Mostra quanto treinamento chegou às pessoas. Exemplo: uma integração de 8 h com 2 presentes entrega 16 h; um treinamento de 4 h com 16 presentes entrega 64 h. Por isso muitas turmas pequenas podem entregar menos horas que poucas turmas grandes.'],
      ['Presentes', 'Soma dos presentes de todas as turmas. Uma pessoa que fez duas turmas conta duas vezes (o lançamento não traz nomes).'],
      ['Aderência', 'Presentes ÷ convocados. Pode passar de 100% quando vieram mais pessoas que as convocadas — a turma fica marcada para a multiplicadora justificar o motivo.'],
      ['Setas ▲ ▼', 'Comparação com o mesmo período do ano anterior: ' + `${dataBR(T.umAnoAntes(f.de))} a ${dataBR(T.umAnoAntes(f.ate))}` + '. Verde subiu, vermelho caiu.'],
      ['Gráfico "Por mês"', 'Barras azuis (eixo da esquerda) = horas entregues no mês. Linha verde (eixo da direita) = número de turmas no mês. Linha alta com barra baixa = muitas turmas pequenas; barra alta = treinamento com muita gente no mês. Passe o mouse para ver os dois números.'],
      ['Por multiplicadora, marca, tipo, público e canal', 'As mesmas contas separadas por grupo. Turma em dupla entra na linha de cada multiplicadora; turma de mais de uma marca (ex.: "Sfera/Boti") entra em cada marca — por isso a soma das linhas pode passar do total. O tipo sai do tema: integração/onboarding, liderança e comportamento, encontro de ciclo (reunião de lançamento do ciclo, sem treinamento junto), produto e vendas.'],
      ['Cobertura da integração', 'Estimativa: presentes nas turmas de integração ÷ admitidos no período (cadastro de Colaboradores), por marca. Sfera = Escritório. Não é exata: sem a lista de quem participou, não dá para cruzar pessoa a pessoa; a integração pode cair no mês seguinte à admissão; e há turmas com revendedores. Marca cujas multiplicadoras não lançam no Hub aparece com cobertura baixa.'],
      ['Gráfico "Temas"', 'Horas entregues por tema no período, do maior para o menor.'],
      ['Turmas e "Divergências"', 'A lista de turmas do período, da mais recente para a mais antiga. Em amarelo, as que têm divergência: mais presentes que convocados, falta de horário, duração, presentes, local, tema ou instrutor, ou duração diferente do horário. O quadro Divergências mostra cada uma com a justificativa da multiplicadora (ou "a justificar"); a justificativa é escrita na aba Lançamentos e fica "aguardando validação" até o gestor de T&D validar ou devolver.'],
      ['Quem pode o quê', 'Gestor de T&D: vê, edita e exclui todas as turmas, valida ou devolve justificativas e pede ajustes. Multiplicadora: vê e lança só as próprias turmas e edita até o mês ser fechado no Fechamento do Período (depois disso, só a justificativa). RH: somente leitura. Toda alteração fica no histórico da turma.'],
    ];
    return `<dl style="margin:0;display:grid;grid-template-columns:minmax(160px,230px) 1fr;gap:10px 18px;font-size:12.5px;line-height:1.5">
      ${itens.map(([t, x]) => `<dt style="font-weight:700">${esc(t)}</dt><dd style="margin:0;color:var(--muted)">${esc(x)}</dd>`).join('')}
    </dl>`;
  }

  function opcoes(valores, atual, todos) {
    return `<option value="">${todos}</option>` + valores.map(v => `<option value="${esc(v)}"${v === atual ? ' selected' : ''}>${esc(v)}</option>`).join('');
  }

  // O que pede ação de quem está usando: a multiplicadora ajusta ou justifica as próprias
  // turmas; o gestor valida as justificativas que chegaram.
  function minhasPendencias() {
    const todas = (window.HUB_DATA && HUB_DATA.treinamento_turmas) || [];
    return {
      acao: podeLancar() ? todas.filter(x => dono(x) && T.precisaAcao(x)) : [],
      validar: ehGestor() ? todas.filter(x => T.aguardaGestor(x)) : []
    };
  }
  // Número no item do menu (chamado depois de carregar os dados e de cada gravação).
  function avisoMenu() {
    const item = document.querySelector('.nav-item[data-section="tre-turmas"]');
    if (!item) return;
    const p = minhasPendencias();
    const n = p.acao.length + p.validar.length;
    let b = item.querySelector('.tt-aviso');
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'tt-aviso'; b.style.cssText = 'margin-left:auto;background:#D03B3B;color:#fff;border-radius:10px;padding:0 7px;font-size:11px;font-weight:700;line-height:18px'; item.appendChild(b); }
    b.textContent = n;
    b.title = [p.acao.length ? p.acao.length + ' turma(s) suas para ajustar ou justificar' : '', p.validar.length ? p.validar.length + ' justificativa(s) aguardando validação' : ''].filter(Boolean).join(' · ');
  }
  window.HUB_TURMAS_AVISO = avisoMenu;

  function renderTurmas(el) {
    if (fechados == null && window.HUB_DAL && HUB_DAL.mesesFechadosTurmas) {
      fechados = [];
      HUB_DAL.mesesFechadosTurmas().then(l => { fechados = l; if (l.length && el.isConnected) HUB_RENDER_CURRENT(); });
    }
    avisoMenu();
    if (!state.aba) state.aba = podeVerTudo() ? 'indicadores' : 'lancamentos';
    el.innerHTML = `<div class="tab-bar">${[['indicadores', 'Indicadores'], ['lancamentos', 'Lançamentos']].map(([k, l]) => `<button class="tab-btn${state.aba === k ? ' active' : ''}" data-aba="${k}">${l}</button>`).join('')}</div><div id="tt-corpo"></div>`;
    el.querySelectorAll('.tab-btn[data-aba]').forEach(b => b.addEventListener('click', () => { state.aba = b.dataset.aba; renderTurmas(el); }));
    const corpo = el.querySelector('#tt-corpo');
    if (state.aba === 'lancamentos') abaLancamentos(corpo); else abaIndicadores(corpo);
  }

  function abaIndicadores(el) {
    const todas = (window.HUB_DATA && HUB_DATA.treinamento_turmas) || [];
    if (!todas.length) {
      el.innerHTML = empty('Nenhuma turma ainda.', HUB_PERMISSIONS.hasPerm(HUB_USER, 'admin.upload')
        ? 'Lance as turmas na aba Lançamentos, ou envie a planilha "Controle de Treinamentos" de cada multiplicadora em Administração → Upload de Planilhas.'
        : 'Lance as turmas na aba Lançamentos.');
      return;
    }
    const f = { de: state.de + '-01', ate: fimDoMes(state.ate), multiplicadora: state.multiplicadora, marca: state.marca, categoria: state.categoria };
    const d = T.painel(todas, f, (window.HUB_DATA && HUB_DATA.colaboradores) || []);
    const t = d.total, a = d.anterior;
    const multis = Array.from(new Set(todas.flatMap(x => x.multiplicadoras || []))).sort((x, y) => x.localeCompare(y, 'pt-BR'));
    const marcas = Array.from(new Set(todas.flatMap(x => x.marcas || []))).sort((x, y) => x.localeCompare(y, 'pt-BR'));
    const cats = Array.from(new Set(todas.map(x => x.categoria).filter(Boolean))).sort();
    const ultimaImportacao = todas.map(x => x.importado_em).filter(Boolean).sort().pop();

    const filtros = `<div class="fbar">
      <div class="fg"><label>De</label><input type="month" id="tt-de" value="${state.de}"></div>
      <div class="fg"><label>Até</label><input type="month" id="tt-ate" value="${state.ate}"></div>
      <div class="fg"><label>Multiplicadora</label><select id="tt-multi">${opcoes(multis, state.multiplicadora, 'Todas')}</select></div>
      <div class="fg"><label>Marca</label><select id="tt-marca">${opcoes(marcas, state.marca, 'Todas')}</select></div>
      <div class="fg"><label>Tipo</label><select id="tt-cat">${opcoes(cats, state.categoria, 'Todos')}</select></div>
      <span style="flex-basis:100%;text-align:right;color:var(--muted);font-size:11.5px">Planilhas: ${esc(d.planilhas.join(', '))}${ultimaImportacao ? ` · importadas até ${dataBR(ultimaImportacao)}` : ''}</span>
    </div>`;

    if (!t.turmas) {
      el.innerHTML = filtros + empty('Nenhuma turma no período e filtros escolhidos.');
      ligar(el);
      return;
    }

    const cobertura = d.cobertura.filter(x => x.admitidos || x.integrados);
    const coberturaHtml = cobertura.length ? `${nota('Estimativa: presentes nas turmas de integração ÷ admitidos no período (cadastro de Colaboradores), por marca. Sem a lista de participantes, não dá para saber quem foi integrado — a integração pode cair no mês seguinte à admissão, e há turmas com revendedores. Marca cujas multiplicadoras não lançam no Hub aparece com poucos integrados.')}
      <div class="table-wrap fit"><table class="dt fit"><thead><tr><th>Marca</th><th>Presentes em integração</th><th>Admitidos</th><th>Cobertura estimada</th></tr></thead><tbody>
      ${cobertura.map(x => `<tr><td>${esc(x.marca)}</td><td>${int(x.integrados)}</td><td>${int(x.admitidos)}</td><td>${x.cobertura == null ? '—' : `<b style="color:${x.cobertura >= 0.9 ? '#0f8a4c' : x.cobertura >= 0.6 ? '#b7791f' : 'var(--critical)'}">${pct(x.cobertura)}</b>`}</td></tr>`).join('')}
      </tbody></table></div>` : empty('Sem integrações nem admissões no período.');

    const lista = d.lista.slice().sort((x, y) => String(y.data).localeCompare(String(x.data)));
    const mostrar = state.mostrarTodas ? lista : lista.slice(0, 50);
    const turmasHtml = `<div class="table-wrap" style="max-height:520px"><table class="dt"><thead><tr><th>Data</th><th>Tema</th><th>Tipo</th><th>Marca</th><th>Canal</th><th>Público</th><th>Modalidade</th><th>Local</th><th>Horário</th><th>Horas</th><th>Presentes</th><th>Multiplicadora</th></tr></thead><tbody>
      ${mostrar.map(x => `<tr${T.pendencias(x).length ? ` title="${esc(T.pendencias(x).join('; '))}" style="background:#FFF8E6"` : ''}><td>${dataBR(x.data)}</td><td>${esc(x.tema)}</td><td>${esc(x.categoria)}</td><td>${esc((x.marcas || []).join(', '))}</td><td>${esc(x.canal)}</td><td>${esc(x.publico)}</td><td>${esc(x.modalidade)}</td><td>${esc(x.local)}</td><td>${x.hora_inicio ? `${esc(x.hora_inicio)}–${esc(x.hora_fim || '')}` : '—'}</td><td>${hrs(x.horas)}</td><td>${x.presentes == null ? '—' : `${int(x.presentes)}/${int(x.convocados)}`}</td><td>${esc((x.multiplicadoras || []).join(', '))}</td></tr>`).join('')}
      </tbody></table></div>${lista.length > 50 ? `<button type="button" class="btn btn-outline btn-sm" id="tt-todas" style="margin-top:10px">${state.mostrarTodas ? 'Mostrar só as 50 mais recentes' : `Mostrar todas as ${lista.length}`}</button>` : ''}`;

    const pendHtml = d.comPendencia.length ? `<div class="table-wrap" style="max-height:360px"><table class="dt"><thead><tr><th>Data</th><th>Tema</th><th>Multiplicadora</th><th>Divergência</th><th>Justificativa</th><th>Situação</th></tr></thead><tbody>
      ${d.comPendencia.map(x => `<tr><td>${dataBR(x.data)}</td><td>${esc(x.tema)}</td><td>${esc((x.multiplicadoras || []).join(', '))}</td><td>${esc(T.pendencias(x).join('; '))}</td><td>${x.justificativa ? esc(x.justificativa) : '<b style="color:var(--critical)">a justificar</b>'}</td><td>${sitBadge(x)}</td></tr>`).join('')}
      </tbody></table></div>` : '';

    el.innerHTML = filtros + `
      <div class="kpi-grid">
        ${kpi('Turmas', int(t.turmas), variacao(t.turmas, a && a.turmas) || `${t.multiplicadoras} multiplicadora(s)`, 'var(--p1)')}
        ${kpi('Horas de treinamento', hrs(t.horas), variacao(t.horas, a && a.horas) || 'soma da duração das turmas', '#eda100')}
        ${kpi('Horas entregues', int(t.horasPessoa), (variacao(t.horasPessoa, a && a.horasPessoa) ? variacao(t.horasPessoa, a && a.horasPessoa) + ' · ' : '') + 'duração × presentes', '#4a3aa7')}
        ${kpi('Presentes', int(t.presentes), variacao(t.presentes, a && a.presentes) || `de ${int(t.convocados)} convocados`, '#1baf7a')}
        ${kpi('Aderência', pct(t.presenca), a && a.presenca != null ? `${pct(a.presenca)} no mesmo período do ano anterior` : 'presentes ÷ convocados', 'var(--p2)')}
      </div>
      ${nota(`Comparação com ${dataBR(T.umAnoAntes(f.de))} a ${dataBR(T.umAnoAntes(f.ate))}. Como cada número é calculado: veja "Como ler os indicadores", no fim da página.`)}
      <div class="grid2">
        ${card('Por mês', '&#128200;', '<div class="chart-h"><canvas id="c-tt-mes"></canvas></div>', { full: true })}
        ${card('Por multiplicadora', '&#128100;', tabela(d.porMultiplicadora, 'Multiplicadora'))}
        ${card('Por marca', '&#127970;', nota('Turma de mais de uma marca entra em cada uma.') + tabela(d.porMarca, 'Marca'))}
        ${card('Por tipo de turma', '&#128202;', tabela(d.porCategoria, 'Tipo'))}
        ${card('Por público e canal', '&#128101;', tabela(d.porPublico, 'Público') + '<div style="height:12px"></div>' + tabela(d.porCanal, 'Canal'))}
        ${card('Cobertura da integração', '&#127919;', coberturaHtml, { full: true })}
        ${card('Temas', '&#128218;', '<div class="chart-scroll"><div class="chart-inner" id="c-tt-tema-wrap"><canvas id="c-tt-tema"></canvas></div></div>', { full: true })}
        ${card(`Turmas (${int(lista.length)})`, '&#128203;', nota('Linhas em amarelo têm divergência (passe o mouse); a justificativa é escrita na aba Lançamentos.') + turmasHtml, { full: true })}
        ${d.comPendencia.length ? card(`Divergências (${d.comPendencia.length} · ${d.comPendencia.filter(x => T.situacao(x) === 'justificar').length} a justificar · ${d.comPendencia.filter(T.aguardaGestor).length} aguardando validação)`, '&#9888;&#65039;', pendHtml, { full: true }) : ''}
        ${card('Como ler os indicadores', '&#8505;&#65039;', explicacao(f), { full: true })}
      </div>`;

    // Número de turmas só no tooltip: rótulo da linha em cima da barra embolava.
    comboChart('c-tt-mes', d.porMes.map(x => x.label), { label: 'Horas entregues', data: d.porMes.map(x => Math.round(x.horasPessoa)) }, { label: 'Turmas', data: d.porMes.map(x => x.turmas), rotulos: false });
    const temas = d.porTema.slice().sort((x, y) => y.horasPessoa - x.horasPessoa);
    document.getElementById('c-tt-tema-wrap').style.height = Math.max(temas.reduce((s, x) => s + (x.label.length > 34 ? 46 : 32), 0), 200) + 'px';
    const gt = barChart('c-tt-tema', temas.map(x => quebrar(x.label, 34)), temas.map(x => Math.round(x.horasPessoa)), { horizontal: true, singleColor: U.color(0) });
    // Todos os temas com nome (o Chart.js pula rótulos quando acha que não cabem).
    if (gt) { gt.options.scales.y.ticks = Object.assign({}, gt.options.scales.y.ticks, { autoSkip: false }); gt.update(); }
    ligar(el);
  }

  function ligar(el) {
    const on = (id, fn) => { const x = el.querySelector('#' + id); if (x) x.addEventListener('change', e => { fn(e.target.value); HUB_RENDER_CURRENT(); }); };
    on('tt-de', v => { if (v) state.de = v; if (state.ate < state.de) state.ate = state.de; });
    on('tt-ate', v => { if (v) state.ate = v; if (state.ate < state.de) state.de = state.ate; });
    on('tt-multi', v => { state.multiplicadora = v; });
    on('tt-marca', v => { state.marca = v; });
    on('tt-cat', v => { state.categoria = v; });
    const b = el.querySelector('#tt-todas');
    if (b) b.addEventListener('click', () => { state.mostrarTodas = !state.mostrarTodas; HUB_RENDER_CURRENT(); });
  }

  // ==================================================================
  // LANÇAMENTOS
  // ==================================================================
  // Desde 14/10/2026 todas as turmas são lançamentos do Hub (as planilhas deixaram
  // de ser usadas). Divergências (metrics-turmas.js, PENDENCIAS) não são corrigidas
  // pelo RH: ficam marcadas e a multiplicadora escreve a justificativa.
  const MARCAS = ["Levi's", 'Hering', 'Sfera', 'O Boticário', 'O Boticário VD', 'Quem disse, Berenice?'];
  const TIPOS = ['Integração e onboarding', 'Produto e vendas', 'Encontro de ciclo', 'Liderança e comportamento', 'Outros'];
  const meuNome = () => (window.HUB_USER && (HUB_USER.nome || HUB_USER.email)) || '';
  // Nome da multiplicadora nas turmas (o da conta pode ser mais longo: "Maria Eduarda
  // Figueira de Campos Vasconcelos" lança como "Maria Eduarda Vasconcelos"): o mais
  // usado nas turmas ligadas à conta dela; sem turmas, o nome da conta.
  function meuNomeMulti() {
    const id = window.HUB_USER && HUB_USER.id;
    const conta = {};
    ((window.HUB_DATA && HUB_DATA.treinamento_turmas) || []).forEach(t => { if (id && t.criado_por === id && (t.multiplicadoras || [])[0]) conta[t.multiplicadoras[0]] = (conta[t.multiplicadoras[0]] || 0) + 1; });
    return Object.entries(conta).sort((a, b) => b[1] - a[1]).map(x => x[0])[0] || meuNome();
  }
  const pctAder = (p, c) => (p == null || !c ? '—' : U.fmtPct(p / c, 0));
  const pill = (cor, txt) => `<span class="ave-pill" style="--c:${cor}">${txt}</span>`;
  function sitBadge(x) {
    const sit = T.situacao(x);
    if (sit === 'ajuste') return pill('#D03B3B', 'Ajuste pedido');
    if (sit === 'justificar') return pill('#D03B3B', x.validacao === 'devolvida' ? 'Devolvida' : 'Justificar');
    if (sit === 'aguardando') return pill('#B7791F', 'Aguardando validação');
    if (sit === 'validada') return pill('#0F8A4C', 'Validada');
    return '';
  }
  // Rótulo do botão da linha.
  function acaoLinha(x) {
    const sit = T.situacao(x);
    if (ehGestor() && sit === 'aguardando') return 'Validar';
    if (podeJustificar(x) && sit === 'ajuste') return 'Ajustar';
    if (podeJustificar(x) && sit === 'justificar') return 'Justificar';
    return podeEditar(x) ? 'Editar' : 'Ver';
  }
  // Filtro "Situação".
  const FILTRO_SIT = [
    ['acao', 'Precisam de ação da multiplicadora', x => T.precisaAcao(x)],
    ['aguardando', 'Aguardando validação do gestor', x => T.aguardaGestor(x)],
    ['validada', 'Justificativas validadas', x => T.situacao(x) === 'validada'],
    ['ok', 'Sem divergência', x => T.situacao(x) === 'ok']
  ];

  function abaLancamentos(el) {
    const todas = ((window.HUB_DATA && HUB_DATA.treinamento_turmas) || []);
    const de = state.de + '-01', ate = fimDoMes(state.ate);
    const busca = U.normalizeText(state.busca);
    const noPeriodo = todas.filter(x => { const d = String(x.data).slice(0, 10); return d >= de && d <= ate; });
    const lista = noPeriodo.filter(x => {
      if (state.multiplicadora && !(x.multiplicadoras || []).includes(state.multiplicadora)) return false;
      const fil = FILTRO_SIT.find(p => p[0] === state.pendencia);
      if (fil && !fil[2](x)) return false;
      if (busca && !U.normalizeText([x.tema, x.local, (x.marcas || []).join(' '), (x.multiplicadoras || []).join(' ')].join(' ')).includes(busca)) return false;
      return true;
    }).sort((x, y) => String(y.data).localeCompare(String(x.data)) || String(y.hora_inicio || '').localeCompare(String(x.hora_inicio || '')));
    const multis = Array.from(new Set(todas.flatMap(x => x.multiplicadoras || []))).sort((x, y) => x.localeCompare(y, 'pt-BR'));
    const aJustificar = noPeriodo.filter(x => T.precisaAcao(x)).length;
    const pend = minhasPendencias();
    // Aviso no topo: o que precisa da ação de quem está usando, em qualquer período.
    const avisoLinhas = (lista, extra) => lista.slice().sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 6)
      .map(x => `<li>${dataBR(x.data)} · <b>${esc(x.tema)}</b> — ${esc(extra(x))}</li>`).join('') + (lista.length > 6 ? `<li>e mais ${lista.length - 6}</li>` : '');
    const motivo = x => (x.ajuste_pedido ? `ajuste pedido: ${x.gestor_comentario || ''}` : x.validacao === 'devolvida' ? `justificativa devolvida: ${x.gestor_comentario || ''}` : T.pendencias(x).join(', '));
    const aviso = (n, titulo, lista, extra, filtro) => (n ? `<div class="card" style="margin-bottom:12px;padding:12px 16px;border-left:4px solid ${filtro === 'aguardando' ? '#B7791F' : 'var(--critical)'}">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><b style="font-size:13px">${titulo}</b>
        <button type="button" class="btn btn-outline btn-sm" style="width:auto" data-ver="${filtro}">Ver na lista</button></div>
        <ul style="margin:6px 0 0 18px;font-size:12px;color:var(--muted)">${avisoLinhas(lista, extra)}</ul></div>` : '');
    const avisos = aviso(pend.acao.length, `Você tem ${pend.acao.length} turma(s) para ajustar ou justificar`, pend.acao, motivo, 'acao')
      + aviso(pend.validar.length, `${pend.validar.length} justificativa(s) aguardando a sua validação`, pend.validar, x => `${(x.multiplicadoras || []).join(', ')}: ${x.justificativa}`, 'aguardando');

    const linhas = lista.map(x => {
      const pend = T.pendencias(x);
      return `<tr data-id="${x.id}" style="cursor:pointer">
        <td>${dataBR(x.data)}</td>
        <td><b>${esc(x.tema)}</b>${x.observacao ? `<div style="font-size:11px;color:var(--muted)">${esc(x.observacao)}</div>` : ''}${pend.length ? `<div style="font-size:11px;color:${x.justificativa ? 'var(--muted)' : 'var(--critical)'}">${esc(pend.join(' · '))}${x.justificativa ? ` — ${esc(x.justificativa)}` : ''}</div>` : ''}${(x.ajuste_pedido || x.validacao === 'devolvida') && x.gestor_comentario ? `<div style="font-size:11px;color:var(--critical)">Gestor de T&amp;D: ${esc(x.gestor_comentario)}</div>` : ''}</td>
        <td>${esc((x.marcas || []).join(', '))}</td><td>${x.hora_inicio ? `${esc(x.hora_inicio)}–${esc(x.hora_fim || '')}` : '—'}</td><td>${hrs(x.horas)}</td>
        <td>${x.presentes == null ? '—' : `${int(x.presentes)}/${int(x.convocados)} · ${pctAder(x.presentes, x.convocados)}`}</td>
        <td>${esc((x.multiplicadoras || []).join(', '))}</td>
        <td>${sitBadge(x)}${mesFechado(x.data) ? '<div style="font-size:10.5px;color:var(--muted);margin-top:2px" title="Mês fechado no Fechamento do Período">&#128274; mês fechado</div>' : ''}</td>
        <td style="white-space:nowrap"><button type="button" class="btn btn-outline btn-sm" style="width:auto">${acaoLinha(x)}</button></td></tr>`;
    }).join('');

    el.innerHTML = avisos + `
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:12px">
        <span style="font-size:12.5px;color:var(--muted)">${int(lista.length)} turma(s)${podeVerTudo() ? '' : ' lançadas por você'} · ${aJustificar ? `<b style="color:var(--critical)">${int(aJustificar)} para ajustar ou justificar</b> no período` : 'nada para ajustar ou justificar no período'}${podeVerTudo() && !podeLancar() ? ' · <b>somente leitura</b>' : ''}</span>
        ${podeLancar() ? '<button type="button" class="btn btn-sm" style="width:auto" id="tt-novo">+ Lançar turma</button>' : ''}
      </div>
      <div class="fbar">
        <div class="fg" style="max-width:260px"><label>Buscar</label><input type="text" id="tt-busca" placeholder="Tema, local, marca..." value="${esc(state.busca)}"></div>
        <div class="fg"><label>De</label><input type="month" id="tt-de" value="${state.de}"></div>
        <div class="fg"><label>Até</label><input type="month" id="tt-ate" value="${state.ate}"></div>
        ${podeVerTudo() ? `<div class="fg"><label>Multiplicadora</label><select id="tt-multi">${opcoes(multis, state.multiplicadora, 'Todas')}</select></div>` : ''}
        <div class="fg"><label>Situação</label><select id="tt-pend"><option value="">Todas as turmas</option>${FILTRO_SIT.map(([k, l]) => `<option value="${k}"${state.pendencia === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>
      ${lista.length ? `<div class="table-wrap" style="max-height:640px"><table class="dt"><thead><tr><th>Data</th><th>Tema</th><th>Marca</th><th>Horário</th><th>Horas</th><th>Presentes · aderência</th><th>Multiplicadora</th><th>Situação</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`
        : empty('Nenhuma turma com esses filtros.', podeLancar() ? 'Clique em "+ Lançar turma" para registrar uma turma.' : '')}
      ${nota('Divergência = mais presentes que convocados, falta de horário, duração, presentes, local, tema ou instrutor, ou duração diferente do horário. A turma fica marcada "Justificar" até a multiplicadora explicar o motivo; depois fica "Aguardando validação" até o gestor de T&D validar ou devolver. O gestor também pode pedir um ajuste em qualquer turma. A multiplicadora edita as próprias turmas até o mês ser fechado no Fechamento do Período (&#128274;); depois disso, só a justificativa. Turmas de multiplicadoras sem conta no Hub são ajustadas pelo gestor de T&D.')}`;

    const novo = el.querySelector('#tt-novo');
    if (novo) novo.addEventListener('click', () => abrirFormulario(null));
    el.querySelectorAll('[data-id]').forEach(tr => tr.addEventListener('click', () => abrirFormulario(todas.find(x => String(x.id) === tr.dataset.id))));
    const buscaEl = el.querySelector('#tt-busca');
    buscaEl.addEventListener('change', () => { state.busca = buscaEl.value; HUB_RENDER_CURRENT(); });
    const on = (id, fn) => { const x = el.querySelector('#' + id); if (x) x.addEventListener('change', e => { fn(e.target.value); HUB_RENDER_CURRENT(); }); };
    on('tt-de', v => { if (v) state.de = v; if (state.ate < state.de) state.ate = state.de; });
    on('tt-ate', v => { if (v) state.ate = v; if (state.ate < state.de) state.de = state.ate; });
    on('tt-multi', v => { state.multiplicadora = v; });
    on('tt-pend', v => { state.pendencia = v; });
    // "Ver na lista" do aviso: filtra a situação e abre o período desde a turma mais antiga.
    el.querySelectorAll('[data-ver]').forEach(b => b.addEventListener('click', () => {
      const l = b.dataset.ver === 'aguardando' ? pend.validar : pend.acao;
      const mais = l.map(x => String(x.data).slice(0, 7)).sort()[0];
      state.pendencia = b.dataset.ver;
      state.multiplicadora = '';
      state.busca = '';
      if (mais && mais < state.de) state.de = mais;
      if (state.ate < mesAtual) state.ate = mesAtual;
      HUB_RENDER_CURRENT();
    }));
  }

  function modal(titulo, sub, corpo) {
    const ant = document.getElementById('hub-tt-modal'); if (ant) ant.remove();
    const m = document.createElement('div');
    m.id = 'hub-tt-modal';
    m.innerHTML = `
      <div data-fechar style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:998"></div>
      <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.3);width:94%;max-width:820px;max-height:90vh;z-index:999;display:flex;flex-direction:column">
        <div style="padding:16px 22px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:10px">
          <div><div style="font-size:16px;font-weight:700">${titulo}</div>${sub ? `<div style="font-size:12px;color:var(--muted);margin-top:2px">${sub}</div>` : ''}</div>
          <button data-fechar class="btn btn-outline btn-sm" style="width:auto">Fechar</button>
        </div>
        <div style="padding:16px 22px;overflow-y:auto;flex:1">${corpo}</div>
      </div>`;
    document.body.appendChild(m);
    m.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => m.remove()));
    return m;
  }
  const bloco = (titulo, html, estilo) => `<div class="card" style="margin-bottom:12px;padding:14px 16px;${estilo || ''}"><div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">${titulo}</div>${html}</div>`;
  const grade = html => `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px 16px">${html}</div>`;
  const inp = (id, label, valor, tipo, extra) => `<div class="field"><label>${label}</label><input id="${id}" type="${tipo || 'text'}" value="${esc(valor == null ? '' : valor)}" ${extra || ''}></div>`;
  const sel = (id, label, lista, atual) => `<div class="field"><label>${label}</label><select id="${id}" style="width:100%">${(atual && !lista.includes(atual) ? [atual] : []).concat(lista).map(o => `<option ${o === atual ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`;
  const sugestoes = (id, valores) => `<datalist id="${id}">${Array.from(new Set(valores.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')).map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;
  const minutos = h => (/^\d{1,2}:\d{2}$/.test(h || '') ? +h.split(':')[0] * 60 + +h.split(':')[1] : null);

  function abrirFormulario(x) {
    const novo = !x;
    const P = HUB_PARSERS_TURMAS._internal;
    const d = x || { data: new Date().toISOString().slice(0, 10), modalidade: 'Presencial', publico: 'Liderados', canal: 'Loja', marcas: [], multiplicadoras: [] };
    const todas = (window.HUB_DATA && HUB_DATA.treinamento_turmas) || [];
    // Multiplicadoras com turma no último ano (lista do campo), sem o "Sem instrutor".
    const umAno = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    const multis = todas.filter(t => String(t.data) >= umAno).flatMap(t => t.multiplicadoras || []).filter(n => n !== 'Sem instrutor').concat(meuNomeMulti());
    const principal = (d.multiplicadoras || [])[0] || (ehGestor() ? '' : meuNomeMulti());
    const edita = novo || podeEditar(d);
    const justifica = novo || podeJustificar(d);
    // Situação da turma para quem abre: só leitura, mês fechado, pedido do gestor.
    const avisosForm = novo ? '' : (!justifica
      ? bloco('Somente leitura', '<p class="sub" style="margin:0;font-size:12px">Você pode consultar esta turma, mas não alterá-la. Quem lança é a multiplicadora; quem corrige é o gestor de T&amp;D.</p>', 'border-left:4px solid var(--border)')
      : !edita
        ? bloco('&#128274; Mês fechado', '<p class="sub" style="margin:0;font-size:12px">Este mês já foi fechado no Fechamento do Período: os dados da turma não podem mais ser alterados por aqui. A justificativa continua liberada. Para corrigir outro campo, peça ao gestor de T&amp;D.</p>', 'border-left:4px solid #B7791F')
        : '')
      + ((d.ajuste_pedido || d.validacao === 'devolvida') && d.gestor_comentario
        ? bloco(d.ajuste_pedido ? 'Ajuste pedido pelo gestor de T&amp;D' : 'Justificativa devolvida pelo gestor de T&amp;D', `<p style="margin:0;font-size:13px">${esc(d.gestor_comentario)}</p><p class="sub" style="margin-top:6px;font-size:11px">${esc(d.ajuste_pedido ? d.ajuste_pedido_por || '' : d.validado_por || '')} em ${dataBR(d.ajuste_pedido ? d.ajuste_pedido_em : d.validado_em)}. Faça a correção (ou ajuste a justificativa) e salve: o pedido é dado como atendido.</p>`, 'border-left:4px solid var(--critical)')
        : '');
    const validacaoTxt = !d.justificativa ? '' : d.validacao === 'validada' ? ` <b style="color:#0f8a4c">Validada</b>${d.validado_por ? ` por ${esc(d.validado_por)} em ${dataBR(d.validado_em)}` : ''}.`
      : d.validacao === 'devolvida' ? ' <b style="color:var(--critical)">Devolvida pelo gestor de T&amp;D</b>: reescreva a justificativa.' : ' <b style="color:#b7791f">Aguardando validação do gestor de T&amp;D.</b>';
    // Gestor de T&D: validar, devolver, pedir ajuste e ver o histórico.
    const gestao = novo || !ehGestor() ? '' : bloco('Gestor de T&amp;D', `<textarea id="tf-gcom" rows="2" style="width:100%" placeholder="Comentário para a multiplicadora (obrigatório para devolver ou pedir ajuste)">${esc(d.ajuste_pedido || d.validacao === 'devolvida' ? d.gestor_comentario || '' : '')}</textarea>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          ${d.justificativa && d.validacao !== 'validada' ? '<button type="button" class="btn btn-sm" style="width:auto;background:#0f8a4c" data-gestao="validar">Validar justificativa</button>' : ''}
          ${d.justificativa && d.validacao !== 'devolvida' ? '<button type="button" class="btn btn-outline btn-sm" style="width:auto" data-gestao="devolver">Devolver justificativa</button>' : ''}
          ${d.ajuste_pedido ? '<button type="button" class="btn btn-outline btn-sm" style="width:auto" data-gestao="cancelar_ajuste">Cancelar pedido de ajuste</button>' : '<button type="button" class="btn btn-outline btn-sm" style="width:auto" data-gestao="pedir_ajuste">Pedir ajuste à multiplicadora</button>'}
          <button type="button" class="btn btn-outline btn-sm" style="width:auto;margin-left:auto" id="tf-hist">Histórico de alterações</button>
        </div>
        <div id="tf-hist-corpo" style="margin-top:10px"></div>
        <p class="sub" style="margin-top:6px;font-size:11px">Devolver ou pedir ajuste avisa a multiplicadora (número no menu e aviso na aba Lançamentos) até ela corrigir e salvar.</p>`, 'border-left:4px solid var(--p1)');
    const dupla = (d.multiplicadoras || []).slice(1).join(', ');
    const pend = novo ? [] : T.pendencias(d);
    const corpo = avisosForm +
      (pend.length ? bloco('Divergências desta turma', `<ul style="margin:0 0 0 18px;font-size:12.5px">${pend.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
        <p class="sub" style="margin-top:6px;font-size:11px">Corrija os campos abaixo, se for o caso, ou explique o motivo na Justificativa no fim do formulário.</p>`, 'border-left:4px solid var(--critical)') : '')
      + bloco('Turma', grade(`
        ${inp('tf-data', 'Data *', String(d.data || '').slice(0, 10), 'date')}
        <div class="field" style="grid-column:span 2"><label>Tema *</label><input id="tf-tema" list="tf-l-tema" value="${esc(d.tema || '')}" placeholder="Escolha um tema já usado ou digite um novo"></div>
        ${sel('tf-tipo', 'Tipo da turma', TIPOS, d.categoria || '')}
        ${sel('tf-mod', 'Modalidade', ['Presencial', 'Online', 'Híbrido'], d.modalidade)}
        <div class="field"><label>Local</label><input id="tf-local" list="tf-l-local" value="${esc(d.local || '')}"></div>
        ${inp('tf-ini', 'Início *', d.hora_inicio, 'time')}
        ${inp('tf-fim', 'Fim *', d.hora_fim, 'time')}
        ${inp('tf-horas', 'Duração (h) *', d.horas, 'number', 'step="0.25" min="0"')}`)
        + '<p class="sub" style="margin-top:6px;font-size:11px">A duração é preenchida pelo horário; ajuste se houve intervalo (ex.: 10:00–15:00 com 30 min de almoço = 4,5 h). O tipo é sugerido pelo tema; mude se não for o caso.</p>')
      + bloco('Público e entrega', grade(`
        ${sel('tf-pub', 'Público', ['Liderados', 'Líderes', 'Líderes e liderados', 'Revendedores'], d.publico)}
        ${sel('tf-canal', 'Canal', ['Loja', 'VD', 'Escritório', 'Loja e VD', 'Loja e Escritório'], d.canal)}
        ${inp('tf-conv', 'Convocados *', d.convocados, 'number', 'min="0" step="1"')}
        ${inp('tf-pres', 'Presentes *', d.presentes, 'number', 'min="0" step="1"')}
        <div class="field"><label>Aderência</label><div id="tf-ader" style="padding:9px 0;font-size:15px;font-weight:700">—</div></div>`)
        + `<div class="field" style="margin-top:10px"><label>Marca(s) *</label><div style="display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12.5px">${MARCAS.concat((d.marcas || []).filter(mm => !MARCAS.includes(mm))).map(mm => `<label style="display:inline-flex;align-items:center;gap:5px;font-weight:400;white-space:nowrap;width:auto;margin:0"><input type="checkbox" class="tf-marca" style="width:auto;margin:0" value="${esc(mm)}" ${(d.marcas || []).includes(mm) ? 'checked' : ''}> ${esc(mm)}</label>`).join('')}</div></div>`)
      + bloco('Multiplicadora', grade(`
        ${ehGestor() ? `<div class="field"><label>Multiplicadora *</label><input id="tf-multi" list="tf-l-multi" value="${esc(principal)}"></div>` : `<div class="field"><label>Multiplicadora</label><input id="tf-multi" value="${esc(principal)}" disabled></div>`}
        <div class="field"><label>Junto com (turma em dupla)</label><input id="tf-dupla" list="tf-l-multi" value="${esc(dupla)}" placeholder="opcional"></div>`)
        + `<div class="field" style="margin-top:10px"><label>Observação</label><textarea id="tf-obs" rows="2" style="width:100%" placeholder="opcional: turma com revendedores, material, o que foi trabalhado...">${esc(d.observacao || '')}</textarea></div>`)
      + bloco('Justificativa', `<textarea id="tf-just" rows="3" style="width:100%" placeholder="Explique a divergência: por que vieram mais pessoas que as convocadas, por que falta o horário, a duração, o local...">${esc(d.justificativa || '')}</textarea>
        <p class="sub" style="margin-top:6px;font-size:11px">Obrigatória quando vierem mais pessoas que as convocadas.${d.justificado_por ? ` Justificada por ${esc(d.justificado_por)} em ${dataBR(d.justificado_em)}.` : ''}${validacaoTxt}</p>`)
      + gestao
      + sugestoes('tf-l-tema', todas.map(t => t.tema).filter(t => t !== 'TEMA NÃO INFORMADO')) + sugestoes('tf-l-local', todas.map(t => t.local)) + sugestoes('tf-l-multi', multis)
      + `<div class="msg err" id="tf-msg" style="display:none"></div>
        <div style="display:flex;gap:8px;justify-content:space-between;margin-top:4px;flex-wrap:wrap">
          <span>${!novo && ehGestor() ? '<button type="button" class="btn btn-outline btn-sm" style="width:auto;color:var(--critical)" id="tf-excluir">Excluir turma</button>' : ''}</span>
          <span style="display:flex;gap:8px;flex-wrap:wrap">
            ${!novo && justifica ? `<button type="button" class="btn ${edita ? 'btn-outline ' : ''}btn-sm" style="width:auto" id="tf-so-just">Salvar só a justificativa</button>` : ''}
            ${edita ? `<button type="button" class="btn btn-sm" style="width:auto" id="tf-salvar">${novo ? 'Lançar turma' : 'Salvar alterações'}</button>` : ''}
          </span>
        </div>
        ${!novo ? `<p class="sub" style="margin-top:8px;font-size:10.5px;color:var(--muted);text-align:right">Lançada por ${esc(d.criado_por_nome || '—')} em ${dataBR(d.importado_em)}${d.atualizado_por ? ` · última alteração por ${esc(d.atualizado_por)} em ${dataBR(d.atualizado_em)}` : ''}</p>` : ''}`;

    const m = modal(novo ? 'Lançar turma' : esc(d.tema), novo ? 'Registre a turma logo depois de dar o treinamento.' : `${dataBR(d.data)} · ${esc((d.multiplicadoras || []).join(', '))}`, corpo);
    const $ = id => m.querySelector('#' + id);
    const msg = t => { const e = $('tf-msg'); e.textContent = t; e.style.display = t ? 'block' : 'none'; };
    // Sem edição: campos travados (a justificativa fica aberta para a dona da turma).
    if (!edita) m.querySelectorAll('input, select, textarea').forEach(e => { if (!(e.id === 'tf-just' && justifica) && e.id !== 'tf-gcom') e.disabled = true; });

    // Duração calculada a cada mudança no início ou no fim (dá para ajustar depois, ex.: intervalo).
    const calcular = () => {
      const a = minutos($('tf-ini').value), b = minutos($('tf-fim').value);
      if (a != null && b != null && b > a) $('tf-horas').value = Math.round((b - a) / 60 * 100) / 100;
    };
    ['input', 'change'].forEach(ev => { $('tf-ini').addEventListener(ev, calcular); $('tf-fim').addEventListener(ev, calcular); });

    // Tipo sugerido pelo tema, até a pessoa escolher outro.
    let tipoManual = !novo && !!d.categoria;
    $('tf-tipo').addEventListener('change', () => { tipoManual = true; });
    const sugerirTipo = () => { if (!tipoManual && $('tf-tema').value.trim()) $('tf-tipo').value = P.categoria(P.tema($('tf-tema').value)); };
    ['input', 'change'].forEach(ev => $('tf-tema').addEventListener(ev, sugerirTipo));
    if (novo) $('tf-tipo').value = TIPOS[0];

    // Aderência = presentes ÷ convocados, ao vivo. Acima de 100% é permitido, com justificativa.
    const aderencia = () => {
      const c = Number($('tf-conv').value), p = Number($('tf-pres').value), e = $('tf-ader');
      if ($('tf-conv').value === '' || $('tf-pres').value === '' || !(c > 0)) { e.textContent = '—'; e.style.color = ''; return; }
      const v = p / c;
      e.textContent = U.fmtPct(v, 0) + (p > c ? ' · acima dos convocados: justifique' : '');
      e.style.color = p > c ? '#b7791f' : v >= 0.9 ? '#0f8a4c' : v >= 0.7 ? '#b7791f' : 'var(--critical)';
    };
    ['input', 'change'].forEach(ev => { $('tf-conv').addEventListener(ev, aderencia); $('tf-pres').addEventListener(ev, aderencia); });
    aderencia();

    if ($('tf-salvar')) $('tf-salvar').addEventListener('click', async () => {
      const tema = P.tema($('tf-tema').value);
      const marcas = Array.from(m.querySelectorAll('.tf-marca:checked')).map(c => c.value);
      const multiPrincipal = ($('tf-multi').value || '').trim();
      const multisTurma = [multiPrincipal].concat(P.multiplicadoras($('tf-dupla').value)).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
      const conv = $('tf-conv').value === '' ? null : Math.round(Number($('tf-conv').value));
      const pres = $('tf-pres').value === '' ? null : Math.round(Number($('tf-pres').value));
      const horas = Number(String($('tf-horas').value).replace(',', '.'));
      const ini = $('tf-ini').value, fim = $('tf-fim').value;
      const just = $('tf-just').value.trim();
      if (!$('tf-data').value || !tema) return msg('Informe a data e o tema.');
      if (!ini || !fim || minutos(fim) <= minutos(ini)) return msg('Informe o horário de início e de fim (o fim depois do início). Se não tiver o horário, use "Salvar só a justificativa".');
      if (!(horas > 0)) return msg('Informe a duração da turma.');
      if (conv == null || pres == null) return msg('Informe convocados e presentes.');
      if (pres > conv && !just) return msg('Vieram mais pessoas que as convocadas: explique o motivo na Justificativa.');
      if (!marcas.length) return msg('Marque pelo menos uma marca.');
      if (!multiPrincipal) return msg('Informe a multiplicadora.');
      if (!ehGestor() && mesFechado($('tf-data').value)) return msg('Este mês já foi fechado no Fechamento do Período: só o gestor de T&D pode lançar ou alterar turmas dele.');
      const dados = {
        data: $('tf-data').value, tema, categoria: $('tf-tipo').value || P.categoria(tema), modalidade: $('tf-mod').value, local: P.local($('tf-local').value),
        hora_inicio: ini, hora_fim: fim, horas, publico: $('tf-pub').value, canal: $('tf-canal').value,
        convocados: conv, presentes: pres, marcas, marca_original: marcas.join(' / '),
        multiplicadoras: multisTurma, multiplicador_original: multisTurma.join(' & '), planilha: multiPrincipal,
        observacao: $('tf-obs').value.trim(), justificativa: just, usuario: meuNome()
      };
      const btn = $('tf-salvar');
      btn.disabled = true; btn.textContent = 'Salvando...'; msg('');
      try {
        await HUB_DAL.salvarTurmaHub(novo ? null : d.id, dados);
        m.remove();
        HUB_RENDER_CURRENT();
      } catch (err) {
        msg(err.message);
        btn.disabled = false; btn.textContent = novo ? 'Lançar turma' : 'Salvar alterações';
      }
    });

    // Só a justificativa: para turma importada incompleta, que não passaria nas validações acima.
    const soJust = $('tf-so-just');
    if (soJust) soJust.addEventListener('click', async () => {
      soJust.disabled = true; msg('');
      try { await HUB_DAL.justificarTurmaHub(d.id, $('tf-just').value.trim(), meuNome()); m.remove(); HUB_RENDER_CURRENT(); }
      catch (err) { msg(err.message); soJust.disabled = false; }
    });

    // Ações do gestor.
    m.querySelectorAll('[data-gestao]').forEach(b => b.addEventListener('click', async () => {
      const acao = b.dataset.gestao, com = $('tf-gcom').value.trim();
      if ((acao === 'devolver' || acao === 'pedir_ajuste') && !com) return msg('Escreva no comentário o que a multiplicadora precisa ajustar.');
      b.disabled = true; msg('');
      try { await HUB_DAL.gestaoTurmaHub(d.id, acao, com, meuNome()); m.remove(); HUB_RENDER_CURRENT(); }
      catch (err) { msg(err.message); b.disabled = false; }
    }));
    const hist = $('tf-hist');
    if (hist) hist.addEventListener('click', async () => {
      const alvo = $('tf-hist-corpo');
      alvo.innerHTML = '<span class="sub">Carregando...</span>';
      try { alvo.innerHTML = historicoHtml(await HUB_DAL.historicoTurma(d.id)); }
      catch (err) { alvo.innerHTML = `<span class="sub" style="color:var(--critical)">${esc(err.message)}</span>`; }
    });

    const exc = $('tf-excluir');
    if (exc) exc.addEventListener('click', async () => {
      if (!confirm(`Excluir a turma "${d.tema}" de ${dataBR(d.data)}? Não dá para desfazer.`)) return;
      exc.disabled = true;
      try { await HUB_DAL.excluirTurmaHub(d.id); m.remove(); HUB_RENDER_CURRENT(); }
      catch (err) { msg(err.message); exc.disabled = false; }
    });
  }

  const ROTULO_CAMPO = { data: 'Data', tema: 'Tema', categoria: 'Tipo', modalidade: 'Modalidade', local: 'Local', hora_inicio: 'Início', hora_fim: 'Fim', horas: 'Duração',
    publico: 'Público', marcas: 'Marcas', canal: 'Canal', convocados: 'Convocados', presentes: 'Presentes', multiplicadoras: 'Multiplicadoras', observacao: 'Observação',
    justificativa: 'Justificativa', validacao: 'Validação', gestor_comentario: 'Comentário do gestor', ajuste_pedido: 'Ajuste pedido' };
  const valorLog = v => (v == null || v === '' ? '—' : Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'sim' : 'não') : String(v));
  function historicoHtml(log) {
    if (!log.length) return '<span class="sub">Sem alterações registradas (o histórico começa a valer a partir de 14/10/2026).</span>';
    return `<div class="table-wrap" style="max-height:260px"><table class="dt"><thead><tr><th>Quando</th><th>Quem</th><th>O que mudou</th></tr></thead><tbody>${log.map(r => {
      const a = r.antes || {}, b = r.depois || {};
      const mud = r.acao !== 'alteração' ? [r.acao] : Object.keys(ROTULO_CAMPO).filter(k => JSON.stringify(a[k] == null ? null : a[k]) !== JSON.stringify(b[k] == null ? null : b[k]))
        .map(k => `${ROTULO_CAMPO[k]}: ${valorLog(a[k])} → ${valorLog(b[k])}`);
      const q = new Date(r.quando);
      return `<tr><td style="white-space:nowrap">${q.toLocaleDateString('pt-BR')} ${q.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td><td>${esc(r.usuario_nome || '—')}</td><td style="font-size:11.5px">${mud.length ? mud.map(esc).join('<br>') : 'sem mudança nos campos da turma'}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  window.HUB_SECTIONS = window.HUB_SECTIONS || {};
  window.HUB_SECTIONS.renderTurmas = renderTurmas;
})();
