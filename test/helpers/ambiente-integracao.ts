// Testes de integração usam SÓ o banco de testes do compose (perfil "test",
// porta 5436), com dados inventados. Nunca o banco local com a cópia de produção.
import { config } from "dotenv";

config({ quiet: true });
const url = process.env.DATABASE_URL_TEST;
if (!url) throw new Error("Defina DATABASE_URL_TEST no .env (banco de testes do compose).");
const host = new URL(url).hostname;
if (!["127.0.0.1", "localhost"].includes(host) || !/hub_test/.test(url)) {
  throw new Error("DATABASE_URL_TEST precisa apontar para o banco hub_test local.");
}
process.env.DATABASE_URL = url;
