import "server-only";
import type { Operacao } from "@/server/hub/operacao";

// Operações de: Fechamento do Período (dal-fechamento.js, sections/fechamento.js).
// Nome de cada operação: "fechamento.<função>".
export const operacoes: Record<string, Operacao> = {};
