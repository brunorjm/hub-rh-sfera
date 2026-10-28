import "server-only";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import { getRedis } from "@/lib/redis";

// Limites dos links públicos sem login (/api/publico/*): parecer do gestor,
// entrevista de desligamento e NPS da Conexão RH. Os tokens são aleatórios,
// então o limite não é o que impede adivinhar token: ele segura abuso (robô
// martelando a rota e o banco). Folgado para quem abre o link mais de uma vez
// ou divide a rede da loja. Cada chamada gasta um ponto.
// - pedido: por IP, qualquer pedido, ANTES de ler o corpo;
// - salvar: por IP, gravações;
// - token: por token, gravações (vale mesmo sem IP conhecido).
// Por IP só quando o IP é conhecido (TRUST_PROXY, ver ipDoPedido): sem IP
// confiável não existe balde compartilhado.
// Sem Redis o limite não é aplicado (fail-open), como no login.
export type LimitePublico = "pedido" | "salvar" | "token";

const REGRAS: Record<LimitePublico, { points: number; duration: number }> = {
  pedido: { points: 80, duration: 15 * 60 },
  salvar: { points: 20, duration: 15 * 60 },
  token: { points: 10, duration: 15 * 60 },
};

let limitadores: Record<LimitePublico, RateLimiterRedis> | null = null;

function obter(): Record<LimitePublico, RateLimiterRedis> {
  if (!limitadores) {
    const storeClient = getRedis();
    const criar = (nome: LimitePublico) => new RateLimiterRedis({ storeClient, keyPrefix: `hub:publico:${nome}`, ...REGRAS[nome] });
    limitadores = { pedido: criar("pedido"), salvar: criar("salvar"), token: criar("token") };
  }
  return limitadores;
}

export class PublicoBloqueado extends Error {
  constructor(public segundos: number) {
    super("PUBLICO_BLOQUEADO");
  }
}

// Gasta um ponto da chave (IP ou token); estourado, lança PublicoBloqueado com
// a espera em segundos. Chave null (IP desconhecido) não gasta nada.
export async function consumirLimitePublico(chave: string | null, limite: LimitePublico): Promise<void> {
  if (!chave) return;
  try {
    await obter()[limite].consume(chave);
  } catch (err) {
    if (err instanceof RateLimiterRes) throw new PublicoBloqueado(Math.max(1, Math.ceil(err.msBeforeNext / 1000)));
    console.warn("[publico] limite indisponível", String(err));
  }
}
