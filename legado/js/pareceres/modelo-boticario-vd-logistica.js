// Modelo "O Boticário VD — Logística": Auxiliar de Loja, Coordenador(a) de
// Logística (Local/Regional — os dois cargos caem no mesmo grupo de tópicos),
// Líder de Logística, Supervisor(a) de Logística.
(function () {
  const C = HUB_PARECER_COMUM;
  const VD = HUB_PARECER_VD_COMUM;

  const CARGOS = ['Auxiliar de Loja (LOGÍSTICA)', 'Coordenador(a) de Logística Local (LOGÍSTICA)', 'Coordenador(a) de Logística Regional (LOGÍSTICA)', 'Líder de Logística (LOGÍSTICA)', 'Supervisor(a) de Logística (LOGÍSTICA)'];
  const GRUPOS = ['Auxiliar de Loja (LOGÍSTICA)', 'Coordenador(a) de Logística (LOGÍSTICA)', 'Líder de Logística (LOGÍSTICA)', 'Supervisor(a) de Logística (LOGÍSTICA)'];

  const REMUNERACAO_AUXILIAR = {
    key: 'remuneracaoBeneficios', titulo: 'Remuneração e Benefícios',
    itens: [
      { key: 'remuneracaoExplicada', label: 'A remuneração foi explicada?' },
      { key: 'pisoCategoria', label: 'O piso da categoria (salário mínimo garantido) foi informado?' },
      { key: 'premiacoesIncentivo', label: 'As premiações e políticas de incentivo, após os 3 meses, foram detalhadas?' },
      { key: 'adiantamentoSalarial', label: 'Foi explicado o adiantamento salarial após 3 meses?', hint: 'Após o período de experiência, até o dia 20 de cada mês você vai receber um adiantamento do salário. É normal — é uma prática da empresa. O saldo restante cai no fechamento do mês.' },
      { key: 'valeTransporte', label: 'A política de Vale-Transporte foi apresentada (desconto de 6% conforme CLT)?', hint: 'Vale a pena saber: o desconto do VT é de 6% do seu salário, conforme a lei. Se você mora perto ou vai de bicicleta, pode optar por não pedir o benefício.' },
      { key: 'indicadoresLogistica', label: 'Os principais indicadores de desempenho da operação logística foram mencionados (ex: acuracidade de estoque, cumprimento de prazos, aderência à metodologia FEFO)?' },
      { key: 'indicadoresMarca', label: 'Foi explicado que há indicadores específicos da marca que o candidato aprenderá no treinamento inicial (Onboarding)?' }
    ]
  };
  const TREINAMENTO_AUXILIAR = {
    key: 'treinamentoDesenvolvimento', titulo: 'Treinamento e Desenvolvimento',
    itens: [
      { key: 'periodoFormato', label: 'O período e formato do treinamento inicial foram apresentados (Sala de Aula + prática no ER)?', hint: 'Nos primeiros dias você passará pela Sala de Aula. Após isso, começa a jornada do novo colaborador no ER.' },
      { key: 'obrigatoriedadeMensal', label: 'A obrigatoriedade de treinamentos mensais (presenciais e plataformas digitais como Unibê e Twigo) foi explicada?' },
      { key: 'reuniaoRituaisLogistica', label: 'Foi mencionada a participação em reuniões e rituais de gestão da área de logística?' },
      { key: 'desenvolvimentoContinuo', label: 'A importância do desenvolvimento contínuo e da postura proativa na aprendizagem foi reforçada?' }
    ]
  };
  const UNIFORME_AUXILIAR = {
    key: 'uniformeApresentacao', titulo: 'Uniforme e Apresentação Pessoal',
    itens: [
      { key: 'uniformeApresentado', label: 'O uniforme foi apresentado: será entregue nos primeiros dias de trabalho?', hint: 'O uniforme é fornecido pela empresa. Você o receberá nos seus primeiros dias.' },
      { key: 'responsabilidadeUniforme', label: 'Foi explicado que o uniforme é de responsabilidade do colaborador?', hint: 'O uniforme é descontado apenas em caso de dano fora do normal ou se não for devolvido no desligamento. No uso cotidiano normal, não há desconto.' },
      { key: 'asseioPessoal', label: 'Os padrões de asseio pessoal e cuidado com a imagem foram explicados?', hint: 'Por trabalharmos com cosméticos, esperamos que nossa equipe reflita a proposta da marca: cuidado, beleza e bem-estar.' },
      { key: 'papelRepresentante', label: 'O papel do colaborador como representante da marca O Boticário, mesmo em funções de retaguarda/logística, foi reforçado?' }
    ]
  };

  function remuneracaoLideranca(composicaoLabel, indicadoresLabel) {
    return {
      key: 'remuneracaoBeneficios', titulo: 'Remuneração e Benefícios',
      itens: [
        { key: 'composicaoSalarial', label: composicaoLabel },
        { key: 'pisoCategoria', label: 'O piso da categoria (salário-mínimo garantido) foi informado?' },
        { key: 'premiacoesIncentivo', label: 'As premiações e políticas de incentivo, após os 3 meses, foram detalhadas?' },
        { key: 'adiantamentoSalarial', label: 'Foi explicado o adiantamento salarial após 3 meses?', hint: 'Após o período de experiência, até o dia 20 de cada mês você vai receber um adiantamento do salário. É normal — é uma prática da empresa. O saldo restante cai no fechamento do mês.' },
        { key: 'valeTransporte', label: 'A política de Vale-Transporte foi apresentada (desconto de 6% conforme CLT)?', hint: 'Vale a pena saber: o desconto do VT é de 6% do seu salário, conforme a lei. Se você mora perto ou vai de bicicleta, pode optar por não pedir o benefício.' },
        { key: 'indicadoresPerformance', label: indicadoresLabel },
        { key: 'indicadoresMarca', label: 'Foi explicado que há indicadores específicos da marca que o candidato aprenderá no treinamento inicial (Onboarding)?' }
      ]
    };
  }
  const UNIFORME_LIDERANCA = {
    key: 'uniformeApresentacao', titulo: 'Uniforme e Apresentação Pessoal',
    itens: [
      { key: 'uniformeApresentado', label: 'O uniforme foi apresentado: será entregue nos primeiros dias de trabalho?', hint: 'O uniforme é fornecido pela empresa. Você o receberá nos seus primeiros dias.' },
      { key: 'responsabilidadeUniforme', label: 'Foi explicado que o uniforme é de responsabilidade do colaborador?', hint: 'O uniforme é descontado apenas em caso de dano fora do normal ou se não for devolvido no desligamento. No uso cotidiano normal, não há desconto.' },
      { key: 'asseioPessoal', label: 'Os padrões de asseio pessoal e cuidado com a imagem foram explicados?', hint: 'Por trabalharmos com cosméticos, esperamos que nossa equipe reflita a proposta da marca: cuidado, beleza e bem-estar.' },
      { key: 'condicaoSaude', label: 'Foi confirmado se há alguma condição de saúde, alergia ou restrição que possa impedir o cumprimento dos padrões de apresentação pessoal exigidos, incluindo o uso de maquiagem, quando aplicável?' },
      { key: 'papelRepresentante', label: 'O papel do colaborador como representante da marca O Boticário, mesmo em funções de retaguarda/logística, foi reforçado?' }
    ]
  };

  const ESCOPO_POR_GRUPO = {
    'Auxiliar de Loja (LOGÍSTICA)': {
      key: 'escopoResponsabilidades', titulo: 'Escopo e Responsabilidades do Cargo',
      itens: [
        { key: 'principaisResponsabilidades', label: 'As principais responsabilidades do cargo de Auxiliar de Loja foram apresentadas de forma clara?' },
        { key: 'recebimentoComptar', label: 'Foi explicado o processo de recebimento e conferência de mercadorias por meio do aplicativo Comptar, garantindo acuracidade no processo?' },
        { key: 'metodologiaFEFO', label: 'Foi explicada a metodologia FEFO (First Expired, First Out) para organização, limpeza e reposição de produtos no estoque?' },
        { key: 'preparacaoDistribuicao', label: 'Foram explicadas as rotinas de preparação e distribuição de pedidos conforme solicitações internas?' },
        { key: 'separacaoPedidosRevendedores', label: 'Foi explicado o processo de separação de pedidos de revendedores: conferência, embalagem, lacração e faturamento?' },
        { key: 'inventarioCentralServicos', label: 'Foi informado sobre a participação na contagem e no controle do inventário dos produtos armazenados na Central de Serviços?' },
        { key: 'controleValidade', label: 'Foi explicado o monitoramento e controle das datas de validade dos produtos, seguindo diretrizes de segurança e boas práticas de armazenagem?' },
        { key: 'logisticaReversa', label: 'Foi explicada a separação adequada de produtos destinados à reciclagem, conforme orientações de logística reversa?' },
        { key: 'atendimentoCliente', label: 'Foi informado que o cargo realiza atendimento ao cliente sempre que necessário?' },
        { key: 'limpezaConservacao', label: 'Foi informado que o cargo abrange, de forma contínua e obrigatória para todos os colaboradores, atividades de organização, limpeza e conservação do ambiente e dos equipamentos, conforme a rotina do ER?' },
        { key: 'transferenciaUnidade', label: 'Foi informado que, por se tratar de uma rede com várias lojas, pode haver necessidade de atuação temporária ou transferência para outra unidade, mediante aviso prévio?' }
      ]
    },
    'Coordenador(a) de Logística (LOGÍSTICA)': {
      key: 'escopoResponsabilidades', titulo: 'Escopo e Responsabilidades do Cargo',
      itens: [
        { key: 'principaisResponsabilidades', label: 'As principais responsabilidades do cargo de Coordenador(a) de Logística foram apresentadas de forma clara?' },
        { key: 'coordenacaoHubs', label: 'Foram apresentadas as responsabilidades de coordenação de múltiplos hubs logísticos e operações de estoque de ERs e lojas da região?' },
        { key: 'politicasInventario', label: 'Foi explicada a responsabilidade pelo desenvolvimento e implementação de políticas e estratégias de gerenciamento de inventário, com foco em minimizar custos e reduzir desperdícios?' },
        { key: 'desempenhoOperacionalHubs', label: 'Foi explicado o acompanhamento do desempenho operacional de múltiplos hubs/ERs, assegurando padronização de processos e cumprimento de metas regionais de estoque, acuracidade e produtividade?' },
        { key: 'transporteDistribuicao', label: 'Foram apresentadas as responsabilidades de coordenação e otimização do transporte e distribuição: negociação com transportadoras, gerenciamento de rotas e prazos?' },
        { key: 'indicadoresPerformanceLogistica', label: 'Foi explicado o acompanhamento dos principais indicadores de performance logística regional (IAF, acuracidade, SLA, custo logístico, TAT, OTD, produtividade)?' },
        { key: 'liderancaEquipeLogistica', label: 'Foi explicada a responsabilidade pela liderança da equipe de logística, atuando como responsável máximo da logística na região e garantindo alinhamento entre todos os níveis operacionais?' },
        { key: 'viagensDeslocamentos', label: 'Foi informado que o cargo pode envolver necessidade de viagens e deslocamentos para acompanhamento dos diferentes hubs/regiões?' }
      ]
    },
    'Líder de Logística (LOGÍSTICA)': {
      key: 'escopoResponsabilidades', titulo: 'Escopo e Responsabilidades do Cargo',
      itens: [
        { key: 'principaisResponsabilidades', label: 'As principais responsabilidades do cargo de Líder de Logística foram apresentadas de forma clara?' },
        { key: 'liderancaOperacoesEstoque', label: 'Foram apresentadas as responsabilidades de liderança das operações de estoque do ER, incluindo recebimento, conferência, armazenagem e reposição de produtos e insumos?' },
        { key: 'controleEstoqueFEFO', label: 'Foi explicada a responsabilidade pela organização e controle do estoque, incluindo a metodologia FEFO para monitoramento de validade dos produtos?' },
        { key: 'fluxoRecall', label: 'Foi explicado o gerenciamento do fluxo de produtos de recall (irregulares e recicláveis), incluindo identificação, segregação e registro?' },
        { key: 'supervisaoSeparacaoPedidos', label: 'Foram apresentadas as responsabilidades de supervisão da separação e conferência dos pedidos, garantindo agilidade e precisão na expedição?' },
        { key: 'rotasEntregaLastMile', label: 'Foi explicado o acompanhamento das rotas de entrega na Plataforma Logística e o monitoramento da última milha (last mile)?' },
        { key: 'desempenhoEntregadores', label: 'Foi explicado o monitoramento do desempenho dos entregadores, com foco em melhoria contínua do nível de serviço?' },
        { key: 'liderancaEquipeAuxiliares', label: 'Foram apresentadas as responsabilidades de liderança e desenvolvimento da equipe de auxiliares de loja, promovendo um ambiente colaborativo e produtivo?' },
        { key: 'limpezaConservacao', label: 'Foi informado que o cargo abrange, de forma contínua e obrigatória para todos os colaboradores, atividades de organização, limpeza e conservação do ambiente e dos equipamentos, conforme a rotina do ER?' },
        { key: 'transferenciaUnidade', label: 'Foi informado que, por se tratar de uma rede com várias unidades, pode haver necessidade de atuação temporária ou transferência para outra unidade, mediante aviso prévio?' }
      ]
    },
    'Supervisor(a) de Logística (LOGÍSTICA)': {
      key: 'escopoResponsabilidades', titulo: 'Escopo e Responsabilidades do Cargo',
      itens: [
        { key: 'principaisResponsabilidades', label: 'As principais responsabilidades do cargo de Supervisor de Logística foram apresentadas de forma clara?' },
        { key: 'supervisaoOperacoesEstoque', label: 'Foram apresentadas as responsabilidades de supervisão das operações de estoque do ER: movimentação de materiais, recebimento, armazenagem, separação e expedição?' },
        { key: 'processosLayoutLogistico', label: 'Foi explicada a responsabilidade pelo desenvolvimento de processos, fluxos e layout logístico, com foco em produtividade, segurança e ergonomia?' },
        { key: 'metodologia5S', label: 'Foi explicada a aplicação de metodologias de melhoria contínua, como 5S, visando um ambiente de trabalho organizado e dentro dos SLAs esperados?' },
        { key: 'supervisaoEntregas', label: 'Foram apresentadas as responsabilidades de supervisão das entregas: monitoramento de rotas, prazos e integridade dos produtos?' },
        { key: 'negociacaoFretes', label: 'Foi explicada a responsabilidade pela avaliação e negociação de prazos e fretes com transportadoras?' },
        { key: 'acompanhamentoMetasSetor', label: 'Foi explicado o acompanhamento das metas do setor logístico, com análises periódicas, planos de ação e reporte à Gerência?' },
        { key: 'gestaoEquipe', label: 'Foram apresentadas as responsabilidades de gestão de equipe: dimensionamento, alocação, treinamentos, feedbacks e acompanhamento individual de performance?' },
        { key: 'controlePonto', label: 'Foi explicada a responsabilidade pelo controle de ponto da equipe, garantindo conformidade com políticas de jornada e legislação trabalhista?' },
        { key: 'transferenciaUnidade', label: 'Foi informado que, por se tratar de uma rede com várias unidades, pode haver necessidade de atuação temporária ou transferência para outra unidade, mediante aviso prévio?' }
      ]
    }
  };

  window.HUB_PARECER_MODELOS = window.HUB_PARECER_MODELOS || {};
  window.HUB_PARECER_MODELOS.boticario_vd_logistica = {
    id: 'boticario_vd_logistica', nome: 'O Boticário VD — Logística',
    gestores: VD.GESTORES_VD, recrutadores: C.RECRUTADORES,
    cargos: CARGOS,
    localizacao: { tipo: 'regional_er', regionais: VD.REGIONAIS_ER, labelRegional: 'Para qual a Regional?', labelLocal: 'Para qual ER' },
    grupos: GRUPOS,
    cargoParaGrupoDefault: cargo => cargo.startsWith('Coordenador(a) de Logística') ? 'Coordenador(a) de Logística (LOGÍSTICA)' : (GRUPOS.includes(cargo) ? cargo : null),
    avaliacaoComportamental: C.AVALIACAO_COMPORTAMENTAL,
    topicosPorGrupo: {
      'Auxiliar de Loja (LOGÍSTICA)': [VD.BLOCO_JORNADA_VD, ESCOPO_POR_GRUPO['Auxiliar de Loja (LOGÍSTICA)'], REMUNERACAO_AUXILIAR, TREINAMENTO_AUXILIAR, UNIFORME_AUXILIAR, C.BLOCO_PROXIMOS_PASSOS],
      'Coordenador(a) de Logística (LOGÍSTICA)': [VD.BLOCO_JORNADA_VD, ESCOPO_POR_GRUPO['Coordenador(a) de Logística (LOGÍSTICA)'], remuneracaoLideranca('A composição salarial foi explicada (salário fixo + variável)?', 'Os principais indicadores de desempenho foram mencionados (IAF, acuracidade, SLA, custo logístico, TAT, OTD, produtividade)?'), VD.TREINAMENTO_VD_PADRAO, VD.BLOCO_ROTINA_VD, UNIFORME_LIDERANCA, C.BLOCO_PROXIMOS_PASSOS],
      'Líder de Logística (LOGÍSTICA)': [VD.BLOCO_JORNADA_VD, ESCOPO_POR_GRUPO['Líder de Logística (LOGÍSTICA)'], remuneracaoLideranca('A composição salarial foi explicada (salário fixo + premiação)?', 'Os principais indicadores de desempenho foram mencionados (IAF, acuracidade, SLA, custo logístico, TAT, OTD)?'), VD.TREINAMENTO_VD_PADRAO, VD.BLOCO_ROTINA_VD, UNIFORME_LIDERANCA, C.BLOCO_PROXIMOS_PASSOS],
      'Supervisor(a) de Logística (LOGÍSTICA)': [VD.BLOCO_JORNADA_VD, ESCOPO_POR_GRUPO['Supervisor(a) de Logística (LOGÍSTICA)'], remuneracaoLideranca('A composição salarial foi explicada (salário fixo + variável)?', 'Os principais indicadores de desempenho foram mencionados (IAF, acuracidade, SLA, custo logístico, TAT, OTD)?'), VD.TREINAMENTO_VD_PADRAO, VD.BLOCO_ROTINA_VD, UNIFORME_LIDERANCA, C.BLOCO_PROXIMOS_PASSOS]
    }
  };
})();
