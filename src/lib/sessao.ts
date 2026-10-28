import "server-only";
import { cache } from "react";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { jtiRevogado } from "@/lib/sessao-revogacao";
import { temPermissao, temAlguma, type Escopo } from "@/lib/rbac/permissoes";

export type UsuarioHub = Escopo & {
  id: string;
  email: string;
  nome: string;
  perfil: string;
  satisfacaoAreas: string[];
  trocarSenha: boolean;
  jti: string;
  // "Visualizar como" ativo nesta sessão: a conta que o Administrador está vendo.
  verComo?: UsuarioHub | null;
};

// Lê uma conta ativa no formato da sessão (sem verComo).
export async function carregarConta(id: string, jti = ""): Promise<UsuarioHub | null> {
  const conta = await prisma.usuarios.findUnique({
    where: { id },
    select: { trocar_senha: true, senha_hash: true, profiles: true },
  });
  const p = conta?.profiles;
  if (!conta?.senha_hash || !p || p.status !== "ativo") return null;
  return {
    id: p.id,
    email: p.email,
    nome: p.nome,
    perfil: p.perfil,
    status: p.status,
    permissoes: (p.permissoes ?? {}) as Record<string, unknown>,
    unidades: p.unidades ?? [],
    departamentos: p.departamentos ?? [],
    satisfacaoAreas: p.satisfacao_areas ?? [],
    trocarSenha: conta.trocar_senha,
    jti,
  };
}

// "Visualizar como" fica no Redis por sessão (jti), com a mesma vida da sessão.
const chaveVerComo = (jti: string) => `hub:vercomo:${jti}`;

export async function definirVerComo(jti: string, alvoId: string | null): Promise<void> {
  const r = getRedis();
  if (alvoId) await r.set(chaveVerComo(jti), alvoId, "EX", 8 * 60 * 60);
  else await r.del(chaveVerComo(jti));
}

async function lerVerComo(jti: string): Promise<string | null> {
  try {
    return await getRedis().get(chaveVerComo(jti));
  } catch {
    return null;
  }
}

// Usuário da requisição, relido do banco a cada request: mudar permissão ou
// inativar a conta vale na hora, sem esperar o token de 8h vencer.
export const usuarioAtual = cache(async (): Promise<UsuarioHub | null> => {
  const sessao = await getServerSession(authOptions);
  if (!sessao?.uid || !sessao.jti) return null;
  if (await jtiRevogado(sessao.jti)) return null;

  const u = await carregarConta(sessao.uid, sessao.jti);
  if (!u) return null;

  // Só quem administra acessos pode "vestir" outra conta (como no hub antigo).
  const alvoId = temPermissao(u, "admin.usuarios") ? await lerVerComo(sessao.jti) : null;
  u.verComo = alvoId && alvoId !== u.id ? await carregarConta(alvoId) : null;
  return u;
});

// Para telas e ações: sem sessão vai ao login; com troca de senha pendente, à troca.
export async function exigirUsuario(opcoes?: { permitirTrocaPendente?: boolean }): Promise<UsuarioHub> {
  const u = await usuarioAtual();
  if (!u) redirect("/login");
  if (u.trocarSenha && !opcoes?.permitirTrocaPendente) redirect("/trocar-senha");
  return u;
}

// Sem a permissão, a tela não existe para a pessoa (404), como o menu do hub antigo, que a escondia.
export async function exigirPermissao(chave: string | string[]): Promise<UsuarioHub> {
  const u = await exigirUsuario();
  const ok = Array.isArray(chave) ? temAlguma(u, chave) : temPermissao(u, chave);
  if (!ok) notFound();
  return u;
}
