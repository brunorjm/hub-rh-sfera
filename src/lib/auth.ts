import "server-only";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { autenticar, FalhaLogin, registrarAcesso } from "@/lib/login";
import { ipDoPedido } from "@/lib/limite-login";
import { registrarJti, revogarJti } from "@/lib/sessao-revogacao";

const OITO_HORAS = 8 * 60 * 60;

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: OITO_HORAS },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    CredentialsProvider({
      name: "E-mail e senha",
      credentials: { email: { type: "email" }, senha: { type: "password" } },
      async authorize(credentials, req) {
        try {
          const conta = await autenticar(
            String(credentials?.email ?? ""),
            String(credentials?.senha ?? ""),
            ipDoPedido(req?.headers),
            String(req?.headers?.["user-agent"] ?? ""),
          );
          return { id: conta.id, email: conta.email, name: conta.nome, trocarSenha: conta.trocarSenha };
        } catch (err) {
          // NextAuth devolve a mensagem do erro em `error`; só códigos conhecidos saem.
          if (err instanceof FalhaLogin) throw new Error(err.codigo);
          console.error("[login] erro inesperado", err);
          throw new Error("FALHA");
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.jti = crypto.randomUUID();
        token.trocarSenha = (user as { trocarSenha?: boolean }).trocarSenha === true;
        await registrarJti(user.id, token.jti);
      }
      return token;
    },
    async session({ session, token }) {
      // Só o necessário para identificar a sessão; perfil e permissões são
      // lidos do banco no servidor (src/lib/sessao.ts), nunca do token.
      session.uid = token.uid as string;
      session.jti = token.jti as string;
      return session;
    },
  },
  events: {
    async signOut({ token }) {
      if (token?.jti) await revogarJti(token.jti as string);
      if (token?.uid) await registrarAcesso(token.uid as string, "logout");
    },
  },
};
