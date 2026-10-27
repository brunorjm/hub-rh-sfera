-- ============================================================================
-- Entrevista de Desligamento: gerar link passa a fazer parte do Controle de
-- Desligamento. Quem tem a permissão 'indicadores.controle_desligamento' pode
-- gravar e atualizar links de entrevista (entrevistas_desligamento). A
-- permissão antiga 'indicadores.desligamento_gerar_link' continua aceita para
-- não tirar o acesso de ninguém durante a transição (ela sai do Cadastro de
-- Acessos). Rodar UMA vez no SQL Editor do Supabase (pode rodar de novo).
-- ============================================================================

drop policy if exists entrevistas_desligamento_insert on public.entrevistas_desligamento;
create policy entrevistas_desligamento_insert on public.entrevistas_desligamento for insert
  with check (public.has_permission('indicadores.controle_desligamento') or public.has_permission('indicadores.desligamento_gerar_link'));

drop policy if exists entrevistas_desligamento_update on public.entrevistas_desligamento;
create policy entrevistas_desligamento_update on public.entrevistas_desligamento for update
  using (public.has_permission('indicadores.controle_desligamento') or public.has_permission('indicadores.desligamento_gerar_link'))
  with check (public.has_permission('indicadores.controle_desligamento') or public.has_permission('indicadores.desligamento_gerar_link'));

-- Conferência: as duas policies devem aparecer
select policyname, cmd from pg_policies
where tablename = 'entrevistas_desligamento' and policyname in ('entrevistas_desligamento_insert', 'entrevistas_desligamento_update');
