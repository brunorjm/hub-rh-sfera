// IP do pedido (só atrás do proxy confiável) e o limite de login por e-mail,
// independente do IP. O Redis é trocado pelo limitador em memória da mesma
// biblioteca (mesma interface get/consume/delete).
jest.mock("@/lib/redis", () => ({ getRedis: () => ({}) }));
jest.mock("rate-limiter-flexible", () => {
  const real = jest.requireActual("rate-limiter-flexible");
  class RateLimiterRedis extends real.RateLimiterMemory {
    constructor({ storeClient: _s, ...opcoes }: Record<string, unknown>) {
      super(opcoes);
    }
  }
  return { ...real, RateLimiterRedis };
});

import { conferirLimite, ipDoPedido, limparErros, LoginBloqueado, registrarErro } from "@/lib/limite-login";

const bloqueado = async (ip: string | null, email: string) => {
  try {
    await conferirLimite(ip, email);
    return false;
  } catch (e) {
    return e instanceof LoginBloqueado;
  }
};

describe("ipDoPedido", () => {
  const antes = process.env.TRUST_PROXY;
  afterEach(() => {
    process.env.TRUST_PROXY = antes;
  });

  it("sem TRUST_PROXY: IP desconhecido (null), nunca um balde compartilhado", () => {
    process.env.TRUST_PROXY = "";
    expect(ipDoPedido(new Headers({ "x-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2" }))).toBeNull();
    expect(ipDoPedido({ "x-real-ip": "2.2.2.2" })).toBeNull();
    expect(ipDoPedido(undefined)).toBeNull();
  });

  it("com TRUST_PROXY: o ÚLTIMO item do X-Forwarded-For; X-Real-IP do cliente não vale", () => {
    process.env.TRUST_PROXY = "true";
    expect(ipDoPedido(new Headers({ "x-forwarded-for": "6.6.6.6, 10.0.0.1 , 203.0.113.7" }))).toBe("203.0.113.7");
    expect(ipDoPedido({ "x-forwarded-for": "203.0.113.7" })).toBe("203.0.113.7");
    expect(ipDoPedido({ "x-forwarded-for": ["6.6.6.6", "203.0.113.8"] })).toBe("203.0.113.8");
    expect(ipDoPedido({ "x-real-ip": "2.2.2.2" })).toBeNull();
    expect(ipDoPedido(new Headers({ "x-forwarded-for": " , " }))).toBeNull();
  });
});

describe("limite de login", () => {
  it("10 erros no mesmo e-mail bloqueiam, mesmo vindo de 10 IPs diferentes", async () => {
    const email = "alvo@exemplo.test";
    for (let i = 0; i < 10; i++) {
      expect(await bloqueado(`10.0.0.${i}`, email)).toBe(false);
      await registrarErro(`10.0.0.${i}`, email);
    }
    expect(await bloqueado("10.0.0.99", email)).toBe(true);
    expect(await bloqueado(null, email)).toBe(true);
    expect(await bloqueado("10.0.0.99", "outra@exemplo.test")).toBe(false);
  });

  it("sem IP conhecido o limite por e-mail continua valendo; login certo zera", async () => {
    const email = "sem-ip@exemplo.test";
    for (let i = 0; i < 10; i++) await registrarErro(null, email);
    expect(await bloqueado(null, email)).toBe(true);
    await limparErros(null, email);
    expect(await bloqueado(null, email)).toBe(false);
  });

  it("por IP só quando conhecido: 30 erros do mesmo IP em e-mails diferentes bloqueiam o IP", async () => {
    for (let i = 0; i < 30; i++) await registrarErro("198.51.100.1", `varios${i}@exemplo.test`);
    expect(await bloqueado("198.51.100.1", "nova@exemplo.test")).toBe(true);
    expect(await bloqueado("198.51.100.2", "nova@exemplo.test")).toBe(false);
    expect(await bloqueado(null, "nova@exemplo.test")).toBe(false);
  });
});
