// usuarioAtual() recusa sessão emitida antes de usuarios.sessoes_validas_desde
// (redefinir senha, inativar, desligar), sem depender do Redis.
const getServerSession = jest.fn();
jest.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => getServerSession(...a) }));
jest.mock("@/lib/sessao-revogacao", () => ({
  jtiRevogado: jest.fn(async () => false),
  registrarJti: jest.fn(async () => {}),
  revogarJti: jest.fn(async () => {}),
  revogarSessoesDoUsuario: jest.fn(async () => {}),
}));

import { usuarioAtual } from "@/lib/sessao";
import { criarConta, executar, limpar, prisma } from "../helpers/hub";

beforeEach(async () => {
  await limpar();
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

describe("usuarioAtual e sessoes_validas_desde", () => {
  it("iat antigo é recusado depois de redefinir a senha; login novo entra", async () => {
    const admin = await criarConta({ perfil: "admin" });
    const alvo = await criarConta({ perfil: "gestor" });
    const loginAntigo = Date.now() - 60_000;
    getServerSession.mockResolvedValue({ uid: alvo.id, jti: "jti-antigo", iat: loginAntigo });
    expect((await usuarioAtual())?.id).toBe(alvo.id);

    expect((await executar("admin.redefinirSenha", { id: alvo.id, senha: "novaProvisoria9" }, admin)).status).toBe(200);
    getServerSession.mockResolvedValue({ uid: alvo.id, jti: "jti-antigo", iat: loginAntigo });
    expect(await usuarioAtual()).toBeNull();

    getServerSession.mockResolvedValue({ uid: alvo.id, jti: "jti-novo", iat: Date.now() + 1_000 });
    expect((await usuarioAtual())?.id).toBe(alvo.id);
  });

  it("sessão sem iat não passa quando há revogação gravada", async () => {
    const alvo = await criarConta({ perfil: "gestor" });
    await prisma.usuarios.update({ where: { id: alvo.id }, data: { sessoes_validas_desde: new Date() } });
    getServerSession.mockResolvedValue({ uid: alvo.id, jti: "j" });
    expect(await usuarioAtual()).toBeNull();
  });
});
