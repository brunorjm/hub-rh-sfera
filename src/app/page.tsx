import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/sessao";

export const dynamic = "force-dynamic";

export default async function Inicio() {
  redirect((await usuarioAtual()) ? "/hub" : "/login");
}
