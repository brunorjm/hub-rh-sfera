"use client";

import { signOut } from "next-auth/react";

export function BotaoSair({ className = "btn" }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={() => signOut({ callbackUrl: "/login" })}>
      Sair
    </button>
  );
}
