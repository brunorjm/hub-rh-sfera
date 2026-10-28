// Driver local do storage (PDFs da Conexão RH) num diretório temporário:
// nunca em _local/arquivos.
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { storageLocal, validarCaminho } from "@/lib/storage";

let raiz: string;

beforeEach(async () => {
  raiz = await mkdtemp(path.join(tmpdir(), "hub-storage-"));
});

afterEach(async () => {
  await rm(raiz, { recursive: true, force: true });
});

const pdf = new TextEncoder().encode("%PDF-1.7 inventado");
const CAMINHO = "conexao-fit/123@2026-01-05/0b7e6a52-3c9d-4f4e-9a1b-2f8d6c5e4a3b.pdf";

describe("storage local", () => {
  it("grava e lê de volta, criando as pastas", async () => {
    const s = storageLocal(raiz);
    expect(await s.existe(CAMINHO)).toBe(false);
    expect(await s.ler(CAMINHO)).toBeNull();
    await s.gravar(CAMINHO, pdf, "application/pdf");
    expect(await s.existe(CAMINHO)).toBe(true);
    expect(Buffer.from((await s.ler(CAMINHO))!).toString()).toBe("%PDF-1.7 inventado");
    // Sem sobra de arquivo temporário.
    expect(await readdir(path.join(raiz, "conexao-fit", "123@2026-01-05"))).toEqual([path.basename(CAMINHO)]);
  });

  it("sobrescreve o mesmo caminho", async () => {
    const s = storageLocal(raiz);
    await s.gravar("a/b.pdf", pdf, "application/pdf");
    await s.gravar("a/b.pdf", new TextEncoder().encode("%PDF-2"), "application/pdf");
    expect(Buffer.from((await s.ler("a/b.pdf"))!).toString()).toBe("%PDF-2");
  });

  it.each([
    "../fora.pdf",
    "a/../../fora.pdf",
    "a/..",
    "..",
    "a..b/c.pdf",
    "/absoluto.pdf",
    "a//b.pdf",
    "a/b/",
    "a\b.pdf",
    "C:/x.pdf",
    ".oculto",
    "a/.oculto",
    "./a.pdf",
    "a b.pdf",
    "a/%2e%2e/b.pdf",
    "",
    "a".repeat(600),
  ])("recusa caminho malicioso ou fora do padrão: %j", async (caminho) => {
    const s = storageLocal(raiz);
    expect(() => validarCaminho(caminho)).toThrow(/Caminho de arquivo inválido/);
    await expect(s.gravar(caminho, pdf, "application/pdf")).rejects.toThrow(/Caminho de arquivo inválido/);
    await expect(s.ler(caminho)).rejects.toThrow(/Caminho de arquivo inválido/);
    await expect(s.existe(caminho)).rejects.toThrow(/Caminho de arquivo inválido/);
  });

  it("não lê arquivo fora da raiz mesmo que exista", async () => {
    await writeFile(path.join(path.dirname(raiz), `fora-${path.basename(raiz)}.pdf`), pdf);
    const s = storageLocal(raiz);
    await expect(s.ler(`../fora-${path.basename(raiz)}.pdf`)).rejects.toThrow(/inválido/);
    await rm(path.join(path.dirname(raiz), `fora-${path.basename(raiz)}.pdf`), { force: true });
  });

  it("recusa caminho que não é texto", () => {
    expect(() => validarCaminho(undefined)).toThrow();
    expect(() => validarCaminho(42)).toThrow();
  });
});
