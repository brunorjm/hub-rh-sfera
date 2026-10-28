// Copia os PDFs do Fit Cultural (bucket privado "conexao-fit" do Supabase
// Storage) para o storage do hub (STORAGE_DRIVER: local ou r2), mantendo o
// caminho: <colaborador>/<id>.pdf vira "conexao-fit/<colaborador>/<id>.pdf"
// (o mesmo que src/server/hub/conexao.ts lê).
//
// Uso (PowerShell ou bash), na virada, com as credenciais SÓ no ambiente do processo:
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<chave> npx tsx scripts/migrar-arquivos-supabase.ts [--simular]
//   --simular  lista e confere, sem baixar nem gravar.
//
// - SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são lidas do ambiente no momento da
//   execução, ANTES do .env: nunca as grave no .env, em arquivo ou no histórico
//   do shell (prefira digitar com o histórico desligado ou um gerenciador de segredo).
//   A service_role ignora as policies: só quem coordena a virada roda isto.
// - O destino vem do .env/ambiente do hub (STORAGE_DRIVER, S3_*), como o app.
// - Idempotente: arquivo que já existe no destino é pulado (o PDF é imutável).
//   Pode ser reexecutado até não sobrar nada a copiar.
// - Só aceita caminhos no padrão de conexao_private.allowed_pdf; o resto é
//   contado como ignorado. Confere que cada arquivo começa com "%PDF-".
// - Não imprime conteúdo nem dado pessoal: só contagens e o caminho do que falhar.
// - NÃO foi rodado contra produção; usa só fetch (API REST do Storage, a mesma
//   do storage-js: POST /storage/v1/object/list/<bucket>, GET /storage/v1/object/<bucket>/<caminho>).
import { config } from "dotenv";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
config({ quiet: true });

const BUCKET = "conexao-fit";
const PADRAO = /^[0-9]+@[0-9]{4}-[0-9]{2}-[0-9]{2}\/[0-9a-f-]{36}\.pdf$/;
const LIMITE_BYTES = 10 * 1024 * 1024;
const PAGINA = 100;
const simular = process.argv.includes("--simular");

type ObjetoLista = { name: string; id: string | null };

function base(): string {
  let url: URL;
  try {
    url = new URL(SUPABASE_URL);
  } catch {
    throw new Error("Defina SUPABASE_URL (https://<ref>.supabase.co) no ambiente do processo.");
  }
  if (url.protocol !== "https:") throw new Error("SUPABASE_URL precisa ser https.");
  if (!CHAVE) throw new Error("Defina SUPABASE_SERVICE_ROLE_KEY no ambiente do processo.");
  return `${url.origin}/storage/v1`;
}

const cabecalhos = () => ({ Authorization: `Bearer ${CHAVE}`, apikey: CHAVE });

async function listar(api: string, prefixo: string): Promise<ObjetoLista[]> {
  const todos: ObjetoLista[] = [];
  for (let offset = 0; ; offset += PAGINA) {
    const resp = await fetch(`${api}/object/list/${BUCKET}`, {
      method: "POST",
      headers: { ...cabecalhos(), "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: prefixo, limit: PAGINA, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!resp.ok) throw new Error(`Falha ao listar o bucket (HTTP ${resp.status}).`);
    const pagina = (await resp.json()) as ObjetoLista[];
    todos.push(...pagina);
    if (pagina.length < PAGINA) return todos;
  }
}

// Pastas (id null) descem um nível; arquivos voltam com o caminho completo.
async function caminhos(api: string, prefixo = "", profundidade = 0): Promise<string[]> {
  const saida: string[] = [];
  for (const o of await listar(api, prefixo)) {
    const caminho = prefixo ? `${prefixo}/${o.name}` : o.name;
    if (o.id === null) {
      if (profundidade < 3) saida.push(...(await caminhos(api, caminho, profundidade + 1)));
    } else {
      saida.push(caminho);
    }
  }
  return saida;
}

async function baixar(api: string, caminho: string): Promise<Uint8Array> {
  const alvo = caminho.split("/").map(encodeURIComponent).join("/");
  const resp = await fetch(`${api}/object/${BUCKET}/${alvo}`, { headers: cabecalhos() });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const bytes = new Uint8Array(await resp.arrayBuffer());
  if (bytes.length > LIMITE_BYTES) throw new Error("maior que 10 MB");
  if (Buffer.from(bytes.subarray(0, 5)).toString("latin1") !== "%PDF-") throw new Error("não começa com %PDF-");
  return bytes;
}

async function main() {
  const api = base();
  // Import depois do .env: o driver vem do ambiente do hub.
  const { getStorage } = await import("../src/lib/storage");
  const storage = getStorage();
  const lista = await caminhos(api);
  const validos = lista.filter((c) => PADRAO.test(c));
  const conta = { encontrados: lista.length, ignorados: lista.length - validos.length, jaExistiam: 0, copiados: 0, falhas: 0 };

  for (const caminho of validos) {
    const destino = `${BUCKET}/${caminho}`;
    if (await storage.existe(destino)) {
      conta.jaExistiam++;
      continue;
    }
    if (simular) {
      conta.copiados++;
      continue;
    }
    try {
      await storage.gravar(destino, await baixar(api, caminho), "application/pdf");
      conta.copiados++;
    } catch (e) {
      conta.falhas++;
      console.error(`Falhou: ${caminho} (${(e as Error).message})`);
    }
  }
  console.info(`${simular ? "[simulação] " : ""}${JSON.stringify(conta)}`);
  if (conta.falhas) process.exitCode = 1;
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exitCode = 1;
});
