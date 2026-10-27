-- ============================================================================
-- Controle de Desligamento: entrevista "Recusado" encerra o link.
--
-- Quando a ficha passa a "Recusado", o link de entrevista pendente daquele
-- desligamento é encerrado (status 'Encerrado'): a página pública deixa de
-- aceitar resposta ("link não é válido ou expirou") e o link sai das filas de
-- espera. Se a ficha sair de "Recusado" (a pessoa mudou de ideia), o link volta
-- a 'Pendente' e continua valendo — o mesmo endereço, sem gerar outro.
-- Links já respondidos nunca são alterados.
--
-- No fim, encerra os links pendentes das fichas que já estão "Recusado".
-- Rodar UMA vez no SQL Editor do Supabase (pode rodar de novo sem problema).
-- ============================================================================

create or replace function public.controle_desligamento_recusado_link()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status_entrevista is not distinct from old.status_entrevista then
    return new;
  end if;
  if new.status_entrevista = 'Recusado' then
    update public.entrevistas_desligamento l
    set status = 'Encerrado', atualizado_em = now()
    where l.status = 'Pendente'
      and new.id = any(coalesce(public.controle_ids_do_link(l.id_desligamento, l.colaborador_external_id, l.colaborador_nome), '{}'));
  elsif old.status_entrevista = 'Recusado' then
    update public.entrevistas_desligamento l
    set status = 'Pendente', atualizado_em = now()
    where l.status = 'Encerrado'
      and new.id = any(coalesce(public.controle_ids_do_link(l.id_desligamento, l.colaborador_external_id, l.colaborador_nome), '{}'));
  end if;
  return new;
end;
$$;
revoke all on function public.controle_desligamento_recusado_link() from public;

drop trigger if exists controle_desligamento_recusado_link on public.controle_desligamento;
create trigger controle_desligamento_recusado_link
  after update of status_entrevista on public.controle_desligamento
  for each row execute function public.controle_desligamento_recusado_link();

-- Links pendentes de fichas que já estão "Recusado"
update public.entrevistas_desligamento l
set status = 'Encerrado', atualizado_em = now()
where l.status = 'Pendente'
  and exists (select 1 from public.controle_desligamento c
              where c.status_entrevista = 'Recusado'
                and c.id = any(coalesce(public.controle_ids_do_link(l.id_desligamento, l.colaborador_external_id, l.colaborador_nome), '{}')));

-- Conferência: links por status (esperado: nenhum 'Pendente' em ficha "Recusado")
select l.status, count(*) as links,
       count(*) filter (where exists (select 1 from public.controle_desligamento c
                                      where c.status_entrevista = 'Recusado'
                                        and c.id = any(coalesce(public.controle_ids_do_link(l.id_desligamento, l.colaborador_external_id, l.colaborador_nome), '{}')))) as em_ficha_recusado
from public.entrevistas_desligamento l
group by l.status order by l.status;
