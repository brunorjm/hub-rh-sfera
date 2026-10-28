// Modelo "Levi's": Auxiliar de Loja, Caixa, Coordenador(a) de Loja, Gerente
// de Loja, Supervisor(a) de Vendas, Vendedor(a), Vendedor(a) Responsável,
// Jovem Aprendiz.
(function () {
  const C = HUB_PARECER_COMUM;
  const VD = HUB_PARECER_VD_COMUM;

  const GESTORES = ['Diego Pedro da Silva', 'Fatima Ribeiro Cardoso', 'Hugo George Bezerra De Freitas', 'Joyce Santos de Lira', 'Maria De Lourdes Silva Lima', 'Rosangela Amorim Barbosa', 'Lucas Favaretto', 'Sabrina da Silva Souza Nascimento'];
  const CARGOS = ['Auxiliar de Loja', 'Caixa', 'Coordenador(a) de Loja', 'Gerente de Loja', 'Supervisor(a) de Vendas', 'Vendedor(a)', 'Vendedor(a) Responsável', 'Jovem Aprendiz'];
  const LOJAS = ["Levis Nova América", 'Levis Caxias', 'Levis Barra', 'Levis Rio Sul', 'Levis Tijuca', 'Levis Plaza', 'Levis Norte'];
  const GRUPO_LIDERANCA = 'Liderança - Vendedor(a) Responsável, Coordenador(a), Gerente e Supervisor(a)';
  const GRUPOS = ['Auxiliar de Loja', 'Vendedor(a)', 'Caixa', GRUPO_LIDERANCA];

  const TREINAMENTO_LEVIS = {
    key: 'treinamentoDesenvolvimento', titulo: 'Treinamento e Desenvolvimento',
    itens: [
      { key: 'periodoFormato', label: 'O período e formato do treinamento inicial foram apresentados (Sala de Aula + prática em loja)?', hint: 'Nos primeiros dias você passará pela Sala de Aula. Após isso, começa a jornada do novo colaborador em loja.' },
      { key: 'obrigatoriedadeMensal', label: 'A obrigatoriedade de treinamentos mensais (presenciais e/ou em plataformas digitais como Twigo) foi explicada?' },
      { key: 'reuniaoGerencialMensal', label: 'Foi mencionado que há 1 reunião gerencial mensal?', hint: 'Nessas reuniões você precisará chegar de 1 a 2 horas antes do horário normal. Esse tempo é contabilizado no banco de horas ou pago no fechamento mensal.' },
      { key: 'desenvolvimentoContinuo', label: 'A importância do desenvolvimento contínuo e da postura proativa na aprendizagem foi reforçada?' }
    ]
  };
  const UNIFORME_LEVIS = {
    key: 'uniformeApresentacao', titulo: 'Uniforme e Apresentação Pessoal',
    itens: [
      { key: 'uniformeApresentado', label: 'O uniforme foi apresentado? Será entregue nos primeiros dias de trabalho?', hint: 'O uniforme é fornecido pela empresa. Você o receberá nos seus primeiros dias.' },
      { key: 'responsabilidadeUniforme', label: 'Foi explicado que o uniforme é de responsabilidade do colaborador?', hint: 'O uniforme é descontado apenas em caso de dano fora do normal ou se não for devolvido no desligamento. No uso cotidiano normal, não há desconto.' },
      { key: 'asseioPessoal', label: 'Os padrões de asseio pessoal e cuidado com a imagem foram explicados?', hint: 'Por trabalharmos com uma marca líder de mercado, esperamos que nossa equipe reflita a proposta da marca.' }
    ]
  };
  const REMUNERACAO_PADRAO = {
    key: 'remuneracaoBeneficios', titulo: 'Remuneração e Benefícios',
    itens: [
      { key: 'remuneracaoExplicada', label: 'A remuneração foi explicada?' },
      { key: 'pisoCategoria', label: 'O piso da categoria (salário mínimo garantido) foi informado?' },
      { key: 'premiacoesIncentivo', label: 'As premiações e políticas de incentivo, após os 3 meses, foram detalhadas?' },
      { key: 'adiantamentoSalarial', label: 'Foi explicado o adiantamento salarial após 3 meses?', hint: 'Após o período de experiência, até o dia 20 de cada mês você vai receber um adiantamento do salário. É normal — é uma prática da empresa. O saldo restante cai no fechamento do mês.' },
      { key: 'valeTransporte', label: 'A política de Vale-Transporte foi apresentada (desconto de 6% conforme CLT)?', hint: 'Vale a pena saber: o desconto do VT é de 6% do seu salário, conforme a lei. Se você mora perto ou vai de bicicleta, pode optar por não pedir o benefício.' },
      { key: 'indicadoresDesempenho', label: 'Os principais indicadores de desempenho foram mencionados (Ticket Médio, Taxa de Conversão, Fluxo, PA, etc)?' },
      { key: 'indicadoresMarca', label: 'Foi explicado que há indicadores específicos da marca que o candidato aprenderá no treinamento inicial (Onboarding)?' }
    ]
  };
  const REMUNERACAO_VENDEDOR = {
    key: 'remuneracaoBeneficios', titulo: 'Remuneração e Benefícios',
    itens: [
      { key: 'remuneracaoExplicada', label: 'A remuneração foi explicada?', hint: 'Você recebe 100% comissionado sobre suas vendas, com um piso salarial mínimo garantido pela categoria. Funciona assim: você receberá o maior valor entre a comissão gerada pelas suas vendas ou o salário base estabelecido para sua função. Se suas comissões ultrapassarem o valor base, você recebe 100% do comissionado. Caso não atinja esse valor, a empresa garante o pagamento do salário mínimo da categoria.' },
      { key: 'pisoCategoria', label: 'O piso da categoria (salário mínimo garantido) foi informado?' },
      { key: 'metasSemanais', label: 'As metas semanais foram explicadas (ciclo domingo a sábado)?', hint: 'Nossas metas são semanais — começam no domingo e terminam no sábado. Isso significa que você tem aproximadamente 4-5 oportunidades por mês de bater suas metas e ganhar o máximo.' },
      { key: 'premiacoesIncentivo', label: 'As premiações e políticas de incentivo, após os 3 meses, foram detalhadas?' },
      { key: 'adiantamentoSalarial', label: 'Foi explicado o adiantamento salarial após 3 meses?', hint: 'Após o período de experiência, até o dia 20 de cada mês você vai receber um adiantamento do salário. É normal — é uma prática da empresa. O saldo restante cai no fechamento do mês.' },
      { key: 'valeTransporte', label: 'A política de Vale-Transporte foi apresentada (desconto de 6% conforme CLT)?', hint: 'Vale a pena saber: o desconto do VT é de 6% do seu salário, conforme a lei. Se você mora perto ou vai de bicicleta, pode optar por não pedir o benefício.' },
      { key: 'indicadoresDesempenho', label: 'Os principais indicadores de desempenho foram mencionados (Ticket Médio, Taxa de Conversão, Fluxo, PA, etc)?' },
      { key: 'indicadoresMarca', label: 'Foi explicado que há indicadores específicos da marca que o candidato aprenderá no treinamento inicial (Onboarding)?' }
    ]
  };

  const ESCOPO_POR_GRUPO = {
    'Auxiliar de Loja': {
      key: 'escopoResponsabilidades', titulo: 'Escopo e Responsabilidades do Cargo',
      itens: [
        { key: 'principaisResponsabilidades', label: 'As principais responsabilidades do cargo de Auxiliar de Loja foram apresentadas de forma clara?' },
        { key: 'tarefasPraticas', label: 'Foram explicadas as tarefas práticas e rotinas operacionais do cargo, como abastecimento de PDV, organização de prateleiras, organização da loja, recebimento e conferência de mercadorias?' },
        { key: 'atendimentoCliente', label: 'Foi informado que o cargo realiza atendimento ao cliente sempre que necessário?' },
        { key: 'rotinasEstoque', label: 'Foram explicadas as rotinas, como organização do estoque, controle de validade, separação de produtos e tratamento de devoluções, quando aplicável?' },
        { key: 'limpezaConservacao', label: 'Foi informado que o cargo abrange, de forma contínua e obrigatória para todos os colaboradores, atividades de organização, limpeza e conservação do ambiente e dos equipamentos, conforme a rotina da loja?' },
        { key: 'transferenciaUnidade', label: 'Foi informado que, por se tratar de uma rede com várias lojas, pode haver necessidade de atuação temporária ou transferência para outra unidade, mediante aviso prévio?' }
      ]
    },
    'Vendedor(a)': {
      key: 'escopoResponsabilidades', titulo: 'Escopo e Responsabilidades do Cargo',
      itens: [
        { key: 'principaisResponsabilidades', label: 'As principais responsabilidades do cargo de Vendedor(a) foram apresentadas de forma clara?' },
        { key: 'tarefasPraticas', label: 'Foram explicadas as tarefas práticas e rotinas operacionais do cargo, como organização da loja, reposição, ajuste de preço, organização de estoque e apoio à loja?' },
        { key: 'padraoAtendimentoLiveInLevis', label: 'O Padrão de Atendimento ao Cliente foi apresentado?', hint: 'Mencionar o modelo "Live in Levi\'s®": explicar que é o modelo de atendimento e excelência da Levi\'s, estruturado em quatro etapas: Dar as boas-vindas, Engajar, Estilizar e Agradecer, e que o colaborador será treinado para atuar conforme esse padrão.' },
        { key: 'recebimentoMercadorias', label: 'Foi informado que o cargo realiza o recebimento de mercadorias sempre que necessário?' },
        { key: 'limpezaConservacao', label: 'Foi informado que o cargo abrange, de forma contínua e obrigatória para todos os colaboradores, atividades de organização, limpeza e conservação do ambiente e dos equipamentos, conforme a rotina da loja?' },
        { key: 'condicaoSaude', label: 'Foi confirmado se há alguma condição de saúde, alergia ou restrição que possa impedir o cumprimento dos padrões de apresentação pessoal exigidos para a função, incluindo o uso de maquiagem, quando aplicável?' },
        { key: 'transferenciaUnidade', label: 'Foi informado que, por se tratar de uma rede com várias lojas, pode haver necessidade de atuação temporária ou transferência para outra unidade, mediante aviso prévio?' }
      ]
    },
    'Caixa': {
      key: 'escopoResponsabilidades', titulo: 'Escopo e Responsabilidades do Cargo',
      itens: [
        { key: 'principaisResponsabilidades', label: 'As principais responsabilidades do cargo de Caixa foram apresentadas de forma clara?' },
        { key: 'rotinasCaixa', label: 'Foram explicadas as rotinas da função relacionadas à operação de caixa/PDV e ao atendimento ao cliente?' },
        { key: 'atividadesComplementares', label: 'Foi informado que o cargo pode realizar atividades operacionais complementares à rotina da loja, incluindo atendimento ao cliente e recebimento de mercadorias sempre que necessário?' },
        { key: 'limpezaConservacao', label: 'Foi informado que o cargo abrange, de forma contínua e obrigatória, atividades de organização, limpeza e conservação do ambiente e dos equipamentos, conforme a rotina da loja?' },
        { key: 'padraoAtendimentoLiveInLevis', label: 'O Padrão de Atendimento ao Cliente foi apresentado?', hint: 'Mencionar o modelo "Live in Levi\'s®": explicar que é o modelo de atendimento e excelência da Levi\'s, estruturado em quatro etapas: Dar as boas-vindas, Engajar, Estilizar e Agradecer, e que o colaborador será treinado para atuar conforme esse padrão.' },
        { key: 'condicaoSaude', label: 'Foi confirmado se há alguma condição de saúde, alergia ou restrição que possa impedir o cumprimento dos padrões de apresentação pessoal exigidos para a função, incluindo o uso de maquiagem, quando aplicável?' },
        { key: 'transferenciaUnidade', label: 'Foi informado que, por se tratar de uma rede com várias lojas, pode haver necessidade de atuação temporária ou transferência para outra unidade, mediante aviso prévio?' }
      ]
    },
    [GRUPO_LIDERANCA]: {
      key: 'escopoResponsabilidades', titulo: 'Escopo e Responsabilidades do Cargo',
      itens: [
        { key: 'principaisResponsabilidades', label: 'As principais responsabilidades do cargo de liderança foram apresentadas de forma clara?' },
        { key: 'gestaoEquipe', label: 'Foram apresentadas as responsabilidades relacionadas à gestão de equipe, acompanhamento de escala, orientação do time e suporte à rotina da loja?' },
        { key: 'aberturaFechamento', label: 'Foram explicadas as responsabilidades relacionadas à abertura e fechamento da loja, quando aplicável?' },
        { key: 'gestaoEstoque', label: 'Foram apresentadas as responsabilidades relacionadas à gestão de estoque e acompanhamento dos processos operacionais, quando aplicável?' },
        { key: 'acompanhamentoIndicadores', label: 'Foram apresentadas as responsabilidades relacionadas ao acompanhamento de indicadores e resultados da loja?' },
        { key: 'onboardingLideranca', label: 'Foi explicado o processo de onboarding / integração para a posição de liderança, quando aplicável?' },
        { key: 'transferenciaUnidade', label: 'Foi informado que, por se tratar de uma rede com várias lojas, pode haver necessidade de atuação temporária ou transferência para outra unidade, mediante aviso prévio?' }
      ]
    }
  };

  window.HUB_PARECER_MODELOS = window.HUB_PARECER_MODELOS || {};
  window.HUB_PARECER_MODELOS.levis = {
    id: 'levis', nome: "Levi's",
    gestores: GESTORES, recrutadores: C.RECRUTADORES,
    cargos: CARGOS,
    localizacao: { tipo: 'loja_simples', lojas: LOJAS, labelLocal: "Para qual Loja Levi's?" },
    grupos: GRUPOS,
    cargoParaGrupoDefault: cargo => {
      if (cargo === 'Auxiliar de Loja' || cargo === 'Vendedor(a)' || cargo === 'Caixa') return cargo;
      if (['Vendedor(a) Responsável', 'Coordenador(a) de Loja', 'Gerente de Loja', 'Supervisor(a) de Vendas'].includes(cargo)) return GRUPO_LIDERANCA;
      return null; // Jovem Aprendiz — sem grupo definido no formulário original.
    },
    avaliacaoComportamental: C.AVALIACAO_COMPORTAMENTAL,
    topicosPorGrupo: {
      'Auxiliar de Loja': [VD.BLOCO_JORNADA_VD, ESCOPO_POR_GRUPO['Auxiliar de Loja'], REMUNERACAO_PADRAO, TREINAMENTO_LEVIS, VD.BLOCO_ROTINA_VD, UNIFORME_LEVIS, C.BLOCO_PROXIMOS_PASSOS],
      'Vendedor(a)': [C.BLOCO_JORNADA_LOJA_B, ESCOPO_POR_GRUPO['Vendedor(a)'], REMUNERACAO_VENDEDOR, TREINAMENTO_LEVIS, VD.BLOCO_ROTINA_VD, UNIFORME_LEVIS, C.BLOCO_PROXIMOS_PASSOS],
      'Caixa': [C.BLOCO_JORNADA_LOJA_B, ESCOPO_POR_GRUPO['Caixa'], REMUNERACAO_PADRAO, TREINAMENTO_LEVIS, VD.BLOCO_ROTINA_VD, UNIFORME_LEVIS, C.BLOCO_PROXIMOS_PASSOS],
      [GRUPO_LIDERANCA]: [C.BLOCO_JORNADA_LOJA_B, ESCOPO_POR_GRUPO[GRUPO_LIDERANCA], REMUNERACAO_PADRAO, TREINAMENTO_LEVIS, VD.BLOCO_ROTINA_VD, UNIFORME_LEVIS, C.BLOCO_PROXIMOS_PASSOS]
    }
  };
})();
