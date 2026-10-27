"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trocarSenha } from "@/server/actions/senha";
import { BotaoSair } from "@/components/login/BotaoSair";

export function TelaTrocarSenha({ obrigatoria }: { obrigatoria: boolean }) {
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setErro(null);
    setSalvando(true);
    try {
      const r = await trocarSenha({
        atual: String(f.get("atual") ?? ""),
        nova: String(f.get("nova") ?? ""),
        confirmacao: String(f.get("confirmacao") ?? ""),
      });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      router.replace("/inicio");
      router.refresh();
    } catch {
      setErro("Não foi possível trocar a senha. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div id="login-screen">
      <div className="login-card">
        <div className="login-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mark" src="/assets/sfera-logo.png" alt="Sfera Multifranquias" />
          <h1>{obrigatoria ? "Defina sua senha" : "Trocar senha"}</h1>
          <p>{obrigatoria ? "Primeiro acesso: troque a senha recebida do administrador." : "Mínimo de 8 caracteres."}</p>
        </div>
        <form onSubmit={salvar}>
          <div className="field">
            <label htmlFor="senha-atual">Senha atual</label>
            <input type="password" id="senha-atual" name="atual" autoComplete="current-password" required />
          </div>
          <div className="field">
            <label htmlFor="senha-nova">Nova senha</label>
            <input type="password" id="senha-nova" name="nova" autoComplete="new-password" minLength={8} required />
          </div>
          <div className="field">
            <label htmlFor="senha-confirmacao">Confirme a nova senha</label>
            <input type="password" id="senha-confirmacao" name="confirmacao" autoComplete="new-password" minLength={8} required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar nova senha"}
          </button>
          {erro && <div className="msg err" role="alert">{erro}</div>}
        </form>
        {obrigatoria && <div style={{ marginTop: 14 }}><BotaoSair /></div>}
      </div>
    </div>
  );
}
