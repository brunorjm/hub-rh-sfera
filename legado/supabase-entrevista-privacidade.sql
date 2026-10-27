-- ============================================================================
-- Entrevista de Desligamento: privacidade das respostas antigas do Forms.
--
-- 1) entrevista_pesquisa e entrevista_solicitacao (histórico da planilha)
--    passam a exigir a permissão do painel ('indicadores.desligamento'), além
--    da unidade/departamento (can_see). Antes bastava o recorte de unidade:
--    quem não tinha acesso ao painel recebia essas linhas no navegador.
-- 2) entrevista_pesquisa_anon: a mesma pesquisa SEM nome, e-mail, telefone e
--    CPF — nem nas colunas, nem dentro de "respostas". É o que o Hub carrega
--    para os Indicadores (que são anônimos). security_invoker: vale a mesma
--    RLS da tabela original para quem consulta.
--
-- Rodar UMA vez no SQL Editor do Supabase (pode rodar de novo sem problema).
-- Não altera nem apaga dados.
-- ============================================================================

drop policy if exists entrevista_pesquisa_select on public.entrevista_pesquisa;
create policy entrevista_pesquisa_select on public.entrevista_pesquisa for select
  using (public.can_see(unidade, departamento) and public.has_permission('indicadores.desligamento'));

drop policy if exists entrevista_solicitacao_select on public.entrevista_solicitacao;
create policy entrevista_solicitacao_select on public.entrevista_solicitacao for select
  using (public.can_see(unidade, departamento) and public.has_permission('indicadores.desligamento'));

create or replace function public.respostas_sem_dado_pessoal(p jsonb)
returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  from jsonb_each(coalesce(p, '{}'::jsonb)) as e
  where not (
    lower(trim(e.key)) in ('nome', 'email', 'seu nome completo', 'seu e-mail')
    or lower(trim(e.key)) like 'seu telefone%'
    or lower(trim(e.key)) like 'digite seu cpf%'
  )
$$;

create or replace view public.entrevista_pesquisa_anon
with (security_invoker = true) as
select id, planilha_id, data_inicio, data_conclusao, unidade, departamento,
       motivo_desligamento, submotivo_desligamento, data_desligamento,
       trabalharia_novamente, nps,
       public.respostas_sem_dado_pessoal(respostas) as respostas
from public.entrevista_pesquisa;

grant select on public.entrevista_pesquisa_anon to authenticated;

-- Conferência: nenhuma resposta anônima pode conter as chaves pessoais
-- (esperado: total = 376 para o administrador e com_dado_pessoal = 0)
select count(*) as total,
       count(*) filter (where respostas ?| array['Nome','Email','Seu nome completo','Seu e-mail']) as com_dado_pessoal
from public.entrevista_pesquisa_anon;
