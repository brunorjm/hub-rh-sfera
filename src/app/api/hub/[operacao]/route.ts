import { NextResponse } from "next/server";
import { lerJson } from "@/lib/corpo";
import { origemPermitida } from "@/lib/origem";
import { usuarioAtual } from "@/lib/sessao";
import { executarOperacao } from "@/server/hub/executar";

export const dynamic = "force-dynamic";

const erro = (status: number, mensagem: string) => NextResponse.json({ erro: mensagem }, { status });

// O maior pedido é um lote do upload de planilhas (até ~4 MB de JSON).
const MAX_CORPO = 8 * 1024 * 1024;

// Porta única das telas antigas para o banco: POST /api/hub/<operação> com JSON.
export async function POST(req: Request, { params }: { params: Promise<{ operacao: string }> }) {
  // Só a própria origem (a sessão é cookie; isto fecha o pedido forjado por outro site).
  if (!origemPermitida(req)) return erro(403, "Origem não permitida.");

  const usuario = await usuarioAtual();
  if (!usuario) return erro(401, "Sessão encerrada. Entre de novo.");
  if (usuario.trocarSenha) return erro(403, "Troque a senha antes de continuar.");

  const corpo = await lerJson(req, MAX_CORPO);
  if (!corpo.ok) return corpo.status === 413 ? erro(413, "Pedido grande demais.") : erro(400, "Pedido inválido.");

  const { operacao } = await params;
  const r = await executarOperacao(operacao, corpo.valor, usuario, usuario.verComo);
  return "erro" in r ? erro(r.status, r.erro) : NextResponse.json({ dados: r.dados });
}
