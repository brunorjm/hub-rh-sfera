import "server-only";
import { getRedis } from "@/lib/redis";

// Revogação de sessão no Redis, no mesmo formato do Portal do Fera: cada login
// ganha um jti; sair ou trocar a senha põe o jti numa lista de revogados.
// Fail-open: sem Redis ninguém é barrado por aqui. Inativar uma conta não
// depende disto: o perfil é relido do banco a cada requisição (sessao.ts).

const VIDA_SESSAO_S = 8 * 60 * 60;
const chaveRevogado = (jti: string) => `hub:jwt:revogado:${jti}`;
const chaveDoUsuario = (usuarioId: string) => `hub:jwt:usuario:${usuarioId}`;

export async function registrarJti(usuarioId: string, jti: string): Promise<void> {
  try {
    const r = getRedis();
    await r.multi().sadd(chaveDoUsuario(usuarioId), jti).expire(chaveDoUsuario(usuarioId), VIDA_SESSAO_S).exec();
  } catch (err) {
    console.warn("[sessao] não registrou o jti no Redis", String(err));
  }
}

export async function revogarJti(jti: string): Promise<void> {
  try {
    await getRedis().set(chaveRevogado(jti), "1", "EX", VIDA_SESSAO_S);
  } catch (err) {
    console.warn("[sessao] não revogou o jti no Redis", String(err));
  }
}

export async function jtiRevogado(jti: string): Promise<boolean> {
  try {
    return (await getRedis().exists(chaveRevogado(jti))) === 1;
  } catch {
    return false;
  }
}

// Todas as sessões da pessoa, menos (opcionalmente) a atual.
export async function revogarSessoesDoUsuario(usuarioId: string, exceto?: string): Promise<void> {
  try {
    const jtis = await getRedis().smembers(chaveDoUsuario(usuarioId));
    await Promise.all(jtis.filter((j) => j !== exceto).map(revogarJti));
  } catch (err) {
    console.warn("[sessao] não revogou as sessões no Redis", String(err));
  }
}
