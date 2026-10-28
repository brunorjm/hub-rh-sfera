import { exigirUsuario } from "@/lib/sessao";
import { TelaTrocarSenha } from "@/components/login/TelaTrocarSenha";

export const dynamic = "force-dynamic";

export default async function PaginaTrocarSenha() {
  const u = await exigirUsuario({ permitirTrocaPendente: true });
  return <TelaTrocarSenha obrigatoria={u.trocarSenha} />;
}
