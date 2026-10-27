import "server-only";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { comUsuarioSql } from "@/lib/sql-usuario";
import { conferirLimite, limparErros, registrarErro } from "@/lib/limite-login";

// Códigos devolvidos ao formulário de login (NextAuth repassa a mensagem do
// erro em `error`). Os textos ficam em src/components/login/mensagens.ts.
export type ErroLogin = "CREDENCIAIS" | "SEM_PERFIL" | "INATIVO" | "DESLIGADO" | "BLOQUEADO";

export class FalhaLogin extends Error {
  constructor(public codigo: ErroLogin) {
    super(codigo);
  }
}

// Hash de uma senha aleatória: quando o e-mail não existe, comparamos contra ele
// para a resposta levar o mesmo tempo (não revela quais e-mails têm conta).
const HASH_FALSO = bcrypt.hashSync(crypto.randomUUID(), 10);

export type ContaAutenticada = { id: string; email: string; nome: string; trocarSenha: boolean };

// Mesma classificação do hub antigo (legado/js/admin/log-acessos.js).
export function dispositivoDe(userAgent: string | null | undefined): "celular" | "computador" {
  return /Mobi|Android|iPhone|iPad/i.test(userAgent ?? "") ? "celular" : "computador";
}

export async function autenticar(emailBruto: string, senha: string, ip: string, userAgent?: string): Promise<ContaAutenticada> {
  const email = emailBruto.trim().toLowerCase();
  if (!email || !senha || email.length > 254 || senha.length > 200) throw new FalhaLogin("CREDENCIAIS");

  try {
    await conferirLimite(ip, email);
  } catch {
    throw new FalhaLogin("BLOQUEADO");
  }

  const [usuario] = await prisma.$queryRaw<{ id: string; senha_hash: string | null; trocar_senha: boolean }[]>`
    select id, senha_hash, trocar_senha from public.usuarios where lower(email) = ${email} limit 1`;

  const confere = await bcrypt.compare(senha, usuario?.senha_hash ?? HASH_FALSO);
  if (!usuario || !usuario.senha_hash || !confere) {
    await registrarErro(ip, email);
    throw new FalhaLogin("CREDENCIAIS");
  }

  // Mesmas mensagens e a mesma ordem do hub antigo (legado/js/app.js, loadProfileOrFail).
  const perfil = await prisma.profiles.findUnique({ where: { id: usuario.id }, select: { nome: true, email: true, status: true } });
  if (!perfil) throw new FalhaLogin("SEM_PERFIL");
  if (perfil.status === "inativo") throw new FalhaLogin("INATIVO");
  if (perfil.status === "desligado") throw new FalhaLogin("DESLIGADO");
  if (perfil.status !== "ativo") throw new FalhaLogin("INATIVO");

  await limparErros(ip, email);
  await prisma.usuarios.update({ where: { id: usuario.id }, data: { ultimo_login: new Date() } });
  await registrarAcesso(usuario.id, "login", undefined, dispositivoDe(userAgent));

  return { id: usuario.id, email: perfil.email, nome: perfil.nome, trocarSenha: usuario.trocar_senha };
}

// Log de Acessos: a mesma função registrar_acesso() do Supabase.
export async function registrarAcesso(
  usuarioId: string,
  evento: "login" | "sessao" | "logout" | "modulo",
  modulo?: string,
  dispositivo?: "celular" | "computador",
): Promise<void> {
  try {
    await comUsuarioSql(usuarioId, (tx) =>
      tx.$executeRaw`select public.registrar_acesso(${evento}, ${modulo ?? null}, ${dispositivo ?? null})`);
  } catch (err) {
    console.error("[acesso_log] falhou", String(err));
  }
}

export async function gerarHashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, 10);
}
