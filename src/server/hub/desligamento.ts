import "server-only";
import { z } from "zod";
import { linhasJson, operacao, type Operacao } from "@/server/hub/operacao";

// Operações de: Controle e Entrevista de Desligamento, Organograma (organograma_meu_galho).
// Nome de cada operação: "desligamento.<função>".
//
// Controle de Desligamento é SIGILOSO (contato de ex-colaborador): só
// indicadores.controle_desligamento, que fica fora de todos os presets. As
// funções do banco (security definer) conferem a permissão e o recorte
// (can_see) por dentro; aqui a permissão se repete para devolver 403 claro.
// A carga e as gravações de controle_desligamento e entrevistas_desligamento
// já são recrutamento.lerPagina/inserir/atualizar (HUB_RECRUIT).

const CONTROLE = "indicadores.controle_desligamento";

// Contato do colaborador na Feedz para preencher a ficha. A função devolve só
// o telefone (texto) de UM colaborador, como a tela antiga recebia, e nada sem a permissão.
const contatoFeedz = operacao({
  permissao: CONTROLE,
  escrita: false,
  entrada: z.object({ externalId: z.string().trim().min(1).max(100) }).strict(),
  async executar({ externalId }, { tx }) {
    const [r] = await tx.$queryRawUnsafe<{ v: string | null }[]>(
      "select public.controle_desligamento_contato_feedz($1) as v",
      externalId,
    );
    return r?.v ?? null;
  },
});

// Respostas do Forms de UMA ficha (modal "Respostas"), já sem dado pessoal
// (respostas_sem_dado_pessoal dentro da função).
const respostasForms = operacao({
  permissao: CONTROLE,
  escrita: false,
  entrada: z.object({ controleId: z.number().int().positive() }).strict(),
  async executar({ controleId }, { tx }) {
    return linhasJson(
      tx,
      `select planilha_id, data_conclusao, questionario_antigo, ordem, pergunta, resposta
       from public.controle_desligamento_respostas_forms($1::bigint)`,
      controleId,
    );
  },
});

// Exportação para Excel: todas as respostas do Forms do recorte, em páginas
// de até 1000 na ordem da função (antes: range sobre a RPC).
const respostasFormsExportar = operacao({
  permissao: CONTROLE,
  escrita: false,
  entrada: z.object({
    de: z.number().int().min(0).max(10_000_000).default(0),
    limite: z.number().int().min(1).max(1000).default(1000),
  }).strict(),
  async executar({ de, limite }, { tx }) {
    return linhasJson(
      tx,
      `select controle_id, planilha_id, data_conclusao, questionario_antigo, respostas
       from public.controle_desligamento_respostas_forms_exportar() offset $1 limit $2`,
      de,
      limite,
    );
  },
});

// Ordem das perguntas do questionário (colunas do Excel). A policy deixava
// qualquer conta ler; o único consumidor é a exportação do Controle.
const perguntas = operacao({
  permissao: CONTROLE,
  escrita: false,
  entrada: z.object({}).strict(),
  async executar(_d, { tx }) {
    return linhasJson(tx, "select origem, ordem, pergunta from public.entrevista_pesquisa_perguntas order by ordem");
  },
});

// Galho da pessoa (liderança acima + equipe abaixo) para o Organograma e o
// Headcount de quem não tem a visão completa, e para o Dashboard. A função
// recorta pelo auth.uid(); no "Visualizar como" a operação já roda como a
// conta simulada, então o p_target_profile_id do legado nunca é usado.
const meuGalho = operacao({
  permissao: "autenticado",
  escrita: false,
  entrada: z.object({}).strict(),
  async executar(_d, { tx }) {
    return linhasJson(
      tx,
      `select external_id, nome, nome_completo, cargo, departamento, unidade, gestor_direto, situacao, grupos,
              data_admissao, relacao
       from public.organograma_meu_galho()`,
    );
  },
});

export const operacoes: Record<string, Operacao> = {
  "desligamento.contatoFeedz": contatoFeedz,
  "desligamento.respostasForms": respostasForms,
  "desligamento.respostasFormsExportar": respostasFormsExportar,
  "desligamento.perguntas": perguntas,
  "desligamento.meuGalho": meuGalho,
};
