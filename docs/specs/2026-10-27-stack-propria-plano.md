---
Documento: Plano de execução — Hub Sfera em stack própria
Data: 2026-10-27
Spec: 2026-10-27-stack-propria.md (aprovada em 2026-10-27)
Branch: feat/stack-propria
---

# Plano de execução

As versões das bibliotecas seguem as que já rodam no Portal do Fera, como mostra `node_modules` em 2026-10-27:
- next 16.3.0, react 19.2.7, next-auth 4.24.15;
- prisma 6.19.3, ioredis 5.11.1, bcryptjs 3.0.3;
- zod 4.4.3, rate-limiter-flexible 11.2.0, @tanstack/react-query 5.100.14;
- jest 30.4.2, ts-jest 29.4.11, typescript 5.9.3, @playwright/test 1.61.0, tsx 4.23.13;
- @aws-sdk/client-s3 3.1106.0, sanitize-html 2.17.6.

Bibliotecas do hub atual: chart.js 4.4.4, chartjs-plugin-datalabels 2.2.0, xlsx 0.20.3 e pptxgenjs 3.12.0.

Cada fase termina com evidência: comando rodado e saída verde. Só depois a próxima fase começa.

## Fase A — Local (sem VPS)

### A1. Esqueleto
- Fazer `git mv` do app atual para `legado/`. Os testes antigos continuam rodando de lá (`npm run test:legado`).
- Criar o Next.js 16 com TS strict e alias `@/`, com a mesma configuração base do Portal: tsconfig, eslint, jest e `next.config` (standalone e headers de segurança).
- **Pronto quando:** `npm run lint`, `type-check`, `build`, `test` e `test:legado` passam.

### A2. Infra local
- `docker-compose.yml` com:
  - `db`: Postgres, na mesma major do dump, em 127.0.0.1:5435;
  - `redis`: 127.0.0.1:6380, com senha;
  - `postgres-test`: perfil `test`, porta 5436;
  - subnet `172.29.231.0/24`.
- `.env.example` com os nomes das variáveis e `src/config/env.ts` validando com Zod.
- **Pronto quando:** `docker compose up -d db redis` sobe saudável.

### A3. Import do Supabase (depende do dump em `_local/supabase.dump`)
O script `scripts/importar-supabase.sh` faz, em ordem:
1. Restaura o schema `public` e a tabela `auth.users`.
2. Cria `usuarios` a partir de `auth.users`.
3. Cria a função de compatibilidade `auth.uid()`, que lê `app.usuario_id`.
4. Remove as policies, os grants de `anon`/`authenticated` e as extensões e referências de pg_cron, pg_net e storage.
5. Faz a checagem de fumaça: executa cada função SQL e lista as que falham.

Depois disso:
- `prisma db pull` gera o schema.
- Cria a migration `0_baseline` com `migrate resolve --applied`.
- Gera o seed de teste com dados inventados para o `postgres-test`.
- **Pronto quando:**
  - a contagem de linhas por tabela é igual entre o dump e o banco local;
  - a checagem de fumaça não acusa falhas;
  - `prisma validate` passa.

### A4. Núcleo
- `lib/prisma`.
- `lib/redis` e o rate-limit.
- `lib/auth`: NextAuth Credentials com bcrypt, sessão de 8h e revogação no Redis.
- `lib/rbac`:
  - catálogo e presets, portados do `permissions.js`;
  - `exigirPermissao`;
  - `filtroRecorte`;
  - `comUsuarioSql`: transação com `set_config('app.usuario_id')`.
- "Visualizar como": servidor e bloqueio de escrita.
- `acesso_log`, `upload_log` e `viewas_log`.
- Telas de login, de troca obrigatória de senha e de cadastro autorizado.
- **Pronto quando:**
  - os testes unitários do rbac e do recorte passam;
  - o login funciona com a senha migrada do banco local;
  - o teste-varredura de `exigirPermissao` passa.

### A5. Cálculos
- Portar `parsers*` e `metrics*` para `src/lib/calculos/`, em TS e sem mudar a lógica. O acesso a dados que estava misturado nos metrics está especificado em `src/lib/calculos/ACESSO-A-DADOS.md`.
- Portar os 418 asserts para Jest.
- **Pronto quando:** os 418 asserts portados passam e a paridade sobre os dados locais dá idêntico (A7).

### A6. Layout e telas
1. CSS atual em `src/styles`.
2. Shell: menu filtrado pelo catálogo, barra de filtros e faixa do "Visualizar como".
3. Componentes de gráfico sobre o Chart.js, com as opções do `ui-charts.js`.
4. Telas, por módulo, cada uma com server action, recorte e permissão:
   1. Indicadores: headcount, organograma, rotatividade, desligamento, controle de desligamento, experiência, clima, engajamento, satisfação, boletim, feedbacks, 1:1, treinamentos e celebrações.
   2. Recrutamento: dashboard, vagas, candidatos, agenda, banco de talentos, aprovações, histórico, transferência e parecer.
   3. T&D: onboarding, visita em loja e turmas.
   4. Conexão RH.
   5. Fechamento.
   6. Administração: upload, cadastros, usuários e log.
- **Pronto quando:** cada tela abre para admin, rh e gestor sobre os dados locais, e a paridade daquela tela passa.

### A7. Links públicos, arquivos, Twygo e verificação
- **Rotas públicas:** `/api/publico/*`, com rewrites das URLs antigas.
- **Arquivos:** storage com driver `local` e `r2`, e o `scripts/migrar-arquivos`.
- **Twygo:** `prisma/jobs/sync-twygo.ts` e o alvo `cron` no Dockerfile.
- **Testes:**
  - `test/paridade` (só local);
  - testes de acesso, um por policy (integration, no `postgres-test`);
  - E2E com Playwright.
- **Pronto quando:**
  - lint, type-check, build, unit, integration e E2E estão verdes;
  - a paridade dá 100%;
  - a revisão de segurança (security-auditor) não traz achado alto.

## Fase B — Homologação na VPS (precisa de domínio, orquestrador e R2)
1. Criar o `docker-compose.homolog.yml` e preencher as variáveis no orquestrador.
2. Fazer um dump novo, importar, migrar os arquivos e rodar a paridade.
3. O RH valida.

## Fase C — Produção (seção 11 da spec)
Janela combinada, hub antigo só leitura, dump final, virada, Supabase só leitura por 30 dias e reescrita do AGENTS.md e do SETUP.md.
