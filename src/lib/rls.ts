import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Roda uma operação do hub "como" a pessoa, dentro das RLS originais do
// Supabase (migration 1_rls_original): papel restrito hub_app + auth.uid()
// apontando para ela. Mesmo que uma operação esqueça uma checagem, o banco
// recorta e barra como o Supabase fazia.
//
// somenteLeitura: usado no "Visualizar como" — o Postgres recusa qualquer escrita.
export async function comUsuarioRls<T>(
  usuarioId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  opcoes: { somenteLeitura?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      if (opcoes.somenteLeitura) await tx.$executeRawUnsafe("set transaction read only");
      await tx.$executeRaw`select set_config('app.usuario_id', ${usuarioId}, true)`;
      await tx.$executeRawUnsafe("set local role hub_app");
      return fn(tx);
    },
    { timeout: opcoes.timeoutMs ?? 30_000, maxWait: 10_000 },
  );
}
