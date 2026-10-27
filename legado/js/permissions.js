// Catálogo único de permissões do Hub Sfera. Cada item vira: (1) um checkbox
// na tela Administração → Cadastro de Acessos, (2) um item de navegação na
// barra lateral (só aparece se HUB_USER.permissoes[key] === true), (3) a
// chave lida por has_permission(key) nas policies de RLS do Supabase — os
// três lugares têm que usar exatamente as mesmas strings.
(function () {
  // Agrupado em 3 blocos, na ordem em que aparecem na barra lateral e no
  // formulário de cadastro de acessos.
  const CATALOG = [
    {
      group: 'indicadores', groupLabel: 'Indicadores', icon: '&#128202;',
      items: [
        { key: 'indicadores.headcount', label: 'Headcount (sem a permissão abaixo: só a própria pessoa e a equipe abaixo dela, também nos números de headcount do Dashboard)' },
        { key: 'indicadores.headcount_completo', label: 'Headcount — ver todos os colaboradores' },
        { key: 'indicadores.organograma', label: 'Organograma (sem a permissão abaixo: só o próprio galho, da liderança acima até a equipe abaixo)' },
        { key: 'indicadores.organograma_completo', label: 'Organograma — ver a estrutura completa da empresa' },
        { key: 'indicadores.recrutamento', label: 'Recrutamento' },
        { key: 'indicadores.rotatividade', label: 'Rotatividade' },
        { key: 'indicadores.experiencia', label: 'Avaliação da Experiência' },
        { key: 'indicadores.desligamento', label: 'Entrevistas de Desligamento' },
        { key: 'indicadores.controle_desligamento', label: 'Controle de Desligamento (Dados Sigilosos)' },
        { key: 'indicadores.feedbacks', label: 'Feedbacks' },
        { key: 'indicadores.oneonone', label: '1:1' },
        { key: 'indicadores.treinamentos', label: 'Treinamentos' },
        { key: 'indicadores.celebracoes', label: 'Celebrações' },
        { key: 'indicadores.pesquisa_clima', label: 'Pesquisa de Clima — resultados e comentários (Dados Sigilosos)' },
        { key: 'indicadores.engajamento', label: 'Pesquisa de Engajamento — índice de participação por unidade e departamento' },
        { key: 'indicadores.boletim', label: 'Boletim da Liderança — indicadores mensais por operação, textos e fechamento do mês (só Administrador; sem ela, o Dashboard mostra os números publicados da operação da pessoa)' },
        { key: 'indicadores.satisfacao', label: 'Pesquisa de Satisfação — notas e comentários das áreas do Escritório (Dados Sigilosos: vê só as áreas marcadas em "Áreas da Pesquisa de Satisfação", e só o total de cada área)' },
        { key: 'indicadores.satisfacao_completo', label: 'Pesquisa de Satisfação — ver todas as áreas, com o recorte por operação e loja (RH/Diretoria)' },
        { key: 'indicadores.fechamento', label: 'Fechamento do Período — apresentação mensal do RH à diretoria, com download em PowerPoint (só Administrador)' },
        { key: 'indicadores.satisfacao_participacao', label: 'Pesquisa de Satisfação — participação de todas as lojas e áreas (Dados Sigilosos: só Administrador)' }
      ]
    },
    {
      group: 'recrutamento', groupLabel: 'Recrutamento', icon: '&#128188;',
      items: [
        { key: 'recrutamento.dashboard', label: 'Dashboard' },
        { key: 'recrutamento.vagas', label: 'Controle de Vagas' },
        { key: 'recrutamento.candidatos', label: 'Candidatos' },
        { key: 'recrutamento.agenda', label: 'Agenda de Entrevistas' },
        { key: 'recrutamento.banco_talentos', label: 'Banco de Talentos' },
        { key: 'recrutamento.aprovacoes', label: 'Aprovações' },
        { key: 'recrutamento.historico', label: 'Histórico' },
        { key: 'recrutamento.transferencia', label: 'Transferência de Vaga' },
        { key: 'recrutamento.parecer_gestor', label: 'Parecer do Gestor' }
      ]
    },
    {
      group: 'treinamento_dev', groupLabel: 'Treinamento e Desenvolvimento', icon: '&#127891;',
      items: [
        { key: 'treinamento_dev.onboarding', label: 'Onboarding' },
        { key: 'treinamento_dev.visita_loja', label: 'Visita em Loja' },
        // Três papéis (14/10/2026, supabase-treinamento-turmas-permissoes.sql): RH geral só lê,
        // gestor de T&D faz tudo, multiplicadora lança e vê só as próprias turmas.
        { key: 'treinamento_dev.turmas', label: 'Turmas e Multiplicadoras — ver todas as turmas (somente leitura)' },
        { key: 'treinamento_dev.turmas_gestor', label: 'Turmas e Multiplicadoras — gestor de T&D (vê, edita e exclui todas as turmas, valida justificativas, pede ajustes, altera mês fechado)' },
        { key: 'treinamento_dev.turmas_lancar', label: 'Turmas e Multiplicadoras — multiplicadora (lança e vê só as próprias turmas; edita até o mês ser fechado; não exclui)' }
      ]
    },
    {
      group: 'administracao', groupLabel: 'Administração', icon: '&#9881;&#65039;',
      items: [
        { key: 'admin.upload', label: 'Upload de Planilhas (Indicadores)' },
        { key: 'admin.cadastros_recrutamento', label: 'Cadastros do Recrutamento' },
        { key: 'admin.usuarios', label: 'Cadastro de Acessos' },
        { key: 'admin.log_acessos', label: 'Log de Acessos — quem entrou no Hub, quando e quais módulos abriu (só Administrador)' }
      ]
    }
  ];

  CATALOG.splice(1,0,{group:'desenvolvimento_organizacional',groupLabel:'Desenvolvimento Organizacional',icon:'&#127793;',items:[
 {key:'conexao_rh.acompanhar',label:'Conexão RH — consultar colaboradores e jornada'},
 {key:'conexao_rh.gerir',label:'Conexão RH — organizar turmas, conduzir encontros e registrar devolutivas'},
 {key:'conexao_rh.configurar',label:'Conexão RH — configurar programa e importar piloto'},
 {key:'conexao_rh.documentos',label:'Conexão RH — consultar e anexar Fit Cultural (dados pessoais)'}]});
  const ALL_KEYS = CATALOG.flatMap(g => g.items.map(i => i.key));

  // Presets só marcam um ponto de partida no formulário — depois de aplicar,
  // o administrador pode ligar/desligar qualquer checkbox individualmente.
  // O perfil (admin/gestor/rh) salvo no profile é só um rótulo/histórico de
  // qual preset foi usado por último, não uma trava de acesso.
  const PRESETS = {
    admin: ALL_KEYS,
    // Controle de Desligamento fica fora de todos os presets: tem contato
    // (celular) e dados pessoais de ex-colaboradores — só é ligado usuário a
    // usuário pelo administrador. Entrevistas de Desligamento e Pesquisa de
    // Clima também saem do preset RH (ajuste de 30/09/2026 — antes entravam).
    // Boletim da Liderança é só do Administrador (08/10/2026); os demais veem
    // os números publicados da própria operação no Dashboard.
    // Log de Acessos: só Administrador (fora do preset RH).
    rh: ALL_KEYS.filter(k => !k.startsWith('conexao_rh.') && k !== 'admin.usuarios' && k !== 'admin.log_acessos' &&k !== 'indicadores.controle_desligamento' && k !== 'indicadores.boletim'
      && k !== 'indicadores.desligamento' && k !== 'indicadores.pesquisa_clima' && k !== 'indicadores.engajamento'
      && k !== 'indicadores.satisfacao' && k !== 'indicadores.satisfacao_completo' && k !== 'indicadores.satisfacao_participacao'
      && k !== 'indicadores.fechamento'
      // Turmas: o RH geral só lê; gestor de T&D e multiplicadora são ligados conta a conta.
      && k !== 'treinamento_dev.turmas_gestor' && k !== 'treinamento_dev.turmas_lancar'),
    // "Gerar link" da Entrevista de Desligamento e o Controle de Desligamento
    // ficam de fora do preset Gestor de propósito — envolvem dado sensível
    // (CPF/e-mail/celular de ex-colaborador) e devem ser ligados
    // individualmente pelo administrador, não vir junto de tudo mais que já é
    // padrão pra esse perfil. O Organograma e o Headcount completos também
    // ficam de fora: o gestor vê só o próprio galho (liderança acima + equipe
    // abaixo), ver supabase-organograma.sql. 1:1 também fica de fora do
    // preset (ajuste de 30/09/2026 — antes entrava).
    // Avaliação da Experiência e Pesquisa de Clima ENTRAM no preset (ajuste de
    // 30/09/2026 — antes ficavam de fora por serem dado sensível; decisão do
    // RH foi padronizar como incluído, ligando individualmente só quem NÃO
    // deve ver, em vez do contrário).
    // Pesquisa de Engajamento (índice de participação) fica só com o Administrador:
    // fora dos presets RH e Gestor, só é ligada manualmente no Cadastro de Acessos.
    // Boletim da Liderança: entra no preset RH (é a ferramenta de quem monta o
    // boletim) e fica fora do preset Gestor.
    // Pesquisa de Satisfação (notas e comentários das áreas do Escritório): dado
    // sigiloso, fora de todos os presets — ligada pessoa a pessoa, junto com as
    // áreas que ela pode ver (profiles.satisfacao_areas). A participação de todas
    // as lojas e áreas (quem respondeu ou não) é confidencial: só o Administrador
    // (indicadores.satisfacao_participacao, fora de todos os presets).
    // Pesquisa de Engajamento (participação): ENTRA no preset Gestor — cada gestor acompanha a
    // participação das próprias unidades/departamentos (recorte de can_see). Fora do preset RH.
    gestor: CATALOG.find(g => g.group === 'indicadores').items.map(i => i.key)
      .filter(k => k !== 'indicadores.desligamento_gerar_link' && k !== 'indicadores.controle_desligamento' && k !== 'indicadores.oneonone' && k !== 'indicadores.organograma_completo' && k !== 'indicadores.headcount_completo' && k !== 'indicadores.boletim'
        && k !== 'indicadores.satisfacao' && k !== 'indicadores.satisfacao_completo' && k !== 'indicadores.satisfacao_participacao'
        && k !== 'indicadores.fechamento')
      .concat(['recrutamento.parecer_gestor'])
  };

  const PERFIL_LABELS = { admin: 'Administrador', gestor: 'Gestor', rh: 'RH' };

  // perfil='admin' sempre enxerga tudo, mesmo que o mapa `permissoes`
  // salvo esteja desatualizado em relação ao catálogo atual (ex.: a conta
  // foi criada antes de uma permissão nova existir) — mesma regra de
  // has_permission() no SQL (supabase-migration.sql), pra não haver telas
  // que o backend libera pro admin mas o menu esconde.
  function hasPerm(user, key) {
    if (!user) return false;
    if (user.perfil === 'admin') return true;
    return !!(user.permissoes && user.permissoes[key] === true);
  }

  function hasAnyPerm(user, keys) {
    return keys.some(k => hasPerm(user, k));
  }

  function presetPermissoes(perfil) {
    const keys = PRESETS[perfil] || [];
    const map = {};
    for (const k of keys) map[k] = true;
    return map;
  }

  window.HUB_PERMISSIONS = { CATALOG, ALL_KEYS, PRESETS, PERFIL_LABELS, hasPerm, hasAnyPerm, presetPermissoes };
})();
