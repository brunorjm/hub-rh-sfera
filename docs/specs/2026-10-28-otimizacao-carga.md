---
Documento: Spec — Hub Sfera rápido (otimização da carga de dados)
Data: 2026-10-28
Status: Aprovada em 28/10/2026, com as propostas da seção 9
Depende de: 2026-10-27-stack-propria.md (hub já fora do Supabase, telas antigas em /hub)
---

# Hub Sfera rápido

## 1. Problema (medido na cópia local de produção, 28/10/2026)
O RH reclama que o hub demora para abrir. Isso já acontecia no Supabase. A causa é o desenho das telas antigas, que a migração manteve de propósito.

**Ao abrir o hub, o navegador baixa todas as linhas de todas as tabelas de Indicadores.** Ao abrir o Recrutamento, baixa também as tabelas dele. Depois faz todas as contas na própria máquina e guarda tudo na memória.

| Dado | Linhas | JSON que desce |
|---|---|---|
| Candidatos (Recrutamento) | 8.857 | 34 MB, dos quais 19 MB são `observacoes` |
| Inscrições do Twygo | 53.242 | 30 MB |
| Feedbacks | 17.077 | 5,8 MB |
| Vagas | 2.550 | 5,6 MB |
| Celebrações | 12.736 | 4 MB |
| Colaboradores | 4.126 | 3,8 MB |
| **Total** | ~100 mil | **~85 MB** (o banco inteiro tem 122 MB) |

**Agravantes:**
- **Carga sequencial.** As 13 tabelas são lidas uma depois da outra, em páginas de 1.000 linhas. Só o Twygo dá 54 idas e voltas.
- **JSON verboso.** O nome de cada coluna se repete em cada linha.
- **Memória.** Tudo fica na memória da aba enquanto ela está aberta.

**As planilhas já vão para o banco.** Cada upload substitui uma tabela. Elas são a porta de entrada de dados de outros sistemas:
- Feedz: colaboradores, feedbacks, 1:1 e celebrações;
- Twygo, Unibê e Academia Hering;
- Avaliação da Experiência;
- pesquisas.

O que falta é parar de mandar o banco inteiro para o navegador.

## 2. Metas (perfil Administrador, que é o pior caso)
| | Hoje (a medir na fase 0) | Após fase 1 | Após fase 2 | Após fase 3 |
|---|---|---|---|---|
| Transferido ao abrir o hub | ~45 MB de JSON | ≤ 8 MB | ≤ 3 MB | ≤ 1 MB |
| Tempo até o Dashboard pronto | a medir | −50% | ≤ 3 s | ≤ 1,5 s |
| Memória da aba | a medir | −30% | −60% | ≤ 300 MB |

**Regra que vale para todas as fases:** os números de todas as telas continuam **idênticos** aos de hoje, conferidos por teste de paridade sobre a cópia local dos dados.

## 3. Fase 0 — Medir antes de mexer
- Um script de medição (Playwright, no navegador de verdade) abre o hub e registra para cada cenário:
  - o tempo até a tela ficar pronta;
  - os MB transferidos;
  - a memória JS da aba.
- **Cenários:** perfis Administrador, RH e gestor com recorte, cada um em três telas: Dashboard, Recrutamento → Candidatos e Treinamentos.
- O resultado fica em `docs/medicoes/AAAA-MM-DD.md`, com o número da fase. O mesmo script roda ao fim de cada fase.

## 4. Fase 1 — Ganhos rápidos (sem mudar nenhuma tela)
1. **Compressão (gzip/brotli)** das respostas de `/api/hub` e dos scripts.
   - Confirmar se o servidor do Next já comprime em produção; se não, ligar no app ou no proxy da VPS.
   - O JSON repetitivo cai na ordem de 85–90%.
2. **Formato em colunas na leitura paginada.**
   - O servidor manda `{ colunas: [...], linhas: [[...], ...] }`, e o `hub-api.js` remonta os objetos.
   - As telas recebem exatamente o mesmo de hoje. O tamanho cai mesmo antes da compressão.
3. **Carga em paralelo e páginas maiores.**
   - As 13 tabelas são lidas em paralelo, com limite de 3 ou 4 ao mesmo tempo.
   - Páginas de 5.000 linhas em vez de 1.000, menos idas e voltas.
4. **"Observações" dos candidatos sob demanda.**
   - A lista vem sem `observacoes` (19 MB).
   - O cartão do candidato, a edição e a exportação buscam as observações quando precisam, numa operação nova `recrutamento.observacoes` com os ids.

**Pronto quando:** a medição mostra a meta da fase 1, a paridade fica idêntica e os testes ficam verdes.

## 5. Fase 2 — Carregar só o que a tela usa
1. **Carga por tela.**
   - No login, só o necessário para o menu, os filtros e o Dashboard.
   - Cada tabela é baixada na primeira vez que alguém abre uma tela que a usa, a partir de um mapa tela → tabelas tirado do código.
   - Twygo, feedbacks e celebrações deixam de descer para quem não abre essas telas.
2. **Só o que mudou.**
   - O Recrutamento já tem `hub_versoes`: um contador por tabela, e o navegador só baixa o que mudou.
   - Esse contador passa a valer também para as tabelas de upload, que mudam de versão a cada upload.
   - Ao clicar em "Atualizar dados", só desce a tabela que mudou.
3. **Cache no navegador: DECISÃO PENDENTE (seção 9).**
   - Guardar os dados no navegador (IndexedDB) deixaria a reabertura instantânea.
   - Em compensação, deixa dado pessoal no computador de quem usou, e isso pesa em máquina compartilhada de loja.
   - A proposta é **sem cache persistente**, só em memória durante a sessão, a menos que o RH decida o contrário.

## 6. Fase 3 — Calcular no servidor, tela por tela
- O servidor faz as contas com `src/lib/calculos`. É o porte TypeScript dos `metrics-*`, que já existe e tem 371 testes vindos do legado.
- Os dados são lidos sob as mesmas RLS, e a tela recebe só os números dos gráficos e tabelas: quilobytes em vez de megabytes.
- Para os cálculos mais pesados (Twygo, rotatividade), o banco guarda um resumo pronto (view materializada), recalculado a cada upload ou sincronização.
- **Paridade obrigatória.** Para cada tela, um teste compara o cálculo do navegador (código antigo, via `vm`) com o do servidor sobre a cópia local, nos perfis admin, RH e gestor com recorte. Precisa sair idêntico.
- **Ordem**, das mais pesadas e mais usadas primeiro:
  1. Dashboard;
  2. Treinamentos (Twygo);
  3. Dashboard do Recrutamento;
  4. Headcount e Rotatividade;
  5. Feedbacks, 1:1 e Celebrações;
  6. Boletim e Fechamento.
- **Visual.** A tela antiga passa a receber os números prontos (mesmo HTML e gráficos), ou é reescrita em React com o mesmo visual. A decisão é por tela (seção 9).

**Pronto, para cada tela:** paridade idêntica, a tela não baixa mais linhas cruas e o RH confere.

## 7. Fase 4 — Planilhas viram integração automática
- **Feedz** (colaboradores, feedbacks, 1:1 e celebrações): um job no container `cron`, como o do Twygo, busca pela API da Feedz e troca a tabela de forma atômica.
  - O Portal do Fera já sincroniza com a Feedz. Reaproveitamos o conhecimento (endpoints e campos), não o código: os sistemas continuam independentes.
- **Twygo:** já está automático. O upload manual do "27. Twygo.xlsx" fica só como reserva.
- **Unibê, Academia Hering, Avaliação da Experiência e pesquisas:** continuam por upload até haver API.
- O upload continua existindo para todas, como plano B.

## 8. Riscos
| Risco | Mitigação |
|---|---|
| Número diferente numa tela | Teste de paridade por tela sobre a cópia local; o RH valida antes de publicar |
| Tela quebrar ao trocar carga por tela | Mapa tela → tabelas tirado do código, varredura de todas as telas no navegador ao fim da fase 2 |
| Dado pessoal guardado no navegador | Sem cache persistente, salvo decisão contrária do RH |
| Feedz mudar a API | Job falha sem apagar nada (troca atômica) e avisa no log; upload continua como reserva |
| Máquina de desenvolvimento com pouca memória | Medições e testes rodam um de cada vez |

## 9. Decisões (aprovadas em 28/10/2026: valem as propostas)
1. **Cache no navegador** (fase 2): sem cache persistente (proposta) ou com cache, mais rápido e com dado na máquina?
2. **Visual na fase 3:** a tela antiga recebe números prontos (proposta: mais rápido de fazer) ou é reescrita em React?
3. **Token da API da Feedz** para a fase 4: quem fornece, e se pode ser o mesmo usado pelo Portal ou um próprio do hub (proposta: próprio).
4. **Ordem das fases × virada:** fazer a fase 1 antes da homologação (proposta, porque o RH já valida mais rápido) e as fases 2 a 4 depois da virada.

## 10. Fora do escopo
- Mudar o que as telas mostram ou como calculam.
- Apagar histórico das tabelas.
- Trocar o banco ou a hospedagem.
