import { z } from "zod";

// Validação do ambiente. Lida só quando alguém pede (getEnv), para o build e os
// testes unitários não exigirem banco/Redis configurados.
const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url(),
    NEXTAUTH_URL: z.string().url(),
    NEXTAUTH_SECRET: z.string().min(32, "NEXTAUTH_SECRET precisa de 32+ caracteres"),
    REDIS_URL: z.string().url(),
    TRUST_PROXY: z.enum(["true", "false", ""]).optional(),
    STORAGE_DRIVER: z.enum(["local", "r2"]).default("local"),
    S3_ENDPOINT: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    TWYGO_API_TOKEN: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER === "r2") {
      for (const k of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
        if (!env[k]) ctx.addIssue({ code: "custom", path: [k], message: `${k} é obrigatória com STORAGE_DRIVER=r2` });
      }
    }
  });

export type Env = z.infer<typeof schema>;

let cache: Env | null = null;

export function getEnv(): Env {
  if (cache) return cache;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const campos = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Variáveis de ambiente inválidas — ${campos}`);
  }
  cache = parsed.data;
  return cache;
}
