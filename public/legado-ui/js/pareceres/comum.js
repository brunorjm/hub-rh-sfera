// Trechos idênticos (byte-a-byte, no PDF original) entre os 6 modelos de
// parecer do gestor: lista de recrutadores, bloco "Avaliação Comportamental",
// bloco final "Próximos passos e fechamento da entrevista" e as opções de
// nível de recomendação / parecer final. Cada arquivo modelo-*.js referencia
// isto em vez de duplicar o texto — reduz o risco de divergência entre
// modelos que deveriam dizer exatamente a mesma coisa.
(function () {
  const RECRUTADORES = ['Carla Maria', 'Gabriele Silva', 'Jamille Macedo', 'Juliana Caldeira', 'Naony Souza', 'Monique Martins', 'Naidylene Nepomuceno', 'Julia Ramo', 'Noemi Cerqueira', 'Paulo Silva', 'Leonardo Neves'];

  // As 3 seções de "Avaliação Comportamental" — cada item é Positivo/Atenção.
  // Idêntico nos 6 PDFs.
  const AVALIACAO_COMPORTAMENTAL = [
    {
      key: 'apresentacaoComunicacao', titulo: 'Apresentação e Comunicação',
      itens: [
        { key: 'apresentacaoPessoal', label: 'Compareceu com apresentação pessoal adequada, demonstrando cuidado com postura, vestimenta e higiene?' },
        { key: 'clarezaObjetividade', label: 'Expressou-se com clareza e objetividade durante a comunicação verbal?' },
        { key: 'vocabulario', label: 'Utilizou vocabulário compatível com o ambiente profissional?' },
        { key: 'vicioLinguagem', label: 'Demonstrou ausência de vícios de linguagem ou dificuldades relevantes de dicção?' },
        { key: 'comunicacaoFluida', label: 'Estabeleceu uma comunicação fluida, mantendo postura respeitosa e adequada ao longo da entrevista?' }
      ]
    },
    {
      key: 'motivacaoEnergia', titulo: 'Motivação e Energia',
      itens: [
        { key: 'entusiasmo', label: 'Demonstrou entusiasmo e interesse genuíno pela vaga?' },
        { key: 'proatividade', label: 'Apresentou proatividade e dinamismo durante a entrevista?' },
        { key: 'disponibilidade', label: 'Indicou disponibilidade compatível com a rotina apresentada, incluindo escalas aos finais de semana, domingos, reuniões e treinamentos?' }
      ]
    },
    {
      key: 'experienciaAderencia', titulo: 'Experiência e Aderência ao Cargo',
      itens: [
        { key: 'experienciaMetas', label: 'Possui experiência prévia com metas e indicadores de performance (comercial)?' },
        { key: 'familiaridadeVarejo', label: 'Demonstra familiaridade com o ambiente de varejo e atendimento ao cliente?' },
        { key: 'remuneracaoVariavel', label: 'Apresenta receptividade ao modelo de remuneração variável e ao trabalho com metas?' },
        { key: 'rotinaOperacionalCompleta', label: 'Compreende e demonstra abertura para a rotina operacional completa, incluindo atividades como limpeza e organização de estoque/loja?' },
        { key: 'perfilAlinhado', label: 'Apresenta experiência e perfil alinhados às exigências do cargo, bem como à cultura e aos valores da empresa?' }
      ]
    }
  ];

  // Bloco final de cada checklist por cargo — idêntico nos 6 PDFs.
  const BLOCO_PROXIMOS_PASSOS = {
    key: 'proximosPassos', titulo: 'Sobre próximos passos e fechamento da entrevista, foi informado sobre:',
    itens: [
      { key: 'duvidasRespondidas', label: 'As dúvidas do candidato foram respondidas ao longo da entrevista?' },
      { key: 'entendimentoValidado', label: 'O entendimento do candidato sobre jornada, rotina, remuneração e expectativas da função foi validado?' },
      { key: 'proximosPassosComunicados', label: 'Os próximos passos do processo seletivo foram comunicados claramente?', hint: 'Gestor: até 48h para avaliação ao RH | RH: até 72h para retorno ao candidato = total de até 5 dias úteis.' },
      { key: 'formaDeContato', label: 'Foi informado que, se aprovado(a), o RH entrará em contato por telefone; se não avançar, o candidato receberá e-mail?' }
    ]
  };

  const NIVEIS_RECOMENDACAO = [
    { valor: 1, estrelas: '⭐', label: 'Não recomendo a contratação.', desc: 'O candidato não demonstrou aderência suficiente aos requisitos da posição.' },
    { valor: 2, estrelas: '⭐⭐', label: 'Recomendo com muitas ressalvas.', desc: 'O candidato apresenta lacunas relevantes que podem comprometer seu desempenho na função.' },
    { valor: 3, estrelas: '⭐⭐⭐', label: 'Recomendo a contratação.', desc: 'O candidato atende à maior parte dos requisitos e demonstra potencial para desempenhar a função com sucesso.' },
    { valor: 4, estrelas: '⭐⭐⭐⭐', label: 'Recomendo fortemente a contratação.', desc: 'O candidato apresenta alta aderência aos requisitos da vaga e forte potencial de sucesso na posição.' }
  ];

  const PARECER_FINAL_OPCOES = ['Aprovado(a) - Avançar no processo', 'Aprovado(a) - Banco de Talentos', 'Aprovado(a) - Indicação para outra filial', 'Reprovado(a) - Não avançar no processo'];

  // Variante de "Jornada de Trabalho e Escalas" usada nos grupos
  // Vendedor(a)/Caixa/Liderança de Hering, Levi's e O Boticário Loja (a
  // variante "Auxiliar" desses 3 modelos é idêntica a
  // HUB_PARECER_VD_COMUM.BLOCO_JORNADA_VD, então é reaproveitada de lá).
  const BLOCO_JORNADA_LOJA_B = {
    key: 'jornadaEscalas', titulo: 'Jornada de Trabalho e Escalas',
    itens: [
      { key: 'jornadaPadrao', label: 'A jornada de trabalho padrão foi apresentada (carga horária e dias da semana)?' },
      { key: 'escalaTrabalho', label: 'A escala de trabalho (6x1 ou 5x2), incluindo finais de semana e feriados, foi explicada claramente?' },
      { key: 'escalaFolgas', label: 'A escala de folgas foi apresentada (quadro de folgas)?', hint: 'Incluir: domingo trabalhado gera folga compensatória; feriado trabalhado é remunerado com adicional + folga.' },
      { key: 'intervalos', label: 'Foram esclarecidas ao candidato as regras relativas ao intervalo intrajornada (1h de descanso/almoço), ao intervalo interjornada (11h entre jornadas) e ao limite de horas extras diárias (até 2h por dia) conforme prática da regional ou legislação vigente?' },
      { key: 'registroPonto', label: 'O funcionamento do registro de ponto foi explicado?', hint: 'Importante: o colaborador só bate ponto quando estiver apto a trabalhar (uniformizado, pronto para atendimento).' },
      { key: 'bancoHoras', label: 'A compensação do banco de horas foi explicada, com ênfase na necessidade de autorização do(a) gestor(a) para sua utilização?' },
      { key: 'cronogramaNovoColaborador', label: 'Foi explicado o cronograma da Jornada do Novo Colaborador (orientação para acompanhar as comunicações após a admissão)?', hint: 'Após a admissão, você receberá por e-mail todas as informações sobre as próximas etapas da Jornada do Novo Colaborador. Por isso, é importante acompanhar sua caixa de entrada regularmente.' }
    ]
  };

  window.HUB_PARECER_COMUM = { RECRUTADORES, AVALIACAO_COMPORTAMENTAL, BLOCO_PROXIMOS_PASSOS, NIVEIS_RECOMENDACAO, PARECER_FINAL_OPCOES, BLOCO_JORNADA_LOJA_B };
})();
