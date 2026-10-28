# Acesso a dados retirado dos cálculos (fase A5)

Os módulos de `src/lib/calculos/` não buscam dados. No legado, eles liam objetos globais
montados por outros arquivos (`window.HUB_DATA`, `HUB_RECRUIT_DATA`, `HUB_BOLETIM_DATA`,
`HUB_EXPERIENCIA_DATA`, `HUB_USER`) e, em dois casos, chamavam `sb.rpc` direto
(`galho.js` e `conexao-store.js`). No porte, esses globais viram parâmetros das funções:
`dados` (HUB_DATA), `recrutamento` (HUB_RECRUIT_DATA), `boletimDados` (HUB_BOLETIM_DATA),
`experiencia` (HUB_EXPERIENCIA_DATA) e `usuario` (HUB_USER).

Este documento diz de onde cada dado vem hoje. Ele é a especificação das server actions da
próxima fase. Os nomes de função são os do legado (mantidos no porte).

Convenções usadas abaixo:
- **keyset 1000** = `.gt('id', lastId).order('id', { ascending: true }).limit(1000)`, repetido até vir página menor que 1000.
- **range 1000** = `.order(<col>, { ascending: true }).range(de, de + 999)`, repetido até vir página menor que 1000.
- Toda consulta usa timeout de 30 s no cliente (`withTimeout`, `QUERY_TIMEOUT_MS = 30000`).
- O recorte por linha é feito hoje pela RLS do Supabase. A server action precisa aplicar o mesmo recorte (ver "Regras de segurança").

## 1. Tabela principal

| Global.chave | Carregado por (arquivo → função) | Tabela/RPC | Colunas | Filtros | Ordem | Paginação | Transformação no cliente | Consumido por (cálculo) |
|---|---|---|---|---|---|---|---|---|
| `HUB_DATA.colaboradores` | `dal-indicadores.js` → `loadAll` → `fetchAll('colaboradores')` [1] | tabela `colaboradores` | `SELECT_COLUNAS.colaboradores` [2] (sem `matricula`) | nenhum (só RLS) | `id` asc | keyset 1000 | nenhuma | `galho.js` → cache de `get`/`cached` [11]; `metrics-indicadores.js` → `colaboradoresMetrics`, `rotatividadeMetrics`, `indicesDepartamentosHeadcount`, `entrevistaMetrics` (nomes para `extractMentions`), `unidadeDoLiderado` e `oneOnOneMetrics`; `metrics-boletim.js` → `contexto` (usa também `updated_at`), `calcularMes`, `boletim` (chave do memo); `metrics-engajamento.js` → `engajamentoMetrics`; `metrics-experiencia.js` → `mapaSituacaoColaboradores`; `parsers-satisfacao.js` → `parse(wb, { colaboradores })` (já era parâmetro; `admin/upload.js` passa `HUB_DATA.colaboradores \|\| []`) |
| `HUB_DATA.feedbacks` | `dal-indicadores.js` → `loadAll` [1] | tabela `feedbacks` | `id,de,para,unidade,departamento,cargo,anonimo,avaliacao,data` | nenhum | `id` asc | keyset 1000 | nenhuma | `metrics-indicadores.js` → `feedbacksMetrics`; `metrics-boletim.js` → `calcularMes`, `boletim` (memo) |
| `HUB_DATA.one_on_one` | `dal-indicadores.js` → `loadAll` [1] | tabela `one_on_one` | `*` | nenhum | `id` asc | keyset 1000 | nenhuma | `metrics-indicadores.js` → `oneOnOneMetrics`; `metrics-boletim.js` → `calcularMes`, `boletim` (memo) |
| `HUB_DATA.celebracoes` | `dal-indicadores.js` → `loadAll` [1] | tabela `celebracoes` | `id,codigo,colaborador_enviou,unidade,departamento,papel,cargo_enviou,colaboradores_receberam,cargo_recebeu,curtidas,comentarios,data` (sem `mensagem`) | nenhum | `id` asc | keyset 1000 | nenhuma | `metrics-indicadores.js` → `celebracoesMetrics`; `metrics-boletim.js` → `calcularMes`, `boletim` (memo) |
| `HUB_DATA.entrevista_pesquisa` | `dal-indicadores.js` → `loadAll` [1] | view `entrevista_pesquisa_anon` (via `ORIGEM`) [3] | `*` da view | nenhum no cliente (a view já tira `repetida`) | `id` asc | keyset 1000 | nenhuma | `metrics-indicadores.js` → `entrevistaMetrics` |
| `HUB_DATA.entrevista_solicitacao` | `dal-indicadores.js` → `loadAll` [1] | tabela `entrevista_solicitacao` | `id,planilha_id,unidade,departamento,data_solicitacao,data_admissao,data_demissao,tempo_trabalho,tipo,tipo_desligamento,motivo_desligamento,status_feedz,status_entrevista` | nenhum | `id` asc | keyset 1000 | nenhuma | `metrics-indicadores.js` → `solicitacoesBase` (só quando `controle_desligamento_ind` não é array) → `entrevistaMetrics` |
| `HUB_DATA.twygo_participantes` | `dal-indicadores.js` → `loadAll` [1] | tabela `twygo_participantes` | `*` | nenhum | `id` asc | keyset 1000 | nenhuma | `metrics-indicadores.js` → `treinamentosMetrics`; `metrics-boletim.js` → `calcularMes`, `boletim` (memo); `metrics-treinamentos.js` → `twygoHistorico`, `twygoPendencias`, `twygoPorOperacao` (e indiretamente pela chamada a `treinamentosMetrics`) |
| `HUB_DATA.twygo_usuarios` | `dal-indicadores.js` → `loadAll` [1] | tabela `twygo_usuarios` | `*` | nenhum | `id` asc | keyset 1000 | nenhuma | `metrics-indicadores.js` → `treinamentosMetrics` |
| `HUB_DATA.unibe_pdv` | `dal-indicadores.js` → `loadAll` [1] | tabela `unibe_pdv` | `*` | nenhum | `id` asc | keyset 1000 | nenhuma | `metrics-treinamentos.js` → `unibeMetrics`; `metrics-boletim.js` → `calcularMes`, `boletim` (memo) |
| `HUB_DATA.unibe_pessoas` | `dal-indicadores.js` → `loadAll` [1] | tabela `unibe_pessoas` | `*` | nenhum | `id` asc | keyset 1000 | nenhuma | `metrics-treinamentos.js` → `unibeMetrics` |
| `HUB_DATA.academia_hering` | `dal-indicadores.js` → `loadAll` [1] | tabela `academia_hering` | `*` | nenhum | `id` asc | keyset 1000 | nenhuma | `metrics-treinamentos.js` → `academiaMetrics`; `metrics-boletim.js` → `calcularMes`, `boletim` (memo) |
| `HUB_DATA.engajamento_pulso` | `dal-engajamento.js` → `carregar` → `fetchAll('engajamento_pulso')` [4] | tabela `engajamento_pulso` | `*` | nenhum | `id` asc | keyset 1000 | nenhuma (os cálculos reordenam por `inicio`) | `metrics-engajamento.js` → `pulsosOrdenados` (→ `engajamentoMetrics`); `metrics-boletim.js` → `calcularMes` |
| `HUB_DATA.engajamento_participacao` | `dal-engajamento.js` → `carregar` [4] | tabela `engajamento_participacao` | `*` | nenhum | `id` asc | keyset 1000 | nenhuma | `metrics-engajamento.js` → `engajamentoMetrics`; `metrics-boletim.js` → `calcularMes`, `boletim` (memo) |
| `HUB_DATA.pesquisa_clima` | `dal-pesquisa-clima.js` → `carregar` → `fetchAll('pesquisa_clima')` [5] | tabela `pesquisa_clima` | `*` | nenhum | `id` asc | keyset 1000 | nenhuma | `metrics-pesquisa-clima.js` → `rows` (→ `filterRows` → `pesquisaClimaMetrics`) |
| `HUB_DATA.pesquisa_clima_hc` | `dal-pesquisa-clima.js` → `carregar` [5] | tabela `pesquisa_clima_hc` | `*` | nenhum | `id` asc | keyset 1000 | nenhuma | `metrics-pesquisa-clima.js` → `headcountBase` |
| `HUB_RECRUIT_DATA.vagas` | `dal-recrutamento.js` → `reload` → `atualizarTabela('vagas')` [6] | tabela `vagas` | `*` | delta: `.gt('hub_alterado_em', desde)` [7] | `id` asc | range 1000 | `toCamelRow` (snake_case → camelCase); cópia `.slice()` do `CACHE` | `metrics-recrutamento.js` → `vagasFiltradas` (→ `recrutamentoMetrics`) |
| `HUB_RECRUIT_DATA.candidatos` | `dal-recrutamento.js` → `reload` → `atualizarTabela('candidatos')` [6] | tabela `candidatos` | `*` | delta como em `vagas` [7] | `id` asc | range 1000 | `toCamelRow`; `.slice()` | `metrics-recrutamento.js` → `recrutamentoMetrics` (filtra por `vagaId`) |
| `HUB_RECRUIT_DATA.entrevistas` | `dal-recrutamento.js` → `reload` → `atualizarTabela('entrevistas')` [6] | tabela `entrevistas` | `*` | nenhum (sem delta; rebaixa inteira quando `hub_versoes` muda) | `id` asc | range 1000 | `toCamelRow`; `.slice()` | `metrics-recrutamento.js` → `recrutamentoMetrics` (filtra por `vagaId`) |
| `HUB_RECRUIT_DATA.entrevistas_desligamento` | `dal-recrutamento.js` → `reload` → `atualizarTabela('entrevistas_desligamento')` [6] | tabela `entrevistas_desligamento` | `*` | nenhum | `id` asc | range 1000 | `toCamelRow`; `.slice()` | `metrics-indicadores.js` → `linksParaIndicadores` (só quando `entrevistas_desligamento_ind` não é array) → `entrevistaMetrics` |
| `HUB_RECRUIT_DATA.controle_desligamento_ind` | `dal-recrutamento.js` → `reload` (laço dos resumos) [8] | RPC `controle_desligamento_indicadores()` | retorno: `id_desligamento, unidade, departamento, data_solicitacao, data_demissao, tipo, tipo_desligamento, motivo, status_feedz, status_entrevista` | nenhum | nenhuma no cliente | `.range(from, from + 999)` sobre a RPC, até página < 1000 | `toCamelRow`; `null` quando a RPC falha ou não existe (sinal para usar a fonte antiga), `[]` = sem linhas no recorte | `metrics-indicadores.js` → `solicitacoesBase` (→ `entrevistaMetrics`) [9] |
| `HUB_RECRUIT_DATA.entrevistas_desligamento_ind` | `dal-recrutamento.js` → `reload` (laço dos resumos) [8] | RPC `entrevistas_desligamento_indicadores()` | retorno: `id, status, unidade, departamento, data_desligamento, data_finalizacao, criado_em, respostas, tem_desligamento` | nenhum | nenhuma no cliente | como acima | `toCamelRow` (`tem_desligamento` → `temDesligamento`); `null` = indisponível | `metrics-indicadores.js` → `linksParaIndicadores` → `juntarSolicitacoes`, `converterRespostaLink`, `entrevistaMetrics`; também exportado como `HUB_METRICS_LINKS` |
| `HUB_BOLETIM_DATA.humor_mensal` | `dal-boletim.js` → `carregar` → `fetchAll('humor_mensal')` [10] | tabela `humor_mensal` | `*` | nenhum | `id` asc | keyset 1000 | nenhuma | `metrics-boletim.js` → `calcularMes` |
| `HUB_BOLETIM_DATA.engajamento_notas` | `dal-boletim.js` → `carregar` [10] | tabela `engajamento_notas` | `*` | nenhum | `id` asc | keyset 1000 | nenhuma | `metrics-boletim.js` → `calcularMes` (notas e aviso de pulso sem notas) |
| `HUB_BOLETIM_DATA.satisfacao_suporte` | `dal-boletim.js` → `carregar` [10] | tabela `satisfacao_suporte` | `*` | nenhum | `id` asc | keyset 1000 | nenhuma | `metrics-boletim.js` → `calcularMes` (NPS e aviso de mês sem respostas) |
| `HUB_BOLETIM_DATA.entradas` | `dal-boletim.js` → `carregar` [10] | tabela `boletim_entradas` (chave renomeada por `CHAVE`) | `*` | nenhum | `id` asc | keyset 1000 | renomeia a chave para `entradas` | `metrics-boletim.js` → `calcularMes` (valores manuais) |
| `HUB_BOLETIM_DATA.fechamentos` | `dal-boletim.js` → `carregar` [10] | tabela `boletim_fechamento` (chave renomeada) | `*` (usa `mes`, `operacao`, `dados`) | nenhum | `id` asc | keyset 1000 | renomeia a chave para `fechamentos` | `metrics-boletim.js` → `fechamentoDe` (→ `boletim`) |
| `HUB_BOLETIM_DATA.versao` | `dal-boletim.js` → `carregar` | — (contador local) | — | — | — | — | `d.versao++` a cada carga completa | `metrics-boletim.js` → `boletim` (chave do memo) |
| `HUB_EXPERIENCIA_DATA[45]` | `dal-experiencia.js` → `carregar(45)` → `buscarCiclo` [12] | tabela `avaliacao_experiencia_45` | `COLUNAS_LEVES` [13] | nenhum | `id` asc | range 1000 | nenhuma; `null` = ainda não carregado | `metrics-boletim.js` → `calcularMes` (bloco 6), `boletim` (memo). `metrics-experiencia.js` recebe as linhas por parâmetro (`preparar(rows, ciclo)`) e não lê o global |
| `HUB_EXPERIENCIA_DATA[90]` | `dal-experiencia.js` → `carregar(90)` [12] | tabela `avaliacao_experiencia_90` | `COLUNAS_LEVES` [13] | nenhum | `id` asc | range 1000 | idem | idem |
| `HUB_USER` (`id`, `perfil`, `unidades`, `departamentos`, `permissoes`, `satisfacao_areas`) | `app.js` → `loadProfileOrFail` → `enterApp` [14] | tabela `profiles` | `*` | `.eq('id', authUser.id)`, `.maybeSingle()` | — | — | monta `{ id, email, nome, perfil, unidades: \|\| [], departamentos: \|\| [], permissoes: \|\| {}, satisfacao_areas: \|\| [] }`; recusa `status` `inativo`/`desligado`. No "Visualizar como" vira o perfil simulado (`view-as.js`) | `conexao-store.js` → `accept`, `ready`, `load`, `mutate` (`id`); `metrics-engajamento.js` → `escopoTotal` (`perfil`, `unidades`, `departamentos`); `metrics-pesquisa-clima.js` → `dentroDoEscopo` (`perfil`, `unidades`, `departamentos`); `metrics-satisfacao.js` → `acessoDe(user)` (`perfil`, `permissoes`, `satisfacao_areas`; já era parâmetro no legado) |

### Notas

1. `HUB_DAL.loadAll` roda no login e no botão "Atualizar dados" (`app.js` → `reloadData`). Percorre `TABLES` em sequência. Tabela que falha fica com o valor anterior (ou `[]`) e o erro é juntado numa mensagem só. `HUB_DAL.replaceTable` (upload) troca `HUB_DATA[tabela]` pelas linhas do arquivo, sem rebuscar. `recarregarTurmas` rebusca só `treinamento_turmas`.
2. `SELECT_COLUNAS.colaboradores` = `id,external_id,nome,nome_completo,email,cpf,cargo,cargo_visivel,unidade,departamento,grupos,papel,gestor_direto,gestor_email,etnia,sexo,genero,data_nascimento,data_admissao,data_cadastro,situacao,ultimo_acesso,origem_cadastro,participa_gamificacao,desligamento_tipo,desligamento_motivo,ultimo_dia_trabalhado,idioma,updated_at`. `updated_at` é usado por `metrics-boletim.js → contexto` para a data da "foto" de último acesso.
3. View `entrevista_pesquisa_anon` (`supabase-entrevista-privacidade.sql`, versão atual em `supabase-entrevista-repetidas.sql`): `id, planilha_id, data_inicio, data_conclusao, unidade, departamento, motivo_desligamento, submotivo_desligamento, data_desligamento, trabalharia_novamente, nps, respostas_sem_dado_pessoal(respostas) as respostas`, `where not repetida`, `security_invoker = true`.
4. `dal-engajamento.js` não entra no `loadAll`. Busca na primeira abertura de Indicadores → Pesquisa de Engajamento, no Dashboard e pelo `HUB_BOLETIM.carregar`. Fica em cache até `invalidar()` ("Atualizar dados" e uploads). As duas tabelas vêm em paralelo (`Promise.all`).
5. `dal-pesquisa-clima.js`: mesma lógica de cache, mas sem `invalidar` exposto. "Atualizar dados" não zera esse cache (`app.js` não o invalida). Só recarregar a página zera.
6. `HUB_RECRUIT.reload` roda ao entrar em qualquer tela de `RECRUIT_SECTIONS` (`app.js`), no botão "Atualizar dados" e depois de gravações em algumas telas operacionais. Percorre `RECRUIT_TABLES` = `vagas, candidatos, entrevistas, onboarding, visitas_loja, pareceres_gestor, entrevistas_desligamento, controle_desligamento`. `controle_desligamento` é opcional: se a tabela não existe, fica `[]`. As telas recebem `CACHE[t].rows.slice()`. O "Visualizar como" recorta essa cópia, nunca o `CACHE`.
7. Delta por versão (`supabase-trafego-recrutamento.sql`). Antes de baixar, lê `hub_versoes` (`tabela, versao, alterado_em`). Se a versão da tabela não mudou, não baixa. Em `vagas` e `candidatos` com versão nova, baixa as linhas com `hub_alterado_em > alterado_em_anterior − 60 s` e a lista de `id`. Remove as apagadas e, se faltar alguma linha, rebaixa a tabela inteira. A cada 30 min (`RECARGA_COMPLETA_MS`), ou sem `hub_versoes`, ou com `invalidar()`, baixa tudo.
8. Resumos sem dado pessoal (`supabase-links-privacidade.sql`; o terceiro resumo, `controle_desligamento_respostas_forms_resumo` → `HUB_RECRUIT_DATA.controle_respostas_forms`, não é lido pelos cálculos). Só são rebuscados quando muda a versão de `controle_desligamento`, `entrevistas_desligamento` ou `entrevista_pesquisa` em `hub_versoes`, ou quando a recarga é completa. Se a função não existe, o destino vira `null` sem erro. Outro erro também vira `null`, mas entra na mensagem de erro.
9. `controle_desligamento_indicadores()` não devolve mais o nome do desligado (`supabase-links-privacidade.sql`). Por isso, em `solicitacoesBase`, `nome: d.colaboradorNome` resulta `undefined`. A server action deve manter isso: não mandar o nome.
10. `dal-boletim.js` não entra no `loadAll`. Busca em paralelo as 5 tabelas de `TABELAS` = `humor_mensal, engajamento_notas, satisfacao_suporte, boletim_entradas, boletim_fechamento` e garante `HUB_EXPERIENCIA.carregar(45)`, `carregar(90)` e `HUB_ENGAJAMENTO.carregar()`. Falha nessas fontes extras vira aviso em `avisosCarga`, não erro. `invalidar()` em "Atualizar dados", uploads e gravações do boletim. As telas chamam `HUB_METRICS_BOLETIM._invalidar()` depois de cada carga, o que zera o memo e o `ctxCache`.
11. Ver seção 2.1.
12. `dal-experiencia.js`: cada ciclo é buscado na primeira abertura da aba e fica em cache. `carregar(ciclo, { forcar })` ignora o cache. Chamadas simultâneas compartilham a mesma busca. `invalidar(ciclo)` após upload. Os comentários por competência (`comentarios_gestor, comentarios_auto`) não vêm na carga: `buscarComentarios(ciclo, id)` faz `.select('comentarios_gestor,comentarios_auto').eq('id', id).maybeSingle()` sob demanda (tela, não cálculo).
13. `COLUNAS_LEVES` = `id,ciclo,pessoa_key,cpf,nome,cargo,papel,unidade,departamento,gestor,gestor_direto,gestor_avaliador,data_admissao,data_avaliacao,data_autoavaliacao,status_gestor,status_auto,martelo,martelo_comentario,notas_gestor,notas_auto` (sem `matricula`).
14. No "Visualizar como" (`view-as.js`), `HUB_USER` vira o perfil simulado, montado com `unidades`, `departamentos`, `permissoes` e `satisfacao_areas` do profile alvo. Na saída, volta o usuário real.

## 1.1. Dados que já chegavam por parâmetro no legado

Não são globais lidos pelos cálculos, mas a server action vai ter de entregá-los.

| Dado | Carregado por | Tabela/RPC | Colunas | Filtros | Ordem | Paginação | Consumido por |
|---|---|---|---|---|---|---|---|
| `HUB_DATA.treinamento_turmas` | `dal-indicadores.js` → `loadAll` e `recarregarTurmas` | tabela `treinamento_turmas` | `*` | nenhum | `id` asc | keyset 1000 | `metrics-turmas.js` (`filtrar`, `painel`, `pendencias`…), chamado por `sections/turmas.js`, `sections/fechamento.js` e `fechamento-slides-cultura.js` |
| `HUB_SATISFACAO_DATA.respostas` | `dal-satisfacao.js` → `buscarRespostas` | RPC `satisfacao_dados()` | retorno: `ord, pesquisa, area, nota, melhorar, extra, comentario, unidade, departamento, chave, triagem, loja_liberada` | recorte dentro da RPC [S2] | `.order('ord', { ascending: true })` | range 1000 sobre a RPC | `metrics-satisfacao.js`, chamado por `sections/satisfacao.js`, `sections/indicadores.js` e `sections/fechamento.js`. `triar()` atualiza `triagem` no cache e soma `versao` |
| `HUB_SATISFACAO_DATA.ciclos` | `dal-satisfacao.js` → `buscarCiclos` | tabela `satisfacao_ciclo` | `*` | nenhum | `pesquisa` | sem paginação | `metrics-satisfacao.js` |
| `HUB_FECHAMENTO_DATA.vagas` | `dal-fechamento.js` → `buscarVagas` | tabela `controle_vagas` | `*` | nenhum | `linha` asc | range 1000 | `metrics-fechamento.js` (`periodo`, `ativas`, `mensal`…), chamado por `sections/fechamento.js` e `fechamento-slides*.js` |
| `HUB_FECHAMENTO_DATA.metas` | `dal-fechamento.js` → `buscarMetas` | tabela `metas_vagas` | `*` | nenhum | `ano`, depois `mes` | sem paginação | slides do Fechamento |

## 2. Acessos diretos removidos

### 2.1. `galho.js` → `get()` e `cached()`

- **RPC:** `organograma_meu_galho()`, chamada sem argumentos (`supabase-organograma.sql`). A assinatura aceita `p_target_profile_id uuid default null`. Só quem tem `admin.usuarios` e (`indicadores.organograma` ou `indicadores.headcount`) consegue pedir o galho de outro profile.
- **Retorno:** `external_id, nome, nome_completo, cargo, departamento, unidade, gestor_direto, situacao, grupos, data_admissao, relacao`. É `security definer`, revogada de `public`/`anon` e concedida a `authenticated`. Acha o colaborador pelo `profiles.colaborador_external_id` (prefere `situacao` ativo) e, sem ele, pelo e-mail.
- **Resultado montado no cliente:** `{ rows: data || [] }`. Em erro: `{ rows: [], erro: err.message }`. Depois disso, `ids = new Set(rows.filter(r => r.relacao !== 'acima').map(chave))`: a liderança acima não conta no headcount. Esse trecho foi portado como `idsDoGalho(rows)` em `galho.ts`, junto com `chave` e `motivo`.
- **Cache:** amarrado à identidade do array `HUB_DATA.colaboradores`. Quando o array é trocado (`loadAll` ou upload), `cached()` devolve `null` e o próximo `get()` busca de novo. Chamadas simultâneas sobre os mesmos dados compartilham a mesma promessa (`pendente`). Se os dados mudam durante a busca, o resultado volta mas não é guardado.
- **Consumidores:**
  - `sections/indicadores.js` → `comGalho`: aplicado quando a pessoa NÃO tem `indicadores.headcount_completo`. Põe `f.galho = res.ids` e `f.galhoRes = res` nos filtros de `colaboradoresMetrics` e `rotatividadeMetrics`, que filtram com `f.galho.has(chave(r))`.
  - `sections/organograma.js`: mostra `res.rows` quando a pessoa não tem a visão completa.

### 2.2. `conexao-store.js` → `load()` e `mutate()`

- **Leitura:** RPC `conexao_state()`, sem argumentos (`supabase-conexao-rh.sql` → `conexao_private.load_state()`).
  - Exige `has_permission('conexao_rh.acompanhar')`. Sem ela, erro `42501`.
  - Devolve um array JSON de `{ kind, id, data, revision }` filtrado por `conexao_private.allowed_scope(employees)`.
  - `fits` só vai para quem tem `conexao_rh.documentos`. Registro sem `employees` só vai se for `config` ou se a pessoa tem `conexao_rh.configurar`.
- **Montagem (`accept`):**
  - Estado vazio: `{ version: 1, windowPolicy: 2, launchPolicy: 1, cohortPolicy: 1, config: HUB_CONEXAO_CORE.settings() }`, mais uma lista vazia para cada `kind` em `sessions, events, executions, reports, committees, actions, observations, fits`.
  - Linha `config` → `state.config = settings(row.data)`. As demais entram em `state[kind]`.
  - Guarda `revisions` (`kind:id` → `revision`), `savedAt = JSON.stringify(rows.map(r => [kind, id, revision]))`, `owner` e `loadedAt`.
  - Se `HUB_USER.id` mudou entre o pedido e a resposta, lança "A sessão mudou. Abra o módulo novamente."
- **Leitura do cache:** `read()` devolve `structuredClone(cache)`. `ready()` exige cache e `owner === HUB_USER.id`. `load(force)` usa o cache se estiver pronto e compartilha a busca em andamento. Sem usuário, lança "Entre com seu usuário do Hub."
- **Escrita:** `mutate(fn)` aplica `fn` numa cópia e calcula as mudanças.
  - `config`: `{ kind: 'config', id: 'global', data, revision }` quando o JSON mudou.
  - Demais kinds: uma mudança por registro com JSON diferente. O id é `row.session` em `executions` e `row.id` nos outros.
  - Id vazio ou repetido lança erro. Registro removido lança "O histórico não pode ser excluído…".
  - Sem mudanças, devolve `read()`. Com mudanças, chama a RPC `conexao_save({ changes })` (`conexao_private.write_records`).
  - O banco valida permissão por kind (`conexao_rh.configurar`, `conexao_rh.documentos` ou `conexao_rh.gerir`), lote de até 2000 itens e 8 MB, escopo e regras de negócio da turma.
  - O banco confere `revision`: diferente da atual, erro `40001`. O cliente então recarrega (`load(true)`) e lança "Outra pessoa atualizou este registro…".
  - O retorno é o estado completo, que passa de novo por `accept`.
  - Uma escrita por vez (`busy`).
- **Recarga:** no evento `focus` da janela, se o cache está pronto, nenhum `dialog[open]` existe e já passaram mais de 30 s desde `loadedAt`, chama `load(true)` e redesenha `#sec-conexao-rh` se a tela estiver ativa. `app.js` ("Atualizar dados") chama `load(true)` quando `ready()`.
- **Consumidores:** `sections/conexao-rh.js` (`read`, `load`, `mutate`, `ready`, `id`), `conexao-fit.js` (`load`, `read`, `mutate`) e `app.js`. `id()` = `crypto.randomUUID()`.

## 3. Regras de segurança que a server action precisa preservar

Hoje quase todas dependem de RLS ou de RPC `security definer`. Na stack nova, o servidor é o único filtro.

1. **`colaboradores.matricula` é o celular da pessoa.**
   - `SELECT_COLUNAS.colaboradores` não inclui `matricula`, e `COLUNAS_LEVES` da AvE também não.
   - A única exceção é `sections/conexao-rh.js`, sob `conexao_rh.documentos`.
   - A action de Indicadores nunca devolve essa coluna.
2. **Recorte `can_see(unidade, departamento)`** (`supabase-migration.sql`, `supabase-recorte-rh-permissoes.sql`; espelho em `view-as.js → canSeeRow`).
   - `admin` vê tudo. Outros perfis fora de `gestor`/`rh` não veem nada.
   - Lista vazia = sem restrição naquele eixo.
   - `unidade` nula passa. `departamento` nulo só passa sem departamento restrito.
   - Vale para as tabelas de `INDICADORES_SCOPE`: colaboradores, feedbacks, one_on_one, celebracoes, entrevista_pesquisa, entrevista_solicitacao, twygo_participantes, twygo_usuarios, pesquisa_clima, pesquisa_clima_hc, engajamento_participacao, unibe_pdv, unibe_pessoas e academia_hering.
   - Vale também para as de `RECRUIT_SCOPE`. Em `entrevistas`, a regra é `can_see(unidade, null)`.
   - `twygo_conteudos` não tem recorte.
3. **Permissão de módulo por tabela** (`INDICADORES_PERM` em `view-as.js`, espelho das policies):
   - `indicadores.feedbacks`: feedbacks.
   - `indicadores.oneonone`: one_on_one.
   - `indicadores.celebracoes`: celebracoes.
   - `indicadores.treinamentos`: twygo_*, unibe_*, academia_hering.
   - `indicadores.desligamento`: entrevista_pesquisa, entrevista_solicitacao.
   - `indicadores.pesquisa_clima`: pesquisa_clima, pesquisa_clima_hc (`supabase-pesquisa-clima.sql`).
   - `indicadores.engajamento`: engajamento_pulso sem recorte; engajamento_participacao com `can_see` (`supabase-engajamento.sql`).
   - `indicadores.boletim` + `can_see`: tabelas do boletim e leitura de engajamento pelo boletim (`supabase-boletim.sql`).
   - `treinamento_dev.turmas` ou `treinamento_dev.turmas_gestor`: treinamento_turmas. Com só `treinamento_dev.turmas_lancar`, a pessoa vê apenas as linhas com `criado_por = id`.
4. **Unibê e Academia Hering.** Linha sem unidade não passa (coalesce na policy, `supabase-treinamentos.sql`). Em `unibe_pdv` e `unibe_pessoas`, quem tem a unidade "Escritório" liberada vê tudo (`treinamentos_ve_escritorio`).
5. **Pesquisa de Satisfação: só por `satisfacao_dados()`** (`supabase-satisfacao.sql`) [S2].
   - Exige `indicadores.satisfacao` ou `indicadores.satisfacao_completo`.
   - Devolve só as áreas de `profiles.satisfacao_areas`.
   - Sem a visão completa, vem sem unidade/departamento e sem os comentários tirados pela triagem.
   - `metrics-satisfacao.js → acessoDe` repete a regra no cliente.
6. **Entrevista de Desligamento é anônima.**
   - A fonte antiga vem da view `entrevista_pesquisa_anon`, com `respostas_sem_dado_pessoal`.
   - As solicitações vêm sem nome nem solicitante (`SELECT_COLUNAS.entrevista_solicitacao`).
   - Os resumos `controle_desligamento_indicadores()` e `entrevistas_desligamento_indicadores()` vêm sem nome (`supabase-links-privacidade.sql`).
   - A tabela completa `entrevistas_desligamento` só chega a quem tem a permissão do Controle.
7. **Feedbacks e Celebrações: o texto não desce.** Sem `feedback`/`respostas` e sem `mensagem`.
8. **Situação `Desligado`.** Os cálculos excluem desligados de filtro, organograma e headcount. A action entrega as linhas como hoje: os desligados são usados por rotatividade e pelo boletim. A exclusão continua nos cálculos.
9. **Boletim, Fechamento e Log de Acessos são só do Administrador** (ver AGENTS.md). Controle de Desligamento fica fora dos presets.
10. **"Visualizar como" bloqueia escrita.** A action de leitura deve aceitar o perfil simulado, recortando com as regras acima pelo perfil alvo. A action de escrita deve recusar enquanto o modo estiver ativo.
11. **Conexão RH.** Escopo por `conexao_private.allowed_scope(employees)` e permissões `conexao_rh.acompanhar`, `gerir`, `configurar` e `documentos`. Conflito de revisão devolve `40001` (seção 2.2).
12. **Galho.** A RPC só devolve o galho de outra pessoa a quem tem `admin.usuarios` e (`indicadores.organograma` ou `indicadores.headcount`). Os demais galhos nem chegam ao navegador.

[S2]: `satisfacao_dados()` em `supabase-satisfacao.sql`: `security definer`, `set search_path = public`, revogada de `public`/`anon`, concedida a `authenticated`.

## 4. Não encontrado

Nenhuma chave lida pelos cálculos ficou sem origem.

Ficaram sem conferência no SQL:
- a policy de leitura de `avaliacao_experiencia_45` e `avaliacao_experiencia_90` (procurei `create policy` com esses nomes em `legado/supabase-*.sql` e não achei; pode estar num bloco `do $$` ou em `supabase-seguranca-fase1.sql`);
- o corpo de `satisfacao_dados()` além do cabeçalho;
- o corpo de `conexao_private.allowed_scope`.
