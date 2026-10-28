import "server-only";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import type { UsuarioHub } from "@/lib/sessao";

// Uma operação do hub: o que as telas antigas pediam ao Supabase vira uma
// destas. Toda operação declara a permissão (ou "autenticado" de propósito),
// valida a entrada e roda dentro das RLS originais (src/lib/rls.ts).
export type ContextoOperacao = {
  usuario: UsuarioHub;
  tx: Prisma.TransactionClient;
};

export type Operacao<E extends z.ZodTypeAny = z.ZodTypeAny, S = unknown> = {
  // Chave(s) do catálogo; lista = basta uma. "autenticado" = qualquer conta ativa
  // (a RLS ainda recorta as linhas), escolha explícita para não ser esquecimento.
  permissao: string | string[] | "autenticado";
  // Escrita é recusada no "Visualizar como".
  escrita: boolean;
  entrada: E;
  executar: (dados: z.infer<E>, ctx: ContextoOperacao) => Promise<S>;
};

export function operacao<E extends z.ZodTypeAny, S>(op: Operacao<E, S>): Operacao<E, S> {
  return op;
}

// Linhas no MESMO formato JSON que o Supabase (PostgREST) devolvia: o próprio
// Postgres serializa (date → "2026-10-27", bigint/numeric → número,
// timestamptz → ISO com fuso). As telas antigas dependem desse formato.
export async function linhasJson(
  tx: Prisma.TransactionClient,
  sql: string,
  ...parametros: unknown[]
): Promise<Record<string, unknown>[]> {
  const [r] = await tx.$queryRawUnsafe<{ j: Record<string, unknown>[] }[]>(
    `select coalesce(json_agg(t), '[]'::json) as j from (${sql}) t`,
    ...parametros,
  );
  return r?.j ?? [];
}

// Mensagem do Postgres para a tela: o Prisma repassa com o prefixo da
// severidade ("ERROR: Link inválido..."); o Supabase mostrava só o texto.
export function mensagemDoBanco(mensagem: string | undefined | null, padrao: string): string {
  const texto = (mensagem ?? "").replace(/^(ERROR|ERRO):\s*/i, "").trim();
  return texto || padrao;
}

// Resumo de um erro para o log do servidor: classe, código e o começo da
// mensagem, sem o objeto inteiro do Prisma (que carrega a consulta e os
// parâmetros) e sem trechos entre aspas/parênteses, onde o Postgres repete
// valores ("Key (email)=(x@y) already exists", invalid input "abc").
export function resumoErro(e: unknown): string {
  const err = e as { name?: string; code?: string; meta?: { code?: string; message?: string }; message?: string } | null;
  const codigo = err?.meta?.code ?? err?.code ?? "-";
  const msg = String(err?.meta?.message ?? err?.message ?? e ?? "")
    .split("\n")[0]!
    .replace(/"[^"]*"|'[^']*'|`[^`]*`|\([^)]*\)/g, "…")
    .slice(0, 120);
  return `${err?.name ?? "Erro"} code=${codigo} ${msg}`.trim();
}

export class ErroOperacao extends Error {
  constructor(public status: number, mensagem: string) {
    super(mensagem);
  }
}
