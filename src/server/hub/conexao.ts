import "server-only";
import type { Operacao } from "@/server/hub/operacao";

// Operações de: Conexão RH (store, NPS, Fit Cultural).
// Nome de cada operação: "conexao.<função>".
export const operacoes: Record<string, Operacao> = {};
