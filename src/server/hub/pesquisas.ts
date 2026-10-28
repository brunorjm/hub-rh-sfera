import "server-only";
import { z } from "zod";
import { ErroOperacao, linhasJson, mensagemDoBanco, operacao, type ContextoOperacao, type Operacao } from "@/server/hub/operacao";

// Operações de: Pesquisa de Clima, Engajamento, Boletim da Liderança e Satisfação.
// Nome de cada operação: "pesquisas.<função>".
//
// Dados sigilosos. Leitura de tabela: colunas e tabelas só das listas abaixo,
// dentro das RLS originais (has_permission + can_see_escopo); as permissões das
// operações espelham as policies (test/acesso/policies-supabase.json).
// Gravação e Satisfação: só pelas funções security definer do banco, como no
// hub antigo (elas conferem a permissão e o recorte por dentro).

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
const quem = (u: ContextoOperacao["usuario"]) => u.nome || u.email || null;

// O "select('*')" de cada tabela, escrito (é o que as telas antigas recebiam).
const COLUNAS = {
  pesquisa_clima: "id,dimensao,pergunta,nota,comentario,data_resposta,posicao,lider,tempo_empresa_meses,unidade,departamento",
  pesquisa_clima_hc: "id,unidade,departamento,papel,lider,situacao",
  engajamento_pulso: "id,inicio,fim,numero,convidados,respondentes,parcial,ultima_resposta,fonte,atualizado_em",
  engajamento_participacao: "id,pulso_inicio,unidade,departamento,gestor,convidados,respondentes",
  humor_mensal: "id,mes,unidade,departamento,registros,soma,pessoas,dist",
  engajamento_notas: "id,dia,unidade,departamento,dimensao,soma,n,promotores,detratores",
  satisfacao_suporte: "id,pesquisa,unidade,departamento,respondentes,areas",
  boletim_entradas: "id,mes,operacao,loja,indicador,valor,atualizado_por,atualizado_em",
  boletim_fechamento: "id,mes,operacao,dados,fechado_por,fechado_em",
} as const;
type Tabela = keyof typeof COLUNAS;
const listaColunas = (t: Tabela) => COLUNAS[t].split(",").map(ident).join(", ");

// Página de uma tabela por id crescente (fetchAll das dal: keyset de 1000).
function lerTabela(tx: ContextoOperacao["tx"], tabela: Tabela, aposId: number, limite: number) {
  return linhasJson(
    tx,
    `select ${listaColunas(tabela)} from public.${ident(tabela)} where id > $1 order by id asc limit $2`,
    aposId,
    limite,
  );
}
const pagina = { aposId: z.number().int().min(0).default(0), limite: z.number().int().min(1).max(1000).default(1000) };

// As funções do banco recusam com "raise exception" (ex.: "Este mês está
// fechado..."). A tela antiga mostrava essa mensagem; aqui ela volta como 400.
async function naFuncao<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const banco = (e as { meta?: { code?: string; message?: string } })?.meta;
    if (banco?.code === "P0001") throw new ErroOperacao(400, mensagemDoBanco(banco.message, "Operação recusada pelo banco."));
    throw e;
  }
}

async function valorDe<T>(ctx: ContextoOperacao, sql: string, ...parametros: unknown[]): Promise<T | null> {
  return naFuncao(async () => {
    const [r] = await ctx.tx.$queryRawUnsafe<{ v: T }[]>(sql, ...parametros);
    return r?.v ?? null;
  });
}

// Linhas de planilha para as funções de gravação: o banco lê só as colunas que
// declara (jsonb_to_recordset); aqui só o tamanho é limitado.
const linha = z.record(z.string().max(63), z.unknown());
const lote = (max: number) =>
  z.array(linha).max(max).refine((l) => JSON.stringify(l).length <= 8_000_000, "Lote grande demais.");
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const meses = z.array(data).max(240);

// ---- Pesquisa de Clima ---------------------------------------------------

const climaLerPagina = operacao({
  permissao: "indicadores.pesquisa_clima",
  escrita: false,
  entrada: z.object({ tabela: z.enum(["pesquisa_clima", "pesquisa_clima_hc"]), ...pagina }).strict(),
  async executar({ tabela, aposId, limite }, { tx }) {
    return lerTabela(tx, tabela, aposId, limite);
  },
});

// ---- Pesquisa de Engajamento ---------------------------------------------

// Policies de SELECT: a da tela e a do Boletim (que também carrega a participação).
const engajamentoLerPagina = operacao({
  permissao: ["indicadores.engajamento", "indicadores.boletim"],
  escrita: false,
  entrada: z.object({ tabela: z.enum(["engajamento_pulso", "engajamento_participacao"]), ...pagina }).strict(),
  async executar({ tabela, aposId, limite }, { tx }) {
    return lerTabela(tx, tabela, aposId, limite);
  },
});

// Upload do card de Engajamento: tudo numa transação, dentro da função.
const engajamentoSalvarBase = operacao({
  permissao: "admin.upload",
  escrita: true,
  entrada: z.object({ pulsos: lote(500), linhas: lote(50_000), hoje: data }).strict(),
  async executar({ pulsos, linhas, hoje }, ctx) {
    return valorDe(
      ctx,
      "select public.engajamento_salvar_base($1::jsonb, $2::jsonb, $3::date) as v",
      JSON.stringify(pulsos),
      JSON.stringify(linhas),
      hoje,
    );
  },
});

// ---- Boletim da Liderança (só Administrador: indicadores.boletim) --------

const boletimLerPagina = operacao({
  permissao: "indicadores.boletim",
  escrita: false,
  entrada: z.object({
    tabela: z.enum(["humor_mensal", "engajamento_notas", "satisfacao_suporte", "boletim_entradas", "boletim_fechamento"]),
    ...pagina,
  }).strict(),
  async executar({ tabela, aposId, limite }, { tx }) {
    return lerTabela(tx, tabela, aposId, limite);
  },
});

// Gravações em lote (uploads): o primeiro lote limpa o período (limpar).
// As funções exigem admin.upload por dentro.
const boletimSalvarHumor = operacao({
  permissao: "admin.upload",
  escrita: true,
  entrada: z.object({ meses, linhas: lote(1500), limpar: z.boolean() }).strict(),
  async executar(d, ctx) {
    return valorDe(
      ctx,
      "select public.boletim_salvar_humor($1::date[], $2::jsonb, $3) as v",
      d.meses, JSON.stringify(d.linhas), d.limpar,
    );
  },
});

const boletimSalvarEngNotas = operacao({
  permissao: "admin.upload",
  escrita: true,
  entrada: z.object({ inicio: data, fim: data, linhas: lote(1500), limpar: z.boolean() }).strict(),
  async executar(d, ctx) {
    return valorDe(
      ctx,
      "select public.boletim_salvar_eng_notas($1::date, $2::date, $3::jsonb, $4) as v",
      d.inicio, d.fim, JSON.stringify(d.linhas), d.limpar,
    );
  },
});

const boletimSalvarSatisfacao = operacao({
  permissao: "admin.upload",
  escrita: true,
  entrada: z.object({ meses, linhas: lote(1500), limpar: z.boolean() }).strict(),
  async executar(d, ctx) {
    return valorDe(
      ctx,
      "select public.boletim_salvar_satisfacao($1::date[], $2::jsonb, $3) as v",
      d.meses, JSON.stringify(d.linhas), d.limpar,
    );
  },
});

// Valor manual de um indicador. Quem gravou vem da sessão, não do navegador.
const boletimSalvarEntrada = operacao({
  permissao: "admin.upload",
  escrita: true,
  entrada: z.object({
    mes: data,
    operacao: z.string().min(1).max(100),
    loja: z.string().max(300).nullable().default(null),
    indicador: z.string().min(1).max(100),
    valor: z.number().finite().nullable(),
  }).strict(),
  async executar(d, ctx) {
    await valorDe(
      ctx,
      "select public.boletim_salvar_entrada($1::date, $2, $3, $4, $5::numeric, $6)::text as v",
      d.mes, d.operacao, d.loja, d.indicador, d.valor, quem(ctx.usuario),
    );
    return null;
  },
});

// Fecha o mês: guarda a "foto" de cada operação.
const boletimFechar = operacao({
  permissao: "admin.upload",
  escrita: true,
  entrada: z.object({
    mes: data,
    itens: z.array(z.object({ operacao: z.string().min(1).max(100), dados: z.unknown() }).strict())
      .max(100)
      .refine((l) => JSON.stringify(l).length <= 5_000_000, "Fechamento grande demais."),
  }).strict(),
  async executar(d, ctx) {
    return valorDe(
      ctx,
      "select public.boletim_fechar($1::date, $2::jsonb, $3) as v",
      d.mes, JSON.stringify(d.itens), quem(ctx.usuario),
    );
  },
});

const boletimReabrir = operacao({
  permissao: "admin.upload",
  escrita: true,
  entrada: z.object({ mes: data }).strict(),
  async executar({ mes }, ctx) {
    await valorDe(ctx, "select public.boletim_reabrir($1::date)::text as v", mes);
    return null;
  },
});

// Dashboard de quem NÃO tem o Boletim: números publicados do último mês
// fechado, já recortados pela função (operação inteira ou só as lojas
// liberadas do profile). O Dashboard é visível a toda conta ativa e a função
// é concedida a authenticated; por isso "autenticado". Sem p_profile_id: no
// "Visualizar como" a operação já roda como a conta simulada (auth.uid()).
const boletimResumoPublicado = operacao({
  permissao: "autenticado",
  escrita: false,
  entrada: z.object({}).strict(),
  async executar(_d, { tx }) {
    return linhasJson(tx, "select mes, operacao, dados from public.boletim_resumo_publicado()");
  },
});

// ---- Pesquisa de Satisfação (só pela função satisfacao_dados) ------------

// Recorte dentro da função: áreas de profiles.satisfacao_areas; sem a visão
// completa, sem unidade/departamento/chave/triagem e sem os comentários tirados
// pela triagem. Página por "ord" (antes: range de 1000 sobre a função).
const satisfacaoDados = operacao({
  permissao: ["indicadores.satisfacao", "indicadores.satisfacao_completo"],
  escrita: false,
  entrada: z.object({ aposOrd: z.number().int().min(0).default(0), limite: pagina.limite }).strict(),
  async executar({ aposOrd, limite }, { tx }) {
    return naFuncao(() => linhasJson(
      tx,
      `select ord, pesquisa, area, nota, melhorar, extra, comentario, unidade, departamento, chave, triagem, loja_liberada
       from public.satisfacao_dados() where ord > $1 order by ord asc limit $2`,
      aposOrd,
      limite,
    ));
  },
});

// Ciclos (respondentes/aptos/áreas). Policy: indicadores.satisfacao ou
// admin.usuarios (Cadastro de Acessos lista as áreas). Com só a visão completa
// a operação passa e a RLS devolve vazio, como no Supabase.
const satisfacaoCiclos = operacao({
  permissao: ["indicadores.satisfacao", "indicadores.satisfacao_completo", "admin.usuarios"],
  escrita: false,
  entrada: z.object({}).strict(),
  async executar(_d, { tx }) {
    return linhasJson(tx, "select pesquisa, respondentes, aptos, areas, atualizado_em from public.satisfacao_ciclo order by pesquisa");
  },
});

const satisfacaoSalvar = operacao({
  permissao: "admin.upload",
  escrita: true,
  entrada: z.object({ meses, linhas: lote(1000), limpar: z.boolean() }).strict(),
  async executar(d, ctx) {
    return valorDe(
      ctx,
      "select public.satisfacao_salvar($1::date[], $2::jsonb, $3) as v",
      d.meses, JSON.stringify(d.linhas), d.limpar,
    );
  },
});

const satisfacaoSalvarCiclos = operacao({
  permissao: "admin.upload",
  escrita: true,
  entrada: z.object({ ciclos: lote(500) }).strict(),
  async executar({ ciclos }, ctx) {
    return valorDe(ctx, "select public.satisfacao_salvar_ciclos($1::jsonb) as v", JSON.stringify(ciclos));
  },
});

// Triagem de um comentário (só a visão completa; a função confere de novo).
const satisfacaoTriar = operacao({
  permissao: "indicadores.satisfacao_completo",
  escrita: true,
  entrada: z.object({
    chave: z.string().min(1).max(200),
    acao: z.enum(["", "ocultar", "individual", "loja"]),
  }).strict(),
  async executar({ chave, acao }, ctx) {
    return valorDe<string>(ctx, "select public.satisfacao_triar($1, $2) as v", chave, acao);
  },
});

export const operacoes: Record<string, Operacao> = {
  "pesquisas.climaLerPagina": climaLerPagina,
  "pesquisas.engajamentoLerPagina": engajamentoLerPagina,
  "pesquisas.engajamentoSalvarBase": engajamentoSalvarBase,
  "pesquisas.boletimLerPagina": boletimLerPagina,
  "pesquisas.boletimSalvarHumor": boletimSalvarHumor,
  "pesquisas.boletimSalvarEngNotas": boletimSalvarEngNotas,
  "pesquisas.boletimSalvarSatisfacao": boletimSalvarSatisfacao,
  "pesquisas.boletimSalvarEntrada": boletimSalvarEntrada,
  "pesquisas.boletimFechar": boletimFechar,
  "pesquisas.boletimReabrir": boletimReabrir,
  "pesquisas.boletimResumoPublicado": boletimResumoPublicado,
  "pesquisas.satisfacaoDados": satisfacaoDados,
  "pesquisas.satisfacaoCiclos": satisfacaoCiclos,
  "pesquisas.satisfacaoSalvar": satisfacaoSalvar,
  "pesquisas.satisfacaoSalvarCiclos": satisfacaoSalvarCiclos,
  "pesquisas.satisfacaoTriar": satisfacaoTriar,
};
