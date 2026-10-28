import "server-only";
import { comUsuarioRls } from "@/lib/rls";
import { temAlguma, temPermissao } from "@/lib/rbac/permissoes";
import type { UsuarioHub } from "@/lib/sessao";
import { OPERACOES } from "@/server/hub/registro";
import { ErroOperacao } from "@/server/hub/operacao";

export type ResultadoOperacao = { status: 200; dados: unknown } | { status: number; erro: string };

// Executa uma operação do hub por nome, como a rota /api/hub/<nome> faz.
// Separado da rota para os testes de integração passarem pelo mesmo caminho.
//
// verComo: "Visualizar como" do Administrador — a operação roda com a
// identidade (permissões, recorte e RLS) da pessoa escolhida, em transação
// somente leitura, e operações de escrita são recusadas antes de começar.
export async function executarOperacao(
  nome: string,
  corpo: unknown,
  usuario: UsuarioHub,
  verComo?: UsuarioHub | null,
): Promise<ResultadoOperacao> {
  const op = Object.hasOwn(OPERACOES, nome) ? OPERACOES[nome] : undefined;
  if (!op) return { status: 404, erro: "Operação desconhecida." };

  const efetivo = verComo ?? usuario;
  if (verComo && op.escrita) return { status: 403, erro: "No \"Visualizar como\" nada pode ser alterado." };

  if (op.permissao !== "autenticado") {
    const ok = Array.isArray(op.permissao) ? temAlguma(efetivo, op.permissao) : temPermissao(efetivo, op.permissao);
    if (!ok) return { status: 403, erro: "Sem permissão para esta operação." };
  }

  const dados = op.entrada.safeParse(corpo ?? {});
  if (!dados.success) return { status: 400, erro: dados.error.issues[0]?.message ?? "Dados inválidos." };

  try {
    const resultado = await comUsuarioRls(
      efetivo.id,
      (tx) => op.executar(dados.data, { usuario: efetivo, tx }),
      { somenteLeitura: !!verComo },
    );
    return { status: 200, dados: resultado ?? null };
  } catch (e) {
    if (e instanceof ErroOperacao) return { status: e.status, erro: e.message };
    // Dado inválido ou regra do banco (campo obrigatório, duplicado, data
    // inválida): a tela antiga mostrava a mensagem do Postgres, como o
    // Supabase devolvia. Classes 22 (dado) e 23 (integridade).
    const banco = (e as { meta?: { code?: string; message?: string } })?.meta;
    if (banco?.code && /^2[23]/.test(banco.code)) {
      return { status: banco.code.startsWith("23") ? 409 : 400, erro: banco.message ?? "Dado inválido." };
    }
    // raise exception das funções do banco ("Este mês está fechado", "Período
    // inválido"...): são mensagens escritas para a tela, como no Supabase.
    if (banco?.code === "P0001") return { status: 400, erro: banco.message ?? "Operação recusada." };
    const msg = String((e as Error)?.message ?? e);
    // RLS/grant barrou ou escrita em transação só leitura: mesma situação do Supabase.
    if (/row-level security|permission denied|read-only transaction/i.test(msg)) {
      return { status: 403, erro: "Sem permissão para estes dados." };
    }
    console.error(`[hub] ${nome} falhou`, e);
    return { status: 500, erro: "Não foi possível concluir. Tente de novo." };
  }
}
