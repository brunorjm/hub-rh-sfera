import "server-only";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import { getRedis } from "@/lib/redis";

// Limite por IP dos links públicos sem login (/api/publico/*): parecer do
// gestor, entrevista de desligamento e NPS da Conexão RH. Cada pedido gasta um
// ponto. Os tokens são aleatórios (UUID ou 64 hex), então o limite não é o que
// impede adivinhar token: ele segura abuso (robô martelando a rota e o banco).
// Folgado para quem abre o link mais de uma vez ou divide a rede da loja.
// Sem Redis o limite não é aplicado (fail-open), como no login.
export type AcaoPublica = "ler" | "salvar";

const REGRAS: Record<AcaoPublica, { points: number; duration: number }> = {
  ler: { points: 60, duration: 15 * 60 },
  salvar: { points: 20, duration: 15 * 60 },
};

let limitadores: Record<AcaoPublica, RateLimiterRedis> | null = null;

function obter(): Record<AcaoPublica, RateLimiterRedis> {
  if (!limitadores) {
    const storeClient = getRedis();
    limitadores = {
      ler: new RateLimiterRedis({ storeClient, keyPrefix: "hub:publico:ler", ...REGRAS.ler }),
      salvar: new RateLimiterRedis({ storeClient, keyPrefix: "hub:publico:salvar", ...REGRAS.salvar }),
    };
  }
  return limitadores;
}

export class PublicoBloqueado extends Error {
  constructor(public segundos: number) {
    super("PUBLICO_BLOQUEADO");
  }
}

// Gasta um ponto do IP; estourado, lança PublicoBloqueado com a espera em segundos.
export async function consumirLimitePublico(ip: string, acao: AcaoPublica): Promise<void> {
  try {
    await obter()[acao].consume(ip);
  } catch (err) {
    if (err instanceof RateLimiterRes) throw new PublicoBloqueado(Math.max(1, Math.ceil(err.msBeforeNext / 1000)));
    console.warn("[publico] limite indisponível", String(err));
  }
}
