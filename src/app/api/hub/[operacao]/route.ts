import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/sessao";
import { executarOperacao } from "@/server/hub/executar";

export const dynamic = "force-dynamic";

const erro = (status: number, mensagem: string) => NextResponse.json({ erro: mensagem }, { status });

// Porta única das telas antigas para o banco: POST /api/hub/<operação> com JSON.
export async function POST(req: Request, { params }: { params: Promise<{ operacao: string }> }) {
  // Só a própria origem (a sessão é cookie; isto fecha o pedido forjado por outro site).
  const origem = req.headers.get("origin");
  if (origem && origem !== new URL(req.url).origin) return erro(403, "Origem não permitida.");

  const usuario = await usuarioAtual();
  if (!usuario) return erro(401, "Sessão encerrada. Entre de novo.");
  if (usuario.trocarSenha) return erro(403, "Troque a senha antes de continuar.");

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return erro(400, "Pedido inválido.");
  }

  const { operacao } = await params;
  const r = await executarOperacao(operacao, corpo, usuario, usuario.verComo);
  return "erro" in r ? erro(r.status, r.erro) : NextResponse.json({ dados: r.dados });
}
