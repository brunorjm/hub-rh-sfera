import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// As funções SQL herdadas do Supabase usam auth.uid() para saber quem pede.
// No banco próprio, auth.uid() lê app.usuario_id (migration 0_baseline), que
// vale só dentro desta transação (set_config(..., true)).
export async function comUsuarioSql<T>(usuarioId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.usuario_id', ${usuarioId}, true)`;
    return fn(tx);
  });
}
