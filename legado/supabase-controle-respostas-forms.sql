-- ============================================================================
-- Controle de Desligamento: respostas do Forms (planilhas 34 e 30) na ficha.
--
-- 1) entrevista_pesquisa ganha controle_id: a ficha do Controle a que cada
--    resposta pertence. Ligação: casos conferidos um a um pelo RH/checkup;
--    depois, mesmo nome + desligamento mais próximo (a resposta vem até 45
--    dias antes ou 400 dias depois da demissão). Ignora fichas duplicadas ou
--    canceladas, salvo nos casos conferidos.
-- 2) entrevista_pesquisa_perguntas: a ordem das perguntas de cada questionário
--    (só o texto das perguntas), para mostrar as respostas na ordem original.
-- 3) Funções para a ficha (só com a permissão do Controle de Desligamento e no
--    recorte de unidade/departamento da pessoa):
--    - controle_desligamento_respostas_forms_resumo(): quais fichas têm
--      resposta do Forms (sem as respostas);
--    - controle_desligamento_respostas_forms(ficha): as respostas, sem nome,
--      e-mail, telefone e CPF.
--    Os Indicadores continuam lendo a visão anônima, que não traz a ficha.
--
-- Rodar UMA vez no SQL Editor do Supabase (pode rodar de novo sem problema).
-- ============================================================================

-- 1) Coluna da ficha
alter table public.entrevista_pesquisa
  add column if not exists controle_id bigint references public.controle_desligamento(id) on delete set null;
create index if not exists entrevista_pesquisa_controle_id_idx on public.entrevista_pesquisa (controle_id);

-- 1a) Casos conferidos (resposta → ID do desligamento)
with par(pid, id_desl) as (values
  ('158', '3231'), ('91', '3164'), ('159', '3230'), ('89', '3153'), ('295', '3424'), ('43', '3052'),
  ('P30-41', '1540'), ('P30-99', '1628'), ('P30-161', '1683'), ('P30-140', '1557'), ('P30-268', '2564'),
  ('P30-318', '2782'), ('P30-308', '2889'), ('P30-292', '2244'), ('P30-307', '2830')
)
update public.entrevista_pesquisa p
set controle_id = c.id
from par x
join public.controle_desligamento c on c.id_desligamento = x.id_desl
where p.planilha_id = x.pid and p.controle_id is null
  and (public.normaliza_nome(c.colaborador_nome) = public.normaliza_nome(p.nome)
       or (select count(*) from public.controle_desligamento k where k.id_desligamento = x.id_desl) = 1);

-- 1b) Demais: mesmo nome, desligamento mais próximo
with fichas as (
  select c.id, c.data_demissao, public.normaliza_nome(c.colaborador_nome) as n
  from public.controle_desligamento c
  where c.data_demissao is not null
    and coalesce(c.status_feedz, '') not in ('ID Duplicado', 'Cancelado', 'Cadastro Inexistente')
),
resp as (
  select p.id, p.data_conclusao, coalesce(p.data_desligamento, p.data_conclusao) as ref, public.normaliza_nome(p.nome) as n
  from public.entrevista_pesquisa p
  where p.controle_id is null and p.nome is not null and p.data_conclusao is not null
),
cand as (
  select r.id as pid, f.id as cid,
         row_number() over (partition by r.id order by abs(f.data_demissao - r.ref), f.id) as rn
  from resp r join fichas f on f.n = r.n
  where r.data_conclusao - f.data_demissao between -45 and 400
)
update public.entrevista_pesquisa p
set controle_id = x.cid
from cand x
where x.pid = p.id and x.rn = 1 and p.controle_id is null;

-- 2) Ordem das perguntas
create table if not exists public.entrevista_pesquisa_perguntas (
  origem text not null,      -- 'p34' (Forms atual) ou 'p30' (questionário 2023–2025)
  ordem int not null,
  pergunta text not null,    -- texto da pergunta, espaços normalizados
  primary key (origem, pergunta)
);
alter table public.entrevista_pesquisa_perguntas enable row level security;

insert into public.entrevista_pesquisa_perguntas (origem, ordem, pergunta) values
  ('p34', 1, 'ID'),
  ('p34', 2, 'Hora de início'),
  ('p34', 3, 'Hora de conclusão'),
  ('p34', 4, 'Email'),
  ('p34', 5, 'Nome'),
  ('p34', 6, 'Seu nome completo'),
  ('p34', 7, 'Digite seu CPF sem pontos e sem traços.'),
  ('p34', 8, 'Seu e-mail'),
  ('p34', 9, 'Seu telefone com DDD Exemplo: 21-99999-9999'),
  ('p34', 10, 'Sua Unidade de trabalho'),
  ('p34', 11, 'Selecione a loja em que trabalhou (Boticário - Juiz de Fora)'),
  ('p34', 12, 'Selecione a loja em que trabalhou (Boticário - Rio de Janeiro)'),
  ('p34', 13, 'Selecione a loja em que trabalhou (Boticário - Três Rios)'),
  ('p34', 14, 'Selecione a loja em que trabalhou (Boticário - Interior de MG)'),
  ('p34', 15, 'Selecione o ER em que trabalhou (Boticário - VD Juiz de Fora)'),
  ('p34', 16, 'Selecione o ER em que trabalhou (Boticário - VD Rio de Janeiro)'),
  ('p34', 17, 'Selecione o ER em que trabalhou (Boticário - VD interior de MG)'),
  ('p34', 18, 'Selecione o ER em que trabalhou (Boticário VD - Três Rios)'),
  ('p34', 19, 'Selecione o Departamento em que trabalhou'),
  ('p34', 20, 'Selecione a loja em que trabalhou (Hering)'),
  ('p34', 21, 'Selecione a loja em que trabalhou (Levi''s)'),
  ('p34', 22, 'Selecione a loja em que trabalhou (Quem Disse, Berenice?)'),
  ('p34', 23, 'Motivo do Desligamento:'),
  ('p34', 24, 'Remuneração'),
  ('p34', 25, 'Benefícios'),
  ('p34', 26, 'Adaptação à Cultura Organizacional'),
  ('p34', 27, 'Insatisfação com a Empresa'),
  ('p34', 28, 'Liderança'),
  ('p34', 29, 'Outra Oportunidade de Trabalho'),
  ('p34', 30, 'Baixo Desempenho / Performance'),
  ('p34', 31, 'Perspectiva de Crescimento'),
  ('p34', 32, 'Motivos Pessoais'),
  ('p34', 33, 'Dificuldade com processo / Padrão de atendimento (Botleza / Pulsar / Atendimento 360 / Seams / Live in Levi''s)'),
  ('p34', 34, 'Justifique sua resposta anterior'),
  ('p34', 35, 'Ao ingressar na Sfera Multifranquias o que mais lhe motivou a optar pela empresa foi:'),
  ('p34', 36, 'Quais?'),
  ('p34', 37, 'As informações do Processo Seletivo, referente a remuneração, atribuições e benefícios, correspondem ao que foi aplicado?'),
  ('p34', 38, 'Como você avalia a clareza e a coerência das informações apresentadas durante o Processo Seletivo, especialmente em relação à remuneração, atribuições e benefícios?'),
  ('p34', 39, 'Por favor, descreva abaixo o que não foi passado corretamente durante o Processo Seletivo, referente a remuneração, atribuições e benefícios.'),
  ('p34', 40, 'Esclareça em detalhes, quais as diferenças você percebeu entre as informações compartilhadas pelo RH e aquelas transmitidas pela liderança?'),
  ('p34', 41, 'As informações do Processo de Contratação, referente a remuneração, benefícios, jornada de trabalho, correspondem ao que foi aplicado?'),
  ('p34', 42, 'Se sim, como você avalia essa experiência no Processo de Contratação?'),
  ('p34', 43, 'Por favor, descreva abaixo o que não foi passado corretamente durante o Processo de Contratação, referente a remuneração, benefícios, jornada de trabalho, correspondem ao que foi aplicado?'),
  ('p34', 44, 'Você considera o Onboarding e os treinamentos iniciais aderentes às tarefas desempenhadas?'),
  ('p34', 45, 'Se sim, como você avalia essa experiência no nosso Onboarding?'),
  ('p34', 46, 'Você poderia compartilhar quais aspectos do onboarding ou dos treinamentos iniciais não atenderam às demandas do seu dia a dia? Há algo específico que você acredita que deveria ter sido abordado?"...'),
  ('p34', 47, 'Como você avalia a quantidade de treinamentos obrigatórios durante sua permanência na empresa?'),
  ('p34', 48, 'Qual a opção que melhor representa sua experiência em relação aos treinamentos obrigatórios?'),
  ('p34', 49, 'O que poderia ser melhor em relação aos treinamentos obrigatórios?'),
  ('p34', 50, 'Comunicação'),
  ('p34', 51, 'Qual a opção que melhor representa sua experiência com a comunicação da empresa?'),
  ('p34', 52, 'Compartilhe situações em que a comunicação da empresa não foi clara, ou em que informações importantes não foram transmitidas de maneira adequada ou com a antecedência necessária. (Marque até 2 op...'),
  ('p34', 53, 'Como avalia o relacionamento com seu gestor direto?'),
  ('p34', 54, 'Qual a opção que melhor representa seu relacionamento com seu gestor direto?'),
  ('p34', 55, 'Sinalize o que poderia ser melhor ou o que não era bom no relacionamento com seu gestor direto. (Marque até 2 opções)'),
  ('p34', 56, 'Como você considera a gestão do seu superior imediato?'),
  ('p34', 57, 'Qual a opção que melhor representa a gestão do seu superior imediato?'),
  ('p34', 58, 'Você poderia detalhar por que considera a gestão do seu superior imediato insatisfatória?'),
  ('p34', 59, 'Você poderia descrever com mais detalhes o motivo pelo qual considera a gestão do seu superior imediato insatisfatória?'),
  ('p34', 60, 'Como avalia o relacionamento com sua equipe?'),
  ('p34', 61, 'Selecione a opção que melhor representa sua experiência.'),
  ('p34', 62, 'Sinalize quais aspectos do relacionamento com sua equipe você considera que poderiam ter sido melhores? (marque até 2 opções)'),
  ('p34', 63, 'O que você acha que poderia ser feito para melhorar a sua experiência de trabalho na empresa? (marque até 2 opções)'),
  ('p34', 64, 'Quantos Feedbacks você recebeu sobre o seu desempenho durante sua permanência na empresa?'),
  ('p34', 65, 'Como você avalia essa prática?'),
  ('p34', 66, 'Você poderia detalhar por que considera insatisfatória a quantidade de feedbacks recebidos?'),
  ('p34', 67, 'Você poderia descrever com mais detalhes por que considera insatisfatória a quantidade de feedbacks recebidos?"'),
  ('p34', 68, 'Em relação as outras áreas da empresa, quando houve necessidade de obter informações para auxiliar seu trabalho, você foi prontamente atendido?'),
  ('p34', 69, 'Como você avalia essa experiência?'),
  ('p34', 70, 'Você poderia detalhar por que considera que o atendimento das outras áreas não foi satisfatório?'),
  ('p34', 71, 'Como você classificaria os seguintes aspectos de nossa empresa em relação a REMUNERAÇÃO:'),
  ('p34', 72, 'Se considera positiva, selecione a opção que melhor representa sua experiência:'),
  ('p34', 73, 'Você poderia detalhar por que considera a remuneração da empresa insatisfatória?'),
  ('p34', 74, 'Você poderia descrever com mais detalhes o motivo pelo qual considera a remuneração insatisfatória?'),
  ('p34', 75, 'Como você classificaria os seguintes aspectos de nossa empresa em relação a BENEFÍCIOS onde:'),
  ('p34', 76, 'Se considera positiva, selecione a opção que melhor representa sua experiência.'),
  ('p34', 77, 'Você poderia detalhar por que considera os benefícios da empresa insatisfatórios?'),
  ('p34', 78, 'Você poderia descrever com mais detalhes o motivo pelo qual considera os benefícios insatisfatórios?'),
  ('p34', 79, 'Como você classificaria os seguintes aspectos de nossa empresa em relação a POSSIBILIDADE DE CRESCIMENTO onde:'),
  ('p34', 80, 'Se considera positiva, selecione a opção que melhor representa sua experiência'),
  ('p34', 81, 'Você poderia detalhar por que considera a possibilidade de crescimento na empresa insatisfatória?'),
  ('p34', 82, 'Você poderia descrever com mais detalhes o motivo pelo qual considera a possibilidade de crescimento insatisfatória?'),
  ('p34', 83, 'Em casos de pedido de demissão, você recebeu uma nova proposta de emprego? Caso positivo, poderia mencionar: empresa, cargo e jornada de trabalho?'),
  ('p34', 84, 'Gostaria de acrescentar algum comentário ou sugestão para melhoria?'),
  ('p34', 85, 'Você trabalharia novamente na Sfera Multifranquias?'),
  ('p34', 86, 'Por qual motivo?'),
  ('p34', 87, 'Durante sua trajetória na empresa, houve colaboradores que você considera como referências positivas, mesmo não ocupando cargos de liderança? Se sim, quem são e por que você os considera dessa forma?'),
  ('p34', 88, 'Qual é a probabilidade de você nos recomendar a um amigo ou a um colega?'),
  ('p34', 89, 'Unidade'),
  ('p34', 90, 'Departamento'),
  ('p34', 91, 'Motivo do Desligamento'),
  ('p34', 92, 'Submotivo de Desligamento'),
  ('p34', 93, 'Data do Desligamento'),
  ('p30', 1, 'ID'),
  ('p30', 2, 'Hora de início'),
  ('p30', 3, 'Hora de conclusão'),
  ('p30', 4, 'Email'),
  ('p30', 5, 'Nome'),
  ('p30', 6, 'Hora da última modificação'),
  ('p30', 7, 'E-mail:'),
  ('p30', 8, 'Nome2'),
  ('p30', 9, 'Data de admissão'),
  ('p30', 10, 'Demissão'),
  ('p30', 11, 'Unidade de Negócio:'),
  ('p30', 12, 'Modalidade do Desligamento:'),
  ('p30', 13, 'Motivo do Desligamento:'),
  ('p30', 14, 'Ao ingressar na Sfera Multifranquias o que mais lhe motivou a optar pela empresa foi:'),
  ('p30', 15, 'No caso de opção outros justifique a resposta'),
  ('p30', 16, 'As informações recebidas na sua admissão referente a remuneração, atribuições e benefícios, correspondem ao que foi aplicado?'),
  ('p30', 17, 'Você considera o onboarding e os treinamentos iniciais aderentes às tarefas desempenhadas?'),
  ('p30', 18, 'Como você considera a comunicação da empresa, em relação às políticas, diretrizes e normas?'),
  ('p30', 19, 'Você recebeu feedbacks sobre o desempenho do seu trabalho?'),
  ('p30', 20, 'Como era seu relacionamento com seu gestor?'),
  ('p30', 21, 'Você se sentiu acolhido pela sua liderança?'),
  ('p30', 22, 'Justifique em casos de marcação REGULAR ou RUIM:'),
  ('p30', 23, 'Como você considera a gestão do seu superior imediato?'),
  ('p30', 24, 'Em relação as outras áreas da empresa, quando houve necessidade de obter informações para auxiliar seu trabalho, você foi prontamente atendido?'),
  ('p30', 25, 'Como era o seu relacionamento com seus colegas de trabalho?'),
  ('p30', 26, 'As funções desempenhadas estavam de acordo com seu cargo?'),
  ('p30', 27, 'De 1 a 10 você trabalharia novamente na Sfera Multifranquias?'),
  ('p30', 28, 'Como você classificaria os seguintes aspectos de nossa empresa: Em relação a remuneração'),
  ('p30', 29, 'De 1 a 10 você indicaria a Sfera Multifranquias para um amigo?'),
  ('p30', 30, 'Como você classificaria os seguintes aspectos de nossa empresa: Em relação aos benefícios?'),
  ('p30', 31, 'Como você classificaria os seguintes aspectos de nossa empresa: Em relação a possibilidade de crescimento?'),
  ('p30', 32, '"Em casos de pedido de demissão" Você recebeu uma nova proposta de emprego? Caso positivo, poderia mencionar: empresa, cargo e jornada de trabalho'),
  ('p30', 33, 'Gostaria de acrescentar algum comentário ou sugestão para melhoria?')
on conflict (origem, pergunta) do update set ordem = excluded.ordem;

-- 3a) Quais fichas têm resposta do Forms
create or replace function public.controle_desligamento_respostas_forms_resumo()
returns table (controle_id bigint, planilha_id text, data_conclusao date, questionario_antigo boolean)
language sql stable security definer set search_path = public as $$
  select p.controle_id, p.planilha_id, p.data_conclusao, p.planilha_id like 'P30-%'
  from public.entrevista_pesquisa p
  join public.controle_desligamento c on c.id = p.controle_id
  where public.has_permission('indicadores.controle_desligamento')
    and public.can_see(c.unidade, c.departamento)
  order by p.controle_id, p.data_conclusao
$$;
revoke all on function public.controle_desligamento_respostas_forms_resumo() from public;
grant execute on function public.controle_desligamento_respostas_forms_resumo() to authenticated;

-- 3b) Respostas de uma ficha (sem dado pessoal), na ordem do questionário
create or replace function public.controle_desligamento_respostas_forms(p_controle_id bigint)
returns table (planilha_id text, data_conclusao date, questionario_antigo boolean, ordem int, pergunta text, resposta text)
language sql stable security definer set search_path = public as $$
  select p.planilha_id, p.data_conclusao, p.planilha_id like 'P30-%',
         coalesce(q.ordem, 1000), e.key, e.value #>> '{}'
  from public.entrevista_pesquisa p
  join public.controle_desligamento c on c.id = p.controle_id
  cross join lateral jsonb_each(public.respostas_sem_dado_pessoal(p.respostas)) e
  left join public.entrevista_pesquisa_perguntas q
         on q.origem = case when p.planilha_id like 'P30-%' then 'p30' else 'p34' end
        and q.pergunta = trim(regexp_replace(e.key, '\s+', ' ', 'g'))
  where p.controle_id = p_controle_id
    and public.has_permission('indicadores.controle_desligamento')
    and public.can_see(c.unidade, c.departamento)
    and trim(regexp_replace(e.key, '\s+', ' ', 'g')) not in ('ID', 'Hora de início', 'Hora de conclusão', 'Hora da última modificação', 'Questionário', 'Email', 'Nome', 'Nome2', 'E-mail:')
    and nullif(trim(e.value #>> '{}'), '') is not null
  order by p.data_conclusao, p.planilha_id, 4, 5
$$;
revoke all on function public.controle_desligamento_respostas_forms(bigint) from public;
grant execute on function public.controle_desligamento_respostas_forms(bigint) to authenticated;

-- Conferência (esperado: planilha 34 = 376 ligadas; planilha 30 ≈ 203; perguntas = 126)
select
  (select count(*) from public.entrevista_pesquisa where controle_id is not null and planilha_id not like 'P30-%') as p34_ligadas,
  (select count(*) from public.entrevista_pesquisa where planilha_id not like 'P30-%') as p34_total,
  (select count(*) from public.entrevista_pesquisa where controle_id is not null and planilha_id like 'P30-%') as p30_ligadas,
  (select count(*) from public.entrevista_pesquisa where planilha_id like 'P30-%') as p30_total,
  (select count(*) from public.entrevista_pesquisa_perguntas) as perguntas;
