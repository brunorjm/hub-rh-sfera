// Modelo "O Boticário VD — ER" (Espaço do Revendedor): Atendente de FVL,
// Atendente de Venda Direta, Caixa (ER), Gerente/Coordenador de Operações (ER).
(function () {
  const C = HUB_PARECER_COMUM;
  const VD = HUB_PARECER_VD_COMUM;

  const CARGOS = ['Atendente de FVL (FVL)', 'Atendente de Venda Direta (ER)', 'Caixa (ER)', 'Gerente/Coordenador de Operações (ER)', 'ASG'];
  const GRUPOS = ['Atendente de FVL (FVL)', 'Atendente de Venda Direta (ER)', 'Caixa (ER)', 'Gerente/Coordenador de Operações (ER)'];

  const REMUNERACAO_PADRAO = VD.remuneracaoVdPadrao();
  const TREINAMENTO_PADRAO = VD.TREINAMENTO_VD_PADRAO;
  const UNIFORME_PADRAO = VD.UNIFORME_VD_PADRAO;

  const ESCOPO_POR_GRUPO = {
    'Atendente de FVL (FVL)': {
      key: 'escopoResponsabilidades', titulo: 'Escopo e Responsabilidades do Cargo',
      itens: [
        { key: 'principaisResponsabilidades', label: 'As principais responsabilidades do cargo de Atendente de FVL foram apresentadas de forma clara?' },
        { key: 'atendimentoCanais', label: 'Foi explicado que o atendimento aos revendedores é realizado por telefone, WhatsApp e eventualmente de forma presencial no ER?' },
        { key: 'divulgacaoCiclos', label: 'Foram explicadas as rotinas de divulgação de ciclos promocionais e lançamentos para os revendedores?' },
        { key: 'disparosMensagens', label: 'Foi explicada a dinâmica de disparos de mensagens regulares para os revendedores via listas de transmissão?' },
        { key: 'inadimplenciaCobranca', label: 'Foram explicadas as atividades de análise de inadimplência e realização de cobranças?' },
        { key: 'rotinasAtendimento', label: 'Foram explicadas as rotinas de atendimento: trocas, faltas, devoluções parciais e totais, reemissão de boletos?' },
        { key: 'integracaoRevendedores', label: 'Foi informado sobre a realização da integração de novos revendedores?' },
        { key: 'dadosCadastrais', label: 'Foi explicada a importância de manter os dados cadastrais dos revendedores sempre atualizados no sistema?' },
        { key: 'encontrosCicloDivulgacao', label: 'Foi informado sobre a divulgação de Encontros de Ciclo, treinamentos e eventos, incentivando a participação dos revendedores?' },
        { key: 'contribuiIndicadores', label: 'Foi informado que o cargo contribui para o alcance dos indicadores de resultados e que realiza campanhas com foco no crescimento dos indicadores?' },
        { key: 'transferenciaUnidade', label: 'Foi informado que, por se tratar de uma rede com várias unidades, pode haver necessidade de atuação temporária ou transferência para outra unidade, mediante aviso prévio?' }
      ]
    },
    'Atendente de Venda Direta (ER)': {
      key: 'escopoResponsabilidades', titulo: 'Escopo e Responsabilidades do Cargo',
      itens: [
        { key: 'principaisResponsabilidades', label: 'As principais responsabilidades do cargo de Atendente de Venda Direta foram apresentadas de forma clara?' },
        { key: 'atendimentoPresencialER', label: 'Foi explicado que o atendimento é presencial aos revendedores no Espaço do Revendedor (ER)?' },
        { key: 'padraoMaestria', label: 'O Padrão de Atendimento ao Revendedor foi apresentado através do Vídeo/Guia Maestria?', hint: 'Mencionar que é o padrão atendimento e relacionamento da marca O Boticário VD, e que o colaborador será treinado nesse padrão.' },
        { key: 'organizacaoSalao', label: 'Foram apresentadas as rotinas de organização do salão de vendas: prateleiras abastecidas, precificadas e atrativas para os revendedores?' },
        { key: 'ferramentaVDI', label: 'Foi apresentada a ferramenta VDI e seu papel no atendimento, apresentação de oportunidades de crescimento e relacionamento com os revendedore?' },
        { key: 'comunicarPromocoes', label: 'Foi explicado como o colaborador deve comunicar as promoções do ciclo para potencializar os lucros dos revendedores?' },
        { key: 'aberturaFechamentoER', label: 'Foram explicadas as rotinas de abertura e/ou fechamento do ER de forma estruturada e organizada?' },
        { key: 'encontrosCicloGeraAcao', label: 'Foi informado sobre a participação nos Encontros de Ciclo e o papel do colaborador na organização e divulgação desses eventos (ferramenta Gera Ação)?' },
        { key: 'contribuiCampanhas', label: 'Foi explicado que o cargo contribui para o alcance dos indicadores de resultados (campanhas internas no ER)?' },
        { key: 'limpezaConservacao', label: 'Foi informado que o cargo abrange, de forma contínua e obrigatória para todos os colaboradores, atividades de organização, limpeza e conservação do ambiente e dos equipamentos, conforme a rotina do ER?' },
        { key: 'recebimentoMercadorias', label: 'Foi informado que o atendente realiza o recebimento de mercadorias e rotinas de estoque sempre que necessário?' },
        { key: 'transferenciaUnidade', label: 'Foi informado que, por se tratar de uma rede com várias unidades, pode haver necessidade de atuação temporária ou transferência para outra unidade, mediante aviso prévio?' }
      ]
    },
    'Caixa (ER)': {
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
    'Gerente/Coordenador de Operações (ER)': {
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
  window.HUB_PARECER_MODELOS.boticario_vd_er = {
    id: 'boticario_vd_er', nome: 'O Boticário VD — ER',
    gestores: VD.GESTORES_VD, recrutadores: C.RECRUTADORES,
    cargos: CARGOS,
    localizacao: { tipo: 'regional_er', regionais: VD.REGIONAIS_ER, labelRegional: 'Para qual a Regional?', labelLocal: 'Para qual ER' },
    grupos: GRUPOS,
    cargoParaGrupoDefault: cargo => GRUPOS.includes(cargo) ? cargo : null,
    avaliacaoComportamental: C.AVALIACAO_COMPORTAMENTAL,
    topicosPorGrupo: {}
  };
  for (const g of GRUPOS) {
    window.HUB_PARECER_MODELOS.boticario_vd_er.topicosPorGrupo[g] = [VD.BLOCO_JORNADA_VD, ESCOPO_POR_GRUPO[g], REMUNERACAO_PADRAO, TREINAMENTO_PADRAO, VD.BLOCO_ROTINA_VD, UNIFORME_PADRAO, C.BLOCO_PROXIMOS_PASSOS];
  }
})();
