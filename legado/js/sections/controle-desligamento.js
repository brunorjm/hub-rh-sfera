// Desenvolvimento Organizacional → módulo independente Controle de Desligamento.
//
// Substitui a aba "ATUALIZADA (MOVIMENTAR)" da planilha "Controle de
// Desligamento.xlsx": o RH lança o ID de desligamento que chega pelo Forms do
// gestor, acompanha o status na Feedz até o último dia e depois faz o contato
// e a entrevista de desligamento (link gerado aqui mesmo).
//
// Dados: tabela controle_desligamento (supabase-controle-desligamento.sql),
// carregada junto com as tabelas do Recrutamento em
// HUB_RECRUIT_DATA.controle_desligamento (camelCase — ver dal-recrutamento.js).
// O que a planilha fazia com PROCV, aqui é calculado na hora:
//   Headcount  → ID da Feedz gravado no lançamento; no histórico importado,
//                nome completo (exato; depois ignorando espaços), desempatando
//                pela data de desligamento;
//   AVE        → CPF do colaborador; nota = média de todas as competências do
//                gestor incluindo o "Batendo o Martelo" (a mesma da Feedz);
//   Feedbacks  → quantidade recebida (campo "para" da tabela feedbacks);
//   Link       → link de entrevista gerado no Hub (pelo ID do desligamento,
//                senão pelo colaborador).
// Acesso restrito à permissão 'indicadores.controle_desligamento'. O contato
// (celular — na Feedz, a "matrícula") só aparece na ficha de cada
// desligamento: vem da Feedz no lançamento (função controle_desligamento_
// contato_feedz, só para quem tem a permissão) e pode ser editado à mão.
(function () {
  const U = HUB_UTILS;
  const R = HUB_RECRUIT;
  const { kpi, empty } = HUB_UI;
  const esc = U.escapeHtml;
  const TABELA = 'controle_desligamento';

  const STATUS_FEEDZ = ['Pendente', 'Aguardando último dia', 'Finalizado', 'Cancelado', 'ID Duplicado'];
  const STATUS_ENTREVISTA = ['Não Realizada', 'Enviada', 'Realizada', 'Recusado', 'Inelegível'];
  const TIPOS = ['Voluntária - Sem Aviso', 'Voluntária - Com Aviso', 'Involuntária - Sem Aviso', 'Involuntária - Com Aviso', 'Acordo', 'Justa Causa'];
  const CORES_FEEDZ = { 'Pendente': '#eda100', 'Aguardando último dia': '#1C7CEC', 'Finalizado': '#1baf7a', 'Cancelado': '#8A8F98', 'ID Duplicado': '#8A8F98' };
  const CORES_ENTREVISTA = { 'Não Realizada': '#8A8F98', 'Enviada': '#eda100', 'Realizada': '#1baf7a', 'Recusado': '#d03b3b', 'Inelegível': '#5b6472' };
  // Lista fixa de motivos (aprovada pelo RH em 28/09/2026 a partir das ~90
  // variações da planilha de controle — ver supabase-controle-motivos.sql,
  // que converteu o histórico). "Outro" exige o detalhe.
  const MOTIVOS = [
    ['Pedido do colaborador', ['Outra oportunidade — remuneração e/ou benefícios', 'Outra oportunidade — modalidade de trabalho', 'Outra oportunidade — cargo e/ou crescimento',
      'Questões pessoais', 'Qualidade de vida', 'Transição de carreira', 'Mudança de cidade', 'Estudos', 'Problemas de saúde']],
    ['Relação e adaptação', ['Adaptação à cultura organizacional', 'Relacionamento com a equipe', 'Incompatibilidade com o cargo', 'Relacionamento com a gestão']],
    ['Iniciativa da empresa', ['Baixo desempenho / performance', 'Comportamento inadequado', 'Término de contrato (experiência, temporário, aprendiz, extra)',
      'Abandono de emprego', 'Redução ou adequação de quadro', 'Ato de improbidade (ex.: atestado falso)', 'Assiduidade (faltas e atrasos)', 'Encerramento de loja / operação']],
    ['Outros', ['Prefere não informar', 'Outro']]
  ];
  const MOTIVOS_TODOS = MOTIVOS.flatMap(g => g[1]);
  const PAGE_SIZE = 25;

  const estado = { busca: '', feedz: 'todos', entrevista: 'todos', fila: 'todas', ordem: 'recentes', pagina: 1,
    canal: 'todos', pendente: 'todos', tipo: 'todos', casa: 'todos', maisFiltros: false };
  // Canal da entrevista realizada (ver canalEntrevista)
  const CANAIS = [['link', 'Link do Hub'], ['forms', 'Forms'], ['presencial', 'Realizada sem registro digital'], ['nenhum', 'Sem entrevista']];
  const FAIXAS_CASA = [['ate45', 'Até 45 dias de casa'], ['ate90', 'Até 90 dias (experiência)'], ['mais90', 'Mais de 90 dias']];
  let raizAtual = null, filtrosAtuais = null;

  const n = s => U.normalizeText(String(s || '')).replace(/\s+/g, ' ').trim();
  const compacto = s => n(s).replace(/[^a-z]/g, '');
  const dia = s => (s ? new Date(String(s).slice(0, 10) + 'T12:00:00Z').getTime() : null);
  const hojeISO = () => U.todayISO();
  const diasEntre = (a, b) => (a && b ? Math.round((dia(b) - dia(a)) / 86400000) : null);
  const media = arr => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);
  const pill = (txt, cor, title) => `<span class="ave-pill" style="--c:${cor}"${title ? ` title="${esc(title)}"` : ''}>${esc(txt)}</span>`;
  const quem = () => (window.HUB_USER && (HUB_USER.nome || HUB_USER.email)) || 'Desconhecido';
  const lancamentos = () => (window.HUB_RECRUIT_DATA && HUB_RECRUIT_DATA[TABELA]) || [];
  const pode = () => !!(window.HUB_PERMISSIONS && HUB_PERMISSIONS.hasPerm(window.HUB_USER, 'indicadores.controle_desligamento'));
  const soDigitos = s => String(s || '').replace(/\D/g, '');
  function linkWhatsapp(contato) {
    let d = soDigitos(contato);
    if (d.length < 10) return null;
    if (d.length <= 11) d = '55' + d;
    return 'https://wa.me/' + d;
  }
  async function contatoDaFeedz(externalId) {
    if (!externalId) return null;
    const { data, error } = await sb.rpc('controle_desligamento_contato_feedz', { p_external_id: String(externalId) });
    if (error) throw error;
    return data || null;
  }

  // ------------------------------------------------------------------
  // Cruzamentos (Headcount, AVE, Feedbacks, links)
  // ------------------------------------------------------------------
  function indexarHeadcount() {
    const porId = new Map(), exato = new Map(), comp = new Map();
    for (const c of (window.HUB_DATA && HUB_DATA.colaboradores) || []) {
      if (c.external_id) porId.set(String(c.external_id), c);
      const nome = c.nome_completo || c.nome;
      const k1 = n(nome), k2 = compacto(nome);
      if (k1) { if (!exato.has(k1)) exato.set(k1, []); exato.get(k1).push(c); }
      if (k2) { if (!comp.has(k2)) comp.set(k2, []); comp.get(k2).push(c); }
    }
    return { porId, exato, comp };
  }
  function acharColaborador(idx, d) {
    if (d.colaboradorExternalId && idx.porId.has(String(d.colaboradorExternalId))) return idx.porId.get(String(d.colaboradorExternalId));
    const cands = idx.exato.get(n(d.colaboradorNome)) || idx.comp.get(compacto(d.colaboradorNome)) || [];
    if (cands.length <= 1) return cands[0] || null;
    const alvo = dia(d.dataDemissao);
    return cands.slice().sort((a, b) => {
      const da = alvo && dia(a.ultimo_dia_trabalhado) ? Math.abs(dia(a.ultimo_dia_trabalhado) - alvo) : Infinity;
      const db = alvo && dia(b.ultimo_dia_trabalhado) ? Math.abs(dia(b.ultimo_dia_trabalhado) - alvo) : Infinity;
      return da - db;
    })[0];
  }
  function indexarAve() {
    const out = { 45: new Map(), 90: new Map() };
    for (const c of [45, 90]) {
      for (const r of (window.HUB_EXPERIENCIA_DATA && HUB_EXPERIENCIA_DATA[c]) || []) if (r.cpf) out[c].set(String(r.cpf).trim(), r);
    }
    return out;
  }
  // Mesma nota que a Feedz exporta (e a planilha usava): média de TODAS as
  // competências avaliadas pelo gestor, incluindo o "Batendo o Martelo".
  // Sem avaliação concluída → sem nota (não conta como nota baixa).
  function notaFeedzGestor(a) {
    if (!a) return null;
    const v = Object.values(a.notas_gestor || {}).filter(x => x >= 1 && x <= 4);
    if (a.martelo >= 1 && a.martelo <= 4) v.push(a.martelo);
    return media(v);
  }
  function notaFeedzAuto(a) {
    if (!a) return null;
    return media(Object.values(a.notas_auto || {}).filter(x => x >= 1 && x <= 4));
  }
  function indexarFeedbacks() {
    const m = new Map();
    for (const f of (window.HUB_DATA && HUB_DATA.feedbacks) || []) {
      for (const nome of String(f.para || '').split(/[,;]/)) {
        const k = n(nome);
        if (k) m.set(k, (m.get(k) || 0) + 1);
      }
    }
    return m;
  }
  function indexarLinks() {
    const m = new Map();
    for (const l of (window.HUB_RECRUIT_DATA && HUB_RECRUIT_DATA.entrevistas_desligamento) || []) {
      // Link com o ID do desligamento pertence só àquela ficha: casar também
      // pelo usuário da Feedz ou pelo nome o levaria para outro vínculo da
      // mesma pessoa (recontratação).
      if (l.idDesligamento) { m.set('d:' + l.idDesligamento, l); continue; }
      if (l.colaboradorExternalId) m.set('e:' + l.colaboradorExternalId, l);
      m.set('n:' + n(l.colaboradorNome), l);
    }
    return m;
  }

  // Respostas do Forms (planilhas 34 e 30) ligadas à ficha — só quais existem;
  // o conteúdo vem sob demanda em abrirRespostasForms().
  function indexarForms() {
    const m = new Map();
    for (const f of (window.HUB_RECRUIT_DATA && HUB_RECRUIT_DATA.controle_respostas_forms) || []) {
      const k = String(f.controleId);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(f);
    }
    return m;
  }

  function montarRegistros() {
    const hc = indexarHeadcount(), ave = indexarAve(), fb = indexarFeedbacks(), links = indexarLinks(), forms = indexarForms();
    return lancamentos().map(d => {
      const c = acharColaborador(hc, d);
      const cpf = (d.colaboradorCpf && String(d.colaboradorCpf).trim()) || (c && c.cpf ? String(c.cpf).trim() : null);
      const a45 = cpf ? ave[45].get(cpf) : null, a90 = cpf ? ave[90].get(cpf) : null;
      const n45 = notaFeedzGestor(a45), n90 = notaFeedzGestor(a90);
      const mediaAve = n45 !== null && n90 !== null ? (n45 + n90) / 2 : null;
      const qtdFeedbacks = fb.get(n(d.colaboradorNome)) || 0;
      const link = links.get('d:' + d.idDesligamento) || (c && c.external_id && links.get('e:' + c.external_id)) || links.get('n:' + n(d.colaboradorNome)) || null;
      const admissao = d.dataAdmissao || (c && c.data_admissao) || null;
      const respForms = forms.get(String(d.id)) || [];
      return {
        db: d, id: d.idDesligamento, colab: c,
        data_solicitacao: d.dataSolicitacao, solicitante: d.solicitante, nome: d.colaboradorNome,
        cargo: d.cargo || (c && c.cargo) || null, unidade: d.unidade, departamento: d.departamento,
        data_admissao: admissao, data_demissao: d.dataDemissao,
        tempo_casa: admissao && d.dataDemissao ? diasEntre(admissao, d.dataDemissao) : null,
        email: c && c.email ? c.email : null, situacaoHeadcount: c ? c.situacao : null,
        nota45: n45, auto45: notaFeedzAuto(a45), nota90: n90, auto90: notaFeedzAuto(a90), mediaAve, feedbacks: qtdFeedbacks,
        criterios: (n45 !== null && n45 < 3 ? 1 : 0) + (n90 !== null && n90 < 3 ? 1 : 0) + (mediaAve !== null && mediaAve < 3 ? 1 : 0) + (qtdFeedbacks > 0 ? 1 : 0),
        link, forms: respForms,
        data_realizacao: d.dataRealizacao || (link && link.status === 'Preenchido' && link.dataFinalizacao ? String(link.dataFinalizacao).slice(0, 10) : null) ||
          (respForms[0] && respForms[0].dataConclusao) || null
      };
    });
  }

  // Status da entrevista com o link do Hub (automático) por cima do manual:
  // respondido → Realizada; pendente → Enviada (se não houver desfecho).
  function statusEntrevista(r) {
    const st = r.db.statusEntrevista;
    if (r.link && r.link.status === 'Preenchido') return 'Realizada';
    // Link encerrado (a ficha foi para "Recusado" — supabase-controle-recusado-
    // encerra-link.sql) não conta mais como enviado.
    if (r.link && r.link.status === 'Pendente' && !['Recusado', 'Inelegível', 'Realizada'].includes(st)) return 'Enviada';
    return st || 'Não Realizada';
  }

  // Filas de trabalho (o que precisa de ação do RH)
  function fila(r) {
    const hoje = hojeISO();
    const sf = r.db.statusFeedz;
    const st = statusEntrevista(r);
    if (sf === 'Cancelado' || sf === 'ID Duplicado') return 'encerrado';
    if (sf !== 'Finalizado') return (r.data_demissao && r.data_demissao < hoje) ? 'feedz_atrasado' : 'em_andamento';
    if (st === 'Não Realizada' && r.data_demissao && diasEntre(r.data_demissao, hoje) <= 90) return 'contatar';
    if (st === 'Enviada') return 'aguardando_resposta';
    return 'concluido';
  }
  const FILAS = {
    em_andamento: ['Desligamento em andamento', '#1C7CEC'],
    feedz_atrasado: ['Feedz não finalizada após a demissão', '#d03b3b'],
    contatar: ['Contatar para entrevista', '#eb6834'],
    aguardando_resposta: ['Link enviado, aguardando resposta', '#eda100'],
    concluido: ['Concluído', '#1baf7a'],
    encerrado: ['Cancelado / duplicado', '#8A8F98']
  };

  // ------------------------------------------------------------------
  // Tela
  // ------------------------------------------------------------------
  function render(el, f) {
    raizAtual = el; filtrosAtuais = f;
    if (!pode()) { el.innerHTML = empty('Acesso restrito.', 'O Controle de Desligamento precisa de permissão própria — peça ao administrador.'); return; }
    el.innerHTML = `<div class="empty"><p>Carregando controle de desligamento...</p></div>`;
    Promise.all([45, 90].map(c => HUB_EXPERIENCIA.carregar(c).catch(() => []))).then(() => desenhar(el, f));
  }

  function filtrarGlobal(rows, f) {
    return rows.filter(r => {
      if ((f.start || f.end) && !(r.data_solicitacao && U.inRange(r.data_solicitacao, f.start, f.end))) return false;
      if (!U.matchesAny(r.unidade, f.unidade)) return false;
      if (!U.matchesAny(r.departamento, f.departamento)) return false;
      if (f.colaborador && !U.normIncludes(r.nome, f.colaborador)) return false;
      return true;
    });
  }

  function desenhar(el, f) {
    const todos = montarRegistros();
    const noPeriodo = filtrarGlobal(todos, f);
    const cont = {}; noPeriodo.forEach(r => { const k = fila(r); cont[k] = (cont[k] || 0) + 1; });
    const semVinculo = noPeriodo.filter(r => !r.colab).length;
    const opt = (v, l, cur) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`;
    const vazio = !lancamentos().length;
    const usados = new Set(todos.map(r => r.link).filter(Boolean));
    const avulsos = ((window.HUB_RECRUIT_DATA && HUB_RECRUIT_DATA.entrevistas_desligamento) || []).filter(l => !usados.has(l));
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <div class="sub" style="font-size:12px;color:var(--muted)">${U.fmtInt(noPeriodo.length)} desligamento(s) no período/filtros${semVinculo ? ` · ${U.fmtInt(semVinculo)} sem cadastro correspondente no Headcount` : ''}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${HUB_PERMISSIONS.hasPerm(HUB_USER,'indicadores.desligamento')?'<button type="button" class="btn btn-outline btn-sm" style="width:auto" id="cd-abrir-entrevista">Ver indicadores das entrevistas</button>':''}
          <button type="button" class="btn btn-outline btn-sm" style="width:auto" id="cd-exportar" title="Baixa em Excel a lista com os filtros atuais e as respostas das entrevistas dessas fichas">Exportar Excel</button>
          <button type="button" class="btn btn-sm" style="width:auto" id="cd-novo">+ Lançar desligamento</button>
        </div>
      </div>
      ${avulsos.length ? `<div class="insight alerta" style="margin-bottom:14px;display:block"><div style="margin-bottom:6px"><strong>${U.fmtInt(avulsos.length)} link(s) de entrevista sem desligamento lançado</strong> — lance o desligamento para que o link passe a ser acompanhado na lista.</div>
        ${avulsos.map((l, i) => `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px;padding:3px 0"><b>${esc(l.colaboradorNome || '—')}</b><span style="color:var(--muted)">${esc(l.cargo || '')} · ${situacaoLink(l)} · gerado em ${U.fmtDateBR(String(l.criadoEm || '').slice(0, 10)) || '—'}</span>${l.status === 'Preenchido' ? `<button type="button" class="btn btn-outline btn-sm" style="width:auto" data-avulso-resp="${i}">Ver respostas</button>` : ''}<button type="button" class="btn btn-outline btn-sm" style="width:auto" data-avulso-copiar="${i}">Copiar link</button></div>`).join('')}</div>` : ''}
      ${vazio ? `<div class="insight info" style="margin-bottom:14px"><span class="ic">&#8505;&#65039;</span><span>Nenhum desligamento lançado ainda. Importe o histórico da planilha de controle (script SQL) ou lance o primeiro pelo botão acima.</span></div>` : ''}
      <div class="kpi-grid">
        ${kpiFila('em_andamento', cont)}
        ${kpiFila('feedz_atrasado', cont)}
        ${kpiFila('contatar', cont)}
        ${kpiFila('aguardando_resposta', cont)}
        ${kpiFila('concluido', cont)}
      </div>
      <div class="toolbar">
        <input type="text" id="cd-busca" placeholder="Buscar por ID, nome, cargo, unidade ou solicitante..." value="${esc(estado.busca)}">
        <select id="cd-fila">${opt('todas', 'Fila: todas', estado.fila)}${Object.entries(FILAS).map(([k, v]) => opt(k, v[0], estado.fila)).join('')}</select>
        <select id="cd-entrevista">${opt('todos', 'Entrevista: todas', estado.entrevista)}${STATUS_ENTREVISTA.map(s => opt(s, s, estado.entrevista)).join('')}</select>
        <select id="cd-canal">${opt('todos', 'Canal: todos', estado.canal)}${CANAIS.map(([k, l]) => opt(k, l, estado.canal)).join('')}</select>
        <select id="cd-pendente" title="Links de entrevista gerados e ainda sem resposta">${opt('todos', 'Link pendente: todos', estado.pendente)}${[7, 15, 30].map(d => opt(String(d), `Link pendente há ${d}+ dias`, estado.pendente)).join('')}</select>
        <select id="cd-ordem">${opt('recentes', 'Solicitação mais recente', estado.ordem)}${opt('demissao', 'Demissão mais recente', estado.ordem)}${opt('link', 'Link gerado mais recente', estado.ordem)}${opt('pendente_antigo', 'Link pendente mais antigo primeiro', estado.ordem)}${opt('resposta', 'Resposta mais recente', estado.ordem)}${opt('id', 'ID (maior primeiro)', estado.ordem)}${opt('criterios', 'Mais critérios primeiro', estado.ordem)}</select>
        <button type="button" class="btn btn-outline btn-sm" style="width:auto" id="cd-mais">${estado.maisFiltros ? 'Menos filtros' : 'Mais filtros'}${qtdMaisFiltros() ? ` (${qtdMaisFiltros()})` : ''}</button>
      </div>
      <div class="toolbar" id="cd-mais-filtros" style="${estado.maisFiltros ? '' : 'display:none'}">
        <select id="cd-feedz">${opt('todos', 'Status na Feedz: todos', estado.feedz)}${STATUS_FEEDZ.map(s => opt(s, s, estado.feedz)).join('')}</select>
        <select id="cd-tipo">${opt('todos', 'Tipo: todos', estado.tipo)}${TIPOS.map(s => opt(s, s, estado.tipo)).join('')}</select>
        <select id="cd-casa">${opt('todos', 'Tempo de casa: todos', estado.casa)}${FAIXAS_CASA.map(([k, l]) => opt(k, l, estado.casa)).join('')}</select>
        <button type="button" class="btn btn-outline btn-sm" style="width:auto" id="cd-limpar">Limpar filtros da lista</button>
      </div>
      <div id="cd-tabela"></div>`;
    el.querySelector('#cd-abrir-entrevista')?.addEventListener('click',()=>HUB_GOTO_SECTION('ind-desligamento'));
    const redesenhar = () => desenharTabela(el.querySelector('#cd-tabela'), noPeriodo);
    const bind = (id, campo, evt) => el.querySelector(id).addEventListener(evt || 'change', e => {
      estado[campo] = e.target.value; estado.pagina = 1; redesenhar();
      const b = el.querySelector('#cd-mais'); if (b) b.textContent = (estado.maisFiltros ? 'Menos filtros' : 'Mais filtros') + (qtdMaisFiltros() ? ` (${qtdMaisFiltros()})` : '');
    });
    bind('#cd-busca', 'busca', 'input'); bind('#cd-fila', 'fila'); bind('#cd-feedz', 'feedz'); bind('#cd-entrevista', 'entrevista'); bind('#cd-ordem', 'ordem');
    bind('#cd-canal', 'canal'); bind('#cd-pendente', 'pendente'); bind('#cd-tipo', 'tipo'); bind('#cd-casa', 'casa');
    el.querySelector('#cd-mais').addEventListener('click', () => { estado.maisFiltros = !estado.maisFiltros; desenhar(el, f); });
    el.querySelector('#cd-limpar').addEventListener('click', () => {
      Object.assign(estado, { busca: '', feedz: 'todos', entrevista: 'todos', fila: 'todas', canal: 'todos', pendente: 'todos', tipo: 'todos', casa: 'todos', pagina: 1 });
      desenhar(el, f);
    });
    el.querySelectorAll('[data-fila]').forEach(k => k.addEventListener('click', () => { estado.fila = estado.fila === k.dataset.fila ? 'todas' : k.dataset.fila; estado.pagina = 1; desenhar(el, f); }));
    el.querySelector('#cd-novo').addEventListener('click', () => abrirFormulario(null));
    el.querySelector('#cd-exportar').addEventListener('click', e => exportarExcel(aplicarFiltros(noPeriodo), e.currentTarget));
    el.querySelectorAll('[data-avulso-resp]').forEach(b => b.addEventListener('click', () => HUB_ENTREVISTA_DESLIGAMENTO.abrirRespostas(avulsos[Number(b.dataset.avulsoResp)])));
    el.querySelectorAll('[data-avulso-copiar]').forEach(b => b.addEventListener('click', () => HUB_ENTREVISTA_DESLIGAMENTO.copiarLink(avulsos[Number(b.dataset.avulsoCopiar)])));
    redesenhar();
  }

  // Quantos filtros da linha "Mais filtros" estão em uso
  function qtdMaisFiltros() { return ['feedz', 'tipo', 'casa'].filter(k => estado[k] !== 'todos').length; }

  function kpiFila(k, cont) {
    const [label, cor] = FILAS[k];
    const ativo = estado.fila === k;
    // O cartão ocupa a altura toda da linha: títulos que quebram em duas
    // linhas não deixam os cartões com alturas diferentes.
    const cartao = kpi(label, U.fmtInt(cont[k] || 0), ativo ? 'filtrando — clique de novo para limpar' : 'clique para ver a lista', cor)
      .replace('class="kpi" style="', 'class="kpi" style="flex:1;margin:0;');
    return `<div data-fila="${k}" style="cursor:pointer;display:flex;flex-direction:column;${ativo ? 'outline:2px solid ' + cor + ';border-radius:12px' : ''}" title="Clique para filtrar">${cartao}</div>`;
  }

  // Quando o link de entrevista foi gerado e quando a entrevista foi respondida
  // (link do Hub, Forms ou a data de realização lançada na ficha).
  // (…Completo: com hora, para ordenar os do mesmo dia.)
  function dataLinkCompleta(r) { return r.link && r.link.criadoEm ? String(r.link.criadoEm) : null; }
  function dataRespostaCompleta(r) {
    if (r.link && r.link.status === 'Preenchido' && r.link.dataFinalizacao) return String(r.link.dataFinalizacao);
    if (r.forms && r.forms.length) return r.forms[0].dataConclusao || null;
    return statusEntrevista(r) === 'Realizada' ? (r.db.dataRealizacao || null) : null;
  }
  const dataLink = r => (dataLinkCompleta(r) || '').slice(0, 10) || null;
  const dataResposta = r => (dataRespostaCompleta(r) || '').slice(0, 10) || null;
  const linkPendente = r => !!(r.link && r.link.status === 'Pendente');
  // Texto do andamento do link: respondido / pendente / encerrado (recusou)
  const situacaoLink = l => (l.status === 'Preenchido' ? 'respondido' : l.status === 'Encerrado' ? 'encerrado (entrevista recusada)' : 'aguardando resposta');
  // Dias desde que o link (ainda sem resposta) foi gerado
  const diasLinkPendente = r => (linkPendente(r) && dataLink(r) ? diasEntre(dataLink(r), hojeISO()) : null);
  // Por onde a entrevista foi feita: link do Hub, Forms, realizada sem
  // resposta guardada (ex.: presencial) ou nenhuma.
  function canalEntrevista(r) {
    if (r.link && r.link.status === 'Preenchido') return 'link';
    if (r.forms && r.forms.length) return 'forms';
    return statusEntrevista(r) === 'Realizada' ? 'presencial' : 'nenhum';
  }
  function faixaCasa(r) {
    if (r.tempo_casa === null || r.tempo_casa === undefined) return null;
    return r.tempo_casa <= 45 ? 'ate45' : r.tempo_casa <= 90 ? 'ate90' : 'mais90';
  }

  function aplicarFiltros(rows) {
    const q = n(estado.busca);
    let out = rows.filter(r => {
      if (q && ![r.id, r.nome, r.cargo, r.unidade, r.departamento, r.solicitante].some(v => n(v).includes(q))) return false;
      if (estado.fila !== 'todas' && fila(r) !== estado.fila) return false;
      if (estado.feedz !== 'todos' && r.db.statusFeedz !== estado.feedz) return false;
      if (estado.entrevista !== 'todos' && statusEntrevista(r) !== estado.entrevista) return false;
      if (estado.canal !== 'todos' && canalEntrevista(r) !== estado.canal) return false;
      if (estado.pendente !== 'todos') {
        const d = diasLinkPendente(r);
        if (d === null || d < Number(estado.pendente)) return false;
      }
      if (estado.tipo !== 'todos' && r.db.tipo !== estado.tipo) return false;
      if (estado.casa !== 'todos') {
        const fx = faixaCasa(r);
        // "Até 90 dias" inclui quem saiu em até 45 dias
        if (estado.casa === 'ate90' ? !(fx === 'ate45' || fx === 'ate90') : fx !== estado.casa) return false;
      }
      return true;
    });
    const o = estado.ordem;
    const numId = r => Number(String(r.id).replace(/\D/g, '')) || 0;
    // Datas do link / da resposta: fichas sem a data vão para o fim da lista
    const desc = (va, vb) => (va && vb ? String(vb).localeCompare(String(va)) : va ? -1 : vb ? 1 : 0);
    out = out.slice().sort((a, b) => {
      if (o === 'pendente_antigo') {
        const la = linkPendente(a) ? dataLinkCompleta(a) : null, lb = linkPendente(b) ? dataLinkCompleta(b) : null;
        return (la && lb ? String(la).localeCompare(String(lb)) : la ? -1 : lb ? 1 : 0) || String(b.data_solicitacao || '').localeCompare(String(a.data_solicitacao || ''));
      }
      if (o === 'link') return desc(dataLinkCompleta(a), dataLinkCompleta(b)) || String(b.data_solicitacao || '').localeCompare(String(a.data_solicitacao || ''));
      if (o === 'resposta') return desc(dataRespostaCompleta(a), dataRespostaCompleta(b)) || String(b.data_solicitacao || '').localeCompare(String(a.data_solicitacao || ''));
      if (o === 'id') return numId(b) - numId(a);
      if (o === 'demissao') return String(b.data_demissao || '').localeCompare(String(a.data_demissao || ''));
      if (o === 'criterios') return (b.criterios - a.criterios) || String(b.data_solicitacao || '').localeCompare(String(a.data_solicitacao || ''));
      return String(b.data_solicitacao || '').localeCompare(String(a.data_solicitacao || '')) || numId(b) - numId(a);
    });
    return out;
  }

  function criteriosHtml(r) {
    const dots = [0, 1, 2, 3].map(i => `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:2px;background:${i < r.criterios ? '#eb6834' : '#dfe3e8'}"></span>`).join('');
    return `<span title="Critérios de desligamento: ${r.criterios} de 4">${dots}<b style="margin-left:4px">${r.criterios}</b></span>`;
  }

  function desenharTabela(el, base) {
    const rows = aplicarFiltros(base);
    const paginas = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (estado.pagina > paginas) estado.pagina = paginas;
    const ini = (estado.pagina - 1) * PAGE_SIZE;
    const pag = rows.slice(ini, ini + PAGE_SIZE);
    if (!rows.length) { el.innerHTML = empty('Nenhum desligamento com esses filtros.'); return; }
    el.innerHTML = `
      <div class="table-wrap" style="max-height:none"><table class="dt">
        <thead><tr><th>ID</th><th>Solicitação</th><th>Colaborador</th><th>Unidade / loja</th><th>Demissão</th><th>Tipo</th><th>Status na Feedz</th><th>Entrevista</th><th title="Critérios de desligamento (0 a 4): AVE 45 < 3, AVE 90 < 3, média AVE < 3, recebeu feedback">Critérios</th><th></th></tr></thead>
        <tbody>${pag.map((r, i) => {
          const st = statusEntrevista(r);
          const [fl, cor] = FILAS[fila(r)];
          return `<tr>
            <td><b>${esc(r.id || '—')}</b></td>
            <td>${U.fmtDateBR(r.data_solicitacao) || '—'}<div style="font-size:10.5px;color:var(--muted)">${esc(r.solicitante || '')}</div></td>
            <td><b>${esc(r.nome)}</b><div style="font-size:10.5px;color:var(--muted)">${esc(r.cargo || 'Cargo não informado')}</div></td>
            <td>${esc(r.unidade || '—')}<div style="font-size:10.5px;color:var(--muted)">${esc(r.departamento || '')}</div></td>
            <td>${U.fmtDateBR(r.data_demissao) || '—'}${r.tempo_casa !== null ? `<div style="font-size:10.5px;color:var(--muted)">${U.fmtInt(r.tempo_casa)} dias de casa</div>` : ''}</td>
            <td style="font-size:11px">${esc(r.db.tipo || '—')}</td>
            <td>${pill(r.db.statusFeedz || '—', CORES_FEEDZ[r.db.statusFeedz] || '#8A8F98')}</td>
            <td>${pill(st, CORES_ENTREVISTA[st] || '#8A8F98')}${r.link ? `<div style="font-size:9.5px;color:var(--muted);margin-top:2px">link do Hub gerado em ${U.fmtDateBR(dataLink(r)) || '—'}${r.link.status === 'Preenchido' ? '' : r.link.status === 'Encerrado' ? ' · encerrado' : ' · pendente' + (diasLinkPendente(r) ? ` há ${diasLinkPendente(r)} dia(s)` : '')}</div>` : ''}${dataResposta(r) ? `<div style="font-size:9.5px;color:var(--muted)">respondida em ${U.fmtDateBR(dataResposta(r))}${r.link && r.link.status === 'Preenchido' ? ' (link)' : r.forms && r.forms.length ? ' (Forms)' : ''}</div>` : ''}<div style="margin-top:2px">${pill(fl, cor)}</div></td>
            <td>${criteriosHtml(r)}</td>
            <td><button type="button" class="btn btn-outline btn-sm" style="width:auto" data-abrir="${ini + i}">Abrir</button></td>
          </tr>`;
        }).join('')}</tbody></table></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;flex-wrap:wrap;gap:8px">
        <span class="sub" style="color:var(--muted);font-size:12px">Mostrando ${U.fmtInt(ini + 1)}–${U.fmtInt(Math.min(ini + PAGE_SIZE, rows.length))} de ${U.fmtInt(rows.length)}</span>
        <div style="display:flex;gap:8px;align-items:center">
          <button type="button" class="btn btn-outline btn-sm" style="width:auto" id="cd-prev" ${estado.pagina <= 1 ? 'disabled' : ''}>&lsaquo; Anterior</button>
          <span style="font-size:12px">Página ${estado.pagina} de ${paginas}</span>
          <button type="button" class="btn btn-outline btn-sm" style="width:auto" id="cd-next" ${estado.pagina >= paginas ? 'disabled' : ''}>Próxima &rsaquo;</button>
        </div>
      </div>`;
    const prev = el.querySelector('#cd-prev'), next = el.querySelector('#cd-next');
    if (prev) prev.addEventListener('click', () => { estado.pagina--; desenharTabela(el, base); });
    if (next) next.addEventListener('click', () => { estado.pagina++; desenharTabela(el, base); });
    el.querySelectorAll('[data-abrir]').forEach(b => b.addEventListener('click', () => abrirFormulario(rows[Number(b.dataset.abrir)])));
  }

  // ------------------------------------------------------------------
  // Modal: lançar (r = null) ou abrir/editar um desligamento
  // ------------------------------------------------------------------
  function modal(titulo, sub, corpo) {
    const ant = document.getElementById('hub-cd-modal'); if (ant) ant.remove();
    const m = document.createElement('div');
    m.id = 'hub-cd-modal';
    m.innerHTML = `
      <div data-fechar style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:998"></div>
      <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.3);width:94%;max-width:920px;max-height:90vh;z-index:999;display:flex;flex-direction:column">
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
  const bloco = (titulo, html) => `<div class="card" style="margin-bottom:12px;padding:14px 16px"><div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">${titulo}</div>${html}</div>`;
  const campo = (label, valor) => `<div><span style="color:var(--muted);font-size:11px">${label}</span><br><b style="font-size:12.5px">${valor === null || valor === undefined || valor === '' ? '—' : valor}</b></div>`;
  const grade = itens => `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px 16px">${itens.join('')}</div>`;
  const nota = v => (v === null || v === undefined ? '—' : `<span style="color:${v < 3 ? '#d03b3b' : 'inherit'}">${U.fmt1(v)}</span>`);
  const sel = (id, opcoes, atual, vazio) => `<select id="${id}" style="width:100%">${vazio ? '<option value="">— selecione —</option>' : ''}${(atual && !opcoes.includes(atual) ? [atual] : []).concat(opcoes).map(o => `<option ${o === atual ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  const inp = (id, label, valor, tipo, extra) => `<div class="field"><label>${label}</label><input id="${id}" type="${tipo || 'text'}" value="${esc(valor || '')}" ${extra || ''}></div>`;
  const sugestoes = (id, valores) => `<datalist id="${id}">${Array.from(new Set(valores.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')).map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;

  function camposEditaveis(d) {
    const todos = lancamentos();
    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px 16px">
        ${inp('cd-f-id', 'ID do desligamento', d.idDesligamento)}
        ${inp('cd-f-data', 'Data da solicitação', d.dataSolicitacao || hojeISO(), 'date')}
        ${inp('cd-f-solic', 'Solicitante (gestor)', d.solicitante, 'text', 'list="cd-l-solic"')}
        ${inp('cd-f-dem', 'Data da demissão', d.dataDemissao, 'date')}
        <div class="field"><label>Tipo</label>${sel('cd-f-tipo', TIPOS, d.tipo, true)}</div>
        ${inp('cd-f-tipodesl', 'Tipo do desligamento', d.tipoDesligamento, 'text', 'list="cd-l-tipodesl"')}
        ${inp('cd-f-unid', 'Unidade', d.unidade, 'text', 'list="cd-l-unid"')}
        ${inp('cd-f-depto', 'Departamento / loja', d.departamento)}
        ${inp('cd-f-cargo', 'Cargo', d.cargo)}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px 16px;margin-top:8px">
        <div class="field"><label>Motivo do desligamento</label><select id="cd-f-motivo" style="width:100%">
          <option value="">— selecione —</option>
          ${d.motivo && !MOTIVOS_TODOS.includes(d.motivo) ? `<option value="${esc(d.motivo)}" selected>${esc(d.motivo)} (antigo — escolha um da lista)</option>` : ''}
          ${MOTIVOS.map(([g, itens]) => `<optgroup label="${esc(g)}">${itens.map(i => `<option ${i === d.motivo ? 'selected' : ''}>${esc(i)}</option>`).join('')}</optgroup>`).join('')}
        </select></div>
        <div class="field"><label>Detalhe do motivo <span id="cd-f-det-obrig" style="color:#d03b3b;${d.motivo === 'Outro' ? '' : 'display:none'}">(obrigatório)</span></label><input id="cd-f-motivo-det" type="text" value="${esc(d.motivoDetalhe || '')}" placeholder="Opcional — descreva com mais detalhe"></div>
      </div>
      ${sugestoes('cd-l-solic', todos.map(x => x.solicitante))}${sugestoes('cd-l-tipodesl', todos.map(x => x.tipoDesligamento))}
      ${sugestoes('cd-l-unid', todos.map(x => x.unidade))}`;
  }
  function camposAcompanhamento(d, r) {
    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px 16px">
        <div class="field"><label>Status na Feedz</label>${sel('cd-f-feedz', STATUS_FEEDZ, d.statusFeedz || 'Pendente')}</div>
        <div class="field"><label>Status da entrevista</label>${sel('cd-f-entrevista', STATUS_ENTREVISTA, (r ? statusEntrevista(r) : d.statusEntrevista) || 'Não Realizada')}</div>
        ${inp('cd-f-realiz', 'Data da realização', d.dataRealizacao || (r && r.data_realizacao) || '', 'date')}
        <div class="field"><label>Contato (celular)</label><div style="display:flex;gap:6px"><input id="cd-f-contato" type="text" value="${esc(d.contato || '')}" placeholder="(DDD) número" style="flex:1"><a id="cd-f-wa" class="btn btn-outline btn-sm" style="width:auto;${linkWhatsapp(d.contato) ? '' : 'display:none'}" target="_blank" rel="noopener" href="${esc(linkWhatsapp(d.contato) || '#')}" title="Abrir conversa no WhatsApp">WhatsApp</a></div>
          ${!d.contato && (d.colaboradorExternalId || (r && r.colab && r.colab.external_id)) ? '<button type="button" class="btn btn-outline btn-sm" style="width:auto;margin-top:4px" id="cd-f-buscar-contato">Buscar na Feedz</button>' : ''}</div>
        <div class="field"><label>&nbsp;</label><label style="display:flex;gap:6px;align-items:center;font-weight:500"><input id="cd-f-natal" type="checkbox" ${d.extraNatal ? 'checked' : ''} style="width:auto"> Extra de Natal</label></div>
      </div>
      <div class="field full" style="margin-top:8px"><label>Observações</label><textarea id="cd-f-obs" rows="3" style="width:100%">${esc(d.observacoes || '')}</textarea></div>
      ${r && r.link ? `<div style="margin-top:6px;font-size:11.5px;color:var(--muted)">Link de entrevista gerado por <b>${esc(r.link.geradoPor || '—')}</b>${r.link.criadoEm ? ' em ' + U.fmtDateBR(String(r.link.criadoEm).slice(0, 10)) : ''} — <b>${situacaoLink(r.link)}${r.link.status === 'Preenchido' && r.link.dataFinalizacao ? ' em ' + U.fmtDateBR(String(r.link.dataFinalizacao).slice(0, 10)) : ''}</b>. ${r.link.status === 'Encerrado' ? 'O link não aceita mais resposta; se a pessoa mudar de ideia, tire a entrevista de "Recusado" e o mesmo link volta a valer.' : 'O status exibido na lista acompanha o link automaticamente. Ao marcar a entrevista como "Recusado", o link é encerrado.'}</div>` : ''}
      ${r && r.forms && r.forms.length ? `<div style="margin-top:6px;font-size:11.5px;color:var(--muted)">Entrevista respondida pelo <b>Forms</b> em ${r.forms.map(f => `<b>${U.fmtDateBR(f.dataConclusao) || '—'}</b>${f.questionarioAntigo ? ' (questionário antigo, 2023–2025)' : ''}`).join(' e ')}.</div>` : ''}`;
  }
  function lerCampos(m) {
    const v = id => { const e = m.querySelector('#' + id); return e ? e.value.trim() : ''; };
    return {
      idDesligamento: v('cd-f-id'), dataSolicitacao: v('cd-f-data'), solicitante: v('cd-f-solic'), dataDemissao: v('cd-f-dem'),
      tipo: v('cd-f-tipo'), tipoDesligamento: v('cd-f-tipodesl'), unidade: v('cd-f-unid'), departamento: v('cd-f-depto'),
      cargo: v('cd-f-cargo'), motivo: v('cd-f-motivo'), motivoDetalhe: v('cd-f-motivo-det'), statusFeedz: v('cd-f-feedz'), statusEntrevista: v('cd-f-entrevista'),
      dataRealizacao: v('cd-f-realiz'), contato: v('cd-f-contato'), observacoes: v('cd-f-obs'), extraNatal: !!(m.querySelector('#cd-f-natal') || {}).checked
    };
  }

  // Respostas do Forms da ficha (supabase-controle-respostas-forms.sql): a
  // função do banco já devolve sem nome/e-mail/telefone/CPF, na ordem do
  // questionário. Planilha 30 = questionário antigo, com outras perguntas.
  const COLUNAS_DO_RH = new Set(['Unidade', 'Departamento', 'Motivo do Desligamento', 'Submotivo de Desligamento', 'Data do Desligamento']);
  // Datas que o Excel gravou como número de série (ex.: 46228)
  function valorRespostaForms(pergunta, v) {
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return U.fmtDateBR(s);
    if (/data|demiss|admiss/i.test(pergunta) && /^\d{5}(\.\d+)?$/.test(s) && +s > 30000 && +s < 60000)
      return U.fmtDateBR(new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 864e5).toISOString().slice(0, 10));
    return s;
  }

  // ------------------------------------------------------------------
  // Exportar Excel: a lista com os filtros atuais + as respostas das
  // entrevistas dessas fichas (link do Hub e Forms). Sem contato, CPF e
  // e-mail — a "matrícula" da Feedz é o celular da pessoa.
  // ------------------------------------------------------------------
  const COLUNAS_FORA_DA_EXPORTACAO = new Set(['ID', 'Hora de início', 'Hora de conclusão', 'Hora da última modificação', 'Questionário',
    'Email', 'Nome', 'Nome2', 'E-mail:', 'Seu nome completo', 'Seu e-mail']);
  // Perguntas do link do Hub que na planilha 34 têm outro enunciado (mesma
  // pergunta, mesmas opções) → vão para a coluna da planilha.
  const PERGUNTA_LINK_NA_PLANILHA = {
    'Como você considera a COMUNICAÇÃO DA EMPRESA, em relação às políticas, diretrizes e normas?': 'Comunicação',
    'Como você avalia essa prática de FEEDBACKS recebidos?': 'Como você avalia essa prática?'
  };
  const chavePergunta = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const chaveSolta = s => n(chavePergunta(s)).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  function celulaData(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? { t: 'n', z: 'dd/mm/yyyy', v: (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000 } : null;
  }
  function folha(cab, linhas, larguras) {
    const ws = XLSX.utils.aoa_to_sheet([cab].concat(linhas));
    ws['!cols'] = cab.map((c, i) => ({ wch: (larguras && larguras[i]) || Math.min(60, Math.max(14, String(c).length + 2)) }));
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(linhas.length, 1), c: cab.length - 1 } }) };
    return ws;
  }
  async function rpcTudo(fn) {
    let all = [], from = 0;
    for (;;) {
      const { data, error } = await sb.rpc(fn).range(from, from + 999);
      if (error) throw error;
      all = all.concat(data || []);
      if (!data || data.length < 1000) return all;
      from += 1000;
    }
  }

  async function exportarExcel(rows, btn) {
    if (!window.XLSX) { alert('Não foi possível gerar o Excel: a biblioteca de planilhas não carregou. Recarregue a página e tente de novo.'); return; }
    if (!rows.length) { alert('Não há desligamentos na lista com os filtros atuais.'); return; }
    const rotulo = btn.textContent;
    btn.disabled = true; btn.textContent = 'Gerando Excel...';
    try {
      const canalNome = Object.fromEntries(CANAIS);
      const nota1 = v => (v === null || v === undefined ? null : Math.round(v * 10) / 10);

      // 1) Lista de desligamentos
      const cab1 = ['ID', 'Data da solicitação', 'Solicitante', 'Colaborador', 'Cargo', 'Unidade', 'Loja / departamento', 'Admissão', 'Demissão',
        'Tempo de casa (dias)', 'Tipo', 'Tipo do desligamento', 'Motivo', 'Detalhe do motivo', 'Status na Feedz', 'Status da entrevista', 'Fila',
        'Canal da entrevista', 'Link gerado em', 'Situação do link', 'Entrevista respondida em', 'Extra de Natal', 'Critérios (0 a 4)',
        'AVE 45 - gestor', 'AVE 90 - gestor', 'Média AVE', 'Feedbacks recebidos', 'Situação no Headcount', 'Observações'];
      const linhas1 = rows.map(r => {
        const canal = canalEntrevista(r);
        return [r.id || '', celulaData(r.data_solicitacao), r.solicitante || '', r.nome || '', r.cargo || '', r.unidade || '', r.departamento || '',
          celulaData(r.data_admissao), celulaData(r.data_demissao), r.tempo_casa, r.db.tipo || '', r.db.tipoDesligamento || '', r.db.motivo || '',
          r.db.motivoDetalhe || '', r.db.statusFeedz || '', statusEntrevista(r), FILAS[fila(r)][0],
          canal === 'nenhum' ? '' : canalNome[canal], celulaData(dataLink(r)), r.link ? situacaoLink(r.link) : '', celulaData(dataResposta(r)),
          r.db.extraNatal ? 'Sim' : 'Não', r.criterios, nota1(r.nota45), nota1(r.nota90), nota1(r.mediaAve), r.feedbacks, r.situacaoHeadcount || '',
          r.db.observacoes || ''];
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, folha(cab1, linhas1, [8, 14, 28, 36, 28, 26, 32, 12, 12, 12, 24, 40, 40, 30, 20, 16, 30, 26, 14, 28, 14, 10, 10, 10, 10, 10, 10, 16, 50]), 'Desligamentos');

      // 2) Respostas das entrevistas dessas fichas
      const porFicha = new Map(rows.map(r => [String(r.db.id), r]));
      let forms = [], ordem = [];
      const temForms = rows.some(r => r.forms && r.forms.length);
      if (temForms) {
        forms = (await rpcTudo('controle_desligamento_respostas_forms_exportar')).filter(x => porFicha.has(String(x.controle_id)));
        const { data, error } = await sb.from('entrevista_pesquisa_perguntas').select('origem,ordem,pergunta').order('ordem');
        if (error) throw error;
        ordem = data || [];
      }
      const baseResp = (r, canal, dataResp) => [r.id || '', r.nome || '', r.unidade || '', r.departamento || '', celulaData(r.data_demissao), canal, celulaData(dataResp)];
      const cabBase = ['ID', 'Colaborador', 'Unidade', 'Loja / departamento', 'Demissão', 'Canal', 'Respondida em'];

      // Colunas de perguntas: na ordem do questionário; perguntas do link que
      // têm o mesmo texto da planilha 34 caem na mesma coluna.
      function montarAba(origem, respostasForms, respostasLink) {
        const colunas = [], idx = new Map();
        // Forms: a coluna é o texto exato da pergunta (há perguntas diferentes
        // que só mudam na pontuação final). Link: mesmo texto; se não houver,
        // aceita a diferença de pontuação/prefixo só quando aponta para UMA
        // coluna — na dúvida, a pergunta do link ganha coluna própria.
        const coluna = (titulo, doLink) => {
          const k = chavePergunta(titulo);
          if (idx.has(k)) return idx.get(k);
          let i;
          if (doLink) {
            const ks = chaveSolta(titulo);
            let cands = colunas.map((c, j) => j).filter(j => chaveSolta(colunas[j]) === ks);
            if (!cands.length && ks.length > 30) cands = colunas.map((c, j) => j).filter(j => { const c2 = chaveSolta(colunas[j]); return c2.length > 30 && (c2.startsWith(ks) || ks.startsWith(c2)); });
            if (cands.length === 1) i = cands[0];
          }
          if (i === undefined) { i = colunas.length; colunas.push(k); }
          idx.set(k, i);
          return i;
        };
        const usa = titulo => !COLUNAS_FORA_DA_EXPORTACAO.has(chavePergunta(titulo)) && !(origem === 'p34' && COLUNAS_DO_RH.has(chavePergunta(titulo))) &&
          !/^(digite seu cpf|seu telefone)/i.test(chavePergunta(titulo));
        ordem.filter(o => o.origem === origem && usa(o.pergunta)).forEach(o => coluna(o.pergunta));
        const linhas = [];
        for (const x of respostasForms) {
          const r = porFicha.get(String(x.controle_id)); const vals = [];
          for (const [k, v] of Object.entries(x.respostas || {})) {
            if (!usa(k) || v === null || v === undefined || String(v).trim() === '') continue;
            vals[coluna(k)] = typeof v === 'number' && !/data|demiss|admiss/i.test(k) ? v : valorRespostaForms(k, v);
          }
          linhas.push({ base: baseResp(r, 'Forms', x.data_conclusao), vals });
        }
        const M = window.HUB_ED_MODELO, PR = window.HUB_ED_RENDER;
        for (const r of respostasLink) {
          const vals = [];
          for (const qidStr of Object.keys(r.link.respostas || {}).sort((a, b) => Number(a) - Number(b))) {
            const q = M && M.PERGUNTAS[Number(qidStr)];
            if (!q || !usa(q.titulo)) continue;
            const leg = PR.respostaLegivel(Number(qidStr), q, r.link.respostas[qidStr]);
            if (leg === null || leg === undefined || leg === '') continue;
            vals[coluna(PERGUNTA_LINK_NA_PLANILHA[q.titulo] || q.titulo, true)] = Array.isArray(leg) ? leg.join('; ') : leg;
          }
          linhas.push({ base: baseResp(r, 'Link do Hub', dataResposta(r)), vals });
        }
        // só as colunas com alguma resposta
        const usadas = colunas.map((_, i) => linhas.some(l => l.vals[i] !== undefined));
        const cab = cabBase.concat(colunas.filter((_, i) => usadas[i]));
        const dados = linhas.map(l => l.base.concat(colunas.map((_, i) => (l.vals[i] === undefined ? '' : l.vals[i])).filter((_, i) => usadas[i])));
        return { cab, dados };
      }
      const comLink = rows.filter(r => r.link && r.link.status === 'Preenchido' && r.link.respostas);
      const atual = montarAba('p34', forms.filter(x => !x.questionario_antigo), comLink);
      const antigo = montarAba('p30', forms.filter(x => x.questionario_antigo), []);
      const largBase = [8, 36, 26, 32, 12, 14, 14];
      if (atual.dados.length) XLSX.utils.book_append_sheet(wb, folha(atual.cab, atual.dados, largBase), 'Respostas (atual)');
      if (antigo.dados.length) XLSX.utils.book_append_sheet(wb, folha(antigo.cab, antigo.dados, largBase), 'Respostas (antigo 2023-2025)');

      XLSX.writeFile(wb, `controle-desligamento_${U.todayISO()}.xlsx`, { compression: true });
    } catch (err) {
      alert('Não consegui gerar o Excel: ' + (err.message || err));
    } finally {
      btn.disabled = false; btn.textContent = rotulo;
    }
  }

  async function abrirRespostasForms(r) {
    const m = modal('Respostas — ' + esc(r.nome), 'Entrevista de desligamento respondida pelo Forms', '<p class="sub">Carregando respostas...</p>');
    const corpo = m.lastElementChild.lastElementChild; // área de conteúdo do modal()
    try {
      const { data, error } = await sb.rpc('controle_desligamento_respostas_forms', { p_controle_id: r.db.id });
      if (error) throw error;
      const grupos = new Map();
      for (const x of data || []) {
        if (!grupos.has(x.planilha_id)) grupos.set(x.planilha_id, { data: x.data_conclusao, antigo: x.questionario_antigo, itens: [] });
        // As últimas colunas da planilha 34 não são respostas: o RH preenchia
        // (unidade, departamento, motivo/submotivo e data do desligamento, esta
        // às vezes do vínculo errado) — repetem o que a pessoa respondeu ou o
        // que já está na ficha.
        if (!x.questionario_antigo && COLUNAS_DO_RH.has(String(x.pergunta).trim())) continue;
        grupos.get(x.planilha_id).itens.push(x);
      }
      const valor = valorRespostaForms;
      corpo.innerHTML = !grupos.size ? '<p class="sub" style="color:var(--muted)">Sem respostas registradas.</p>' : Array.from(grupos.values()).map(g => `
        <div style="margin-bottom:18px">
          <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Respondida em <b>${U.fmtDateBR(g.data) || '—'}</b>${g.antigo ? ' · <b>questionário antigo (2023–2025)</b>, com perguntas diferentes das atuais' : ''}</div>
          ${g.itens.map(x => `<div style="padding:8px 0;border-bottom:1px solid var(--border)">
            <div style="font-size:12px;font-weight:600;margin-bottom:3px">${esc(String(x.pergunta).trim())}</div>
            <div style="font-size:13px;white-space:pre-wrap">${esc(valor(x.pergunta, x.resposta))}</div>
          </div>`).join('')}
        </div>`).join('');
    } catch (err) {
      corpo.innerHTML = `<div class="msg err">Não consegui carregar as respostas: ${esc(err.message)}</div>`;
    }
  }

  function abrirFormulario(r) {
    const novo = !r;
    const d = novo ? { statusFeedz: 'Pendente', statusEntrevista: 'Não Realizada' } : r.db;
    const cols = ((window.HUB_DATA && HUB_DATA.colaboradores) || []).slice().sort((a, b) => (a.nome_completo || a.nome || '').localeCompare(b.nome_completo || b.nome || ''));
    const podeLink = window.HUB_ENTREVISTA_DESLIGAMENTO && HUB_ENTREVISTA_DESLIGAMENTO.canGerarLink();
    let corpo = '';
    if (novo) {
      corpo += bloco('Colaborador', `
        <input id="cd-n-busca" type="text" placeholder="Busque no Headcount pelo nome..." style="width:100%">
        <select id="cd-n-colab" size="6" style="width:100%;margin-top:6px">${cols.map((c, i) => `<option value="${i}">${esc(c.nome_completo || c.nome)} — ${esc(c.situacao || '')} · ${esc(c.unidade || '')}${c.departamento ? ' · ' + esc(c.departamento) : ''}</option>`).join('')}</select>
        <p class="sub" style="margin-top:6px;font-size:11px">Cargo, unidade, departamento e admissão vêm do Headcount (dá para ajustar abaixo). O CPF é guardado no lançamento para ligar a pessoa a uma futura recontratação.</p>`);
    } else {
      corpo += bloco('Colaborador' + (r.colab ? '' : ' <span style="color:#d03b3b;text-transform:none;font-weight:600">· não encontrado no Headcount</span>'), grade([
        campo('Nome', esc(r.nome)), campo('Admissão', U.fmtDateBR(r.data_admissao)),
        campo('Tempo de casa', r.tempo_casa === null ? null : U.fmtInt(r.tempo_casa) + ' dias'),
        campo('E-mail', esc(r.email)), campo('Situação no Headcount', esc(r.situacaoHeadcount))
      ]));
      corpo += bloco('Critérios de desligamento — ' + r.criterios + ' de 4', grade([
        campo('AVE 45 — gestor', nota(r.nota45)), campo('AVE 45 — autoavaliação', nota(r.auto45)),
        campo('AVE 90 — gestor', nota(r.nota90)), campo('AVE 90 — autoavaliação', nota(r.auto90)),
        campo('Média AVE (gestor 45 e 90)', r.mediaAve === null ? 'Não válido' : nota(r.mediaAve)), campo('Feedbacks recebidos', U.fmtInt(r.feedbacks))
      ]) + '<p class="sub" style="margin-top:8px;font-size:11px">Cada critério atendido soma 1: AVE 45 abaixo de 3, AVE 90 abaixo de 3, média abaixo de 3 e ter recebido feedback. Nota da AVE = média de todas as competências do gestor, incluindo o "Batendo o Martelo" (a mesma da Feedz).</p>');
    }
    corpo += bloco('Solicitação', camposEditaveis(d));
    corpo += bloco('Acompanhamento', camposAcompanhamento(d, r));
    corpo += `<div class="msg err" id="cd-f-msg" style="display:none"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px;flex-wrap:wrap">
        ${!novo && r.link && r.link.status === 'Preenchido' ? '<button type="button" class="btn btn-outline btn-sm" style="width:auto" id="cd-respostas">Ver respostas</button>' : ''}
        ${!novo && r.forms && r.forms.length ? `<button type="button" class="btn btn-outline btn-sm" style="width:auto" id="cd-respostas-forms">Ver respostas${r.link && r.link.status === 'Preenchido' ? ' do Forms' : ''}</button>` : ''}
        ${!novo && podeLink && (r.link || !(r.forms && r.forms.length)) && !(r.link && r.link.status === 'Encerrado') ? (r.link ?'<button type="button" class="btn btn-outline btn-sm" style="width:auto" id="cd-copiar">Copiar link de entrevista</button>' : '<button type="button" class="btn btn-outline btn-sm" style="width:auto" id="cd-gerar">Gerar link de entrevista</button>') : ''}
        <button type="button" class="btn btn-sm" style="width:auto" id="cd-salvar">${novo ? 'Lançar desligamento' : 'Salvar alterações'}</button>
      </div>
      ${!novo ? `<p class="sub" style="margin-top:8px;font-size:10.5px;color:var(--muted);text-align:right">Lançado por ${esc(d.criadoPor || '—')}${d.atualizadoPor ? ` · última alteração por ${esc(d.atualizadoPor)} em ${U.fmtDateBR(String(d.atualizadoEm || '').slice(0, 10))}` : ''}</p>` : ''}`;

    const m = modal(novo ? 'Lançar desligamento' : esc(r.nome), novo ? 'ID que chegou pelo Forms do gestor' : `ID ${esc(r.id)} · ${esc(r.unidade || '')}${r.departamento ? ' · ' + esc(r.departamento) : ''}`, corpo);
    const msg = texto => { const e = m.querySelector('#cd-f-msg'); e.textContent = texto; e.style.display = texto ? 'block' : 'none'; };

    let escolhido = null;
    if (novo) {
      const busca = m.querySelector('#cd-n-busca'), lista = m.querySelector('#cd-n-colab');
      busca.addEventListener('input', () => { const t = n(busca.value); Array.from(lista.options).forEach((o, i) => { o.hidden = t && !n(cols[i].nome_completo || cols[i].nome).includes(t); }); });
      lista.addEventListener('change', () => {
        escolhido = cols[Number(lista.value)];
        const set = (id, v) => { const e = m.querySelector('#' + id); if (e) e.value = v || ''; };
        set('cd-f-unid', escolhido.unidade); set('cd-f-depto', escolhido.departamento); set('cd-f-cargo', escolhido.cargo);
        const alvo = escolhido;
        contatoDaFeedz(alvo.external_id).then(tel => { if (escolhido === alvo) { set('cd-f-contato', tel); atualizarWa(); } }).catch(() => {});
      });
    }

    const inContato = m.querySelector('#cd-f-contato'), aWa = m.querySelector('#cd-f-wa');
    function atualizarWa() { const l = linkWhatsapp(inContato.value); aWa.style.display = l ? '' : 'none'; if (l) aWa.href = l; }
    inContato.addEventListener('input', atualizarWa);
    const btnBuscar = m.querySelector('#cd-f-buscar-contato');
    if (btnBuscar) btnBuscar.addEventListener('click', async () => {
      btnBuscar.disabled = true; btnBuscar.textContent = 'Buscando...';
      try {
        const tel = await contatoDaFeedz(d.colaboradorExternalId || (r.colab && r.colab.external_id));
        if (tel) { inContato.value = tel; atualizarWa(); btnBuscar.remove(); }
        else { btnBuscar.textContent = 'Sem contato na Feedz'; }
      } catch (err) { btnBuscar.textContent = 'Não consegui buscar'; btnBuscar.title = err.message; }
    });

    const selMotivo = m.querySelector('#cd-f-motivo');
    selMotivo.addEventListener('change', () => { m.querySelector('#cd-f-det-obrig').style.display = selMotivo.value === 'Outro' ? '' : 'none'; });

    const btnGerar = m.querySelector('#cd-gerar');
    if (btnGerar) btnGerar.addEventListener('click', () => {
      m.remove();
      HUB_ENTREVISTA_DESLIGAMENTO.abrirGerarLinkPara({ externalId: r.colab && r.colab.external_id, nome: (r.colab && (r.colab.nome_completo || r.colab.nome)) || r.nome, idDesligamento: r.id });
    });
    const btnResp = m.querySelector('#cd-respostas');
    if (btnResp) btnResp.addEventListener('click', () => { m.remove(); HUB_ENTREVISTA_DESLIGAMENTO.abrirRespostas(r.link); });
    const btnRespForms = m.querySelector('#cd-respostas-forms');
    if (btnRespForms) btnRespForms.addEventListener('click', () => { m.remove(); abrirRespostasForms(r); });
    const btnCopiar = m.querySelector('#cd-copiar');
    if (btnCopiar) btnCopiar.addEventListener('click', () => HUB_ENTREVISTA_DESLIGAMENTO.copiarLink(r.link));

    m.querySelector('#cd-salvar').addEventListener('click', async () => {
      msg('');
      const v = lerCampos(m);
      if (!v.idDesligamento) return msg('Informe o ID do desligamento.');
      if (novo && !escolhido) return msg('Escolha o colaborador no Headcount.');
      if (v.motivo === 'Outro' && !v.motivoDetalhe) return msg('Com o motivo "Outro", descreva o motivo no campo "Detalhe do motivo".');
      const repetido = lancamentos().some(x => String(x.idDesligamento) === v.idDesligamento && (novo || x.id !== d.id));
      if (repetido && !confirm(`O ID ${v.idDesligamento} já está lançado. Lançar mesmo assim? (use o status "ID Duplicado" se for pedido repetido do gestor)`)) return;
      const btn = m.querySelector('#cd-salvar');
      btn.disabled = true; btn.textContent = 'Salvando...';
      const agora = new Date().toISOString();
      try {
        if (novo) {
          const row = Object.assign(v, {
            colaboradorExternalId: escolhido.external_id || null, colaboradorNome: escolhido.nome_completo || escolhido.nome,
            colaboradorCpf: escolhido.cpf || null, dataAdmissao: escolhido.data_admissao || null,
            criadoPor: quem(), atualizadoPor: quem(), atualizadoEm: agora
          });
          const salvo = await R.insertRow(TABELA, row);
          HUB_RECRUIT_DATA[TABELA] = [salvo].concat(lancamentos());
          estado.ordem = 'recentes'; estado.fila = 'todas'; estado.pagina = 1;
        } else {
          const salvo = await R.updateRow(TABELA, d.id, Object.assign(v, { atualizadoPor: quem(), atualizadoEm: agora }));
          HUB_RECRUIT_DATA[TABELA] = lancamentos().map(x => (x.id === d.id ? salvo : x));
        }
      } catch (err) {
        btn.disabled = false; btn.textContent = novo ? 'Lançar desligamento' : 'Salvar alterações';
        const faltaTabela = /does not exist|schema cache|could not find/i.test(err.message || '');
        return msg(faltaTabela ? 'A tabela do Controle de Desligamento ainda não foi criada no Supabase — rode o script supabase-controle-desligamento.sql.' : 'Não consegui salvar: ' + err.message);
      }
      m.remove();
      if (raizAtual && document.body.contains(raizAtual)) desenhar(raizAtual, filtrosAtuais);
    });
  }

  window.HUB_CONTROLE_DESLIGAMENTO = { render, pode, statusEntrevista };
})();
