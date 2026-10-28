---
Documento: Roteiro de homologação do Hub Sfera na VPS
Data: 2026-10-28
Spec: docs/specs/2026-10-27-stack-propria.md (Fase B) e docs/specs/2026-10-27-stack-propria-plano.md
---

# Homologação do Hub Sfera na VPS

**Objetivo:** subir o hub novo na VPS com uma cópia fresca dos dados de produção, para o RH conferir tela a tela antes da virada. **O hub antigo, no Supabase/Vercel, continua no ar normalmente durante a homologação.**

## 1. O que a TI prepara (uma vez)
1. **Endereço**, por exemplo `https://hub-homolog.<domínio>`, com HTTPS no proxy da TI apontando para a **porta 3060** da VPS.
   - O proxy precisa **acrescentar** o IP do cliente no `X-Forwarded-For`. O hub usa o último item desse cabeçalho para o limite de tentativas de login.
2. **Postgres 17 ou superior**, num **banco próprio do hub**, separado do do Portal:

   ```sql
   create database hub_rh_homolog;
   create user hub_homolog with password '<senha forte>';   -- dono do banco do hub
   alter database hub_rh_homolog owner to hub_homolog;
   -- O papel restrito das telas (as RLS valem para ele). Se o usuário do hub
   -- não puder criar papéis, o DBA cria e concede:
   create role hub_app nologin;
   grant hub_app to hub_homolog;
   ```

   - As extensões `pgcrypto` e `uuid-ossp` são criadas pelo import. Ambas são "trusted", então o dono do banco consegue criá-las.
   - **Cuidado:** se homologação e produção ficarem no mesmo servidor Postgres, o papel `hub_app` é um só para os dois. Isso funciona, mas a TI precisa saber.
3. **Bucket R2 próprio do hub** para os PDFs do Fit Cultural (ex.: `hub-rh-homolog`), com uma chave de API só para ele.
4. **Variáveis** no orquestrador. Os valores ficam lá, nunca no repositório:

| Variável | O que é |
|---|---|
| `DATABASE_URL` | `postgresql://hub_homolog:<senha>@<host>:5432/hub_rh_homolog?schema=public` |
| `REDIS_PASSWORD` | Senha nova, gerada com `openssl rand -hex 24` |
| `NEXTAUTH_URL` | O endereço HTTPS da homologação, sem barra no final |
| `NEXTAUTH_SECRET` | Gerado com `openssl rand -base64 32`. Precisa ser diferente do de produção |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Bucket R2 do hub |
| `TWYGO_API_TOKEN` | Opcional na homologação. Sem ele, o job do Twygo não roda |

## 2. Carga dos dados (cópia fresca de produção)
Quem faz este passo é a pessoa com acesso ao Supabase e à VPS. **Os dados são pessoais:** nada de e-mail, pendrive ou pasta compartilhada.

1. **Dump novo** do Supabase, na máquina de quem tem a senha: `bash scripts/dump-supabase.sh`. Ele pede só a senha.
2. **Import** no banco de homologação: `bash scripts/importar-supabase.sh --externo "<DATABASE_URL da homologação>"`.
   - O script exige o banco vazio, carrega o dump e converte as contas do Supabase em `public.usuarios`, com a mesma senha de hoje.
   - Ele confere as linhas tabela por tabela contra o dump.
3. **Migrations:**
   - `npx prisma migrate resolve --applied 0_baseline`;
   - depois `npx prisma migrate deploy`, que aplica da 1 à 5;
   - os dois comandos com o `DATABASE_URL` da homologação.
   - Daqui em diante, o serviço `migrate` do compose aplica só as migrations novas.
4. **PDFs do Fit Cultural:** `npx tsx scripts/migrar-arquivos-supabase.ts --simular` primeiro e depois sem `--simular`.
   - Use `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e as variáveis do R2 só no ambiente do comando.
5. **Apagar o dump local** quando a homologação tiver os dados: `_local/supabase.dump` e `_local/import/`.

## 3. Subir
```bash
docker compose -f docker-compose.homolog.yml up -d --build
```

A primeira abertura logo depois de subir o container é mais lenta (partida a frio: 8,5 s contra 4,1 s no ensaio local). Abra o hub uma vez antes de medir ou de chamar o RH.

**Conferir antes de chamar o RH:**
- `GET /api/health` responde `{"status":"ok"}`;
- o login funciona com uma conta real de quem está testando (senha de hoje);
- `/hub` abre e a barra de status mostra "registros carregados";
- os 3 links públicos abrem pelos endereços antigos e mostram "link inválido" com um token inventado;
- os logs dos containers `hubrh-app`, `hubrh-migrate` e `hubrh-cron` estão sem erro.

## 4. Conferência do RH (checklist)
Cada pessoa testa **com a própria conta**. Abra o hub antigo (Supabase) ao lado, com o mesmo filtro, e compare os números:

| Módulo | O que conferir |
|---|---|
| Dashboard | Os números dos cartões batem com o hub antigo |
| Headcount e Organograma | Ativos e desativados; o organograma abre e mostra o galho certo para gestor |
| Rotatividade, Desligamento, Experiência | Totais e gráficos do período |
| Feedbacks, 1:1, Celebrações, Treinamentos | Totais do período |
| Clima, Engajamento, Satisfação (quem tem acesso) | Notas e áreas visíveis iguais |
| Boletim e Fechamento (Administrador) | O mês fechado e os slides; baixar o PPTX |
| Recrutamento | Vagas, candidatos, agenda, aprovações e histórico. **Criar e editar um registro de teste** e depois apagar |
| Turmas e Multiplicadoras | Lançar uma turma de teste, justificar, validar |
| Conexão RH | Jornada e NPS; abrir um PDF do Fit |
| Administração | Upload de uma planilha (pode ser a mesma de hoje); Cadastro de Acessos; Log; "Visualizar como" um gestor |
| Links públicos | Gerar um parecer e uma entrevista de teste, preencher pelo link e conferir que o link não abre de novo |

**O que muda e o RH precisa saber:**
- **Login:** é o mesmo e-mail e a mesma senha. Quem receber senha nova do administrador troca no primeiro acesso.
- **Abertura:** o hub abre mais rápido. Medido em rede local: 4,2 s em vez de 8,1 s para o Administrador.
- **Observações dos candidatos:** só carregam quando o candidato é aberto, editado ou exportado.
- **Redefinir senha:** passou a existir no Cadastro de Acessos (antes só pelo painel do Supabase).

Anote cada diferença com: tela, filtro, número no hub antigo e número no hub novo.

## 5. Se algo der errado
- **Homologação não afeta produção:** o hub antigo segue no ar.
- **Recomeçar do zero:** apague e recrie o banco `hub_rh_homolog`, e refaça a partir do passo 2.
- **Antes da virada:** os dados digitados na homologação, como os testes do RH, não vão para produção. A virada usa um dump novo do Supabase.

## 6. Depois de ir para produção (sem Vercel e sem Supabase)
1. O RH reenvia os links de **entrevista de desligamento** que ainda estão em aberto (13 na cópia de 27/10), pelo botão de copiar link da tela. O link novo já sai com o endereço da VPS e o token é o mesmo.
2. Apagar o projeto `hub-gestaodepessoas-sfera` na Vercel. A `main` já tem o hub novo, e um deploy lá quebraria o site.
3. No Supabase, desligar o agendamento `sync-twygo-diario` (pg_cron), trocar a senha do banco e apagar o projeto.
4. Guardar o dump final **cifrado** no backup da VPS por 30 dias (plano B) e apagar todas as outras cópias.
