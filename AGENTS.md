> **Atenção (28/10/2026):** este guia descreve o hub ANTIGO (estático + Supabase), que está
> em `legado/`. Na branch `feat/stack-propria` o hub roda em Next.js + Postgres próprio:
> leia `README.md` e `docs/specs/2026-10-27-stack-propria.md`. Este AGENTS.md será
> reescrito na virada.

# Hub Sfera (hub-rh-sfera) — AGENTS.md

## Visão geral
Hub interno de RH da Sfera Multifranquias. Módulos:
- Indicadores: headcount, rotatividade, desligamento, clima, engajamento, satisfação, boletim e fechamento.
- Recrutamento.
- Treinamento e Desenvolvimento: onboarding, visita em loja e turmas.
- Desenvolvimento Organizacional: Conexão RH.
- Administração: upload, cadastros, acessos e log.

Produto, código, comentários e commits ficam em português do Brasil.
O guia de publicação e de setup do banco é o `SETUP.md`.

## Stack
- HTML, CSS e JS estáticos, **sem build, sem framework e sem bundler**. Não há dependências npm: o `package.json` só tem o script `test`.
- Backend em Supabase:
  - Auth.
  - Postgres com RLS.
  - RPCs `security definer`.
  - 1 Edge Function Deno, em `supabase/functions/sync-twygo`.
- Libs carregadas por CDN jsdelivr com versão fixa no `index.html`: supabase-js 2.48.0, chart.js 4.4.4, chartjs-plugin-datalabels 2.2.0 e xlsx 0.18.5. Dentro de `assets/vendor` só existe o pdfjs.
- Hospedagem estática na Vercel. Os dados de Indicadores entram por upload de planilha .xlsx, lida no navegador.

## Como rodar e testar
- **Dev:** `node .claude/static-server.js` sobe a porta 8834. A config "hub-sfera" está em `.claude/launch.json`. O `js/config.js` já aponta para o Supabase real.
- **Testes:** `npm test` roda `test/run-all.cjs`, que executa cada `test/*.test.{js,cjs}` em processo separado.
- Não há lint, formatter nem CI.
- Verificações manuais que ficam fora do `npm test`: `test/conexao-database.sql` e `test/conexao-jornada-browser.{html,js}`.
- O front não usa variáveis de ambiente. O `TWYGO_API_TOKEN` existe só como Secret da Edge Function.

## Estrutura
- **Entrypoints:**
  - `index.html`: o app autenticado. É uma SPA com um `<div class="section" id="sec-NOME">` por tela.
  - `organograma.html`: abre em iframe e lê `window.parent.HUB_ORG` e `HUB_DATA`. Não funciona sozinho.
  - Páginas públicas sem login: `parecer-publico.html`, `entrevista-desligamento-publico.html` e `conexao-nps-publico.html`.
- **`js/` núcleo:** `config`, `supabaseClient`, `utils`, `permissions`, `galho`, `ui-charts`, `app` e `view-as`.
- **`js/` por camada:**
  - `parsers*.js`: leitura de planilha.
  - `dal-*.js`: acesso ao Supabase.
  - `metrics-*.js`: cálculos.
  - `sections/*.js`: uma tela por arquivo.
  - `admin/*.js`: telas de administração.
- **`js/` por módulo:**
  - `pareceres/`: os 6 modelos de parecer.
  - `entrevista-desligamento/`: modelo e render, compartilhados com a página pública.
  - `conexao-*.js`: Conexão RH.
  - `fechamento-*.js`: slides e PPTX.
- **Outras pastas:**
  - `assets/`: CSS e imagens.
  - `test/`: testes.
  - `docs/`: boletim-lideranca e pesquisa-satisfacao.
  - Raiz: cerca de 50 arquivos `supabase-*.sql`, que são as migrations.

## Arquitetura e convenções
**Carga de scripts.** O `index.html` carrega tudo por `<script src="js/x.js?v=CARIMBO">`, em ordem fixa e sem ES modules. A ordem é:

1. `config`, `supabaseClient`, `utils`, `permissions`, `galho`, `ui-charts`
2. `parsers*`
3. `dal-*`
4. `pareceres/*` e `entrevista-desligamento/*`
5. `metrics-*`
6. `fechamento-*`
7. `sections/*`
8. `admin/*`
9. `view-as.js`
10. `conexao-*`
11. `sections/conexao-rh.js`
12. **`app.js` (último)**

Um arquivo só pode usar globals de arquivos carregados antes dele.

- **Módulos:** cada arquivo é um IIFE que publica um global `window.HUB_*`. Exemplos: `HUB_UTILS`, `HUB_PERMISSIONS`, `HUB_UI`, `HUB_SECTIONS` e `HUB_METRICS_*`.
- **Estado global:** `window.sb`, `HUB_USER`, `HUB_DATA`, `HUB_FILTERS` e `HUB_RECRUIT`.
- **Cache-busting manual:** ao editar um .js, troque o `?v=` do `<script>` dele no `index.html`. As páginas públicas têm carimbo próprio.

**Camadas** (os dados fluem num só sentido):
- `parsers-*`: recebe a planilha (SheetJS) e devolve linhas normalizadas. A base compartilhada é o `parsers.js`.
- `dal-*`: lê e grava no Supabase, com paginação keyset e RPCs. O `dal-indicadores.js` define `SELECT_COLUNAS` para não baixar colunas desnecessárias.
- `metrics-*`: só contas, sem DOM e sem Supabase. Por isso dá para testar em Node.
- `sections/*` e `ui-charts.js` (`HUB_UI`: kpi, card, barChart, lineChart, comboChart, rankingTable e insights): renderização. **Use `HUB_UI`, não reimplemente gráfico.**
- `utils.js`: datas, `escapeHtml`, `normalizeText` e paleta. Use `U.escapeHtml` em todo HTML montado com template string.
- `app.js`: login, menu filtrado por permissão, barra de filtros (unidade, departamento, gestor e colaborador), carga de dados e roteamento.
- `view-as.js`: "Visualizar como" do Administrador. Recorta os dados como o `can_see`, bloqueia escritas com proxy em `sb.from` e `sb.rpc` e esconde a Administração.

**Roteamento.** Não há router de URL. O `goToSection(nome)` mostra `#sec-NOME`, chama o switch `sectionRenderer(nome)` e registra o acesso. Os nomes de seção usam prefixo: `ind-`, `rec-`, `tre-`, `adm-`, `do-`, ou o nome solto (`dashboard`, `conexao-rh`).

**Seção nova.** Siga estes passos:
1. Em `js/sections/x.js`, crie `window.HUB_SECTIONS.renderX = (el, f) => ...` dentro de um IIFE.
2. No `index.html`, adicione o `nav-item` com `data-section`, o `<div id="sec-...">` e o `<script>`.
3. No `app.js`, adicione a seção em `NAV_TITLES` e em `NAV_PERMISSIONS`, e crie o `case` em `sectionRenderer`. Se a tela precisa de dados de Recrutamento, inclua em `RECRUIT_SECTIONS`. Se a tela tem filtro próprio, esconda a `#filter-bar`.
4. Crie a chave em `permissions.js` e no SQL (veja "Permissões" abaixo).

**Permissões.**
- **Formato das chaves:** `grupo.item`, como `indicadores.headcount`. A mesma string vira checkbox no Cadastro de Acessos, item de menu e `has_permission(key)` nas policies RLS. Ela precisa ser idêntica nos três lugares.
- **Perfis:** `profiles.perfil` (`admin`, `rh` ou `gestor`) é só um rótulo de preset. A exceção é `admin`, que sempre tem tudo, no JS e no SQL.
- **Recorte por unidade:** o `can_see(unidade, departamento)` restringe os perfis `gestor` e `rh`, usando `profiles.unidades` e `profiles.departamentos`. Lista vazia significa sem restrição. Conta com `status` diferente de `ativo` não vê nada. (Conferido na definição em vigor no Supabase em 27/10/2026.)
- **Presets:** os `PRESETS` são calculados por exclusão. Para cada permissão nova, decida se ela entra em cada preset. Dado sigiloso fica fora de todos.
- **Sincronia JS↔SQL é manual e não tem teste.** Uma chave nova exige:
  - atualizar `permissions.js`;
  - criar uma migration que conceda a chave a quem já tem o perfil equivalente (veja `supabase-permissoes-corrige-completo.sql` e `supabase-recorte-rh-permissoes.sql`);
  - atualizar o INSERT do primeiro admin no `SETUP.md`.
- O `SETUP.md` está **defasado**: faltam as chaves de experiencia, controle_desligamento, pesquisa_clima, engajamento, boletim, satisfacao*, fechamento, turmas*, conexao_rh.* e admin.log_acessos.

**Testes.**
- Os `*.test.js` carregam o código do browser com `vm.createContext` e `vm.runInContext(fs.readFileSync(...))`, usando `ctx.window = ctx` e um SheetJS falso.
- `conexao-*-core.js` e `conexao-store.js` são UMD e os `*.test.cjs` os carregam com `require`.
- Os asserts usam `node:assert/strict` ou um `check()` caseiro.
- Os dados de teste são sempre inventados.
- Não há teste para app.js, sections, dal, permissions, view-as nem para as policies SQL.

**Naming.**
- Arquivos em kebab-case.
- Globals `HUB_*` em maiúsculas.
- Código em camelCase, às vezes em português sem acento (`ehGestor`).
- Banco em snake_case sem acento.
- Comentários em português explicando o porquê, muitas vezes com a decisão do RH.

## Banco (Supabase) e migrations
- Não há pasta de migrations, CLI nem controle de versão do schema. Os `supabase-*.sql` da raiz são aplicados **à mão, no SQL Editor**.
- `supabase-migration.sql` é a base: tabelas, RLS, `has_permission`, `can_see` e as funções dos links públicos. Os outros arquivos são incrementais.
- A ordem não é numerada. Ela está nos cabeçalhos ("Rode DEPOIS de X"). Exemplos de dependências:
  - migration → engajamento → boletim → satisfacao
  - fechamento-vagas → fechamento-periodo
  - treinamentos → treinamento-turmas → -ajustes → -permissoes
  - `seguranca-fase1` é transversal: reescreve policies e grants.
- Idempotência é convenção, não garantia. O padrão é `if not exists`, `create or replace`, `drop policy if exists` + `create policy`. **Leia o cabeçalho antes de rodar.**
- Todo arquivo novo leva cabeçalho dizendo o que faz, depois de quê roda e se pode ser reexecutado.
- Rode a migration **antes** de publicar o código que depende dela.
- Funções `security definer` sempre usam `set search_path = public`. Revogue de `public` e `anon` e conceda só a `authenticated`, salvo as RPCs dos links públicos.
- **Edge Function `sync-twygo`:** o deploy é manual, pelo painel. O agendamento está em `supabase-twygo-sync-setup.sql`, que tem placeholders `<PROJECT_REF>` e `<SERVICE_ROLE_KEY>`. **Nunca commite os valores reais.**

**Links públicos sem login** (parecer do gestor, entrevista de desligamento e NPS da Conexão RH):
- A tabela não tem policy para `anon`. O acesso passa só por RPC `security definer` com token aleatório: `parecer_publico_get/_salvar`, `entrevista_desligamento_publico_get/_salvar` e `conexao_nps_public`.
- No NPS, o token vai no hash `#token=` e a página usa `referrer: no-referrer`.
- O token tem pelo menos 16 caracteres e é de uso único. O link de desligamento vale 30 dias. Token inválido, usado ou vencido faz o `_get` devolver `null`.
- A página pública carrega só `config`, `supabaseClient`, `utils` e seus módulos de modelo e render. Nunca `permissions`, `app` nem `dal-*`.
- Esses RPCs **não devolvem CPF, telefone nem dado pessoal**. Veja `supabase-seguranca-fase1.sql` e `supabase-links-privacidade.sql`.

## Segurança e dados sensíveis
- O `js/config.js` versiona a URL e a anon key reais. Isso é esperado: a anon key é pública e quem protege os dados é a RLS. **Nunca coloque `service_role` no front.** Tabela sem RLS fica aberta.
- **`colaboradores.matricula` é o CELULAR da pessoa (vem da Feedz).**
  - O `dal-indicadores.js` não baixa essa coluna.
  - A única exceção é `sections/conexao-rh.js`, sob a permissão `conexao_rh.documentos`.
  - Não exiba a matrícula em tela, export nem link.
- **Controle de Desligamento** guarda o contato de ex-colaboradores. Fica fora de todos os presets e é liberado pessoa a pessoa.
- **Entrevista de Desligamento** é anônima e não alimenta o filtro "Colaborador".
- **Clima, Satisfação e Engajamento** são sigilosos.
  - A Satisfação só é lida pela função `satisfacao_dados()`, recortada por `profiles.satisfacao_areas`.
  - A loja só aparece com a permissão `satisfacao_completo`.
  - A participação nominal é só do Administrador.
- **Feedbacks e Celebrações:** o texto da mensagem não desce ao navegador.
- **Situação `Desligado`** nunca entra em filtro, organograma nem headcount.
- **Boletim, Fechamento e Log de Acessos** são só do Administrador.
- Há log de uploads e de "Visualizar como".
- O cadastro público só cria login para e-mail que está em `cadastro_autorizado`, válido por 1 dia. Só o Administrador concede `admin` ou `admin.*`.
- **Não commite planilhas reais, exports nem prints com dados de pessoas.**

## Deploy
- Vercel estática com `framework: null`, sem build e `outputDirectory: "."`.
- O `vercel.json` responde 404 para `/test`, `/docs`, `/supabase`, `/.claude` e para todo `.sql`/`.md`. O `.vercelignore` também exclui esses itens. **Ao criar uma pasta ou arquivo interno, inclua nos dois.**
- Não há staging nem CI.
- Ordem de publicação: migration no Supabase, depois o código, e então atualize os `?v=`.
- O Supabase está no plano gratuito, que pausa por inatividade (seção 10 do SETUP).

## Fluxo git
- Branch principal: `main`. As branches de trabalho usam `feat/`, `feature/`, `fix/` ou `chore/` mais um nome em kebab-case.
- Parte das mudanças entra por PR com merge commit e parte vai direto na `main`.
- Commits em português, sem Conventional Commits, no formato "Módulo: o que mudou". Exemplo: "Turmas e Multiplicadoras: papéis, trava do mês fechado...".
- Não dê push, não mexa em CI ou segredos sem pedir e nunca dê force-push na `main`.

## Nunca faça
- Commitar segredo: `service_role`, `TWYGO_API_TOKEN`, token de link ou planilha real.
- Baixar ou exibir `matricula` ou conteúdo sigiloso fora do caminho já controlado.
- Fazer migration destrutiva ou mudar o schema em produção sem aprovação.
- Criar permissão só no JS ou só no SQL.
- Introduzir build, bundler, ES modules ou framework. Isso quebra o modelo IIFE + globals e os testes via `vm`.
- Esquecer o `?v=` ao mudar um script.
