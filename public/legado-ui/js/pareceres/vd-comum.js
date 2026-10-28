// Compartilhado pelos 3 modelos "O Boticário VD" (ER, Campo, Logística):
// a árvore Regional → ER (idêntica nos 3 PDFs) e os blocos de tópicos que
// saem com o texto idêntico em qualquer cargo dessas 3 famílias (Jornada,
// Rotina operacional). Escopo/Remuneração/Treinamento/Uniforme variam por
// cargo e ficam em cada modelo-boticario-vd-*.js.
(function () {
  const GESTORES_VD = ['Amanda Aparecida Gabriel Pifano', 'Ana Patricia Martins da Silva', 'Andriely Marise dos Reis Avelino', 'Bruno Guimarães Batista', 'Caio Cesar Magalhães Dos Santos', 'Claudia Beatriz Borba De Oliveira', 'Dara Santana de Matos', 'Elisa Carvalho Paixão', 'Elyezer Lempke Kelmer Costa', 'Fabrício Paulino de Oliveira', 'Frederico Vizani', 'Guilherme André De Andrade Carvalho', 'Jose Mauricio Claudino Machado', 'Jymmi Bonutti Barbosa Donadio', 'Louise Guedes Coelho', 'Luanna Alves Barreto Guimarães', 'Monique Cestaro Herculano', 'Priscilla Pereira Batista', 'Rayane Apolinário dos Santos', 'Regilane Madeira De Moraes', 'Simone Bastos Lisboa Chagas', 'Vanessa Regazio Gabry', 'Yara Corrêa Dias'];

  // Regional -> lista de ER. Idêntico nos 3 PDFs (VD ER / VD Campo / VD Logística).
  const REGIONAIS_ER = {
    'Boticário VD - Interior de MG': ['O Boticário VD Aimorés (MG)', 'O Boticário VD Manhuaçu (MG)', 'O Boticário VD Carangola (MG)', 'O Boticário VD Caratinga (MG)', 'O Boticário VD Santos Dumont (MG)', 'O Boticário VD Raul Soares (MG)', 'O Boticário VD Leopoldina (MG)', 'O Boticário VD Além Paraíba (MG)'],
    'Boticário VD - Juiz de Fora': ['O Boticário VD Sorrento Centro', 'O Boticário VD Sorrento Benfica'],
    'Boticário VD - Rio de Janeiro': ['O Boticário VD Madureira'],
    'Boticário VD - São Gonçalo': ['O Boticário VD Alcântara', 'O Boticário VD Partage'],
    'Boticário VD - Três Rios': ['O Boticário VD Liva']
  };

  const BLOCO_JORNADA_VD = {
    key: 'jornadaEscalas', titulo: 'Jornada de Trabalho e Escalas',
    itens: [
      { key: 'jornadaApresentada', label: 'A jornada e escala de trabalho foram apresentadas?', hint: 'Inclui: qual a carga horária semanal, quais dias de trabalho e dias de folga.' },
      { key: 'regrasFeriados', label: 'As regras sobre feriados foram explicadas?', hint: 'Inclui: feriado trabalhado é remunerado com adicional + folga compensatória.' },
      { key: 'intervalos', label: 'Foram esclarecidas ao candidato as regras relativas ao intervalo intrajornada (1h de descanso/almoço), ao intervalo interjornada (11h entre jornadas) e ao limite de horas extras diárias (até 2h por dia) conforme prática da regional ou legislação vigente?' },
      { key: 'registroPonto', label: 'O funcionamento do registro de ponto foi explicado?', hint: 'Importante: o colaborador só bate ponto quando estiver apto a trabalhar (uniformizado, pronto para atendimento).' },
      { key: 'bancoHoras', label: 'A compensação do banco de horas foi explicada, com ênfase na necessidade de autorização do(a) gestor(a) para sua utilização?' },
      { key: 'cronogramaNovoColaborador', label: 'Foi explicado o cronograma da Jornada do Novo Colaborador (orientação para acompanhar as comunicações após a admissão)?', hint: 'Após a admissão, você receberá por e-mail todas as informações sobre as próximas etapas da Jornada do Novo Colaborador. Por isso, é importante acompanhar sua caixa de entrada regularmente.' }
    ]
  };

  const BLOCO_ROTINA_VD = {
    key: 'rotinaOperacional', titulo: 'Rotina operacional e assiduidade',
    itens: [
      { key: 'assiduidadePontualidade', label: 'A importância de assiduidade e pontualidade foi reforçada?' },
      { key: 'segurancaOperacional', label: 'Os procedimentos de segurança operacional foram mencionados (ex: bolsa, normas internas)?', hint: 'Consultar DP/Jurídico para orientações específicas sobre como apresentar este ponto.' }
    ]
  };

  // Remuneração/Treinamento/Uniforme saem com o texto idêntico em quase
  // todos os cargos das 3 famílias VD (ER/Campo/Logística) — só Auxiliar de
  // Loja (Logística) e Atendente de Bases (Campo) têm pequenas variações
  // pontuais, tratadas nos próprios arquivos de modelo.
  function remuneracaoVdPadrao(indicadoresHint) {
    return {
      key: 'remuneracaoBeneficios', titulo: 'Remuneração e Benefícios',
      itens: [
        { key: 'composicaoSalarial', label: 'A composição salarial foi explicada: valor base + componente variável/premiação por performance?', hint: 'Seu salário tem uma parte fixa de base, acrescida de premiação variável conforme sua performance nas metas.' },
        { key: 'valorBaseCategoria', label: 'O valor base da categoria (salário mínimo garantido) foi informado?' },
        { key: 'premiacoesIncentivo', label: 'As premiações e políticas de incentivo, após os 3 meses, foram detalhadas?' },
        { key: 'adiantamentoSalarial', label: 'Foi explicado o adiantamento salarial após 3 meses?', hint: 'Após o período de experiência, até o dia 20 de cada mês você vai receber um adiantamento do salário. É normal — é uma prática da empresa. O saldo restante cai no fechamento do mês.' },
        { key: 'valeTransporte', label: 'A política de Vale-Transporte foi apresentada (desconto de 6% conforme CLT)?', hint: 'Vale a pena saber: o desconto do VT é de 6% do seu salário, conforme a lei. Se você mora perto ou vai de bicicleta, pode optar por não pedir o benefício.' },
        { key: 'indicadoresIAF', label: indicadoresHint || 'Os principais indicadores de desempenho foram mencionados (IAF)?' },
        { key: 'indicadoresMarca', label: 'Foi explicado que há indicadores específicos da marca que o candidato aprenderá no treinamento inicial (Onboarding)?' }
      ]
    };
  }
  const TREINAMENTO_VD_PADRAO = {
    key: 'treinamentoDesenvolvimento', titulo: 'Treinamento e Desenvolvimento',
    itens: [
      { key: 'periodoFormato', label: 'O período e formato do treinamento inicial foram apresentados (Sala de Aula + prática no ER)?', hint: 'Nos primeiros dias você passará pela Sala de Aula. Após isso, começa a jornada do novo colaborador no ER.' },
      { key: 'obrigatoriedadeMensal', label: 'A obrigatoriedade de treinamentos mensais (presenciais e plataformas digitais como Unibê e Twigo) foi explicada?' },
      { key: 'cicloReuniaoGerencial', label: 'Foi mencionado que há 1 treinamento de ciclo por mês e 1 reunião gerencial mensal?', hint: 'Em pelo menos um desses eventos você precisará chegar de 1 a 2 horas antes do horário normal. Esse tempo é contabilizado no banco de horas ou pago no fechamento mensal.' },
      { key: 'encontrosCiclo', label: 'Os encontros de ciclo e o deslocamento envolvido foram explicados (ex: Madureira, Estácio)?', hint: 'Os treinamentos acontecem em locais específicos — às vezes fora da sua loja. Isso faz parte da nossa rotina e é importante que você esteja disponível para participar.' },
      { key: 'desenvolvimentoContinuo', label: 'A importância do desenvolvimento contínuo e da postura proativa na aprendizagem foi reforçada?' }
    ]
  };
  const UNIFORME_VD_PADRAO = {
    key: 'uniformeApresentacao', titulo: 'Uniforme e Apresentação Pessoal',
    itens: [
      { key: 'uniformeApresentado', label: 'O uniforme foi apresentado: será entregue nos primeiros dias de trabalho?', hint: 'O uniforme é fornecido pela empresa. Você o receberá nos seus primeiros dias.' },
      { key: 'responsabilidadeUniforme', label: 'Foi explicado que o uniforme é de responsabilidade do colaborador?', hint: 'O uniforme é descontado apenas em caso de dano fora do normal ou se não for devolvido no desligamento. No uso cotidiano normal, não há desconto.' },
      { key: 'asseioPessoal', label: 'Os padrões de asseio pessoal e cuidado com a imagem foram explicados?', hint: 'Por trabalharmos com cosméticos, esperamos que nossa equipe reflita a proposta da marca: cuidado, beleza e bem-estar.' },
      { key: 'condicaoSaude', label: 'Foi confirmado se há alguma condição de saúde, alergia ou restrição que possa impedir o cumprimento dos padrões de apresentação pessoal exigidos, incluindo o uso de maquiagem, quando aplicável?' },
      { key: 'papelRepresentante', label: 'O papel do colaborador como representante da marca O Boticário foi reforçado?' }
    ]
  };

  window.HUB_PARECER_VD_COMUM = { GESTORES_VD, REGIONAIS_ER, BLOCO_JORNADA_VD, BLOCO_ROTINA_VD, remuneracaoVdPadrao, TREINAMENTO_VD_PADRAO, UNIFORME_VD_PADRAO };
})();
