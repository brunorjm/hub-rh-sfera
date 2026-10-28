import "server-only";
import { z } from "zod";
import { linhasJson, operacao, type ContextoOperacao, type Operacao } from "@/server/hub/operacao";

// Operações de: Turmas e Multiplicadoras e gravações de Treinamentos
// (dal-indicadores.js: salvarTreinamento e as funções de turma; sections/turmas.js).
// Nome de cada operação: "turmas.<função>".
//
// Toda gravação passa pelas funções security definer do banco, como no hub
// antigo. Elas impõem os três papéis de Turmas:
//   - treinamento_dev.turmas: só lê;
//   - treinamento_dev.turmas_gestor: lança, edita, exclui, valida e altera mês fechado;
//   - treinamento_dev.turmas_lancar: lança e vê só as próprias, edita até o mês
//     fechar, justifica as próprias, não exclui.
// As permissões abaixo espelham isso para devolver 403 claro; o banco continua
// mandando (mensagem do raise exception volta como 400).
// Quem lançou/justificou/decidiu vem da sessão, nunca do navegador.

const quem = (u: ContextoOperacao["usuario"]) => u.nome || u.email || "";
const GESTOR = "treinamento_dev.turmas_gestor";
const LANCAR = "treinamento_dev.turmas_lancar";
const LEITURA = ["treinamento_dev.turmas", GESTOR, LANCAR];

// Valor de uma função do banco já como JSON (bigint vira número, text[] vira lista).
async function valorJson<T>(ctx: ContextoOperacao, sql: string, ...parametros: unknown[]): Promise<T | null> {
  const [r] = await ctx.tx.$queryRawUnsafe<{ v: T | null }[]>(`select to_json(${sql}) as v`, ...parametros);
  return r?.v ?? null;
}

// Função do banco que devolve void (só grava ou recusa com raise exception).
async function chamarFuncao(ctx: ContextoOperacao, sql: string, ...parametros: unknown[]): Promise<null> {
  await ctx.tx.$queryRawUnsafe(`select (${sql})::text as v`, ...parametros);
  return null;
}

const idTurma = z.number().int().positive();
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
// Linhas de planilha: o banco lê só as colunas que declara (jsonb_to_recordset).
const lote = (max: number) =>
  z.array(z.record(z.string().max(63), z.unknown())).max(max)
    .refine((l) => JSON.stringify(l).length <= 8_000_000, "Lote grande demais.");

// ---- Uploads (Administração → Upload de Planilhas) ------------------------
// Cada função apaga e insere na mesma transação e exige admin.upload por dentro.

const salvarUnibe = operacao({
  permissao: "admin.upload",
  escrita: true,
  entrada: z.object({ mes: data, pdvs: lote(20_000), pessoas: lote(50_000) }).strict(),
  async executar({ mes, pdvs, pessoas }, ctx) {
    return valorJson<number>(
      ctx, "public.treinamentos_salvar_unibe($1::date, $2::jsonb, $3::jsonb)", mes, JSON.stringify(pdvs), JSON.stringify(pessoas),
    );
  },
});

const salvarAcademia = operacao({
  permissao: "admin.upload",
  escrita: true,
  entrada: z.object({ mes: data, linhas: lote(50_000) }).strict(),
  async executar({ mes, linhas }, ctx) {
    return valorJson<number>(ctx, "public.treinamentos_salvar_academia($1::date, $2::jsonb)", mes, JSON.stringify(linhas));
  },
});

// ---- Turma lançada pela tela (Lançamentos) ---------------------------------

const texto = (max: number) => z.string().max(max).nullable().optional();
const numero = z.number().finite().nullable().optional();
const lista = z.array(z.string().max(300)).max(50).optional();

// Os campos que treinamento_turma_salvar lê de p_dados. "usuario" (quem
// lançou/alterou/justificou) não vem do navegador: o servidor põe o da sessão.
const dadosTurma = z.object({
  data,
  tema: z.string().max(500),
  categoria: texto(200),
  modalidade: texto(200),
  local: texto(300),
  hora_inicio: texto(10),
  hora_fim: texto(10),
  horas: numero,
  publico: texto(300),
  canal: texto(200),
  convocados: numero,
  presentes: numero,
  marcas: lista,
  marca_original: texto(1000),
  multiplicadoras: lista,
  multiplicador_original: texto(1000),
  planilha: texto(300),
  observacao: texto(5000),
  justificativa: texto(5000),
}).strict();

const salvar = operacao({
  permissao: [GESTOR, LANCAR],
  escrita: true,
  entrada: z.object({ id: idTurma.nullable(), dados: dadosTurma }).strict(),
  async executar({ id, dados }, ctx) {
    return valorJson<number>(
      ctx,
      "public.treinamento_turma_salvar($1::bigint, $2::jsonb)",
      id,
      JSON.stringify({ ...dados, usuario: quem(ctx.usuario) }),
    );
  },
});

// Só a justificativa da divergência (turma importada incompleta).
const justificar = operacao({
  permissao: [GESTOR, LANCAR],
  escrita: true,
  entrada: z.object({ id: idTurma, texto: z.string().max(5000).nullable() }).strict(),
  async executar({ id, texto: t }, ctx) {
    return chamarFuncao(ctx, "public.treinamento_turma_justificar($1::bigint, $2, $3)", id, t, quem(ctx.usuario));
  },
});

const excluir = operacao({
  permissao: GESTOR,
  escrita: true,
  entrada: z.object({ id: idTurma }).strict(),
  async executar({ id }, ctx) {
    return chamarFuncao(ctx, "public.treinamento_turma_excluir($1::bigint)", id);
  },
});

// Gestor de T&D: validar / devolver a justificativa, pedir / cancelar ajuste.
const gestao = operacao({
  permissao: GESTOR,
  escrita: true,
  entrada: z.object({
    id: idTurma,
    acao: z.enum(["validar", "devolver", "pedir_ajuste", "cancelar_ajuste"]),
    comentario: z.string().max(5000).nullable().optional(),
  }).strict(),
  async executar({ id, acao, comentario }, ctx) {
    return chamarFuncao(
      ctx, "public.treinamento_turma_gestao($1::bigint, $2, $3, $4)", id, acao, comentario || null, quem(ctx.usuario),
    );
  },
});

// Meses fechados no Fechamento do Período ('AAAA-MM'): a multiplicadora não
// edita turmas deles. Só a lista de meses, sem nada do fechamento.
const mesesFechados = operacao({
  permissao: LEITURA,
  escrita: false,
  entrada: z.object({}).strict(),
  async executar(_d, ctx) {
    return (await valorJson<string[]>(ctx, "public.treinamento_meses_fechados()")) ?? [];
  },
});

// Histórico de alterações de uma turma (a policy só deixa o gestor ler).
const historico = operacao({
  permissao: GESTOR,
  escrita: false,
  entrada: z.object({ id: idTurma }).strict(),
  async executar({ id }, { tx }) {
    return linhasJson(
      tx,
      `select id, turma_id, acao, quando, usuario_id, usuario_nome, antes, depois
       from public.treinamento_turmas_log where turma_id = $1 order by quando desc`,
      id,
    );
  },
});

export const operacoes: Record<string, Operacao> = {
  "turmas.salvarUnibe": salvarUnibe,
  "turmas.salvarAcademia": salvarAcademia,
  "turmas.salvar": salvar,
  "turmas.justificar": justificar,
  "turmas.excluir": excluir,
  "turmas.gestao": gestao,
  "turmas.mesesFechados": mesesFechados,
  "turmas.historico": historico,
};
