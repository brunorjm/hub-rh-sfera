import type { Config } from "jest";

const base = {
  testEnvironment: "node",
  roots: ["<rootDir>/test", "<rootDir>/src"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    // `server-only` só existe no bundler do Next; no Jest é um no-op.
    "^server-only$": "<rootDir>/test/helpers/empty-module.ts",
  },
  transform: { "^.+\.[tj]sx?$": ["ts-jest", { tsconfig: "./tsconfig.test.json", diagnostics: false }] },
  transformIgnorePatterns: [
    "/node_modules/(?!(sanitize-html|htmlparser2|domhandler|domutils|dom-serializer|entities|domelementtype|is-plain-object|deepmerge|escape-string-regexp|parse-srcset|postcss)/)",
  ],
  clearMocks: true,
  // Máquina de dev com pouca memória livre: no máximo 2 workers.
  maxWorkers: 2,
};

const config: Config = {
  projects: [
    { ...base, displayName: "unit", testMatch: ["**/test/**/*.unit.spec.ts"] },
    {
      ...base,
      displayName: "integration",
      testMatch: ["**/test/**/*.integration.spec.ts"],
      // Só o banco de testes (dados inventados); nunca a cópia de produção.
      setupFiles: ["<rootDir>/test/helpers/ambiente-integracao.ts"],
      maxWorkers: 1,
      testTimeout: 30000,
    },
  ],
};

export default config;
