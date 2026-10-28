import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { temAlguma } from "@/lib/rbac/permissoes";
import { ErroOperacao, linhasJson, operacao, type ContextoOperacao, type Operacao } from "@/server/hub/operacao";

// Operações de: Recrutamento e Treinamento e Desenvolvimento (dal-recrutamento.js e telas de rec-*/tre-onboarding/tre-visita-loja, cadastros do recrutamento).
// Nome de cada operação: "recrutamento.<função>".
//
// O dal-recrutamento.js antigo era genérico (insertRow/updateRow/deleteRow por
// nome de tabela); aqui as tabelas e as colunas vêm só das listas abaixo. A RLS
// original recorta as linhas; as permissões por tabela espelham as policies
// (test/acesso/policies-supabase.json) para devolver 403 claro em vez de "nada".

// Tabelas que o HUB_RECRUIT.reload() baixa (RECRUIT_TABLES no navegador).
const OPERACIONAIS = [
  "vagas", "candidatos", "entrevistas", "onboarding", "visitas_loja",
  "pareceres_gestor", "entrevistas_desligamento", "controle_desligamento",
] as const;
type Operacional = (typeof OPERACIONAIS)[number];

// Listas mestre (MASTER_TABLES), editadas em Administração → Cadastros do Recrutamento.
const CADASTROS = [
  "unidades", "cargos", "etapas", "fontes_captacao", "portais", "niveis_vaga", "recrutadores", "recrutamento_departamentos",
] as const;

// Colunas de cada tabela (o mesmo "*" que o Supabase devolvia, só que escrito).
// Também é a lista do que o navegador pode gravar: chave fora dela é recusada.
const COLUNAS: Record<Operacional, readonly string[]> = {
  vagas: (
    "id,data_abertura,marca,unidade,departamento,nivel_vaga,solicitante,cargo,sigilosa,tipo_vaga,responsavel,status," +
    "tipo_movimentacao,motivo_aumento,pessoa_substituida,tipo_recrutamento,etapa,motivo_sla,motivo_sla_text,data_congelamento," +
    "data_retorno,data_cancelamento,finalistas,contratado,fit_pct,data_fechamento,data_inicio,data_prevista_admissao," +
    "ultima_divulgacao,data_ultima_divulgacao,fonte,quem_indicou,observacoes,portais_ativos,fontes_divulgadas,num_inscricoes," +
    "criado_em,atualizado_em,cota,tipo_cota,hub_alterado_em"
  ).split(","),
  candidatos: (
    "id,vaga_id,nome,email,contato,linkedin,cargo,marca,departamento,nivel_vaga,entrevistado_por,data_entrevista," +
    "horario_entrevista,fit_pct,etapa_rh_status,resultado_rh,data_contato_rh,data_agendada_rh,motivo_reprovacao," +
    "etapa_analise_status,resultado_analise,data_contato_analise,data_agendada_analise,motivo_analise,data_analise," +
    "etapa_checagem_status,resultado_checagem,data_contato_checagem,data_agendada_checagem,motivo_checagem,data_checagem," +
    "teste_pratico,data_teste_pratico,etapa_gestor_status,resultado_gestor,data_contato_gestor,data_agendada_gestor," +
    "entrevista_gestor,data_entrevista_gestor,horario_gestor,entrevista_diretoria,data_entrevista_diretoria,resultado_final," +
    "resultado,data_fechamento,fonte_captacao,data_admissao,observacoes,tags,atualizado_por,segmento_ultima_empresa,genero," +
    "faixa_etaria,distancia_km,escolaridade,estuda,turno_estudo,cargos_possiveis,link_pandape,estado_civil,tem_filhos," +
    "quantidade_filhos,criado_em,atualizado_em,tipo_transporte,quantidade_passagens,valor_total_transporte,unidade,hub_alterado_em"
  ).split(","),
  entrevistas: (
    "id,candidato_id,candidato_nome,vaga_id,cargo,marca,recrutador,etapa,tipo_entrevista,data,horario,duracao,status," +
    "tipo_processo,nivel_vaga,observacao,criado_em,unidade"
  ).split(","),
  onboarding: (
    "id,candidato_id,candidato_nome,vaga_id,cargo,marca,departamento,unidade,nivel_vaga,data_prevista_admissao,status," +
    "motivo_nao_realizado,data_onboarding,local,enviado_por,enviado_em,criado_em,modalidade,carga_horaria,observacoes," +
    "pontuacao_comportamento,pontuacao_atendimento,pontuacao_cultura,pontuacao_engajamento,nota_final"
  ).split(","),
  visitas_loja: (
    "id,area,loja,data_visita,todos_presentes,colaboradores_ausentes,justificativa_ausencia,clima_equipe,clima_melhorar," +
    "clima_exemplo,uniformizados,nao_uniformizados,justificativa_uniforme,postura_gerente,postura_gerente_melhorar," +
    "postura_gerente_exemplo,postura_consultores,postura_consultores_melhorar,postura_consultores_exemplo,iniciativa_time," +
    "iniciativa_time_melhorar,iniciativa_time_exemplo,se_apresentam,nao_se_apresentam,perguntam_motivo,nao_perguntam_motivo," +
    "perguntam_nome,nao_perguntam_nome,momento_cpf,quais_nao_cpf_inicio,explicam_fidelidade,nao_explicam_fidelidade," +
    "incentivam_experimentar,nao_incentivam_experimentar,oferece_adicional,nao_oferece_adicional,borrifa_fragrancia," +
    "nao_borrifa_fragrancia,menciona_boti_recicla,nao_menciona_boti_recicla,etapas_experimentacao,etapas_experimentacao_falta," +
    "incentiva_beautybox,nao_incentiva_beautybox,entendeu_desejo,entendeu_desejo_melhorar,falou_preco_quando_perguntado," +
    "preco_nao_seguiram,criou_oportunidades,oportunidades_melhorar,aproveitou_acompanhante,acompanhante_melhorar," +
    "experimentar_premium,premium_melhorar,usou_pre_venda,pre_venda_melhorar,apresentou_alavancas,alavancas_melhorar," +
    "organizou_caixa_presente,caixa_presente_melhorar,ofereceu_acessorios_make,acessorios_melhorar,destacou_descontos," +
    "descontos_melhorar,mostrou_confianca,confianca_melhorar,nota_clima_engajamento,nota_botileza,nota_atendimento360," +
    "nota_geral,criado_por,criado_em"
  ).split(","),
  pareceres_gestor: (
    "id,candidato_id,candidato_nome,vaga_id,cargo,marca,departamento,modelo,recrutador,status,dados,nivel_recomendacao," +
    "parecer_final,justificativa,preenchido_por,data_finalizacao,criado_em,atualizado_em,link_token,unidade"
  ).split(","),
  entrevistas_desligamento: (
    "id,colaborador_external_id,colaborador_nome,colaborador_cpf,colaborador_email,colaborador_telefone,cargo,data_admissao," +
    "data_desligamento,unidade,departamento,unidade_trabalho,local,departamento_forms,respostas,status,link_token,gerado_por," +
    "data_finalizacao,criado_em,atualizado_em,id_desligamento"
  ).split(","),
  controle_desligamento: (
    "id,id_desligamento,data_solicitacao,solicitante,colaborador_external_id,colaborador_nome,colaborador_cpf,contato,cargo," +
    "unidade,departamento,data_admissao,data_demissao,tipo,tipo_desligamento,motivo,status_feedz,status_entrevista," +
    "data_realizacao,observacoes,extra_natal,criado_por,criado_em,atualizado_por,atualizado_em,motivo_detalhe"
  ).split(","),
};

// Tipo do id de cada tabela (paginação por id e busca por id).
const TIPO_ID: Record<Operacional, "text" | "uuid" | "bigint"> = {
  vagas: "text", candidatos: "text", entrevistas: "uuid", onboarding: "uuid", visitas_loja: "text",
  pareceres_gestor: "text", entrevistas_desligamento: "text", controle_desligamento: "bigint",
};

// Só vagas e candidatos têm hub_alterado_em (baixar só o que mudou).
const COM_DELTA = new Set<Operacional>(["vagas", "candidatos"]);

// Quem abre uma tela que chama HUB_RECRUIT.reload() (RECRUIT_SECTIONS em app.js)
// ou lê alguma destas tabelas pela policy. Cada tabela continua recortada pela
// RLS: sem a permissão daquela tabela, ela vem vazia, como no Supabase.
const LEITURA = [
  "recrutamento.dashboard", "indicadores.recrutamento", "recrutamento.vagas", "recrutamento.candidatos",
  "recrutamento.agenda", "recrutamento.banco_talentos", "recrutamento.aprovacoes", "recrutamento.historico",
  "recrutamento.parecer_gestor", "recrutamento.transferencia",
  "treinamento_dev.onboarding", "treinamento_dev.visita_loja",
  "indicadores.controle_desligamento", "indicadores.desligamento", "indicadores.fechamento",
];

// Permissões de escrita por tabela, iguais às das policies de INSERT/UPDATE/DELETE.
// Tabela fora do mapa não aceita aquela escrita (nenhuma tela antiga fazia).
const INSERIR: Partial<Record<Operacional, string[]>> = {
  vagas: ["recrutamento.vagas"],
  candidatos: ["recrutamento.candidatos", "recrutamento.parecer_gestor"],
  entrevistas: ["recrutamento.agenda", "recrutamento.candidatos"],
  onboarding: ["recrutamento.candidatos", "treinamento_dev.onboarding"],
  visitas_loja: ["treinamento_dev.visita_loja"],
  pareceres_gestor: ["recrutamento.candidatos"],
  // A policy ainda aceita a chave antiga indicadores.desligamento_gerar_link, que saiu do
  // Cadastro de Acessos (supabase-permissao-link-controle.sql) e não está no catálogo.
  entrevistas_desligamento: ["indicadores.controle_desligamento"],
  controle_desligamento: ["indicadores.controle_desligamento"],
};
const ATUALIZAR: Partial<Record<Operacional, string[]>> = {
  vagas: ["recrutamento.vagas"],
  candidatos: ["recrutamento.candidatos", "recrutamento.parecer_gestor"],
  entrevistas: ["recrutamento.agenda", "recrutamento.candidatos"],
  onboarding: ["treinamento_dev.onboarding", "recrutamento.vagas"],
  pareceres_gestor: ["recrutamento.parecer_gestor", "recrutamento.candidatos"],
  controle_desligamento: ["indicadores.controle_desligamento"],
};
const EXCLUIR: Partial<Record<Operacional, string[]>> = {
  vagas: ["recrutamento.vagas"],
  candidatos: ["recrutamento.candidatos"],
};

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
const unir = (m: Partial<Record<string, string[]>>) => [...new Set(Object.values(m).flat() as string[])];
const quem = (u: ContextoOperacao["usuario"]) => u.nome || u.email || "Desconhecido";

function exigir(mapa: Partial<Record<Operacional, string[]>>, tabela: Operacional, ctx: ContextoOperacao): void {
  const chaves = mapa[tabela];
  if (!chaves) throw new ErroOperacao(400, `Gravação não permitida em ${tabela}.`);
  if (!temAlguma(ctx.usuario, chaves)) throw new ErroOperacao(403, "Sem permissão para esta operação.");
}

// Autoria: quem fez vem da sessão, no mesmo formato que as telas antigas
// gravavam (HUB_USER.nome || HUB_USER.email || "Desconhecido"), nunca do
// navegador. Ao criar, a coluna é preenchida sempre. Ao editar, quem editou
// (atualizado_por) é sobrescrito quando vem no pedido; quem criou/enviou/gerou
// não muda (o valor do navegador é descartado — a tela de Onboarding manda a
// linha inteira de volta). controle_desligamento.solicitante NÃO entra: é o
// gestor que pediu o desligamento, escolhido no formulário.
// pareceres_gestor.preenchido_por vem do gestor externo, pela página pública.
const AUTORIA_CRIAR: Partial<Record<Operacional, readonly string[]>> = {
  candidatos: ["atualizado_por"],
  onboarding: ["enviado_por"],
  visitas_loja: ["criado_por"],
  entrevistas_desligamento: ["gerado_por"],
  controle_desligamento: ["criado_por", "atualizado_por"],
};
const AUTORIA_EDITAR: Partial<Record<Operacional, readonly string[]>> = {
  candidatos: ["atualizado_por"],
  controle_desligamento: ["atualizado_por"],
};
const AUTORIA_FIXA: Partial<Record<Operacional, readonly string[]>> = {
  onboarding: ["enviado_por"],
  visitas_loja: ["criado_por"],
  entrevistas_desligamento: ["gerado_por"],
  controle_desligamento: ["criado_por"],
};

// Links públicos: o token sai do servidor (32 bytes aleatórios em hex, 64
// caracteres), nunca do navegador. Qualquer link_token não vazio no pedido é
// trocado; a tela monta o link com o token devolvido na linha gravada.
const COM_LINK = new Set<Operacional>(["pareceres_gestor", "entrevistas_desligamento"]);
const novoToken = () => randomBytes(32).toString("hex");

function linhaDoServidor(
  tabela: Operacional,
  l: Record<string, unknown>,
  acao: "criar" | "editar",
  ctx: ContextoOperacao,
): Record<string, unknown> {
  const r = { ...l };
  const autor = quem(ctx.usuario);
  if (acao === "criar") {
    for (const c of AUTORIA_CRIAR[tabela] ?? []) r[c] = autor;
  } else {
    for (const c of AUTORIA_FIXA[tabela] ?? []) delete r[c];
    for (const c of AUTORIA_EDITAR[tabela] ?? []) if (Object.hasOwn(r, c)) r[c] = autor;
  }
  if (COM_LINK.has(tabela) && Object.hasOwn(r, "link_token") && r.link_token != null && r.link_token !== "") {
    r.link_token = novoToken();
  }
  return r;
}

// Colunas do pedido, conferidas contra a lista do servidor. O SQL só usa os
// nomes da lista; os valores vão num parâmetro JSON convertido pelo próprio
// Postgres (json_populate_record), como o PostgREST fazia.
function colunasDoPedido(tabela: Operacional, linha: Record<string, unknown>): string[] {
  const permitidas = COLUNAS[tabela];
  const fora = Object.keys(linha).filter((k) => !permitidas.includes(k));
  if (fora.length) throw new ErroOperacao(400, `Coluna desconhecida em ${tabela}: ${fora.slice(0, 3).join(", ")}.`);
  const cols = permitidas.filter((c) => Object.hasOwn(linha, c));
  if (!cols.length) throw new ErroOperacao(400, "Nada para gravar.");
  return cols;
}

async function jsonDe(ctx: ContextoOperacao, sql: string, ...parametros: unknown[]): Promise<Record<string, unknown>[]> {
  const [r] = await ctx.tx.$queryRawUnsafe<{ j: Record<string, unknown>[] }[]>(sql, ...parametros);
  return r?.j ?? [];
}

const tabelaOperacional = z.enum(OPERACIONAIS);
const idLinha = z.union([z.string().min(1).max(200), z.number().int()]);
const linha = z
  .record(z.string().max(63), z.unknown())
  .refine((l) => Object.keys(l).length <= 200 && JSON.stringify(l).length <= 500_000, "Registro grande demais.");
const textoOpcional = z.union([z.string().max(20_000), z.number(), z.boolean(), z.null()]).optional();

// ---- Leitura (HUB_RECRUIT.reload) ----------------------------------------

// hub_versoes: um contador por tabela; o navegador só baixa o que mudou.
const versoes = operacao({
  permissao: LEITURA,
  escrita: false,
  entrada: z.object({}).strict(),
  async executar(_d, { tx }) {
    return linhasJson(tx, "select tabela, versao, alterado_em from public.hub_versoes");
  },
});

// Uma página de uma tabela, por id crescente (antes: range de 1000 do PostgREST).
// soIds: só a coluna id (para tirar as apagadas). desde: só as linhas alteradas
// depois do instante (vagas e candidatos).
const lerPagina = operacao({
  permissao: LEITURA,
  escrita: false,
  entrada: z.object({
    tabela: tabelaOperacional,
    aposId: idLinha.nullable().default(null),
    limite: z.number().int().min(1).max(1000).default(1000),
    soIds: z.boolean().default(false),
    desde: z.string().datetime({ offset: true }).optional(),
  }).strict(),
  async executar({ tabela, aposId, limite, soIds, desde }, { tx }) {
    if (desde && !COM_DELTA.has(tabela)) throw new ErroOperacao(400, `${tabela} não tem controle de alteração.`);
    const colunas = soIds ? "id" : COLUNAS[tabela].map(ident).join(", ");
    const filtros = [`($1::text is null or id > $1::text::${TIPO_ID[tabela]})`];
    const params: unknown[] = [aposId == null ? null : String(aposId), limite];
    if (desde) {
      filtros.push("hub_alterado_em > $3::timestamptz");
      params.push(desde);
    }
    return linhasJson(
      tx,
      `select ${colunas} from public.${ident(tabela)} where ${filtros.join(" and ")} order by id asc limit $2`,
      ...params,
    );
  },
});

// Resumos sem dado pessoal para os Indicadores (supabase-links-privacidade.sql).
// As funções já checam a permissão e o recorte por dentro (security definer).
const RESUMOS = [
  "controle_desligamento_indicadores", "entrevistas_desligamento_indicadores", "controle_desligamento_respostas_forms_resumo",
] as const;
const resumo = operacao({
  permissao: LEITURA,
  escrita: false,
  entrada: z.object({ funcao: z.enum(RESUMOS) }).strict(),
  async executar({ funcao }, { tx }) {
    return linhasJson(tx, `select * from public.${ident(funcao)}()`);
  },
});

// Listas mestre: qualquer conta logada lia pela policy; aqui, quem usa as telas
// do Recrutamento ou os Cadastros (são as únicas que leem estas listas).
const COLUNAS_CADASTRO = (t: (typeof CADASTROS)[number]) =>
  t === "recrutamento_departamentos" ? "id, nome, unidade, ativo" : "id, nome, ativo";
const listarCadastro = operacao({
  permissao: [...LEITURA, "admin.cadastros_recrutamento"],
  escrita: false,
  entrada: z.object({ tabela: z.enum(CADASTROS) }).strict(),
  async executar({ tabela }, { tx }) {
    return linhasJson(tx, `select ${COLUNAS_CADASTRO(tabela)} from public.${ident(tabela)} order by nome`);
  },
});

// ---- Escrita genérica (insertRow / updateRow / deleteRow) ----------------

const inserir = operacao({
  permissao: unir(INSERIR),
  escrita: true,
  entrada: z.object({ tabela: tabelaOperacional, linha }).strict(),
  async executar({ tabela, linha: pedido }, ctx) {
    exigir(INSERIR, tabela, ctx);
    colunasDoPedido(tabela, pedido);
    const l = linhaDoServidor(tabela, pedido, "criar", ctx);
    const cols = colunasDoPedido(tabela, l).map(ident).join(", ");
    const t = `public.${ident(tabela)}`;
    const [r] = await jsonDe(
      ctx,
      `with r as (insert into ${t} (${cols}) select ${cols} from json_populate_record(null::${t}, $1::json) returning *)
       select coalesce(json_agg(r), '[]'::json) as j from r`,
      JSON.stringify(l),
    );
    return r ?? null;
  },
});

const atualizar = operacao({
  permissao: unir(ATUALIZAR),
  escrita: true,
  entrada: z.object({ tabela: tabelaOperacional, id: idLinha, linha }).strict(),
  async executar({ tabela, id, linha: pedido }, ctx) {
    exigir(ATUALIZAR, tabela, ctx);
    colunasDoPedido(tabela, pedido);
    const l = linhaDoServidor(tabela, pedido, "editar", ctx);
    const sets = colunasDoPedido(tabela, l).map((c) => `${ident(c)} = n.${ident(c)}`).join(", ");
    const t = `public.${ident(tabela)}`;
    const [r] = await jsonDe(
      ctx,
      `with r as (update ${t} as a set ${sets} from json_populate_record(null::${t}, $1::json) as n
                  where a.id = $2::text::${TIPO_ID[tabela]} returning a.*)
       select coalesce(json_agg(r), '[]'::json) as j from r`,
      JSON.stringify(l),
      String(id),
    );
    // O .single() do Supabase falhava quando a linha não existia ou a RLS escondia.
    if (!r) throw new ErroOperacao(404, "Registro não encontrado (ou fora do seu acesso).");
    return r;
  },
});

const excluir = operacao({
  permissao: unir(EXCLUIR),
  escrita: true,
  entrada: z.object({ tabela: tabelaOperacional, id: idLinha }).strict(),
  async executar({ tabela, id }, ctx) {
    exigir(EXCLUIR, tabela, ctx);
    await ctx.tx.$executeRawUnsafe(
      `delete from public.${ident(tabela)} where id = $1::text::${TIPO_ID[tabela]}`,
      String(id),
    );
    return null;
  },
});

// upsertMaster: cria ou edita (por id) um item das listas mestre; "remover" é
// só ativo = false (nunca delete físico).
const salvarCadastro = operacao({
  permissao: "admin.cadastros_recrutamento",
  escrita: true,
  entrada: z.object({
    tabela: z.enum(CADASTROS),
    linha: z.object({
      id: z.number().int().positive().optional(),
      nome: z.string().trim().min(1).max(200),
      ativo: z.boolean().optional(),
      unidade: z.string().max(200).nullable().optional(),
    }).strict(),
  }).strict(),
  async executar({ tabela, linha: l }, { tx }) {
    if (l.unidade !== undefined && tabela !== "recrutamento_departamentos") {
      throw new ErroOperacao(400, `Coluna desconhecida em ${tabela}: unidade.`);
    }
    const cols = ["id", "nome", "ativo", "unidade"].filter((c) => Object.hasOwn(l, c) && l[c as keyof typeof l] !== undefined);
    const lista = cols.map(ident).join(", ");
    const sets = cols.filter((c) => c !== "id").map((c) => `${ident(c)} = excluded.${ident(c)}`).join(", ");
    const t = `public.${ident(tabela)}`;
    await tx.$executeRawUnsafe(
      `insert into ${t} (${lista}) select ${lista} from json_populate_record(null::${t}, $1::json)
       on conflict (id) do update set ${sets}`,
      JSON.stringify(l),
    );
    return null;
  },
});

// ---- Histórico e solicitações --------------------------------------------

// logAcao: quem fez vem da sessão, não do navegador.
const registrarAcao = operacao({
  permissao: ["recrutamento.vagas", "recrutamento.candidatos", "recrutamento.agenda", "recrutamento.aprovacoes"],
  escrita: true,
  entrada: z.object({
    acao: z.string().min(1).max(500),
    vaga_id: textoOpcional,
    campo: textoOpcional,
    valor_anterior: textoOpcional,
    valor_novo: textoOpcional,
    detalhes: textoOpcional,
  }).strict(),
  async executar(d, { tx, usuario }) {
    const txt = (v: unknown) => (v == null ? null : String(v));
    await tx.$executeRaw`
      insert into public.historico (acao, vaga_id, campo, valor_anterior, valor_novo, detalhes, usuario)
      values (${d.acao}, ${txt(d.vaga_id)}, ${txt(d.campo)}, ${txt(d.valor_anterior)}, ${txt(d.valor_novo)},
              ${txt(d.detalhes)}, ${quem(usuario)})`;
    return null;
  },
});

const listarHistorico = operacao({
  permissao: "recrutamento.historico",
  escrita: false,
  entrada: z.object({}).strict(),
  async executar(_d, { tx }) {
    return linhasJson(
      tx,
      `select id, "timestamp", acao, vaga_id, campo, valor_anterior, valor_novo, detalhes, usuario
       from public.historico order by "timestamp" desc limit 1000`,
    );
  },
});

const listarSolicitacoes = operacao({
  permissao: "recrutamento.aprovacoes",
  escrita: false,
  entrada: z.object({}).strict(),
  async executar(_d, { tx }) {
    return linhasJson(
      tx,
      `select id, tipo, payload, descricao, solicitante, perfil_solicitante, data_solicitacao, status, aprovado_por,
              data_decisao, observacao_admin
       from public.solicitacoes order by data_solicitacao desc`,
    );
  },
});

// Pedido de exclusão/mudança que vai para Aprovações. Solicitante, perfil e
// status "Pendente" vêm do servidor.
const criarSolicitacao = operacao({
  permissao: ["recrutamento.vagas", "recrutamento.candidatos", "recrutamento.agenda"],
  escrita: true,
  entrada: z.object({
    tipo: z.string().min(1).max(100),
    payload: z.record(z.string().max(100), z.unknown()).refine((p) => JSON.stringify(p).length <= 20_000, "Pedido grande demais."),
    descricao: z.string().max(5000).nullable().optional(),
  }).strict(),
  async executar(d, { tx, usuario }) {
    await tx.$executeRaw`
      insert into public.solicitacoes (tipo, payload, descricao, solicitante, perfil_solicitante, status)
      values (${d.tipo}, ${JSON.stringify(d.payload)}::jsonb, ${d.descricao ?? null}, ${quem(usuario)}, ${usuario.perfil}, 'Pendente')`;
    return null;
  },
});

const decidirSolicitacao = operacao({
  permissao: "recrutamento.aprovacoes",
  escrita: true,
  entrada: z.object({
    id: z.string().uuid(),
    status: z.enum(["Aprovada", "Rejeitada"]),
    observacao: z.string().max(5000).nullable().optional(),
  }).strict(),
  async executar(d, { tx, usuario }) {
    await tx.$executeRaw`
      update public.solicitacoes
      set status = ${d.status}, aprovado_por = ${quem(usuario)}, data_decisao = now(), observacao_admin = ${d.observacao || null}
      where id = ${d.id}::uuid`;
    return null;
  },
});

export const operacoes: Record<string, Operacao> = {
  "recrutamento.versoes": versoes,
  "recrutamento.lerPagina": lerPagina,
  "recrutamento.resumo": resumo,
  "recrutamento.listarCadastro": listarCadastro,
  "recrutamento.inserir": inserir,
  "recrutamento.atualizar": atualizar,
  "recrutamento.excluir": excluir,
  "recrutamento.salvarCadastro": salvarCadastro,
  "recrutamento.registrarAcao": registrarAcao,
  "recrutamento.listarHistorico": listarHistorico,
  "recrutamento.listarSolicitacoes": listarSolicitacoes,
  "recrutamento.criarSolicitacao": criarSolicitacao,
  "recrutamento.decidirSolicitacao": decidirSolicitacao,
};
