import "server-only";
import { z } from "zod";
import { linhasJson, operacao } from "@/server/hub/operacao";

// Carga do módulo Indicadores (legado/js/dal-indicadores.js, fetchAll): tabela a
// tabela, em páginas de até 1000 linhas por id crescente. A RLS recorta as
// linhas; as colunas são escolhidas aqui, nunca pelo navegador.
const TABELAS = [
  "colaboradores", "feedbacks", "one_on_one", "celebracoes",
  "entrevista_pesquisa", "entrevista_solicitacao",
  "twygo_participantes", "twygo_usuarios", "twygo_conteudos",
  "unibe_pdv", "unibe_pessoas", "academia_hering",
  "treinamento_turmas",
] as const;

// Mesmas colunas do hub antigo (SELECT_COLUNAS). Em colaboradores a "matricula"
// da Feedz é o CELULAR — não desce; em feedbacks e celebrações o texto também não.
const COLUNAS: Partial<Record<(typeof TABELAS)[number], string>> = {
  feedbacks: "id,de,para,unidade,departamento,cargo,anonimo,avaliacao,data",
  celebracoes: "id,codigo,colaborador_enviou,unidade,departamento,papel,cargo_enviou,colaboradores_receberam,cargo_recebeu,curtidas,comentarios,data",
  colaboradores: "id,external_id,nome,nome_completo,email,cpf,cargo,cargo_visivel,unidade,departamento,grupos,papel," +
    "gestor_direto,gestor_email,etnia,sexo,genero,data_nascimento,data_admissao,data_cadastro,situacao,ultimo_acesso," +
    "origem_cadastro,participa_gamificacao,desligamento_tipo,desligamento_motivo,ultimo_dia_trabalhado,idioma,updated_at",
  entrevista_solicitacao: "id,planilha_id,unidade,departamento,data_solicitacao,data_admissao,data_demissao,tempo_trabalho," +
    "tipo,tipo_desligamento,motivo_desligamento,status_feedz,status_entrevista",
};

// Respostas antigas do Forms: só a versão anônima (sem nome, e-mail, telefone e CPF).
const ORIGEM: Partial<Record<(typeof TABELAS)[number], string>> = { entrevista_pesquisa: "entrevista_pesquisa_anon" };

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
const listaColunas = (csv: string) => csv.split(",").map((c) => ident(c.trim())).join(", ");

export const lerPagina = operacao({
  permissao: "autenticado",
  escrita: false,
  entrada: z.object({
    tabela: z.enum(TABELAS),
    aposId: z.number().int().min(0),
    limite: z.number().int().min(1).max(1000).default(1000),
  }),
  async executar({ tabela, aposId, limite }, { tx }) {
    // Identificadores vêm das constantes acima (enum validado), nunca do pedido.
    const colunas = COLUNAS[tabela] ? listaColunas(COLUNAS[tabela]!) : "*";
    const origem = ident(ORIGEM[tabela] ?? tabela);
    return linhasJson(tx, `select ${colunas} from public.${origem} where id > $1 order by id asc limit $2`, aposId, limite);
  },
});
