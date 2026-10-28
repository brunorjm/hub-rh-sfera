---
Documento: Spec — Hub Sfera em stack própria (sem Supabase e sem Vercel)
Data: 2026-10-27
Status: Em revisão
Branch: feat/stack-propria
---

# Hub Sfera em stack própria

## 1. Objetivo
Tirar o hub do Supabase e da Vercel. O novo hub:
- usa a stack do Portal do Fera;
- roda em banco e servidor da Sfera;
- é **independente do Portal do Fera** (não divide banco, login nem código com ele);
- mantém para o RH **o mesmo comportamento, os mesmos dados e o mesmo visual**.

**Sucesso =**
- todos os números das telas batem com o hub atual sobre a mesma cópia de dados;
- cada pessoa vê exatamente o que vê hoje;
- todos entram com a senha de hoje;
- os links públicos já enviados continuam funcionando;
- o RH aprova na homologação.

## 2. Decisões tomadas
| Tema | Decisão |
| --- | --- |
| Caminho | Reescrever na stack do Portal, como app separado |
| Dados | Migrar tudo do Supabase de produção, inclusive usuários com a senha atual (bcrypt) |
| Login | E-mail e senha (NextAuth Credentials). Sem SSO |
| Servidor | Mesma VPS e orquestrador do Portal, com compose, banco e domínio próprios |
| Arquivos | Cloudflare R2, num bucket próprio do hub. Em dev, driver de disco local |
| Visual | Igual ao de hoje: CSS atual reaproveitado e Chart.js |
| Ambientes | **local → homologação na VPS (com o RH) → produção** |

## 3. Stack
- Next.js 16 (App Router) e React 19.
- TypeScript strict.
- Zod 4.
- Prisma 6 com PostgreSQL. A versão major é a mesma do Supabase, a confirmar no dump.
- NextAuth 4.
- Redis 7.
- Bibliotecas que o hub já usa hoje:
  - Chart.js 4.4.4 e chartjs-plugin-datalabels 2.2.0.
  - SheetJS **0.20.3**, o mesmo do Portal. A 0.18.5 de hoje tem CVE-2023-30533 e CVE-2024-22363.
  - PptxGenJS 3.12.0.
  - pdf.js.
- Testes: Jest (unit, integration) e Playwright.
- Docker multi-stage com os alvos `migrator`, `cron` e `runner`.

Antes de usar qualquer API do Next 16, do Prisma ou do NextAuth, confirme a assinatura na documentação (context7). Não use o que está na memória.

## 4. Estrutura (padrão do Portal, horizontal por camada)
```
src/app/(app)/<modulo>/<tela>/   25 telas de hoje viram rotas (/indicadores/headcount, /recrutamento/vagas…)
src/app/(auth)/                  login, cadastro autorizado, troca de senha
src/app/publico/                 parecer, entrevista de desligamento, NPS (sem login)
src/app/api/                     upload de planilha, arquivos, links públicos, health
src/contracts/                   schemas Zod
src/server/actions/              regra de negócio e acesso a dados (substitui dal-*)
src/lib/                         prisma, auth, rbac/, storage, audit, rate-limit, logger
src/lib/metrics/  src/lib/parsers/   portados de js/metrics-* e js/parsers-*, mesma lógica
src/components/                  layout (menu, barra de filtros), gráficos, telas
src/styles/                      CSS atual do hub (index.html + assets/*.css)
prisma/                          schema.prisma, migrations/, seeds, jobs/ (cron)
scripts/                         importar-supabase, migrar-arquivos, backup
legado/                          app atual (referência e testes de paridade); sai após a virada
```

## 5. Dados e banco
1. **Import:**
   - O dump do Supabase sai pelo `pg_dump` via Docker. **Você roda o dump**, porque a senha do banco não passa por mim.
   - Ele é restaurado no Postgres local.
   - O `scripts/importar-supabase` faz o resto:
     - **Usuários:** `auth.users` vira `public.usuarios`, com o mesmo `id`, `email`, `senha_hash` (o `encrypted_password` bcrypt), `criado_em` e `ultimo_login`.
     - **`auth.uid()`:** passa a ser uma função de compatibilidade no schema `auth`, que lê `current_setting('app.usuario_id')`. Assim as 89 funções SQL rodam **sem reescrita**.
     - **O que é só do Supabase sai:** policies RLS, grants para `anon`/`authenticated`, `pg_cron`, `pg_net` e os schemas `storage`, `realtime` e `extensions`.
2. **Prisma:** `prisma db pull` gera o `schema.prisma` a partir das 61 tabelas como estão (mesmos nomes, via `@@map`). Esse esquema vira a migration `0_baseline`, marcada como aplicada. Daqui em diante só entra migration versionada, e os `supabase-*.sql` vão para o `legado/`.
3. **Funções SQL complexas continuam no banco:**
   - `satisfacao_dados`;
   - `organograma_meu_galho`;
   - `boletim_resumo_publicado`;
   - fechamento, turmas e controle de desligamento;
   - links públicos.

   O servidor chama essas funções dentro de uma transação, depois de `set_config('app.usuario_id', <id>, true)`. As consultas simples vão pelo Prisma.
4. **Ambiente local:**
   - `docker-compose.yml` com `db` em 127.0.0.1:5435, `redis` em :6380 e `app` em :3006.
   - Subnet `172.29.231.0/24`, para não colidir com o Portal (5434/5433/6379/3005, `172.29.230.0/24`).
5. **LGPD na cópia local:** o dump e os arquivos ficam em `_local/` (no `.gitignore`), nunca no repo. Apagar quando a migração terminar.

## 6. Login e sessão
- NextAuth Credentials compara a senha com `usuarios.senha_hash` usando bcrypt.
- Sessão JWT de 8h, com o id da sessão no Redis. **Inativar ou mudar a permissão de alguém revoga as sessões dessa pessoa na hora.**
- Rate limit por IP + e-mail no login e no cadastro (rate-limiter-flexible). Atrás de proxy, vale a regra `TRUST_PROXY` do Portal.
- **Cadastro pelo admin** (Cadastro de Acessos): uma server action cria o usuário com senha inicial e `trocar_senha = true`. A troca é obrigatória no primeiro acesso.
- **Cadastro público:** só para e-mail em `cadastro_autorizado`, válido por 1 dia, como hoje.
- "Esqueci a senha" fica fora do escopo: quem redefine é o admin.

## 7. Permissões e recorte
- **Fonte única:** `src/lib/rbac/catalogo.ts`, com as mesmas chaves de `js/permissions.js`. Ela gera:
  - o menu;
  - os checkboxes do Cadastro de Acessos;
  - os presets.
- **Checagem no servidor:** toda server action e toda rota chama `exigirPermissao(chave)`. Um teste varre `src/server/actions` e `src/app/api` e falha se alguma não chamar. As rotas `publico` e `health` ficam numa lista explícita de exceções.
- **Banco:** `profiles.permissoes`, `perfil`, `unidades`, `departamentos` e `satisfacao_areas` ficam como estão.
- **Recorte (`can_see`):** a função central `filtroRecorte(usuario)` monta o `where` de unidade/departamento. Só o perfil `gestor` é restringido, e lista vazia significa sem restrição.
- **Regras mantidas:**
  - `admin` tem tudo;
  - só o admin concede `admin` ou `admin.*`;
  - sigilo fora dos presets.
- **Colunas sensíveis nunca saem do servidor:**
  - `colaboradores.matricula` (celular). Única exceção: Conexão RH, com `conexao_rh.documentos`.
  - Textos de feedbacks e celebrações.
  - Participação nominal da satisfação (só o admin).
  - Pessoas `Desligado` em filtros, organograma e headcount.
- **Visualizar como:**
  - O admin escolhe a pessoa e a sessão guarda `verComo`.
  - Toda leitura usa as permissões e o recorte dessa pessoa.
  - **Toda escrita é recusada no servidor.**
  - A Administração fica oculta e aparece uma faixa visível.
  - Tudo é registrado no `viewas_log`.
- **Log de acessos:** cada rota aberta grava no `acesso_log`.

## 8. Telas, gráficos e upload
> **Revisado em 28/10/2026 (decisão do responsável):** as telas antigas são
> **reaproveitadas**, e não reescritas em React. São 1,4 MB de código de tela
> (25 telas, 174 trechos de `innerHTML`); reescrever arriscaria o visual e o
> comportamento que o RH já usa. Telas novas e reescritas futuras nascem em React.

- **As telas antigas rodam como estão** numa página `/hub` do app novo:
  - mesmo HTML, CSS, menu, barra de filtros e navegação de hoje;
  - os scripts ficam em `public/legado-ui/`, na mesma ordem de carga, com as bibliotecas do CDN copiadas para `public/vendor/` (versão fixa; SheetJS 0.20.3).
- **O que muda nos scripts antigos é só o acesso a dados:**
  - não existe mais `window.sb`;
  - os `dal-*.js` e os acessos diretos espalhados (lista em `src/lib/calculos/ACESSO-A-DADOS.md`) passam a chamar `HUB_API.chamar(operacao, dados)`, que faz `POST /api/hub/<operacao>`.
- **Operações no servidor (`src/server/hub/`):** uma lista fechada, uma por função de acesso a dados. Cada operação:
  - declara a permissão exigida (um teste falha se alguma não declarar);
  - valida a entrada com Zod;
  - escolhe as colunas explicitamente (`matricula` e textos sigilosos não saem);
  - roda **dentro das RLS originais do Supabase**.
- **RLS como rede de segurança (muda a seção 5, item 1):**
  - as 164 policies de produção são recriadas para o papel restrito `hub_app` (migration `1_rls_original`);
  - o servidor executa cada operação numa transação com `set local role hub_app` e `app.usuario_id`;
  - assim, mesmo que uma operação esqueça uma checagem, o banco barra como o Supabase barrava.
- **Visualizar como:** roda no servidor.
  - A transação usa o `app.usuario_id` da pessoa escolhida, então o recorte é exatamente o dela.
  - A transação é `read only`, e o servidor recusa operações de escrita.
  - O `view-as.js` antigo deixa de filtrar no navegador.
- **Cálculos:** os scripts antigos continuam fazendo as contas no navegador, como hoje. O porte em `src/lib/calculos` serve para a paridade e para as telas que forem reescritas em React.
- **Upload de planilha:**
  - O navegador lê o .xlsx com o mesmo parser de hoje.
  - Uma rota recebe as linhas, valida com Zod e **substitui a tabela numa transação única**. Hoje é `admin_truncate` e depois insert em lotes: se cair no meio, a tabela fica vazia.
  - Cada upload grava no `upload_log`.
- **Organograma:** deixa de ser `organograma.html` num iframe e vira rota própria, com a mesma renderização.
- **Fechamento:** os slides e o PPTX usam PptxGenJS via `import()` sob demanda e as mesmas imagens de `assets/fechamento`.
- **Segurança das telas:**
  - Telas antigas: o mesmo `U.escapeHtml` de hoje em todo HTML montado por string. O risco de XSS fica igual ao atual; a melhora está em os dados não saírem mais direto do banco para o navegador.
  - Telas novas em React: nada de HTML por string; `dangerouslySetInnerHTML` só com `sanitize-html`.

## 9. Links públicos, arquivos e jobs
- **Links públicos** (parecer do gestor, entrevista de desligamento e NPS):
  - **URLs antigas continuam funcionando.** `/parecer-publico.html?token=`, `/entrevista-desligamento-publico.html…` e `/conexao-nps-publico.html#token=` são reescritas para as páginas novas, porque há links pendentes já enviados.
  - O domínio novo assume o domínio atual, ou o domínio da Vercel redireciona até os links vencerem.
  - A página pública não usa sessão. Ela chama `/api/publico/*`, que executa as mesmas funções `*_publico_get/_salvar` do banco.
  - Tem rate limit por IP e `Referrer-Policy: no-referrer`.
  - **Nunca devolve CPF, telefone nem dado pessoal.**
- **Arquivos (PDFs da Conexão RH):**
  - Interface `storage` com dois drivers: `r2` (homologação e produção) e `local` (dev).
  - O arquivo só sai por `/api/arquivos/[id]`, com a permissão conferida.
  - O `scripts/migrar-arquivos` copia o bucket `conexao-fit` do Supabase para o R2.
- **Twygo:**
  - `prisma/jobs/sync-twygo.ts` é o porte da Edge Function. Roda no container `cron` todo dia às 02:00 (BRT).
  - Substitui o `twygo_participantes` numa transação.
  - Usa a variável `TWYGO_API_TOKEN`.
- **Variáveis de ambiente:** `.env.example` só com nomes e instruções, validado por Zod em `src/config/env.ts`.
  - Login e sessão: `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `REDIS_URL`, `TRUST_PROXY`.
  - Arquivos: `STORAGE_DRIVER`, `S3_*`.
  - Integração: `TWYGO_API_TOKEN`.

## 10. Testes e aceite
1. **Unitários:** os 418 asserts portados e testes novos de `lib/rbac`, `filtroRecorte` e `contracts`.
2. **Paridade** (`test/paridade`):
   - Um script roda o `legado/js/metrics-*` (via `vm`, como hoje) e o `src/lib/metrics` sobre a **cópia local dos dados**, para cada tela × perfis de exemplo (admin, rh, gestor com recorte).
   - O resultado tem de ser idêntico.
   - Só roda localmente. Os dados não vão para o CI nem para o repo.
3. **Acesso (integração, banco de teste com dados inventados):**
   - Um teste por regra das 92 policies RLS de hoje, mais os casos da seção 7: gestor fora do recorte, satisfação sem `satisfacao_completo`, `matricula` ausente, escrita bloqueada no "Visualizar como" e link público sem dado pessoal.
4. **E2E (Playwright):**
   - Login com a senha migrada.
   - Cada tela abre para admin, rh e gestor.
   - Upload de planilha.
   - Os 3 links públicos.
   - Troca obrigatória de senha.
5. **Aceite:**
   - Paridade 100%.
   - Testes verdes.
   - `npm run lint`, `type-check` e `build` limpos.
   - O RH valida na homologação.

## 11. Virada (produção)
1. Homologação na VPS com uma cópia nova dos dados, validada pelo RH.
2. Janela combinada com o RH. O hub antigo entra em modo só leitura (aviso na tela) e é feito o dump final.
3. O dump final é importado em produção. Depois, migração dos arquivos e paridade de novo.
4. O domínio ou link passa a apontar para o hub novo, e os redirects dos links públicos entram no ar.
5. O Supabase fica **só leitura por 30 dias** como plano B. Desligar e apagar só com sua aprovação.
6. Por último:
   - o `AGENTS.md` e o `SETUP.md` são reescritos para a stack nova;
   - o `legado/`, o `vercel.json` e o `js/config.js` são removidos.

## 12. Fora do escopo
- Mudança de visual.
- Funcionalidade nova.
- Integração ou login compartilhado com o Portal do Fera.
- SSO Microsoft.
- "Esqueci a senha" por e-mail.
- CI.

## 13. Riscos
| Risco | Mitigação |
| --- | --- |
| Regra de acesso traduzida errado e dado sigiloso vazando | Um teste por policy, colunas sensíveis só no servidor e revisão de segurança antes da homologação |
| Número diferente numa tela | Teste de paridade sobre os dados reais em todas as telas |
| Função SQL que depende de algo do Supabase além de `auth.uid()` | O import roda todas as funções numa checagem de fumaça e lista o que falhar |
| Link público já enviado quebrar | Rewrites das URLs antigas, testados no E2E |
| Versão do Postgres do dump maior que a do container | Usar a mesma major do Supabase |
| Cópia local com dado pessoal | `_local/` fora do git, apagar no fim e nunca usar em CI |

## 14. Pendências antes da homologação (não bloqueiam o trabalho local)
- Domínio do hub novo e acesso ao orquestrador da VPS.
- Bucket R2 e chave do hub.
- `TWYGO_API_TOKEN` disponível no ambiente.
