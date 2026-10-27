-- Conexão RH: shared records, private PDFs, audit and one-time external NPS.
create schema if not exists conexao_private;
revoke all on schema conexao_private from public;
grant usage on schema conexao_private to authenticated, anon;
create table conexao_private.records (
 kind text not null check (kind in ('config','sessions','events','executions','reports','committees','actions','observations','fits')),
 id text not null, data jsonb not null check(jsonb_typeof(data)='object'),
 employees text[] not null default '{}', revision bigint not null default 1,
 updated_at timestamptz not null default now(), updated_by uuid not null,
 primary key(kind,id)
);
create table conexao_private.audit (
 id bigint generated always as identity primary key, kind text not null, record_id text not null,
 previous jsonb, current_data jsonb not null, actor uuid not null, created_at timestamptz not null default now()
);
create table conexao_private.secrets (id boolean primary key default true check(id), secret text not null);
insert into conexao_private.secrets(secret) values(encode(extensions.gen_random_bytes(32),'hex'));
create table conexao_private.nps (
 id uuid primary key default gen_random_uuid(), session_id text not null, employee text not null,
 milestone integer not null, meeting_date date not null, token_hash text not null unique, token_cipher bytea not null,
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '90 days',
 revoked boolean not null default false, score integer check(score between 0 and 10), comment text,
 responded_at timestamptz, unique(session_id,employee)
);
alter table conexao_private.records enable row level security;
alter table conexao_private.audit enable row level security;
alter table conexao_private.secrets enable row level security;
alter table conexao_private.nps enable row level security;
revoke all on all tables in schema conexao_private from anon, authenticated;

create function conexao_private.allowed_employee(k text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.has_permission('conexao_rh.acompanhar') and exists(
 select 1 from public.colaboradores c where c.id::text||'@'||c.data_admissao::text=k
 and c.unidade is not null and public.can_see_escopo(public.hub_escopo(),c.unidade,c.departamento))
$$;
create function conexao_private.allowed_scope(keys text[]) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.has_permission('conexao_rh.acompanhar') and
 not exists(select 1 from unnest(keys) k where not conexao_private.allowed_employee(k))
$$;
create function conexao_private.load_state() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_permission('conexao_rh.acompanhar') then raise exception 'Acesso ao Conexão RH não autorizado.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('kind',r.kind,'id',r.id,'data',r.data,'revision',r.revision))
 from conexao_private.records r where conexao_private.allowed_scope(r.employees)
 and (r.kind<>'fits' or public.has_permission('conexao_rh.documentos'))
 and (cardinality(r.employees)>0 or r.kind='config' or public.has_permission('conexao_rh.configurar'))),'[]'::jsonb);
end $$;
create function conexao_private.write_records(changes jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item jsonb; d jsonb; prior conexao_private.records; keys text[]; k text; rid text; parent jsonb; actual bigint; actor uuid:=auth.uid();
begin
 if actor is null or not public.has_permission('conexao_rh.acompanhar') then raise exception 'Acesso não autorizado.' using errcode='42501'; end if;
 if jsonb_typeof(changes)<>'array' or jsonb_array_length(changes)>2000 or octet_length(changes::text)>8000000 then raise exception 'Lote inválido ou muito grande.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('conexao_rh_write',0));
 for item in select value from jsonb_array_elements(changes) loop
  k:=item->>'kind'; rid:=item->>'id'; d:=item->'data'; keys:='{}';
  if k not in ('config','sessions','events','executions','reports','committees','actions','observations','fits') or rid is null or length(rid)>200 or jsonb_typeof(d)<>'object' then raise exception 'Registro inválido.'; end if;
  if not public.has_permission(case when k='config' then 'conexao_rh.configurar' when k='fits' then 'conexao_rh.documentos' else 'conexao_rh.gerir' end) then raise exception 'Seu perfil não pode alterar este registro.' using errcode='42501'; end if;
  select * into prior from conexao_private.records where kind=k and id=rid;
  actual:=coalesce(prior.revision,0);
  if actual<>coalesce((item->>'revision')::bigint,-1) then raise exception 'Este registro foi atualizado por outra pessoa. Atualize os dados antes de salvar.' using errcode='40001'; end if;
  if actual>0 and not conexao_private.allowed_scope(prior.employees) then raise exception 'Registro fora do seu escopo.' using errcode='42501'; end if;
  if k='sessions' then
   if jsonb_typeof(d->'participants')<>'array' then raise exception 'Informe os participantes.'; end if;
   select array_agg(value) into keys from jsonb_array_elements_text(d->'participants');
   if coalesce(cardinality(keys),0)<1 or cardinality(keys)>100 or cardinality(keys)<>(select count(distinct x) from unnest(keys) x) then raise exception 'Turma sem participantes ou com lista inválida.'; end if;
   if (d->>'id') is distinct from rid or (d->>'milestone')::int not in(30,75,120) or (d->>'duration')::int not between 15 and 180 then raise exception 'Marco ou duração inválidos.'; end if;
   if d->>'time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (d->>'time')::time<time '10:00' or (d->>'time')::time+make_interval(mins=>(d->>'duration')::int)>time '16:00' then raise exception 'Encontros devem ocorrer entre 10h e 16h.'; end if;
   if exists(select 1 from public.colaboradores c where c.id::text||'@'||c.data_admissao::text=any(keys) and (d->>'date')::date<c.data_admissao) then raise exception 'Turma anterior à admissão.'; end if;
   if actual=0 and (d->>'date')::date<(now() at time zone 'America/Sao_Paulo')::date and coalesce(d->>'importedPilot','')<>'true' then raise exception 'Não é possível agendar no passado.'; end if;
   if actual>0 and exists(select 1 from conexao_private.records where kind='executions' and id=rid and data->>'status'='final') and (prior.data->'participants'<>d->'participants' or prior.data->>'date'<>d->>'date' or prior.data->>'time'<>d->>'time' or d->>'cancelled' is not null) then raise exception 'Preserve a turma finalizada. Registre uma retificação.'; end if;
   if d->>'cancelled' is null and exists(select 1 from conexao_private.records s where s.kind='sessions' and s.id<>rid and s.data->>'cancelled' is null and s.data->>'date'=d->>'date' and lower(trim(s.data->>'facilitator'))=lower(trim(d->>'facilitator')) and (d->>'time')::time<(s.data->>'time')::time+make_interval(mins=>(s.data->>'duration')::int) and (s.data->>'time')::time<(d->>'time')::time+make_interval(mins=>(d->>'duration')::int)) then raise exception 'Conflito de horário do facilitador.'; end if;
  elsif k in ('observations','fits') then
   keys:=array[d->>'employee'];
   if k='observations' and (length(trim(d->>'text')) not between 1 and 2000 or actual>0) then raise exception 'Observação inválida; histórico não pode ser sobrescrito.'; end if;
   if k='fits' and (d->>'path' is distinct from (d->>'employee')||'/'||rid||'.pdf' or (d->>'fileSize')::int>10485760) then raise exception 'Documento inválido.'; end if;
  elsif k<>'config' then
   select data,employees into parent,keys from conexao_private.records where kind='sessions' and id=d->>'session';
   if parent is null and k<>'actions' then raise exception 'Turma de origem não encontrada.'; end if;
   if parent is null then keys:='{}'; if not public.has_permission('conexao_rh.configurar') then raise exception 'Ações gerais exigem administração do programa.'; end if; end if;
   if k='executions' then
    if rid is distinct from d->>'session' or (d->>'milestone')::int<>(parent->>'milestone')::int or jsonb_typeof(d->'roster')<>'array' then raise exception 'Execução inválida.'; end if;
    if exists(select 1 from jsonb_array_elements(d->'roster') p where not (p->>'key'=any(keys))) then raise exception 'Participante inválido.'; end if;
    if d->>'status'='final' then
     if (d->>'date')::date+(d->>'time')::time+make_interval(mins=>(d->>'duration')::int)>(now() at time zone 'America/Sao_Paulo') then raise exception 'Aguarde o término do encontro.'; end if;
     if jsonb_array_length(d->'roster')<>cardinality(keys) or exists(select 1 from jsonb_array_elements(d->'roster') p where coalesce(p->>'attendance','') not in('presente','faltou')) or not exists(select 1 from jsonb_array_elements(d->'roster') p where p->>'attendance'='presente') or length(trim(d->>'summary'))<1 then raise exception 'Revise presenças e síntese.'; end if;
    end if;
    if actual>0 and prior.data->>'status'='final' and prior.data<>d and length(trim(coalesce(d->>'correctionReason','')))<10 then raise exception 'Informe o motivo da retificação (mínimo 10 caracteres).'; end if;
   end if;
  end if;
  if not conexao_private.allowed_scope(keys) then raise exception 'Colaborador não encontrado ou fora do seu escopo.' using errcode='42501'; end if;
  insert into conexao_private.records(kind,id,data,employees,updated_by) values(k,rid,d,keys,actor)
   on conflict(kind,id) do update set data=excluded.data,employees=excluded.employees,revision=conexao_private.records.revision+1,updated_at=now(),updated_by=actor;
  insert into conexao_private.audit(kind,record_id,previous,current_data,actor) values(k,rid,prior.data,d,actor);
 end loop;
 -- Attendance changes invalidate unused links, including after a correction.
 update conexao_private.nps n set revoked=true where not exists(
  select 1 from conexao_private.records e join conexao_private.records s on s.kind='sessions' and s.id=e.id
  cross join lateral jsonb_array_elements(e.data->'roster') p
  where e.kind='executions' and e.id=n.session_id and e.data->>'status'='final' and s.data->>'cancelled' is null and p->>'key'=n.employee and p->>'attendance'='presente');
 return conexao_private.load_state();
end $$;

create function conexao_private.sync_nps() returns jsonb
language plpgsql security definer set search_path='' as $$
declare r record; token text; secret_key text;
begin
 if auth.uid() is null or not public.has_permission('conexao_rh.acompanhar') then raise exception 'Acesso não autorizado.' using errcode='42501'; end if;
 if public.has_permission('conexao_rh.gerir') then
  select secret into secret_key from conexao_private.secrets;
  for r in select e.id,e.data,p->>'key' employee from conexao_private.records e
    join conexao_private.records s on s.kind='sessions' and s.id=e.id
    cross join lateral jsonb_array_elements(e.data->'roster') p
    where e.kind='executions' and e.data->>'status'='final' and s.data->>'cancelled' is null
    and conexao_private.allowed_scope(e.employees) and p->>'attendance'='presente'
    and (e.data->>'date')::date+(e.data->>'time')::time+make_interval(mins=>(e.data->>'duration')::int)<=(now() at time zone 'America/Sao_Paulo')
  loop
   token:=encode(extensions.gen_random_bytes(32),'hex');
   insert into conexao_private.nps(session_id,employee,milestone,meeting_date,token_hash,token_cipher)
    values(r.id,r.employee,(r.data->>'milestone')::int,(r.data->>'date')::date,encode(extensions.digest(token,'sha256'),'hex'),extensions.pgp_sym_encrypt(token,secret_key))
    on conflict(session_id,employee) do update set revoked=false,meeting_date=excluded.meeting_date;
  end loop;
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'session',n.session_id,'employee',n.employee,'milestone',n.milestone,'date',n.meeting_date,'score',n.score,'comment',n.comment,'respondedAt',n.responded_at,'created',n.created_at,'expiresAt',n.expires_at,'revoked',n.revoked,'token',case when public.has_permission('conexao_rh.gerir') then extensions.pgp_sym_decrypt(n.token_cipher,(select secret from conexao_private.secrets)) end))
 from conexao_private.nps n join conexao_private.records s on s.kind='sessions' and s.id=n.session_id
 where conexao_private.allowed_scope(s.employees)),'[]'::jsonb);
end $$;
create function conexao_private.public_nps(token text,answer integer default null,message text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n conexao_private.nps;
begin
 if token is null or token !~ '^[0-9a-f]{64}$' then raise exception 'Link inválido ou indisponível.'; end if;
 select * into n from conexao_private.nps where token_hash=encode(extensions.digest(token,'sha256'),'hex') for update;
 if n.id is null or n.revoked or n.expires_at<now() then raise exception 'Link inválido ou expirado.'; end if;
 if answer is not null then
  if answer not between 0 and 10 or length(coalesce(message,''))>2000 then raise exception 'Informe uma nota de 0 a 10 e comentário de até 2.000 caracteres.'; end if;
  if n.responded_at is not null then raise exception 'Este encontro já foi avaliado.'; end if;
  update conexao_private.nps set score=answer,comment=nullif(trim(message),''),responded_at=now() where id=n.id;
 end if;
 return jsonb_build_object('milestone',n.milestone,'date',n.meeting_date,'answered',n.responded_at is not null or answer is not null);
end $$;
create function public.conexao_state() returns jsonb language sql security invoker set search_path='' as $$ select conexao_private.load_state() $$;
create function public.conexao_save(changes jsonb) returns jsonb language sql security invoker set search_path='' as $$ select conexao_private.write_records(changes) $$;
create function public.conexao_nps_sync() returns jsonb language sql security invoker set search_path='' as $$ select conexao_private.sync_nps() $$;
create function public.conexao_nps_public(token text,answer integer default null,message text default null) returns jsonb language sql security invoker set search_path='' as $$ select conexao_private.public_nps(token,answer,message) $$;
revoke all on all functions in schema conexao_private from public,anon,authenticated;
revoke all on function public.conexao_state(),public.conexao_save(jsonb),public.conexao_nps_sync(),public.conexao_nps_public(text,integer,text) from public,anon,authenticated;
grant execute on function conexao_private.load_state(),conexao_private.write_records(jsonb),conexao_private.sync_nps() to authenticated;
grant execute on function public.conexao_state(),public.conexao_save(jsonb),public.conexao_nps_sync() to authenticated;
grant execute on function conexao_private.public_nps(text,integer,text),public.conexao_nps_public(text,integer,text) to anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('conexao-fit','conexao-fit',false,10485760,array['application/pdf']);
create function conexao_private.allowed_pdf(path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.has_permission('conexao_rh.documentos') and path ~ '^[0-9]+@[0-9]{4}-[0-9]{2}-[0-9]{2}/[0-9a-f-]{36}\.pdf$' and conexao_private.allowed_employee(split_part(path,'/',1))
$$;
revoke all on function conexao_private.allowed_pdf(text) from public,anon;
grant execute on function conexao_private.allowed_pdf(text) to authenticated;
create policy conexao_fit_read on storage.objects for select to authenticated using(bucket_id='conexao-fit' and conexao_private.allowed_pdf(name));
create policy conexao_fit_insert on storage.objects for insert to authenticated with check(bucket_id='conexao-fit' and conexao_private.allowed_pdf(name));
-- Original PDFs are immutable; replacing a report creates a new version/file.
