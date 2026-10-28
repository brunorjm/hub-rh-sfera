// Leitura do corpo do pedido com limite real: lê em pedaços e para assim que
// passa do limite, mesmo sem Content-Length (Transfer-Encoding: chunked).
// Nunca guarda mais que `limite` bytes na memória.

// null = passou do limite (responder 413).
export async function lerCorpo(req: Request, limite: number): Promise<Uint8Array | null> {
  const declarado = Number(req.headers.get("content-length") ?? "0");
  if (declarado > limite) return null;
  if (!req.body) return new Uint8Array();
  const leitor = req.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > limite) {
      await leitor.cancel().catch(() => {});
      return null;
    }
    partes.push(value);
  }
  const bytes = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    bytes.set(p, pos);
    pos += p.byteLength;
  }
  return bytes;
}

export type CorpoJson = { ok: true; valor: unknown } | { ok: false; status: 400 | 413 };

// JSON do corpo, dentro do limite. Corpo vazio ou JSON torto = 400.
export async function lerJson(req: Request, limite: number): Promise<CorpoJson> {
  let bytes: Uint8Array | null;
  try {
    bytes = await lerCorpo(req, limite);
  } catch {
    return { ok: false, status: 400 };
  }
  if (!bytes) return { ok: false, status: 413 };
  try {
    return { ok: true, valor: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, status: 400 };
  }
}
