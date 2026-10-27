--
-- PostgreSQL database dump
--

\restrict O4xSolTaknfz5rB1gQGeybFvh0XppGdkq2trfh5CsHRaX1ne5dADERP9ASOi6hy

-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: conexao_private; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA conexao_private;


--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA extensions;


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: hub_escopo_t; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.hub_escopo_t AS (
	perfil text,
	unidades text[],
	departamentos text[]
);


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select nullif(current_setting('app.usuario_id', true), '')::uuid
$$;


--
-- Name: allowed_employee(text); Type: FUNCTION; Schema: conexao_private; Owner: -
--

CREATE FUNCTION conexao_private.allowed_employee(k text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select auth.uid() is not null and public.has_permission('conexao_rh.acompanhar') and exists(
 select 1 from public.colaboradores c where c.id::text||'@'||c.data_admissao::text=k
 and c.unidade is not null and public.can_see_escopo(public.hub_escopo(),c.unidade,c.departamento))
$$;


--
-- Name: allowed_pdf(text); Type: FUNCTION; Schema: conexao_private; Owner: -
--

CREATE FUNCTION conexao_private.allowed_pdf(path text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
 select auth.uid() is not null and public.has_permission('conexao_rh.documentos') and path ~ '^[0-9]+@[0-9]{4}-[0-9]{2}-[0-9]{2}/[0-9a-f-]{36}\.pdf$' and conexao_private.allowed_employee(split_part(path,'/',1))
$_$;


--
-- Name: allowed_scope(text[]); Type: FUNCTION; Schema: conexao_private; Owner: -
--

CREATE FUNCTION conexao_private.allowed_scope(keys text[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select auth.uid() is not null and public.has_permission('conexao_rh.acompanhar') and
 not exists(select 1 from unnest(keys) k where not conexao_private.allowed_employee(k))
$$;


--
-- Name: load_state(); Type: FUNCTION; Schema: conexao_private; Owner: -
--

CREATE FUNCTION conexao_private.load_state() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
 if auth.uid() is null or not public.has_permission('conexao_rh.acompanhar') then raise exception 'Acesso ao Conexão RH não autorizado.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('kind',r.kind,'id',r.id,'data',r.data,'revision',r.revision))
 from conexao_private.records r where conexao_private.allowed_scope(r.employees)
 and (r.kind<>'fits' or public.has_permission('conexao_rh.documentos'))
 and (cardinality(r.employees)>0 or r.kind='config' or public.has_permission('conexao_rh.configurar'))),'[]'::jsonb);
end $$;


--
-- Name: public_nps(text, integer, text); Type: FUNCTION; Schema: conexao_private; Owner: -
--

CREATE FUNCTION conexao_private.public_nps(token text, answer integer DEFAULT NULL::integer, message text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
end $_$;


--
-- Name: sync_nps(); Type: FUNCTION; Schema: conexao_private; Owner: -
--

CREATE FUNCTION conexao_private.sync_nps() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: validate_pilot_and_absence(); Type: FUNCTION; Schema: conexao_private; Owner: -
--

CREATE FUNCTION conexao_private.validate_pilot_and_absence() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
 if new.kind='sessions' and coalesce((new.data->>'importedPilot')::boolean,false) and tg_op='INSERT' and not public.has_permission('conexao_rh.configurar') then raise exception 'A importação do piloto exige permissão de configuração.' using errcode='42501'; end if;
 if new.kind='executions' and new.data->>'status'='not-held' then
  if (new.data->>'date')::date+(new.data->>'time')::time+make_interval(mins=>(new.data->>'duration')::int)>(now() at time zone 'America/Sao_Paulo') or exists(select 1 from jsonb_array_elements(new.data->'roster') p where coalesce(p->>'attendance','')<>'faltou') then raise exception 'Para registrar turma não realizada, aguarde o término e registre a ausência de todos.'; end if;
 end if;
 return new;
end $$;


--
-- Name: validate_record(); Type: FUNCTION; Schema: conexao_private; Owner: -
--

CREATE FUNCTION conexao_private.validate_record() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
end $_$;


--
-- Name: write_records(jsonb); Type: FUNCTION; Schema: conexao_private; Owner: -
--

CREATE FUNCTION conexao_private.write_records(changes jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
end $_$;


--
-- Name: admin_truncate(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_truncate(target text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.has_permission('admin.upload') then
    raise exception 'Você não tem permissão para limpar dados de planilha.';
  end if;
  if target not in (
    'colaboradores','feedbacks','one_on_one','celebracoes',
    'entrevista_pesquisa','entrevista_solicitacao','experiencia_candidato',
    'twygo_participantes','twygo_usuarios','twygo_conteudos',
    'avaliacao_experiencia_45','avaliacao_experiencia_90'
  ) then
    raise exception 'Tabela inválida: %', target;
  end if;
  execute format('truncate table public.%I restart identity', target);
end;
$$;


--
-- Name: auth_cadastro_so_autorizado(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auth_cadastro_so_autorizado() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if exists (
    select 1 from public.cadastro_autorizado a
    where lower(trim(a.email)) = lower(trim(new.email)) and a.criado_em > now() - interval '1 day'
  ) then
    delete from public.cadastro_autorizado where lower(trim(email)) = lower(trim(new.email));
    return new;
  end if;
  raise exception 'Cadastro não autorizado: o e-mail precisa ser liberado no Cadastro de Acessos do Hub.';
end;
$$;


--
-- Name: boletim_fechar(date, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.boletim_fechar(p_mes date, p_itens jsonb, p_usuario text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v int;
begin
  if not public.has_permission('admin.upload') then raise exception 'Você não tem permissão para fechar o boletim.'; end if;
  delete from public.boletim_fechamento where mes = p_mes
    and operacao in (select x.operacao from jsonb_to_recordset(p_itens) as x(operacao text));
  insert into public.boletim_fechamento (mes, operacao, dados, fechado_por)
  select p_mes, x.operacao, x.dados, p_usuario
  from jsonb_to_recordset(coalesce(p_itens, '[]'::jsonb)) as x(operacao text, dados jsonb);
  get diagnostics v = row_count;
  return v;
end;
$$;


--
-- Name: boletim_reabrir(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.boletim_reabrir(p_mes date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.has_permission('admin.upload') then raise exception 'Você não tem permissão para reabrir o boletim.'; end if;
  delete from public.boletim_fechamento where mes = p_mes;
end;
$$;


--
-- Name: boletim_resumo_publicado(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.boletim_resumo_publicado(p_profile_id uuid DEFAULT NULL::uuid) RETURNS TABLE(mes date, operacao text, dados jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
#variable_conflict use_column
declare
  v_alvo uuid := auth.uid();
  v_mes date;
  v_ant date;
  v_tudo boolean;
begin
  if p_profile_id is not null and p_profile_id <> auth.uid() and public.has_permission('admin.usuarios') then
    v_alvo := p_profile_id;
  end if;

  select (p.perfil = 'admin')
         or (coalesce(array_length(p.unidades, 1), 0) = 0 and coalesce(array_length(p.departamentos, 1), 0) = 0)
    into v_tudo
  from public.profiles p
  where p.id = v_alvo and coalesce(p.status, 'ativo') = 'ativo';
  if v_tudo is null then
    return; -- sem cadastro ativo no Hub
  end if;

  select max(f.mes) into v_mes from public.boletim_fechamento f;
  if v_mes is null then
    return; -- nenhum mês fechado ainda
  end if;
  v_ant := (date_trunc('month', v_mes) - interval '1 month')::date;

  if v_tudo then
    return query
    select f.mes, f.operacao, f.dados
    from public.boletim_fechamento f
    where date_trunc('month', f.mes) in (date_trunc('month', v_mes), date_trunc('month', v_ant));
    return;
  end if;

  return query
  with base as (
    select f.mes, f.operacao, f.dados,
           coalesce(jsonb_array_length(f.dados -> 'lojas'), 0) as n_lojas,
           coalesce((
             select jsonb_agg(l)
             from jsonb_array_elements(coalesce(f.dados -> 'lojas', '[]'::jsonb)) l
             -- Unidade da loja: tirada do cadastro de Colaboradores (loja sem
             -- ninguém no cadastro fica de fora para quem tem recorte).
             where exists (
               select 1 from public.colaboradores c
               where lower(trim(c.departamento)) = lower(trim(l ->> 'departamento'))
                 and public.can_see_perfil(v_alvo, c.unidade, c.departamento)
             )
           ), '[]'::jsonb) as lojas_ok
    from public.boletim_fechamento f
    where date_trunc('month', f.mes) in (date_trunc('month', v_mes), date_trunc('month', v_ant))
      and f.operacao <> 'empresa'
  )
  select b.mes, b.operacao,
         case when b.n_lojas > 0 and jsonb_array_length(b.lojas_ok) = b.n_lojas
              then b.dados
              else jsonb_build_object('parcial', true, 'lojas', b.lojas_ok)
         end
  from base b
  where jsonb_array_length(b.lojas_ok) > 0;
end;
$$;


--
-- Name: boletim_salvar_eng_notas(date, date, jsonb, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.boletim_salvar_eng_notas(p_inicio date, p_fim date, p_linhas jsonb, p_limpar boolean) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v int;
begin
  if not public.has_permission('admin.upload') then raise exception 'Você não tem permissão para importar planilhas.'; end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio then raise exception 'Período inválido.'; end if;
  if p_limpar then delete from public.engajamento_notas where dia between p_inicio and p_fim; end if;
  insert into public.engajamento_notas (dia, unidade, departamento, dimensao, soma, n, promotores, detratores)
  select x.dia, x.unidade, x.departamento, x.dimensao, x.soma, x.n, coalesce(x.promotores, 0), coalesce(x.detratores, 0)
  from jsonb_to_recordset(coalesce(p_linhas, '[]'::jsonb)) as x(dia date, unidade text, departamento text, dimensao text, soma numeric, n int, promotores int, detratores int)
  where x.dia between p_inicio and p_fim;
  get diagnostics v = row_count;
  return v;
end;
$$;


--
-- Name: boletim_salvar_entrada(date, text, text, text, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.boletim_salvar_entrada(p_mes date, p_operacao text, p_loja text, p_indicador text, p_valor numeric, p_usuario text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.has_permission('admin.upload') then raise exception 'Você não tem permissão para editar o boletim.'; end if;
  -- Mês fechado não aceita edição (reabra o mês para alterar).
  if exists (select 1 from public.boletim_fechamento where mes = p_mes) then
    raise exception 'Este mês está fechado. Reabra o mês para alterar os valores manuais.';
  end if;
  delete from public.boletim_entradas
    where mes = p_mes and operacao = p_operacao and coalesce(loja, '') = coalesce(p_loja, '') and indicador = p_indicador;
  if p_valor is not null then
    insert into public.boletim_entradas (mes, operacao, loja, indicador, valor, atualizado_por)
    values (p_mes, p_operacao, nullif(p_loja, ''), p_indicador, p_valor, p_usuario);
  end if;
end;
$$;


--
-- Name: boletim_salvar_humor(date[], jsonb, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.boletim_salvar_humor(p_meses date[], p_linhas jsonb, p_limpar boolean) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v int;
begin
  if not public.has_permission('admin.upload') then raise exception 'Você não tem permissão para importar planilhas.'; end if;
  if p_limpar then delete from public.humor_mensal where mes = any(p_meses); end if;
  insert into public.humor_mensal (mes, unidade, departamento, registros, soma, pessoas, dist)
  select x.mes, x.unidade, x.departamento, x.registros, x.soma, x.pessoas, coalesce(x.dist, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(p_linhas, '[]'::jsonb)) as x(mes date, unidade text, departamento text, registros int, soma numeric, pessoas int, dist jsonb);
  get diagnostics v = row_count;
  return v;
end;
$$;


--
-- Name: boletim_salvar_satisfacao(date[], jsonb, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.boletim_salvar_satisfacao(p_meses date[], p_linhas jsonb, p_limpar boolean) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v int;
begin
  if not public.has_permission('admin.upload') then raise exception 'Você não tem permissão para importar planilhas.'; end if;
  if p_limpar then delete from public.satisfacao_suporte where pesquisa = any(p_meses); end if;
  insert into public.satisfacao_suporte (pesquisa, unidade, departamento, respondentes, areas)
  select x.pesquisa, x.unidade, x.departamento, x.respondentes, coalesce(x.areas, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(p_linhas, '[]'::jsonb)) as x(pesquisa date, unidade text, departamento text, respondentes int, areas jsonb);
  get diagnostics v = row_count;
  return v;
end;
$$;


--
-- Name: can_see(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_see(row_unidade text, row_departamento text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select case
    when p.perfil = 'admin' then true
    when p.perfil in ('gestor', 'rh') then
      (
        coalesce(array_length(p.unidades, 1), 0) = 0
        or row_unidade is null
        or lower(trim(row_unidade)) in (select lower(trim(u)) from unnest(p.unidades) as u)
      )
      and
      (
        coalesce(array_length(p.departamentos, 1), 0) = 0
        or (row_departamento is not null and lower(trim(row_departamento)) in (select lower(trim(d)) from unnest(p.departamentos) as d))
      )
    else false
  end
  from (select perfil, unidades, departamentos from public.profiles where id = auth.uid() and status = 'ativo') p
$$;


--
-- Name: can_see_escopo(public.hub_escopo_t, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_see_escopo(e public.hub_escopo_t, row_unidade text, row_departamento text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  select case
    when e is null or e.perfil is null then false
    when e.perfil = 'admin' then true
    when e.perfil in ('gestor', 'rh') then
      (coalesce(cardinality(e.unidades), 0) = 0 or row_unidade is null or lower(trim(row_unidade)) = any(e.unidades))
      and
      (coalesce(cardinality(e.departamentos), 0) = 0 or (row_departamento is not null and lower(trim(row_departamento)) = any(e.departamentos)))
    else false
  end
$$;


--
-- Name: can_see_perfil(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_see_perfil(p_profile_id uuid, row_unidade text, row_departamento text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((
    select case
      when p.perfil = 'admin' then true
      when p.perfil in ('gestor', 'rh') then
        (
          coalesce(array_length(p.unidades, 1), 0) = 0
          or row_unidade is null
          or lower(trim(row_unidade)) in (select lower(trim(u)) from unnest(p.unidades) as u)
        )
        and
        (
          coalesce(array_length(p.departamentos, 1), 0) = 0
          or (row_departamento is not null and lower(trim(row_departamento)) in (select lower(trim(d)) from unnest(p.departamentos) as d))
        )
      else false
    end
    from public.profiles p
    where p.id = p_profile_id and coalesce(p.status, 'ativo') = 'ativo'
  ), false)
$$;


--
-- Name: central_atualizacoes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.central_atualizacoes() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare admin_active boolean;result jsonb;begin
 if not public.has_permission('admin.upload') then raise exception 'Sem permissão para consultar as atualizações.' using errcode='42501';end if;
 select exists(select 1 from public.profiles where id=auth.uid() and perfil='admin' and status='ativo') into admin_active;
 if admin_active then
  perform feedz_private.expire_modules();
  update feedz_private.runs set status='failed',finished_at=now(),error='Consulta interrompida; tente novamente.' where status='running' and started_at<now()-interval '10 minutes';
 end if;
 with datasets(tabela,modulo) as (values
  ('colaboradores','colaboradores'),('humor_mensal','humor'),('celebracoes','celebracoes'),('avaliacao_experiencia_45','ave45'),('avaliacao_experiencia_90','ave90'),
  ('feedbacks',null),('one_on_one',null),('twygo_participantes',null),('unibe_pdv',null),('academia_hering',null),('engajamento_pulso',null),('satisfacao_suporte',null),('controle_vagas',null)
 ), writes as (
  select l.tabela,l.created_at momento,case when coalesce(l.arquivo,'') like 'API Feedz · prévia %' then 'feedz' else 'upload' end origem,l.usuario_nome,l.linhas registros
  from public.upload_log l where l.status='ok' and (coalesce(l.arquivo,'') not like 'API Feedz · prévia %' or coalesce(l.linhas,0)>0) and (admin_active or coalesce(l.arquivo,'') not like 'API Feedz · prévia %')
  union all
  select unnest(e.dados),e.finalizado_em,case when e.resumo->>'origem'='correcao_manual' then 'manual' else 'feedz' end,e.usuario_nome,coalesce((e.resumo->>'aplicados')::int,0)
  from feedz_private.events e where admin_active and e.etapa='aplicacao' and e.status='aplicado' and coalesce((e.resumo->>'aplicados')::int,0)+coalesce((e.resumo->>'removidos')::int,0)>0
 ), checks as (
  select distinct on (d.tabela) d.tabela,to_jsonb(e)-ARRAY['usuario_id','run_id'] evento
  from datasets d join feedz_private.events e on d.tabela=any(e.dados) where admin_active and e.etapa='consulta' order by d.tabela,e.iniciado_em desc
 ), runs as (
  select distinct on (j.module) j.module,j.id,j.status,j.started_at,j.config,j.base_hash from feedz_private.module_runs j where admin_active order by j.module,j.started_at desc
 )
 select coalesce(jsonb_agg(jsonb_build_object('tabela',d.tabela,'modulo',case when admin_active then d.modulo end,
  'atualizacao',(select to_jsonb(w)-'tabela' from writes w where w.tabela=d.tabela order by momento desc limit 1),
  'consulta',c.evento,
  'previa',case when d.modulo='colaboradores' then (select jsonb_build_object('id',j.id,'status',j.status,'pendentes',coalesce((j.applied_counts->>'conflitos_preservados')::int,0),'base_changed',j.base_hash<>feedz_private.base_hash(),'expired',j.started_at<now()-interval '24 hours') from feedz_private.runs j where admin_active order by started_at desc limit 1)
   when r.id is not null then jsonb_build_object('id',r.id,'status',r.status,'config',r.config,'base_changed',r.base_hash<>feedz_private.module_hash(r.module),'expired',r.started_at<now()-interval '24 hours') end)
  order by d.tabela),'[]') into result from datasets d left join checks c on c.tabela=d.tabela left join runs r on r.module=d.modulo;
 return jsonb_build_object('admin',admin_active,'dados',result,'horario','America/Sao_Paulo');
end $$;


--
-- Name: conexao_nps_public(text, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.conexao_nps_public(token text, answer integer DEFAULT NULL::integer, message text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$ select conexao_private.public_nps(token,answer,message) $$;


--
-- Name: conexao_nps_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.conexao_nps_sync() RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$ select conexao_private.sync_nps() $$;


--
-- Name: conexao_save(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.conexao_save(changes jsonb) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$ select conexao_private.write_records(changes) $$;


--
-- Name: conexao_state(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.conexao_state() RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$ select conexao_private.load_state() $$;


--
-- Name: controle_desligamento_contato_feedz(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.controle_desligamento_contato_feedz(p_external_id text) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select nullif(trim(matricula), '')
  from public.colaboradores
  where external_id = p_external_id
    and public.has_permission('indicadores.controle_desligamento')
  limit 1
$$;


--
-- Name: controle_desligamento_indicadores(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.controle_desligamento_indicadores() RETURNS TABLE(id_desligamento text, unidade text, departamento text, data_solicitacao date, data_demissao date, tipo text, tipo_desligamento text, motivo text, status_feedz text, status_entrevista text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select c.id_desligamento, c.unidade, c.departamento,
         c.data_solicitacao, c.data_demissao, c.tipo, c.tipo_desligamento,
         c.motivo, c.status_feedz, c.status_entrevista
  from public.controle_desligamento c
  where public.has_permission('indicadores.desligamento')
    and public.can_see(c.unidade, c.departamento)
  order by c.id
$$;


--
-- Name: controle_desligamento_recusado_link(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.controle_desligamento_recusado_link() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: controle_desligamento_respostas_forms(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.controle_desligamento_respostas_forms(p_controle_id bigint) RETURNS TABLE(planilha_id text, data_conclusao date, questionario_antigo boolean, ordem integer, pergunta text, resposta text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: controle_desligamento_respostas_forms_exportar(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.controle_desligamento_respostas_forms_exportar() RETURNS TABLE(controle_id bigint, planilha_id text, data_conclusao date, questionario_antigo boolean, respostas jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select p.controle_id, p.planilha_id, p.data_conclusao, p.planilha_id like 'P30-%',
         public.respostas_sem_dado_pessoal(p.respostas)
  from public.entrevista_pesquisa p
  join public.controle_desligamento c on c.id = p.controle_id
  where not p.repetida
    and public.has_permission('indicadores.controle_desligamento')
    and public.can_see(c.unidade, c.departamento)
  order by p.controle_id, p.data_conclusao, p.planilha_id
$$;


--
-- Name: controle_desligamento_respostas_forms_resumo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.controle_desligamento_respostas_forms_resumo() RETURNS TABLE(controle_id bigint, planilha_id text, data_conclusao date, questionario_antigo boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select p.controle_id, p.planilha_id, p.data_conclusao, p.planilha_id like 'P30-%'
  from public.entrevista_pesquisa p
  join public.controle_desligamento c on c.id = p.controle_id
  where not p.repetida
    and public.has_permission('indicadores.controle_desligamento')
    and public.can_see(c.unidade, c.departamento)
  order by p.controle_id, p.data_conclusao
$$;


--
-- Name: controle_desligamento_sync_link(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.controle_desligamento_sync_link() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: controle_ids_do_link(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.controle_ids_do_link(p_id_desligamento text, p_external_id text, p_nome text) RETURNS bigint[]
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  alvo bigint[];
  v_nome text := public.normaliza_nome(p_nome);
  invalidos constant text[] := array['ID Duplicado', 'Cancelado', 'Cadastro Inexistente'];
begin
  if coalesce(p_id_desligamento, '') <> '' then
    select array_agg(c.id) into alvo from public.controle_desligamento c
    where c.id_desligamento = p_id_desligamento and public.normaliza_nome(c.colaborador_nome) = v_nome
      and coalesce(c.status_feedz, '') <> all (invalidos);
    if alvo is null then
      select array_agg(c.id) into alvo from public.controle_desligamento c
      where c.id_desligamento = p_id_desligamento and public.normaliza_nome(c.colaborador_nome) = v_nome;
    end if;
    if alvo is null then
      select array_agg(c.id) into alvo from public.controle_desligamento c
      where c.id_desligamento = p_id_desligamento and coalesce(c.status_feedz, '') <> all (invalidos);
    end if;
    if alvo is null then
      select array_agg(c.id) into alvo from public.controle_desligamento c where c.id_desligamento = p_id_desligamento;
    end if;
  end if;
  if alvo is null and coalesce(p_external_id, '') <> '' then
    select array_agg(c.id) into alvo from public.controle_desligamento c
    where c.colaborador_external_id = p_external_id and coalesce(c.status_feedz, '') <> all (invalidos);
    if alvo is null then
      select array_agg(c.id) into alvo from public.controle_desligamento c where c.colaborador_external_id = p_external_id;
    end if;
  end if;
  if alvo is null and v_nome <> '' then
    select array_agg(c.id) into alvo from public.controle_desligamento c
    where public.normaliza_nome(c.colaborador_nome) = v_nome
      and coalesce(c.status_feedz, '') <> all (invalidos)
      and c.data_demissao is not distinct from (
        select max(c2.data_demissao) from public.controle_desligamento c2
        where public.normaliza_nome(c2.colaborador_nome) = v_nome
          and coalesce(c2.status_feedz, '') <> all (invalidos));
    if alvo is null then
      select array_agg(c.id) into alvo from public.controle_desligamento c
      where public.normaliza_nome(c.colaborador_nome) = v_nome
        and c.data_demissao is not distinct from (
          select max(c2.data_demissao) from public.controle_desligamento c2
          where public.normaliza_nome(c2.colaborador_nome) = v_nome);
    end if;
  end if;
  return alvo;
end;
$$;


--
-- Name: controle_vagas_salvar(jsonb, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.controle_vagas_salvar(p_linhas jsonb, p_limpar boolean) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v int;
begin
  if not public.has_permission('admin.upload') then raise exception 'Você não tem permissão para importar planilhas.'; end if;
  if p_limpar then truncate table public.controle_vagas restart identity; end if;
  insert into public.controle_vagas (
    linha, data_abertura, data_fechamento, data_inicio, data_cancelamento, data_congelamento, data_retorno,
    dias_congelada, sla_dias_planilha, status_sla_planilha, motivo_sla, unidade, departamento, cargo, sigilosa,
    tipo_vaga, responsavel, status_vaga, natureza, motivo_aumento_quadro, tipo_recrutamento, etapa_vaga, fit, fonte)
  select x.linha, x.data_abertura, x.data_fechamento, x.data_inicio, x.data_cancelamento, x.data_congelamento, x.data_retorno,
         x.dias_congelada, x.sla_dias_planilha, x.status_sla_planilha, x.motivo_sla, x.unidade, x.departamento, x.cargo, coalesce(x.sigilosa, false),
         x.tipo_vaga, x.responsavel, x.status_vaga, x.natureza, x.motivo_aumento_quadro, x.tipo_recrutamento, x.etapa_vaga, x.fit, x.fonte
  from jsonb_to_recordset(coalesce(p_linhas, '[]'::jsonb)) as x(
    linha int, data_abertura date, data_fechamento date, data_inicio date, data_cancelamento date, data_congelamento date, data_retorno date,
    dias_congelada numeric, sla_dias_planilha numeric, status_sla_planilha text, motivo_sla text, unidade text, departamento text, cargo text, sigilosa boolean,
    tipo_vaga text, responsavel text, status_vaga text, natureza text, motivo_aumento_quadro text, tipo_recrutamento text, etapa_vaga text, fit numeric, fonte text);
  get diagnostics v = row_count;
  return v;
end;
$$;


--
-- Name: current_departamentos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_departamentos() RETURNS text[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select departamentos from public.profiles where id = auth.uid()
$$;


--
-- Name: current_role_v(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_role_v() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select perfil from public.profiles where id = auth.uid() and status = 'ativo'
$$;


--
-- Name: current_unidades(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_unidades() RETURNS text[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select unidades from public.profiles where id = auth.uid()
$$;


--
-- Name: engajamento_salvar_base(jsonb, jsonb, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engajamento_salvar_base(p_pulsos jsonb, p_linhas jsonb, p_hoje date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_pulsos int;
  v_linhas int;
begin
  if not public.has_permission('admin.upload') then
    raise exception 'Você não tem permissão para importar planilhas.';
  end if;
  if p_pulsos is null or jsonb_typeof(p_pulsos) <> 'array' or jsonb_array_length(p_pulsos) = 0 then
    raise exception 'Nenhum pulso recebido.';
  end if;

  create temp table _eng_congelado on commit drop as
    select r.pulso_inicio, r.unidade, r.departamento, r.gestor, r.convidados
    from public.engajamento_participacao r
    join public.engajamento_pulso p on p.inicio = r.pulso_inicio
    where p.fim < p_hoje and r.convidados is not null;

  delete from public.engajamento_pulso where true;

  insert into public.engajamento_pulso (inicio, fim, numero, convidados, respondentes, parcial, ultima_resposta, fonte, atualizado_em)
  select x.inicio, x.fim, x.numero, x.convidados, x.respondentes, coalesce(x.parcial, false), x.ultima_resposta, 'base', now()
  from jsonb_to_recordset(p_pulsos) as x(inicio date, fim date, numero int, convidados int, respondentes int, parcial boolean, ultima_resposta timestamp);
  get diagnostics v_pulsos = row_count;

  with n as (
    select * from jsonb_to_recordset(coalesce(p_linhas, '[]'::jsonb))
      as x(pulso_inicio date, unidade text, departamento text, gestor text, convidados int, respondentes int)
    where x.pulso_inicio in (select inicio from public.engajamento_pulso)
  )
  insert into public.engajamento_participacao (pulso_inicio, unidade, departamento, gestor, convidados, respondentes)
  select n.pulso_inicio, n.unidade, n.departamento, n.gestor, n.convidados, coalesce(n.respondentes, 0)
  from n
  where n.pulso_inicio not in (select pulso_inicio from _eng_congelado)
  union all
  select coalesce(nf.pulso_inicio, c.pulso_inicio), coalesce(c.unidade, nf.unidade), coalesce(c.departamento, nf.departamento),
         coalesce(c.gestor, nf.gestor), coalesce(c.convidados, nf.convidados), coalesce(nf.respondentes, 0)
  from (select * from n where n.pulso_inicio in (select pulso_inicio from _eng_congelado)) nf
  full join _eng_congelado c
    on c.pulso_inicio = nf.pulso_inicio
   and lower(trim(c.unidade)) = lower(trim(nf.unidade))
   and lower(trim(c.departamento)) = lower(trim(nf.departamento))
  where coalesce(nf.pulso_inicio, c.pulso_inicio) in (select inicio from public.engajamento_pulso);
  get diagnostics v_linhas = row_count;

  return jsonb_build_object('pulsos', v_pulsos, 'linhas', v_linhas);
end;
$$;


--
-- Name: entrevista_desligamento_publico_get(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.entrevista_desligamento_publico_get(p_token text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  result jsonb;
begin
  if p_token is null or length(p_token) < 16 then
    return null;
  end if;
  select jsonb_build_object(
    'colaboradorNome', colaborador_nome,
    'colaboradorEmail', colaborador_email,
    'unidadeTrabalho', unidade_trabalho,
    'local', local,
    'departamentoForms', departamento_forms,
    'respostas', respostas
  ) into result
  from public.entrevistas_desligamento
  where link_token = p_token and status = 'Pendente'
    and criado_em > now() - interval '30 days';
  return result; -- null = token inválido, já respondido ou vencido
end;
$$;


--
-- Name: entrevista_desligamento_publico_salvar(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.entrevista_desligamento_publico_salvar(p_token text, p_respostas jsonb) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_row public.entrevistas_desligamento%rowtype;
  v_agora timestamptz := now();
begin
  if p_token is null or length(p_token) < 16 then
    raise exception 'Link inválido.';
  end if;
  select * into v_row from public.entrevistas_desligamento
  where link_token = p_token and status = 'Pendente' and criado_em > now() - interval '30 days';
  if not found then
    raise exception 'Este link não é mais válido — a entrevista já foi respondida ou o link venceu (30 dias). Peça um link novo ao RH.';
  end if;
  update public.entrevistas_desligamento set
    respostas = p_respostas, status = 'Preenchido', data_finalizacao = v_agora, atualizado_em = v_agora
  where id = v_row.id;
  return true;
end;
$$;


--
-- Name: entrevistas_desligamento_indicadores(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.entrevistas_desligamento_indicadores() RETURNS TABLE(id text, status text, unidade text, departamento text, data_desligamento date, data_finalizacao timestamp with time zone, criado_em timestamp with time zone, respostas jsonb, tem_desligamento boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select l.id, l.status, l.unidade, l.departamento,
         l.data_desligamento, l.data_finalizacao, l.criado_em,
         case when l.status = 'Preenchido' then l.respostas else '{}'::jsonb end,
         public.controle_ids_do_link(l.id_desligamento, l.colaborador_external_id, l.colaborador_nome) is not null
  from public.entrevistas_desligamento l
  where public.has_permission('indicadores.desligamento')
    and public.can_see(l.unidade, l.departamento)
  order by l.id
$$;


--
-- Name: fechamento_periodo_trava(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fechamento_periodo_trava() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if old.status = 'fechado' and new.status = 'fechado'
     and (new.textos is distinct from old.textos or new.manuais is distinct from old.manuais
          or new.ocultos is distinct from old.ocultos or new.snapshot is distinct from old.snapshot) then
    raise exception 'Este período está fechado. Reabra o período para editar.';
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;


--
-- Name: feedz_apply(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.feedz_apply(p_run uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare job feedz_private.runs; summary jsonb; n integer;
begin
 perform feedz_private.require_admin();
 perform pg_advisory_xact_lock(764224890);
 -- Bloqueia uploads concorrentes durante conferência e aplicação; IDs internos permanecem estáveis.
 lock table public.colaboradores in share row exclusive mode;
 select * into job from feedz_private.runs where id=p_run for update;
 if not found or job.status<>'ready' then raise exception 'Esta prévia não está disponível para aplicação.'; end if;
 if job.started_at<now()-interval '24 hours' then raise exception 'A prévia expirou. Consulte a Feedz novamente.'; end if;
 if job.base_hash is distinct from feedz_private.base_hash() then raise exception 'A base do Hub mudou. Gere uma nova prévia.' using errcode='40001'; end if;
 if exists(select 1 from feedz_private.runs where started_at>job.started_at and status in ('ready','applied')) then raise exception 'Existe uma prévia mais recente.'; end if;
 if exists(select 1 from feedz_private.diff(p_run) where acao='conflito') then raise exception 'Resolva os conflitos antes de aplicar.'; end if;
 select jsonb_build_object('novos',count(*) filter(where acao='novo'),'atualizados',count(*) filter(where acao='atualizar')) into summary from feedz_private.diff(p_run);
 insert into feedz_private.backups(run_id,external_id,previous_row)
 select p_run,d.external_id,to_jsonb(c) from feedz_private.diff(p_run) d left join public.colaboradores c on c.external_id=d.external_id where d.acao in ('novo','atualizar');
 insert into public.colaboradores(external_id,nome,nome_completo,email,cpf,cargo,cargo_visivel,unidade,departamento,grupos,papel,
  gestor_direto,gestor_email,data_nascimento,data_admissao,situacao,origem_cadastro,desligamento_tipo,desligamento_motivo,ultimo_dia_trabalhado)
 select v.external_id,v.nome,v.nome_completo,v.email,v.cpf,v.cargo,v.cargo_visivel,v.unidade,v.departamento,v.grupos,v.papel,
  v.gestor_direto,v.gestor_email,v.data_nascimento,v.data_admissao,v.situacao,v.origem_cadastro,v.desligamento_tipo,v.desligamento_motivo,v.ultimo_dia_trabalhado
 from feedz_private.rows r left join public.colaboradores c on c.external_id=r.external_id
 cross join lateral jsonb_populate_record(null::public.colaboradores,coalesce(to_jsonb(c),'{}')||r.payload) v
 where r.run_id=p_run and r.kind='employee' and exists(select 1 from feedz_private.backups b where b.run_id=p_run and b.external_id=r.external_id)
 on conflict(external_id) do update set
  nome=excluded.nome,nome_completo=excluded.nome_completo,email=excluded.email,cpf=excluded.cpf,cargo=excluded.cargo,cargo_visivel=excluded.cargo_visivel,
  unidade=excluded.unidade,departamento=excluded.departamento,grupos=excluded.grupos,papel=excluded.papel,
  gestor_direto=excluded.gestor_direto,gestor_email=excluded.gestor_email,data_nascimento=excluded.data_nascimento,
  data_admissao=excluded.data_admissao,situacao=excluded.situacao,origem_cadastro=excluded.origem_cadastro,
  desligamento_tipo=excluded.desligamento_tipo,desligamento_motivo=excluded.desligamento_motivo,ultimo_dia_trabalhado=excluded.ultimo_dia_trabalhado,updated_at=now();
 get diagnostics n=row_count;
 update feedz_private.runs set status='applied',applied_at=now(),applied_by=auth.uid(),applied_counts=summary where id=p_run;
 insert into public.upload_log(tabela,arquivo,usuario_id,usuario_nome,linhas,status)
 select 'colaboradores','API Feedz · prévia '||p_run::text,auth.uid(),coalesce(p.nome,p.email),n,'ok' from public.profiles p where p.id=auth.uid();
 return summary;
end $$;


--
-- Name: feedz_apply_logged(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.feedz_apply_logged(p_run uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare result jsonb; message text; person text;
begin
 perform feedz_private.require_admin();
 begin
  result:=public.feedz_apply(p_run);
  return jsonb_build_object('ok',true,'result',result);
 exception when others then
  get stacked diagnostics message=message_text;
  select coalesce(nome,email) into person from public.profiles where id=auth.uid();
  insert into feedz_private.events(run_id,etapa,status,iniciado_em,finalizado_em,usuario_id,usuario_nome,dados,resumo,erro)
  values(p_run,'aplicacao','erro',statement_timestamp(),clock_timestamp(),auth.uid(),coalesce(person,'Administrador'),
   array['colaboradores'],jsonb_build_object('aplicados',0),left(message,500));
  return jsonb_build_object('ok',false,'error',left(message,500));
 end;
end $$;


--
-- Name: feedz_apply_preserving_conflicts(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.feedz_apply_preserving_conflicts(p_run uuid, p_confirm boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare result jsonb;message text;person text;begin
 perform feedz_private.require_admin();
 if p_confirm is distinct from true then raise exception 'Confirme explicitamente a preservação dos registros em conflito.';end if;
 begin
  result:=feedz_private.apply_valid_employees(p_run);
  return jsonb_build_object('ok',true,'result',result);
 exception when others then
  get stacked diagnostics message=message_text;
  if message not in ('Esta prévia não está disponível para aplicação.','A prévia expirou. Consulte a Feedz novamente.','A base do Hub mudou. Gere uma nova prévia.','Existe uma prévia mais recente.','Não há alterações sem conflito para aplicar.') then message:='Não foi possível aplicar. Nenhuma alteração foi mantida.';end if;
  select coalesce(nome,email) into person from public.profiles where id=auth.uid();
  insert into feedz_private.events(run_id,etapa,status,iniciado_em,finalizado_em,usuario_id,usuario_nome,dados,resumo,erro)
  values(p_run,'aplicacao','erro',statement_timestamp(),clock_timestamp(),auth.uid(),coalesce(person,'Administrador'),array['colaboradores'],jsonb_build_object('aplicados',0,'modo','preservar_conflitos'),message);
  return jsonb_build_object('ok',false,'error',message);
 end;
end $$;


--
-- Name: feedz_indicators_apply(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.feedz_indicators_apply(p_run uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare j feedz_private.module_runs;d record;t text;cols text;vals text;eid uuid;person text;added int:=0;updated int:=0;removed int:=0;err text;before_count int;begin
 perform feedz_private.require_admin();
 begin
  perform pg_advisory_xact_lock(764224893);
  select * into j from feedz_private.module_runs where id=p_run for update;if not found or j.status<>'ready' then raise exception 'Prévia indisponível ou já aplicada.';end if;
  t:=feedz_private.module_table(j.module);
  execute format('lock table public.%I in share row exclusive mode',t);
  lock table public.colaboradores in share mode;
  if j.started_at<now()-interval '24 hours' or j.base_hash<>feedz_private.module_hash(j.module) then raise exception 'A prévia expirou ou a base mudou. Consulte novamente.';end if;
  select coalesce(nome,email) into person from public.profiles where id=auth.uid();
  insert into feedz_private.events(run_id,etapa,status,iniciado_em,finalizado_em,usuario_id,usuario_nome,dados,resumo)
   values(p_run,'aplicacao','aplicado',now(),now(),auth.uid(),person,array[t],jsonb_build_object('modulo',j.module,'periodo',j.config)) returning id into eid;
  -- Materialize before changing the underlying base.
  drop table if exists pg_temp.feedz_module_apply_rows;
  create temporary table feedz_module_apply_rows(key text,nome text,acao text,changes jsonb,previous_row jsonb,payload jsonb) on commit drop;
  insert into pg_temp.feedz_module_apply_rows select * from feedz_private.module_diff(p_run);
  insert into feedz_private.module_backups select p_run,key,previous_row from pg_temp.feedz_module_apply_rows where acao<>'igual';
  insert into feedz_private.event_changes select eid,key,nome,case when acao='novo' then 'novo' else 'atualizado' end,changes from pg_temp.feedz_module_apply_rows where acao<>'igual';
  for d in select * from pg_temp.feedz_module_apply_rows loop
   if d.acao='igual' then continue;end if;
   
   select string_agg(format('%I',key),',' order by key),string_agg(format('x.%I',key),',' order by key) into cols,vals from jsonb_object_keys(d.payload)key;
   if d.previous_row is null then
    execute format('insert into public.%I(%s) select %s from jsonb_populate_record(null::public.%I,$1)x',t,cols,vals,t) using d.payload;
   else
    execute format('update public.%I set (%s)=(select %s from jsonb_populate_record(null::public.%I,$1)x) where id=$2',t,cols,vals,t) using d.payload,(d.previous_row->>'id')::bigint;
   end if;
   if d.acao='novo' then added:=added+1;elsif d.acao='atualizar' then updated:=updated+1;end if;
  end loop;
  update feedz_private.module_runs set status='applied',applied_at=now() where id=p_run;
  update feedz_private.events set resumo=resumo||jsonb_build_object('novos',added,'atualizados',updated,'removidos',removed,'aplicados',added+updated,'campos',(select coalesce(jsonb_object_agg(campo,n),'{}') from (select f->>'campo' campo,count(*) n from feedz_private.event_changes c cross join lateral jsonb_array_elements(c.campos)f where c.event_id=eid group by 1)a)) where id=eid;
  if added+updated>0 then insert into public.upload_log(tabela,arquivo,usuario_id,usuario_nome,linhas,status) values(t,'API Feedz · prévia '||p_run,auth.uid(),person,added+updated,'ok');end if;
  return jsonb_build_object('ok',true,'novos',added,'atualizados',updated,'removidos',removed);
 exception when others then
  get stacked diagnostics err=message_text;
  -- Do not expose SQL internals or input payloads through the public error channel.
  if err not in ('Prévia indisponível ou já aplicada.','A prévia expirou ou a base mudou. Consulte novamente.','Mais de um registro do Hub corresponde à mesma chave. Confira o cadastro.') then err:='Não foi possível aplicar a prévia. Nenhuma alteração foi mantida.';end if;
  select * into j from feedz_private.module_runs where id=p_run;
  if found then insert into feedz_private.events(run_id,etapa,status,iniciado_em,finalizado_em,usuario_id,usuario_nome,dados,resumo,erro)
   select p_run,'aplicacao','erro',now(),now(),auth.uid(),coalesce(nome,email),array[feedz_private.module_table(j.module)],jsonb_build_object('modulo',j.module,'aplicados',0),err from public.profiles where id=auth.uid();end if;
  return jsonb_build_object('ok',false,'error',err);
 end;
end $_$;


--
-- Name: feedz_indicators_batch(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.feedz_indicators_batch(p_run uuid, p_rows jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare j feedz_private.module_runs;x jsonb;allowed text[];begin
 select * into j from feedz_private.module_runs where id=p_run and status='running' for update;if not found then raise exception 'Consulta indisponível.';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>250 or octet_length(p_rows::text)>2000000 then raise exception 'Lote inválido.';end if;
 allowed:=case j.module when 'humor' then array['mes','unidade','departamento','registros','soma','pessoas','dist'] when 'celebracoes' then array['codigo','colaborador_enviou','unidade','departamento','papel','cargo_enviou','colaboradores_receberam','cargo_recebeu','mensagem','curtidas','comentarios','data'] else array['ciclo','pessoa_key','nome','cargo','papel','unidade','departamento','gestor_direto','gestor_avaliador','data_admissao','data_avaliacao','data_autoavaliacao','status_gestor','status_auto','martelo','notas_gestor','notas_auto'] end;
 for x in select value from jsonb_array_elements(p_rows) loop
  if nullif(x->>'key','') is null or jsonb_typeof(x->'payload') is distinct from 'object' or exists(select 1 from jsonb_object_keys(x->'payload')k where k<>all(allowed)) then raise exception 'Campo ou chave não autorizados.';end if;
  if j.module='humor' and ((x->'payload'->>'mes')::date<>(j.config->>'start')::date or (x->'payload'->>'registros')::int<1 or (x->'payload'->>'soma')::numeric not between (x->'payload'->>'registros')::numeric and 5*(x->'payload'->>'registros')::numeric) then raise exception 'Agregado de humor inválido.';end if;
  if j.module='celebracoes' and (x->>'key' is distinct from x->'payload'->>'codigo' or (x->'payload'->>'data')::date not between (j.config->>'start')::date and (j.config->>'end')::date) then raise exception 'Celebração inválida.';end if;
  if j.module in ('ave45','ave90') and (x->>'key' is distinct from x->'payload'->>'pessoa_key' or x->'payload'->>'ciclo'<>substring(j.module from 4)) then raise exception 'Ciclo inválido.';end if;
  insert into feedz_private.module_rows values(p_run,x->>'key',x->'payload');
 end loop;
end $$;


--
-- Name: feedz_indicators_begin(uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.feedz_indicators_begin(p_actor uuid, p_module text, p_config jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare r uuid;person text;t text:=feedz_private.module_table(p_module);begin
 perform pg_advisory_xact_lock(764224893);
 if t is null then raise exception 'Módulo inválido.';end if;
 if p_actor is not null and not exists(select 1 from public.profiles where id=p_actor and perfil='admin' and status='ativo') then raise exception 'Administrador ativo necessário.';end if;
 if p_module in ('humor','celebracoes') and (coalesce(p_config->>'start','') !~ '^20[0-9]{2}-[0-9]{2}-01$' or (p_config->>'end')::date<(p_config->>'start')::date or date_trunc('month',(p_config->>'end')::date)<>(p_config->>'start')::date or (p_config->>'end')::date>(now() at time zone 'America/Sao_Paulo')::date) then raise exception 'Período inválido.';end if;
 update feedz_private.module_runs set status='failed',finished_at=now(),error='Consulta interrompida; consulte novamente.' where module=p_module and status='running' and started_at<now()-interval '10 minutes';
 update feedz_private.events e set status='erro',finalizado_em=now(),erro=j.error from feedz_private.module_runs j where e.run_id=j.id and e.etapa='consulta' and e.status='andamento' and j.status='failed';
 if exists(select 1 from feedz_private.module_runs where module=p_module and status='running') then raise exception 'Já existe uma consulta deste módulo em andamento.';end if;
 insert into feedz_private.module_runs(actor,module,config,base_hash) values(p_actor,p_module,p_config,feedz_private.module_hash(p_module)) returning id into r;
 select coalesce(nome,email) into person from public.profiles where id=p_actor;
 insert into feedz_private.events(run_id,etapa,status,iniciado_em,usuario_id,usuario_nome,dados,resumo)
 values(r,'consulta','andamento',now(),p_actor,coalesce(person,'Agendamento automático'),array[t],jsonb_build_object('modulo',p_module,'periodo',p_config,'aplicados',0));
 delete from feedz_private.module_runs where started_at<now()-interval '30 days' and status<>'running';
 return r;
end $_$;


--
-- Name: feedz_indicators_finish(uuid, jsonb, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.feedz_indicators_finish(p_run uuid, p_counts jsonb, p_warnings jsonb, p_error text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare j feedz_private.module_runs;s jsonb;n int;begin
 select * into j from feedz_private.module_runs where id=p_run and status='running' for update;if not found then raise exception 'Consulta indisponível.';end if;
 if p_error is null then
  select count(*) into n from feedz_private.module_rows where run_id=p_run;
  if n=0 or n is distinct from (p_counts->>'linhas')::int then raise exception 'Consulta vazia ou incompleta. Base preservada.';end if;
  select jsonb_build_object('novos',count(*) filter(where acao='novo'),'alteracoes',count(*) filter(where acao='atualizar'),'iguais',count(*) filter(where acao='igual'),'conflitos',0) into s from feedz_private.module_diff(p_run);
 end if;
 update feedz_private.module_runs set status=case when p_error is null then 'ready' else 'failed' end,finished_at=now(),counts=p_counts,warnings=p_warnings,error=left(p_error,500) where id=p_run;
 update feedz_private.events set status=case when p_error is null then 'previa' else 'erro' end,finalizado_em=now(),erro=left(p_error,500),
 resumo=resumo||jsonb_build_object('consultados',p_counts,'comparacao',coalesce(s,'{}'),'avisos',p_warnings) where run_id=p_run and etapa='consulta';
end $$;


--
-- Name: feedz_indicators_lookup(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.feedz_indicators_lookup() RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select coalesce(jsonb_object_agg(external_id,payload),'{}') from (
  select distinct on (external_id) external_id,payload from (
   select c.external_id,jsonb_build_object('nome_completo',coalesce(c.nome_completo,c.nome),'cargo',c.cargo,'papel',c.papel,'unidade',c.unidade,'departamento',c.departamento,'data_admissao',c.data_admissao) payload,1 priority
    from public.colaboradores c where c.external_id is not null
   union all
   select x.external_id,x.payload-ARRAY['cpf','email','gestor_email','data_nascimento'],2 from feedz_private.rows x
    where x.kind='employee' and x.run_id=(select id from feedz_private.runs where status in ('ready','applied') order by started_at desc limit 1)
  ) a order by external_id,priority
 ) b
$$;


--
-- Name: feedz_indicators_review(text, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.feedz_indicators_review(p_module text, p_run uuid DEFAULT NULL::uuid, p_offset integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare j feedz_private.module_runs;s jsonb;page jsonb;changed boolean;kept int:=0;fields jsonb;t text;begin
 perform feedz_private.require_admin();
 if p_run is null then select * into j from feedz_private.module_runs where module=p_module order by started_at desc limit 1;else select * into j from feedz_private.module_runs where id=p_run and module=p_module;end if;
 if j.id is null then return jsonb_build_object('run',null);end if;
 if j.status='running' and j.started_at<now()-interval '10 minutes' then perform public.feedz_indicators_finish(j.id,'{}','[]','Consulta interrompida; consulte novamente.');select * into j from feedz_private.module_runs where id=j.id;end if;
 changed:=j.base_hash<>feedz_private.module_hash(j.module);
 if j.status='ready' then
  with diffs as materialized(select * from feedz_private.module_diff(j.id))
  select jsonb_build_object('novos',count(*) filter(where acao='novo'),'atualizar',count(*) filter(where acao='atualizar'),'iguais',count(*) filter(where acao='igual')),
   (select coalesce(jsonb_agg(to_jsonb(d)-'payload'-'previous_row'),'[]') from (select * from diffs where acao<>'igual' order by key offset greatest(0,p_offset) limit 25)d),
   (select coalesce(jsonb_object_agg(campo,n),'{}') from (select f->>'campo' campo,count(*) n from diffs cross join lateral jsonb_array_elements(changes)f where acao<>'igual' group by 1)a)
  into s,page,fields from diffs;
  if j.module='humor' then select count(*) into kept from public.humor_mensal h where mes=(j.config->>'start')::date and not exists(select 1 from feedz_private.module_rows x where x.run_id=j.id and coalesce(x.payload->>'unidade','')=coalesce(h.unidade,'') and coalesce(x.payload->>'departamento','')=coalesce(h.departamento,''));end if;
  if j.module='celebracoes' then select count(*) into kept from public.celebracoes h where data between (j.config->>'start')::date and (j.config->>'end')::date and not exists(select 1 from feedz_private.module_rows x where x.run_id=j.id and x.key=h.codigo and (x.payload->>'data')::date=h.data);end if;
 end if;
 return jsonb_build_object('run',to_jsonb(j)-'base_hash'-'actor','summary',s,'rows',coalesce(page,'[]'),'campos',coalesce(fields,'{}'),'preservados',kept,'removidos',0,'base_changed',changed,'expired',j.started_at<now()-interval '24 hours','modo','incremental');
end $$;


--
-- Name: feedz_review(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.feedz_review(p_run uuid DEFAULT NULL::uuid, p_offset integer DEFAULT 0, p_limit integer DEFAULT 25) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare job feedz_private.runs; summary jsonb; page jsonb; last_applied timestamptz;
begin
 perform feedz_private.require_admin();
 if p_run is null then select * into job from feedz_private.runs order by started_at desc limit 1;
 else select * into job from feedz_private.runs where id=p_run; end if;
 select max(applied_at) into last_applied from feedz_private.runs;
 if job.id is null then return jsonb_build_object('run',null,'last_applied',last_applied); end if;
 if job.status='running' and job.started_at<now()-interval '10 minutes' then
  update feedz_private.runs set status='failed',finished_at=now(),error='Consulta interrompida; tente novamente.' where id=job.id returning * into job;
 end if;
 select jsonb_build_object('novos',count(*) filter(where acao='novo'),'atualizar',count(*) filter(where acao='atualizar'),
  'iguais',count(*) filter(where acao='igual'),'conflitos',count(*) filter(where acao='conflito')) into summary from feedz_private.diff(job.id);
 select coalesce(jsonb_agg(to_jsonb(d)),'[]') into page from (
  select * from feedz_private.diff(job.id) where acao<>'igual' order by case acao when 'conflito' then 0 else 1 end,external_id
  offset greatest(0,p_offset) limit least(100,greatest(1,p_limit))
 ) d;
 return jsonb_build_object('run',jsonb_build_object('id',job.id,'status',job.status,'started_at',job.started_at,'finished_at',job.finished_at,
  'applied_at',job.applied_at,'counts',job.counts,'warnings',job.warnings,'error',job.error,'applied_counts',job.applied_counts),
  'summary',summary,'rows',page,'last_applied',last_applied,
  'base_changed',job.base_hash is distinct from feedz_private.base_hash(),'expired',job.started_at<now()-interval '24 hours',
  'preservados',(select count(*) from public.colaboradores c where not exists(select 1 from feedz_private.rows r where r.run_id=job.id and r.kind='employee' and r.external_id=c.external_id)));
end $$;


--
-- Name: feedz_review_actionable(uuid, integer, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.feedz_review_actionable(p_run uuid DEFAULT NULL::uuid, p_offset integer DEFAULT 0, p_limit integer DEFAULT 25, p_filter text DEFAULT 'changes'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare result jsonb;r uuid;page jsonb;fields jsonb;total int;last_update jsonb;begin
 perform feedz_private.require_admin();
 if p_filter not in ('changes','conflicts','all') then raise exception 'Filtro inválido.';end if;
 result:=public.feedz_review(p_run,0,1);
 r:=(result->'run'->>'id')::uuid;
 if r is not null then
  with diffs as materialized(select * from feedz_private.diff(r)),filtered as(select * from diffs where p_filter='all' or (p_filter='changes' and acao in ('novo','atualizar')) or (p_filter='conflicts' and acao='conflito'))
  select (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from(select * from filtered where acao<>'igual' order by external_id offset greatest(0,p_offset) limit least(100,greatest(1,p_limit)))d),
   (select count(*) from filtered where acao<>'igual'),
   (select coalesce(jsonb_object_agg(campo,n),'{}') from(select f->>'campo' campo,count(*)n from diffs cross join lateral jsonb_array_elements(changes)f where acao in ('novo','atualizar') group by 1)x)
   into page,total,fields;
 end if;
 select jsonb_build_object('momento',created_at,'origem',case when coalesce(arquivo,'') like 'API Feedz · prévia %' then 'API Feedz' else 'Planilha' end,'registros',linhas)
 into last_update from public.upload_log where tabela='colaboradores' and status='ok' and (coalesce(arquivo,'') not like 'API Feedz · prévia %' or coalesce(linhas,0)>0) order by created_at desc limit 1;
 select value into last_update from (select last_update value,(last_update->>'momento')::timestamptz momento union all select jsonb_build_object('momento',e.finalizado_em,'origem','Correção manual','registros',(e.resumo->>'aplicados')::int),e.finalizado_em from feedz_private.events e where e.resumo->>'origem'='correcao_manual' and e.etapa='aplicacao' and e.status='aplicado' and 'colaboradores'=any(e.dados)) updates order by momento desc nulls last limit 1;
 return result||jsonb_build_object('rows',coalesce(page,'[]'),'filtered_total',coalesce(total,0),'campos',coalesce(fields,'{}'),'filter',p_filter,'last_update',last_update);
end $$;


--
-- Name: feedz_sync_batch(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.feedz_sync_batch(p_run uuid, p_rows jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare item jsonb;
begin
 perform 1 from feedz_private.runs where id=p_run and status='running' for update;
 if not found then raise exception 'Consulta indisponível.'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>500 then raise exception 'Lote inválido.'; end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  if item->>'kind'='employee' and exists(select 1 from jsonb_object_keys(item->'payload') k where k not in (
   'external_id','nome','nome_completo','email','cpf','cargo','cargo_visivel','unidade','departamento','grupos','papel',
   'gestor_direto','gestor_email','data_nascimento','data_admissao','situacao','origem_cadastro',
   'desligamento_tipo','desligamento_motivo','ultimo_dia_trabalhado')) then raise exception 'Campo não autorizado.'; end if;
  if item->>'external_id' !~ '^[1-9][0-9]*$' or jsonb_typeof(item->'payload')<>'object' then raise exception 'Registro inválido.'; end if;
  insert into feedz_private.rows(run_id,kind,external_id,payload,issue) values(p_run,item->>'kind',item->>'external_id',item->'payload',left(item->>'issue',300));
 end loop;
end $_$;


--
-- Name: feedz_sync_begin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.feedz_sync_begin(p_actor uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare result uuid;
begin
 perform pg_advisory_xact_lock(764224890);
 update feedz_private.runs set status='failed',finished_at=now(),error='Consulta interrompida; tente novamente.'
  where status='running' and started_at<now()-interval '10 minutes';
 if exists(select 1 from feedz_private.runs where status='running') then raise exception 'Já há uma consulta em andamento.'; end if;
 if p_actor is not null and not exists(select 1 from public.profiles where id=p_actor and perfil='admin' and status='ativo')
  then raise exception 'Administrador ativo necessário.' using errcode='42501'; end if;
 insert into feedz_private.runs(actor,base_hash) values(p_actor,feedz_private.base_hash()) returning id into result;
 -- Prévia expira em 24h; retenção de 30 dias para auditoria e cópia anterior à aplicação.
 delete from feedz_private.runs where started_at<now()-interval '30 days' and status<>'running';
 return result;
end $$;


--
-- Name: feedz_sync_finish(uuid, jsonb, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.feedz_sync_finish(p_run uuid, p_counts jsonb, p_warnings jsonb, p_error text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare n integer;
begin
 perform 1 from feedz_private.runs where id=p_run and status='running' for update;
 if not found then raise exception 'Consulta indisponível.'; end if;
 if p_error is null then
  select count(*) into n from feedz_private.rows where run_id=p_run and kind='employee';
  if n=0 or n is distinct from (p_counts->>'employees')::int then raise exception 'Consulta incompleta.'; end if;
  if exists(select 1 from feedz_private.rows where run_id=p_run and kind='employee' and (
   payload->>'external_id' is distinct from external_id or nullif(payload->>'nome_completo','') is null
   or coalesce(payload->>'situacao','') not in ('Ativo','Desativado','Desligado','Importado','Visitante'))) then raise exception 'Cadastro inválido.'; end if;
 end if;
 update feedz_private.runs set status=case when p_error is null then 'ready' else 'failed' end,
  finished_at=now(),counts=coalesce(p_counts,'{}'),warnings=coalesce(p_warnings,'[]'),error=left(p_error,500) where id=p_run;
end $$;


--
-- Name: feedz_worker_secrets(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.feedz_worker_secrets() RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select jsonb_build_object(
  'api_token',(select decrypted_secret from vault.decrypted_secrets where name='FEEDZ_API_TOKEN'),
  'job_token',(select decrypted_secret from vault.decrypted_secrets where name='FEEDZ_SYNC_JOB_TOKEN'))
$$;


--
-- Name: has_permission(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_permission(perm text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(
    (select perfil = 'admin' or coalesce((permissoes ->> perm)::boolean, false)
     from public.profiles where id = auth.uid() and status = 'ativo'),
    false
  )
$$;


--
-- Name: historico_atualizacao_detalhes(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.historico_atualizacao_detalhes(p_event_id uuid, p_offset integer DEFAULT 0, p_limit integer DEFAULT 50) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare result jsonb;
begin
 perform feedz_private.require_admin();
 if not exists(select 1 from feedz_private.events where id=p_event_id) then raise exception 'Registro não encontrado.'; end if;
 select jsonb_build_object('evento',(select to_jsonb(e)-'usuario_id' from feedz_private.events e where e.id=p_event_id),
  'total',(select count(*) from feedz_private.event_changes where event_id=p_event_id),
  'alteracoes',coalesce((select jsonb_agg(to_jsonb(c)-'event_id') from (
   select * from feedz_private.event_changes where event_id=p_event_id order by external_id
   offset greatest(0,p_offset) limit least(100,greatest(1,p_limit))
  ) c),'[]'::jsonb)) into result;
 return result;
end $$;


--
-- Name: historico_atualizacoes(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.historico_atualizacoes(p_limit integer DEFAULT 300) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare admin_active boolean; result jsonb;
begin
 if not public.has_permission('admin.upload') then raise exception 'Sem permissão para consultar o histórico.' using errcode='42501'; end if;
 select exists(select 1 from public.profiles where id=auth.uid() and perfil='admin' and status='ativo') into admin_active;
 if admin_active then perform feedz_private.expire_modules();
  update feedz_private.runs set status='failed',finished_at=now(),error='Consulta interrompida; tente novamente.'
   where status='running' and started_at<now()-interval '10 minutes';
 end if;
 select coalesce(jsonb_agg(to_jsonb(items) order by iniciado_em desc,id),'[]') into result from (
  select 'upload:'||l.id::text id,'upload'::text origem,'upload'::text etapa,
   case when l.status='ok' then 'sucesso' else 'erro' end status,
   l.created_at iniciado_em,l.created_at finalizado_em,l.usuario_nome,
   array[l.tabela] dados,l.arquivo,
   jsonb_build_object('aplicados',coalesce(l.linhas,0)) resumo,l.erro,false detalhes
  from public.upload_log l where coalesce(l.arquivo,'') not like 'API Feedz · prévia %'
  union all
  select 'feedz:'||e.id::text,case when e.resumo->>'origem'='correcao_manual' then 'manual' else 'feedz' end,e.etapa,e.status,e.iniciado_em,e.finalizado_em,e.usuario_nome,
   e.dados,null,e.resumo,e.erro,true
  from feedz_private.events e where admin_active
  order by iniciado_em desc,id limit least(1000,greatest(1,p_limit))
 ) items;
 return result;
end $$;


--
-- Name: hub_escopo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hub_escopo() RETURNS public.hub_escopo_t
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select row(
    p.perfil,
    coalesce((select array_agg(lower(trim(u))) from unnest(p.unidades) u), '{}'),
    coalesce((select array_agg(lower(trim(d))) from unnest(p.departamentos) d), '{}')
  )::public.hub_escopo_t
  from public.profiles p
  where p.id = auth.uid() and p.status = 'ativo'
$$;


--
-- Name: hub_marca_alteracao(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hub_marca_alteracao() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.hub_alterado_em := now();
  return new;
end;
$$;


--
-- Name: hub_versao_soma(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hub_versao_soma() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.hub_versoes (tabela, versao, alterado_em)
  values (tg_table_name, 1, now())
  on conflict (tabela) do update set versao = public.hub_versoes.versao + 1, alterado_em = now();
  return null;
end;
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select public.current_role_v() = 'admin'
$$;


--
-- Name: normaliza_nome(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normaliza_nome(p text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select trim(regexp_replace(
    translate(lower(coalesce(p, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
    '\s+', ' ', 'g'))
$$;


--
-- Name: organograma_meu_galho(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.organograma_meu_galho(p_target_profile_id uuid DEFAULT NULL::uuid) RETURNS TABLE(external_id text, nome text, nome_completo text, cargo text, departamento text, unidade text, gestor_direto text, situacao text, grupos text, data_admissao date, relacao text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
#variable_conflict use_column
declare
  v_ext text;
  v_email text;
  v_me bigint;
  v_profile_id uuid := auth.uid();
begin
  if p_target_profile_id is not null and p_target_profile_id <> auth.uid()
     and public.has_permission('admin.usuarios')
     and (public.has_permission('indicadores.organograma') or public.has_permission('indicadores.headcount')) then
    v_profile_id := p_target_profile_id;
  end if;

  -- Qualquer usuário do Hub (com profile) pode pedir o PRÓPRIO galho: além do
  -- Organograma, ele define o recorte do Headcount e dos números de headcount
  -- do Dashboard (que todo usuário vê) para quem não tem a visão completa.
  if not exists (select 1 from public.profiles p where p.id = v_profile_id) then
    raise exception 'Usuário sem cadastro no Hub.';
  end if;

  select nullif(trim(p.colaborador_external_id), ''), lower(trim(p.email))
    into v_ext, v_email
  from public.profiles p where p.id = v_profile_id;

  if v_ext is not null then
    select c.id into v_me from public.colaboradores c
    where c.external_id = v_ext
    order by (lower(c.situacao) = 'ativo') desc, c.id limit 1;
  end if;
  if v_me is null and v_email is not null and v_email <> '' then
    select c.id into v_me from public.colaboradores c
    where lower(trim(c.email)) = v_email
    order by (lower(c.situacao) = 'ativo') desc, c.id limit 1;
  end if;
  if v_me is null then
    return; -- login sem colaborador vinculado: a tela explica o que fazer
  end if;

  return query
  with recursive
  -- "Gestor Direto" do Feedz guarda o NOME do gestor: liga pelo nome (ou nome completo).
  abaixo(cid, nivel) as (
    select v_me, 0
    union
    select f.id, a.nivel + 1
    from abaixo a
    join public.colaboradores g on g.id = a.cid
    join public.colaboradores f
      on f.id <> g.id
     and nullif(trim(f.gestor_direto), '') is not null
     and lower(trim(f.gestor_direto)) in (lower(trim(g.nome)), lower(trim(g.nome_completo)))
    where a.nivel < 30
  ),
  acima(cid, nivel) as (
    select v_me, 0
    union
    select (
      select g.id from public.colaboradores g
      where lower(trim(g.nome)) = lower(trim(c.gestor_direto))
         or lower(trim(g.nome_completo)) = lower(trim(c.gestor_direto))
      order by (lower(g.situacao) = 'ativo') desc,
               (lower(trim(g.nome)) = lower(trim(c.gestor_direto))) desc,
               g.id
      limit 1
    ), a.nivel + 1
    from acima a
    join public.colaboradores c on c.id = a.cid
    where a.nivel < 30 and nullif(trim(c.gestor_direto), '') is not null
  ),
  sel as (
    select distinct on (x.cid) x.cid, x.rel
    from (
      select v_me as cid, 'eu' as rel, 0 as ord
      union all select b.cid, 'abaixo', 1 from abaixo b where b.nivel > 0
      union all select s.cid, 'acima', 2 from acima s where s.nivel > 0 and s.cid is not null
    ) x
    order by x.cid, x.ord
  )
  -- Da liderança acima só sai o necessário para desenhar o caminho: nada de
  -- cotas, afastamentos ou datas.
  select c.external_id, c.nome, c.nome_completo, c.cargo,
         c.departamento, c.unidade, c.gestor_direto, c.situacao,
         case when s.rel = 'acima' then null else c.grupos end,
         case when s.rel = 'acima' then null else c.data_admissao end,
         s.rel
  from sel s
  join public.colaboradores c on c.id = s.cid;
end;
$$;


--
-- Name: parecer_publico_get(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.parecer_publico_get(p_token text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  result jsonb;
begin
  if p_token is null or length(p_token) < 16 then
    return null;
  end if;
  select jsonb_build_object(
    'candidatoNome', pg.candidato_nome,
    'cargo', pg.cargo,
    'modelo', pg.modelo,
    'recrutador', pg.recrutador,
    'dados', pg.dados,
    'observacoesCandidato', c.observacoes
  ) into result
  from public.pareceres_gestor pg
  left join public.candidatos c on c.id = pg.candidato_id
  where pg.link_token = p_token and pg.status = 'Pendente';
  return result; -- null = token inválido, já usado ou expirado (nunca existiu)
end;
$$;


--
-- Name: parecer_publico_salvar(text, jsonb, integer, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.parecer_publico_salvar(p_token text, p_dados jsonb, p_nivel_recomendacao integer, p_parecer_final text, p_justificativa text, p_preenchido_por text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_parecer public.pareceres_gestor%rowtype;
  v_resultado text;
  v_agora timestamptz := now();
begin
  if p_token is null or length(p_token) < 16 then
    raise exception 'Link inválido.';
  end if;
  select * into v_parecer from public.pareceres_gestor where link_token = p_token and status = 'Pendente';
  if not found then
    raise exception 'Este link não é mais válido — o parecer já foi preenchido ou o link expirou.';
  end if;

  -- Mesmo mapeamento de resultadoGestorDoParecer em js/sections/parecer-gestor.js
  if p_parecer_final = 'Aprovado(a) - Banco de Talentos' then v_resultado := 'Banco de Talentos';
  elsif p_parecer_final = 'Reprovado(a) - Não avançar no processo' then v_resultado := 'Reprovado';
  else v_resultado := 'Aprovado';
  end if;

  update public.pareceres_gestor set
    status = 'Preenchido', dados = p_dados, nivel_recomendacao = p_nivel_recomendacao,
    parecer_final = p_parecer_final, justificativa = p_justificativa,
    preenchido_por = p_preenchido_por, data_finalizacao = v_agora, atualizado_em = v_agora
  where id = v_parecer.id;

  if v_parecer.candidato_id is not null then
    update public.candidatos set
      resultado_gestor = v_resultado, etapa_gestor_status = 'Concluída',
      data_entrevista_gestor = v_agora::date, atualizado_em = v_agora
    where id = v_parecer.candidato_id;
  end if;

  return true;
end;
$$;


--
-- Name: profiles_bloqueia_edicao_desligado(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.profiles_bloqueia_edicao_desligado() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if old.status = 'desligado' and new.status = 'desligado' then
    raise exception 'Usuário desligado não pode ser editado. Reative o acesso primeiro.';
  end if;
  return new;
end $$;


--
-- Name: profiles_protege_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.profiles_protege_admin() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_admin boolean;
  v_novas jsonb;
  v_antigas jsonb;
begin
  if auth.uid() is null then
    return coalesce(new, old); -- SQL Editor / serviço do Supabase
  end if;
  select (p.perfil = 'admin') into v_admin from public.profiles p where p.id = auth.uid() and p.status = 'ativo';
  if coalesce(v_admin, false) then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.perfil = 'admin' then raise exception 'Só um Administrador pode excluir o cadastro de outro Administrador.'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.perfil = 'admin' then
    raise exception 'Só um Administrador pode alterar o cadastro de outro Administrador.';
  end if;
  if new.perfil = 'admin' then
    raise exception 'Só um Administrador pode dar o perfil Administrador.';
  end if;
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_novas
    from jsonb_each(coalesce(new.permissoes, '{}'::jsonb)) e where e.key like 'admin.%' and e.value = 'true'::jsonb;
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_antigas
      from jsonb_each(coalesce(old.permissoes, '{}'::jsonb)) e where e.key like 'admin.%' and e.value = 'true'::jsonb;
  else
    v_antigas := '{}'::jsonb;
  end if;
  if v_novas is distinct from v_antigas then
    raise exception 'Só um Administrador pode conceder ou retirar permissões da Administração (Upload, Cadastros, Cadastro de Acessos, Log de Acessos).';
  end if;
  return new;
end;
$$;


--
-- Name: registrar_acesso(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_acesso(p_evento text, p_modulo text DEFAULT NULL::text, p_dispositivo text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is null or p_evento not in ('login', 'sessao', 'logout', 'modulo') then
    return;
  end if;
  insert into public.acesso_log (usuario_id, usuario_nome, usuario_email, perfil, evento, modulo, dispositivo)
  select p.id, p.nome, p.email, p.perfil, p_evento, left(p_modulo, 60), left(p_dispositivo, 20)
  from public.profiles p
  where p.id = auth.uid();
  -- Limpeza dos registros antigos, de vez em quando (≈1 a cada 50 entradas).
  if p_evento in ('login', 'sessao') and random() < 0.02 then
    delete from public.acesso_log where criado_em < now() - interval '180 days';
  end if;
end;
$$;


--
-- Name: respostas_sem_dado_pessoal(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.respostas_sem_dado_pessoal(p jsonb) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    AS $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  from jsonb_each(coalesce(p, '{}'::jsonb)) as e
  where not (
    lower(trim(e.key)) in ('nome', 'email', 'seu nome completo', 'seu e-mail')
    or lower(trim(e.key)) like 'seu telefone%'
    or lower(trim(e.key)) like 'digite seu cpf%'
  )
$$;


--
-- Name: satisfacao_chave(date, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.satisfacao_chave(p_pesquisa date, p_unidade text, p_departamento text, p_area text, p_comentario text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select md5(
    (extract(year from p_pesquisa)::int * 100 + extract(month from p_pesquisa)::int)::text
    || chr(1) || coalesce(p_unidade, '') || chr(1) || coalesce(p_departamento, '')
    || chr(1) || coalesce(p_area, '') || chr(1) || coalesce(p_comentario, ''))
$$;


--
-- Name: satisfacao_dados(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.satisfacao_dados() RETURNS TABLE(ord bigint, pesquisa date, area text, nota numeric, melhorar text[], extra text, comentario text, unidade text, departamento text, chave text, triagem text, loja_liberada text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_areas text[];
  v_completo boolean;
begin
  if not public.has_permission('indicadores.satisfacao') and not public.has_permission('indicadores.satisfacao_completo') then
    raise exception 'Você não tem permissão para ver a Pesquisa de Satisfação.';
  end if;
  v_completo := public.has_permission('indicadores.satisfacao_completo');
  v_areas := public.satisfacao_minhas_areas();
  return query
    select row_number() over (order by r.pesquisa, r.area, r.nota, r.comentario, r.id) as ord,
           r.pesquisa, r.area, r.nota, r.melhorar, r.extra,
           case when v_completo or t.acao is null or t.acao = 'loja' then r.comentario end,
           case when v_completo then r.unidade end,
           case when v_completo then r.departamento end,
           case when v_completo and r.comentario is not null then public.satisfacao_chave(r.pesquisa, r.unidade, r.departamento, r.area, r.comentario) end,
           case when v_completo then t.acao end,
           case when not v_completo and t.acao = 'loja' then coalesce(r.departamento, r.unidade) end
      from public.satisfacao_respostas r
      left join public.satisfacao_triagem t
        on r.comentario is not null
       and t.chave = public.satisfacao_chave(r.pesquisa, r.unidade, r.departamento, r.area, r.comentario)
     where (v_areas is null or lower(r.area) in (select lower(a) from unnest(v_areas) as a))
       and (not v_completo or public.can_see(r.unidade, r.departamento));
end;
$$;


--
-- Name: satisfacao_minhas_areas(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.satisfacao_minhas_areas() RETURNS text[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select case
    when public.has_permission('indicadores.satisfacao_completo') then null
    else coalesce((select p.satisfacao_areas from public.profiles p where p.id = auth.uid()), '{}')
  end
$$;


--
-- Name: satisfacao_salvar(date[], jsonb, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.satisfacao_salvar(p_meses date[], p_linhas jsonb, p_limpar boolean) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v int;
begin
  if not public.has_permission('admin.upload') then raise exception 'Você não tem permissão para importar planilhas.'; end if;
  if p_limpar then delete from public.satisfacao_respostas where pesquisa = any(p_meses); end if;
  insert into public.satisfacao_respostas (pesquisa, unidade, departamento, area, nota, melhorar, extra, comentario)
  select x.pesquisa, x.unidade, x.departamento, x.area, x.nota, coalesce(x.melhorar, '{}'), x.extra, x.comentario
  from jsonb_to_recordset(coalesce(p_linhas, '[]'::jsonb))
    as x(pesquisa date, unidade text, departamento text, area text, nota numeric, melhorar text[], extra text, comentario text);
  get diagnostics v = row_count;
  return v;
end;
$$;


--
-- Name: satisfacao_salvar_ciclos(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.satisfacao_salvar_ciclos(p_ciclos jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v int;
begin
  if not public.has_permission('admin.upload') then raise exception 'Você não tem permissão para importar planilhas.'; end if;
  insert into public.satisfacao_ciclo (pesquisa, respondentes, aptos, areas, atualizado_em)
  select x.pesquisa, x.respondentes, x.aptos, coalesce(x.areas, '{}'), now()
  from jsonb_to_recordset(coalesce(p_ciclos, '[]'::jsonb)) as x(pesquisa date, respondentes int, aptos int, areas text[])
  on conflict (pesquisa) do update
    set respondentes = excluded.respondentes,
        aptos = coalesce(excluded.aptos, public.satisfacao_ciclo.aptos),
        areas = excluded.areas,
        atualizado_em = now();
  get diagnostics v = row_count;
  return v;
end;
$$;


--
-- Name: satisfacao_triar(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.satisfacao_triar(p_chave text, p_acao text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_acao text := nullif(btrim(coalesce(p_acao, '')), '');
  v_pesquisa date;
  v_area text;
begin
  if not public.has_permission('indicadores.satisfacao_completo') then
    raise exception 'Só quem tem a visão completa da Pesquisa de Satisfação pode fazer a triagem dos comentários.';
  end if;
  if v_acao is not null and v_acao not in ('ocultar', 'individual', 'loja') then
    raise exception 'Marca de triagem inválida: %', v_acao;
  end if;
  if v_acao is null then
    delete from public.satisfacao_triagem where chave = p_chave;
    return null;
  end if;
  -- A chave precisa ser de um comentário que a pessoa pode ver.
  select r.pesquisa, r.area into v_pesquisa, v_area
    from public.satisfacao_respostas r
   where r.comentario is not null
     and public.satisfacao_chave(r.pesquisa, r.unidade, r.departamento, r.area, r.comentario) = p_chave
     and public.can_see(r.unidade, r.departamento)
   limit 1;
  if v_pesquisa is null then raise exception 'Comentário não encontrado (a planilha pode ter sido reenviada). Atualize os dados e tente de novo.'; end if;
  insert into public.satisfacao_triagem (chave, pesquisa, area, acao, atualizado_por, atualizado_em)
  values (p_chave, v_pesquisa, v_area, v_acao, auth.uid(), now())
  on conflict (chave) do update set acao = excluded.acao, atualizado_por = excluded.atualizado_por, atualizado_em = now();
  return v_acao;
end;
$$;


--
-- Name: treinamento_mes_fechado(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.treinamento_mes_fechado(p_data date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.fechamento_periodo f
    where f.status = 'fechado'
      and f.ano = extract(year from p_data)::int
      and extract(month from p_data)::int between
          (f.n - 1) * (case f.tipo when 'mensal' then 1 when 'bimestral' then 2 when 'semestral' then 6 else 12 end) + 1
      and f.n * (case f.tipo when 'mensal' then 1 when 'bimestral' then 2 when 'semestral' then 6 else 12 end)
  );
$$;


--
-- Name: treinamento_meses_fechados(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.treinamento_meses_fechados() RETURNS text[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(array_agg(distinct to_char(make_date(f.ano, m, 1), 'YYYY-MM')), '{}')
  from public.fechamento_periodo f
  cross join lateral generate_series(
    (f.n - 1) * (case f.tipo when 'mensal' then 1 when 'bimestral' then 2 when 'semestral' then 6 else 12 end) + 1,
    f.n * (case f.tipo when 'mensal' then 1 when 'bimestral' then 2 when 'semestral' then 6 else 12 end)) as m
  where f.status = 'fechado';
$$;


--
-- Name: treinamento_salvar_turmas(text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.treinamento_salvar_turmas(p_planilha text, p_arquivo text, p_linhas jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v int;
begin
  if not public.has_permission('admin.upload') then raise exception 'Você não tem permissão para importar planilhas.'; end if;
  if coalesce(trim(p_planilha), '') = '' then raise exception 'Não consegui identificar a multiplicadora da planilha.'; end if;
  delete from public.treinamento_turmas where planilha = p_planilha and origem = 'planilha';
  insert into public.treinamento_turmas (planilha, arquivo, linha, data, tema, tema_original, categoria, modalidade, local, hora_inicio, hora_fim, horas,
    publico, marcas, marca_original, canal, convocados, presentes, multiplicadoras, multiplicador_original, alertas)
  select p_planilha, p_arquivo, x.linha, x.data, x.tema, x.tema_original, x.categoria, x.modalidade, x.local, x.hora_inicio, x.hora_fim, x.horas,
    x.publico, coalesce(x.marcas, '{}'), x.marca_original, x.canal, x.convocados, x.presentes, coalesce(x.multiplicadoras, '{}'), x.multiplicador_original, coalesce(x.alertas, '{}')
  from jsonb_to_recordset(coalesce(p_linhas, '[]'::jsonb)) as x(linha int, data date, tema text, tema_original text, categoria text, modalidade text, local text,
    hora_inicio text, hora_fim text, horas numeric, publico text, marcas text[], marca_original text, canal text, convocados int, presentes int,
    multiplicadoras text[], multiplicador_original text, alertas text[])
  where x.data is not null and x.tema is not null;
  get diagnostics v = row_count;
  return v;
end;
$$;


--
-- Name: treinamento_turma_excluir(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.treinamento_turma_excluir(p_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.has_permission('treinamento_dev.turmas_gestor') then
    raise exception 'Só o gestor de T&D pode excluir turmas. Peça a exclusão a ele(a).';
  end if;
  delete from public.treinamento_turmas where id = p_id;
  if not found then raise exception 'Turma não encontrada.'; end if;
end;
$$;


--
-- Name: treinamento_turma_gestao(bigint, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.treinamento_turma_gestao(p_id bigint, p_acao text, p_comentario text, p_usuario text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_coment text := nullif(trim(coalesce(p_comentario, '')), '');
begin
  if not public.has_permission('treinamento_dev.turmas_gestor') then raise exception 'Só o gestor de T&D pode fazer isso.'; end if;
  if p_acao in ('devolver', 'pedir_ajuste') and v_coment is null then raise exception 'Escreva o que a multiplicadora precisa ajustar.'; end if;
  if p_acao = 'validar' then
    update public.treinamento_turmas set validacao = 'validada', validado_por = p_usuario, validado_em = now() where id = p_id and justificativa is not null;
  elsif p_acao = 'devolver' then
    update public.treinamento_turmas set validacao = 'devolvida', validado_por = p_usuario, validado_em = now(), gestor_comentario = v_coment where id = p_id;
  elsif p_acao = 'pedir_ajuste' then
    update public.treinamento_turmas set ajuste_pedido = true, ajuste_pedido_por = p_usuario, ajuste_pedido_em = now(), gestor_comentario = v_coment where id = p_id;
  elsif p_acao = 'cancelar_ajuste' then
    update public.treinamento_turmas set ajuste_pedido = false where id = p_id;
  else
    raise exception 'Ação inválida: %', p_acao;
  end if;
  if not found then raise exception 'Turma não encontrada.'; end if;
end;
$$;


--
-- Name: treinamento_turma_justificar(bigint, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.treinamento_turma_justificar(p_id bigint, p_texto text, p_usuario text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_dono uuid;
  v_gestor boolean := public.has_permission('treinamento_dev.turmas_gestor');
  v_texto text := nullif(trim(coalesce(p_texto, '')), '');
begin
  select criado_por into v_dono from public.treinamento_turmas where id = p_id;
  if not found then raise exception 'Turma não encontrada.'; end if;
  if not (v_gestor or (public.has_permission('treinamento_dev.turmas_lancar') and v_dono = auth.uid())) then
    raise exception 'Você só pode justificar as turmas que lançou.';
  end if;
  update public.treinamento_turmas
  set justificativa = v_texto,
      justificado_em = case when v_texto is null then null else now() end,
      justificado_por = case when v_texto is null then null else p_usuario end,
      validacao = case when v_texto is null then null when v_gestor then 'validada' else 'pendente' end,
      validado_por = case when v_gestor and v_texto is not null then p_usuario else validado_por end,
      validado_em = case when v_gestor and v_texto is not null then now() else validado_em end,
      ajuste_pedido = case when v_gestor then ajuste_pedido else false end
  where id = p_id;
end;
$$;


--
-- Name: treinamento_turma_salvar(bigint, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.treinamento_turma_salvar(p_id bigint, p_dados jsonb) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_gestor boolean := public.has_permission('treinamento_dev.turmas_gestor');
  v_lanca boolean := public.has_permission('treinamento_dev.turmas_lancar');
  v_id bigint;
  v_dono uuid;
  v_origem text;
  v_data_ant date;
  v_just_ant text;
  d jsonb := coalesce(p_dados, '{}'::jsonb);
  v_data date := nullif(d->>'data', '')::date;
  v_just text := nullif(trim(coalesce(d->>'justificativa', '')), '');
begin
  if not (v_gestor or v_lanca) then raise exception 'Você não tem permissão para lançar turmas (acesso somente leitura).'; end if;
  if v_data is null or nullif(trim(d->>'tema'), '') is null then raise exception 'Informe a data e o tema da turma.'; end if;
  if coalesce((d->>'horas')::numeric, 0) <= 0 then raise exception 'Informe a duração da turma (horário de início e fim).'; end if;
  if nullif(d->>'hora_inicio', '') is not null and nullif(d->>'hora_fim', '') is not null and (d->>'hora_fim') <= (d->>'hora_inicio') then
    raise exception 'O horário de fim precisa ser depois do início.';
  end if;
  if coalesce((d->>'presentes')::int, 0) > coalesce((d->>'convocados')::int, 0) and v_just is null then
    raise exception 'Vieram mais pessoas que as convocadas: explique o motivo no campo Justificativa.';
  end if;
  if not v_gestor and public.treinamento_mes_fechado(v_data) then
    raise exception 'Este mês já foi fechado no Fechamento do Período: só o gestor de T&D pode lançar ou alterar turmas dele.';
  end if;

  if p_id is not null then
    select criado_por, origem, data, justificativa into v_dono, v_origem, v_data_ant, v_just_ant from public.treinamento_turmas where id = p_id;
    if not found then raise exception 'Turma não encontrada.'; end if;
    if not v_gestor and v_dono is distinct from auth.uid() then raise exception 'Você só pode editar as turmas que lançou.'; end if;
    if not v_gestor and public.treinamento_mes_fechado(v_data_ant) then
      raise exception 'Este mês já foi fechado no Fechamento do Período: peça a alteração ao gestor de T&D (a justificativa continua liberada).';
    end if;
    update public.treinamento_turmas set
      planilha = coalesce(nullif(d->>'planilha', ''), planilha), data = v_data, tema = d->>'tema',
      categoria = d->>'categoria', modalidade = d->>'modalidade', local = d->>'local', hora_inicio = d->>'hora_inicio', hora_fim = d->>'hora_fim',
      horas = (d->>'horas')::numeric, publico = d->>'publico',
      marcas = coalesce(array(select jsonb_array_elements_text(d->'marcas')), '{}'), marca_original = d->>'marca_original', canal = d->>'canal',
      convocados = (d->>'convocados')::int, presentes = (d->>'presentes')::int,
      multiplicadoras = coalesce(array(select jsonb_array_elements_text(d->'multiplicadoras')), '{}'), multiplicador_original = d->>'multiplicador_original',
      observacao = nullif(d->>'observacao', ''), alertas = '{}', atualizado_em = now(), atualizado_por = d->>'usuario',
      justificativa = v_just,
      justificado_em = case when v_just is distinct from v_just_ant then case when v_just is null then null else now() end else justificado_em end,
      justificado_por = case when v_just is distinct from v_just_ant then case when v_just is null then null else d->>'usuario' end else justificado_por end,
      -- A multiplicadora mexeu: o ajuste pedido foi atendido e a justificativa volta para validação.
      -- O gestor que escreve a justificativa já a dá por validada.
      ajuste_pedido = case when v_gestor then ajuste_pedido else false end,
      validacao = case when v_just is null then null
                       when v_gestor then case when v_just is distinct from v_just_ant then 'validada' else validacao end
                       else 'pendente' end,
      validado_por = case when v_gestor and v_just is distinct from v_just_ant and v_just is not null then d->>'usuario' else validado_por end,
      validado_em = case when v_gestor and v_just is distinct from v_just_ant and v_just is not null then now() else validado_em end
    where id = p_id;
    return p_id;
  end if;

  insert into public.treinamento_turmas (origem, planilha, arquivo, data, tema, tema_original, categoria, modalidade, local, hora_inicio, hora_fim, horas,
    publico, marcas, marca_original, canal, convocados, presentes, multiplicadoras, multiplicador_original, observacao, alertas, criado_por, criado_por_nome,
    justificativa, justificado_em, justificado_por, validacao)
  values ('hub', coalesce(nullif(d->>'planilha', ''), d->>'usuario'), null, v_data, d->>'tema', d->>'tema', d->>'categoria', d->>'modalidade', d->>'local',
    d->>'hora_inicio', d->>'hora_fim', (d->>'horas')::numeric, d->>'publico',
    coalesce(array(select jsonb_array_elements_text(d->'marcas')), '{}'), d->>'marca_original', d->>'canal', (d->>'convocados')::int, (d->>'presentes')::int,
    coalesce(array(select jsonb_array_elements_text(d->'multiplicadoras')), '{}'), d->>'multiplicador_original', nullif(d->>'observacao', ''), '{}', auth.uid(), d->>'usuario',
    v_just, case when v_just is null then null else now() end, case when v_just is null then null else d->>'usuario' end,
    case when v_just is null then null when v_gestor then 'validada' else 'pendente' end)
  returning id into v_id;
  return v_id;
end;
$$;


--
-- Name: treinamento_turmas_registrar(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.treinamento_turmas_registrar() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_nome text;
begin
  select nome into v_nome from public.profiles where id = auth.uid();
  insert into public.treinamento_turmas_log (turma_id, acao, usuario_id, usuario_nome, antes, depois)
  values (coalesce(new.id, old.id),
          case tg_op when 'INSERT' then 'inclusão' when 'UPDATE' then 'alteração' else 'exclusão' end,
          auth.uid(), v_nome,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end;
$$;


--
-- Name: treinamentos_salvar_academia(date, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.treinamentos_salvar_academia(p_mes date, p_linhas jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v int;
begin
  if not public.has_permission('admin.upload') then raise exception 'Você não tem permissão para importar planilhas.'; end if;
  if p_mes is null then raise exception 'Informe o mês de referência.'; end if;
  p_mes := date_trunc('month', p_mes)::date;
  delete from public.academia_hering where mes = p_mes;
  insert into public.academia_hering (mes, nome, cargo, loja, ultimo_acesso, horas, performance, unidade, departamento, no_cadastro, nome_cadastro)
  select p_mes, x.nome, x.cargo, x.loja, x.ultimo_acesso, x.horas, x.performance, x.unidade, x.departamento, coalesce(x.no_cadastro, false), x.nome_cadastro
  from jsonb_to_recordset(coalesce(p_linhas, '[]'::jsonb)) as x(nome text, cargo text, loja text, ultimo_acesso date, horas numeric, performance numeric, unidade text, departamento text, no_cadastro boolean, nome_cadastro text)
  where x.nome is not null;
  get diagnostics v = row_count;
  return v;
end;
$$;


--
-- Name: treinamentos_salvar_unibe(date, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.treinamentos_salvar_unibe(p_mes date, p_pdvs jsonb, p_pessoas jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v int;
begin
  if not public.has_permission('admin.upload') then raise exception 'Você não tem permissão para importar planilhas.'; end if;
  if p_mes is null then raise exception 'Informe o mês de referência.'; end if;
  p_mes := date_trunc('month', p_mes)::date;
  delete from public.unibe_pdv where mes = p_mes;
  delete from public.unibe_pessoas where mes = p_mes;
  insert into public.unibe_pdv (mes, pdv, nome_pdv, regiao, segmento, gerente, supervisao, multi, adesao, pessoas, unidade, departamento)
  select p_mes, x.pdv, x.nome_pdv, x.regiao, x.segmento, x.gerente, x.supervisao, x.multi, x.adesao, x.pessoas, x.unidade, x.departamento
  from jsonb_to_recordset(coalesce(p_pdvs, '[]'::jsonb)) as x(pdv text, nome_pdv text, regiao text, segmento text, gerente text, supervisao text, multi text, adesao numeric, pessoas int, unidade text, departamento text)
  where x.pdv is not null;
  get diagnostics v = row_count;
  insert into public.unibe_pessoas (mes, nome, cargo, pdv, nome_pdv, regiao, segmento, adesao, unidade, departamento, no_cadastro, nome_cadastro)
  select p_mes, x.nome, x.cargo, x.pdv, x.nome_pdv, x.regiao, x.segmento, x.adesao, x.unidade, x.departamento, coalesce(x.no_cadastro, false), x.nome_cadastro
  from jsonb_to_recordset(coalesce(p_pessoas, '[]'::jsonb)) as x(nome text, cargo text, pdv text, nome_pdv text, regiao text, segmento text, adesao numeric, unidade text, departamento text, no_cadastro boolean, nome_cadastro text)
  where x.nome is not null;
  return v;
end;
$$;


--
-- Name: treinamentos_ve_escritorio(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.treinamentos_ve_escritorio() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'ativo'
      and exists (select 1 from unnest(p.unidades) as u where lower(trim(u)) in ('escritório', 'escritorio'))
  )
$$;


--
-- Name: vida_humor_norm(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vida_humor_norm(value text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    SET search_path TO ''
    AS $$
  select regexp_replace(trim(translate(lower(value),
    'áàâãäéèêëíìîïóòôõöúùûüçñýÿ', 'aaaaaeeeeiiiiooooouuuucnyy')), '\s+', ' ', 'g')
$$;


--
-- Name: vida_importar_humor(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vida_importar_humor(p_linhas jsonb) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$
with cadastro as materialized (
  select distinct external_id,data_admissao,ultimo_dia_trabalhado,
    lpad(regexp_replace(cpf,'\D','','g'),11,'0') cpf,
    public.vida_humor_norm(coalesce(nullif(nome_completo,''),nome)) nome,
    public.vida_humor_norm(unidade) unidade,public.vida_humor_norm(departamento) departamento
  from public.colaboradores where nullif(trim(external_id),'') is not null
), raw as materialized (
  select nullif(regexp_replace(coalesce(g->>'cpf',''),'\D','','g'),'') cpf,
    public.vida_humor_norm(g->>'nome') nome,
    g->>'unidade' unidade, g->>'departamento' departamento,
    public.vida_humor_norm(g->>'unidade') unidade_norm,
    public.vida_humor_norm(g->>'departamento') departamento_norm,
    (r->>0)::timestamp without time zone momento, (r->>1)::smallint nota
  from jsonb_array_elements(p_linhas) g
  cross join lateral jsonb_array_elements(g->'registros') r
), source as materialized (
  select distinct md5(coalesce(cpf,nome||'|'||public.vida_humor_norm(unidade)||'|'||public.vida_humor_norm(departamento))
      ||'|'||to_char(momento,'YYYY-MM-DD"T"HH24:MI:SS')) chave, * from raw
  where nota between 1 and 5 and momento::date <= (now() at time zone 'America/Sao_Paulo')::date
), candidates as (
  select distinct s.chave,c.external_id,c.data_admissao
  from source s join cadastro c on
    s.momento::date >= c.data_admissao
    and (c.ultimo_dia_trabalhado is null or s.momento::date <= c.ultimo_dia_trabalhado)
    and (case when s.cpf is not null then c.cpf=s.cpf else
      s.nome=c.nome and s.unidade_norm=c.unidade and s.departamento_norm=c.departamento end)
), matched as (
  select chave,min(external_id) external_id,min(data_admissao) data_admissao,count(*) n
  from candidates group by chave
), inserted as (
  insert into public.humor_individual
    (chave,colaborador_external_id,data_admissao,dia,momento,nota,unidade,departamento,pareamento)
  select s.chave,m.external_id,m.data_admissao,s.momento::date,s.momento,s.nota,s.unidade,s.departamento,
    case when s.cpf is not null then 'cpf' else 'nome_local' end
  from source s join matched m using(chave) where m.n=1
  on conflict (chave) do nothing returning chave
)
select jsonb_build_object('recebidos',(select count(*) from source),
  'pareados',(select count(*) from matched where n=1),
  'ambiguos',(select count(*) from matched where n>1),
  'sem_vinculo',(select count(*) from source s where not exists(select 1 from matched m where m.chave=s.chave)),
  'inseridos',(select count(*) from inserted))
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit; Type: TABLE; Schema: conexao_private; Owner: -
--

CREATE TABLE conexao_private.audit (
    id bigint NOT NULL,
    kind text NOT NULL,
    record_id text NOT NULL,
    previous jsonb,
    current_data jsonb NOT NULL,
    actor uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_id_seq; Type: SEQUENCE; Schema: conexao_private; Owner: -
--

ALTER TABLE conexao_private.audit ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME conexao_private.audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: nps; Type: TABLE; Schema: conexao_private; Owner: -
--

CREATE TABLE conexao_private.nps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id text NOT NULL,
    employee text NOT NULL,
    milestone integer NOT NULL,
    meeting_date date NOT NULL,
    token_hash text NOT NULL,
    token_cipher bytea NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '90 days'::interval) NOT NULL,
    revoked boolean DEFAULT false NOT NULL,
    score integer,
    comment text,
    responded_at timestamp with time zone,
    CONSTRAINT nps_score_check CHECK (((score >= 0) AND (score <= 10)))
);


--
-- Name: records; Type: TABLE; Schema: conexao_private; Owner: -
--

CREATE TABLE conexao_private.records (
    kind text NOT NULL,
    id text NOT NULL,
    data jsonb NOT NULL,
    employees text[] DEFAULT '{}'::text[] NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid NOT NULL,
    CONSTRAINT records_data_check CHECK ((jsonb_typeof(data) = 'object'::text)),
    CONSTRAINT records_kind_check CHECK ((kind = ANY (ARRAY['config'::text, 'sessions'::text, 'events'::text, 'executions'::text, 'reports'::text, 'committees'::text, 'actions'::text, 'observations'::text, 'fits'::text])))
);


--
-- Name: secrets; Type: TABLE; Schema: conexao_private; Owner: -
--

CREATE TABLE conexao_private.secrets (
    id boolean DEFAULT true NOT NULL,
    secret text NOT NULL,
    CONSTRAINT secrets_id_check CHECK (id)
);


--
-- Name: academia_hering; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.academia_hering (
    id bigint NOT NULL,
    mes date NOT NULL,
    nome text NOT NULL,
    cargo text,
    loja text,
    ultimo_acesso date,
    horas numeric,
    performance numeric,
    unidade text,
    departamento text,
    no_cadastro boolean DEFAULT false NOT NULL,
    nome_cadastro text
);


--
-- Name: academia_hering_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.academia_hering_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: academia_hering_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.academia_hering_id_seq OWNED BY public.academia_hering.id;


--
-- Name: acesso_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.acesso_log (
    id bigint NOT NULL,
    usuario_id uuid NOT NULL,
    usuario_nome text,
    usuario_email text,
    perfil text,
    evento text NOT NULL,
    modulo text,
    dispositivo text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT acesso_log_evento_check CHECK ((evento = ANY (ARRAY['login'::text, 'sessao'::text, 'logout'::text, 'modulo'::text])))
);


--
-- Name: acesso_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.acesso_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.acesso_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: avaliacao_experiencia_45; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.avaliacao_experiencia_45 (
    id bigint NOT NULL,
    ciclo smallint NOT NULL,
    pessoa_key text,
    cpf text,
    matricula text,
    nome text,
    cargo text,
    papel text,
    unidade text,
    departamento text,
    gestor text,
    gestor_direto text,
    gestor_avaliador text,
    data_admissao date,
    data_avaliacao date,
    data_autoavaliacao date,
    status_gestor text,
    status_auto text,
    martelo smallint,
    martelo_comentario text,
    notas_gestor jsonb DEFAULT '{}'::jsonb NOT NULL,
    notas_auto jsonb DEFAULT '{}'::jsonb NOT NULL,
    comentarios_gestor jsonb DEFAULT '{}'::jsonb NOT NULL,
    comentarios_auto jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT avaliacao_experiencia_45_martelo_check CHECK (((martelo >= 1) AND (martelo <= 4)))
);


--
-- Name: avaliacao_experiencia_45_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.avaliacao_experiencia_45_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: avaliacao_experiencia_45_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.avaliacao_experiencia_45_id_seq OWNED BY public.avaliacao_experiencia_45.id;


--
-- Name: avaliacao_experiencia_90; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.avaliacao_experiencia_90 (
    id bigint NOT NULL,
    ciclo smallint NOT NULL,
    pessoa_key text,
    cpf text,
    matricula text,
    nome text,
    cargo text,
    papel text,
    unidade text,
    departamento text,
    gestor text,
    gestor_direto text,
    gestor_avaliador text,
    data_admissao date,
    data_avaliacao date,
    data_autoavaliacao date,
    status_gestor text,
    status_auto text,
    martelo smallint,
    martelo_comentario text,
    notas_gestor jsonb DEFAULT '{}'::jsonb NOT NULL,
    notas_auto jsonb DEFAULT '{}'::jsonb NOT NULL,
    comentarios_gestor jsonb DEFAULT '{}'::jsonb NOT NULL,
    comentarios_auto jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT avaliacao_experiencia_90_martelo_check CHECK (((martelo >= 1) AND (martelo <= 4)))
);


--
-- Name: avaliacao_experiencia_90_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.avaliacao_experiencia_90_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: avaliacao_experiencia_90_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.avaliacao_experiencia_90_id_seq OWNED BY public.avaliacao_experiencia_90.id;


--
-- Name: boletim_entradas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.boletim_entradas (
    id bigint NOT NULL,
    mes date NOT NULL,
    operacao text NOT NULL,
    loja text,
    indicador text NOT NULL,
    valor numeric NOT NULL,
    atualizado_por text,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: boletim_entradas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.boletim_entradas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: boletim_entradas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.boletim_entradas_id_seq OWNED BY public.boletim_entradas.id;


--
-- Name: boletim_fechamento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.boletim_fechamento (
    id bigint NOT NULL,
    mes date NOT NULL,
    operacao text NOT NULL,
    dados jsonb NOT NULL,
    fechado_por text,
    fechado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: boletim_fechamento_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.boletim_fechamento_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: boletim_fechamento_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.boletim_fechamento_id_seq OWNED BY public.boletim_fechamento.id;


--
-- Name: cadastro_autorizado; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cadastro_autorizado (
    email text NOT NULL,
    autorizado_por uuid DEFAULT auth.uid(),
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: candidatos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.candidatos (
    id text NOT NULL,
    vaga_id text,
    nome text,
    email text,
    contato text,
    linkedin text,
    cargo text,
    marca text,
    departamento text,
    nivel_vaga text,
    entrevistado_por text,
    data_entrevista date,
    horario_entrevista text,
    fit_pct numeric,
    etapa_rh_status text,
    resultado_rh text,
    data_contato_rh date,
    data_agendada_rh date,
    motivo_reprovacao text,
    etapa_analise_status text,
    resultado_analise text,
    data_contato_analise date,
    data_agendada_analise date,
    motivo_analise text,
    data_analise date,
    etapa_checagem_status text,
    resultado_checagem text,
    data_contato_checagem date,
    data_agendada_checagem date,
    motivo_checagem text,
    data_checagem date,
    teste_pratico text,
    data_teste_pratico date,
    etapa_gestor_status text,
    resultado_gestor text,
    data_contato_gestor date,
    data_agendada_gestor date,
    entrevista_gestor text,
    data_entrevista_gestor date,
    horario_gestor text,
    entrevista_diretoria text,
    data_entrevista_diretoria date,
    resultado_final text,
    resultado text,
    data_fechamento date,
    fonte_captacao text,
    data_admissao date,
    observacoes text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    atualizado_por text,
    segmento_ultima_empresa text,
    genero text,
    faixa_etaria text,
    distancia_km numeric,
    escolaridade text,
    estuda text,
    turno_estudo text,
    cargos_possiveis text[] DEFAULT '{}'::text[] NOT NULL,
    link_pandape text,
    estado_civil text,
    tem_filhos text,
    quantidade_filhos integer,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    tipo_transporte text,
    quantidade_passagens integer,
    valor_total_transporte numeric,
    unidade text,
    hub_alterado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cargos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cargos (
    id bigint NOT NULL,
    nome text NOT NULL,
    ativo boolean DEFAULT true NOT NULL
);


--
-- Name: cargos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cargos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cargos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cargos_id_seq OWNED BY public.cargos.id;


--
-- Name: celebracoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.celebracoes (
    id bigint NOT NULL,
    codigo text,
    colaborador_enviou text,
    unidade text,
    departamento text,
    papel text,
    cargo_enviou text,
    colaboradores_receberam text,
    cargo_recebeu text,
    mensagem text,
    curtidas integer,
    comentarios integer,
    data date
);


--
-- Name: celebracoes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.celebracoes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: celebracoes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.celebracoes_id_seq OWNED BY public.celebracoes.id;


--
-- Name: colaboradores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.colaboradores (
    id bigint NOT NULL,
    external_id text,
    nome text,
    nome_completo text,
    matricula text,
    email text,
    cpf text,
    cargo text,
    cargo_visivel text,
    unidade text,
    departamento text,
    grupos text,
    papel text,
    gestor_direto text,
    gestor_email text,
    etnia text,
    sexo text,
    genero text,
    data_nascimento date,
    data_admissao date,
    data_cadastro date,
    situacao text,
    ultimo_acesso date,
    origem_cadastro text,
    participa_gamificacao text,
    desligamento_tipo text,
    desligamento_motivo text,
    ultimo_dia_trabalhado date,
    idioma text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: colaboradores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.colaboradores_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: colaboradores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.colaboradores_id_seq OWNED BY public.colaboradores.id;


--
-- Name: controle_desligamento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.controle_desligamento (
    id bigint NOT NULL,
    id_desligamento text NOT NULL,
    data_solicitacao date,
    solicitante text,
    colaborador_external_id text,
    colaborador_nome text NOT NULL,
    colaborador_cpf text,
    contato text,
    cargo text,
    unidade text,
    departamento text,
    data_admissao date,
    data_demissao date,
    tipo text,
    tipo_desligamento text,
    motivo text,
    status_feedz text,
    status_entrevista text,
    data_realizacao date,
    observacoes text,
    extra_natal boolean DEFAULT false NOT NULL,
    criado_por text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_por text,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    motivo_detalhe text
);


--
-- Name: controle_desligamento_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.controle_desligamento_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: controle_desligamento_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.controle_desligamento_id_seq OWNED BY public.controle_desligamento.id;


--
-- Name: controle_vagas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.controle_vagas (
    id bigint NOT NULL,
    linha integer,
    data_abertura date NOT NULL,
    data_fechamento date,
    data_inicio date,
    data_cancelamento date,
    data_congelamento date,
    data_retorno date,
    dias_congelada numeric,
    sla_dias_planilha numeric,
    status_sla_planilha text,
    motivo_sla text,
    unidade text,
    departamento text,
    cargo text,
    sigilosa boolean DEFAULT false NOT NULL,
    tipo_vaga text,
    responsavel text,
    status_vaga text,
    natureza text,
    motivo_aumento_quadro text,
    tipo_recrutamento text,
    etapa_vaga text,
    fit numeric,
    fonte text,
    importado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: controle_vagas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.controle_vagas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: controle_vagas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.controle_vagas_id_seq OWNED BY public.controle_vagas.id;


--
-- Name: desempenho_regras_relatorio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desempenho_regras_relatorio (
    tabela text,
    regra text,
    antes text,
    depois text,
    em timestamp with time zone DEFAULT now()
);


--
-- Name: engajamento_notas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engajamento_notas (
    id bigint NOT NULL,
    dia date NOT NULL,
    unidade text,
    departamento text,
    dimensao text NOT NULL,
    soma numeric NOT NULL,
    n integer NOT NULL,
    promotores integer DEFAULT 0 NOT NULL,
    detratores integer DEFAULT 0 NOT NULL
);


--
-- Name: engajamento_notas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.engajamento_notas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: engajamento_notas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.engajamento_notas_id_seq OWNED BY public.engajamento_notas.id;


--
-- Name: engajamento_participacao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engajamento_participacao (
    id bigint NOT NULL,
    pulso_inicio date NOT NULL,
    unidade text,
    departamento text,
    gestor text,
    convidados integer,
    respondentes integer DEFAULT 0 NOT NULL
);


--
-- Name: engajamento_participacao_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.engajamento_participacao_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: engajamento_participacao_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.engajamento_participacao_id_seq OWNED BY public.engajamento_participacao.id;


--
-- Name: engajamento_pulso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engajamento_pulso (
    id bigint NOT NULL,
    inicio date NOT NULL,
    fim date NOT NULL,
    numero integer,
    convidados integer NOT NULL,
    respondentes integer NOT NULL,
    parcial boolean DEFAULT false NOT NULL,
    ultima_resposta timestamp without time zone,
    fonte text DEFAULT 'feedz'::text NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT engajamento_pulso_fonte_check CHECK ((fonte = ANY (ARRAY['feedz'::text, 'historico'::text, 'base'::text])))
);


--
-- Name: engajamento_pulso_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.engajamento_pulso_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: engajamento_pulso_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.engajamento_pulso_id_seq OWNED BY public.engajamento_pulso.id;


--
-- Name: entrevista_pesquisa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entrevista_pesquisa (
    id bigint NOT NULL,
    planilha_id text,
    data_inicio date,
    data_conclusao date,
    nome text,
    email text,
    telefone text,
    unidade text,
    departamento text,
    motivo_desligamento text,
    submotivo_desligamento text,
    data_desligamento date,
    trabalharia_novamente text,
    nps integer,
    respostas jsonb DEFAULT '{}'::jsonb NOT NULL,
    controle_id bigint,
    repetida boolean DEFAULT false NOT NULL
);


--
-- Name: entrevista_pesquisa_anon; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.entrevista_pesquisa_anon WITH (security_invoker='true') AS
 SELECT id,
    planilha_id,
    data_inicio,
    data_conclusao,
    unidade,
    departamento,
    motivo_desligamento,
    submotivo_desligamento,
    data_desligamento,
    trabalharia_novamente,
    nps,
    public.respostas_sem_dado_pessoal(respostas) AS respostas
   FROM public.entrevista_pesquisa
  WHERE (NOT repetida);


--
-- Name: entrevista_pesquisa_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.entrevista_pesquisa_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: entrevista_pesquisa_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.entrevista_pesquisa_id_seq OWNED BY public.entrevista_pesquisa.id;


--
-- Name: entrevista_pesquisa_perguntas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entrevista_pesquisa_perguntas (
    origem text NOT NULL,
    ordem integer NOT NULL,
    pergunta text NOT NULL
);


--
-- Name: entrevista_solicitacao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entrevista_solicitacao (
    id bigint NOT NULL,
    planilha_id text,
    data_solicitacao date,
    nome_solicitante text,
    nome text,
    cargo text,
    unidade text,
    departamento text,
    data_admissao date,
    data_demissao date,
    tempo_trabalho integer,
    tipo text,
    tipo_desligamento text,
    motivo_desligamento text,
    status_feedz text,
    status_entrevista text,
    observacoes text
);


--
-- Name: entrevista_solicitacao_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.entrevista_solicitacao_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: entrevista_solicitacao_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.entrevista_solicitacao_id_seq OWNED BY public.entrevista_solicitacao.id;


--
-- Name: entrevistas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entrevistas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    candidato_id text,
    candidato_nome text,
    vaga_id text,
    cargo text,
    marca text,
    recrutador text,
    etapa text,
    tipo_entrevista text,
    data date,
    horario text,
    duracao text,
    status text,
    tipo_processo text,
    nivel_vaga text,
    observacao text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    unidade text
);


--
-- Name: entrevistas_desligamento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entrevistas_desligamento (
    id text NOT NULL,
    colaborador_external_id text,
    colaborador_nome text,
    colaborador_cpf text,
    colaborador_email text,
    colaborador_telefone text,
    cargo text,
    data_admissao date,
    data_desligamento date,
    unidade text,
    departamento text,
    unidade_trabalho text,
    local text,
    departamento_forms text,
    respostas jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'Pendente'::text NOT NULL,
    link_token text,
    gerado_por text,
    data_finalizacao timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    id_desligamento text
);


--
-- Name: etapas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.etapas (
    id bigint NOT NULL,
    nome text NOT NULL,
    ativo boolean DEFAULT true NOT NULL
);


--
-- Name: etapas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.etapas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: etapas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.etapas_id_seq OWNED BY public.etapas.id;


--
-- Name: experiencia_candidato; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.experiencia_candidato (
    id bigint NOT NULL,
    forms_id text,
    data_resposta date,
    nome text,
    unidade text,
    departamento text,
    etapa text,
    nps integer,
    recrutador text,
    motivo_nota text,
    clareza_vaga text,
    comunicacao_etapas text,
    feedback_retorno text,
    visao_empresa text,
    preparacao_recrutador text,
    tempo_duracao text,
    tratamento_respeitoso text,
    comentario_etapas text
);


--
-- Name: experiencia_candidato_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.experiencia_candidato_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: experiencia_candidato_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.experiencia_candidato_id_seq OWNED BY public.experiencia_candidato.id;


--
-- Name: fechamento_periodo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fechamento_periodo (
    id text NOT NULL,
    tipo text NOT NULL,
    ano integer NOT NULL,
    n integer NOT NULL,
    textos jsonb DEFAULT '{}'::jsonb NOT NULL,
    manuais jsonb DEFAULT '{}'::jsonb NOT NULL,
    ocultos text[] DEFAULT '{}'::text[] NOT NULL,
    status text DEFAULT 'rascunho'::text NOT NULL,
    snapshot jsonb,
    fechado_em timestamp with time zone,
    fechado_por text,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_por text,
    CONSTRAINT fechamento_periodo_status_check CHECK ((status = ANY (ARRAY['rascunho'::text, 'fechado'::text]))),
    CONSTRAINT fechamento_periodo_tipo_check CHECK ((tipo = ANY (ARRAY['mensal'::text, 'bimestral'::text, 'semestral'::text, 'anual'::text])))
);


--
-- Name: feedbacks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedbacks (
    id bigint NOT NULL,
    de text,
    para text,
    unidade text,
    departamento text,
    cargo text,
    anonimo text,
    template text,
    feedback text,
    avaliacao text,
    data date,
    data_visualizacao date,
    respostas jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: feedbacks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.feedbacks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: feedbacks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.feedbacks_id_seq OWNED BY public.feedbacks.id;


--
-- Name: fontes_captacao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fontes_captacao (
    id bigint NOT NULL,
    nome text NOT NULL,
    ativo boolean DEFAULT true NOT NULL
);


--
-- Name: fontes_captacao_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fontes_captacao_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fontes_captacao_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fontes_captacao_id_seq OWNED BY public.fontes_captacao.id;


--
-- Name: historico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.historico (
    id bigint NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    acao text,
    vaga_id text,
    campo text,
    valor_anterior text,
    valor_novo text,
    detalhes text,
    usuario text
);


--
-- Name: historico_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.historico_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: historico_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.historico_id_seq OWNED BY public.historico.id;


--
-- Name: hub_versoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hub_versoes (
    tabela text NOT NULL,
    versao bigint DEFAULT 0 NOT NULL,
    alterado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: humor_individual; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.humor_individual (
    chave text NOT NULL,
    colaborador_external_id text NOT NULL,
    data_admissao date NOT NULL,
    dia date NOT NULL,
    momento timestamp without time zone NOT NULL,
    nota smallint NOT NULL,
    unidade text NOT NULL,
    departamento text NOT NULL,
    pareamento text NOT NULL,
    fonte text DEFAULT '36. Humor.xlsx'::text NOT NULL,
    importado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT humor_individual_check CHECK (((dia >= data_admissao) AND (dia = (momento)::date))),
    CONSTRAINT humor_individual_nota_check CHECK (((nota >= 1) AND (nota <= 5))),
    CONSTRAINT humor_individual_pareamento_check CHECK ((pareamento = ANY (ARRAY['cpf'::text, 'nome_local'::text])))
);


--
-- Name: humor_mensal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.humor_mensal (
    id bigint NOT NULL,
    mes date NOT NULL,
    unidade text,
    departamento text,
    registros integer NOT NULL,
    soma numeric NOT NULL,
    pessoas integer NOT NULL,
    dist jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: humor_mensal_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.humor_mensal_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: humor_mensal_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.humor_mensal_id_seq OWNED BY public.humor_mensal.id;


--
-- Name: metas_vagas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.metas_vagas (
    ano integer NOT NULL,
    mes integer NOT NULL,
    meta_abertas integer,
    meta_fechadas integer,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT metas_vagas_mes_check CHECK (((mes >= 1) AND (mes <= 12)))
);


--
-- Name: niveis_vaga; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.niveis_vaga (
    id bigint NOT NULL,
    nome text NOT NULL,
    ativo boolean DEFAULT true NOT NULL
);


--
-- Name: niveis_vaga_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.niveis_vaga_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: niveis_vaga_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.niveis_vaga_id_seq OWNED BY public.niveis_vaga.id;


--
-- Name: onboarding; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboarding (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    candidato_id text,
    candidato_nome text,
    vaga_id text,
    cargo text,
    marca text,
    departamento text,
    unidade text,
    nivel_vaga text,
    data_prevista_admissao date,
    status text DEFAULT 'Pendente'::text NOT NULL,
    motivo_nao_realizado text,
    data_onboarding date,
    local text,
    enviado_por text,
    enviado_em timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    modalidade text,
    carga_horaria numeric,
    observacoes text,
    pontuacao_comportamento integer,
    pontuacao_atendimento integer,
    pontuacao_cultura integer,
    pontuacao_engajamento integer,
    nota_final numeric
);


--
-- Name: one_on_one; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.one_on_one (
    id bigint NOT NULL,
    lider text,
    lider_email text,
    lider_departamento text,
    lider_papel text,
    liderado text,
    liderado_email text,
    liderado_matricula text,
    unidade text,
    departamento text,
    liderado_papel text,
    relacao text,
    categoria text,
    data_agendada date,
    data_realizada date,
    status text,
    topicos_lider text,
    topicos_liderado text,
    anotacoes_lider text,
    anotacoes_liderado text,
    acoes_ativas_lider text,
    acoes_concluidas_lider text,
    acoes_ativas_liderado text,
    acoes_concluidas_liderado text
);


--
-- Name: one_on_one_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.one_on_one_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: one_on_one_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.one_on_one_id_seq OWNED BY public.one_on_one.id;


--
-- Name: pareceres_gestor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pareceres_gestor (
    id text NOT NULL,
    candidato_id text,
    candidato_nome text,
    vaga_id text,
    cargo text,
    marca text,
    departamento text,
    modelo text NOT NULL,
    recrutador text,
    status text DEFAULT 'Pendente'::text NOT NULL,
    dados jsonb DEFAULT '{}'::jsonb NOT NULL,
    nivel_recomendacao integer,
    parecer_final text,
    justificativa text,
    preenchido_por text,
    data_finalizacao timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    link_token text,
    unidade text
);


--
-- Name: pesquisa_clima; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pesquisa_clima (
    id bigint NOT NULL,
    dimensao text,
    pergunta text,
    nota numeric,
    comentario text,
    data_resposta date,
    posicao text,
    lider text,
    tempo_empresa_meses integer,
    unidade text,
    departamento text
);


--
-- Name: pesquisa_clima_hc; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pesquisa_clima_hc (
    id bigint NOT NULL,
    unidade text,
    departamento text,
    papel text,
    lider text,
    situacao text
);


--
-- Name: pesquisa_clima_hc_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pesquisa_clima_hc_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pesquisa_clima_hc_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pesquisa_clima_hc_id_seq OWNED BY public.pesquisa_clima_hc.id;


--
-- Name: pesquisa_clima_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pesquisa_clima_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pesquisa_clima_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pesquisa_clima_id_seq OWNED BY public.pesquisa_clima.id;


--
-- Name: portais; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portais (
    id bigint NOT NULL,
    nome text NOT NULL,
    ativo boolean DEFAULT true NOT NULL
);


--
-- Name: portais_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.portais_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: portais_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.portais_id_seq OWNED BY public.portais.id;


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    nome text NOT NULL,
    perfil text NOT NULL,
    unidades text[] DEFAULT '{}'::text[] NOT NULL,
    departamentos text[] DEFAULT '{}'::text[] NOT NULL,
    permissoes jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'ativo'::text NOT NULL,
    status_em timestamp with time zone,
    status_por text,
    colaborador_external_id text,
    satisfacao_areas text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT profiles_perfil_check CHECK ((perfil = ANY (ARRAY['admin'::text, 'gestor'::text, 'rh'::text]))),
    CONSTRAINT profiles_status_check CHECK ((status = ANY (ARRAY['ativo'::text, 'inativo'::text, 'desligado'::text])))
);


--
-- Name: TABLE profiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.profiles IS 'Um registro por usuário do hub. unidades/departamentos vazios = acesso a todas as linhas (dentro do que "permissoes" já libera). "perfil" é só rótulo/preset usado ao cadastrar — quem manda de verdade é "permissoes".';


--
-- Name: COLUMN profiles.permissoes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.permissoes IS 'Mapa {"indicadores.headcount": true, "recrutamento.vagas": true, ...} — chaves definidas em js/permissions.js (HUB_PERMISSIONS.CATALOG). Lido por has_permission(perm) nas policies abaixo.';


--
-- Name: COLUMN profiles.colaborador_external_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.colaborador_external_id IS 'ID da Feedz (colaboradores.external_id) da pessoa deste login. Vazio = vínculo pelo e-mail. Usado pelo organograma por galho.';


--
-- Name: COLUMN profiles.satisfacao_areas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.satisfacao_areas IS 'Pesquisa de Satisfação: áreas do Escritório que a pessoa pode ver (ex.: {TI}). Só vale com a permissão indicadores.satisfacao; indicadores.satisfacao_completo libera todas.';


--
-- Name: recrutadores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recrutadores (
    id bigint NOT NULL,
    nome text NOT NULL,
    ativo boolean DEFAULT true NOT NULL
);


--
-- Name: recrutadores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.recrutadores_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recrutadores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.recrutadores_id_seq OWNED BY public.recrutadores.id;


--
-- Name: recrutamento_departamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recrutamento_departamentos (
    id bigint NOT NULL,
    nome text NOT NULL,
    unidade text,
    ativo boolean DEFAULT true NOT NULL
);


--
-- Name: recrutamento_departamentos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.recrutamento_departamentos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recrutamento_departamentos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.recrutamento_departamentos_id_seq OWNED BY public.recrutamento_departamentos.id;


--
-- Name: satisfacao_ciclo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.satisfacao_ciclo (
    pesquisa date NOT NULL,
    respondentes integer NOT NULL,
    aptos integer,
    areas text[] DEFAULT '{}'::text[] NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: satisfacao_respostas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.satisfacao_respostas (
    id bigint NOT NULL,
    pesquisa date NOT NULL,
    unidade text,
    departamento text,
    area text NOT NULL,
    nota numeric,
    melhorar text[] DEFAULT '{}'::text[] NOT NULL,
    extra text,
    comentario text
);


--
-- Name: satisfacao_respostas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.satisfacao_respostas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: satisfacao_respostas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.satisfacao_respostas_id_seq OWNED BY public.satisfacao_respostas.id;


--
-- Name: satisfacao_suporte; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.satisfacao_suporte (
    id bigint NOT NULL,
    pesquisa date NOT NULL,
    unidade text,
    departamento text,
    respondentes integer NOT NULL,
    areas jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: satisfacao_suporte_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.satisfacao_suporte_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: satisfacao_suporte_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.satisfacao_suporte_id_seq OWNED BY public.satisfacao_suporte.id;


--
-- Name: satisfacao_triagem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.satisfacao_triagem (
    chave text NOT NULL,
    pesquisa date NOT NULL,
    area text NOT NULL,
    acao text NOT NULL,
    atualizado_por uuid,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT satisfacao_triagem_acao_check CHECK ((acao = ANY (ARRAY['ocultar'::text, 'individual'::text, 'loja'::text])))
);


--
-- Name: seguranca_fase1_relatorio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seguranca_fase1_relatorio (
    item text,
    detalhe text,
    em timestamp with time zone DEFAULT now()
);


--
-- Name: solicitacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solicitacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    descricao text,
    solicitante text,
    perfil_solicitante text,
    data_solicitacao timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'Pendente'::text NOT NULL,
    aprovado_por text,
    data_decisao timestamp with time zone,
    observacao_admin text
);


--
-- Name: treinamento_turmas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treinamento_turmas (
    id bigint NOT NULL,
    planilha text NOT NULL,
    arquivo text,
    linha integer,
    data date NOT NULL,
    tema text NOT NULL,
    tema_original text,
    categoria text,
    modalidade text,
    local text,
    hora_inicio text,
    hora_fim text,
    horas numeric,
    publico text,
    marcas text[] DEFAULT '{}'::text[] NOT NULL,
    marca_original text,
    canal text,
    convocados integer,
    presentes integer,
    multiplicadoras text[] DEFAULT '{}'::text[] NOT NULL,
    multiplicador_original text,
    alertas text[] DEFAULT '{}'::text[] NOT NULL,
    importado_em timestamp with time zone DEFAULT now() NOT NULL,
    origem text DEFAULT 'planilha'::text NOT NULL,
    observacao text,
    criado_por uuid,
    criado_por_nome text,
    atualizado_em timestamp with time zone,
    atualizado_por text,
    justificativa text,
    justificado_em timestamp with time zone,
    justificado_por text,
    validacao text,
    validado_por text,
    validado_em timestamp with time zone,
    gestor_comentario text,
    ajuste_pedido boolean DEFAULT false NOT NULL,
    ajuste_pedido_por text,
    ajuste_pedido_em timestamp with time zone
);


--
-- Name: treinamento_turmas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.treinamento_turmas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: treinamento_turmas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.treinamento_turmas_id_seq OWNED BY public.treinamento_turmas.id;


--
-- Name: treinamento_turmas_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treinamento_turmas_log (
    id bigint NOT NULL,
    turma_id bigint NOT NULL,
    acao text NOT NULL,
    quando timestamp with time zone DEFAULT now() NOT NULL,
    usuario_id uuid,
    usuario_nome text,
    antes jsonb,
    depois jsonb
);


--
-- Name: treinamento_turmas_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.treinamento_turmas_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: treinamento_turmas_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.treinamento_turmas_log_id_seq OWNED BY public.treinamento_turmas_log.id;


--
-- Name: twygo_conteudos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.twygo_conteudos (
    id bigint NOT NULL,
    codigo_conteudo text,
    tipo text,
    nome text,
    situacao text,
    inscricoes integer,
    carga_horaria numeric,
    progresso numeric,
    categorias text,
    data_inicio date,
    data_termino date,
    criado_em date,
    publicado_em date
);


--
-- Name: twygo_conteudos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.twygo_conteudos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: twygo_conteudos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.twygo_conteudos_id_seq OWNED BY public.twygo_conteudos.id;


--
-- Name: twygo_participantes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.twygo_participantes (
    id bigint NOT NULL,
    content_id text,
    content_title text,
    content_type text,
    nome_completo text,
    email text,
    unidade text,
    departamento text,
    cargo text,
    data_inscricao date,
    ultimo_acesso date,
    situacao_inscricao text,
    situacao text,
    situacao_ambiente text,
    progresso numeric,
    nota numeric,
    frequencia numeric,
    pontuacao numeric,
    carga_horaria numeric,
    emitido_em date,
    concluido_em date,
    aprovado_em date
);


--
-- Name: twygo_participantes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.twygo_participantes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: twygo_participantes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.twygo_participantes_id_seq OWNED BY public.twygo_participantes.id;


--
-- Name: twygo_usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.twygo_usuarios (
    id bigint NOT NULL,
    twygo_id text,
    nome_completo text,
    email text,
    cpf text,
    ultimo_acesso date,
    perfil text,
    pontuacao numeric,
    progresso numeric,
    situacao text,
    registrado_em date,
    cargo text,
    unidade text,
    departamento text
);


--
-- Name: twygo_usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.twygo_usuarios_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: twygo_usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.twygo_usuarios_id_seq OWNED BY public.twygo_usuarios.id;


--
-- Name: unibe_pdv; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unibe_pdv (
    id bigint NOT NULL,
    mes date NOT NULL,
    pdv text NOT NULL,
    nome_pdv text,
    regiao text,
    segmento text,
    gerente text,
    supervisao text,
    multi text,
    adesao numeric,
    pessoas integer,
    unidade text,
    departamento text
);


--
-- Name: unibe_pdv_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.unibe_pdv_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: unibe_pdv_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.unibe_pdv_id_seq OWNED BY public.unibe_pdv.id;


--
-- Name: unibe_pessoas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unibe_pessoas (
    id bigint NOT NULL,
    mes date NOT NULL,
    nome text NOT NULL,
    cargo text,
    pdv text,
    nome_pdv text,
    regiao text,
    segmento text,
    adesao numeric,
    unidade text,
    departamento text,
    no_cadastro boolean DEFAULT false NOT NULL,
    nome_cadastro text
);


--
-- Name: unibe_pessoas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.unibe_pessoas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: unibe_pessoas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.unibe_pessoas_id_seq OWNED BY public.unibe_pessoas.id;


--
-- Name: unidades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unidades (
    id bigint NOT NULL,
    nome text NOT NULL,
    ativo boolean DEFAULT true NOT NULL
);


--
-- Name: unidades_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.unidades_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: unidades_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.unidades_id_seq OWNED BY public.unidades.id;


--
-- Name: upload_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.upload_log (
    id bigint NOT NULL,
    tabela text NOT NULL,
    arquivo text,
    usuario_id uuid,
    usuario_nome text,
    linhas integer,
    status text DEFAULT 'ok'::text NOT NULL,
    erro text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT upload_log_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'erro'::text])))
);


--
-- Name: upload_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.upload_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.upload_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id uuid NOT NULL,
    email text,
    senha_hash text,
    trocar_senha boolean DEFAULT false NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    ultimo_login timestamp with time zone
);


--
-- Name: vagas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vagas (
    id text NOT NULL,
    data_abertura date,
    marca text,
    unidade text,
    departamento text,
    nivel_vaga text,
    solicitante text,
    cargo text,
    sigilosa text,
    tipo_vaga text,
    responsavel text,
    status text,
    tipo_movimentacao text,
    motivo_aumento text,
    pessoa_substituida text,
    tipo_recrutamento text,
    etapa text,
    motivo_sla text,
    motivo_sla_text text,
    data_congelamento date,
    data_retorno date,
    data_cancelamento date,
    finalistas text,
    contratado text,
    fit_pct numeric,
    data_fechamento date,
    data_inicio date,
    data_prevista_admissao date,
    ultima_divulgacao text,
    data_ultima_divulgacao date,
    fonte text,
    quem_indicou text,
    observacoes text,
    portais_ativos text[] DEFAULT '{}'::text[] NOT NULL,
    fontes_divulgadas text[] DEFAULT '{}'::text[] NOT NULL,
    num_inscricoes integer,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    cota text,
    tipo_cota text,
    hub_alterado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: viewas_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.viewas_log (
    id bigint NOT NULL,
    usuario_id uuid,
    usuario_nome text,
    alvo_profile_id uuid,
    alvo_nome text,
    alvo_email text,
    alvo_perfil text,
    iniciado_em timestamp with time zone DEFAULT now() NOT NULL,
    encerrado_em timestamp with time zone
);


--
-- Name: viewas_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.viewas_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.viewas_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: visitas_loja; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visitas_loja (
    id text NOT NULL,
    area text,
    loja text,
    data_visita date,
    todos_presentes text,
    colaboradores_ausentes text,
    justificativa_ausencia text,
    clima_equipe text,
    clima_melhorar text,
    clima_exemplo text,
    uniformizados text,
    nao_uniformizados text,
    justificativa_uniforme text,
    postura_gerente text,
    postura_gerente_melhorar text,
    postura_gerente_exemplo text,
    postura_consultores text,
    postura_consultores_melhorar text,
    postura_consultores_exemplo text,
    iniciativa_time text,
    iniciativa_time_melhorar text,
    iniciativa_time_exemplo text,
    se_apresentam text,
    nao_se_apresentam text,
    perguntam_motivo text,
    nao_perguntam_motivo text,
    perguntam_nome text,
    nao_perguntam_nome text,
    momento_cpf text,
    quais_nao_cpf_inicio text,
    explicam_fidelidade text,
    nao_explicam_fidelidade text,
    incentivam_experimentar text,
    nao_incentivam_experimentar text,
    oferece_adicional text,
    nao_oferece_adicional text,
    borrifa_fragrancia text,
    nao_borrifa_fragrancia text,
    menciona_boti_recicla text,
    nao_menciona_boti_recicla text,
    etapas_experimentacao text,
    etapas_experimentacao_falta text,
    incentiva_beautybox text,
    nao_incentiva_beautybox text,
    entendeu_desejo text,
    entendeu_desejo_melhorar text,
    falou_preco_quando_perguntado text,
    preco_nao_seguiram text,
    criou_oportunidades text,
    oportunidades_melhorar text,
    aproveitou_acompanhante text,
    acompanhante_melhorar text,
    experimentar_premium text,
    premium_melhorar text,
    usou_pre_venda text,
    pre_venda_melhorar text,
    apresentou_alavancas text,
    alavancas_melhorar text,
    organizou_caixa_presente text,
    caixa_presente_melhorar text,
    ofereceu_acessorios_make text,
    acessorios_melhorar text,
    destacou_descontos text,
    descontos_melhorar text,
    mostrou_confianca text,
    confianca_melhorar text,
    nota_clima_engajamento numeric,
    nota_botileza numeric,
    nota_atendimento360 numeric,
    nota_geral numeric,
    criado_por text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: academia_hering id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academia_hering ALTER COLUMN id SET DEFAULT nextval('public.academia_hering_id_seq'::regclass);


--
-- Name: avaliacao_experiencia_45 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avaliacao_experiencia_45 ALTER COLUMN id SET DEFAULT nextval('public.avaliacao_experiencia_45_id_seq'::regclass);


--
-- Name: avaliacao_experiencia_90 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avaliacao_experiencia_90 ALTER COLUMN id SET DEFAULT nextval('public.avaliacao_experiencia_90_id_seq'::regclass);


--
-- Name: boletim_entradas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boletim_entradas ALTER COLUMN id SET DEFAULT nextval('public.boletim_entradas_id_seq'::regclass);


--
-- Name: boletim_fechamento id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boletim_fechamento ALTER COLUMN id SET DEFAULT nextval('public.boletim_fechamento_id_seq'::regclass);


--
-- Name: cargos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargos ALTER COLUMN id SET DEFAULT nextval('public.cargos_id_seq'::regclass);


--
-- Name: celebracoes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.celebracoes ALTER COLUMN id SET DEFAULT nextval('public.celebracoes_id_seq'::regclass);


--
-- Name: colaboradores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.colaboradores ALTER COLUMN id SET DEFAULT nextval('public.colaboradores_id_seq'::regclass);


--
-- Name: controle_desligamento id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.controle_desligamento ALTER COLUMN id SET DEFAULT nextval('public.controle_desligamento_id_seq'::regclass);


--
-- Name: controle_vagas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.controle_vagas ALTER COLUMN id SET DEFAULT nextval('public.controle_vagas_id_seq'::regclass);


--
-- Name: engajamento_notas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engajamento_notas ALTER COLUMN id SET DEFAULT nextval('public.engajamento_notas_id_seq'::regclass);


--
-- Name: engajamento_participacao id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engajamento_participacao ALTER COLUMN id SET DEFAULT nextval('public.engajamento_participacao_id_seq'::regclass);


--
-- Name: engajamento_pulso id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engajamento_pulso ALTER COLUMN id SET DEFAULT nextval('public.engajamento_pulso_id_seq'::regclass);


--
-- Name: entrevista_pesquisa id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entrevista_pesquisa ALTER COLUMN id SET DEFAULT nextval('public.entrevista_pesquisa_id_seq'::regclass);


--
-- Name: entrevista_solicitacao id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entrevista_solicitacao ALTER COLUMN id SET DEFAULT nextval('public.entrevista_solicitacao_id_seq'::regclass);


--
-- Name: etapas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etapas ALTER COLUMN id SET DEFAULT nextval('public.etapas_id_seq'::regclass);


--
-- Name: experiencia_candidato id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experiencia_candidato ALTER COLUMN id SET DEFAULT nextval('public.experiencia_candidato_id_seq'::regclass);


--
-- Name: feedbacks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedbacks ALTER COLUMN id SET DEFAULT nextval('public.feedbacks_id_seq'::regclass);


--
-- Name: fontes_captacao id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fontes_captacao ALTER COLUMN id SET DEFAULT nextval('public.fontes_captacao_id_seq'::regclass);


--
-- Name: historico id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historico ALTER COLUMN id SET DEFAULT nextval('public.historico_id_seq'::regclass);


--
-- Name: humor_mensal id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.humor_mensal ALTER COLUMN id SET DEFAULT nextval('public.humor_mensal_id_seq'::regclass);


--
-- Name: niveis_vaga id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.niveis_vaga ALTER COLUMN id SET DEFAULT nextval('public.niveis_vaga_id_seq'::regclass);


--
-- Name: one_on_one id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.one_on_one ALTER COLUMN id SET DEFAULT nextval('public.one_on_one_id_seq'::regclass);


--
-- Name: pesquisa_clima id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pesquisa_clima ALTER COLUMN id SET DEFAULT nextval('public.pesquisa_clima_id_seq'::regclass);


--
-- Name: pesquisa_clima_hc id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pesquisa_clima_hc ALTER COLUMN id SET DEFAULT nextval('public.pesquisa_clima_hc_id_seq'::regclass);


--
-- Name: portais id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portais ALTER COLUMN id SET DEFAULT nextval('public.portais_id_seq'::regclass);


--
-- Name: recrutadores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recrutadores ALTER COLUMN id SET DEFAULT nextval('public.recrutadores_id_seq'::regclass);


--
-- Name: recrutamento_departamentos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recrutamento_departamentos ALTER COLUMN id SET DEFAULT nextval('public.recrutamento_departamentos_id_seq'::regclass);


--
-- Name: satisfacao_respostas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.satisfacao_respostas ALTER COLUMN id SET DEFAULT nextval('public.satisfacao_respostas_id_seq'::regclass);


--
-- Name: satisfacao_suporte id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.satisfacao_suporte ALTER COLUMN id SET DEFAULT nextval('public.satisfacao_suporte_id_seq'::regclass);


--
-- Name: treinamento_turmas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treinamento_turmas ALTER COLUMN id SET DEFAULT nextval('public.treinamento_turmas_id_seq'::regclass);


--
-- Name: treinamento_turmas_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treinamento_turmas_log ALTER COLUMN id SET DEFAULT nextval('public.treinamento_turmas_log_id_seq'::regclass);


--
-- Name: twygo_conteudos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.twygo_conteudos ALTER COLUMN id SET DEFAULT nextval('public.twygo_conteudos_id_seq'::regclass);


--
-- Name: twygo_participantes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.twygo_participantes ALTER COLUMN id SET DEFAULT nextval('public.twygo_participantes_id_seq'::regclass);


--
-- Name: twygo_usuarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.twygo_usuarios ALTER COLUMN id SET DEFAULT nextval('public.twygo_usuarios_id_seq'::regclass);


--
-- Name: unibe_pdv id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unibe_pdv ALTER COLUMN id SET DEFAULT nextval('public.unibe_pdv_id_seq'::regclass);


--
-- Name: unibe_pessoas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unibe_pessoas ALTER COLUMN id SET DEFAULT nextval('public.unibe_pessoas_id_seq'::regclass);


--
-- Name: unidades id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidades ALTER COLUMN id SET DEFAULT nextval('public.unidades_id_seq'::regclass);


--
-- Name: audit audit_pkey; Type: CONSTRAINT; Schema: conexao_private; Owner: -
--

ALTER TABLE ONLY conexao_private.audit
    ADD CONSTRAINT audit_pkey PRIMARY KEY (id);


--
-- Name: nps nps_pkey; Type: CONSTRAINT; Schema: conexao_private; Owner: -
--

ALTER TABLE ONLY conexao_private.nps
    ADD CONSTRAINT nps_pkey PRIMARY KEY (id);


--
-- Name: nps nps_session_id_employee_key; Type: CONSTRAINT; Schema: conexao_private; Owner: -
--

ALTER TABLE ONLY conexao_private.nps
    ADD CONSTRAINT nps_session_id_employee_key UNIQUE (session_id, employee);


--
-- Name: nps nps_token_hash_key; Type: CONSTRAINT; Schema: conexao_private; Owner: -
--

ALTER TABLE ONLY conexao_private.nps
    ADD CONSTRAINT nps_token_hash_key UNIQUE (token_hash);


--
-- Name: records records_pkey; Type: CONSTRAINT; Schema: conexao_private; Owner: -
--

ALTER TABLE ONLY conexao_private.records
    ADD CONSTRAINT records_pkey PRIMARY KEY (kind, id);


--
-- Name: secrets secrets_pkey; Type: CONSTRAINT; Schema: conexao_private; Owner: -
--

ALTER TABLE ONLY conexao_private.secrets
    ADD CONSTRAINT secrets_pkey PRIMARY KEY (id);


--
-- Name: academia_hering academia_hering_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academia_hering
    ADD CONSTRAINT academia_hering_pkey PRIMARY KEY (id);


--
-- Name: acesso_log acesso_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acesso_log
    ADD CONSTRAINT acesso_log_pkey PRIMARY KEY (id);


--
-- Name: avaliacao_experiencia_45 avaliacao_experiencia_45_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avaliacao_experiencia_45
    ADD CONSTRAINT avaliacao_experiencia_45_pkey PRIMARY KEY (id);


--
-- Name: avaliacao_experiencia_90 avaliacao_experiencia_90_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avaliacao_experiencia_90
    ADD CONSTRAINT avaliacao_experiencia_90_pkey PRIMARY KEY (id);


--
-- Name: boletim_entradas boletim_entradas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boletim_entradas
    ADD CONSTRAINT boletim_entradas_pkey PRIMARY KEY (id);


--
-- Name: boletim_fechamento boletim_fechamento_mes_operacao_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boletim_fechamento
    ADD CONSTRAINT boletim_fechamento_mes_operacao_key UNIQUE (mes, operacao);


--
-- Name: boletim_fechamento boletim_fechamento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boletim_fechamento
    ADD CONSTRAINT boletim_fechamento_pkey PRIMARY KEY (id);


--
-- Name: cadastro_autorizado cadastro_autorizado_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadastro_autorizado
    ADD CONSTRAINT cadastro_autorizado_pkey PRIMARY KEY (email);


--
-- Name: candidatos candidatos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidatos
    ADD CONSTRAINT candidatos_pkey PRIMARY KEY (id);


--
-- Name: cargos cargos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargos
    ADD CONSTRAINT cargos_pkey PRIMARY KEY (id);


--
-- Name: celebracoes celebracoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.celebracoes
    ADD CONSTRAINT celebracoes_pkey PRIMARY KEY (id);


--
-- Name: colaboradores colaboradores_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.colaboradores
    ADD CONSTRAINT colaboradores_external_id_key UNIQUE (external_id);


--
-- Name: colaboradores colaboradores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.colaboradores
    ADD CONSTRAINT colaboradores_pkey PRIMARY KEY (id);


--
-- Name: controle_desligamento controle_desligamento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.controle_desligamento
    ADD CONSTRAINT controle_desligamento_pkey PRIMARY KEY (id);


--
-- Name: controle_vagas controle_vagas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.controle_vagas
    ADD CONSTRAINT controle_vagas_pkey PRIMARY KEY (id);


--
-- Name: engajamento_notas engajamento_notas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engajamento_notas
    ADD CONSTRAINT engajamento_notas_pkey PRIMARY KEY (id);


--
-- Name: engajamento_participacao engajamento_participacao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engajamento_participacao
    ADD CONSTRAINT engajamento_participacao_pkey PRIMARY KEY (id);


--
-- Name: engajamento_pulso engajamento_pulso_inicio_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engajamento_pulso
    ADD CONSTRAINT engajamento_pulso_inicio_key UNIQUE (inicio);


--
-- Name: engajamento_pulso engajamento_pulso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engajamento_pulso
    ADD CONSTRAINT engajamento_pulso_pkey PRIMARY KEY (id);


--
-- Name: entrevista_pesquisa_perguntas entrevista_pesquisa_perguntas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entrevista_pesquisa_perguntas
    ADD CONSTRAINT entrevista_pesquisa_perguntas_pkey PRIMARY KEY (origem, pergunta);


--
-- Name: entrevista_pesquisa entrevista_pesquisa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entrevista_pesquisa
    ADD CONSTRAINT entrevista_pesquisa_pkey PRIMARY KEY (id);


--
-- Name: entrevista_solicitacao entrevista_solicitacao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entrevista_solicitacao
    ADD CONSTRAINT entrevista_solicitacao_pkey PRIMARY KEY (id);


--
-- Name: entrevistas_desligamento entrevistas_desligamento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entrevistas_desligamento
    ADD CONSTRAINT entrevistas_desligamento_pkey PRIMARY KEY (id);


--
-- Name: entrevistas entrevistas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entrevistas
    ADD CONSTRAINT entrevistas_pkey PRIMARY KEY (id);


--
-- Name: etapas etapas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etapas
    ADD CONSTRAINT etapas_pkey PRIMARY KEY (id);


--
-- Name: experiencia_candidato experiencia_candidato_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experiencia_candidato
    ADD CONSTRAINT experiencia_candidato_pkey PRIMARY KEY (id);


--
-- Name: fechamento_periodo fechamento_periodo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fechamento_periodo
    ADD CONSTRAINT fechamento_periodo_pkey PRIMARY KEY (id);


--
-- Name: feedbacks feedbacks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedbacks
    ADD CONSTRAINT feedbacks_pkey PRIMARY KEY (id);


--
-- Name: fontes_captacao fontes_captacao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fontes_captacao
    ADD CONSTRAINT fontes_captacao_pkey PRIMARY KEY (id);


--
-- Name: historico historico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historico
    ADD CONSTRAINT historico_pkey PRIMARY KEY (id);


--
-- Name: hub_versoes hub_versoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hub_versoes
    ADD CONSTRAINT hub_versoes_pkey PRIMARY KEY (tabela);


--
-- Name: humor_individual humor_individual_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.humor_individual
    ADD CONSTRAINT humor_individual_pkey PRIMARY KEY (chave);


--
-- Name: humor_mensal humor_mensal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.humor_mensal
    ADD CONSTRAINT humor_mensal_pkey PRIMARY KEY (id);


--
-- Name: metas_vagas metas_vagas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metas_vagas
    ADD CONSTRAINT metas_vagas_pkey PRIMARY KEY (ano, mes);


--
-- Name: niveis_vaga niveis_vaga_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.niveis_vaga
    ADD CONSTRAINT niveis_vaga_pkey PRIMARY KEY (id);


--
-- Name: onboarding onboarding_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding
    ADD CONSTRAINT onboarding_pkey PRIMARY KEY (id);


--
-- Name: one_on_one one_on_one_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.one_on_one
    ADD CONSTRAINT one_on_one_pkey PRIMARY KEY (id);


--
-- Name: pareceres_gestor pareceres_gestor_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pareceres_gestor
    ADD CONSTRAINT pareceres_gestor_pkey PRIMARY KEY (id);


--
-- Name: pesquisa_clima_hc pesquisa_clima_hc_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pesquisa_clima_hc
    ADD CONSTRAINT pesquisa_clima_hc_pkey PRIMARY KEY (id);


--
-- Name: pesquisa_clima pesquisa_clima_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pesquisa_clima
    ADD CONSTRAINT pesquisa_clima_pkey PRIMARY KEY (id);


--
-- Name: portais portais_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portais
    ADD CONSTRAINT portais_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: recrutadores recrutadores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recrutadores
    ADD CONSTRAINT recrutadores_pkey PRIMARY KEY (id);


--
-- Name: recrutamento_departamentos recrutamento_departamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recrutamento_departamentos
    ADD CONSTRAINT recrutamento_departamentos_pkey PRIMARY KEY (id);


--
-- Name: satisfacao_ciclo satisfacao_ciclo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.satisfacao_ciclo
    ADD CONSTRAINT satisfacao_ciclo_pkey PRIMARY KEY (pesquisa);


--
-- Name: satisfacao_respostas satisfacao_respostas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.satisfacao_respostas
    ADD CONSTRAINT satisfacao_respostas_pkey PRIMARY KEY (id);


--
-- Name: satisfacao_suporte satisfacao_suporte_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.satisfacao_suporte
    ADD CONSTRAINT satisfacao_suporte_pkey PRIMARY KEY (id);


--
-- Name: satisfacao_triagem satisfacao_triagem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.satisfacao_triagem
    ADD CONSTRAINT satisfacao_triagem_pkey PRIMARY KEY (chave);


--
-- Name: solicitacoes solicitacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitacoes
    ADD CONSTRAINT solicitacoes_pkey PRIMARY KEY (id);


--
-- Name: treinamento_turmas_log treinamento_turmas_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treinamento_turmas_log
    ADD CONSTRAINT treinamento_turmas_log_pkey PRIMARY KEY (id);


--
-- Name: treinamento_turmas treinamento_turmas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treinamento_turmas
    ADD CONSTRAINT treinamento_turmas_pkey PRIMARY KEY (id);


--
-- Name: twygo_conteudos twygo_conteudos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.twygo_conteudos
    ADD CONSTRAINT twygo_conteudos_pkey PRIMARY KEY (id);


--
-- Name: twygo_participantes twygo_participantes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.twygo_participantes
    ADD CONSTRAINT twygo_participantes_pkey PRIMARY KEY (id);


--
-- Name: twygo_usuarios twygo_usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.twygo_usuarios
    ADD CONSTRAINT twygo_usuarios_pkey PRIMARY KEY (id);


--
-- Name: unibe_pdv unibe_pdv_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unibe_pdv
    ADD CONSTRAINT unibe_pdv_pkey PRIMARY KEY (id);


--
-- Name: unibe_pessoas unibe_pessoas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unibe_pessoas
    ADD CONSTRAINT unibe_pessoas_pkey PRIMARY KEY (id);


--
-- Name: unidades unidades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidades
    ADD CONSTRAINT unidades_pkey PRIMARY KEY (id);


--
-- Name: upload_log upload_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_log
    ADD CONSTRAINT upload_log_pkey PRIMARY KEY (id);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: vagas vagas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vagas
    ADD CONSTRAINT vagas_pkey PRIMARY KEY (id);


--
-- Name: viewas_log viewas_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viewas_log
    ADD CONSTRAINT viewas_log_pkey PRIMARY KEY (id);


--
-- Name: visitas_loja visitas_loja_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitas_loja
    ADD CONSTRAINT visitas_loja_pkey PRIMARY KEY (id);


--
-- Name: academia_hering_mes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX academia_hering_mes_idx ON public.academia_hering USING btree (mes);


--
-- Name: acesso_log_criado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX acesso_log_criado_idx ON public.acesso_log USING btree (criado_em DESC);


--
-- Name: acesso_log_usuario_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX acesso_log_usuario_idx ON public.acesso_log USING btree (usuario_id, criado_em DESC);


--
-- Name: avaliacao_experiencia_45_data_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX avaliacao_experiencia_45_data_idx ON public.avaliacao_experiencia_45 USING btree (data_avaliacao);


--
-- Name: avaliacao_experiencia_45_departamento_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX avaliacao_experiencia_45_departamento_idx ON public.avaliacao_experiencia_45 USING btree (departamento);


--
-- Name: avaliacao_experiencia_45_unidade_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX avaliacao_experiencia_45_unidade_idx ON public.avaliacao_experiencia_45 USING btree (unidade);


--
-- Name: avaliacao_experiencia_90_data_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX avaliacao_experiencia_90_data_idx ON public.avaliacao_experiencia_90 USING btree (data_avaliacao);


--
-- Name: avaliacao_experiencia_90_departamento_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX avaliacao_experiencia_90_departamento_idx ON public.avaliacao_experiencia_90 USING btree (departamento);


--
-- Name: avaliacao_experiencia_90_unidade_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX avaliacao_experiencia_90_unidade_idx ON public.avaliacao_experiencia_90 USING btree (unidade);


--
-- Name: ave45_feedz_pessoa_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ave45_feedz_pessoa_key ON public.avaliacao_experiencia_45 USING btree (pessoa_key);


--
-- Name: ave90_feedz_pessoa_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ave90_feedz_pessoa_key ON public.avaliacao_experiencia_90 USING btree (pessoa_key);


--
-- Name: boletim_entradas_chave; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX boletim_entradas_chave ON public.boletim_entradas USING btree (mes, operacao, COALESCE(loja, ''::text), indicador);


--
-- Name: candidatos_departamento_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX candidatos_departamento_idx ON public.candidatos USING btree (departamento);


--
-- Name: candidatos_hub_alterado_em_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX candidatos_hub_alterado_em_idx ON public.candidatos USING btree (hub_alterado_em);


--
-- Name: candidatos_nome_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX candidatos_nome_idx ON public.candidatos USING btree (nome);


--
-- Name: candidatos_resultado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX candidatos_resultado_idx ON public.candidatos USING btree (resultado);


--
-- Name: candidatos_unidade_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX candidatos_unidade_idx ON public.candidatos USING btree (unidade);


--
-- Name: candidatos_vaga_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX candidatos_vaga_id_idx ON public.candidatos USING btree (vaga_id);


--
-- Name: celebracoes_data_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX celebracoes_data_idx ON public.celebracoes USING btree (data);


--
-- Name: celebracoes_departamento_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX celebracoes_departamento_idx ON public.celebracoes USING btree (departamento);


--
-- Name: celebracoes_feedz_codigo_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX celebracoes_feedz_codigo_data ON public.celebracoes USING btree (codigo, data);


--
-- Name: celebracoes_unidade_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX celebracoes_unidade_idx ON public.celebracoes USING btree (unidade);


--
-- Name: colaboradores_departamento_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX colaboradores_departamento_idx ON public.colaboradores USING btree (departamento);


--
-- Name: colaboradores_nome_completo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX colaboradores_nome_completo_idx ON public.colaboradores USING btree (nome_completo);


--
-- Name: colaboradores_situacao_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX colaboradores_situacao_idx ON public.colaboradores USING btree (situacao);


--
-- Name: colaboradores_unidade_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX colaboradores_unidade_idx ON public.colaboradores USING btree (unidade);


--
-- Name: controle_desligamento_demissao_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX controle_desligamento_demissao_idx ON public.controle_desligamento USING btree (data_demissao);


--
-- Name: controle_desligamento_external_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX controle_desligamento_external_idx ON public.controle_desligamento USING btree (colaborador_external_id);


--
-- Name: controle_desligamento_id_desl_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX controle_desligamento_id_desl_idx ON public.controle_desligamento USING btree (id_desligamento);


--
-- Name: controle_desligamento_unidade_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX controle_desligamento_unidade_idx ON public.controle_desligamento USING btree (unidade);


--
-- Name: controle_vagas_abertura_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX controle_vagas_abertura_idx ON public.controle_vagas USING btree (data_abertura);


--
-- Name: controle_vagas_fechamento_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX controle_vagas_fechamento_idx ON public.controle_vagas USING btree (data_fechamento);


--
-- Name: engajamento_notas_dia_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX engajamento_notas_dia_idx ON public.engajamento_notas USING btree (dia);


--
-- Name: engajamento_participacao_pulso_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX engajamento_participacao_pulso_idx ON public.engajamento_participacao USING btree (pulso_inicio);


--
-- Name: engajamento_participacao_unidade_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX engajamento_participacao_unidade_idx ON public.engajamento_participacao USING btree (unidade);


--
-- Name: entrevista_pesquisa_controle_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entrevista_pesquisa_controle_id_idx ON public.entrevista_pesquisa USING btree (controle_id);


--
-- Name: entrevista_pesquisa_data_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entrevista_pesquisa_data_idx ON public.entrevista_pesquisa USING btree (data_desligamento);


--
-- Name: entrevista_pesquisa_departamento_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entrevista_pesquisa_departamento_idx ON public.entrevista_pesquisa USING btree (departamento);


--
-- Name: entrevista_pesquisa_unidade_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entrevista_pesquisa_unidade_idx ON public.entrevista_pesquisa USING btree (unidade);


--
-- Name: entrevista_solicitacao_data_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entrevista_solicitacao_data_idx ON public.entrevista_solicitacao USING btree (data_demissao);


--
-- Name: entrevista_solicitacao_departamento_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entrevista_solicitacao_departamento_idx ON public.entrevista_solicitacao USING btree (departamento);


--
-- Name: entrevista_solicitacao_unidade_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entrevista_solicitacao_unidade_idx ON public.entrevista_solicitacao USING btree (unidade);


--
-- Name: entrevistas_candidato_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entrevistas_candidato_id_idx ON public.entrevistas USING btree (candidato_id);


--
-- Name: entrevistas_data_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entrevistas_data_idx ON public.entrevistas USING btree (data);


--
-- Name: entrevistas_desligamento_link_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX entrevistas_desligamento_link_token_idx ON public.entrevistas_desligamento USING btree (link_token) WHERE (link_token IS NOT NULL);


--
-- Name: entrevistas_desligamento_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entrevistas_desligamento_status_idx ON public.entrevistas_desligamento USING btree (status);


--
-- Name: entrevistas_unidade_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entrevistas_unidade_idx ON public.entrevistas USING btree (unidade);


--
-- Name: entrevistas_vaga_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entrevistas_vaga_id_idx ON public.entrevistas USING btree (vaga_id);


--
-- Name: experiencia_candidato_data_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX experiencia_candidato_data_idx ON public.experiencia_candidato USING btree (data_resposta);


--
-- Name: experiencia_candidato_departamento_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX experiencia_candidato_departamento_idx ON public.experiencia_candidato USING btree (departamento);


--
-- Name: experiencia_candidato_unidade_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX experiencia_candidato_unidade_idx ON public.experiencia_candidato USING btree (unidade);


--
-- Name: feedbacks_data_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedbacks_data_idx ON public.feedbacks USING btree (data);


--
-- Name: feedbacks_departamento_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedbacks_departamento_idx ON public.feedbacks USING btree (departamento);


--
-- Name: feedbacks_unidade_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedbacks_unidade_idx ON public.feedbacks USING btree (unidade);


--
-- Name: historico_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX historico_timestamp_idx ON public.historico USING btree ("timestamp");


--
-- Name: historico_vaga_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX historico_vaga_id_idx ON public.historico USING btree (vaga_id);


--
-- Name: humor_individual_vinculo_dia_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX humor_individual_vinculo_dia_idx ON public.humor_individual USING btree (colaborador_external_id, data_admissao, dia, momento);


--
-- Name: humor_mensal_mes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX humor_mensal_mes_idx ON public.humor_mensal USING btree (mes);


--
-- Name: onboarding_candidato_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX onboarding_candidato_id_idx ON public.onboarding USING btree (candidato_id);


--
-- Name: onboarding_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX onboarding_status_idx ON public.onboarding USING btree (status);


--
-- Name: onboarding_unidade_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX onboarding_unidade_idx ON public.onboarding USING btree (unidade);


--
-- Name: onboarding_vaga_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX onboarding_vaga_id_idx ON public.onboarding USING btree (vaga_id);


--
-- Name: one_on_one_data_realizada_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX one_on_one_data_realizada_idx ON public.one_on_one USING btree (data_realizada);


--
-- Name: one_on_one_departamento_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX one_on_one_departamento_idx ON public.one_on_one USING btree (departamento);


--
-- Name: one_on_one_lider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX one_on_one_lider_idx ON public.one_on_one USING btree (lider);


--
-- Name: pareceres_gestor_candidato_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pareceres_gestor_candidato_id_idx ON public.pareceres_gestor USING btree (candidato_id);


--
-- Name: pareceres_gestor_link_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pareceres_gestor_link_token_idx ON public.pareceres_gestor USING btree (link_token) WHERE (link_token IS NOT NULL);


--
-- Name: pareceres_gestor_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pareceres_gestor_status_idx ON public.pareceres_gestor USING btree (status);


--
-- Name: pesquisa_clima_data_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pesquisa_clima_data_idx ON public.pesquisa_clima USING btree (data_resposta);


--
-- Name: pesquisa_clima_departamento_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pesquisa_clima_departamento_idx ON public.pesquisa_clima USING btree (departamento);


--
-- Name: pesquisa_clima_dimensao_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pesquisa_clima_dimensao_idx ON public.pesquisa_clima USING btree (dimensao);


--
-- Name: pesquisa_clima_hc_unidade_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pesquisa_clima_hc_unidade_idx ON public.pesquisa_clima_hc USING btree (unidade);


--
-- Name: pesquisa_clima_unidade_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pesquisa_clima_unidade_idx ON public.pesquisa_clima USING btree (unidade);


--
-- Name: satisfacao_respostas_area_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX satisfacao_respostas_area_idx ON public.satisfacao_respostas USING btree (area);


--
-- Name: satisfacao_respostas_pesquisa_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX satisfacao_respostas_pesquisa_idx ON public.satisfacao_respostas USING btree (pesquisa);


--
-- Name: satisfacao_suporte_pesquisa_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX satisfacao_suporte_pesquisa_idx ON public.satisfacao_suporte USING btree (pesquisa);


--
-- Name: satisfacao_triagem_pesquisa_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX satisfacao_triagem_pesquisa_idx ON public.satisfacao_triagem USING btree (pesquisa);


--
-- Name: solicitacoes_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX solicitacoes_status_idx ON public.solicitacoes USING btree (status);


--
-- Name: treinamento_turmas_criado_por_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX treinamento_turmas_criado_por_idx ON public.treinamento_turmas USING btree (criado_por);


--
-- Name: treinamento_turmas_data_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX treinamento_turmas_data_idx ON public.treinamento_turmas USING btree (data);


--
-- Name: treinamento_turmas_log_turma_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX treinamento_turmas_log_turma_idx ON public.treinamento_turmas_log USING btree (turma_id);


--
-- Name: treinamento_turmas_planilha_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX treinamento_turmas_planilha_idx ON public.treinamento_turmas USING btree (planilha);


--
-- Name: twygo_conteudos_nome_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX twygo_conteudos_nome_idx ON public.twygo_conteudos USING btree (nome);


--
-- Name: twygo_participantes_content_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX twygo_participantes_content_idx ON public.twygo_participantes USING btree (content_title);


--
-- Name: twygo_participantes_departamento_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX twygo_participantes_departamento_idx ON public.twygo_participantes USING btree (departamento);


--
-- Name: twygo_participantes_nome_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX twygo_participantes_nome_idx ON public.twygo_participantes USING btree (nome_completo);


--
-- Name: twygo_participantes_unidade_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX twygo_participantes_unidade_idx ON public.twygo_participantes USING btree (unidade);


--
-- Name: twygo_usuarios_departamento_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX twygo_usuarios_departamento_idx ON public.twygo_usuarios USING btree (departamento);


--
-- Name: twygo_usuarios_nome_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX twygo_usuarios_nome_idx ON public.twygo_usuarios USING btree (nome_completo);


--
-- Name: twygo_usuarios_unidade_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX twygo_usuarios_unidade_idx ON public.twygo_usuarios USING btree (unidade);


--
-- Name: unibe_pdv_mes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX unibe_pdv_mes_idx ON public.unibe_pdv USING btree (mes);


--
-- Name: unibe_pessoas_mes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX unibe_pessoas_mes_idx ON public.unibe_pessoas USING btree (mes);


--
-- Name: upload_log_tabela_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX upload_log_tabela_created_idx ON public.upload_log USING btree (tabela, created_at DESC);


--
-- Name: usuarios_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX usuarios_email_key ON public.usuarios USING btree (lower(email));


--
-- Name: vagas_data_abertura_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vagas_data_abertura_idx ON public.vagas USING btree (data_abertura);


--
-- Name: vagas_departamento_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vagas_departamento_idx ON public.vagas USING btree (departamento);


--
-- Name: vagas_hub_alterado_em_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vagas_hub_alterado_em_idx ON public.vagas USING btree (hub_alterado_em);


--
-- Name: vagas_responsavel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vagas_responsavel_idx ON public.vagas USING btree (responsavel);


--
-- Name: vagas_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vagas_status_idx ON public.vagas USING btree (status);


--
-- Name: vagas_unidade_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vagas_unidade_idx ON public.vagas USING btree (unidade);


--
-- Name: viewas_log_alvo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX viewas_log_alvo_idx ON public.viewas_log USING btree (alvo_profile_id);


--
-- Name: viewas_log_iniciado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX viewas_log_iniciado_idx ON public.viewas_log USING btree (iniciado_em DESC);


--
-- Name: viewas_log_usuario_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX viewas_log_usuario_idx ON public.viewas_log USING btree (usuario_id);


--
-- Name: visitas_loja_area_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visitas_loja_area_idx ON public.visitas_loja USING btree (area);


--
-- Name: visitas_loja_data_visita_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visitas_loja_data_visita_idx ON public.visitas_loja USING btree (data_visita);


--
-- Name: records conexao_pilot_absence_validation; Type: TRIGGER; Schema: conexao_private; Owner: -
--

CREATE TRIGGER conexao_pilot_absence_validation BEFORE INSERT OR UPDATE ON conexao_private.records FOR EACH ROW EXECUTE FUNCTION conexao_private.validate_pilot_and_absence();


--
-- Name: records conexao_record_validation; Type: TRIGGER; Schema: conexao_private; Owner: -
--

CREATE TRIGGER conexao_record_validation BEFORE INSERT OR UPDATE ON conexao_private.records FOR EACH ROW EXECUTE FUNCTION conexao_private.validate_record();


--
-- Name: controle_desligamento controle_desligamento_recusado_link; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER controle_desligamento_recusado_link AFTER UPDATE OF status_entrevista ON public.controle_desligamento FOR EACH ROW EXECUTE FUNCTION public.controle_desligamento_recusado_link();


--
-- Name: entrevistas_desligamento controle_desligamento_sync_link; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER controle_desligamento_sync_link AFTER INSERT OR UPDATE OF status ON public.entrevistas_desligamento FOR EACH ROW EXECUTE FUNCTION public.controle_desligamento_sync_link();


--
-- Name: fechamento_periodo fechamento_periodo_trava; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER fechamento_periodo_trava BEFORE UPDATE ON public.fechamento_periodo FOR EACH ROW EXECUTE FUNCTION public.fechamento_periodo_trava();


--
-- Name: candidatos hub_marca_alteracao; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER hub_marca_alteracao BEFORE INSERT OR UPDATE ON public.candidatos FOR EACH ROW EXECUTE FUNCTION public.hub_marca_alteracao();


--
-- Name: vagas hub_marca_alteracao; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER hub_marca_alteracao BEFORE INSERT OR UPDATE ON public.vagas FOR EACH ROW EXECUTE FUNCTION public.hub_marca_alteracao();


--
-- Name: candidatos hub_versao; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER hub_versao AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.candidatos FOR EACH STATEMENT EXECUTE FUNCTION public.hub_versao_soma();


--
-- Name: controle_desligamento hub_versao; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER hub_versao AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.controle_desligamento FOR EACH STATEMENT EXECUTE FUNCTION public.hub_versao_soma();


--
-- Name: entrevista_pesquisa hub_versao; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER hub_versao AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.entrevista_pesquisa FOR EACH STATEMENT EXECUTE FUNCTION public.hub_versao_soma();


--
-- Name: entrevistas hub_versao; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER hub_versao AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.entrevistas FOR EACH STATEMENT EXECUTE FUNCTION public.hub_versao_soma();


--
-- Name: entrevistas_desligamento hub_versao; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER hub_versao AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.entrevistas_desligamento FOR EACH STATEMENT EXECUTE FUNCTION public.hub_versao_soma();


--
-- Name: onboarding hub_versao; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER hub_versao AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.onboarding FOR EACH STATEMENT EXECUTE FUNCTION public.hub_versao_soma();


--
-- Name: pareceres_gestor hub_versao; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER hub_versao AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.pareceres_gestor FOR EACH STATEMENT EXECUTE FUNCTION public.hub_versao_soma();


--
-- Name: vagas hub_versao; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER hub_versao AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.vagas FOR EACH STATEMENT EXECUTE FUNCTION public.hub_versao_soma();


--
-- Name: visitas_loja hub_versao; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER hub_versao AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.visitas_loja FOR EACH STATEMENT EXECUTE FUNCTION public.hub_versao_soma();


--
-- Name: profiles profiles_bloqueia_edicao_desligado; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_bloqueia_edicao_desligado BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_bloqueia_edicao_desligado();


--
-- Name: profiles profiles_protege_admin; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_protege_admin BEFORE INSERT OR DELETE OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_protege_admin();


--
-- Name: treinamento_turmas treinamento_turmas_log_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER treinamento_turmas_log_trg AFTER INSERT OR DELETE OR UPDATE ON public.treinamento_turmas FOR EACH ROW EXECUTE FUNCTION public.treinamento_turmas_registrar();


--
-- Name: candidatos candidatos_vaga_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidatos
    ADD CONSTRAINT candidatos_vaga_id_fkey FOREIGN KEY (vaga_id) REFERENCES public.vagas(id) ON DELETE SET NULL;


--
-- Name: engajamento_participacao engajamento_participacao_pulso_inicio_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engajamento_participacao
    ADD CONSTRAINT engajamento_participacao_pulso_inicio_fkey FOREIGN KEY (pulso_inicio) REFERENCES public.engajamento_pulso(inicio) ON DELETE CASCADE;


--
-- Name: entrevista_pesquisa entrevista_pesquisa_controle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entrevista_pesquisa
    ADD CONSTRAINT entrevista_pesquisa_controle_id_fkey FOREIGN KEY (controle_id) REFERENCES public.controle_desligamento(id) ON DELETE SET NULL;


--
-- Name: entrevistas entrevistas_candidato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entrevistas
    ADD CONSTRAINT entrevistas_candidato_id_fkey FOREIGN KEY (candidato_id) REFERENCES public.candidatos(id) ON DELETE CASCADE;


--
-- Name: entrevistas entrevistas_vaga_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entrevistas
    ADD CONSTRAINT entrevistas_vaga_id_fkey FOREIGN KEY (vaga_id) REFERENCES public.vagas(id) ON DELETE SET NULL;


--
-- Name: onboarding onboarding_candidato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding
    ADD CONSTRAINT onboarding_candidato_id_fkey FOREIGN KEY (candidato_id) REFERENCES public.candidatos(id) ON DELETE SET NULL;


--
-- Name: onboarding onboarding_vaga_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding
    ADD CONSTRAINT onboarding_vaga_id_fkey FOREIGN KEY (vaga_id) REFERENCES public.vagas(id) ON DELETE SET NULL;


--
-- Name: pareceres_gestor pareceres_gestor_candidato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pareceres_gestor
    ADD CONSTRAINT pareceres_gestor_candidato_id_fkey FOREIGN KEY (candidato_id) REFERENCES public.candidatos(id) ON DELETE CASCADE;


--
-- Name: pareceres_gestor pareceres_gestor_vaga_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pareceres_gestor
    ADD CONSTRAINT pareceres_gestor_vaga_id_fkey FOREIGN KEY (vaga_id) REFERENCES public.vagas(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict O4xSolTaknfz5rB1gQGeybFvh0XppGdkq2trfh5CsHRaX1ne5dADERP9ASOi6hy

