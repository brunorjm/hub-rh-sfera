"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { exigirUsuario } from "@/lib/sessao";
import { gerarHashSenha } from "@/lib/login";
import { revogarSessoesDoUsuario } from "@/lib/sessao-revogacao";
import { trocarSenhaSchema } from "@/contracts/senha";

export type ResultadoTroca = { ok: true } | { ok: false; erro: string };

// Troca da própria senha (obrigatória no primeiro acesso de quem recebeu senha
// do administrador). Derruba as outras sessões da pessoa; a atual continua.
export async function trocarSenha(entrada: unknown): Promise<ResultadoTroca> {
  const usuario = await exigirUsuario({ permitirTrocaPendente: true });
  const dados = trocarSenhaSchema.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: dados.error.issues[0]?.message ?? "Dados inválidos." };

  const conta = await prisma.usuarios.findUnique({ where: { id: usuario.id }, select: { senha_hash: true } });
  if (!conta?.senha_hash || !(await bcrypt.compare(dados.data.atual, conta.senha_hash))) {
    return { ok: false, erro: "Senha atual incorreta." };
  }

  await prisma.usuarios.update({
    where: { id: usuario.id },
    data: { senha_hash: await gerarHashSenha(dados.data.nova), trocar_senha: false },
  });
  await revogarSessoesDoUsuario(usuario.id, usuario.jti);
  return { ok: true };
}
