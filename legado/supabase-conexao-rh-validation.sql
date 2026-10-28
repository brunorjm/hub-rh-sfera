-- Additional integrity constraints for API writes and deliberate deny-all table policies.
create policy records_no_direct_access on conexao_private.records as restrictive for all to anon,authenticated using(false) with check(false);
create policy audit_no_direct_access on conexao_private.audit as restrictive for all to anon,authenticated using(false) with check(false);
create policy nps_no_direct_access on conexao_private.nps as restrictive for all to anon,authenticated using(false) with check(false);
create policy secrets_no_direct_access on conexao_private.secrets as restrictive for all to anon,authenticated using(false) with check(false);
create function conexao_private.validate_record() returns trigger language plpgsql security definer set search_path='' as $$
declare d jsonb:=new.data; s jsonb; e jsonb; capacity integer;
begin
 if new.kind not in ('config','executions') and d->>'id' is distinct from new.id then raise exception 'Identificador inconsistente.'; end if;
 if new.kind='config' then
  if new.id<>'global' or (d->>'capacity')::int not between 1 and 100 or (d->>'duration')::int not between 15 and 180 or (d->>'maxEligibleAge')::int not between 1 and 1000 or (d->>'launchDate')::date is null or d->'milestones' is distinct from '[30,75,120]'::jsonb then raise exception 'Configuração inválida. Utilize os marcos 30, 75 e 120.'; end if;
 elsif new.kind='sessions' then
  if coalesce(d->>'facilitator','')='' or d->>'date' is null or d->>'time' is null or d->>'duration' is null or d->>'milestone' is null then raise exception 'Preencha data, horário, duração, marco e facilitador.'; end if;
  select coalesce((data->>'capacity')::int,8) into capacity from conexao_private.records where kind='config' and id='global'; capacity:=coalesce(capacity,8);
  if cardinality(new.employees)>capacity then raise exception 'A turma excede a capacidade configurada.'; end if;
  if tg_op='UPDATE' and old.data->>'milestone'<>d->>'milestone' then raise exception 'O marco de uma turma salva deve ser preservado.'; end if;
  if d->>'cancelled' is null and exists(select 1 from conexao_private.records r where r.kind='sessions' and r.id<>new.id and r.data->>'cancelled' is null and r.data->>'date'=d->>'date' and r.employees&&new.employees and (d->>'time')::time<(r.data->>'time')::time+make_interval(mins=>(r.data->>'duration')::int) and (r.data->>'time')::time<(d->>'time')::time+make_interval(mins=>(d->>'duration')::int)) then raise exception 'Um participante já está em outra turma nesse horário.'; end if;
 elsif new.kind='executions' then
  if d->>'status' not in ('draft','final','not-held') or d->>'date' is null or d->>'time' is null or d->>'duration' is null or coalesce(d->>'facilitator','')='' then raise exception 'Execução incompleta.'; end if;
  if (d->>'duration')::int not between 15 and 180 or (d->>'time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Horário ou duração inválidos.'; end if;
  if jsonb_array_length(d->'roster')<>(select count(distinct p->>'key') from jsonb_array_elements(d->'roster') p) then raise exception 'Participantes duplicados.'; end if;
  if exists(select 1 from public.colaboradores c where c.id::text||'@'||c.data_admissao::text=any(new.employees) and c.data_admissao>(d->>'date')::date) then raise exception 'Execução anterior à admissão.'; end if;
  if tg_op='UPDATE' and old.data->>'status'='final' and old.data<>d and exists(select 1 from conexao_private.records where kind='committees' and data->>'session'=new.id) then raise exception 'Há comitê vinculado. Preserve o consolidado e registre os esclarecimentos em observações.'; end if;
 elsif new.kind='reports' then
  select data into e from conexao_private.records where kind='executions' and id=d->>'session';
  if coalesce(e->>'status','') not in ('final','draft') then raise exception 'Relatório exige execução registrada.'; end if;
  if d->>'status'='ready' and e->>'status'<>'final' then raise exception 'Finalize a execução antes de encaminhar o relatório.'; end if;
 elsif new.kind='committees' then
  select data into s from conexao_private.records where kind='reports' and id=d->>'report';
  if s is null or s->>'session' is distinct from d->>'session' or s->>'status'<>'ready' then raise exception 'Comitê exige relatório pronto da mesma turma.'; end if;
  if (d->>'date')::date<(s->>'date')::date or coalesce(d->>'rh','')='' or coalesce(d->>'td','')='' or coalesce(d->>'management','')='' then raise exception 'Revise a data e os três responsáveis do comitê.'; end if;
 elsif new.kind='events' then
  select data into s from conexao_private.records where kind='sessions' and id=d->>'session';
  if d->>'type' not in ('presente','faltou') or not exists(select 1 from jsonb_array_elements_text(s->'participants') p where p||':'||(s->>'milestone')=d->>'stage') then raise exception 'Registro de participação inválido.'; end if;
  if tg_op='UPDATE' then raise exception 'Participações são históricas. Registre uma retificação.'; end if;
 elsif new.kind='fits' and tg_op='UPDATE' then
  if old.data->>'hash' is distinct from d->>'hash' or old.data->>'path' is distinct from d->>'path' then raise exception 'O PDF original é imutável. Anexe uma nova versão.'; end if;
 end if;
 return new;
end $$;
revoke all on function conexao_private.validate_record() from public,anon,authenticated;
create trigger conexao_record_validation before insert or update on conexao_private.records for each row execute function conexao_private.validate_record();
