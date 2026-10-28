-- ============================================================================
-- Entrevista de Desligamento: respostas repetidas fora dos Indicadores.
--
-- A mesma pessoa respondeu o Forms duas vezes para o mesmo desligamento
-- (30/09/2026, conferido pelo RH). Fica a resposta que vale para a ficha e a
-- outra é marcada como repetida — não é apagada, só deixa de contar:
--   ficha 2956: fica 38, repetida 39 (envio duplicado, respostas iguais)
--   ficha 3034: fica 7,  repetida 8  (envio duplicado, respostas iguais)
--   ficha 2946: fica 22 (data da entrevista na ficha), repetida 94
--   ficha 2880: fica 66 (completa), repetida P30-322 (só 7 respostas)
-- A visão anônima dos Indicadores e as funções da ficha passam a ignorar as
-- repetidas. Pode rodar de novo sem problema.
-- ============================================================================

alter table public.entrevista_pesquisa add column if not exists repetida boolean not null default false;

update public.entrevista_pesquisa
set repetida = true
where planilha_id in ('39', '8', '94', 'P30-322') and not repetida;

create or replace view public.entrevista_pesquisa_anon
with (security_invoker = true) as
select id, planilha_id, data_inicio, data_conclusao, unidade, departamento,
       motivo_desligamento, submotivo_desligamento, data_desligamento,
       trabalharia_novamente, nps,
       public.respostas_sem_dado_pessoal(respostas) as respostas
from public.entrevista_pesquisa
where not repetida;

create or replace function public.controle_desligamento_respostas_forms_resumo()
returns table (controle_id bigint, planilha_id text, data_conclusao date, questionario_antigo boolean)
language sql stable security definer set search_path = public as $$
  select p.controle_id, p.planilha_id, p.data_conclusao, p.planilha_id like 'P30-%'
  from public.entrevista_pesquisa p
  join public.controle_desligamento c on c.id = p.controle_id
  where not p.repetida
    and public.has_permission('indicadores.controle_desligamento')
    and public.can_see(c.unidade, c.departamento)
  order by p.controle_id, p.data_conclusao
$$;

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
  where p.controle_id = p_controle_id and not p.repetida
    and public.has_permission('indicadores.controle_desligamento')
    and public.can_see(c.unidade, c.departamento)
    and trim(regexp_replace(e.key, '\s+', ' ', 'g')) not in ('ID', 'Hora de início', 'Hora de conclusão', 'Hora da última modificação', 'Questionário', 'Email', 'Nome', 'Nome2', 'E-mail:')
    and nullif(trim(e.value #>> '{}'), '') is not null
  order by p.data_conclusao, p.planilha_id, 4, 5
$$;

-- Conferência (esperado: 4 repetidas; 685 respostas nos Indicadores = 689 − 4)
select
  (select count(*) from public.entrevista_pesquisa where repetida) as repetidas,
  (select count(*) from public.entrevista_pesquisa) as respostas_no_banco,
  (select count(*) from public.entrevista_pesquisa where not repetida) as respostas_nos_indicadores;
