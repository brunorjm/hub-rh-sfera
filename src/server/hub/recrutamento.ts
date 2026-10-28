import "server-only";
import type { Operacao } from "@/server/hub/operacao";

// Operações de: Recrutamento e Treinamento e Desenvolvimento (dal-recrutamento.js e telas de rec-*/tre-onboarding/tre-visita-loja, cadastros do recrutamento).
// Nome de cada operação: "recrutamento.<função>".
export const operacoes: Record<string, Operacao> = {};
