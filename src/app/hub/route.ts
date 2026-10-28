import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/sessao";
import { registrarAcesso } from "@/lib/login";
import { PAGINA_HUB } from "@/server/hub/pagina-hub";

export const dynamic = "force-dynamic";

// Carimbo de cache dos arquivos de public/legado-ui (troque ao mudar um deles).
const VERSAO = "20261028";

// JSON seguro dentro de <script>: "<" e os separadores de linha U+2028/U+2029
// viram a sequência de escape \uXXXX (nada fecha a tag nem quebra o JS).
const escapeUnicode = (codigo: number) => String.fromCharCode(92) + "u" + codigo.toString(16).padStart(4, "0");
const jsonParaScript = (v: unknown) =>
  JSON.stringify(v)
    .replaceAll("<", escapeUnicode(0x3c))
    .replaceAll(String.fromCharCode(0x2028), escapeUnicode(0x2028))
    .replaceAll(String.fromCharCode(0x2029), escapeUnicode(0x2029));

// O hub antigo (telas, menu e filtros de hoje) servido como página: o usuário
// vem da sessão do servidor, no mesmo formato que o app.js antigo montava.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const u = await usuarioAtual();
  if (!u) return NextResponse.redirect(new URL("/login", url));
  if (u.trocarSenha) return NextResponse.redirect(new URL("/trocar-senha", url));

  // Log de Acessos: "login" já foi gravado no login; recarregar a página é "sessao", como no hub antigo.
  if (!url.searchParams.has("entrou")) await registrarAcesso(u.id, "sessao");

  const usuario = {
    id: u.id, email: u.email, nome: u.nome, perfil: u.perfil,
    unidades: u.unidades ?? [], departamentos: u.departamentos ?? [],
    permissoes: u.permissoes ?? {}, satisfacao_areas: u.satisfacaoAreas ?? [],
  };
  const html = PAGINA_HUB.replace("__BOOT__", () => jsonParaScript({ usuario })).replaceAll("__VERSAO__", VERSAO);
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
