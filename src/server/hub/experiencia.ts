import "server-only";
import { z } from "zod";
import { linhasJson, operacao, type Operacao } from "@/server/hub/operacao";

// Operações de: Avaliação da Experiência (dal-experiencia.js, metrics-experiencia.js, experiencia-natal.js).
// Nome de cada operação: "experiencia.<função>".
//
// Tabelas e colunas vêm só das constantes abaixo. A RLS original recorta as
// linhas (has_permission + can_see_escopo); as permissões das operações espelham
// as policies (test/acesso/policies-supabase.json) para devolver 403 claro.

const TABELAS = { 45: "avaliacao_experiencia_45", 90: "avaliacao_experiencia_90" } as const;
const ciclo = z.union([z.literal(45), z.literal(90)]);

// COLUNAS_LEVES do dal-experiencia.js. Sem "matricula" (é o CELULAR da pessoa)
// e sem os comentários por competência (vêm sob demanda, um colaborador por vez).
const COLUNAS_LEVES =
  "id, ciclo, pessoa_key, cpf, nome, cargo, papel, unidade, departamento, gestor, gestor_direto, gestor_avaliador, " +
  "data_admissao, data_avaliacao, data_autoavaliacao, status_gestor, status_auto, martelo, martelo_comentario, " +
  "notas_gestor, notas_auto";

// Policies de SELECT das duas tabelas: a da própria tela e a do Boletim da Liderança.
const LEITURA = ["indicadores.experiencia", "indicadores.boletim"];

// Uma página do ciclo, por id crescente (antes: range de 1000 do PostgREST).
const lerPagina = operacao({
  permissao: LEITURA,
  escrita: false,
  entrada: z.object({
    ciclo,
    aposId: z.number().int().min(0).default(0),
    limite: z.number().int().min(1).max(1000).default(1000),
  }).strict(),
  async executar({ ciclo: c, aposId, limite }, { tx }) {
    return linhasJson(
      tx,
      `select ${COLUNAS_LEVES} from public.${TABELAS[c]} where id > $1 order by id asc limit $2`,
      aposId,
      limite,
    );
  },
});

// buscarComentarios: só os comentários de UMA linha (maybeSingle → objeto ou null).
const comentarios = operacao({
  permissao: LEITURA,
  escrita: false,
  entrada: z.object({ ciclo, id: z.number().int().positive() }).strict(),
  async executar({ ciclo: c, id }, { tx }) {
    const [r] = await linhasJson(
      tx,
      `select comentarios_gestor, comentarios_auto from public.${TABELAS[c]} where id = $1`,
      id,
    );
    return r ?? null;
  },
});

// Extra Natal → reposição: as vagas do Controle de Vagas, só as colunas que o
// cruzamento usa. Quem pode ler vagas pela policy vagas_select (sem o acesso ao
// Recrutamento a tela já mostrava "depende do acesso ao módulo de Recrutamento").
const LEITURA_VAGAS = [
  "recrutamento.dashboard", "indicadores.recrutamento", "recrutamento.vagas", "recrutamento.candidatos",
  "recrutamento.agenda", "recrutamento.banco_talentos", "recrutamento.aprovacoes", "recrutamento.historico",
];
const vagasReposicao = operacao({
  permissao: LEITURA_VAGAS,
  escrita: false,
  entrada: z.object({
    aposId: z.string().max(200).nullable().default(null),
    limite: z.number().int().min(1).max(1000).default(1000),
  }).strict(),
  async executar({ aposId, limite }, { tx }) {
    return linhasJson(
      tx,
      `select id, data_abertura, unidade, departamento, cargo, status, tipo_movimentacao
       from public.vagas where ($1::text is null or id > $1::text) order by id asc limit $2`,
      aposId,
      limite,
    );
  },
});

export const operacoes: Record<string, Operacao> = {
  "experiencia.lerPagina": lerPagina,
  "experiencia.comentarios": comentarios,
  "experiencia.vagasReposicao": vagasReposicao,
};
