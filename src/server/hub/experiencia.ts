import "server-only";
import type { Operacao } from "@/server/hub/operacao";

// Operações de: Avaliação da Experiência (dal-experiencia.js, metrics-experiencia.js, experiencia-natal.js).
// Nome de cada operação: "experiencia.<função>".
export const operacoes: Record<string, Operacao> = {};
