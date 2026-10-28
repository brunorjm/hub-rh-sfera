// Job do container "cron": sincroniza public.twygo_participantes com o Twygo
// (antes: Edge Function do Supabase agendada por pg_cron às 05:00 UTC).
//
// Diferença para o antigo: a troca da tabela é ATÔMICA. Antes apagava tudo e
// inseria em lotes; se a API ou o banco falhassem no meio, os Treinamentos
// ficavam vazios até a próxima execução. Agora, se algo falha, os dados de
// ontem continuam.
//
// Uso: npx tsx prisma/jobs/sync-twygo.ts
// Variáveis: DATABASE_URL e TWYGO_API_TOKEN (Twygo → Configurações →
// Integrações → API). Sem o token o job sai sem mexer em nada.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { gravarParticipantes, montarLinhas, twygoBuscarTudo } from "@/lib/twygo";

async function main() {
  const token = process.env.TWYGO_API_TOKEN;
  if (!token) {
    console.info("[sync-twygo] TWYGO_API_TOKEN não configurado: nada a fazer.");
    return;
  }

  const inicio = Date.now();
  const [attendees, users, contents] = await Promise.all([
    twygoBuscarTudo("/attendees", token, "attendees"),
    twygoBuscarTudo("/users", token, "users"),
    twygoBuscarTudo("/contents", token, "contents"),
  ]);
  const linhas = montarLinhas(attendees, users, contents);
  // A API às vezes responde vazio quando está instável: não apaga o que existe.
  if (!linhas.length) throw new Error("Twygo devolveu 0 inscrições; tabela mantida.");

  const prisma = new PrismaClient();
  try {
    await gravarParticipantes(prisma, linhas);
  } finally {
    await prisma.$disconnect();
  }
  console.info(`[sync-twygo] ok: ${linhas.length} inscrições em ${Math.round((Date.now() - inicio) / 1000)}s.`);
}

main().catch((err) => {
  console.error("[sync-twygo] falhou; dados anteriores mantidos:", String(err?.message ?? err));
  process.exit(1);
});
