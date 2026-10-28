// Itens de segurança sem banco: origem (CSRF), corpo com limite real e resumo
// de erro para o log.
import { lerCorpo, lerJson } from "@/lib/corpo";
import { origemPermitida } from "@/lib/origem";
import { resumoErro } from "@/server/hub/operacao";

const pedido = (headers: Record<string, string>, url = "http://interno:3006/api/hub/x") =>
  new Request(url, { method: "POST", headers });

describe("origemPermitida", () => {
  const antes = process.env.NEXTAUTH_URL;
  beforeEach(() => {
    process.env.NEXTAUTH_URL = "https://hub.exemplo.test";
  });
  afterAll(() => {
    process.env.NEXTAUTH_URL = antes;
  });

  it("aceita a origem de NEXTAUTH_URL ou a do próprio pedido", () => {
    expect(origemPermitida(pedido({ origin: "https://hub.exemplo.test" }))).toBe(true);
    expect(origemPermitida(pedido({ origin: "http://interno:3006" }))).toBe(true);
  });

  it("recusa outra origem, subdomínio, outra porta/esquema e Origin null", () => {
    for (const origin of ["https://outro.test", "https://x.hub.exemplo.test", "http://hub.exemplo.test", "https://hub.exemplo.test:8443", "null"]) {
      expect([origin, origemPermitida(pedido({ origin }))]).toEqual([origin, false]);
    }
  });

  it("sem Origin: recusa Sec-Fetch-Site cross-site/same-site; aceita same-origin, none ou sem cabeçalho", () => {
    expect(origemPermitida(pedido({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(origemPermitida(pedido({ "sec-fetch-site": "same-site" }))).toBe(false);
    expect(origemPermitida(pedido({ "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(origemPermitida(pedido({ "sec-fetch-site": "none" }))).toBe(true);
    expect(origemPermitida(pedido({}))).toBe(true);
  });

  it("NEXTAUTH_URL ausente ou inválida: vale só a origem do pedido", () => {
    process.env.NEXTAUTH_URL = "";
    expect(origemPermitida(pedido({ origin: "https://hub.exemplo.test" }))).toBe(false);
    process.env.NEXTAUTH_URL = "não é url";
    expect(origemPermitida(pedido({ origin: "http://interno:3006" }))).toBe(true);
  });
});

// Corpo em pedaços sem Content-Length (como Transfer-Encoding: chunked).
function corpoEmPedacos(pedacos: number, tamanho: number) {
  let lidos = 0;
  const bloco = new Uint8Array(tamanho).fill(120);
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (lidos >= pedacos) return c.close();
      lidos++;
      c.enqueue(bloco);
    },
  });
  const req = new Request("http://x/", { method: "POST", body, duplex: "half" } as RequestInit);
  return { req, lidos: () => lidos };
}

describe("lerCorpo / lerJson", () => {
  it("para de ler assim que passa do limite, mesmo sem Content-Length", async () => {
    const { req, lidos } = corpoEmPedacos(1000, 1024);
    expect(req.headers.get("content-length")).toBeNull();
    expect(await lerCorpo(req, 8 * 1024)).toBeNull();
    expect(lidos()).toBeLessThan(15);
  });

  it("Content-Length declarado acima do limite é recusado sem ler", async () => {
    const req = new Request("http://x/", { method: "POST", headers: { "content-length": "999999" }, body: "{}" });
    expect(await lerCorpo(req, 1024)).toBeNull();
  });

  it("dentro do limite devolve tudo; JSON torto é 400; grande é 413", async () => {
    const { req } = corpoEmPedacos(3, 100);
    expect((await lerCorpo(req, 300))!.byteLength).toBe(300);
    expect(await lerJson(new Request("http://x/", { method: "POST", body: '{"a":1}' }), 100)).toEqual({ ok: true, valor: { a: 1 } });
    expect(await lerJson(new Request("http://x/", { method: "POST", body: "{a" }), 100)).toEqual({ ok: false, status: 400 });
    expect(await lerJson(new Request("http://x/", { method: "POST", body: "x".repeat(101) }), 100)).toEqual({ ok: false, status: 413 });
  });
});

describe("resumoErro (log sem valores)", () => {
  it("leva classe, código e mensagem curta; tira valores entre aspas e parênteses", () => {
    const e = Object.assign(new Error("ignorado"), {
      name: "PrismaClientKnownRequestError",
      code: "P2010",
      meta: { code: "23505", message: 'duplicate key value violates unique constraint "x"\nDETAIL: Key (email)=(pessoa@exemplo.test) already exists.' },
    });
    const r = resumoErro(e);
    expect(r).toMatch(/^PrismaClientKnownRequestError code=23505 duplicate key value violates unique constraint/);
    expect(r).not.toMatch(/pessoa@exemplo|DETAIL|"x"/);
    expect(resumoErro(new Error(`invalid input syntax for type uuid: "segredo-123" ${"y".repeat(500)}`)).length).toBeLessThan(160);
    expect(resumoErro(new Error('invalid input syntax for type uuid: "segredo-123"'))).not.toMatch(/segredo/);
  });
});

describe("urlPublica", () => {
  const original = process.env.NEXTAUTH_URL;
  afterEach(() => { process.env.NEXTAUTH_URL = original; });

  it("redireciona para o endereço público, não para o interno do container", async () => {
    const { urlPublica } = await import("@/lib/origem");
    process.env.NEXTAUTH_URL = "https://hub-homolog.exemplo.test";
    expect(urlPublica("/login", new Request("http://0.0.0.0:3000/hub")).href).toBe("https://hub-homolog.exemplo.test/login");
    delete process.env.NEXTAUTH_URL;
    expect(urlPublica("/login", new Request("http://localhost:3006/hub")).href).toBe("http://localhost:3006/login");
  });
});
