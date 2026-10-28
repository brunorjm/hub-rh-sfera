import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    uid: string;
    jti: string;
    // Quando o login aconteceu (ms desde 1970); ver auth.ts.
    iat: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    jti?: string;
    // Identificador estável da sessão (auth.ts); o jti do JWT muda a cada recodificação.
    sid?: string;
    trocarSenha?: boolean;
    loginEm?: number;
  }
}
