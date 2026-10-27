import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Mesma base do Portal do Fera (eslint-config-next + regras de borda entre camadas).
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "next-env.d.ts", "node_modules/**", "coverage/**",
    "playwright-report/**", "test-results/**", "docs/**", "_local/**", "legado/**"]),
  {
    name: "hub/arquitetura",
    rules: {
      "no-restricted-imports": ["error", { patterns: [
        { group: ["@/app/*"], message: "Não importe de /app (é só roteamento). Use /components e /lib." },
        { group: ["../../*", "../../../*"], message: "Use caminho absoluto com @/." },
      ] }],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
    },
  },
  {
    name: "hub/lib",
    files: ["src/lib/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [
        { group: ["@/app/*"], message: "/lib não importa de /app." },
        { group: ["react"], importNames: ["default", "useState", "useEffect", "useMemo", "useCallback", "useRef", "useContext"], message: "/lib é código puro, sem hooks." },
      ] }],
    },
  },
  {
    name: "hub/server",
    files: ["src/server/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [
        { group: ["react", "react-dom"], message: "Server Actions não importam React." },
      ] }],
    },
  },
]);
