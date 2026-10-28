// Administração → Cadastro de Acessos → "Visualizar como": deixa quem
// administra os acessos ver o Hub exatamente como uma conta específica veria —
// menu, permissões e dados — sem precisar da senha da pessoa nem fazer login de novo.
//
// O modo agora roda no SERVIDOR (src/server/hub/admin.ts e executar.ts):
//  1) Entrar chama admin.verComoIniciar (exige admin.usuarios, conta ativa e
//     que não seja a própria; grava o viewas_log) e recarrega /hub. A sessão
//     guarda a conta vista: o servidor manda essa conta em HUB_BOOT.usuario
//     (menu, telas e filtros dela) e roda toda leitura com as permissões, o
//     recorte e a RLS dela — inclusive o galho do organograma. Não há mais
//     recorte nem troca de HUB_USER no navegador.
//  2) Toda escrita é recusada pelo servidor (transação só leitura e 403).
//  3) Aqui sobra: a faixa de aviso com "Sair da visualização", esconder a
//     Administração e sair (POST /hub?acao=encerrar-ver-como, que fecha o
//     registro no viewas_log com a identidade real) recarregando a página.
(function () {
  const U = HUB_UTILS;
  const P = HUB_PERMISSIONS;

  const boot = window.HUB_BOOT || {};
  const info = boot.verComo || null;      // { real: { id, nome } } quando ativo
  const active = !!(info && boot.usuario);
  const simUser = active ? boot.usuario : null;
  let hasPermOriginal = null;

  // Administração (Upload de Planilhas, Cadastros do Recrutamento, Cadastro
  // de Acessos) fica sempre fora do modo de visualização, mesmo simulando
  // outro Administrador — mexer em dados reais ou em outras contas nunca
  // deve acontecer "vestindo a pele" de alguém. hasPerm() é o único lugar
  // por onde passa toda checagem de permissão (menu, telas, canUpload()),
  // então um único remendo aqui já esconde o módulo inteiro em qualquer tela.
  function wrapHasPerm() {
    if (hasPermOriginal) return;
    hasPermOriginal = P.hasPerm;
    P.hasPerm = function (user, key) {
      if (key && key.indexOf('admin.') === 0) return false;
      return hasPermOriginal(user, key);
    };
  }

  function renderBanner() {
    let bar = document.getElementById('view-as-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'view-as-bar';
      document.body.appendChild(bar);
    }
    const perfilLabel = P.PERFIL_LABELS[simUser.perfil] || simUser.perfil;
    bar.innerHTML = `<span>&#128065; Visualizando como <b>${U.escapeHtml(simUser.nome || simUser.email)}</b> — perfil <b>${U.escapeHtml(perfilLabel)}</b>.
      Somente leitura — nada do que aparece aqui grava no banco.
      <span title="Os dados são os que essa conta vê de verdade: o servidor usa as permissões e o recorte dela. Quem está visualizando: ${U.escapeHtml((info.real && info.real.nome) || '')}. O módulo Administração nunca é simulado." style="cursor:help;border-bottom:1px dotted;margin-left:4px">(?)</span></span>
      <button type="button" id="view-as-exit">Sair da visualização</button>`;
    document.getElementById('view-as-exit').addEventListener('click', () => exit());
    document.body.classList.add('view-as-mode');
  }

  function swapTopoUsuario() {
    const nameEl = document.getElementById('user-name');
    const avatarEl = document.getElementById('user-avatar');
    const roleEl = document.getElementById('user-role');
    if (nameEl) nameEl.textContent = simUser.nome || simUser.email;
    if (avatarEl) avatarEl.textContent = (simUser.nome || simUser.email || 'U').charAt(0).toUpperCase();
    if (roleEl) roleEl.textContent = (P.PERFIL_LABELS[simUser.perfil] || simUser.perfil) + ' (visualização)';
  }

  async function enter(profile) {
    if (!profile || !profile.id) return;
    try {
      await HUB_API.chamar('admin.verComoIniciar', { alvoId: profile.id });
    } catch (err) {
      alert('Não foi possível visualizar como esta conta: ' + err.message);
      return;
    }
    window.location.assign('/hub?vercomo=1');
  }

  async function exit() {
    try {
      const resp = await fetch('/hub?acao=encerrar-ver-como', { method: 'POST', credentials: 'same-origin' });
      if (resp.status === 401) { window.location.assign('/login'); return; }
      if (!resp.ok) throw new Error('Erro ' + resp.status);
    } catch (err) {
      alert('Não foi possível sair da visualização: ' + err.message);
      return;
    }
    window.location.assign('/hub?vercomo=0');
  }

  if (active) {
    // Antes do app.js montar o menu (este arquivo carrega antes dele).
    wrapHasPerm();
    // O app.js preenche o topo no DOMContentLoaded; a faixa e o rótulo entram logo depois.
    document.addEventListener('DOMContentLoaded', () => setTimeout(() => { swapTopoUsuario(); renderBanner(); }, 0));
  }

  window.HUB_VIEW_AS = { enter, exit, isActive: () => active };
})();
