import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/sessao";
import { comUsuarioRls } from "@/lib/rls";
import { temAlguma, temPermissao } from "@/lib/rbac/permissoes";
import { OPERACOES } from "@/server/hub/registro";
import { ErroOperacao } from "@/server/hub/operacao";

export const dynamic = "force-dynamic";

const erro = (status: number, mensagem: string) => NextResponse.json({ erro: mensagem }, { status });

// Porta única das telas antigas para o banco: POST /api/hub/<operação> com JSON.
export async function POST(req: Request, { params }: { params: Promise<{ operacao: string }> }) {
  // Só a própria origem (a sessão é cookie; isto fecha o pedido forjado por outro site).
  const origem = req.headers.get("origin");
  if (origem && origem !== new URL(req.url).origin) return erro(403, "Origem não permitida.");

  const { operacao: nome } = await params;
  const op = Object.hasOwn(OPERACOES, nome) ? OPERACOES[nome] : undefined;
  if (!op) return erro(404, "Operação desconhecida.");

  const usuario = await usuarioAtual();
  if (!usuario) return erro(401, "Sessão encerrada. Entre de novo.");
  if (usuario.trocarSenha) return erro(403, "Troque a senha antes de continuar.");

  if (op.permissao !== "autenticado") {
    const ok = Array.isArray(op.permissao) ? temAlguma(usuario, op.permissao) : temPermissao(usuario, op.permissao);
    if (!ok) return erro(403, "Sem permissão para esta operação.");
  }

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return erro(400, "Pedido inválido.");
  }
  const dados = op.entrada.safeParse(corpo ?? {});
  if (!dados.success) return erro(400, dados.error.issues[0]?.message ?? "Dados inválidos.");

  try {
    const resultado = await comUsuarioRls(usuario.id, (tx) => op.executar(dados.data, { usuario, tx }));
    return NextResponse.json({ dados: resultado ?? null });
  } catch (e) {
    if (e instanceof ErroOperacao) return erro(e.status, e.message);
    const msg = String((e as Error)?.message ?? e);
    // RLS/grant barrou: mesma situação do Supabase, sem expor detalhe do banco.
    if (/row-level security|permission denied/i.test(msg)) return erro(403, "Sem permissão para estes dados.");
    console.error(`[hub] ${nome} falhou`, e);
    return erro(500, "Não foi possível concluir. Tente de novo.");
  }
}
