import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/sessao";
import { TelaLogin } from "@/components/login/TelaLogin";

export const dynamic = "force-dynamic";

export default async function PaginaLogin() {
  if (await usuarioAtual()) redirect("/inicio");
  return <TelaLogin />;
}
