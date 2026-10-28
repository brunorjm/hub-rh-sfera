// Motor de renderização do formulário de Parecer do Gestor — extraído de
// js/sections/parecer-gestor.js para ser reaproveitado também pela página
// pública sem login (parecer-publico.html/js/parecer-publico.js), que usa o
// mesmo motor pra desenhar o mesmo formulário a partir de um link por
// e-mail. Só depende de HUB_UTILS/HUB_PARECER_COMUM — nada de auth
// (HUB_USER/HUB_RECRUIT), pra poder rodar nas duas telas sem adaptação.
(function () {
  const U = HUB_UTILS;
  const C = HUB_PARECER_COMUM;

  function renderMatrizPositivoAtencao(bloco, valores, dis) {
    return `<div class="field full"><label>${U.escapeHtml(bloco.titulo)} <span class="req">*</span></label>
      <table class="tbl" style="margin-top:6px"><thead><tr><th style="width:60%">&nbsp;</th><th>Positivo</th><th>Atenção</th></tr></thead><tbody>
        ${bloco.itens.map(item => {
          const v = (valores && valores[item.key]) || '';
          return `<tr><td style="font-size:12.5px">${U.escapeHtml(item.label)}</td>
            ${['Positivo', 'Atenção'].map(opt => `<td style="text-align:center"><input type="radio" name="av_${bloco.key}_${item.key}" value="${opt}" data-avaliacao="${bloco.key}" data-item="${item.key}" ${v === opt ? 'checked' : ''} ${dis}></td>`).join('')}
          </tr>`;
        }).join('')}
      </tbody></table>
    </div>`;
  }
  function renderMatrizSimNao(bloco, valores, dis) {
    return `<div class="field full"><label>${U.escapeHtml(bloco.titulo)} <span class="req">*</span></label>
      <table class="tbl" style="margin-top:6px"><thead><tr><th style="width:60%">&nbsp;</th><th>Sim</th><th>Não</th></tr></thead><tbody>
        ${bloco.itens.map(item => {
          const v = (valores && valores[item.key]) || '';
          return `<tr><td style="font-size:12.5px">${U.escapeHtml(item.label)}${item.hint ? `<div class="hint" style="font-style:italic;margin-top:2px">${U.escapeHtml(item.hint)}</div>` : ''}</td>
            ${['Sim', 'Não'].map(opt => `<td style="text-align:center"><input type="radio" name="tp_${bloco.key}_${item.key}" value="${opt}" data-topico="${bloco.key}" data-item="${item.key}" ${v === opt ? 'checked' : ''} ${dis}></td>`).join('')}
          </tr>`;
        }).join('')}
      </tbody></table>
    </div>`;
  }

  function renderLocalizacao(modelo, d, dis) {
    const loc = modelo.localizacao;
    if (loc.tipo === 'loja_simples') {
      return `<div class="field"><label>${U.escapeHtml(loc.labelLocal)} <span class="req">*</span></label>
        <select id="pg-local" ${dis}><option value="">Selecione...</option>${loc.lojas.map(l => `<option value="${U.escapeHtml(l)}" ${d.local === l ? 'selected' : ''}>${U.escapeHtml(l)}</option>`).join('')}</select></div>`;
    }
    const regionais = Object.keys(loc.regionais);
    const listaLocal = d.regional && loc.regionais[d.regional] ? loc.regionais[d.regional] : [];
    return `<div class="field"><label>${U.escapeHtml(loc.labelRegional)} <span class="req">*</span></label>
        <select id="pg-regional" ${dis}><option value="">Selecione...</option>${regionais.map(r => `<option value="${U.escapeHtml(r)}" ${d.regional === r ? 'selected' : ''}>${U.escapeHtml(r)}</option>`).join('')}</select></div>
      <div class="field"><label>${U.escapeHtml(loc.labelLocal)} <span class="req">*</span></label>
        <select id="pg-local" ${dis} ${!d.regional ? 'disabled' : ''}><option value="">${d.regional ? 'Selecione...' : 'Escolha a regional primeiro'}</option>${listaLocal.map(l => `<option value="${U.escapeHtml(l)}" ${d.local === l ? 'selected' : ''}>${U.escapeHtml(l)}</option>`).join('')}</select></div>`;
  }

  // opts.editarGestorNome: a tela autenticada preenche "Nome do(a) Gestor(a)"
  // sozinha a partir do login (HUB_USER) e trava o campo — a página pública
  // não tem login nenhum pra confiar, então lá o campo vira editável (id
  // pg-gestorNome, sem disabled) pra quem abriu o link se identificar.
  function renderFormBody(modelo, d, dis, opts) {
    opts = opts || {};
    const compareceu = d.candidatoCompareceu;
    const perfilOk = d.perfilFezSentido;
    const grupo = d.grupoCargo;
    const topicos = grupo && modelo.topicosPorGrupo[grupo] ? modelo.topicosPorGrupo[grupo] : null;
    const gestorNomeHTML = opts.editarGestorNome
      ? `<div class="field"><label>Nome do(a) Gestor(a) <span class="req">*</span></label><input id="pg-gestorNome" value="${U.escapeHtml(d.gestorNome || '')}" ${dis}></div>`
      : `<div class="field"><label>Nome do(a) Gestor(a)</label><input value="${U.escapeHtml(d.gestorNome || '')}" disabled></div>`;

    let html = `<details class="blk" open><summary>Informações Básicas</summary><div class="blk-body"><div class="form-grid">
      ${gestorNomeHTML}
      <div class="field"><label>Nome do(a) Recrutador(a)</label><input value="${U.escapeHtml(d.recrutadorNome || '')}" disabled></div>
      <div class="field"><label>Nome Completo do(a) Candidato(a)</label><input value="${U.escapeHtml(d.candidatoNome || '')}" disabled></div>
      <div class="field"><label>Data da entrevista <span class="req">*</span></label><input type="date" id="pg-dataEntrevista" value="${d.dataEntrevista || ''}" ${dis}></div>
      <div class="field"><label>Cargo</label><input value="${U.escapeHtml(d.cargo || '')}" disabled></div>
      ${renderLocalizacao(modelo, d, dis)}
      <div class="field"><label>Candidato(a) compareceu? <span class="req">*</span></label>
        <select id="pg-compareceu" ${dis}><option value="">Selecione...</option><option value="Sim" ${compareceu === 'Sim' ? 'selected' : ''}>Sim</option><option value="Não" ${compareceu === 'Não' ? 'selected' : ''}>Não</option></select></div>
    </div></div></details>`;

    if (compareceu === 'Sim') {
      html += `<details class="blk" open><summary>Avaliação Comportamental</summary><div class="blk-body">
        <p class="hint" style="margin-bottom:10px">Verifique se o perfil do candidato está alinhado às exigências práticas do cargo. <strong>Positivo</strong> = atende plenamente. <strong>Atenção</strong> = precisa desenvolver, merece acompanhamento após a contratação.</p>
        <div class="form-grid">
          ${modelo.avaliacaoComportamental.map(bloco => renderMatrizPositivoAtencao(bloco, d.avaliacao && d.avaliacao[bloco.key], dis)).join('')}
        </div>
      </div></details>`;

      html += `<details class="blk" open><summary>Continuidade do Processo</summary><div class="blk-body"><div class="form-grid">
        <div class="field"><label>O perfil fez sentido para continuidade da entrevista para este cargo? <span class="req">*</span></label>
          <select id="pg-perfilOk" ${dis}><option value="">Selecione...</option><option value="Sim" ${perfilOk === 'Sim' ? 'selected' : ''}>Sim</option><option value="Não" ${perfilOk === 'Não' ? 'selected' : ''}>Não</option></select></div>
        ${perfilOk === 'Sim' ? `<div class="field"><label>Qual é o grupo do cargo avaliado neste processo? <span class="req">*</span></label>
          <select id="pg-grupo" ${dis}><option value="">Selecione...</option>${modelo.grupos.map(g => `<option value="${U.escapeHtml(g)}" ${grupo === g ? 'selected' : ''}>${U.escapeHtml(g)}</option>`).join('')}</select></div>` : ''}
      </div></div></details>`;

      if (perfilOk === 'Sim' && topicos) {
        html += topicos.map(bloco => `<details class="blk" open><summary>${U.escapeHtml(bloco.titulo)}</summary><div class="blk-body"><div class="form-grid">
          ${renderMatrizSimNao(bloco, d.topicos && d.topicos[bloco.key], dis)}
        </div></div></details>`).join('');
      }
    }

    // Recomendação do gestor: sempre visível (mesmo quando não compareceu ou
    // perfil não fez sentido — o PDF original também pula direto pra cá).
    html += `<details class="blk" open><summary>Recomendação do Gestor</summary><div class="blk-body">
      <div class="field full"><label>Considerando os requisitos técnicos, comportamentais e o potencial de sucesso na função, qual é o seu nível de recomendação para a contratação deste(a) candidato(a)? <span class="req">*</span></label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
          ${C.NIVEIS_RECOMENDACAO.map(n => `<label style="border:1px solid var(--border);border-radius:8px;padding:8px 12px;cursor:pointer;${d.nivelRecomendacao === n.valor ? 'background:var(--p1);color:#fff;border-color:var(--p1)' : ''}">
            <input type="radio" name="pg-nivel" value="${n.valor}" data-nivel ${d.nivelRecomendacao === n.valor ? 'checked' : ''} style="display:none" ${dis}>
            <div style="font-weight:700">${n.estrelas}</div><div style="font-size:11.5px;max-width:190px">${U.escapeHtml(n.label)}</div>
          </label>`).join('')}
        </div>
      </div>
      <div class="form-grid" style="margin-top:14px">
        <div class="field full"><label>Parecer final da Gestão: <span class="req">*</span></label>
          <select id="pg-parecerFinal" ${dis}><option value="">Selecione...</option>${C.PARECER_FINAL_OPCOES.map(o => `<option value="${U.escapeHtml(o)}" ${d.parecerFinal === o ? 'selected' : ''}>${U.escapeHtml(o)}</option>`).join('')}</select></div>
        <div class="field full"><label>Justificativa do parecer. <span class="req">*</span></label>
          <textarea id="pg-justificativa" rows="4" ${dis}>${U.escapeHtml(d.justificativa || '')}</textarea></div>
      </div>
    </div></details>`;

    return html;
  }

  // formEl: elemento que contém o formulário (onde re-renderizar em
  // #pg-form ao mudar um campo estrutural) — precisa de um segundo parâmetro
  // porque a página pública não tem o resto da tela (#pg-voltar etc.) que
  // justificaria re-renderizar o `el` inteiro.
  function wirePreencherEvents(el, modelo, d, opts) {
    opts = opts || {};
    const rerender = () => {
      el.querySelector('#pg-form').innerHTML = renderFormBody(modelo, d, '', opts);
      wirePreencherEvents(el, modelo, d, opts);
    };
    const rerenderIds = ['pg-regional', 'pg-local', 'pg-compareceu', 'pg-perfilOk', 'pg-grupo'];
    rerenderIds.forEach(id => {
      const inp = el.querySelector('#' + id);
      if (!inp) return;
      inp.addEventListener('change', () => {
        if (id === 'pg-regional') { d.regional = inp.value; d.local = ''; }
        else if (id === 'pg-local') d.local = inp.value;
        else if (id === 'pg-compareceu') d.candidatoCompareceu = inp.value;
        else if (id === 'pg-perfilOk') d.perfilFezSentido = inp.value;
        else if (id === 'pg-grupo') d.grupoCargo = inp.value;
        rerender();
      });
    });
    const gestorNomeInp = el.querySelector('#pg-gestorNome');
    gestorNomeInp && gestorNomeInp.addEventListener('input', () => { d.gestorNome = gestorNomeInp.value; });
    const dataInp = el.querySelector('#pg-dataEntrevista');
    dataInp && dataInp.addEventListener('input', () => { d.dataEntrevista = dataInp.value; });
    const parecerSel = el.querySelector('#pg-parecerFinal');
    parecerSel && parecerSel.addEventListener('change', () => { d.parecerFinal = parecerSel.value; });
    const justTa = el.querySelector('#pg-justificativa');
    justTa && justTa.addEventListener('input', () => { d.justificativa = justTa.value; });
    el.querySelectorAll('[data-avaliacao]').forEach(inp => inp.addEventListener('change', () => {
      d.avaliacao = d.avaliacao || {};
      d.avaliacao[inp.dataset.avaliacao] = d.avaliacao[inp.dataset.avaliacao] || {};
      d.avaliacao[inp.dataset.avaliacao][inp.dataset.item] = inp.value;
    }));
    el.querySelectorAll('[data-topico]').forEach(inp => inp.addEventListener('change', () => {
      d.topicos = d.topicos || {};
      d.topicos[inp.dataset.topico] = d.topicos[inp.dataset.topico] || {};
      d.topicos[inp.dataset.topico][inp.dataset.item] = inp.value;
    }));
    el.querySelectorAll('[data-nivel]').forEach(inp => inp.addEventListener('change', () => {
      d.nivelRecomendacao = Number(inp.value);
      rerender();
    }));
  }

  function validar(modelo, d) {
    if (!d.gestorNome) return 'Informe o nome do(a) gestor(a).';
    if (!d.dataEntrevista) return 'Informe a Data da entrevista.';
    const loc = modelo.localizacao;
    if (loc.tipo !== 'loja_simples' && !d.regional) return `Selecione: ${loc.labelRegional}`;
    if (!d.local) return `Selecione: ${loc.labelLocal}`;
    if (!d.candidatoCompareceu) return 'Informe se o(a) candidato(a) compareceu.';
    if (d.candidatoCompareceu === 'Sim') {
      for (const bloco of modelo.avaliacaoComportamental) {
        for (const item of bloco.itens) {
          if (!(d.avaliacao && d.avaliacao[bloco.key] && d.avaliacao[bloco.key][item.key])) return `Responda: ${item.label}`;
        }
      }
      if (!d.perfilFezSentido) return 'Informe se o perfil fez sentido para continuidade da entrevista.';
      if (d.perfilFezSentido === 'Sim') {
        if (!d.grupoCargo) return 'Selecione o grupo do cargo avaliado neste processo.';
        const topicos = modelo.topicosPorGrupo[d.grupoCargo] || [];
        for (const bloco of topicos) {
          for (const item of bloco.itens) {
            if (!(d.topicos && d.topicos[bloco.key] && d.topicos[bloco.key][item.key])) return `Responda: ${item.label}`;
          }
        }
      }
    }
    if (!d.nivelRecomendacao) return 'Selecione o nível de recomendação para a contratação.';
    if (!d.parecerFinal) return 'Selecione o Parecer final da Gestão.';
    if (!d.justificativa) return 'Preencha a Justificativa do parecer.';
    return null;
  }

  window.HUB_PARECER_RENDER = {
    renderMatrizPositivoAtencao, renderMatrizSimNao, renderLocalizacao,
    renderFormBody, wirePreencherEvents, validar
  };
})();
