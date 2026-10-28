import "server-only";
import type { Operacao } from "@/server/hub/operacao";
import * as indicadores from "@/server/hub/indicadores";

// Lista fechada das operações que as telas podem chamar em /api/hub/<nome>.
// Nome = "<modulo>.<funcao>". Operação fora desta lista não existe (404).
export const OPERACOES: Record<string, Operacao> = {
  "indicadores.lerPagina": indicadores.lerPagina,
};
