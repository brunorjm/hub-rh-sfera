import bcrypt from "bcryptjs";

const queryRaw = jest.fn();
const findUnique = jest.fn();
const update = jest.fn();
jest.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: (...a: unknown[]) => queryRaw(...a), profiles: { findUnique: (...a: unknown[]) => findUnique(...a) }, usuarios: { update: (...a: unknown[]) => update(...a) } },
}));
const conferirLimite = jest.fn();
const registrarErro = jest.fn();
const limparErros = jest.fn();
jest.mock("@/lib/limite-login", () => ({
  conferirLimite: (...a: unknown[]) => conferirLimite(...a),
  registrarErro: (...a: unknown[]) => registrarErro(...a),
  limparErros: (...a: unknown[]) => limparErros(...a),
}));
const comUsuarioSql = jest.fn();
jest.mock("@/lib/sql-usuario", () => ({ comUsuarioSql: (...a: unknown[]) => comUsuarioSql(...a) }));

import { autenticar, dispositivoDe, FalhaLogin } from "@/lib/login";
import { trocarSenhaSchema } from "@/contracts/senha";

// Hash no formato do Supabase ($2a$, custo 10), de uma senha inventada.
const HASH = bcrypt.hashSync("senha-de-teste-1", 10).replace(/^\$2b\$/, "$2a$");
const ID = "11111111-1111-1111-1111-111111111111";

const codigo = async (p: Promise<unknown>) => {
  try { await p; return "OK"; } catch (e) { return e instanceof FalhaLogin ? e.codigo : String(e); }
};

beforeEach(() => {
  conferirLimite.mockResolvedValue(undefined);
  queryRaw.mockResolvedValue([{ id: ID, senha_hash: HASH, trocar_senha: false }]);
  findUnique.mockResolvedValue({ nome: "Ana Teste", email: "ana@exemplo.test", status: "ativo" });
  update.mockResolvedValue({});
  comUsuarioSql.mockResolvedValue(undefined);
});

describe("autenticar", () => {
  it("aceita a senha contra o hash bcrypt $2a$ migrado do Supabase", async () => {
    const r = await autenticar("  Ana@Exemplo.Test ", "senha-de-teste-1", "1.2.3.4", "Mozilla/5.0 (iPhone)");
    expect(r).toEqual({ id: ID, email: "ana@exemplo.test", nome: "Ana Teste", trocarSenha: false });
    expect(limparErros).toHaveBeenCalledWith("1.2.3.4", "ana@exemplo.test");
    expect(update).toHaveBeenCalled();
    expect(comUsuarioSql).toHaveBeenCalledWith(ID, expect.any(Function));
  });

  it("senha errada: CREDENCIAIS e conta o erro no limite", async () => {
    expect(await codigo(autenticar("ana@exemplo.test", "errada", "ip"))).toBe("CREDENCIAIS");
    expect(registrarErro).toHaveBeenCalledWith("ip", "ana@exemplo.test");
    expect(update).not.toHaveBeenCalled();
  });

  it("e-mail inexistente dá a mesma resposta de senha errada", async () => {
    queryRaw.mockResolvedValue([]);
    expect(await codigo(autenticar("ninguem@exemplo.test", "x", "ip"))).toBe("CREDENCIAIS");
  });

  it("conta sem senha (apagada no Supabase) não entra", async () => {
    queryRaw.mockResolvedValue([{ id: ID, senha_hash: null, trocar_senha: false }]);
    expect(await codigo(autenticar("ana@exemplo.test", "senha-de-teste-1", "ip"))).toBe("CREDENCIAIS");
  });

  it("status do perfil segue as mensagens do hub antigo", async () => {
    findUnique.mockResolvedValueOnce(null);
    expect(await codigo(autenticar("ana@exemplo.test", "senha-de-teste-1", "ip"))).toBe("SEM_PERFIL");
    findUnique.mockResolvedValueOnce({ nome: "A", email: "a", status: "desligado" });
    expect(await codigo(autenticar("ana@exemplo.test", "senha-de-teste-1", "ip"))).toBe("DESLIGADO");
    findUnique.mockResolvedValueOnce({ nome: "A", email: "a", status: "inativo" });
    expect(await codigo(autenticar("ana@exemplo.test", "senha-de-teste-1", "ip"))).toBe("INATIVO");
    expect(update).not.toHaveBeenCalled();
  });

  it("bloqueado pelo limite nem confere a senha", async () => {
    conferirLimite.mockRejectedValue(new Error("LOGIN_BLOQUEADO"));
    expect(await codigo(autenticar("ana@exemplo.test", "senha-de-teste-1", "ip"))).toBe("BLOQUEADO");
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("entrada vazia ou absurda é recusada antes do banco", async () => {
    expect(await codigo(autenticar("", "x", "ip"))).toBe("CREDENCIAIS");
    expect(await codigo(autenticar("a@b.c", "x".repeat(201), "ip"))).toBe("CREDENCIAIS");
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe("dispositivoDe", () => {
  it("classifica como o hub antigo", () => {
    expect(dispositivoDe("Mozilla/5.0 (Linux; Android 14)")).toBe("celular");
    expect(dispositivoDe("Mozilla/5.0 (Windows NT 10.0)")).toBe("computador");
    expect(dispositivoDe(undefined)).toBe("computador");
  });
});

describe("trocarSenhaSchema", () => {
  it("exige 8+ caracteres, confirmação igual e senha diferente da atual", () => {
    expect(trocarSenhaSchema.safeParse({ atual: "a", nova: "curta", confirmacao: "curta" }).success).toBe(false);
    expect(trocarSenhaSchema.safeParse({ atual: "a", nova: "12345678", confirmacao: "12345679" }).success).toBe(false);
    expect(trocarSenhaSchema.safeParse({ atual: "12345678", nova: "12345678", confirmacao: "12345678" }).success).toBe(false);
    expect(trocarSenhaSchema.safeParse({ atual: "a", nova: "12345678", confirmacao: "12345678" }).success).toBe(true);
  });
});
