import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    uid: string;
    jti: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    jti?: string;
    trocarSenha?: boolean;
  }
}
