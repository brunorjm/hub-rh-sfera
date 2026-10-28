// Corpo das respostas de /api/hub (spec de otimização da carga, fase 1):
// formato em colunas (src/server/hub/resposta.ts → public/legado-ui/js/hub-api.js)
// e compressão brotli/gzip na rota. Dados inventados.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { brotliDecompressSync, gunzipSync } from "node:zlib";

const usuario = { id: "u1", email: "u@exemplo.test", nome: "U", perfil: "admin", trocarSenha: false, verComo: null, jti: "j" };
jest.mock("@/lib/sessao", () => ({ usuarioAtual: jest.fn(async () => usuario) }));
let resultado: unknown = null;
jest.mock("@/server/hub/executar", () => ({ executarOperacao: jest.fn(async () => ({ status: 200, dados: resultado })) }));

/* eslint-disable no-restricted-imports -- o teste chama a própria rota */
import { POST } from "@/app/api/hub/[operacao]/route";
/* eslint-enable no-restricted-imports */
import { codificarColunas, MINIMO_COMPRIMIR } from "@/server/hub/resposta";

// Linhas no formato do banco: null, números, booleanos, datas em texto, arrays e objetos aninhados.
const LINHAS = Array.from({ length: 300 }, (_, i) => ({
  id: i + 1,
  nome: `Pessoa Inventada ${i}`,
  unidade: i % 2 ? "Loja Centro" : null,
  ativo: i % 3 === 0,
  nota: i / 4,
  data: "2026-10-28",
  tags: i % 5 ? ["a", "b"] : [],
  dados: { nivel: i, extra: { x: null, y: [1, "dois", false] } },
}));

// Igualdade com a ordem das chaves (JSON.stringify respeita a ordem).
const mesmo = (a: unknown, b: unknown) => expect(JSON.stringify(a)).toBe(JSON.stringify(b));

describe("codificarColunas", () => {
  it("lista de objetos com as mesmas chaves vira colunas + linhas", () => {
    const c = codificarColunas([{ a: 1, b: null }, { a: "x", b: { z: [1] } }]);
    expect(c).toEqual({ __colunas: ["a", "b"], __linhas: [[1, null], ["x", { z: [1] }]] });
  });

  it("qualquer outro formato passa intacto", () => {
    const casos: unknown[] = [
      null, "ok", 3, true, { a: 1 }, [], [{ a: 1 }], // 0 ou 1 linha
      [1, 2], [[1], [2]], [{ a: 1 }, null], [{ a: 1 }, [1]],
      [{ a: 1, b: 2 }, { b: 2, a: 1 }], // mesma chave, outra ordem
      [{ a: 1 }, { a: 1, b: 2 }], [{ a: 1, b: 2 }, { a: 1 }],
      [{ a: 1 }, { a: undefined }], // undefined sumiria no JSON do objeto
      [{}, {}],
      [{ a: new Date(0) }, new Date(0)],
    ];
    for (const d of casos) expect(codificarColunas(d)).toBe(d);
    class Linha { a = 1; }
    const instancias = [new Linha(), new Linha()];
    expect(codificarColunas(instancias)).toBe(instancias);
  });
});

// hub-api.js de verdade, num contexto isolado, com fetch falso devolvendo `corpo`.
function carregarHubApi(corpo: unknown) {
  const ctx: Record<string, unknown> = {
    fetch: async () => ({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(corpo)) }),
    console,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const arquivo = path.join(process.cwd(), "public", "legado-ui", "js", "hub-api.js");
  vm.runInContext(fs.readFileSync(arquivo, "utf8"), ctx, { filename: "hub-api.js" });
  return (ctx.HUB_API as { chamar: (op: string, d?: unknown) => Promise<unknown> }).chamar;
}

describe("hub-api.js remonta o formato em colunas", () => {
  it("ida e volta idêntica (ordem das chaves, null, números, booleanos, aninhados)", async () => {
    const enviado = codificarColunas(LINHAS);
    expect(enviado).toHaveProperty("__colunas");
    const recebido = await carregarHubApi({ dados: enviado })("x.y");
    mesmo(recebido, LINHAS);
    expect(Object.keys((recebido as Record<string, unknown>[])[0]!)).toEqual(Object.keys(LINHAS[0]!));
  });

  it("outros formatos chegam como vieram", async () => {
    for (const dados of [null, "ok", 7, [], [{ a: 1 }], [1, 2], { a: 1 }, { __colunas: ["a"], __linhas: [[1]], outro: 1 }]) {
      mesmo(await carregarHubApi({ dados })("x.y"), dados);
    }
  });
});

const params = { params: Promise.resolve({ operacao: "x.y" }) };
const pedido = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/hub/x.y", { method: "POST", body: "{}", headers });
const bytes = async (r: Response) => Buffer.from(await r.arrayBuffer());

describe("POST /api/hub/<operação>: colunas e compressão", () => {
  const esperado = JSON.stringify({ dados: codificarColunas(LINHAS) });

  beforeEach(() => {
    resultado = LINHAS;
  });

  it("brotli quando o pedido aceita br; decodifica igual", async () => {
    const r = await POST(pedido({ "accept-encoding": "gzip, deflate, br, zstd" }), params);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-encoding")).toBe("br");
    expect(r.headers.get("vary")).toBe("Accept-Encoding");
    expect(r.headers.get("content-type")).toBe("application/json");
    const corpo = await bytes(r);
    expect(corpo.byteLength).toBeLessThan(Buffer.byteLength(esperado));
    expect(brotliDecompressSync(corpo).toString("utf8")).toBe(esperado);
  });

  it("gzip quando não aceita br (ou br com q=0)", async () => {
    for (const ae of ["gzip, deflate", "br;q=0, gzip;q=0.8"]) {
      const r = await POST(pedido({ "accept-encoding": ae }), params);
      expect(r.headers.get("content-encoding")).toBe("gzip");
      expect(gunzipSync(await bytes(r)).toString("utf8")).toBe(esperado);
    }
  });

  it("sem Accept-Encoding (ou só codificações que não usamos): sem compressão", async () => {
    const casos: Record<string, string>[] = [{}, { "accept-encoding": "identity" }, { "accept-encoding": "deflate" }, { "accept-encoding": "gzip;q=0" }];
    for (const headers of casos) {
      const r = await POST(pedido(headers), params);
      expect(r.headers.get("content-encoding")).toBeNull();
      expect(await r.text()).toBe(esperado);
    }
  });

  it("resposta pequena não é comprimida; dado fora do formato de linhas vai como antes", async () => {
    resultado = { ok: true };
    const r = await POST(pedido({ "accept-encoding": "br, gzip" }), params);
    expect(r.headers.get("content-encoding")).toBeNull();
    expect(await r.json()).toEqual({ dados: { ok: true } });
    expect(JSON.stringify({ dados: { ok: true } }).length).toBeLessThan(MINIMO_COMPRIMIR);
  });

  it("da rota ao hub-api.js: as telas recebem exatamente as linhas originais", async () => {
    const r = await POST(pedido({ "accept-encoding": "br" }), params);
    const corpo = JSON.parse(brotliDecompressSync(await bytes(r)).toString("utf8"));
    mesmo(await carregarHubApi(corpo)("x.y"), LINHAS);
  });
});
