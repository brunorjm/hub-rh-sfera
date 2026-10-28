-- ============================================================================
-- Controle de Desligamento × link de entrevista: status sempre sincronizado.
--
-- Quando o link de entrevista de um desligamento é gerado ou respondido, o
-- próprio banco atualiza a ficha no Controle de Desligamento:
--   - link respondido (Preenchido) → status da entrevista "Realizada" e data
--     da realização = data da resposta (se ainda não houver data);
--   - link gerado e pendente        → "Enviada", só se a ficha ainda estiver
--     "Não Realizada"/vazia (não sobrescreve Recusado, Inelegível, Realizada).
-- Qual ficha: a do ID do desligamento gravado no link; senão, a do mesmo
-- usuário da Feedz; senão, a do mesmo nome com a demissão mais recente.
--
-- No final, acerta de uma vez as fichas cujos links já existem.
-- Rodar UMA vez no SQL Editor do Supabase (pode rodar de novo sem problema).
-- ============================================================================

create or replace function public.normaliza_nome(p text)
returns text
language sql immutable as $$
  select trim(regexp_replace(
    translate(lower(coalesce(p, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
    '\s+', ' ', 'g'))
$$;

create or replace function public.controle_desligamento_sync_link()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  alvo bigint[];
  v_nome text := public.normaliza_nome(new.colaborador_nome);
begin
  if new.id_desligamento is not null and new.id_desligamento <> '' then
    select array_agg(c.id) into alvo from public.controle_desligamento c
    where c.id_desligamento = new.id_desligamento
      and public.normaliza_nome(c.colaborador_nome) = v_nome;
    if alvo is null then
      select array_agg(c.id) into alvo from public.controle_desligamento c
      where c.id_desligamento = new.id_desligamento;
    end if;
  end if;
  if alvo is null and coalesce(new.colaborador_external_id, '') <> '' then
    select array_agg(c.id) into alvo from public.controle_desligamento c
    where c.colaborador_external_id = new.colaborador_external_id;
  end if;
  if alvo is null and v_nome <> '' then
    select array_agg(c.id) into alvo from public.controle_desligamento c
    where public.normaliza_nome(c.colaborador_nome) = v_nome
      and c.data_demissao is not distinct from (
        select max(c2.data_demissao) from public.controle_desligamento c2
        where public.normaliza_nome(c2.colaborador_nome) = v_nome);
  end if;
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
revoke all on function public.controle_desligamento_sync_link() from public;

drop trigger if exists controle_desligamento_sync_link on public.entrevistas_desligamento;
create trigger controle_desligamento_sync_link
  after insert or update of status on public.entrevistas_desligamento
  for each row execute function public.controle_desligamento_sync_link();

-- Acerto único das fichas com links já existentes (dispara a regra acima
-- para cada link, sem mudar nada no próprio link).
update public.entrevistas_desligamento set status = status;

-- Conferência: links respondidos cuja ficha ainda não está "Realizada"
-- (esperado: 0) e total de fichas atualizadas automaticamente.
select
  (select count(*) from public.entrevistas_desligamento l
   where l.status = 'Preenchido'
     and exists (select 1 from public.controle_desligamento c where public.normaliza_nome(c.colaborador_nome) = public.normaliza_nome(l.colaborador_nome))
     and not exists (select 1 from public.controle_desligamento c
                     where public.normaliza_nome(c.colaborador_nome) = public.normaliza_nome(l.colaborador_nome)
                       and c.status_entrevista = 'Realizada')) as respondidos_sem_realizada,
  (select count(*) from public.controle_desligamento where atualizado_por = 'Link de entrevista (automático)') as fichas_atualizadas_automaticamente;
