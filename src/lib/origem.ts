// Checagem única de origem (CSRF) das rotas POST: as que usam o cookie de
// sessão e as públicas. Aceita só pedido do próprio site:
// - Origin presente: tem de ser a origem de NEXTAUTH_URL (o endereço público,
//   atrás do proxy) ou a origem do próprio pedido.
// - Origin ausente (navegador antigo, ferramenta): recusa quando o navegador
//   avisa por Sec-Fetch-Site que veio de outro site (cross-site ou same-site,
//   isto é, outro subdomínio). Sem nenhum dos dois cabeçalhos não é navegador
//   moderno de terceiro, então passa (o cookie SameSite=Lax segura o resto).
function origemDe(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function origemPermitida(req: Request): boolean {
  const origem = req.headers.get("origin");
  if (origem) {
    return origem === origemDe(process.env.NEXTAUTH_URL) || origem === origemDe(req.url);
  }
  const site = req.headers.get("sec-fetch-site")?.trim().toLowerCase();
  return site !== "cross-site" && site !== "same-site";
}
