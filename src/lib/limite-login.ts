import "server-only";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import { getRedis } from "@/lib/redis";

// Limite de tentativas de login: 5 erros por e-mail+IP e 30 por IP, a cada 15 min.
// Sem Redis o limite não é aplicado (fail-open), como no Portal.
let porConta: RateLimiterRedis | null = null;
let porIp: RateLimiterRedis | null = null;

function limitadores() {
  if (!porConta || !porIp) {
    const storeClient = getRedis();
    porConta = new RateLimiterRedis({ storeClient, keyPrefix: "hub:login:conta", points: 5, duration: 15 * 60 });
    porIp = new RateLimiterRedis({ storeClient, keyPrefix: "hub:login:ip", points: 30, duration: 15 * 60 });
  }
  return { porConta, porIp };
}

export class LoginBloqueado extends Error {
  constructor(public segundos: number) {
    super("LOGIN_BLOQUEADO");
  }
}

// Confere antes de testar a senha; só gasta ponto quando a senha está errada.
export async function conferirLimite(ip: string, email: string): Promise<void> {
  try {
    const { porConta, porIp } = limitadores();
    const [c, i] = await Promise.all([porConta.get(`${ip}:${email}`), porIp.get(ip)]);
    const espera = Math.max(
      c && c.remainingPoints <= 0 ? c.msBeforeNext : 0,
      i && i.remainingPoints <= 0 ? i.msBeforeNext : 0,
    );
    if (espera > 0) throw new LoginBloqueado(Math.ceil(espera / 1000));
  } catch (err) {
    if (err instanceof LoginBloqueado) throw err;
  }
}

export async function registrarErro(ip: string, email: string): Promise<void> {
  try {
    const { porConta, porIp } = limitadores();
    await Promise.allSettled([porConta.consume(`${ip}:${email}`), porIp.consume(ip)]);
  } catch (err) {
    if (!(err instanceof RateLimiterRes)) console.warn("[login] limite indisponível", String(err));
  }
}

export async function limparErros(ip: string, email: string): Promise<void> {
  try {
    await limitadores().porConta.delete(`${ip}:${email}`);
  } catch {
    // fail-open
  }
}

// IP do cliente. X-Forwarded-For só vale atrás de proxy que o reescreve (TRUST_PROXY=true).
export function ipDoPedido(headers: Record<string, string | string[] | undefined> | Headers | undefined): string {
  const ler = (k: string) => {
    if (!headers) return undefined;
    if (headers instanceof Headers) return headers.get(k) ?? undefined;
    const v = headers[k];
    return Array.isArray(v) ? v[0] : v;
  };
  if (process.env.TRUST_PROXY === "true") {
    const xff = ler("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim();
  }
  return ler("x-real-ip") ?? "local";
}
