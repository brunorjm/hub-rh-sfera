import { atenderPublico } from "@/server/publico/api";

export const dynamic = "force-dynamic";

// Link público sem login: { acao: "ler" | "salvar", token, dados } (src/server/publico/api.ts).
export function POST(req: Request) {
  return atenderPublico("conexao-nps", req);
}
