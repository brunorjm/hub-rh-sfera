import "server-only";
import type { Operacao } from "@/server/hub/operacao";
import { operacoes as indicadores } from "@/server/hub/indicadores";
import { operacoes as recrutamento } from "@/server/hub/recrutamento";
import { operacoes as experiencia } from "@/server/hub/experiencia";
import { operacoes as pesquisas } from "@/server/hub/pesquisas";
import { operacoes as fechamento } from "@/server/hub/fechamento";
import { operacoes as turmas } from "@/server/hub/turmas";
import { operacoes as desligamento } from "@/server/hub/desligamento";
import { operacoes as conexao } from "@/server/hub/conexao";
import { operacoes as admin } from "@/server/hub/admin";

// Lista fechada das operações que as telas podem chamar em /api/hub/<nome>.
// Nome = "<modulo>.<funcao>"; cada módulo mantém as suas no próprio arquivo.
// Operação fora desta lista não existe (404).
const MODULOS: Record<string, Record<string, Operacao>> = {
  indicadores, recrutamento, experiencia, pesquisas, fechamento, turmas, desligamento, conexao, admin,
};

export const OPERACOES: Record<string, Operacao> = {};
for (const [modulo, ops] of Object.entries(MODULOS)) {
  for (const [nome, op] of Object.entries(ops)) {
    if (!nome.startsWith(modulo + ".")) throw new Error(`Operação ${nome} fora do prefixo do módulo ${modulo}.`);
    if (Object.hasOwn(OPERACOES, nome)) throw new Error(`Operação ${nome} registrada duas vezes.`);
    OPERACOES[nome] = op;
  }
}
