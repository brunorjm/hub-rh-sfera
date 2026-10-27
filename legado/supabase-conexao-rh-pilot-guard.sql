create function conexao_private.validate_pilot_and_absence() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.kind='sessions' and coalesce((new.data->>'importedPilot')::boolean,false) and tg_op='INSERT' and not public.has_permission('conexao_rh.configurar') then raise exception 'A importação do piloto exige permissão de configuração.' using errcode='42501'; end if;
 if new.kind='executions' and new.data->>'status'='not-held' then
  if (new.data->>'date')::date+(new.data->>'time')::time+make_interval(mins=>(new.data->>'duration')::int)>(now() at time zone 'America/Sao_Paulo') or exists(select 1 from jsonb_array_elements(new.data->'roster') p where coalesce(p->>'attendance','')<>'faltou') then raise exception 'Para registrar turma não realizada, aguarde o término e registre a ausência de todos.'; end if;
 end if;
 return new;
end $$;
revoke all on function conexao_private.validate_pilot_and_absence() from public,anon,authenticated;
create trigger conexao_pilot_absence_validation before insert or update on conexao_private.records for each row execute function conexao_private.validate_pilot_and_absence();
