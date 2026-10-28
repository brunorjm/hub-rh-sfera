// Administração → Upload de Planilhas: alimenta as tabelas do módulo
// Indicadores (exceto Recrutamento — que vem ao vivo do módulo Recrutamento) e
// a base de vagas do Fechamento (planilha 18). Gate de acesso: permissão admin.upload.
(function () {
  const U = HUB_UTILS;
  const P = HUB_PARSERS;

  const UPLOADS = [
    { key: 'colaboradores', table: 'colaboradores', label: '1. Colaboradores', file: 'Colaboradores.xlsx', icon: '&#128101;', parse: wb => P.parseColaboradores(wb) },
    { key: 'feedbacks', table: 'feedbacks', label: '4. Feedbacks', file: 'Feedbacks.xlsx', icon: '&#128172;', parse: wb => P.parseFeedbacks(wb) },
    { key: 'oneonone', table: 'one_on_one', label: '5. 1 on 1', file: '1 on 1.xlsx', icon: '&#129309;', parse: wb => P.parseOneOnOne(wb) },
    { key: 'celebracoes', table: 'celebracoes', label: '20. Celebrações', file: 'Celebrações.xlsx', icon: '&#127881;', parse: wb => P.parseCelebracoes(wb) },
    { key: 'twygo_part', table: 'twygo_participantes', label: '27. Twygo', file: 'Twygo.xlsx', icon: '&#128218;', parse: wb => P.parseTwygoParticipantes(wb) },
    // Unibê e Academia Hering: foto do dia da exportação, sem data — quem envia
    // escolhe o mês de referência (campo mes) e só aquele mês é substituído.
    { key: 'unibe', table: 'unibe_pdv', label: '27.1. Unibê', file: '27.1.Unibe.xlsx (abas PDV e Pessoa)', icon: '&#127891;', mes: true, custom: importarUnibe },
    { key: 'academia', table: 'academia_hering', label: '27.2. Academia Hering', file: '27.2.Academia Hering.xlsx', icon: '&#127891;', mes: true, custom: importarAcademia },
    { key: 'ave45', table: 'avaliacao_experiencia_45', label: '28. Avaliação da Experiência — 45 dias', file: 'AVE 45 DIAS.xlsx', icon: '&#128221;', parse: wb => P.parseAveExperiencia(wb, 45) },
    { key: 'ave90', table: 'avaliacao_experiencia_90', label: '28.1. Avaliação da Experiência — 90 dias', file: 'AVE 90 DIAS.xlsx', icon: '&#128221;', parse: wb => P.parseAveExperiencia(wb, 90) },
    // Pesquisa de Engajamento (só participação): uma planilha, gravada por inteiro numa
    // transação no banco (ver supabase-engajamento.sql). A base de convidados vem do
    // headcount ativo (tabela colaboradores).
    { key: 'eng', table: 'engajamento_pulso', label: '33. Pesquisa de Engajamento', file: '33. Pesquisa de Engajamento 2026.xlsx (reenvie a cada atualização)', icon: '&#128200;', custom: importarEngajamento },
    // Boletim da Liderança: bases AGREGADAS no navegador (sem nomes) — ver
    // parsers-boletim.js e supabase-boletim.sql. As notas da Pesquisa de
    // Engajamento entram junto com o card 33 acima.
    { key: 'humor', table: 'humor_mensal', label: '36. Termômetro de Humor', file: '36. Humor.xlsx', icon: '&#127777;&#65039;', custom: importarHumor },
    // Pesquisa de Satisfação: a fonte oficial é a 16 (export do Feedz). Alimenta o
    // Boletim e o módulo Pesquisa de Satisfação (respostas por área, sem nomes —
    // ver parsers-satisfacao.js e supabase-satisfacao.sql).
    { key: 'satisfacao', table: 'satisfacao_suporte', label: '16. Pesquisa de Satisfação (Suporte do Escritório)', file: '16. Base Pesquisa Feedz.xlsx', icon: '&#127970;', custom: importarSatisfacao },
    // Fechamento do Período: a planilha do R&S é a fonte oficial das vagas enquanto
    // o módulo Recrutamento não é homologado (ver supabase-fechamento-vagas.sql).
    { key: 'vagas', table: 'controle_vagas', label: '18. Controle Geral de Vagas (Fechamento)', file: '18. Controle Geral de Vagas.xlsx', icon: '&#128188;', custom: importarControleVagas }
  ];

  const dm = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7);
  // O upload dispara "Atualizar dados", que redesenha esta tela e apagaria o
  // resumo/avisos da importação — guarda o último por planilha e reaplica no render.
  const resumos = {};
  function mostrarResumo(key, html) {
    const el = document.getElementById('st-' + key);
    if (!el) return;
    el.className = 'status ok-t';
    el.innerHTML = html;
    const card = document.getElementById('uc-' + key);
    if (card) card.classList.add('ok');
  }

  function hojeLocal() {
    const t = new Date();
    return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  }

  async function importarEngajamento(wb, setStatus) {
    const hoje = hojeLocal();
    const r = HUB_PARSERS_ENGAJAMENTO.parseBase(wb, { colaboradores: HUB_DATA.colaboradores || [], hoje });
    setStatus(`Gravando ${r.pulsos.length} pulsos (${U.fmtInt(r.linhas.length)} linhas)...`);
    await HUB_ENGAJAMENTO.salvarBase(r.pulsos, r.linhas, hoje);
    const p = r.resumo.atual;
    const nome = p.numero ? `${p.numero}º pulso` : 'Pulso atual';
    const avisoNotas = await importarNotasJunto(wb, setStatus);
    return {
      linhas: r.linhas.length, avisos: r.avisos.concat(avisoNotas ? [avisoNotas] : []),
      resumo: `${r.pulsos.length} pulsos importados. ${nome} · ${dm(p.inicio)} a ${dm(p.fim)}${p.parcial ? ' (parcial)' : ''}: ${U.fmtInt(p.respondentes)} de ${U.fmtInt(p.convidados)} responderam (${U.fmtPct(p.respondentes / p.convidados, 1)}). Base por departamento: ${U.fmtInt(r.resumo.hcTotal)} colaboradores ativos em ${r.resumo.hcDeptos} departamentos.`
    };
  }

  // Notas da Pesquisa de Engajamento (Boletim da Liderança): lidas da aba
  // "Respostas" do MESMO arquivo do card 33, depois que a participação já foi
  // gravada. Se o arquivo não trouxer as respostas, ou as tabelas do boletim
  // ainda não existirem, vira só um aviso — a participação continua importada.
  async function importarNotasJunto(wb, setStatus) {
    if (!window.HUB_PARSERS_BOLETIM || !window.HUB_BOLETIM) return null;
    let r;
    try { r = HUB_PARSERS_BOLETIM.parseEngajamentoNotas(wb); }
    catch (err) { return 'Notas da pesquisa (Boletim da Liderança) não encontradas neste arquivo: ' + err.message; }
    try {
      setStatus(`Gravando as notas agregadas (${U.fmtInt(r.linhas.length)} linhas)...`);
      await HUB_BOLETIM.salvarEngNotas(r.inicio, r.fim, r.linhas);
      return null;
    } catch (err) {
      return 'Participação importada, mas as notas não foram gravadas: ' + err.message + (/does not exist|schema cache|not find/i.test(err.message) ? ' (rode supabase-boletim.sql)' : '');
    }
  }

  async function importarHumor(wb, setStatus) {
    const r = HUB_PARSERS_BOLETIM.parseHumor(wb);
    setStatus(`Gravando ${U.fmtInt(r.linhas.length)} linhas agregadas...`);
    await HUB_BOLETIM.salvarHumor(r.linhas, (feito, total) => setStatus(`Gravando... ${U.fmtInt(feito)} de ${U.fmtInt(total)}`));
    return { linhas: r.linhas.length, avisos: r.avisos, resumo: `${U.fmtInt(r.resumo.registros)} registros de humor de ${r.resumo.inicio.slice(5, 7)}/${r.resumo.inicio.slice(0, 4)} a ${r.resumo.fim.slice(5, 7)}/${r.resumo.fim.slice(0, 4)}, agregados em ${U.fmtInt(r.linhas.length)} linhas (mês × loja, sem nomes).` };
  }

  async function importarSatisfacao(wb, setStatus) {
    const r = HUB_PARSERS_BOLETIM.parseSatisfacao(wb);
    setStatus(`Gravando ${U.fmtInt(r.linhas.length)} linhas agregadas...`);
    await HUB_BOLETIM.salvarSatisfacao(r.linhas);
    const modulo = await importarSatisfacaoModulo(wb, setStatus);
    return {
      linhas: r.linhas.length, avisos: r.avisos.concat(modulo.avisos || []),
      resumo: `${U.fmtInt(r.resumo.respondentes)} respostas de ${r.resumo.inicio.slice(5, 7)}/${r.resumo.inicio.slice(0, 4)} a ${r.resumo.fim.slice(5, 7)}/${r.resumo.fim.slice(0, 4)}, agregadas por mês e loja para o Boletim.` + (modulo.resumo ? ' ' + modulo.resumo : '')
    };
  }

  // Módulo Pesquisa de Satisfação: notas, "o que melhorar" e comentários por área
  // (sem nome, CPF, e-mail nem líder direto). Se falhar (ex.: SQL ainda não
  // rodado), o Boletim continua gravado e só aparece um aviso.
  async function importarSatisfacaoModulo(wb, setStatus) {
    if (!window.HUB_PARSERS_SATISFACAO || !window.HUB_SATISFACAO) return {};
    try {
      const r = HUB_PARSERS_SATISFACAO.parse(wb, { colaboradores: HUB_DATA.colaboradores || [] });
      setStatus(`Gravando ${U.fmtInt(r.linhas.length)} avaliações por área (módulo Pesquisa de Satisfação)...`);
      await HUB_SATISFACAO.salvar(r.linhas, r.ciclos, (feito, total) => setStatus(`Gravando avaliações... ${U.fmtInt(feito)} de ${U.fmtInt(total)}`));
      const ult = r.ciclos[r.ciclos.length - 1];
      const extras = r.avisos.filter(a => !/sem título/.test(a));   // o aviso de colunas sem título já vem do Boletim
      return {
        avisos: extras.map(a => /^Conferência/.test(a) ? a : 'Pesquisa de Satisfação: ' + a),
        resumo: `Módulo Pesquisa de Satisfação: ${U.fmtInt(r.linhas.length)} avaliações de ${r.resumo.areas.length} áreas em ${r.ciclos.length} ciclos; último ciclo ${ult.pesquisa.slice(5, 7)}/${ult.pesquisa.slice(0, 4)} com ${U.fmtInt(ult.respondentes)} gestores${ult.aptos ? ` de ${U.fmtInt(ult.aptos)} aptos` : ''}.`
      };
    } catch (err) {
      return { avisos: ['O Boletim foi atualizado, mas o módulo Pesquisa de Satisfação não: ' + err.message] };
    }
  }

  // 18. Controle Geral de Vagas: substitui a base inteira e já mostra os números
  // do último mês completo, para conferir com o que o R&S tem na planilha.
  async function importarControleVagas(wb, setStatus) {
    const r = HUB_PARSERS_FECHAMENTO.parse(wb);
    const M = HUB_METRICS_FECHAMENTO;
    setStatus(`Gravando ${U.fmtInt(r.linhas.length)} vagas...`);
    await HUB_FECHAMENTO.salvarVagas(r.linhas, (feito, total) => setStatus(`Gravando vagas... ${U.fmtInt(feito)} de ${U.fmtInt(total)}`));
    const hoje = hojeLocal();
    const ref = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 2, 1));
    const de = ref.toISOString().slice(0, 10);
    const ate = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const p = M.periodo(r.linhas, de, ate);
    const at = M.ativas(r.linhas);
    const pct = x => (x == null ? '—' : Math.round(x * 100) + '%');
    const dia = x => (x == null ? '—' : Math.round(x) + ' dias');
    return {
      linhas: r.linhas.length, avisos: r.avisos,
      resumo: `${U.fmtInt(r.linhas.length)} vagas importadas (aba ${r.aba}). ${de.slice(5, 7)}/${de.slice(0, 4)}: ${p.abertas} abertas, ${p.fechadas} fechadas pela DATA DE FECHAMENTO (${p.aguardandoAdmissao} aguardando admissão), ${pct(p.noPrazo)} dentro do SLA (${p.dentro} sem "Expirou SLA"); SLA médio de ${dia(p.diasMedio)}, Operacional ${dia(p.operacional.diasMedio)} e Estratégica ${dia(p.estrategica.diasMedio)}. Hoje: ${at.aberta.total} em aberto, ${at.andamento.total} em andamento, ${at.congelada.total} congeladas.`
    };
  }

  // Unibê / Academia Hering: o boletim de um mês já fechado não muda sozinho
  // (as setas usam a foto publicada), mas a tela do mês passa a mostrar o valor novo.
  function avisoMesFechado(mes) {
    const f = ((window.HUB_BOLETIM_DATA || {}).fechamentos || []).some(x => String(x.mes).slice(0, 7) === mes);
    return f ? `O Boletim da Liderança de ${mesRotulo(mes)} já foi fechado: o boletim publicado não muda; reabra e feche de novo o mês se quiser atualizar a foto.` : null;
  }
  const mesRotulo = mes => `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;

  async function importarUnibe(wb, setStatus, mes) {
    const r = HUB_PARSERS_TREINAMENTOS.parseUnibe(wb, { colaboradores: HUB_DATA.colaboradores || [] });
    setStatus(`Gravando ${r.pdvs.length} PDVs e ${U.fmtInt(r.pessoas.length)} pessoas em ${mesRotulo(mes)}...`);
    await HUB_DAL.salvarUnibe(mes, r.pdvs, r.pessoas);
    const fechado = avisoMesFechado(mes);
    return {
      linhas: r.pdvs.length + r.pessoas.length, avisos: r.avisos.concat(fechado ? [fechado] : []),
      resumo: `Unibê de ${mesRotulo(mes)}: ${r.resumo.pdvs} PDVs, adesão média de ${U.fmtPct(r.resumo.adesaoMedia, 1)} (média dos PDVs); ${U.fmtInt(r.resumo.pessoas)} pessoas, ${U.fmtInt(r.resumo.noCadastro)} achadas no cadastro de Colaboradores.`
    };
  }

  async function importarAcademia(wb, setStatus, mes) {
    const r = HUB_PARSERS_TREINAMENTOS.parseAcademia(wb, { colaboradores: HUB_DATA.colaboradores || [] });
    setStatus(`Gravando ${U.fmtInt(r.linhas.length)} pessoas em ${mesRotulo(mes)}...`);
    await HUB_DAL.salvarAcademia(mes, r.linhas);
    const fechado = avisoMesFechado(mes);
    return {
      linhas: r.linhas.length, avisos: r.avisos.concat(fechado ? [fechado] : []),
      resumo: `Academia Hering de ${mesRotulo(mes)}: ${U.fmtInt(r.resumo.pessoas)} pessoas em ${r.resumo.lojas} lojas, ${U.fmtInt(Math.round(r.resumo.horas))} horas de treinamento, performance média de ${U.fmtInt(Math.round(r.resumo.performanceMedia))} pontos; ${U.fmtInt(r.resumo.noCadastro)} achadas no cadastro de Colaboradores.`
    };
  }

  // Mês sugerido no card: o anterior (a foto costuma ser tirada no começo do mês
  // seguinte, para o fechamento).
  function mesSugerido() {
    const t = new Date();
    const d = new Date(t.getFullYear(), t.getMonth() - 1, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtDT = iso => {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };
  // Cor do "atualizado em": verde ≤7 dias, amarelo ≤30, vermelho acima disso.
  function ageColor(iso) {
    const days = (Date.now() - new Date(iso).getTime()) / 86400000;
    return days <= 7 ? '#0f8a4c' : days <= 30 ? '#b7791f' : 'var(--critical)';
  }

  function renderLastUpdate(key, entry) {
    const el = document.getElementById('lu-' + key);
    if (!el) return;
    if (!entry) { el.style.color = 'var(--muted)'; el.textContent = 'Nunca atualizado'; return; }
    el.style.color = ageColor(entry.created_at);
    el.textContent = `Atualizado em ${fmtDT(entry.created_at)}` + (entry.usuario_nome ? ' · ' + entry.usuario_nome : '') + (entry.linhas != null ? ' · ' + U.fmtInt(entry.linhas) + ' linhas' : '');
  }

  async function loadLastUpdates() {
    try {
      const log = await HUB_DAL.listUploadLog(500);
      UPLOADS.forEach(u => renderLastUpdate(u.key, log.find(l => l.tabela === u.table && l.status === 'ok')));
    } catch (err) {
      UPLOADS.forEach(u => {
        const el = document.getElementById('lu-' + u.key);
        if (el) { el.style.color = 'var(--muted)'; el.textContent = 'Histórico indisponível'; el.title = err.message; }
      });
    }
  }

  async function openHistory() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px';
    overlay.innerHTML = `<div style="background:var(--card);border-radius:var(--radius);max-width:820px;width:100%;max-height:85vh;display:flex;flex-direction:column">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--border)">
        <h3 style="font-size:15px">Histórico de uploads</h3>
        <div style="display:flex;gap:8px;align-items:center">
          <select id="uh-filter" style="font-size:12px"><option value="">Todas as planilhas</option>${UPLOADS.map(u => `<option value="${u.table}">${u.label}</option>`).join('')}</select>
          <button type="button" id="uh-close" aria-label="Fechar">&times;</button>
        </div>
      </div>
      <div id="uh-body" style="overflow:auto;padding:14px 18px;font-size:12px">Carregando...</div>
    </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('#uh-close').addEventListener('click', close);
    const body = overlay.querySelector('#uh-body');
    let log = [];
    const draw = () => {
      const f = overlay.querySelector('#uh-filter').value;
      const rows = log.filter(l => !f || l.tabela === f);
      if (!rows.length) { body.textContent = 'Nenhum upload registrado.'; return; }
      body.innerHTML = `<table style="width:100%;border-collapse:collapse"><thead><tr style="text-align:left;color:var(--muted)"><th>Data e hora</th><th>Planilha</th><th>Usuário</th><th>Arquivo</th><th>Linhas</th><th>Status</th></tr></thead><tbody>${rows.map(l => {
        const cfg = UPLOADS.find(u => u.table === l.tabela);
        const ok = l.status === 'ok';
        return `<tr style="border-top:1px solid var(--border)"><td>${fmtDT(l.created_at)}</td><td>${esc(cfg ? cfg.label : l.tabela)}</td><td>${esc(l.usuario_nome || '—')}</td><td>${esc(l.arquivo || '—')}</td><td>${l.linhas != null ? U.fmtInt(l.linhas) : '—'}</td><td style="color:${ok ? '#0f8a4c' : 'var(--critical)'}" title="${esc(l.erro || '')}">${ok ? 'Sucesso' : 'Erro'}</td></tr>`;
      }).join('')}</tbody></table>`;
    };
    overlay.querySelector('#uh-filter').addEventListener('change', draw);
    try { log = await HUB_DAL.listUploadLog(300); draw(); }
    catch (err) { body.textContent = 'Não foi possível carregar o histórico: ' + err.message; }
  }

  function render(el) {
    if (!HUB_PERMISSIONS.hasPerm(HUB_USER, 'admin.upload')) {
      el.innerHTML = '<div class="empty"><p>Acesso restrito.</p></div>';
      return;
    }
    el.innerHTML = `<div style="display:flex;justify-content:flex-end;margin-bottom:10px"><button type="button" id="btn-upload-history">Ver histórico de uploads</button></div>
      <div class="upload-grid">${UPLOADS.map(u => `
      <div class="upload-card" id="uc-${u.key}">
        <span class="ic">${HUB_ICON(u.icon)}</span>
        <h4>${u.label}</h4>
        <p>Arquivo: ${u.file}</p>
        <p id="lu-${u.key}" style="margin-top:4px;font-weight:600;color:var(--muted)">Carregando...</p>
        ${u.mes ? `<label style="display:flex;align-items:center;gap:6px;font-size:12px;margin:6px 0 2px">Mês de referência <input type="month" id="mes-${u.key}" value="${mesSugerido()}" style="font-size:12px"></label>` : ''}
        <input type="file" accept=".xlsx,.xls,.csv" data-key="${u.key}">
        <div class="progress" id="pg-${u.key}" style="display:none"><div></div></div>
        <div class="status" id="st-${u.key}"></div>
      </div>`).join('')}</div>
      <p class="sub" style="color:var(--muted);font-size:11.5px">Cada upload substitui completamente os dados daquela planilha — pode reenviar quantas vezes precisar, sempre com o mesmo modelo de colunas. Na Pesquisa de Engajamento (33), as notas também são guardadas (só médias por loja e pilar, sem respostas individuais) para o Boletim da Liderança. Humor (36) e Pesquisa de Satisfação (16) substituem os meses presentes no arquivo e são guardados já agregados, sem nomes. A 16 também guarda as notas, o "O que melhorar?" e os comentários de cada área (sem nome, CPF, e-mail nem líder direto) para o módulo Pesquisa de Satisfação, que só mostra cada área a quem a tem liberada no cadastro. A 18 (Controle Geral de Vagas) substitui a base inteira de vagas do Fechamento do Período, sem nomes de candidatos, contratados ou substituídos e sem as observações; os indicadores do módulo Recrutamento continuam vindo das telas do próprio módulo. Unibê (27.1) e Academia Hering (27.2) são uma foto do dia da exportação: escolha o mês de referência no card antes de enviar; só aquele mês é substituído, e os meses anteriores ficam guardados para a evolução. Elas alimentam o módulo Treinamentos, o Boletim da Liderança e o Fechamento do Período.</p>`;
    el.querySelectorAll('input[type=file]').forEach(inp => inp.addEventListener('change', e => handleUpload(e.target.dataset.key, e.target.files[0])));
    el.querySelector('#btn-upload-history').addEventListener('click', openHistory);
    Object.keys(resumos).forEach(k => mostrarResumo(k, resumos[k]));
    loadLastUpdates();
  }

  async function handleUpload(key, file) {
    if (!file) return;
    const cfg = UPLOADS.find(u => u.key === key);
    const card = document.getElementById('uc-' + key);
    const statusEl = document.getElementById('st-' + key);
    const pg = document.getElementById('pg-' + key);
    const bar = pg.querySelector('div');
    card.classList.add('busy');
    card.classList.remove('ok');
    statusEl.className = 'status';
    statusEl.textContent = 'Lendo arquivo...';
    pg.style.display = 'block';
    bar.style.width = '5%';
    try {
      const mesInp = cfg.mes ? document.getElementById('mes-' + key) : null;
      const mes = mesInp ? mesInp.value : null;
      if (cfg.mes && !/^\d{4}-\d{2}$/.test(mes || '')) throw new Error('Escolha o mês de referência antes de enviar o arquivo.');
      const wb = await P.readWorkbook(file);
      let totalLinhas;
      if (cfg.custom) {
        bar.style.width = '40%';
        const r = await cfg.custom(wb, msg => { statusEl.textContent = msg; }, mes, file.name);
        totalLinhas = r.linhas;
        resumos[key] = esc(r.resumo) + (r.avisos || []).map(a => `<br><span style="color:var(--warning)">&#9888; ${esc(a)}</span>`).join('');
        statusEl.innerHTML = resumos[key];
      } else {
        const rows = cfg.parse(wb);
        totalLinhas = rows.length;
        statusEl.textContent = `Gravando (${rows.length} linhas)...`;
        await HUB_DAL.replaceTable(cfg.table, rows, (done, total) => { bar.style.width = (5 + (done / Math.max(total, 1)) * 90) + '%'; });
        statusEl.textContent = `${rows.length} linhas importadas.`;
      }
      bar.style.width = '100%';
      statusEl.classList.add('ok-t');
      card.classList.add('ok');
      // Avaliação da Experiência não entra em HUB_DATA (carregada sob
      // demanda): descarta o cache do ciclo para a próxima abertura buscar
      // as linhas novas (que só ganham "id" no banco).
      const cicloAve = window.HUB_EXPERIENCIA && HUB_EXPERIENCIA.cicloDaTabela(cfg.table);
      if (cicloAve) HUB_EXPERIENCIA.invalidar(cicloAve);
      if (window.HUB_BOLETIM) HUB_BOLETIM.invalidar();
      await HUB_DAL.logUpload({ tabela: cfg.table, arquivo: file.name, linhas: totalLinhas, status: 'ok' });
      await HUB_RELOAD_DATA(false);
      loadLastUpdates();
    } catch (err) {
      statusEl.classList.add('err-t');
      statusEl.textContent = err.message || 'Erro ao importar.';
      await HUB_DAL.logUpload({ tabela: cfg.table, arquivo: file.name, status: 'erro', erro: err.message }).catch(() => {});
    } finally {
      card.classList.remove('busy');
      setTimeout(() => { pg.style.display = 'none'; bar.style.width = '0%'; }, 1500);
    }
  }

  window.HUB_ADMIN_UPLOAD = { render };
})();
