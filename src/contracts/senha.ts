import { z } from "zod";

export const trocarSenhaSchema = z
  .object({
    atual: z.string().min(1, "Informe a senha atual.").max(200),
    nova: z.string().min(8, "A nova senha precisa de pelo menos 8 caracteres.").max(200, "Senha longa demais."),
    confirmacao: z.string(),
  })
  .refine((d) => d.nova === d.confirmacao, { path: ["confirmacao"], message: "A confirmação não bate com a nova senha." })
  .refine((d) => d.nova !== d.atual, { path: ["nova"], message: "A nova senha precisa ser diferente da atual." });

export type TrocarSenhaEntrada = z.infer<typeof trocarSenhaSchema>;
