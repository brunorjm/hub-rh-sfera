# Hub Sfera — guia de publicação

O app é só HTML/CSS/JS estático (sem servidor, sem build). Os dados e o
login ficam num projeto Supabase novo e dedicado a este hub (não reaproveita
o banco do Hub de Indicadores nem o do Sfera Recruiter atuais — os dois
continuam funcionando normalmente, sem risco, enquanto você configura este
aqui). Siga os passos na ordem.

## 1. Criar o projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) → **New project**.
2. Anote a senha do banco (não é usada pelo app, mas guarde por segurança).
3. Aguarde o projeto terminar de provisionar (~2 min).

## 2. Rodar a migration (cria todas as tabelas, permissões e regras de acesso)

1. No painel do projeto: **SQL Editor → New query**.
2. Abra o arquivo [`supabase-migration.sql`](supabase-migration.sql) deste repositório, cole o conteúdo inteiro e clique **Run**.
3. Isso cria:
   - `profiles` — um registro por usuário do hub, com `perfil` (rótulo), `unidades`/`departamentos` liberados e `permissoes` (mapa de checkboxes granular).
   - As tabelas do módulo **Indicadores** (alimentadas por upload): `colaboradores`, `feedbacks`, `one_on_one`, `celebracoes`, `entrevista_pesquisa`, `entrevista_solicitacao`, `twygo_participantes`, `twygo_usuarios`, `twygo_conteudos`. Unibê e Academia Hering (`unibe_pdv`, `unibe_pessoas`, `academia_hering`, fotos mensais com o mês escolhido no upload) vêm de `supabase-treinamentos.sql`.
   - As tabelas do módulo **Recrutamento** (alimentadas pelas próprias telas do hub, sem upload): `vagas`, `candidatos`, `entrevistas`, `historico`, `solicitacoes`, além das listas mestre `marcas`, `unidades`, `cargos`, `etapas`, `fontes_captacao`, `portais`, `niveis_vaga`, `recrutadores`, `recrutamento_departamentos`.
   - A tabela do módulo **Treinamento e Desenvolvimento**: `onboarding` — um registro é criado automaticamente quando um candidato aprovado (vaga já finalizada) é enviado para onboarding pela tela Candidatos; nunca é criada à mão.
   - `pareceres_gestor` — um registro é criado automaticamente quando o(a) recrutador(a) escolhe, na Etapa Entrevista Gestor da tela Candidatos, qual dos 6 modelos de parecer (Hering/Levi's/O Boticário Loja/O Boticário VD ER, Campo e Logística) o(a) gestor(a) deve preencher; nunca é criada à mão. Tem um link público de preenchimento sem login (`parecer-publico.html`), acessado só por token — a tabela em si não tem nenhuma policy para o papel `anon`, o acesso passa exclusivamente pelas funções `parecer_publico_get`/`parecer_publico_salvar`.
   - `entrevistas_desligamento` — um registro é criado quando um(a) analista de RH (permissão `indicadores.desligamento_gerar_link`) gera um link de Entrevista de Desligamento pela tela Indicadores → Entrevista Desligamento, a partir de um colaborador da planilha de Colaboradores. Mesmo padrão de link público sem login do item acima (`entrevista-desligamento-publico.html` + `entrevista_desligamento_publico_get`/`entrevista_desligamento_publico_salvar`) — nunca entra automaticamente nos indicadores calculados a partir de `entrevista_pesquisa`/`entrevista_solicitacao` (essas continuam só de upload de planilha).
   - Todas as tabelas já saem com Row Level Security configurada, incluindo `has_permission()` (lê o mapa de permissões de cada usuário) e `can_see()` (restringe por unidade/departamento, reaproveitado do Hub de Indicadores).

## 3. Desativar confirmação de e-mail

O Cadastro de Acessos (Administração → Cadastro de Acessos) cria logins
diretamente pelo navegador. Para que a pessoa consiga entrar assim que for
cadastrada, desative a confirmação por e-mail:

1. **Authentication → Providers → Email**.
2. Desmarque **Confirm email**.
3. Salve.

## 4. Criar o primeiro administrador

1. **Authentication → Users → Add user**.
2. Preencha e-mail e senha, marque **Auto Confirm User**, salve.
3. Volte ao **SQL Editor** e rode o comando abaixo, trocando o e-mail pelo
   que você acabou de cadastrar (o bloco de `permissoes` marca literalmente
   todas as chaves do catálogo — mantenha igual à lista de
   [`js/permissions.js`](js/permissions.js) se algum dia adicionar uma nova permissão):

   ```sql
   insert into public.profiles (id, email, nome, perfil, permissoes)
   select id, email, 'Administrador', 'admin', '{
     "indicadores.headcount": true, "indicadores.organograma": true,
     "indicadores.organograma_completo": true, "indicadores.headcount_completo": true,
     "indicadores.recrutamento": true,
     "indicadores.rotatividade": true, "indicadores.desligamento": true,
     "indicadores.desligamento_gerar_link": true,
     "indicadores.feedbacks": true, "indicadores.oneonone": true,
     "indicadores.treinamentos": true, "indicadores.celebracoes": true,
     "recrutamento.dashboard": true, "recrutamento.vagas": true,
     "recrutamento.candidatos": true, "recrutamento.agenda": true,
     "recrutamento.banco_talentos": true, "recrutamento.aprovacoes": true,
     "recrutamento.historico": true, "recrutamento.transferencia": true,
     "recrutamento.parecer_gestor": true,
     "treinamento_dev.onboarding": true, "treinamento_dev.visita_loja": true,
     "admin.upload": true,
     "admin.cadastros_recrutamento": true, "admin.usuarios": true
   }'::jsonb
   from auth.users
   where email = 'seu-email@sferamultifranquias.com';
   ```

Esse é o único passo manual no banco — os próximos usuários são cadastrados
direto pela tela **Administração → Cadastro de Acessos** do app, já logado
como esse administrador (com um formulário de checkboxes por
módulo/funcionalidade, em vez de escrever JSON à mão).

## 5. Pegar a URL e a chave do projeto

**Project Settings → API**:
- **Project URL**
- **anon public** key (⚠️ nunca a `service_role`, essa não deve aparecer em nenhum lugar do site)

Abra [`js/config.js`](js/config.js) e cole os dois valores:

```js
window.HUB_CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJ...'
};
```

## 6. Publicar

Sem build, sem comando — é um site estático. Qualquer hospedagem estática
serve (Netlify, Vercel, GitHub Pages, etc.):

- **Opção rápida (Netlify):** [app.netlify.com/drop](https://app.netlify.com/drop) e arraste a pasta do projeto.
- **Opção com Git (recomendada, permite reenviar mudanças depois):** suba este repositório no GitHub e conecte no provedor escolhido. Build command: (deixe em branco). Publish directory: `.` (raiz).

Depois de publicado, acesse a URL e entre com o e-mail/senha do administrador criado no passo 4.

## 7. Cadastrar acessos e importar os dados de Indicadores

Já logado como administrador:

1. **Administração → Cadastro de Acessos**: crie os logins das pessoas.
   Escolha um preset (Administrador/Gestor/RH) como ponto de partida — ele só
   marca um conjunto padrão de checkboxes, você pode ajustar qualquer um
   individualmente depois. Marque as unidades/departamentos liberados se a
   pessoa não deve ver tudo (deixe em branco = vê tudo, dentro do que as
   permissões já liberam).
2. **Administração → Upload de Planilhas**: importe cada planilha no card
   correspondente (Colaboradores, Feedbacks, 1 on 1, Celebrações, Nova
   Entrevista de Desligamento, Twygo). Cada upload **substitui** os dados
   daquela planilha — pode reenviar quantas vezes quiser, sempre com o mesmo
   modelo de colunas (a ordem das colunas não importa, só os nomes dos
   cabeçalhos). **Não existe upload de "Vagas"** — o indicador de
   Recrutamento é lido automaticamente das telas do próprio módulo
   Recrutamento (Controle de Vagas, Candidatos, Agenda), sem nenhum passo manual.
3. **Administração → Cadastros do Recrutamento**: cadastre as listas mestre
   usadas pelas telas de Recrutamento (marcas, unidades, cargos, etapas,
   fontes de captação, portais, níveis de vaga, recrutadores,
   departamentos) — sem isso os formulários de Nova Vaga/Novo Candidato
   ficam sem opções nos dropdowns.

## 8. Migrar os dados dos dois apps antigos (opcional, passo à parte)

Este projeto Supabase começa vazio — as planilhas de Indicadores você reenvia
pelo passo 7 acima, mas os dados operacionais do Sfera Recruiter atual
(vagas, candidatos, entrevistas, histórico já existentes) não são migrados
automaticamente por este guia. Se quiser trazer esse histórico para o Hub
Sfera, isso precisa de um passo de migração de dados à parte (exportar do
projeto Supabase antigo do Sfera Recruiter e importar neste), e não deve ser
feito sem uma cópia de segurança e sem confirmar com quem administra os dois
sistemas hoje.

## 9. Sincronização automática do Twygo (opcional)

Substitui o upload manual da planilha "27. Twygo" — a partir daqui, os dados
de inscrições/treinamento vêm direto da API do Twygo, todo dia, sem
intervenção manual. Só sincroniza `twygo_participantes` (é a única das três
tabelas do Twygo que o indicador de Treinamentos realmente precisa —
`twygo_usuarios`/`twygo_conteudos` continuam disponíveis por upload manual,
como complemento opcional).

1. **Gerar o token da API do Twygo**: dentro do Twygo, vá em
   **Configurações → Integrações → API** e gere o token. Guarde-o com
   cuidado — ele dá acesso a todos os dados da organização no Twygo. Nunca
   cole esse token no código, num commit, ou aqui no chat.
2. **Publicar a Edge Function**: no painel do Supabase, vá em **Edge
   Functions → Deploy a new function**, nomeie como `sync-twygo`, e cole o
   conteúdo de
   [`supabase/functions/sync-twygo/index.ts`](supabase/functions/sync-twygo/index.ts)
   deste repositório.
3. **Guardar o token da API como segredo da function**: na própria tela da
   function, **Secrets** → adicione `TWYGO_API_TOKEN` com o valor gerado no
   passo 1. (`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` já existem
   automaticamente, não precisa criar.)
4. **Testar uma vez na mão**: ainda na tela da function, use o botão de
   invocar/testar (ou copie a URL dela, algo como
   `https://<seu-projeto>.supabase.co/functions/v1/sync-twygo`, e chame com
   `Authorization: Bearer <sua service_role key>`). A resposta deve ser
   `{"ok":true,"linhas":N}`. Depois, confira **Administração → Upload de
   Planilhas** → a tabela `twygo_participantes` deve refletir os dados
   recém-sincronizados no indicador de Treinamentos.
5. **Agendar a execução diária**: no SQL Editor, rode
   [`supabase-twygo-sync-setup.sql`](supabase-twygo-sync-setup.sql) deste
   repositório, trocando `<PROJECT_REF>` e `<SERVICE_ROLE_KEY>` pelos
   valores do seu projeto (**Project Settings → API**) antes de rodar.

**Sobre a exatidão dos números**: o mapeamento de campos da API do Twygo
para as colunas de `twygo_participantes` foi feito só a partir da
documentação pública da API (sem uma planilha real pra comparar lado a
lado) — os campos "Nota", "Frequência" e "Pontuação" em particular são uma
melhor suposição, não uma certeza. Depois da primeira sincronização,
compare alguns registros com um export manual recente da mesma planilha; se
algum número não bater, me avise qual campo e eu ajusto o mapeamento na
função.

## 10. Evitar que o projeto Supabase "durma" (plano gratuito)

O plano gratuito do Supabase pausa o projeto depois de um tempo sem uso — a
primeira requisição depois disso demora enquanto ele "acorda" (pode parecer
que o app travou). Com uso real por várias pessoas, recomenda-se o upgrade
para o plano Pro (**Project Settings → Billing**) antes de colocar o hub em
produção — projetos pagos não pausam por inatividade.

## Manutenção

- Trocar a senha de alguém, o perfil ou as permissões/unidades/departamentos
  liberados: **Administração → Cadastro de Acessos → Editar**.
- Remover o acesso de alguém ao app (sem apagar o login do Supabase): botão
  **Remover** na mesma tela.
- Atualizar os dados de Indicadores: reenvie a planilha correspondente em
  **Administração → Upload de Planilhas**.
- Os dados de Recrutamento (vagas, candidatos, entrevistas) são editados
  direto nas telas do módulo — não há upload nem substituição em lote para
  eles.

### 2.1. Pesquisa de Clima (opcional)

Rode [`supabase-pesquisa-clima.sql`](supabase-pesquisa-clima.sql) no SQL Editor: cria `pesquisa_clima` e `pesquisa_clima_hc` (sem nome/CPF/e-mail — a pesquisa é anônima), liberadas só para quem tiver a permissão `indicadores.pesquisa_clima` (respeitando unidade/departamento via `can_see`). Não há upload: os dados foram importados uma única vez, e a tela (Indicadores → Pesquisa de Clima) os busca sob demanda, na primeira abertura da sessão. Os arquivos de importação contêm os comentários e ficam fora deste repositório.

### 2.2.1. Boletim da Liderança

Rode [`supabase-boletim.sql`](supabase-boletim.sql) no SQL Editor (depois do `supabase-engajamento.sql`). Ele cria:

- `humor_mensal`, `engajamento_notas` e `satisfacao_suporte` — bases **já agregadas** por mês/dia e loja (sem nome, CPF, e-mail ou comentário: as planilhas são resumidas no navegador antes de gravar);
- `boletim_entradas` — valores informados à mão (Unibê, Academia Hering);
- `boletim_fechamento` — a foto de cada mês fechado (o que foi publicado), usada na comparação do mês seguinte;
- a permissão `indicadores.boletim` para quem já tem o perfil RH (o preset RH já a inclui; o preset Gestor não), e a leitura da participação da Pesquisa de Engajamento e da AvE para quem tem essa permissão.

Rotina mensal (Indicadores → **Boletim da Liderança**):

1. Em **Administração → Upload de Planilhas**, envie as planilhas do mês: Colaboradores (1), Feedbacks (4), 1 on 1 (5), Celebrações (20), AvE 45/90 (28), Pesquisa de Engajamento (33 — o mesmo arquivo grava a participação e as notas), **Humor (36)** e **Pesquisa de Satisfação (16. Base Pesquisa Feedz)**.
2. Abra o Boletim da Liderança, escolha o mês e confira a aba **Qualidade dos dados**.
3. Informe Unibê/Academia Hering em **Valores manuais**.
4. Para cada operação: baixe os gráficos (botão **Baixar imagem**) e copie os textos da aba **Texto do boletim** para o Mailchimp.
5. Clique em **Fechar mês** — congela os números publicados (inclusive o componente "acessos", que só existe na foto do mês).

### 2.2.2. Pesquisa de Satisfação (dados sigilosos)

Rode [`supabase-satisfacao.sql`](supabase-satisfacao.sql) no SQL Editor (depois do `supabase-boletim.sql`). Ele cria a coluna `profiles.satisfacao_areas`, as tabelas `satisfacao_respostas` (uma linha por resposta × área avaliada, com nota, "O que melhorar?" e comentário — sem nome, CPF, e-mail nem líder direto) e `satisfacao_ciclo`, e a função de leitura `satisfacao_dados()`. Ninguém lê a tabela direto: a função devolve só as áreas liberadas no cadastro da pessoa e, sem a visão completa, sem a loja de quem respondeu.

Acesso (Administração → Cadastro de Acessos), fora de todos os presets:

- **Pesquisa de Satisfação** + o campo **Áreas da Pesquisa de Satisfação que pode ver** (ex.: só TI): a pessoa vê o total da própria área — nota, NPS, evolução, "O que melhorar?" e comentários — sem loja/operação.
- **↳ ver todas as áreas** (`indicadores.satisfacao_completo`): RH/Diretoria; inclui a nota por operação e por loja.

Rotina: o upload do card **16. Pesquisa de Satisfação** (arquivo "16. Base Pesquisa Feedz.xlsx") grava o Boletim e o módulo de uma vez (envie com o cadastro de Colaboradores carregado, para a base de gestores aptos). Detalhes em [`docs/pesquisa-satisfacao/README.md`](docs/pesquisa-satisfacao/README.md).

### 2.2. Organograma e Headcount por galho

Rode [`supabase-organograma.sql`](supabase-organograma.sql) no SQL Editor. Ele cria:

- a coluna `profiles.colaborador_external_id`, que liga cada login ao colaborador do Feedz (ID da Feedz). Fica vazia quando o e-mail do login é o mesmo do Feedz, porque aí o vínculo é feito pelo e-mail;
- a função `organograma_meu_galho()`, que devolve só a linha de liderança acima da pessoa logada (nome, cargo e área, sem cotas, afastamentos ou datas) e toda a equipe abaixo dela.

O script também marca as duas permissões de visão completa para quem já tem o perfil RH, para que o RH continue vendo a empresa inteira. **Rode o script antes de publicar esta versão.**

Quem tem a permissão **Organograma — ver a estrutura completa da empresa** (padrão para Administrador e RH) vê a empresa inteira. Quem tem só **Organograma** (padrão para Gestor) vê o próprio galho. O mesmo vale para o Headcount: sem **Headcount — ver todos os colaboradores**, a pessoa vê só a si mesma e a equipe abaixo dela, na tela Headcount e nos números de headcount do Dashboard. Se o e-mail do login for diferente do Feedz, escolha a pessoa no campo **Colaborador no Feedz** em Administração → Cadastro de Acessos.
