// Modelo "O Boticário — Loja": Auxiliar de Loja, Consultor(a) de Vendas,
// Consultor(a) Responsável, Gerente de Loja, Supervisor(a) de Vendas
// Regional - Loja, Jovem Aprendiz.
//
// Nota sobre a árvore Regional -> Loja: no PDF original, "O Boticário
// Halfeld" aparece listado tanto em "Interior de Minas" quanto em "Juiz de
// Fora" (mesmo artefato de exportação já visto no formulário de Visita em
// Loja — texto de página duplicado no PDF). Como a Rua Halfeld é referência
// conhecida de Juiz de Fora, mantive a loja só ali; vale confirmar.
(function () {
  const C = HUB_PARECER_COMUM;
  const VD = HUB_PARECER_VD_COMUM;

  // Variante de Jornada usada nos grupos Consultor de Vendas/Liderança —
  // igual à HUB_PARECER_COMUM.BLOCO_JORNADA_LOJA_B, exceto que aqui a escala
  // é citada só como "(6x1)", sem a alternativa "ou 5x2".
  const BLOCO_JORNADA_CONSULTOR = {
    key: 'jornadaEscalas', titulo: 'Jornada de Trabalho e Escalas',
    itens: [
      { key: 'jornadaPadrao', label: 'A jornada de trabalho padrão foi apresentada (carga horária e dias da semana)?' },
      { key: 'escalaTrabalho', label: 'A escala de trabalho (6x1), incluindo finais de semana e feriados, foi explicada claramente?' },
      { key: 'escalaFolgas', label: 'A escala de folgas foi apresentada (quadro de folgas)?', hint: 'Incluir: domingo trabalhado gera folga compensatória; feriado trabalhado é remunerado com adicional + folga.' },
      { key: 'intervalos', label: 'Foram esclarecidas ao candidato as regras relativas ao intervalo intrajornada (1h de descanso/almoço), ao intervalo interjornada (11h entre jornadas) e ao limite de horas extras diárias (até 2h por dia) conforme prática da regional ou legislação vigente?' },
      { key: 'registroPonto', label: 'O funcionamento do registro de ponto foi explicado?', hint: 'Importante: o colaborador só bate ponto quando estiver apto a trabalhar (uniformizado, pronto para atendimento).' },
      { key: 'bancoHoras', label: 'A compensação do banco de horas foi explicada, com ênfase na necessidade de autorização do(a) gestor(a) para sua utilização?' },
      { key: 'cronogramaNovoColaborador', label: 'Foi explicado o cronograma da Jornada do Novo Colaborador (orientação para acompanhar as comunicações após a admissão)?', hint: 'Após a admissão, você receberá por e-mail todas as informações sobre as próximas etapas da Jornada do Novo Colaborador. Por isso, é importante acompanhar sua caixa de entrada regularmente.' }
    ]
  };

  const GESTORES = ['Aline Cristina Da Silva', 'Andrea Pereira de Araujo Dantas', 'Aparecida Maria Batista', 'Breno de Macedo Braz', 'Bruna Caroline Gonçalves', 'Camila Pina Maciel', 'Carla Muniz Gomes', 'Daiane dos Santos Vieira', 'Daniel Abdallah Linhares', 'Daniele Santos De Carvalho', 'Dara Santana de Matos', 'Denise Ferreira Beserra De Oliveira', 'Douglas Pereira Rodrigues Cairo', 'Eduarda Bretas Araujo Reis', 'Érica Cristina da Silva Gimene', 'Gabriela de Fatima Fortes Torres de Souza', 'Gabriele lima de Andrade', 'Gabriella Gomes Machado Oliveira', 'Iandra Cristina Lopes Nunes', 'Jessica Eliezer Da Cruz', 'Juliana Camara Jacinto Cantieri', 'Juliana Oliveira Mafortes', 'Kapyla Deva Andrade de Oliveira', 'Larissa Ruas Gomide', 'Leidinalva Batista Soares', 'Leone Landim Silva', 'Lívia Jéssica Fonseca da Silva', 'Luciana De Azevedo Vieira Franca', 'Luciane Motta Rezende', 'Marcela Rosado de Souza', 'Marcia Alves Batista da Silva', 'Mariana Gomes Correa Radsack Matheus Pires', 'Marlei Gonçalves Curpertino', 'Mirelle Botelho Cutrim', 'Naice Moara Xavier de Mello', 'Nathalia Correa Oliveira', 'Nubia Faria Simão', 'Paola De Oliveira', 'Patricia Baleixo Schall', 'Patrícia Madalena Varela Da Costa', 'Tatiane Bernardino de Oliveira', 'Vanessa Regazio Gabry', 'Vanessa Sousa Ferreira Martins', 'Yara Corrêa Dias'];
  const CARGOS = ['Auxiliar de Loja', 'Consultor(a) de Vendas', 'Consultor(a) Responsável', 'Gerente de Loja', 'Supervisor(a) de Vendas Regional - Loja', 'Jovem Aprendiz'];
  const REGIONAIS = {
    'Boticário - Interior de Minas': ['O Boticário Aimorés (MG)', 'O Boticário Carangola (MG)', 'O Boticário Caratinga Olegário (MG)', 'O Boticário Caratinga Raul (MG)', 'O Boticário Espera Feliz (MG)', 'O Boticário Inhapim (MG)', 'O Boticário Além Paraíba (MG)', 'O Boticário Barroso (MG)', 'O Boticário Carandaí (MG)', 'O Boticário Ipanema (MG)', 'O Boticário Leopoldina (MG)', 'O Boticário Manhuaçu (MG)', 'O Boticário Manhumirim (MG)', 'O Boticário Raul Soares (MG)', 'O Boticário Santos Dumont (MG)'],
    'Boticário - Juiz de Fora': ['O Boticário Marechal', 'O Boticário Jardim Norte', 'O Boticário Independência', 'O Boticário Carrefour Rio Branco', 'O Boticário Alameda', 'O Boticário Mister', 'O Boticário Santa Cruz', 'O Boticário Halfeld'],
    'Boticário - Rio de Janeiro': ['O Boticário Calçadão Madu', 'O Boticário Campinho', 'O Boticário Madureira Shop', 'O Boticário Mercadão', 'O Boticário Norte Shop P1', 'O Boticário Norte Shop P2', 'O Boticário Polo 01', 'O Boticário Sulacap', 'O Boticário Valqueire'],
    'Boticário - São Gonçalo': ['O Boticário Alcântara', 'O Boticário Carrefour', 'O Boticário Guanabara', 'O Boticário Partage', 'O Boticário Rodo', 'O Boticário São Gonçalo Shop'],
    'Boticário - Três Rios': ['O Boticário 3R Galeria', 'O Boticário 3R Quiosque'],
    'Boticário - Valença': ['O Boticário Valença'],
    'Quem disse, Berenice?': ['Quem disse, Berenice? Norte']
  };
  const GRUPO_LIDERANCA = 'Liderança - Consultor (a) Responsável, Gerente e Supervisor(a)';
  const GRUPOS = ['Auxiliar de Loja', 'Consultor de Vendas', GRUPO_LIDERANCA];

  const UNIFORME_PADRAO = {
    key: 'uniformeApresentacao', titulo: 'Uniforme e Apresentação Pessoal',
    itens: [
      { key: 'uniformeApresentado', label: 'O uniforme foi apresentado: será entregue nos primeiros dias de trabalho?', hint: 'O uniforme é fornecido pela empresa. Você o receberá nos seus primeiros dias.' },
      { key: 'responsabilidadeUniforme', label: 'Foi explicado que o uniforme é de responsabilidade do colaborador?', hint: 'O uniforme é descontado apenas em caso de dano fora do normal ou se não for devolvido no desligamento. No uso cotidiano normal, não há desconto.' },
      { key: 'asseioPessoal', label: 'Os padrões de asseio pessoal e cuidado com a imagem foram explicados?', hint: 'Por trabalharmos com cosméticos, esperamos que nossa equipe reflita a proposta da marca: cuidado, beleza e bem-estar.' },
      { key: 'papelRepresentante', label: 'O papel do colaborador como representante da marca O Boticário foi reforçado?' }
    ]
  };
  const TREINAMENTO_AUXILIAR = {
    key: 'treinamentoDesenvolvimento', titulo: 'Treinamento e Desenvolvimento',
    itens: [
      { key: 'periodoFormato', label: 'O período e formato do treinamento inicial foram apresentados (Sala de Aula + prática em loja)?', hint: 'Nos primeiros dias você passará pela Sala de Aula. Após isso, começa a jornada do novo colaborador em loja.' },
      { key: 'obrigatoriedadeMensal', label: 'A obrigatoriedade de treinamentos mensais (presenciais e/ou em plataformas digitais como Unibê e Twigo) foi explicada?' },
      { key: 'encontrosCiclo', label: 'Os encontros de ciclo e o deslocamento envolvido foram explicados (ex: Madureira, Estácio)?', hint: 'Os treinamentos acontecem em locais específicos — às vezes fora da sua loja. Isso faz parte da nossa rotina e é importante que você esteja disponível para participar.' },
      { key: 'desenvolvimentoContinuo', label: 'A importância do desenvolvimento contínuo e da postura proativa na aprendizagem foi reforçada?' }
    ]
  };
  const TREINAMENTO_CONSULTOR = {
    key: 'treinamentoDesenvolvimento', titulo: 'Treinamento e Desenvolvimento',
    itens: [
      { key: 'periodoFormato', label: 'O período e formato do treinamento inicial foram apresentados (Sala de Aula + prática em loja)?', hint: 'Nos primeiros dias você passará pela Sala de Aula. Após isso, começa a jornada do novo colaborador em loja.' },
      { key: 'obrigatoriedadeMensal', label: 'A obrigatoriedade de treinamentos mensais (presenciais e/ou em plataformas digitais como Unibê e Twigo) foi explicada?' },
      { key: 'cicloReuniaoGerencial', label: 'Foi mencionado que há 1 treinamento de ciclo por mês e 1 reunião gerencial mensal?', hint: 'Em pelo menos um desses eventos você precisará chegar de 1 a 2 horas antes do horário normal. Esse tempo é contabilizado no banco de horas ou pago no fechamento mensal.' },
      { key: 'encontrosCiclo', label: 'Os encontros de ciclo e o deslocamento envolvido foram explicados (ex: Madureira, Estácio)?', hint: 'Os treinamentos acontecem em locais específicos — às vezes fora da sua loja. Isso faz parte da nossa rotina e é importante que você esteja disponível para participar.' },
      { key: 'desenvolvimentoContinuo', label: 'A importância do desenvolvimento contínuo e da postura proativa na aprendizagem foi reforçada?' }
    ]
  };
  const REMUNERACAO_AUXILIAR = {
    key: 'remuneracaoBeneficios', titulo: 'Remuneração e Benefícios',
    itens: [
      { key: 'remuneracaoExplicada', label: 'A remuneração foi explicada?' },
      { key: 'pisoCategoria', label: 'O piso da categoria (salário mínimo garantido) foi informado?' },
      { key: 'premiacoesIncentivo', label: 'As premiações e políticas de incentivo, após os 3 meses, foram detalhadas?' },
      { key: 'adiantamentoSalarial', label: 'Foi explicado o adiantamento salarial após 3 meses?', hint: 'Após o período de experiência, até o dia 20 de cada mês você vai receber um adiantamento do salário. É normal — é uma prática da empresa. O saldo restante cai no fechamento do mês.' },
      { key: 'valeTransporte', label: 'A política de Vale-Transporte foi apresentada (desconto de 6% conforme CLT)?', hint: 'Vale a pena saber: o desconto do VT é de 6% do seu salário, conforme a lei. Se você mora perto ou vai de bicicleta, pode optar por não pedir o benefício.' },
      { key: 'indicadoresIAF', label: 'Os principais indicadores de desempenho foram mencionados (IAF)?' },
      { key: 'indicadoresMarca', label: 'Foi explicado que há indicadores específicos da marca que o candidato aprenderá no treinamento inicial (Onboarding)?' }
    ]
  };
  const REMUNERACAO_CONSULTOR = {
    key: 'remuneracaoBeneficios', titulo: 'Remuneração e Benefícios',
    itens: [
      { key: 'composicaoSalarial', label: 'A composição salarial foi explicada: valor base + comissão (percentual sobre vendas) + premiação variável por performance?', hint: 'Seu salário é uma composição: um fixo de base, mais uma comissão sobre as suas vendas, mais uma premiação variável conforme sua performance nas metas.' },
      { key: 'pisoCategoria', label: 'O piso da categoria (salário mínimo garantido) foi informado?', hint: 'Se a sua composição final (base + comissão + premiação) não atingir o piso da categoria da sua regional, a empresa garante esse valor mínimo.' },
      { key: 'metasSemanais', label: 'As metas semanais foram explicadas (ciclo domingo à sábado)?', hint: 'Nossas metas são semanais — começam no domingo e terminam no sábado. Isso significa que você tem aproximadamente 4 oportunidades por mês de bater suas metas e ganhar o máximo.' },
      { key: 'premiacoesIncentivo', label: 'As premiações e políticas de incentivo, após os 3 meses, foram detalhadas?' },
      { key: 'adiantamentoSalarial', label: 'Foi explicado o adiantamento salarial após 3 meses?', hint: 'Após o período de experiência, até o dia 20 de cada mês você vai receber um adiantamento do salário. É normal — é uma prática da empresa. O saldo restante cai no fechamento do mês.' },
      { key: 'valeTransporte', label: 'A política de Vale-Transporte foi apresentada (desconto de 6% conforme CLT)?', hint: 'Vale a pena saber: o desconto do VT é de 6% do seu salário, conforme a lei. Se você mora perto ou vai de bicicleta, pode optar por não pedir o benefício.' },
      { key: 'indicadoresIAF', label: 'Os principais indicadores de desempenho foram mencionados (IAF)?' },
      { key: 'indicadoresMarca', label: 'Foi explicado que há indicadores específicos da marca que o candidato aprenderá no treinamento inicial (Onboarding)?' },
      { key: 'indicadoresImpactamPremiacao', label: 'Foi esclarecido que os indicadores impactam diretamente a premiação variável?' }
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
    'Consultor de Vendas': {
      key: 'escopoResponsabilidades', titulo: 'Escopo e Responsabilidades do Cargo',
      itens: [
        { key: 'principaisResponsabilidades', label: 'As principais responsabilidades do cargo de Consultor de Vendas(a) foram apresentadas de forma clara?' },
        { key: 'tarefasPraticas', label: 'Foram explicadas as tarefas práticas e rotinas operacionais do cargo, como organização da loja, reposição, ajuste de preço, organização de estoque e apoio à loja?' },
        { key: 'padraoAtendimentoBotileza', label: 'O Padrão de Atendimento ao Cliente foi apresentado através do Vídeo/Guia Botileza?', hint: 'Mencionar que é o padrão de atendimento e excelência da marca O Boticário, e que o colaborador será treinado nesse padrão.' },
        { key: 'recebimentoMercadorias', label: 'Foi informado que o cargo realiza o recebimento de mercadorias sempre que necessário?' },
        { key: 'limpezaConservacao', label: 'Foi informado que o cargo abrange, de forma contínua e obrigatória para todos os colaboradores, atividades de organização, limpeza e conservação do ambiente e dos equipamentos, conforme a rotina da loja?' },
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
  window.HUB_PARECER_MODELOS.boticario_loja = {
    id: 'boticario_loja', nome: 'O Boticário — Loja',
    gestores: GESTORES, recrutadores: C.RECRUTADORES,
    cargos: CARGOS,
    localizacao: { tipo: 'regional_loja', regionais: REGIONAIS, labelRegional: 'Para qual a Regional?', labelLocal: 'Para qual loja' },
    grupos: GRUPOS,
    cargoParaGrupoDefault: cargo => {
      if (cargo === 'Auxiliar de Loja') return cargo;
      if (cargo === 'Consultor(a) de Vendas') return 'Consultor de Vendas';
      if (['Consultor(a) Responsável', 'Gerente de Loja', 'Supervisor(a) de Vendas Regional - Loja'].includes(cargo)) return GRUPO_LIDERANCA;
      return null; // Jovem Aprendiz — sem grupo definido no formulário original.
    },
    avaliacaoComportamental: C.AVALIACAO_COMPORTAMENTAL,
    // Este modelo não tem bloco "Rotina operacional e assiduidade" em
    // nenhum grupo — confirmado ausente no PDF original (único entre os 6).
    topicosPorGrupo: {
      'Auxiliar de Loja': [VD.BLOCO_JORNADA_VD, ESCOPO_POR_GRUPO['Auxiliar de Loja'], REMUNERACAO_AUXILIAR, TREINAMENTO_AUXILIAR, UNIFORME_PADRAO, C.BLOCO_PROXIMOS_PASSOS],
      'Consultor de Vendas': [BLOCO_JORNADA_CONSULTOR, ESCOPO_POR_GRUPO['Consultor de Vendas'], REMUNERACAO_CONSULTOR, TREINAMENTO_CONSULTOR, UNIFORME_PADRAO, C.BLOCO_PROXIMOS_PASSOS],
      [GRUPO_LIDERANCA]: [BLOCO_JORNADA_CONSULTOR, ESCOPO_POR_GRUPO[GRUPO_LIDERANCA], REMUNERACAO_CONSULTOR, TREINAMENTO_CONSULTOR, UNIFORME_PADRAO, C.BLOCO_PROXIMOS_PASSOS]
    }
  };
})();
