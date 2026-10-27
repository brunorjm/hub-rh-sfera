// Catálogo único de permissões do Hub Sfera, portado de legado/js/permissions.js.
// Cada item vira: (1) checkbox no Cadastro de Acessos, (2) item do menu e
// (3) a chave conferida no servidor por exigirPermissao(). As strings são as
// mesmas gravadas em profiles.permissoes — não renomeie sem migration de dados.

export type GrupoPermissao = {
  group: string;
  groupLabel: string;
  icon: string;
  items: { key: string; label: string }[];
};

export const CATALOGO: GrupoPermissao[] = [
  {
    group: "indicadores", groupLabel: "Indicadores", icon: "📊",
    items: [
      { key: "indicadores.headcount", label: "Headcount (sem a permissão abaixo: só a própria pessoa e a equipe abaixo dela, também nos números de headcount do Dashboard)" },
      { key: "indicadores.headcount_completo", label: "Headcount — ver todos os colaboradores" },
      { key: "indicadores.organograma", label: "Organograma (sem a permissão abaixo: só o próprio galho, da liderança acima até a equipe abaixo)" },
      { key: "indicadores.organograma_completo", label: "Organograma — ver a estrutura completa da empresa" },
      { key: "indicadores.recrutamento", label: "Recrutamento" },
      { key: "indicadores.rotatividade", label: "Rotatividade" },
      { key: "indicadores.experiencia", label: "Avaliação da Experiência" },
      { key: "indicadores.desligamento", label: "Entrevistas de Desligamento" },
      { key: "indicadores.controle_desligamento", label: "Controle de Desligamento (Dados Sigilosos)" },
      { key: "indicadores.feedbacks", label: "Feedbacks" },
      { key: "indicadores.oneonone", label: "1:1" },
      { key: "indicadores.treinamentos", label: "Treinamentos" },
      { key: "indicadores.celebracoes", label: "Celebrações" },
      { key: "indicadores.pesquisa_clima", label: "Pesquisa de Clima — resultados e comentários (Dados Sigilosos)" },
      { key: "indicadores.engajamento", label: "Pesquisa de Engajamento — índice de participação por unidade e departamento" },
      { key: "indicadores.boletim", label: "Boletim da Liderança — indicadores mensais por operação, textos e fechamento do mês (só Administrador; sem ela, o Dashboard mostra os números publicados da operação da pessoa)" },
      { key: "indicadores.satisfacao", label: "Pesquisa de Satisfação — notas e comentários das áreas do Escritório (Dados Sigilosos: vê só as áreas marcadas em \"Áreas da Pesquisa de Satisfação\", e só o total de cada área)" },
      { key: "indicadores.satisfacao_completo", label: "Pesquisa de Satisfação — ver todas as áreas, com o recorte por operação e loja (RH/Diretoria)" },
      { key: "indicadores.fechamento", label: "Fechamento do Período — apresentação mensal do RH à diretoria, com download em PowerPoint (só Administrador)" },
      { key: "indicadores.satisfacao_participacao", label: "Pesquisa de Satisfação — participação de todas as lojas e áreas (Dados Sigilosos: só Administrador)" },
    ],
  },
  {
    group: "desenvolvimento_organizacional", groupLabel: "Desenvolvimento Organizacional", icon: "🌱",
    items: [
      { key: "conexao_rh.acompanhar", label: "Conexão RH — consultar colaboradores e jornada" },
      { key: "conexao_rh.gerir", label: "Conexão RH — organizar turmas, conduzir encontros e registrar devolutivas" },
      { key: "conexao_rh.configurar", label: "Conexão RH — configurar programa e importar piloto" },
      { key: "conexao_rh.documentos", label: "Conexão RH — consultar e anexar Fit Cultural (dados pessoais)" },
    ],
  },
  {
    group: "recrutamento", groupLabel: "Recrutamento", icon: "💼",
    items: [
      { key: "recrutamento.dashboard", label: "Dashboard" },
      { key: "recrutamento.vagas", label: "Controle de Vagas" },
      { key: "recrutamento.candidatos", label: "Candidatos" },
      { key: "recrutamento.agenda", label: "Agenda de Entrevistas" },
      { key: "recrutamento.banco_talentos", label: "Banco de Talentos" },
      { key: "recrutamento.aprovacoes", label: "Aprovações" },
      { key: "recrutamento.historico", label: "Histórico" },
      { key: "recrutamento.transferencia", label: "Transferência de Vaga" },
      { key: "recrutamento.parecer_gestor", label: "Parecer do Gestor" },
    ],
  },
  {
    group: "treinamento_dev", groupLabel: "Treinamento e Desenvolvimento", icon: "🎓",
    items: [
      { key: "treinamento_dev.onboarding", label: "Onboarding" },
      { key: "treinamento_dev.visita_loja", label: "Visita em Loja" },
      // Três papéis (14/10/2026): RH geral só lê, gestor de T&D faz tudo,
      // multiplicadora lança e vê só as próprias turmas.
      { key: "treinamento_dev.turmas", label: "Turmas e Multiplicadoras — ver todas as turmas (somente leitura)" },
      { key: "treinamento_dev.turmas_gestor", label: "Turmas e Multiplicadoras — gestor de T&D (vê, edita e exclui todas as turmas, valida justificativas, pede ajustes, altera mês fechado)" },
      { key: "treinamento_dev.turmas_lancar", label: "Turmas e Multiplicadoras — multiplicadora (lança e vê só as próprias turmas; edita até o mês ser fechado; não exclui)" },
    ],
  },
  {
    group: "administracao", groupLabel: "Administração", icon: "⚙️",
    items: [
      { key: "admin.upload", label: "Upload de Planilhas (Indicadores)" },
      { key: "admin.cadastros_recrutamento", label: "Cadastros do Recrutamento" },
      { key: "admin.usuarios", label: "Cadastro de Acessos" },
      { key: "admin.log_acessos", label: "Log de Acessos — quem entrou no Hub, quando e quais módulos abriu (só Administrador)" },
    ],
  },
];

export const TODAS_AS_CHAVES: string[] = CATALOGO.flatMap((g) => g.items.map((i) => i.key));

// Presets só marcam um ponto de partida no Cadastro de Acessos; o perfil salvo
// é rótulo. O porquê de cada exclusão está nos comentários de
// legado/js/permissions.js (decisões do RH de 30/09, 08/10 e 14/10/2026).
const FORA_DO_RH = new Set([
  "admin.usuarios", "admin.log_acessos",
  "indicadores.controle_desligamento", "indicadores.boletim", "indicadores.desligamento",
  "indicadores.pesquisa_clima", "indicadores.engajamento",
  "indicadores.satisfacao", "indicadores.satisfacao_completo", "indicadores.satisfacao_participacao",
  "indicadores.fechamento",
  "treinamento_dev.turmas_gestor", "treinamento_dev.turmas_lancar",
]);

const FORA_DO_GESTOR = new Set([
  "indicadores.desligamento_gerar_link", "indicadores.controle_desligamento", "indicadores.oneonone",
  "indicadores.organograma_completo", "indicadores.headcount_completo", "indicadores.boletim",
  "indicadores.satisfacao", "indicadores.satisfacao_completo", "indicadores.satisfacao_participacao",
  "indicadores.fechamento",
]);

export const PRESETS: Record<"admin" | "rh" | "gestor", string[]> = {
  admin: TODAS_AS_CHAVES,
  rh: TODAS_AS_CHAVES.filter((k) => !k.startsWith("conexao_rh.") && !FORA_DO_RH.has(k)),
  gestor: CATALOGO.find((g) => g.group === "indicadores")!.items.map((i) => i.key)
    .filter((k) => !FORA_DO_GESTOR.has(k))
    .concat(["recrutamento.parecer_gestor"]),
};

export const PERFIL_LABELS: Record<string, string> = { admin: "Administrador", gestor: "Gestor", rh: "RH" };

export function presetPermissoes(perfil: string): Record<string, true> {
  const chaves = PRESETS[perfil as keyof typeof PRESETS] ?? [];
  return Object.fromEntries(chaves.map((k) => [k, true as const]));
}
