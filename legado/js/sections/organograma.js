// Indicadores → Organograma: a página organograma.html (layout e interação
// próprios, isolados num iframe para o CSS dela não se misturar com o do Hub)
// lê window.HUB_ORG desta janela — mesma origem, mesma sessão. Não usa a barra
// de filtros do topo.
//
// Quem tem indicadores.organograma_completo vê a estrutura inteira, a partir de
// HUB_DATA.colaboradores (RLS de sempre). Os demais veem só o próprio galho —
// liderança acima e equipe abaixo — devolvido pela função
// organograma_meu_galho() do Supabase (supabase-organograma.sql); os outros
// galhos nem chegam ao navegador.
(function () {
  const P = HUB_PERMISSIONS;
  let frame = null;
  let loadedOrg = null;   // HUB_ORG que o iframe usou na última carga
  let galhoOrg = null, galhoRes = null;

  function mostrar(el, org) {
    window.HUB_ORG = org;
    if (!frame || !el.contains(frame)) {
      el.innerHTML = '';
      frame = document.createElement('iframe');
      frame.title = 'Organograma Sfera';
      frame.style.cssText = 'width:100%;height:calc(100vh - 150px);min-height:640px;border:0;border-radius:12px;background:#F2F4F3;display:block';
      frame.src = 'organograma.html?v=202609290900';
      el.appendChild(frame);
      loadedOrg = org;
      return;
    }
    // Só recarrega quando os dados mudaram (botão Atualizar ou novo upload) —
    // trocar filtro ou voltar para a tela mantém zoom e equipes abertas.
    if (loadedOrg !== org) {
      loadedOrg = org;
      frame.contentWindow.location.reload();
    }
  }

  let ultimoCompleto = null;
  async function renderOrganograma(el) {
    const dados = (window.HUB_DATA && HUB_DATA.colaboradores) || [];
    if (P.hasPerm(HUB_USER, 'indicadores.organograma_completo')) {
      if (!ultimoCompleto || ultimoCompleto.rows !== dados) ultimoCompleto = { modo: 'completo', rows: dados };
      return mostrar(el, ultimoCompleto);
    }
    // HUB_GALHO busca de novo quando os dados do Hub são recarregados (botão
    // Atualizar, novo upload), igual ao modo completo.
    if (!HUB_GALHO.cached() && (!frame || !el.contains(frame))) {
      el.innerHTML = '<p class="sub" style="color:var(--muted);padding:24px">Carregando o seu galho do organograma...</p>';
    }
    const res = await HUB_GALHO.get();
    if (res !== HUB_GALHO.cached()) return; // os dados mudaram enquanto esta busca esperava
    if (galhoRes !== res) { galhoRes = res; galhoOrg = { modo: 'galho', rows: res.rows, erro: res.erro }; }
    mostrar(el, galhoOrg);
  }

  window.HUB_SECTIONS = window.HUB_SECTIONS || {};
  window.HUB_SECTIONS.renderOrganograma = renderOrganograma;
})();
