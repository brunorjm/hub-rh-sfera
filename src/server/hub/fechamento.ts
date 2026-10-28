import "server-only";
import { z } from "zod";
import { ErroOperacao, linhasJson, operacao, type ContextoOperacao, type Operacao } from "@/server/hub/operacao";

// Operações de: Fechamento do Período (dal-fechamento.js, sections/fechamento.js).
// Nome de cada operação: "fechamento.<função>".
//
// Fechamento é só do Administrador: as policies de controle_vagas, metas_vagas
// e fechamento_periodo exigem indicadores.fechamento (controle_vagas ainda
// recorta por can_see_escopo). Colunas só das listas abaixo.

const quem = (u: ContextoOperacao["usuario"]) => u.nome || u.email || null;

// O "select('*')" de cada tabela, escrito.
const COLUNAS_VAGAS =
  "id, linha, data_abertura, data_fechamento, data_inicio, data_cancelamento, data_congelamento, data_retorno, " +
  "dias_congelada, sla_dias_planilha, status_sla_planilha, motivo_sla, unidade, departamento, cargo, sigilosa, " +
  "tipo_vaga, responsavel, status_vaga, natureza, motivo_aumento_quadro, tipo_recrutamento, etapa_vaga, fit, fonte, importado_em";
const COLUNAS_PERIODO =
  "id, tipo, ano, n, textos, manuais, ocultos, status, snapshot, fechado_em, fechado_por, atualizado_em, atualizado_por";

// ---- Base de vagas da planilha 18 e metas ---------------------------------

// buscarVagas: páginas de 1000 na ordem da planilha (linha). O id desempata,
// para a paginação não pular nem repetir linha.
const vagasPagina = operacao({
  permissao: "indicadores.fechamento",
  escrita: false,
  entrada: z.object({
    de: z.number().int().min(0).max(10_000_000).default(0),
    limite: z.number().int().min(1).max(1000).default(1000),
  }).strict(),
  async executar({ de, limite }, { tx }) {
    return linhasJson(
      tx,
      `select ${COLUNAS_VAGAS} from public.controle_vagas order by linha asc, id asc offset $1 limit $2`,
      de,
      limite,
    );
  },
});

const metas = operacao({
  permissao: "indicadores.fechamento",
  escrita: false,
  entrada: z.object({}).strict(),
  async executar(_d, { tx }) {
    return linhasJson(tx, "select ano, mes, meta_abertas, meta_fechadas, atualizado_em from public.metas_vagas order by ano, mes");
  },
});

// Upload do card 18: substitui a base inteira; o primeiro lote limpa a tabela.
// A função exige admin.upload por dentro e só lê as colunas que declara.
const salvarVagas = operacao({
  permissao: "admin.upload",
  escrita: true,
  entrada: z.object({
    linhas: z.array(z.record(z.string().max(63), z.unknown())).max(500)
      .refine((l) => JSON.stringify(l).length <= 4_000_000, "Lote grande demais."),
    limpar: z.boolean(),
  }).strict(),
  async executar({ linhas, limpar }, { tx }) {
    const [r] = await tx.$queryRawUnsafe<{ v: number | null }[]>(
      "select public.controle_vagas_salvar($1::jsonb, $2)::int as v",
      JSON.stringify(linhas),
      limpar,
    );
    return r?.v ?? 0;
  },
});

// ---- Período (fechamento_periodo) ------------------------------------------

const TIPOS = { mensal: 12, bimestral: 6, semestral: 2, anual: 1 } as const;
const periodo = {
  tipo: z.enum(["mensal", "bimestral", "semestral", "anual"]),
  ano: z.number().int().min(2000).max(2100),
  n: z.number().int().min(1).max(12),
};
const periodoId = (tipo: keyof typeof TIPOS, ano: number, n: number) => `${tipo}-${ano}-${tipo === "anual" ? 1 : n}`;

// buscarPeriodo (maybeSingle → objeto ou null).
const buscarPeriodo = operacao({
  permissao: "indicadores.fechamento",
  escrita: false,
  entrada: z.object({ id: z.string().min(1).max(40) }).strict(),
  async executar({ id }, { tx }) {
    const [r] = await linhasJson(tx, `select ${COLUNAS_PERIODO} from public.fechamento_periodo where id = $1`, id);
    return r ?? null;
  },
});

// listarPeriodos: só o cabeçalho (sem textos, slides e foto).
const listarPeriodos = operacao({
  permissao: "indicadores.fechamento",
  escrita: false,
  entrada: z.object({}).strict(),
  async executar(_d, { tx }) {
    return linhasJson(
      tx,
      `select id, tipo, ano, n, status, fechado_em, fechado_por, atualizado_em, atualizado_por
       from public.fechamento_periodo order by ano desc, n desc`,
    );
  },
});

// salvarPeriodo / fecharPeriodo / reabrirPeriodo: upsert do período. O id sai
// de tipo/ano/n; quem alterou e quem fechou (e quando) vêm da sessão. Só as
// colunas enviadas mudam, como o upsert do PostgREST. A trava do período
// fechado é do banco (trigger fechamento_periodo_trava → 400 com a mensagem).
const objetoJson = z.record(z.string().max(200), z.unknown());
const salvarPeriodo = operacao({
  permissao: "indicadores.fechamento",
  escrita: true,
  entrada: z.object({
    ...periodo,
    textos: objetoJson.optional(),
    manuais: objetoJson.optional(),
    ocultos: z.array(z.string().max(200)).max(500).optional(),
    status: z.enum(["rascunho", "fechado"]).optional(),
    snapshot: z.unknown().optional(),
  }).strict()
    .refine((d) => d.tipo === "anual" || d.n <= TIPOS[d.tipo], "Período inválido.")
    .refine((d) => JSON.stringify(d).length <= 8_000_000, "Período grande demais."),
  async executar(d, { tx, usuario }) {
    const linha: Record<string, unknown> = {
      id: periodoId(d.tipo, d.ano, d.n), tipo: d.tipo, ano: d.ano, n: d.tipo === "anual" ? 1 : d.n,
      atualizado_por: quem(usuario),
    };
    for (const c of ["textos", "manuais", "ocultos", "status", "snapshot"] as const) {
      if (d[c] !== undefined) linha[c] = d[c];
    }
    if (d.status === "fechado") {
      linha.fechado_em = new Date().toISOString();
      linha.fechado_por = quem(usuario);
    } else if (d.status === "rascunho") {
      linha.snapshot = null;
      linha.fechado_em = null;
      linha.fechado_por = null;
    }
    // Nomes de coluna só desta lista fixa; valores convertidos pelo Postgres.
    const cols = Object.keys(linha).map((c) => `"${c}"`);
    const sets = cols.filter((c) => c !== '"id"').map((c) => `${c} = excluded.${c}`).join(", ");
    // Escrita dentro de with só no nível de cima: o json_agg fica no select de fora.
    const [r] = await tx.$queryRawUnsafe<{ j: Record<string, unknown>[] }[]>(
      `with r as (
         insert into public.fechamento_periodo (${cols.join(", ")})
         select ${cols.join(", ")} from json_populate_record(null::public.fechamento_periodo, $1::json)
         on conflict (id) do update set ${sets}
         returning ${COLUNAS_PERIODO})
       select coalesce(json_agg(r), '[]'::json) as j from r`,
      JSON.stringify(linha),
    );
    // O .single() do Supabase: a linha gravada.
    const gravada = r?.j?.[0];
    if (!gravada) throw new ErroOperacao(403, "Sem permissão para estes dados.");
    return gravada;
  },
});

export const operacoes: Record<string, Operacao> = {
  "fechamento.vagasPagina": vagasPagina,
  "fechamento.metas": metas,
  "fechamento.salvarVagas": salvarVagas,
  "fechamento.buscarPeriodo": buscarPeriodo,
  "fechamento.listarPeriodos": listarPeriodos,
  "fechamento.salvarPeriodo": salvarPeriodo,
};
