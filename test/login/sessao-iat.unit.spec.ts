// A sessão leva o instante do login (iat, ms), gravado no token só no login:
// o "iat" do JWT o NextAuth regrava a cada recodificação.
jest.mock("@/lib/login", () => ({ autenticar: jest.fn(), FalhaLogin: class {}, registrarAcesso: jest.fn() }));
jest.mock("@/lib/sessao-revogacao", () => ({ registrarJti: jest.fn(async () => {}), revogarJti: jest.fn(async () => {}) }));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));

import type { JWT } from "next-auth/jwt";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sessaoRevogadaNoBanco } from "@/lib/sessao";

const cb = authOptions.callbacks!;

describe("iat da sessão", () => {
  it("login grava loginEm; a sessão expõe iat = loginEm", async () => {
    const antes = Date.now();
    const token = (await cb.jwt!({ token: {} as JWT, user: { id: "u1", trocarSenha: false } as never, account: null })) as JWT;
    expect(token.loginEm).toBeGreaterThanOrEqual(antes);
    // Recodificar (iat novo do JWT) não muda o instante do login.
    const s = (await cb.session!({ session: {} as Session, token: { ...token, iat: 9_999_999_999 } } as never)) as Session;
    expect(s.iat).toBe(token.loginEm);
  });

  it("token antigo sem loginEm usa o iat do JWT (segundos → ms)", async () => {
    const s = (await cb.session!({ session: {} as Session, token: { uid: "u1", jti: "j", iat: 1_700_000_000 } } as never)) as Session;
    expect(s.iat).toBe(1_700_000_000_000);
  });

  it("sessaoRevogadaNoBanco: só recusa a emitida antes de sessoes_validas_desde", () => {
    const desde = new Date("2026-10-28T12:00:00.000Z");
    expect(sessaoRevogadaNoBanco(desde.getTime() - 1, desde)).toBe(true);
    expect(sessaoRevogadaNoBanco(desde.getTime(), desde)).toBe(false);
    expect(sessaoRevogadaNoBanco(Number.NaN, desde)).toBe(true);
    expect(sessaoRevogadaNoBanco(0, null)).toBe(false);
  });
});
