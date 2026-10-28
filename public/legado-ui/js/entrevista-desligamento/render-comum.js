// Motor de renderização da Entrevista de Desligamento — um formulário
// "uma pergunta por tela" (igual ao Microsoft Forms original, com as
// "Opções de ramificação" de js/entrevista-desligamento/modelo.js), em vez
// do padrão de blocos condicionais numa página só usado no Parecer do
// Gestor: aqui há muito mais perguntas (66, contra ~10 blocos) e a
// ramificação é 1-a-1 por pergunta, então um wizard pergunta-a-pergunta é
// mais simples de implementar corretamente e mais fiel ao formulário
// original do que tentar encaixar tudo em blocos <details>.
//
// Compartilhado entre a tela autenticada ("ver resposta", só leitura) e a
// página pública sem login (entrevista-desligamento-publico.html) — não
// depende de HUB_USER/HUB_RECRUIT, só de HUB_UTILS.
(function () {
  const U = HUB_UTILS;

  function opcaoCardHTML(name, idx, label, marcado, tipo, dis) {
    const inputType = tipo === 'multipla' ? 'checkbox' : 'radio';
    return `<label class="ed-opcao${marcado ? ' sel' : ''}" data-idx="${idx}">
      <input type="${inputType}" name="${name}" value="${idx}" ${marcado ? 'checked' : ''} style="display:none" ${dis}>
      <span>${U.escapeHtml(label)}</span>
    </label>`;
  }

  // valorAtual: string (índice da opção, p/ 'unica') | string[] (índices, p/
  // 'multipla') | string (texto livre, p/ 'texto') | number (0-10, p/ 'nps').
  function renderPerguntaHTML(qid, q, valorAtual, dis) {
    const disabled = dis ? 'disabled' : '';
    let corpo = '';
    if (q.tipo === 'unica') {
      corpo = `<div class="ed-opcoes">${q.opcoes.map((o, i) => opcaoCardHTML('ed-q' + qid, i, o.label, valorAtual === String(i), 'unica', disabled)).join('')}</div>`;
    } else if (q.tipo === 'multipla') {
      const sel = Array.isArray(valorAtual) ? valorAtual : [];
      corpo = `<p class="hint" style="margin-bottom:10px">Selecione até ${q.maxSelecionar} opções.</p>
        <div class="ed-opcoes">${q.opcoes.map((o, i) => opcaoCardHTML('ed-q' + qid, i, o.label, sel.includes(String(i)), 'multipla', disabled)).join('')}</div>`;
    } else if (q.tipo === 'texto') {
      corpo = `<textarea id="ed-resposta-texto" rows="4" placeholder="Insira sua resposta" ${disabled}>${U.escapeHtml(valorAtual || '')}</textarea>`;
    } else if (q.tipo === 'nps') {
      const v = valorAtual === undefined || valorAtual === null || valorAtual === '' ? null : Number(valorAtual);
      corpo = `<div class="ed-nps">${Array.from({ length: 11 }, (_, n) => `<button type="button" class="ed-nps-btn${v === n ? ' sel' : ''}" data-n="${n}" ${disabled}>${n}</button>`).join('')}</div>
        <div class="ed-nps-labels"><span>Nada provável</span><span>Extremamente provável</span></div>`;
    }
    return `<div class="field full"><label>${U.escapeHtml(q.titulo)} <span class="req">*</span></label>${corpo}</div>`;
  }

  // Muta `respostas[qid]` in place ao interagir — mesmo padrão de mutação
  // direta usado em js/pareceres/render-comum.js. Não faz nada com
  // navegação (isso fica por conta de quem chama, via botão Avançar).
  function wirePergunta(el, qid, q, respostas) {
    if (q.tipo === 'unica') {
      // Escuta `change` no <input> em vez de `click` no <label> que o
      // envolve: clicar num <label> que contém seu próprio <input>
      // dispara clique tanto no label quanto (via ativação nativa do
      // controle) no input, que borbulha de volta pro label — um único
      // clique do usuário chegava a rodar o handler duas vezes (marcava e
      // desmarcava na mesma hora). `change` no input dispara exatamente
      // uma vez por alternância real, não importa como foi acionado.
      el.querySelectorAll('.ed-opcao input').forEach(inp => inp.addEventListener('change', () => {
        respostas[qid] = inp.value;
        el.querySelectorAll('.ed-opcao').forEach(l => l.classList.toggle('sel', l.querySelector('input') === inp));
      }));
    } else if (q.tipo === 'multipla') {
      const max = q.maxSelecionar || q.opcoes.length;
      el.querySelectorAll('.ed-opcao input').forEach(inp => inp.addEventListener('change', () => {
        let sel = Array.isArray(respostas[qid]) ? respostas[qid].slice() : [];
        if (inp.checked) {
          if (sel.length >= max) { inp.checked = false; return; } // já atingiu o máximo — desfaz a marcação
          sel.push(inp.value);
        } else {
          sel = sel.filter(v => v !== inp.value);
        }
        respostas[qid] = sel;
        inp.closest('.ed-opcao').classList.toggle('sel', inp.checked);
      }));
    } else if (q.tipo === 'texto') {
      const ta = el.querySelector('#ed-resposta-texto');
      ta && ta.addEventListener('input', () => { respostas[qid] = ta.value; });
    } else if (q.tipo === 'nps') {
      el.querySelectorAll('.ed-nps-btn').forEach(btn => btn.addEventListener('click', () => {
        respostas[qid] = Number(btn.dataset.n);
        el.querySelectorAll('.ed-nps-btn').forEach(b => b.classList.toggle('sel', b === btn));
      }));
    }
  }

  function perguntaRespondida(qid, q, respostas) {
    const v = respostas[qid];
    if (q.tipo === 'multipla') return Array.isArray(v) && v.length > 0;
    if (q.tipo === 'nps') return v !== undefined && v !== null && v !== '';
    if (q.tipo === 'texto') return !!(v && String(v).trim());
    return v !== undefined && v !== null && v !== '';
  }

  function proximaPergunta(qid, q, respostas) {
    if (q.tipo === 'unica') {
      const idx = Number(respostas[qid]);
      const opc = q.opcoes[idx];
      return opc ? (opc.next === undefined ? q.next : opc.next) : null;
    }
    return q.next === undefined ? null : q.next;
  }

  // Converte o mapa de respostas (por id de pergunta, valores por índice de
  // opção) num objeto legível por humanos — usado na tela "Ver resposta" e
  // podendo ser usado também para exportação/relatório futuro.
  function respostaLegivel(qid, q, valor) {
    if (valor === undefined || valor === null || valor === '') return null;
    if (q.tipo === 'unica') { const o = q.opcoes[Number(valor)]; return o ? o.label : null; }
    if (q.tipo === 'multipla') return (Array.isArray(valor) ? valor : []).map(i => { const o = q.opcoes[Number(i)]; return o ? o.label : null; }).filter(Boolean);
    if (q.tipo === 'nps') return Number(valor);
    return String(valor);
  }

  window.HUB_ED_RENDER = { renderPerguntaHTML, wirePergunta, perguntaRespondida, proximaPergunta, respostaLegivel };
})();
