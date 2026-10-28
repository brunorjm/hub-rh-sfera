import { paginaPublica } from "@/server/publico/paginas";

export const dynamic = "force-dynamic";

// Página pública sem login (link antigo reescrito para cá em next.config.ts).
export function GET() {
  return paginaPublica("parecer");
}
