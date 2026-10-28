// Administração → Log de Acessos: quem entrou no Hub, quando e quais módulos
// abriu (tabela acesso_log — ver supabase-log-acessos.sql). Gate de acesso:
// permissão admin.log_acessos (só Administrador).
//
// O registro em si (HUB_LOG_ACESSO.registrar) é chamado por app.js no login,
// no retorno com sessão aberta, na saída e a cada módulo aberto. Nunca
// atrapalha o uso do Hub: qualquer erro ao gravar é ignorado.
(function () {
  const U = HUB_UTILS;
  const { kpi, empty, card, barChart } = HUB_UI;

  // ---------------------------------------------------------------- registro
  // O mesmo módulo só é registrado de novo depois de 30 min (por aba), pra
  // não encher o banco com cada clique de ida e volta.
  const REPETE_MODULO_MS = 30 * 60 * 1000;
  const ultimoModulo = {};

  function dispositivo() {
    return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '') ? 'celular' : 'computador';
  }

  function registrar(evento, modulo) {
    try {
      if (!window.sb || !window.HUB_USER || !HUB_USER.id) return Promise.resolve();
      // "Visualizar como" não registra nada — a sessão é do administrador e
      // ele já fica no histórico próprio do Visualizar como.
      if (window.HUB_VIEW_AS && HUB_VIEW_AS.isActive()) return Promise.resolve();
      if (evento === 'modulo') {
        const agora = Date.now();
        if (ultimoModulo[modulo] && agora - ultimoModulo[modulo] < REPETE_MODULO_MS) return Promise.resolve();
        ultimoModulo[modulo] = agora;
      }
      // No máximo 3 s de espera (o "Sair" aguarda o registro da saída).
      const envio = Promise.resolve(sb.rpc('registrar_acesso', { p_evento: evento, p_modulo: modulo || null, p_dispositivo: dispositivo() }));
      return Promise.race([envio, new Promise(r => setTimeout(r, 3000))]).then(() => {}, () => {});
    } catch (err) {
      return Promise.resolve();
    }
  }

  // ---------------------------------------------------------------- tela
  const EVENTOS = { login: 'Entrou (login)', sessao: 'Voltou (sessão aberta)', logout: 'Saiu', modulo: 'Abriu módulo' };
  const PAGE = 1000;
  const LIMITE = 20000;
  const estado = { de: null, ate: null, usuario: '', evento: '', linhas: null, perfis: null, erro: null, carregando: false };

  const isoLocal = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const fmtDataHora = iso => {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };
  const nomeModulo = m => (window.HUB_NAV_TITLES && HUB_NAV_TITLES[m]) || m || '';
  const perfilLabel = p => (HUB_PERMISSIONS.PERFIL_LABELS[p] || p || '');

  async function buscar() {
    // Período em horário local: do início do dia "de" até o fim do dia "até".
    const ini = new Date(estado.de + 'T00:00:00');
    const fim = new Date(estado.ate + 'T00:00:00');
    fim.setDate(fim.getDate() + 1);
    let todas = [];
    for (let from = 0; from < LIMITE; from += PAGE) {
      const { data, error } = await sb.from('acesso_log').select('*')
        .gte('criado_em', ini.toISOString()).lt('criado_em', fim.toISOString())
        .order('criado_em', { ascending: false }).range(from, from + PAGE - 1);
      if (error) throw error;
      todas = todas.concat(data || []);
      if (!data || data.length < PAGE) break;
    }
    return todas;
  }

  async function carregar() {
    estado.carregando = true;
    estado.erro = null;
    try {
      estado.linhas = await buscar();
      if (!estado.perfis && HUB_PERMISSIONS.hasPerm(HUB_USER, 'admin.usuarios')) {
        try { estado.perfis = await HUB_DAL.listProfiles(); } catch (e) { estado.perfis = []; }
      }
    } catch (err) {
      estado.erro = err.message;
    } finally {
      estado.carregando = false;
      if (document.getElementById('sec-adm-log-acessos') && document.getElementById('sec-adm-log-acessos').classList.contains('active')) HUB_RENDER_CURRENT();
    }
  }

  function resumoPorUsuario(linhas) {
    const map = new Map();
    for (const r of linhas) {
      let u = map.get(r.usuario_id);
      if (!u) { u = { id: r.usuario_id, nome: r.usuario_nome || r.usuario_email || '—', perfil: r.perfil, ultimo: r.criado_em, entradas: 0, modulos: 0, porModulo: {}, celular: 0 }; map.set(r.usuario_id, u); }
      if (r.criado_em > u.ultimo) u.ultimo = r.criado_em;
      if (r.evento === 'login' || r.evento === 'sessao') { u.entradas++; if (r.dispositivo === 'celular') u.celular++; }
      if (r.evento === 'modulo') { u.modulos++; u.porModulo[r.modulo] = (u.porModulo[r.modulo] || 0) + 1; }
    }
    return Array.from(map.values()).map(u => {
      const top = Object.entries(u.porModulo).sort((a, b) => b[1] - a[1])[0];
      return Object.assign(u, { maisUsado: top ? nomeModulo(top[0]) : '—' });
    }).sort((a, b) => (a.ultimo < b.ultimo ? 1 : -1));
  }

  function porModulo(linhas) {
    const map = new Map();
    for (const r of linhas) {
      if (r.evento !== 'modulo') continue;
      const m = map.get(r.modulo) || { modulo: r.modulo, aberturas: 0, pessoas: new Set() };
      m.aberturas++; m.pessoas.add(r.usuario_id);
      map.set(r.modulo, m);
    }
    return Array.from(map.values()).sort((a, b) => b.aberturas - a.aberturas);
  }

  function exportarCsv(linhas) {
    const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const cab = ['Data/hora', 'Usuário', 'E-mail', 'Perfil', 'Evento', 'Módulo', 'Dispositivo'];
    const corpo = linhas.map(r => [fmtDataHora(r.criado_em), r.usuario_nome, r.usuario_email, perfilLabel(r.perfil), EVENTOS[r.evento] || r.evento, nomeModulo(r.modulo), r.dispositivo].map(esc).join(';'));
    const blob = new Blob(['﻿' + [cab.map(esc).join(';')].concat(corpo).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `log-acessos_${estado.de}_a_${estado.ate}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function render(el) {
    if (!HUB_PERMISSIONS.hasPerm(HUB_USER, 'admin.log_acessos')) {
      el.innerHTML = empty('Acesso restrito.', 'O Log de Acessos é só do Administrador.');
      return;
    }
    if (!estado.de) {
      const hoje = new Date();
      const ini = new Date(); ini.setDate(ini.getDate() - 29);
      estado.de = isoLocal(ini); estado.ate = isoLocal(hoje);
    }
    if (estado.linhas === null && !estado.erro) {
      el.innerHTML = '<p class="sub" style="color:var(--muted);padding:24px">Carregando o log de acessos...</p>';
      if (!estado.carregando) carregar();
      return;
    }

    const todas = estado.linhas || [];
    const usuarios = Array.from(new Map(todas.map(r => [r.usuario_id, r.usuario_nome || r.usuario_email])).entries()).sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'pt-BR'));
    const linhas = todas.filter(r => (!estado.usuario || r.usuario_id === estado.usuario) && (!estado.evento || r.evento === estado.evento));
    const pu = resumoPorUsuario(linhas);
    const pm = porModulo(linhas);
    const entradas = linhas.filter(r => r.evento === 'login' || r.evento === 'sessao').length;
    const aberturas = linhas.filter(r => r.evento === 'modulo').length;

    // Cadastros ativos que não entraram no período (precisa de admin.usuarios).
    const comAcesso = new Set(todas.map(r => r.usuario_id));
    const semAcesso = (estado.perfis || []).filter(p => (p.status || 'ativo') === 'ativo' && !comAcesso.has(p.id))
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

    const filtros = `<div class="fbar">
        <div class="fg"><label>De</label><input type="date" id="la-de" value="${estado.de}"></div>
        <div class="fg"><label>Até</label><input type="date" id="la-ate" value="${estado.ate}"></div>
        <div class="fg"><label>Usuário</label><select id="la-usuario"><option value="">Todos</option>${usuarios.map(([id, n]) => `<option value="${U.escapeHtml(id)}"${id === estado.usuario ? ' selected' : ''}>${U.escapeHtml(n || '—')}</option>`).join('')}</select></div>
        <div class="fg"><label>Evento</label><select id="la-evento"><option value="">Todos</option>${Object.entries(EVENTOS).map(([k, v]) => `<option value="${k}"${k === estado.evento ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
        <button type="button" class="btn btn-outline btn-sm" id="la-atualizar">Atualizar</button>
        <button type="button" class="btn btn-outline btn-sm" id="la-csv"${linhas.length ? '' : ' disabled'}>Exportar CSV</button>
      </div>`;

    if (estado.erro) {
      el.innerHTML = filtros + empty('Não foi possível carregar o log.', U.escapeHtml(estado.erro) + (/acesso_log|relation|schema cache/i.test(estado.erro) ? ' — rode supabase-log-acessos.sql no Supabase.' : ''));
      wire(el, linhas);
      return;
    }

    const kpis = [
      kpi('Pessoas que acessaram', U.fmtInt(pu.length), 'no período', 'var(--p1)'),
      kpi('Entradas no Hub', U.fmtInt(entradas), 'login ou retorno com sessão aberta', '#1baf7a'),
      kpi('Módulos abertos', U.fmtInt(aberturas), 'o mesmo módulo conta 1x a cada 30 min', '#4a3aa7'),
      estado.perfis ? kpi('Cadastros sem acesso', U.fmtInt(semAcesso.length), 'ativos que não entraram no período', 'var(--critical)') : ''
    ].filter(Boolean);

    const tabUsuarios = pu.length ? `<div class="table-wrap"><table class="dt"><thead><tr><th>Usuário</th><th>Perfil</th><th>Último acesso</th><th>Entradas</th><th>Módulos abertos</th><th>Mais usado</th><th>Pelo celular</th></tr></thead><tbody>${pu.map(u => `<tr data-usuario="${U.escapeHtml(u.id)}" style="cursor:pointer" title="Filtrar por este usuário"><td>${U.escapeHtml(u.nome)}</td><td>${U.escapeHtml(perfilLabel(u.perfil))}</td><td>${fmtDataHora(u.ultimo)}</td><td>${U.fmtInt(u.entradas)}</td><td>${U.fmtInt(u.modulos)}</td><td>${U.escapeHtml(u.maisUsado)}</td><td>${u.entradas ? U.fmtInt(u.celular) : '—'}</td></tr>`).join('')}</tbody></table></div>` : empty('Nenhum acesso registrado no período.');

    const graficoModulos = pm.length
      ? `<div class="chart-h" style="height:${Math.max(220, Math.min(pm.length, 15) * 28 + 60)}px"><canvas id="c-log-modulos"></canvas></div>
         <div class="table-wrap" style="margin-top:10px"><table class="dt"><thead><tr><th>Módulo</th><th>Aberturas</th><th>Pessoas</th></tr></thead><tbody>${pm.map(m => `<tr><td>${U.escapeHtml(nomeModulo(m.modulo))}</td><td>${U.fmtInt(m.aberturas)}</td><td>${U.fmtInt(m.pessoas.size)}</td></tr>`).join('')}</tbody></table></div>`
      : empty('Nenhum módulo aberto no período.');

    const tabSemAcesso = semAcesso.length
      ? `<div class="table-wrap" style="max-height:420px"><table class="dt"><thead><tr><th>Usuário</th><th>Perfil</th><th>E-mail</th></tr></thead><tbody>${semAcesso.map(p => `<tr><td>${U.escapeHtml(p.nome || '')}</td><td>${U.escapeHtml(perfilLabel(p.perfil))}</td><td>${U.escapeHtml(p.email || '')}</td></tr>`).join('')}</tbody></table></div>`
      : empty('Todos os cadastros ativos entraram no período.');

    const MAX_EVENTOS = 500;
    const tabEventos = linhas.length
      ? `<div class="table-wrap" style="max-height:520px"><table class="dt"><thead><tr><th>Data/hora</th><th>Usuário</th><th>Perfil</th><th>Evento</th><th>Módulo</th><th>Dispositivo</th></tr></thead><tbody>${linhas.slice(0, MAX_EVENTOS).map(r => `<tr><td>${fmtDataHora(r.criado_em)}</td><td>${U.escapeHtml(r.usuario_nome || r.usuario_email || '')}</td><td>${U.escapeHtml(perfilLabel(r.perfil))}</td><td>${U.escapeHtml(EVENTOS[r.evento] || r.evento)}</td><td>${U.escapeHtml(nomeModulo(r.modulo))}</td><td>${U.escapeHtml(r.dispositivo || '')}</td></tr>`).join('')}</tbody></table></div>${linhas.length > MAX_EVENTOS ? `<p class="sub" style="margin-top:8px">Exibindo os ${MAX_EVENTOS} mais recentes de ${U.fmtInt(linhas.length)}. Use "Exportar CSV" para ver todos.</p>` : ''}`
      : empty('Nenhum evento no período.');

    el.innerHTML = `${filtros}
      <div class="kpi-grid">${kpis.join('')}</div>
      ${card('Acessos por usuário', '&#128100;', tabUsuarios + '<p class="dash-dica">Clique numa linha para ver só os eventos daquela pessoa.</p>', { full: true })}
      <div class="grid2">
        ${card('Módulos mais usados', '&#128202;', graficoModulos)}
        ${estado.perfis ? card('Cadastros ativos sem acesso no período', '&#128683;', tabSemAcesso) : ''}
      </div>
      ${card('Eventos', '&#128203;', tabEventos, { full: true })}
      <p class="sub" style="color:var(--muted);font-size:11.5px">O log registra a entrada no Hub, a saída e cada módulo aberto (não o que foi visto dentro dele). O "Visualizar como" não entra aqui — ele tem histórico próprio no Cadastro de Acessos. Registros com mais de 180 dias são apagados automaticamente.</p>`;

    if (pm.length) {
      const top = pm.slice(0, 15);
      barChart('c-log-modulos', top.map(m => nomeModulo(m.modulo)), top.map(m => m.aberturas), { horizontal: true });
    }
    wire(el, linhas);
  }

  function wire(el, linhas) {
    const recarregar = () => { estado.linhas = null; estado.erro = null; HUB_RENDER_CURRENT(); };
    el.querySelector('#la-de').addEventListener('change', e => { if (e.target.value) { estado.de = e.target.value; recarregar(); } });
    el.querySelector('#la-ate').addEventListener('change', e => { if (e.target.value) { estado.ate = e.target.value; recarregar(); } });
    el.querySelector('#la-usuario').addEventListener('change', e => { estado.usuario = e.target.value; HUB_RENDER_CURRENT(); });
    el.querySelector('#la-evento').addEventListener('change', e => { estado.evento = e.target.value; HUB_RENDER_CURRENT(); });
    el.querySelector('#la-atualizar').addEventListener('click', recarregar);
    el.querySelector('#la-csv').addEventListener('click', () => exportarCsv(linhas));
    el.querySelectorAll('tr[data-usuario]').forEach(tr => tr.addEventListener('click', () => {
      estado.usuario = estado.usuario === tr.dataset.usuario ? '' : tr.dataset.usuario;
      HUB_RENDER_CURRENT();
    }));
  }

  window.HUB_LOG_ACESSO = { registrar };
  window.HUB_ADMIN_LOG_ACESSOS = { render };
})();
