---
Documento: Receita — portar o acesso a dados de um módulo das telas antigas
Data: 2026-10-28
Spec: 2026-10-27-stack-propria.md (§8, revisada em 28/10/2026)
---

# Portar o acesso a dados de um módulo

As telas antigas rodam em `/hub` a partir de `public/legado-ui/js/`, que é uma cópia de `legado/js/`.
- Elas não falam mais com o banco: `window.sb` agora é um stub que falha alto.
- Todo acesso a dados vira uma **operação** no servidor, chamada por `HUB_API.chamar(nome, dados)` (`public/legado-ui/js/hub-api.js`).
- Referência pronta: `indicadores.lerPagina` (`src/server/hub/indicadores.ts`, `public/legado-ui/js/dal-indicadores.js`, `test/hub/indicadores.integration.spec.ts`).

## 1. Levantar o que o módulo pede ao banco
1. Rode `grep -nE "sb\.(from|rpc|auth|storage)" public/legado-ui/js/<arquivos do módulo>` para listar os acessos.
2. Consulte `src/lib/calculos/ACESSO-A-DADOS.md`. Ele já descreve a tabela ou RPC, as colunas, os filtros, a ordem, a paginação e quem consome cada acesso.
3. Para cada tabela, leia as policies de produção em `test/acesso/policies-supabase.json`. Elas dizem que permissão e que recorte valiam.

## 2. Criar a operação (`src/server/hub/<modulo>.ts`)
Cada acesso vira uma operação, com estas regras:
- **Nome:** `"<modulo>.<funcao>"`, registrado no objeto `operacoes` do próprio arquivo.
- **`permissao`:** a chave do catálogo que a policy ou a tela exigia. Lista significa "basta uma".
  - `"autenticado"` só por decisão explícita, e com o nome em `SO_AUTENTICADO` de `test/hub/registro.unit.spec.ts`, comentando o porquê.
- **`escrita`:** `true` se a operação grava. O "Visualizar como" recusa escrita.
- **`entrada`:** um schema Zod estrito. Use `z.enum` para nomes de tabela e coluna. Limite tamanhos.
- **SQL:**
  - Leitura com `linhasJson(tx, sql, ...params)`, que devolve o mesmo JSON do PostgREST (datas como `"2026-10-27"`, bigint como número).
  - Escrita com `tx.$executeRaw` com template (parametrizado) ou com o Prisma (`tx.<modelo>`).
  - Funções do banco (as RPCs antigas) são chamadas com `select public.<funcao>($1, ...)`. Elas usam `auth.uid()`, que já aponta para o usuário.
  - **Identificadores** (tabela, coluna, ordem) vêm só de constantes do servidor, nunca do pedido. Valores sempre entram como parâmetro (`$1`).
  - **Colunas explícitas.** Nunca devolva `colaboradores.matricula` (é o celular), os textos de feedbacks e celebrações, nem dado pessoal que a tela antiga não buscava.
- **Retorno:** exatamente o formato que o código antigo consumia: o `data` do Supabase, ou um objeto, ou `null` para `maybeSingle`.
- A operação roda dentro das **RLS originais** (`comUsuarioRls`, papel `hub_app`). Não reimplemente o recorte que a policy já faz; a policy é a rede de segurança. Se a regra da tela vai além da policy, como o galho do organograma, aplique no servidor.

## 3. Trocar a chamada na tela antiga (`public/legado-ui/js/...`)
- Troque só o acesso: `sb.from(...)...` vira `await HUB_API.chamar('<modulo>.<funcao>', {...})`.
- O `HUB_API.chamar` devolve os dados e lança `Error(mensagem)` em caso de falha. Onde o código esperava `{ data, error }`, adapte o mínimo, por exemplo `try { data = await ... } catch (error) { ... }`.
- Mantenha os comentários e a lógica. Não reformate o arquivo.
- Nenhum `sb.` pode sobrar nos arquivos do módulo.

## 4. Testar (`test/hub/<modulo>.integration.spec.ts`)
Os testes rodam no banco `hub_test` (porta 5436) com **dados inventados**, pelos helpers de `test/helpers/hub.ts` (`criarConta`, `executar`, `limpar`). Para cada operação, cubra:
- o caminho feliz, conferindo o formato que a tela espera;
- sem a permissão: status 403;
- com recorte (gestor/RH com unidade ou departamento), quando a tabela é recortada;
- escrita: grava de fato e é recusada no "Visualizar como" (`executar(nome, corpo, admin, outraConta)` devolve 403).

## 5. Verificar antes de entregar
Rode estes comandos, nesta ordem:

```bash
npx tsc --noEmit
npx eslint src test
npx jest --selectProjects unit -i
npx jest --selectProjects integration -i
grep -nE "sb\.(from|rpc|auth|storage)" public/legado-ui/js/<arquivos do módulo>
```

O último comando não pode devolver nada. Não commite: quem coordena revisa e commita.
