import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getEnv } from "@/config/env";

// Arquivos do hub (PDFs do Fit Cultural da Conexão RH). Dois drivers, escolhidos
// por STORAGE_DRIVER: "local" (dev, em _local/arquivos, fora do repo) e "r2"
// (homologação e produção, Cloudflare R2 pela API S3). O arquivo nunca tem URL
// pública: só sai pelas rotas autenticadas de src/app/api/arquivos.
//
// Sem "server-only" de propósito: o scripts/migrar-arquivos-supabase.ts usa
// este mesmo módulo fora do Next.
export interface Storage {
  gravar(caminho: string, bytes: Uint8Array, contentType: string): Promise<void>;
  // null = não existe.
  ler(caminho: string): Promise<Uint8Array | null>;
  existe(caminho: string): Promise<boolean>;
}

// Caminho relativo, em segmentos de letras, números e @ . _ - (cada um começando
// por letra ou número: nada de ".", ".." nem arquivo oculto), sem barra inicial,
// sem barra invertida e sem ".." em lugar nenhum.
const SEGMENTO = "[A-Za-z0-9][A-Za-z0-9@._-]{0,127}";
const PADRAO = new RegExp(`^${SEGMENTO}(?:/${SEGMENTO}){0,7}$`);

export function validarCaminho(caminho: unknown): string {
  if (typeof caminho !== "string" || caminho.length > 512 || caminho.includes("..") || !PADRAO.test(caminho)) {
    throw new Error("Caminho de arquivo inválido.");
  }
  return caminho;
}

export function storageLocal(raiz: string): Storage {
  const base = path.resolve(raiz);
  // Segunda trava (além do padrão): o destino resolvido fica dentro da raiz.
  const destino = (caminho: string) => {
    const alvo = path.resolve(base, ...validarCaminho(caminho).split("/"));
    if (!alvo.startsWith(base + path.sep)) throw new Error("Caminho de arquivo inválido.");
    return alvo;
  };
  return {
    async gravar(caminho, bytes) {
      const alvo = destino(caminho);
      await mkdir(path.dirname(alvo), { recursive: true });
      // Grava ao lado e renomeia: quem lê nunca vê arquivo pela metade.
      const temporario = `${alvo}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporario, bytes);
        await rename(temporario, alvo);
      } catch (e) {
        await rm(temporario, { force: true });
        throw e;
      }
    },
    async ler(caminho) {
      try {
        return new Uint8Array(await readFile(destino(caminho)));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
      }
    },
    async existe(caminho) {
      try {
        return (await stat(destino(caminho))).isFile();
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw e;
      }
    },
  };
}

export type ConfigR2 = { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string };

const naoEncontrado = (e: unknown) => {
  const erro = e as { name?: string; $metadata?: { httpStatusCode?: number } };
  return erro?.name === "NoSuchKey" || erro?.name === "NotFound" || erro?.$metadata?.httpStatusCode === 404;
};

export function storageR2(cfg: ConfigR2): Storage {
  // SDK carregado só quando o driver r2 é usado.
  const cliente = (async () => {
    const s3 = await import("@aws-sdk/client-s3");
    const client = new s3.S3Client({
      region: "auto",
      endpoint: cfg.endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
    return { s3, client };
  })();
  return {
    async gravar(caminho, bytes, contentType) {
      const { s3, client } = await cliente;
      await client.send(new s3.PutObjectCommand({
        Bucket: cfg.bucket, Key: validarCaminho(caminho), Body: bytes, ContentType: contentType,
      }));
    },
    async ler(caminho) {
      const { s3, client } = await cliente;
      try {
        const r = await client.send(new s3.GetObjectCommand({ Bucket: cfg.bucket, Key: validarCaminho(caminho) }));
        return r.Body ? await r.Body.transformToByteArray() : null;
      } catch (e) {
        if (naoEncontrado(e)) return null;
        throw e;
      }
    },
    async existe(caminho) {
      const { s3, client } = await cliente;
      try {
        await client.send(new s3.HeadObjectCommand({ Bucket: cfg.bucket, Key: validarCaminho(caminho) }));
        return true;
      } catch (e) {
        if (naoEncontrado(e)) return false;
        throw e;
      }
    },
  };
}

let atual: Storage | null = null;

// Driver do ambiente (STORAGE_DRIVER), criado uma vez.
export function getStorage(): Storage {
  if (atual) return atual;
  const env = getEnv();
  atual = env.STORAGE_DRIVER === "r2"
    ? storageR2({
      endpoint: env.S3_ENDPOINT!, bucket: env.S3_BUCKET!,
      accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    })
    : storageLocal(path.join(process.cwd(), "_local", "arquivos"));
  return atual;
}
