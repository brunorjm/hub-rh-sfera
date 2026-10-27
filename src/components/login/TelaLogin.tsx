"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { MENSAGENS_LOGIN, MENSAGEM_PADRAO } from "@/components/login/mensagens";

// Mesma tela de login do hub antigo (legado/index.html, #login-screen).
export function TelaLogin() {
  const router = useRouter();
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function entrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setErro(null);
    setEntrando(true);
    try {
      const r = await signIn("credentials", {
        redirect: false,
        email: String(form.get("email") ?? ""),
        senha: String(form.get("senha") ?? ""),
      });
      if (!r || r.error) {
        setErro(MENSAGENS_LOGIN[r?.error ?? ""] ?? MENSAGEM_PADRAO);
        return;
      }
      router.replace("/inicio");
      router.refresh();
    } catch {
      setErro(MENSAGEM_PADRAO);
    } finally {
      setEntrando(false);
    }
  }

  return (
    <div id="login-screen">
      <div className="login-card">
        <div className="login-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mark" src="/assets/sfera-logo.png" alt="Sfera Multifranquias" />
          <h1>Hub Sfera</h1>
          <p>Indicadores &amp; Recrutamento</p>
        </div>
        <form onSubmit={entrar}>
          <div className="field">
            <label htmlFor="login-email">E-mail</label>
            <input type="email" id="login-email" name="email" autoComplete="username" required />
          </div>
          <div className="field">
            <label htmlFor="login-pass">Senha</label>
            <input type="password" id="login-pass" name="senha" autoComplete="current-password" required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={entrando}>
            {entrando ? "Entrando..." : "Entrar"}
          </button>
          {erro && <div className="msg err" style={{ display: "block" }} role="alert">{erro}</div>}
        </form>
      </div>
    </div>
  );
}
