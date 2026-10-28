import { getEnv } from "@/config/env";

describe("getEnv", () => {
  const original = process.env;
  afterEach(() => { process.env = original; jest.resetModules(); });

  it("exige as credenciais do R2 quando STORAGE_DRIVER=r2", () => {
    process.env = {
      ...original,
      DATABASE_URL: "postgresql://u:p@localhost:5435/hub_rh",
      NEXTAUTH_URL: "http://localhost:3006",
      NEXTAUTH_SECRET: "x".repeat(32),
      REDIS_URL: "redis://localhost:6380",
      STORAGE_DRIVER: "r2",
    };
    expect(() => getEnv()).toThrow(/S3_ENDPOINT/);
  });
});
