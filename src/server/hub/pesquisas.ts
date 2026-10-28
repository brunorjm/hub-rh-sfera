import "server-only";
import type { Operacao } from "@/server/hub/operacao";

// Operações de: Pesquisa de Clima, Engajamento, Boletim da Liderança e Satisfação.
// Nome de cada operação: "pesquisas.<função>".
export const operacoes: Record<string, Operacao> = {};
