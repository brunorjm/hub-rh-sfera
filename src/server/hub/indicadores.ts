import "server-only";
import { z } from "zod";
import { linhasJson, operacao } from "@/server/hub/operacao";

// Carga do módulo Indicadores (legado/js/dal-indicadores.js, fetchAll): tabela a
// tabela, em páginas de até 5000 linhas por id crescente. A RLS recorta as
// linhas; as colunas são escolhidas aqui, nunca pelo navegador.
const TABELAS = [
  "colaboradores", "feedbacks", "one_on_one", "celebracoes",
  "entrevista_pesquisa", "entrevista_solicitacao",
  "twygo_participantes", "twygo_usuarios", "twygo_conteudos",
  "unibe_pdv", "unibe_pessoas", "academia_hering",
  "treinamento_turmas",
] as const;

// Colunas de CADA tabela, escritas (nada de select *): coluna nova no banco
// não desce sem passar por aqui. Base: SELECT_COLUNAS do hub antigo, menos o
// que nenhuma tela usa (conferido em public/legado-ui/js):
// - colaboradores: a "matricula" da Feedz é o CELULAR — não desce;
// - feedbacks e celebrações: o texto da mensagem não desce;
// - one_on_one: matrícula (celular) do liderado, anotações e tópicos das
//   conversas não descem (só parsers.js, no upload, os conhece);
// - twygo_usuarios: CPF não desce.
const COLUNAS: Record<(typeof TABELAS)[number], string> = {
  feedbacks: "id,de,para,unidade,departamento,cargo,anonimo,avaliacao,data",
  celebracoes: "id,codigo,colaborador_enviou,unidade,departamento,papel,cargo_enviou,colaboradores_receberam,cargo_recebeu,curtidas,comentarios,data",
  colaboradores: "id,external_id,nome,nome_completo,email,cpf,cargo,cargo_visivel,unidade,departamento,grupos,papel," +
    "gestor_direto,gestor_email,etnia,sexo,genero,data_nascimento,data_admissao,data_cadastro,situacao,ultimo_acesso," +
    "origem_cadastro,participa_gamificacao,desligamento_tipo,desligamento_motivo,ultimo_dia_trabalhado,idioma,updated_at",
  one_on_one: "id,lider,lider_email,lider_departamento,lider_papel,liderado,liderado_email,unidade,departamento," +
    "liderado_papel,relacao,categoria,data_agendada,data_realizada,status,acoes_ativas_lider,acoes_concluidas_lider," +
    "acoes_ativas_liderado,acoes_concluidas_liderado",
  entrevista_pesquisa: "id,planilha_id,data_inicio,data_conclusao,unidade,departamento,motivo_desligamento," +
    "submotivo_desligamento,data_desligamento,trabalharia_novamente,nps,respostas",
  entrevista_solicitacao: "id,planilha_id,unidade,departamento,data_solicitacao,data_admissao,data_demissao,tempo_trabalho," +
    "tipo,tipo_desligamento,motivo_desligamento,status_feedz,status_entrevista",
  twygo_participantes: "id,content_id,content_title,content_type,nome_completo,email,unidade,departamento,cargo," +
    "data_inscricao,ultimo_acesso,situacao_inscricao,situacao,situacao_ambiente,progresso,nota,frequencia,pontuacao," +
    "carga_horaria,emitido_em,concluido_em,aprovado_em",
  twygo_usuarios: "id,twygo_id,nome_completo,email,ultimo_acesso,perfil,pontuacao,progresso,situacao,registrado_em,cargo," +
    "unidade,departamento",
  twygo_conteudos: "id,codigo_conteudo,tipo,nome,situacao,inscricoes,carga_horaria,progresso,categorias,data_inicio," +
    "data_termino,criado_em,publicado_em",
  unibe_pdv: "id,mes,pdv,nome_pdv,regiao,segmento,gerente,supervisao,multi,adesao,pessoas,unidade,departamento",
  unibe_pessoas: "id,mes,nome,cargo,pdv,nome_pdv,regiao,segmento,adesao,unidade,departamento,no_cadastro,nome_cadastro",
  academia_hering: "id,mes,nome,cargo,loja,ultimo_acesso,horas,performance,unidade,departamento,no_cadastro,nome_cadastro",
  treinamento_turmas: "id,planilha,arquivo,linha,data,tema,tema_original,categoria,modalidade,local,hora_inicio,hora_fim," +
    "horas,publico,marcas,marca_original,canal,convocados,presentes,multiplicadoras,multiplicador_original,alertas," +
    "importado_em,origem,observacao,criado_por,criado_por_nome,atualizado_em,atualizado_por,justificativa,justificado_em," +
    "justificado_por,validacao,validado_por,validado_em,gestor_comentario,ajuste_pedido,ajuste_pedido_por,ajuste_pedido_em",
};

// Respostas antigas do Forms: só a versão anônima (sem nome, e-mail, telefone e CPF).
const ORIGEM: Partial<Record<(typeof TABELAS)[number], string>> = { entrevista_pesquisa: "entrevista_pesquisa_anon" };

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
const listaColunas = (csv: string) => csv.split(",").map((c) => ident(c.trim())).join(", ");

const lerPagina = operacao({
  permissao: "autenticado",
  escrita: false,
  entrada: z.object({
    tabela: z.enum(TABELAS),
    aposId: z.number().int().min(0),
    limite: z.number().int().min(1).max(5000).default(1000),
  }),
  async executar({ tabela, aposId, limite }, { tx }) {
    // Identificadores vêm das constantes acima (enum validado), nunca do pedido.
    const colunas = listaColunas(COLUNAS[tabela]);
    const origem = ident(ORIGEM[tabela] ?? tabela);
    return linhasJson(tx, `select ${colunas} from public.${origem} where id > $1 order by id asc limit $2`, aposId, limite);
  },
});

export const operacoes = {
  "indicadores.lerPagina": lerPagina,
};
