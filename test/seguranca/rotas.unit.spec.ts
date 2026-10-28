// Rotas POST com cookie: origem pelo helper único e corpo com limite real
// (lido em pedaços, mesmo sem Content-Length). Sessão e operações simuladas.
const usuario = { id: "u1", email: "u@exemplo.test", nome: "U", perfil: "admin", trocarSenha: false, verComo: null, jti: "j" };
jest.mock("@/lib/sessao", () => ({ usuarioAtual: jest.fn(async () => usuario) }));
const executarOperacao = jest.fn(async () => ({ status: 200, dados: "ok" }));
jest.mock("@/server/hub/executar", () => ({ executarOperacao: (...a: unknown[]) => executarOperacao(...(a as [])) }));
const encerrarVerComo = jest.fn(async () => {});
jest.mock("@/server/hub/admin", () => ({ encerrarVerComo: (...a: unknown[]) => encerrarVerComo(...(a as [])) }));
jest.mock("@/lib/login", () => ({ registrarAcesso: jest.fn(async () => {}) }));
jest.mock("@/server/hub/pagina-hub", () => ({ PAGINA_HUB: "" }));

/* eslint-disable no-restricted-imports -- o teste chama as próprias rotas */
import { POST as postOperacao } from "@/app/api/hub/[operacao]/route";
import { POST as postHub } from "@/app/hub/route";
/* eslint-enable no-restricted-imports */

function emPedacos(total: number, tamanho = 1024 * 1024) {
  let enviados = 0;
  const bloco = new TextEncoder().encode(" ".repeat(tamanho));
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (enviados * tamanho >= total) return c.close();
      enviados++;
      c.enqueue(bloco);
    },
  });
  return { body, enviados: () => enviados };
}

const params = { params: Promise.resolve({ operacao: "x.y" }) };
const req = (url: string, init: RequestInit & { headers?: Record<string, string> }) =>
  new Request(url, { method: "POST", duplex: "half", ...init } as RequestInit);

describe("POST /api/hub/<operação>", () => {
  it("corpo chunked acima de 8 MB: 413 sem ler o resto e sem executar", async () => {
    const c = emPedacos(64 * 1024 * 1024);
    const r = await postOperacao(req("http://localhost/api/hub/x.y", { body: c.body }), params);
    expect(r.status).toBe(413);
    expect(c.enviados()).toBeLessThan(12);
    expect(executarOperacao).not.toHaveBeenCalled();
  });

  it("dentro do limite executa; JSON torto 400", async () => {
    const r = await postOperacao(req("http://localhost/api/hub/x.y", { body: '{"a":1}' }), params);
    expect(r.status).toBe(200);
    expect(executarOperacao).toHaveBeenCalledWith("x.y", { a: 1 }, usuario, null);
    expect((await postOperacao(req("http://localhost/api/hub/x.y", { body: "{" }), params)).status).toBe(400);
  });

  it("outra origem ou Sec-Fetch-Site cross-site: 403", async () => {
    const casos: Record<string, string>[] = [{ origin: "https://outro.test" }, { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" }];
    for (const headers of casos) {
      expect((await postOperacao(req("http://localhost/api/hub/x.y", { body: "{}", headers }), params)).status).toBe(403);
    }
    expect(executarOperacao).not.toHaveBeenCalled();
  });
});

describe("POST /hub (encerrar Visualizar como)", () => {
  const url = "http://localhost/hub?acao=encerrar-ver-como";

  it("corpo acima de 16 KB: 413", async () => {
    const c = emPedacos(1024 * 1024, 4 * 1024);
    expect((await postHub(req(url, { body: c.body }))).status).toBe(413);
    expect(c.enviados()).toBeLessThan(10);
    expect(encerrarVerComo).not.toHaveBeenCalled();
  });

  it("sem corpo: encerra; outra origem: 403", async () => {
    expect((await postHub(req(url, { headers: { "sec-fetch-site": "cross-site" } }))).status).toBe(403);
    expect((await postHub(req(url, {}))).status).toBe(200);
    expect(encerrarVerComo).toHaveBeenCalledTimes(1);
  });
});
