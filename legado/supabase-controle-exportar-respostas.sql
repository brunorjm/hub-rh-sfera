-- ============================================================================
-- Controle de Desligamento: exportação das respostas do Forms para o Excel.
--
-- 1) controle_desligamento_respostas_forms_exportar(): todas as respostas do
--    Forms (planilhas 34 e 30) das fichas que a pessoa enxerga, de uma vez —
--    sem nome, e-mail, telefone e CPF, e sem as repetidas. Só com a permissão
--    do Controle de Desligamento, no recorte de unidade/departamento.
-- 2) A ordem das perguntas (entrevista_pesquisa_perguntas — só o texto das
--    perguntas, nenhum dado de resposta) fica legível para quem está logado,
--    para montar as colunas do Excel na ordem do questionário.
--
-- Rodar UMA vez no SQL Editor do Supabase (pode rodar de novo sem problema).
-- Não altera nem apaga dados.
-- ============================================================================

create or replace function public.controle_desligamento_respostas_forms_exportar()
returns table (controle_id bigint, planilha_id text, data_conclusao date, questionario_antigo boolean, respostas jsonb)
language sql stable security definer set search_path = public as $$
  select p.controle_id, p.planilha_id, p.data_conclusao, p.planilha_id like 'P30-%',
         public.respostas_sem_dado_pessoal(p.respostas)
  from public.entrevista_pesquisa p
  join public.controle_desligamento c on c.id = p.controle_id
  where not p.repetida
    and public.has_permission('indicadores.controle_desligamento')
    and public.can_see(c.unidade, c.departamento)
  order by p.controle_id, p.data_conclusao, p.planilha_id
$$;
revoke all on function public.controle_desligamento_respostas_forms_exportar() from public;
grant execute on function public.controle_desligamento_respostas_forms_exportar() to authenticated;

drop policy if exists entrevista_pesquisa_perguntas_select on public.entrevista_pesquisa_perguntas;
create policy entrevista_pesquisa_perguntas_select on public.entrevista_pesquisa_perguntas
  for select to authenticated using (true);
grant select on public.entrevista_pesquisa_perguntas to authenticated;

-- Conferência (esperado: 126 perguntas; a função só devolve linhas para quem
-- está logado no Hub — aqui no SQL Editor vem 0, é normal)
select (select count(*) from public.entrevista_pesquisa_perguntas) as perguntas,
       (select count(*) from public.entrevista_pesquisa where controle_id is not null and not repetida) as respostas_ligadas_a_fichas;
