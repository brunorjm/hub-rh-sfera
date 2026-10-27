import { exigirUsuario } from "@/lib/sessao";
import { PERFIL_LABELS } from "@/lib/rbac/catalogo";
import { BotaoSair } from "@/components/login/BotaoSair";

export const dynamic = "force-dynamic";

// Provisória até o shell (menu + filtros) da fase A6: confirma quem entrou.
export default async function PaginaInicio() {
  const u = await exigirUsuario();
  return (
    <div id="login-screen">
      <div className="login-card">
        <div className="login-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mark" src="/assets/sfera-logo.png" alt="Sfera Multifranquias" />
          <h1>Olá, {u.nome}</h1>
          <p>{PERFIL_LABELS[u.perfil] ?? u.perfil}</p>
        </div>
        <BotaoSair className="btn btn-primary" />
      </div>
    </div>
  );
}
