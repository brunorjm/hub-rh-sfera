-- ============================================================================
-- Entrevista de Desligamento: links de entrevista sem dado pessoal nos
-- Indicadores.
--
-- 1) entrevistas_desligamento (links com nome, CPF, e-mail, telefone e o
--    token do link) passa a ser lida só por quem tem a permissão do Controle
--    de Desligamento (ou a antiga "Gerar link"), além do recorte de
--    unidade/departamento.
-- 2) entrevistas_desligamento_indicadores(): o que os Indicadores usam — sem
--    nome, CPF, e-mail, telefone, token nem quem gerou; com "tem_desligamento"
--    (se o link já está ligado a um desligamento do Controle, calculado aqui
--    no banco, sem precisar do nome no navegador). Para quem tem a permissão
--    do painel ('indicadores.desligamento'), no seu recorte.
-- 3) controle_desligamento_indicadores() deixa de devolver o nome do
--    desligado (os Indicadores não precisam dele).
-- A regra que liga link ↔ desligamento vira uma função só, usada também pelo
-- gatilho de sincronização do status (supabase-controle-sync-link.sql).
--
-- Rodar UMA vez no SQL Editor do Supabase (pode rodar de novo sem problema).
-- Não altera nem apaga dados.
-- ============================================================================

-- Desligamento(s) do Controle a que um link pertence: pelo ID do desligamento
-- gravado no link; senão pelo usuário da Feedz; senão pelo nome, na demissão
-- mais recente.
create or replace function public.controle_ids_do_link(p_id_desligamento text, p_external_id text, p_nome text)
returns bigint[]
language plpgsql stable security definer set search_path = public as $$
declare
  alvo bigint[];
  v_nome text := public.normaliza_nome(p_nome);
begin
  if coalesce(p_id_desligamento, '') <> '' then
    select array_agg(c.id) into alvo from public.controle_desligamento c
    where c.id_desligamento = p_id_desligamento and public.normaliza_nome(c.colaborador_nome) = v_nome;
    if alvo is null then
      select array_agg(c.id) into alvo from public.controle_desligamento c where c.id_desligamento = p_id_desligamento;
    end if;
  end if;
  if alvo is null and coalesce(p_external_id, '') <> '' then
    select array_agg(c.id) into alvo from public.controle_desligamento c where c.colaborador_external_id = p_external_id;
  end if;
  if alvo is null and v_nome <> '' then
    select array_agg(c.id) into alvo from public.controle_desligamento c
    where public.normaliza_nome(c.colaborador_nome) = v_nome
      and c.data_demissao is not distinct from (
        select max(c2.data_demissao) from public.controle_desligamento c2
        where public.normaliza_nome(c2.colaborador_nome) = v_nome);
  end if;
  return alvo;
end;
$$;
revoke all on function public.controle_ids_do_link(text, text, text) from public;

-- Gatilho de sincronização do status passa a usar a mesma regra.
create or replace function public.controle_desligamento_sync_link()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  alvo bigint[] := public.controle_ids_do_link(new.id_desligamento, new.colaborador_external_id, new.colaborador_nome);
begin
  if alvo is null then
    return new;
  end if;
  if new.status = 'Preenchido' then
    update public.controle_desligamento
    set status_entrevista = 'Realizada',
        data_realizacao = coalesce(data_realizacao, (coalesce(new.data_finalizacao, now()) at time zone 'America/Sao_Paulo')::date),
        atualizado_por = 'Link de entrevista (automático)',
        atualizado_em = now()
    where id = any(alvo)
      and (status_entrevista is distinct from 'Realizada' or data_realizacao is null);
  elsif new.status = 'Pendente' then
    update public.controle_desligamento
    set status_entrevista = 'Enviada',
        atualizado_por = 'Link de entrevista (automático)',
        atualizado_em = now()
    where id = any(alvo)
      and coalesce(status_entrevista, '') in ('', 'Não Realizada');
  end if;
  return new;
end;
$$;

-- 1) Links completos: só com a permissão do Controle (ou a antiga "Gerar link").
drop policy if exists entrevistas_desligamento_select on public.entrevistas_desligamento;
create policy entrevistas_desligamento_select on public.entrevistas_desligamento for select
  using (public.can_see(unidade, departamento)
         and (public.has_permission('indicadores.controle_desligamento') or public.has_permission('indicadores.desligamento_gerar_link')));

-- 2) Resumo dos links para os Indicadores (sem dado pessoal).
create or replace function public.entrevistas_desligamento_indicadores()
returns table (
  id text, status text, unidade text, departamento text,
  data_desligamento date, data_finalizacao timestamptz, criado_em timestamptz,
  respostas jsonb, tem_desligamento boolean
)
language sql stable security definer set search_path = public as $$
  select l.id, l.status, l.unidade, l.departamento,
         l.data_desligamento, l.data_finalizacao, l.criado_em,
         case when l.status = 'Preenchido' then l.respostas else '{}'::jsonb end,
         public.controle_ids_do_link(l.id_desligamento, l.colaborador_external_id, l.colaborador_nome) is not null
  from public.entrevistas_desligamento l
  where public.has_permission('indicadores.desligamento')
    and public.can_see(l.unidade, l.departamento)
  order by l.id
$$;
revoke all on function public.entrevistas_desligamento_indicadores() from public;
grant execute on function public.entrevistas_desligamento_indicadores() to authenticated;

-- 3) Resumo do Controle sem o nome do desligado (muda o formato → recria).
drop function if exists public.controle_desligamento_indicadores();
create function public.controle_desligamento_indicadores()
returns table (
  id_desligamento text, unidade text, departamento text,
  data_solicitacao date, data_demissao date, tipo text, tipo_desligamento text,
  motivo text, status_feedz text, status_entrevista text
)
language sql stable security definer set search_path = public as $$
  select c.id_desligamento, c.unidade, c.departamento,
         c.data_solicitacao, c.data_demissao, c.tipo, c.tipo_desligamento,
         c.motivo, c.status_feedz, c.status_entrevista
  from public.controle_desligamento c
  where public.has_permission('indicadores.desligamento')
    and public.can_see(c.unidade, c.departamento)
  order by c.id
$$;
revoke all on function public.controle_desligamento_indicadores() from public;
grant execute on function public.controle_desligamento_indicadores() to authenticated;

-- Conferência (como administrador): total de links e quantos já estão
-- ligados a um desligamento do Controle.
select count(*) as links, count(*) filter (where tem_desligamento) as ligados_a_desligamento
from public.entrevistas_desligamento_indicadores();
