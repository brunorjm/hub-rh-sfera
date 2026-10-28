import { criarConta, executar, limpar, prisma } from "../helpers/hub";

afterAll(async () => {
  await limpar("vagas");
  await prisma.$disconnect();
});

// A tela antiga mostrava a mensagem do Postgres (via Supabase) quando o dado não
// passava numa regra do banco; o servidor novo mantém isso em vez de um erro genérico.
it("erro de regra do banco chega à tela com a mensagem do Postgres", async () => {
  const admin = await criarConta({ perfil: "admin" });
  const r = await executar("recrutamento.inserir", { tabela: "vagas", linha: { data_abertura: "não é data" } }, admin);
  expect(r.status).toBeGreaterThanOrEqual(400);
  expect(r.status).toBeLessThan(500);
  // Mensagem do Postgres (não a validação de entrada nem o erro genérico).
  expect("erro" in r && r.erro).toMatch(/invalid input syntax|violates/i);
});

it("mensagem do banco chega sem o prefixo de severidade do Postgres", async () => {
  const { mensagemDoBanco } = await import("@/server/hub/operacao");
  expect(mensagemDoBanco("ERROR: Link inválido ou expirado.", "x")).toBe("Link inválido ou expirado.");
  expect(mensagemDoBanco("Este mês está fechado.", "x")).toBe("Este mês está fechado.");
  expect(mensagemDoBanco(undefined, "padrão")).toBe("padrão");
});
