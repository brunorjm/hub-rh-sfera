import "server-only";
import type { Operacao } from "@/server/hub/operacao";

// Operações de: Controle e Entrevista de Desligamento, Organograma (organograma_meu_galho).
// Nome de cada operação: "desligamento.<função>".
export const operacoes: Record<string, Operacao> = {};
