// Cria (ou recria) uma conta de TESTE no banco LOCAL, para experimentar o login
// sem usar a senha de ninguém. Recusa qualquer banco que não seja localhost.
//
// Uso: npx tsx scripts/criar-conta-teste.ts
// Lê DEV_EMAIL_TESTE e DEV_SENHA_TESTE do .env (gere a senha; nunca use uma real).
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { presetPermissoes } from "../src/lib/rbac/catalogo";

const url = new URL(process.env.DATABASE_URL ?? "");
if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
  throw new Error(`Recusado: DATABASE_URL aponta para ${url.hostname}, não para o banco local.`);
}
const email = (process.env.DEV_EMAIL_TESTE ?? "teste.local@hub.test").toLowerCase();
const senha = process.env.DEV_SENHA_TESTE;
if (!senha || senha.length < 12) throw new Error("Defina DEV_SENHA_TESTE (12+ caracteres) no .env.");

const ID = "00000000-0000-4000-8000-00000000c0de";
const prisma = new PrismaClient();

async function main() {
  await prisma.$transaction([
    prisma.profiles.deleteMany({ where: { id: ID } }),
    prisma.usuarios.deleteMany({ where: { id: ID } }),
    prisma.usuarios.create({
      data: { id: ID, email, senha_hash: await bcrypt.hash(senha!, 10), trocar_senha: true },
    }),
    prisma.profiles.create({
      data: { id: ID, email, nome: "Conta de Teste Local", perfil: "rh", status: "ativo", permissoes: presetPermissoes("rh") },
    }),
  ]);
  console.info(`Conta de teste pronta: ${email} (perfil RH, troca de senha obrigatória no primeiro acesso).`);
}

main().finally(() => prisma.$disconnect());
