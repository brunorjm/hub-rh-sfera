# Hub Sfera (hub-rh-sfera)

Hub interno de RH da Sfera Multifranquias: Indicadores, Recrutamento, Treinamento e Desenvolvimento, Conexão RH e Administração.

**Branch `feat/stack-propria`:** o hub saiu do Supabase e da Vercel e passa a rodar em servidor e banco da Sfera:
- Next.js 16;
- Prisma com PostgreSQL;
- NextAuth;
- Redis;
- Docker.

As telas do hub antigo foram reaproveitadas. Elas rodam em `/hub`, e todo acesso a dados passa pelo servidor, dentro das mesmas regras de acesso (RLS) que valiam no Supabase.

- Decisões e arquitetura: `docs/specs/2026-10-27-stack-propria.md`.
- Roteiro de implantação completo: `docs/operacao/homologacao.md`.

---

## Implantação na VPS (para quem vai subir)

### O que vai e o que não vai
- **Vai pelo Git** (cerca de 12 MB): o código.
- **É montado na VPS:** as imagens Docker, pelo `Dockerfile`.
- **Vão à parte:**
  - os dados, com um dump do Supabase de cerca de 14 MB, importado pelo script;
  - os PDFs do Fit Cultural, copiados do Storage do Supabase para o R2 pelo script.
- **Nunca vão:** `.env`, `_local/` (cópias de dados), `node_modules`, `legado/`. O `.dockerignore` já os exclui.

### 1. Infraestrutura
| Item | Detalhe |
|---|---|
| Postgres 17 ou superior | Banco **próprio do hub**, separado do Portal do Fera. Usuário dono, mais o papel `hub_app` (SQL no roteiro, seção 1). Não pode ficar exposto à internet |
| Proxy reverso com HTTPS | Aponta para a porta **3060** do container `app`. Precisa **acrescentar** o IP do cliente no `X-Forwarded-For` (o limite de tentativas de login depende disso) |
| Bucket Cloudflare R2 | Privado, com uma chave de API só para ele |

### 2. Stack Docker
- Use o arquivo **`docker-compose.homolog.yml`**. Ele serve para homologação e para produção; o que muda são as variáveis e o banco.
- No Dockhand (ou outro gerenciador de stacks Compose), crie a stack a partir deste repositório e desta branch, com esse arquivo, e preencha as variáveis no ambiente da stack.

| Serviço | Imagem (alvo do `Dockerfile`) | Papel |
|---|---|---|
| `migrate` | `migrator` | Aplica as migrations (`prisma migrate deploy`) e sai. O `app` só sobe depois dele |
| `app` | `runner` | O hub. Node 24, sem root, sistema de arquivos só leitura, 1 GB, healthcheck em `/api/health` |
| `cron` | `cron` | Sincronização diária do Twygo às 02:00 de Brasília |
| `redis` | `redis:7-alpine` | Sessões (revogação) e limite de tentativas. Só na rede interna, com senha |

### 3. Variáveis
Os valores ficam só no ambiente da stack, nunca no repositório.

| Variável | Valor |
|---|---|
| `DATABASE_URL` | `postgresql://<usuario>:<senha>@<host>:5432/<banco>?schema=public` |
| `REDIS_PASSWORD` | Gere com `openssl rand -hex 24` |
| `NEXTAUTH_URL` | Endereço público com https, sem barra no final |
| `NEXTAUTH_SECRET` | Gere com `openssl rand -base64 32`. Precisa ser diferente em cada ambiente |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Do bucket R2 do hub |
| `TWYGO_API_TOKEN` | Token da API do Twygo. Opcional: sem ele, o job não roda |

Fixas no compose: `TRUST_PROXY=true` e `STORAGE_DRIVER=r2`.

### 4. Carga dos dados
Uma vez, com o banco **vazio**, antes de subir a stack. Detalhes no roteiro, seção 2.

```bash
# na VPS, num clone deste repositório (precisa de Docker e Node 24)
npm ci
bash scripts/dump-supabase.sh          # pede só a senha do banco do Supabase; grava _local/supabase.dump
bash scripts/importar-supabase.sh --externo "<DATABASE_URL>"   # recusa se o banco não estiver vazio
DATABASE_URL="<DATABASE_URL>" npx prisma migrate resolve --applied 0_baseline
DATABASE_URL="<DATABASE_URL>" npx prisma migrate deploy
# PDFs do Fit Cultural para o R2 (as variáveis só no ambiente deste comando):
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... STORAGE_DRIVER=r2 S3_ENDPOINT=... S3_BUCKET=... \
  S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... npx tsx scripts/migrar-arquivos-supabase.ts --simular
# confira a contagem; depois rode o mesmo comando sem --simular
rm -rf _local/supabase.dump _local/import   # o dump tem dado pessoal
```

- O import confere linha por linha, tabela por tabela, contra o dump, e para se algo não bater.
- Os usuários entram com a **mesma senha** de hoje.

### 5. Depois de subir
- `GET /api/health` responde `{"status":"ok"}`.
- A primeira abertura depois de subir é mais lenta (partida a frio). Abra o `/hub` uma vez.
- Login com uma conta real; o `/hub` carrega e a barra mostra "registros carregados".
- Os links antigos continuam valendo, com o mesmo caminho: `/parecer-publico.html`, `/entrevista-desligamento-publico.html` e `/conexao-nps-publico.html`.
- **Backup do banco** antes de liberar para o RH, e backup diário depois. O Supabase fazia isso, agora é nosso.

### Segurança (resumo para revisão)
- **O navegador não fala com o banco.**
  - Cada acesso é uma operação de uma lista fechada no servidor (`src/server/hub/`), com permissão declarada e entrada validada (Zod).
  - Cada operação roda como o papel restrito `hub_app`, sob as 164 policies RLS de produção (`prisma/migrations/1_rls_original`).
  - O `hub_app` não lê o hash das senhas.
- **Sessão:**
  - JWT de 8 h, com o perfil relido do banco a cada pedido.
  - A revogação acontece no Redis e no banco (`sessoes_validas_desde`).
  - Há limite de tentativas por e-mail e por IP.
- **Links públicos:**
  - token gerado no servidor;
  - uso único, e a entrevista de desligamento vence em 30 dias;
  - limite por IP e por token;
  - `no-referrer`;
  - nenhum CPF ou telefone na resposta.
- **Headers:** HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy e Permissions-Policy, sem X-Powered-By.
- **Auditoria:** a auditoria de 28/10/2026 e as correções estão no commit `0161c2d`.
- **Em aberto:**
  - CSP: começar em modo Report-Only;
  - prazo do link do parecer: decisão do RH;
  - pausar ou apagar o projeto Supabase depois de 30 dias como plano B;
  - **trocar a senha do banco do Supabase:** a atual ficou exposta durante a migração.

---

## Desenvolvimento local
```bash
cp .env.example .env            # preencha (veja os comentários)
docker compose up -d db redis   # Postgres 5435 e Redis 6380, só em 127.0.0.1
npm ci && npm run dev           # http://localhost:3006
npm test                        # unitários
docker compose --profile test up -d postgres-test && npm run test:integration   # banco de testes, dados inventados
npm run lint && npm run type-check && npm run build
```
