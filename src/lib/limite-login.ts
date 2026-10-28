import "server-only";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import { getRedis } from "@/lib/redis";

// Limite de tentativas de login, a cada 15 min:
// - por e-mail, independente do IP: 10 erros (trocar de IP não ajuda);
// - por e-mail+IP: 5 erros, e por IP: 30 erros — só quando o IP é conhecido
//   (TRUST_PROXY, ver ipDoPedido). Sem IP confiável não existe balde
//   compartilhado: um "local" único deixaria um robô travar o login de todos.
// Sem Redis o limite não é aplicado (fail-open), como no Portal.
type Limitadores = { porEmail: RateLimiterRedis; porConta: RateLimiterRedis; porIp: RateLimiterRedis };
let cache: Limitadores | null = null;

function limitadores(): Limitadores {
  if (!cache) {
    const storeClient = getRedis();
    const duration = 15 * 60;
    cache = {
      porEmail: new RateLimiterRedis({ storeClient, keyPrefix: "hub:login:email", points: 10, duration }),
      porConta: new RateLimiterRedis({ storeClient, keyPrefix: "hub:login:conta", points: 5, duration }),
      porIp: new RateLimiterRedis({ storeClient, keyPrefix: "hub:login:ip", points: 30, duration }),
    };
  }
  return cache;
}

export class LoginBloqueado extends Error {
  constructor(public segundos: number) {
    super("LOGIN_BLOQUEADO");
  }
}

// Baldes que valem para este pedido: [limitador, chave].
function baldes(ip: string | null, email: string): [RateLimiterRedis, string][] {
  const { porEmail, porConta, porIp } = limitadores();
  const lista: [RateLimiterRedis, string][] = [[porEmail, email]];
  if (ip) lista.push([porConta, `${ip}:${email}`], [porIp, ip]);
  return lista;
}

// Confere antes de testar a senha; só gasta ponto quando a senha está errada.
export async function conferirLimite(ip: string | null, email: string): Promise<void> {
  try {
    const estados = await Promise.all(baldes(ip, email).map(([l, k]) => l.get(k)));
    const espera = Math.max(0, ...estados.map((e) => (e && e.remainingPoints <= 0 ? e.msBeforeNext : 0)));
    if (espera > 0) throw new LoginBloqueado(Math.ceil(espera / 1000));
  } catch (err) {
    if (err instanceof LoginBloqueado) throw err;
  }
}

export async function registrarErro(ip: string | null, email: string): Promise<void> {
  try {
    await Promise.allSettled(baldes(ip, email).map(([l, k]) => l.consume(k)));
  } catch (err) {
    if (!(err instanceof RateLimiterRes)) console.warn("[login] limite indisponível", String(err));
  }
}

// Login certo zera os erros da conta (por e-mail e por e-mail+IP); o do IP fica.
export async function limparErros(ip: string | null, email: string): Promise<void> {
  try {
    const { porEmail, porConta } = limitadores();
    await Promise.allSettled([porEmail.delete(email), ...(ip ? [porConta.delete(`${ip}:${email}`)] : [])]);
  } catch {
    // fail-open
  }
}

// IP do cliente, ou null quando não dá para confiar nele.
// Só com TRUST_PROXY=true (atrás do proxy da hospedagem) e só o ÚLTIMO item do
// X-Forwarded-For: é o que o proxy confiável acrescentou. Os anteriores (e o
// X-Real-IP) vêm do cliente e podem ser inventados a cada pedido.
export function ipDoPedido(headers: Record<string, string | string[] | undefined> | Headers | undefined): string | null {
  if (process.env.TRUST_PROXY !== "true" || !headers) return null;
  const bruto = headers instanceof Headers ? headers.get("x-forwarded-for") : headers["x-forwarded-for"];
  const xff = Array.isArray(bruto) ? bruto.join(",") : bruto;
  const ultimo = xff?.split(",").map((s) => s.trim()).filter(Boolean).at(-1);
  return ultimo ? ultimo.slice(0, 100) : null;
}
