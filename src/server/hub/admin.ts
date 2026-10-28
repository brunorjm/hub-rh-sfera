import "server-only";
import type { Operacao } from "@/server/hub/operacao";

// Operações de: Administração: upload, cadastro de acessos, log de acessos, Visualizar como.
// Nome de cada operação: "admin.<função>".
export const operacoes: Record<string, Operacao> = {};
