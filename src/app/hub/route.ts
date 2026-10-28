import { NextResponse } from "next/server";
import { lerCorpo } from "@/lib/corpo";
import { origemPermitida } from "@/lib/origem";
import { usuarioAtual, type UsuarioHub } from "@/lib/sessao";
import { registrarAcesso } from "@/lib/login";
import { PAGINA_HUB } from "@/server/hub/pagina-hub";
import { encerrarVerComo } from "@/server/hub/admin";

export const dynamic = "force-dynamic";

// Carimbo de cache dos arquivos de public/legado-ui: muda a cada vez que o
// servidor sobe (deploy ou reinício), então ninguém fica com script velho no
// navegador. HUB_VERSAO fixa um valor, se for preciso.
const VERSAO = process.env.HUB_VERSAO ?? Date.now().toString(36);

// JSON seguro dentro de <script>: "<" e os separadores de linha U+2028/U+2029
// viram a sequência de escape \uXXXX (nada fecha a tag nem quebra o JS).
const escapeUnicode = (codigo: number) => String.fromCharCode(92) + "u" + codigo.toString(16).padStart(4, "0");
const jsonParaScript = (v: unknown) =>
  JSON.stringify(v)
    .replaceAll("<", escapeUnicode(0x3c))
    .replaceAll(String.fromCharCode(0x2028), escapeUnicode(0x2028))
    .replaceAll(String.fromCharCode(0x2029), escapeUnicode(0x2029));

// Mesmo formato que o app.js antigo montava (loadProfileOrFail).
const formatoTela = (u: UsuarioHub) => ({
  id: u.id, email: u.email, nome: u.nome, perfil: u.perfil,
  unidades: u.unidades ?? [], departamentos: u.departamentos ?? [],
  permissoes: u.permissoes ?? {}, satisfacao_areas: u.satisfacaoAreas ?? [],
});

// O hub antigo (telas, menu e filtros de hoje) servido como página: o usuário
// vem da sessão do servidor, no mesmo formato que o app.js antigo montava.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const u = await usuarioAtual();
  if (!u) return NextResponse.redirect(new URL("/login", url));
  if (u.trocarSenha) return NextResponse.redirect(new URL("/trocar-senha", url));

  // Log de Acessos: "login" já foi gravado no login; recarregar a página é "sessao", como no hub antigo.
  // Entrar/sair do "Visualizar como" recarrega a página: não é uma volta ao Hub.
  if (!url.searchParams.has("entrou") && !url.searchParams.has("vercomo")) await registrarAcesso(u.id, "sessao");

  // "Visualizar como": a tela recebe a conta vista no lugar do usuário (menu,
  // telas e filtros dela) e verComo com quem está vendo, para a faixa de aviso.
  const v = u.verComo;
  const boot = v
    ? { usuario: formatoTela(v), verComo: { real: { id: u.id, nome: u.nome || u.email } }, versao: VERSAO }
    : { usuario: formatoTela(u), versao: VERSAO };
  const html = PAGINA_HUB.replace("__BOOT__", () => jsonParaScript(boot)).replaceAll("__VERSAO__", VERSAO);
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// Sair do "Visualizar como" (view-as.js). Não é uma operação de /api/hub porque,
// durante a visualização, elas rodam como a conta vista e não gravam: aqui o
// registro do viewas_log é fechado com a identidade real.
export async function POST(req: Request) {
  if (!origemPermitida(req)) return NextResponse.json({ erro: "Origem não permitida." }, { status: 403 });
  // A ação vem na URL; o corpo não é usado, mas é lido com limite (16 KB).
  if (!(await lerCorpo(req, 16 * 1024))) return NextResponse.json({ erro: "Pedido grande demais." }, { status: 413 });
  const u = await usuarioAtual();
  if (!u) return NextResponse.json({ erro: "Sessão encerrada. Entre de novo." }, { status: 401 });
  const acao = new URL(req.url).searchParams.get("acao");
  if (acao !== "encerrar-ver-como") return NextResponse.json({ erro: "Ação desconhecida." }, { status: 404 });
  await encerrarVerComo(u);
  return NextResponse.json({ dados: null });
}
