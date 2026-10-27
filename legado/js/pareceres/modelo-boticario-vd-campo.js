// Modelo "O Boticário VD — Campo": Atendente de Bases, Coordenador(a) de
// Campo, Promotor(a) de Campo, Supervisor(a) de Campo.
//
// ATENÇÃO — possível erro no formulário original: no PDF fonte, os blocos
// "Escopo e Responsabilidades do Cargo" de Promotor(a) de Campo e
// Supervisor(a) de Campo saem com o texto idêntico aos blocos de Caixa (ER)
// e Gerente/Coordenador de Operações (ER) do OUTRO modelo (Boticário VD —
// ER), em vez de um texto específico de Campo. Transcrito aqui exatamente
// como está no PDF (a pedido do usuário), mas vale confirmar com quem criou
// o formulário original se isso foi intencional ou um erro de cópia.
(function () {
  const C = HUB_PARECER_COMUM;
  const VD = HUB_PARECER_VD_COMUM;

  const CARGOS = ['Atendente de Bases (CAMPO)', 'Coordenador(a) de Campo (CAMPO)', 'Promotor(a) de Campo (CAMPO)', 'Supervisor(a) de Campo (CAMPO)'];
  const GRUPOS = CARGOS;

  const REMUNERACAO_ATENDENTE_BASES = VD.remuneracaoVdPadrao('Os principais indicadores de desempenho foram mencionados (IAF: metas de conversão, reativação e qualidade de cadastro)?');
  const REMUNERACAO_PADRAO = VD.remuneracaoVdPadrao();
  const TREINAMENTO_PADRAO = VD.TREINAMENTO_VD_PADRAO;
  const UNIFORME_PADRAO = VD.UNIFORME_VD_PADRAO;

  const ESCOPO_POR_GRUPO = {
    'Atendente de Bases (CAMPO)': {
      key: 'escopoResponsabilidades', titulo: 'Escopo e Responsabilidades do Cargo',
      itens: [
        { key: 'principaisResponsabilidades', label: 'As principais responsabilidades do cargo de Atendente de Base foram apresentadas de forma clara?' },
        { key: 'prospeccaoAtiva', label: 'Foi explicado o conceito de prospecção ativa remota (via WhatsApp e/ou ligações) de novos revendedores (Inícios), a partir do backlog FVC e bases internas?' },
        { key: 'reativacaoRevendedores', label: 'Foi explicado o conceito de reativação de revendedores cessados (Reinícios): contato ativo com revendedores inativos há mais de 7 ciclos para reativação da base?' },
        { key: 'appVDI', label: 'Foi apresentado o uso do aplicativo VDI para realização do cadastro correto dos novos revendedores?' },
        { key: 'registroContatos', label: 'Foi explicada a importância do registro rigoroso de contatos realizados e pendentes para controle das intenções de revenda?' },
        { key: 'acompanhamentoPrimeiroPedido', label: 'Foi informado que o atendente de base acompanha o novo revendedor de forma ativa até a realização do primeiro pedido e ciclo?' },
        { key: 'indicadoresIAFBase', label: 'Foram explicados os indicadores de desempenho pertinentes à operação de base (IAF: Inícios, Reinícios e metas de conversão)?' },
        { key: 'alinhamentoCoordenador', label: 'Foi explicado o alinhamento contínuo com o(a) Coordenador(a) de Campo sobre andamento das ações e resultados?' },
        { key: 'transferenciaUnidade', label: 'Foi informado que, por se tratar de uma rede com várias unidades, pode haver necessidade de atuação temporária ou transferência para outra unidade, mediante aviso prévio?' }
      ]
    },
    'Coordenador(a) de Campo (CAMPO)': {
      key: 'escopoResponsabilidades', titulo: 'Escopo e Responsabilidades do Cargo',
      itens: [
        { key: 'principaisResponsabilidades', label: 'As principais responsabilidades do cargo de Coordenador(a) de Campo foram apresentadas de forma clara?' },
        { key: 'gestaoComercial', label: 'Foram apresentadas as responsabilidades de gestão comercial: acompanhamento dos indicadores IAF e coberturas, análise de áreas abaixo do esperado, proposição e acompanhamento de ações de recuperação e elaboração de eventos/parcerias para prospecção de novos revendedores?' },
        { key: 'gestaoOperacional', label: 'Foram apresentadas as responsabilidades de gestão operacional: elaboração de escala do time de campo (supervisores, promotores e atendentes), definição de roteirização, monitoramento de jornada e participação nas reuniões de ciclo como elo entre ER e campo?' },
        { key: 'gestaoPessoas', label: 'Foram apresentadas as responsabilidades de gestão de pessoas: conversas individuais e em grupo com o time, feedbacks registrados em plataforma interna, gestão de conflitos, treinamento do time em processos e ferramentas, identificação de talentos e desenvolvimento de sucessores?' },
        { key: 'responsabilidadesAdministrativas', label: 'Foram apresentadas as responsabilidades administrativas: controle de ponto, férias, admissões, desligamentos e alinhamento com RH/DP, bem como monitoramento de despesas operacionais?' },
        { key: 'viagensDeslocamentos', label: 'Foi informado que o cargo pode envolver necessidade de viagens e deslocamentos para acompanhamento do time de campo em diferentes regiões?' },
        { key: 'onboardingLideranca', label: 'Foi explicado o processo de onboarding e integração para a posição de liderança, quando aplicável?' },
        { key: 'transferenciaUnidade', label: 'Foi informado que, por se tratar de uma rede com várias unidades, pode haver necessidade de atuação temporária ou transferência para outra unidade, mediante aviso prévio?' }
      ]
    },
    // Transcrito exatamente como está no PDF — ver aviso no topo do arquivo.
    'Promotor(a) de Campo (CAMPO)': {
      key: 'escopoResponsabilidades', titulo: 'Escopo e Responsabilidades do Cargo',
      itens: [
        { key: 'principaisResponsabilidades', label: 'As principais responsabilidades do cargo de Caixa foram apresentadas de forma clara?' },
        { key: 'rotinasCaixa', label: 'Foram explicadas as rotinas de operação de caixa: abertura, fechamento e conferência de valores, garantindo exatidão nas operações financeiras?' },
        { key: 'sistemasPDV', label: 'Foi explicada a operação dos sistemas de caixa (PDV) e dos meios de pagamento disponibilizados pela empresa?' },
        { key: 'registroPedidos', label: 'Foram explicados os procedimentos de registro e finalização de pedidos no sistema, incluindo emissão de documento fiscal e cobrança ao revendedor?' },
        { key: 'apoioAtendimento', label: 'Foi informado que o cargo apoia no atendimento ao revendedor, incentivando compras multimarcas para incremento do boleto médio?' },
        { key: 'padraoMaestria', label: 'O Padrão de Atendimento ao Revendedor foi apresentado através do Vídeo/Guia Maestria?', hint: 'Mencionar que é o padrão atendimento e relacionamento da marca O Boticário VD, e que o colaborador será treinado nesse padrão.' },
        { key: 'organizacaoAreaCaixa', label: 'Foram explicadas as responsabilidades de organização da área do caixa (catálogos, brindes e sasolas) e a guarda e organização de canhotos de notas fiscais e documentos administrativos do ER?' },
        { key: 'acuracidadeFinanceira', label: 'Foi explicada a responsabilidade sobre a acuracidade nas operações financeiras e o risco inerente ao manuseio de valores?' },
        { key: 'limpezaConservacao', label: 'Foi informado que o cargo abrange, de forma contínua e obrigatória, atividades de organização, limpeza e conservação do ambiente, conforme a rotina do ER?' },
        { key: 'transferenciaUnidade', label: 'Foi informado que, por se tratar de uma rede com várias unidades, pode haver necessidade de atuação temporária ou transferência para outra unidade, mediante aviso prévio?' }
      ]
    },
    // Transcrito exatamente como está no PDF — ver aviso no topo do arquivo.
    'Supervisor(a) de Campo (CAMPO)': {
      key: 'escopoResponsabilidades', titulo: 'Escopo e Responsabilidades do Cargo',
      itens: [
        { key: 'principaisResponsabilidades', label: 'As principais responsabilidades do cargo de Gerente de ER / Coordenador de Operações foram apresentadas de forma clara?' },
        { key: 'gestaoComercial', label: 'Foram apresentadas as responsabilidades de gestão comercial: definição de OKRs, estratégias de vendas, campanhas de incentivo, divulgação de ciclos e organização de Encontros de Ciclo?' },
        { key: 'gestaoOperacional', label: 'Foram apresentadas as responsabilidades de gestão operacional: acompanhamento do planograma, controle de estoque, gerenciamento de validade de produtos (FEFO), organização e atratividade do salão de vendas?' },
        { key: 'gestaoEquipe', label: 'Foram apresentadas as responsabilidades de gestão de equipe: acompanhamento de desempenho individual e coletivo, feedbacks estruturados, planos de ação e garantia de conclusão dos treinamentos obrigatórios?' },
        { key: 'responsabilidadesAdministrativas', label: 'Foram apresentadas as responsabilidades administrativas: acompanhamento de custos da operação, controle diário de abertura e fechamento de caixa (conformidade com time financeiro)?' },
        { key: 'gestaoAtendimento', label: 'Foram apresentadas as responsabilidades de gestão de atendimento: monitoramento dos indicadores de satisfação dos revendedores (Medallia), indicadores logísticos e proposta de melhorias?' },
        { key: 'onboardingLideranca', label: 'Foi explicado o processo de onboarding e integração para a posição de liderança, quando aplicável?' },
        { key: 'transferenciaUnidade', label: 'Foi informado que, por se tratar de uma rede com várias unidades, pode haver necessidade de atuação temporária ou transferência para outra unidade, mediante aviso prévio?' }
      ]
    }
  };

  window.HUB_PARECER_MODELOS = window.HUB_PARECER_MODELOS || {};
  window.HUB_PARECER_MODELOS.boticario_vd_campo = {
    id: 'boticario_vd_campo', nome: 'O Boticário VD — Campo',
    gestores: VD.GESTORES_VD, recrutadores: C.RECRUTADORES,
    cargos: CARGOS,
    localizacao: { tipo: 'regional_er', regionais: VD.REGIONAIS_ER, labelRegional: 'Para qual a Regional?', labelLocal: 'Para qual ER' },
    grupos: GRUPOS,
    cargoParaGrupoDefault: cargo => GRUPOS.includes(cargo) ? cargo : null,
    avaliacaoComportamental: C.AVALIACAO_COMPORTAMENTAL,
    topicosPorGrupo: {}
  };
  for (const g of GRUPOS) {
    const remuneracao = g === 'Atendente de Bases (CAMPO)' ? REMUNERACAO_ATENDENTE_BASES : REMUNERACAO_PADRAO;
    window.HUB_PARECER_MODELOS.boticario_vd_campo.topicosPorGrupo[g] = [VD.BLOCO_JORNADA_VD, ESCOPO_POR_GRUPO[g], remuneracao, TREINAMENTO_PADRAO, VD.BLOCO_ROTINA_VD, UNIFORME_PADRAO, C.BLOCO_PROXIMOS_PASSOS];
  }
})();
