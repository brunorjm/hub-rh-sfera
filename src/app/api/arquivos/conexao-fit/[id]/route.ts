import { NextResponse } from "next/server";
import { lerCorpo } from "@/lib/corpo";
import { origemPermitida } from "@/lib/origem";
import { usuarioAtual } from "@/lib/sessao";
import { getStorage } from "@/lib/storage";
import { FIT_LIMITE_BYTES, gravarFit, lerFit, type ResultadoArquivo } from "@/server/hub/conexao";

export const dynamic = "force-dynamic";

const erro = (status: number, mensagem: string) =>
  NextResponse.json({ erro: mensagem }, { status, headers: { "Cache-Control": "no-store" } });

// Sessão válida, sem troca de senha pendente e (no POST) pedido da própria origem.
async function usuarioDaRequisicao(req: Request, checarOrigem: boolean) {
  if (checarOrigem && !origemPermitida(req)) return erro(403, "Origem não permitida.");
  const usuario = await usuarioAtual();
  if (!usuario) return erro(401, "Sessão encerrada. Entre de novo.");
  if (usuario.trocarSenha) return erro(403, "Troque a senha antes de continuar.");
  return usuario;
}

const falha = (r: ResultadoArquivo) => ("erro" in r ? erro(r.status, r.erro) : null);

async function semQuebrar(fn: () => Promise<ResultadoArquivo>): Promise<ResultadoArquivo> {
  try {
    return await fn();
  } catch (e) {
    console.error("[arquivos] conexao-fit falhou", e);
    return { status: 500, erro: "Não foi possível concluir. Tente de novo." };
  }
}

// PDF do Fit Cultural: GET /api/arquivos/conexao-fit/<id do registro>.
// Permissão e visibilidade conferidas em lerFit (conexao_state + allowed_pdf).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioDaRequisicao(req, false);
  if (usuario instanceof NextResponse) return usuario;
  const { id } = await params;
  const r = await semQuebrar(() => lerFit(id, usuario, getStorage(), usuario.verComo));
  if (!("bytes" in r)) return falha(r) ?? erro(500, "Não foi possível abrir o documento.");
  return new NextResponse(Buffer.from(r.bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="fit-cultural-${id}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// Anexo do PDF: POST /api/arquivos/conexao-fit/<id do registro>, corpo = o PDF
// (Content-Type application/pdf), colaborador no cabeçalho X-Conexao-Colaborador.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioDaRequisicao(req, true);
  if (usuario instanceof NextResponse) return usuario;
  if (usuario.verComo) return erro(403, "No \"Visualizar como\" nada pode ser alterado.");
  if ((req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase() !== "application/pdf") {
    return erro(415, "Envie o documento em PDF.");
  }
  const bytes = await lerCorpo(req, FIT_LIMITE_BYTES);
  if (!bytes) return erro(413, "Selecione um PDF de até 10 MB.");
  const { id } = await params;
  const colaborador = req.headers.get("x-conexao-colaborador") ?? "";
  const r = await semQuebrar(() => gravarFit(id, colaborador, bytes, usuario, getStorage(), usuario.verComo));
  return falha(r) ?? NextResponse.json({ dados: { gravado: "gravado" in r && r.gravado } }, { headers: { "Cache-Control": "no-store" } });
}
