import "server-only";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";

// Corpo das respostas de /api/hub (spec de otimização da carga, fase 1).
// Duas coisas, nenhuma muda o que as telas recebem:
// 1) lista de linhas vai em colunas (os nomes das chaves uma vez só);
//    public/legado-ui/js/hub-api.js remonta os objetos antes de devolver;
// 2) o JSON vai comprimido (brotli ou gzip) quando o navegador aceita.

export type Colunas = { __colunas: string[]; __linhas: unknown[][] };

const objetoSimples = (v: unknown): v is Record<string, unknown> => {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

// Array com 2+ objetos simples, todos com as MESMAS chaves na MESMA ordem e
// nenhum valor undefined (no JSON de objeto a chave sumiria; na linha viraria
// null). Qualquer outra coisa passa intacta.
export function codificarColunas(dados: unknown): unknown {
  if (!Array.isArray(dados) || dados.length < 2) return dados;
  const primeiro = dados[0];
  if (!objetoSimples(primeiro)) return dados;
  const colunas = Object.keys(primeiro);
  if (!colunas.length || colunas.includes("__proto__")) return dados;
  const linhas: unknown[][] = new Array(dados.length);
  for (let i = 0; i < dados.length; i++) {
    const o = dados[i];
    if (!objetoSimples(o)) return dados;
    const chaves = Object.keys(o);
    if (chaves.length !== colunas.length) return dados;
    const linha = new Array(colunas.length);
    for (let j = 0; j < colunas.length; j++) {
      if (chaves[j] !== colunas[j]) return dados;
      const v = o[colunas[j]!];
      if (v === undefined) return dados;
      linha[j] = v;
    }
    linhas[i] = linha;
  }
  return { __colunas: colunas, __linhas: linhas } satisfies Colunas;
}

// Abaixo disso não compensa (o mesmo limite do compression do Next).
export const MINIMO_COMPRIMIR = 1024;

const brotli = promisify(brotliCompress);
const gzipar = promisify(gzip);

// Codificações aceitas pelo pedido (ignora as com q=0).
function aceitas(acceptEncoding: string | null): Set<string> {
  const r = new Set<string>();
  for (const parte of (acceptEncoding ?? "").split(",")) {
    const [nome, ...params] = parte.trim().toLowerCase().split(";");
    if (!nome) continue;
    const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    if (q && !(Number(q.slice(2)) > 0)) continue;
    r.add(nome.trim());
  }
  return r;
}

// Resposta 200 com o JSON já serializado. O compression do servidor do Next
// (next/dist/server/lib/router-server.js) pula resposta que já tem
// Content-Encoding ("already encoded"), então não comprime duas vezes.
export async function respostaJson(json: string, acceptEncoding: string | null): Promise<Response> {
  const headers = new Headers({ "Content-Type": "application/json", Vary: "Accept-Encoding" });
  const bruto = Buffer.from(json, "utf8");
  if (bruto.byteLength >= MINIMO_COMPRIMIR) {
    const ok = aceitas(acceptEncoding);
    let corpo: Buffer | null = null;
    if (ok.has("br")) {
      // Qualidade 4: quase o tamanho do gzip -9 com uma fração do tempo.
      corpo = await brotli(bruto, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: 4,
          [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
          [constants.BROTLI_PARAM_SIZE_HINT]: bruto.byteLength,
        },
      });
      headers.set("Content-Encoding", "br");
    } else if (ok.has("gzip")) {
      corpo = await gzipar(bruto, { level: 6 });
      headers.set("Content-Encoding", "gzip");
    }
    if (corpo) {
      // Cópia num ArrayBuffer próprio (o tipo de BodyInit não aceita ArrayBufferLike); é o corpo já comprimido.
      return new Response(new Uint8Array(corpo), { status: 200, headers });
    }
  }
  return new Response(new Uint8Array(bruto.buffer, bruto.byteOffset, bruto.byteLength), { status: 200, headers });
}
