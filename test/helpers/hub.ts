// Apoio aos testes de integração das operações do hub (src/server/hub).
// Cria contas inventadas e executa operações pelo mesmo caminho da rota
// /api/hub/<nome>, dentro das RLS originais.
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { carregarConta, type UsuarioHub } from "@/lib/sessao";
import { executarOperacao, type ResultadoOperacao } from "@/server/hub/executar";

export type DadosConta = {
  perfil?: "admin" | "rh" | "gestor";
  permissoes?: Record<string, boolean>;
  unidades?: string[];
  departamentos?: string[];
  satisfacaoAreas?: string[];
  status?: string;
};

// Conta ativa com perfil; devolve no formato da sessão.
export async function criarConta(d: DadosConta = {}): Promise<UsuarioHub> {
  const id = randomUUID();
  const email = `teste-${id.slice(0, 8)}@exemplo.test`;
  await prisma.usuarios.create({ data: { id, email, senha_hash: "$2a$10$naoUsadaEmTesteDeOperacao.................." } });
  await prisma.profiles.create({
    data: {
      id, email, nome: `Pessoa ${id.slice(0, 4)}`, perfil: d.perfil ?? "gestor", status: d.status ?? "ativo",
      permissoes: d.permissoes ?? {}, unidades: d.unidades ?? [], departamentos: d.departamentos ?? [],
      satisfacao_areas: d.satisfacaoAreas ?? [],
    },
  });
  const u = await carregarConta(id, "jti-teste");
  if (!u) throw new Error("conta de teste não carregou");
  return u;
}

export async function executar(nome: string, corpo: unknown, conta: UsuarioHub, verComo?: UsuarioHub): Promise<ResultadoOperacao> {
  return executarOperacao(nome, corpo, conta, verComo ?? null);
}

// Esvazia tabelas entre testes (dono do banco ignora RLS). Contas de teste
// saem por último: profiles depende de usuarios.
export async function limpar(...tabelas: string[]): Promise<void> {
  const todas = [...tabelas, "profiles", "usuarios"].map((t) => `public."${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`truncate ${todas} restart identity cascade`);
}

export { prisma };
