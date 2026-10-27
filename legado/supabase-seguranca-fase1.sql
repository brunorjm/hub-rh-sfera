-- ============================================================================
-- Segurança — Fase 1 (diagnóstico de 14/10/2026)
-- ----------------------------------------------------------------------------
-- 1) Regras "para tudo" (FOR ALL) de gravação também liberavam LEITURA da
--    tabela inteira, por cima do recorte (ex.: 21 gestores com "Parecer do
--    Gestor" liam, alteravam e apagavam todos os candidatos). Cada uma vira
--    três regras só de gravação (inserir / alterar / apagar); a leitura fica só
--    com as regras de leitura que já existem (permissão + recorte).
--    Candidatos e Vagas: alterar/apagar também respeita o recorte; apagar
--    candidato só com a permissão "Candidatos".
-- 2) Cadastro público de contas: só cria login para e-mail autorizado pelo
--    Cadastro de Acessos (tabela cadastro_autorizado, válida por 1 dia).
-- 3) Só Administrador dá perfil Administrador, mexe no cadastro de outro
--    Administrador ou concede/retira permissões da Administração (admin.*).
-- 4) Funções do banco: visitante sem login só executa as 4 dos links
--    públicos (Entrevista de Desligamento e Parecer do Gestor).
-- 5) Link da Entrevista de Desligamento vale 30 dias e não devolve mais CPF
--    nem telefone.
--
-- Rodar uma vez no SQL Editor do Supabase. Pode rodar de novo sem problema.
-- Para criar um usuário pelo painel do Supabase (Authentication → Add user),
-- autorize o e-mail antes:
--   insert into public.cadastro_autorizado (email) values ('pessoa@empresa.com');
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) FOR ALL → inserir / alterar / apagar
-- ---------------------------------------------------------------------------
create table if not exists public.seguranca_fase1_relatorio (item text, detalhe text, em timestamptz default now());
truncate public.seguranca_fase1_relatorio;
alter table public.seguranca_fase1_relatorio enable row level security; -- sem policy: só o SQL Editor lê

do $$
declare
  p record;
  v_roles text;
  v_check text;
begin
  for p in
    select pol.schemaname, pol.tablename, pol.policyname, pol.roles, pol.qual, pol.with_check
    from pg_policies pol
    where pol.schemaname = 'public' and pol.cmd = 'ALL'
  loop
    -- Só converte se a tabela tem outra regra de LEITURA; senão quem grava
    -- perderia a leitura (fica no relatório para revisar à mão).
    if not exists (
      select 1 from pg_policies s
      where s.schemaname = 'public' and s.tablename = p.tablename and s.cmd = 'SELECT'
    ) then
      insert into public.seguranca_fase1_relatorio (item, detalhe)
      values ('NÃO convertida (sem regra de leitura própria)', p.tablename || '.' || p.policyname);
      continue;
    end if;
    v_roles := array_to_string(p.roles, ', ');
    v_check := coalesce(p.with_check, p.qual);
    execute format('drop policy if exists %I on public.%I', p.policyname || '_ins', p.tablename);
    execute format('drop policy if exists %I on public.%I', p.policyname || '_upd', p.tablename);
    execute format('drop policy if exists %I on public.%I', p.policyname || '_del', p.tablename);
    execute format('create policy %I on public.%I for insert to %s with check (%s)', p.policyname || '_ins', p.tablename, v_roles, v_check);
    execute format('create policy %I on public.%I for update to %s using (%s) with check (%s)', p.policyname || '_upd', p.tablename, v_roles, p.qual, v_check);
    execute format('create policy %I on public.%I for delete to %s using (%s)', p.policyname || '_del', p.tablename, v_roles, p.qual);
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
    insert into public.seguranca_fase1_relatorio (item, detalhe)
    values ('convertida (gravação separada da leitura)', p.tablename || '.' || p.policyname);
  end loop;
end $$;

-- Candidatos: alterar respeita o recorte; apagar só com "Candidatos" + recorte.
drop policy if exists candidatos_write_upd on public.candidatos;
create policy candidatos_write_upd on public.candidatos for update
  using ((public.has_permission('recrutamento.candidatos') or public.has_permission('recrutamento.parecer_gestor')) and public.can_see(unidade, departamento))
  with check (public.has_permission('recrutamento.candidatos') or public.has_permission('recrutamento.parecer_gestor'));
drop policy if exists candidatos_write_del on public.candidatos;
create policy candidatos_write_del on public.candidatos for delete
  using (public.has_permission('recrutamento.candidatos') and public.can_see(unidade, departamento));

-- Vagas: alterar e apagar respeitam o recorte.
drop policy if exists vagas_write_upd on public.vagas;
create policy vagas_write_upd on public.vagas for update
  using (public.has_permission('recrutamento.vagas') and public.can_see(unidade, departamento))
  with check (public.has_permission('recrutamento.vagas'));
drop policy if exists vagas_write_del on public.vagas;
create policy vagas_write_del on public.vagas for delete
  using (public.has_permission('recrutamento.vagas') and public.can_see(unidade, departamento));

-- ---------------------------------------------------------------------------
-- 2) Cadastro de contas só para e-mail autorizado
-- ---------------------------------------------------------------------------
create table if not exists public.cadastro_autorizado (
  email text primary key,
  autorizado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
alter table public.cadastro_autorizado enable row level security;
drop policy if exists cadastro_autorizado_select on public.cadastro_autorizado;
create policy cadastro_autorizado_select on public.cadastro_autorizado for select
  using (public.has_permission('admin.usuarios'));
drop policy if exists cadastro_autorizado_insert on public.cadastro_autorizado;
create policy cadastro_autorizado_insert on public.cadastro_autorizado for insert
  with check (public.has_permission('admin.usuarios'));
drop policy if exists cadastro_autorizado_update on public.cadastro_autorizado;
create policy cadastro_autorizado_update on public.cadastro_autorizado for update
  using (public.has_permission('admin.usuarios')) with check (public.has_permission('admin.usuarios'));
drop policy if exists cadastro_autorizado_delete on public.cadastro_autorizado;
create policy cadastro_autorizado_delete on public.cadastro_autorizado for delete
  using (public.has_permission('admin.usuarios'));

create or replace function public.auth_cadastro_so_autorizado()
returns trigger
language plpgsql security definer set search_path = public as $$
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
revoke all on function public.auth_cadastro_so_autorizado() from public, anon, authenticated;
grant execute on function public.auth_cadastro_so_autorizado() to supabase_auth_admin;

drop trigger if exists hub_cadastro_so_autorizado on auth.users;
create trigger hub_cadastro_so_autorizado before insert on auth.users
  for each row execute function public.auth_cadastro_so_autorizado();

-- ---------------------------------------------------------------------------
-- 3) Proteção do perfil Administrador
-- ---------------------------------------------------------------------------
create or replace function public.profiles_protege_admin()
returns trigger
language plpgsql security definer set search_path = public as $$
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
revoke all on function public.profiles_protege_admin() from public, anon, authenticated;

drop trigger if exists profiles_protege_admin on public.profiles;
create trigger profiles_protege_admin before insert or update or delete on public.profiles
  for each row execute function public.profiles_protege_admin();

-- ---------------------------------------------------------------------------
-- 4) Funções: visitante sem login só executa as dos links públicos
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
  v_auth boolean;
begin
  for f in
    select p.oid, p.oid::regprocedure as assinatura
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
  loop
    v_auth := has_function_privilege('authenticated', f.oid, 'EXECUTE');
    execute format('revoke execute on function %s from public, anon', f.assinatura);
    if v_auth then
      execute format('grant execute on function %s to authenticated', f.assinatura); -- mantém quem já tinha
    end if;
  end loop;
end $$;
grant execute on function public.entrevista_desligamento_publico_get(text) to anon;
grant execute on function public.entrevista_desligamento_publico_salvar(text, jsonb) to anon;
grant execute on function public.parecer_publico_get(text) to anon;
grant execute on function public.parecer_publico_salvar(text, jsonb, integer, text, text, text) to anon;
-- Funções criadas daqui para frente: sem execução para visitante sem login.
alter default privileges in schema public revoke execute on functions from public, anon;

-- ---------------------------------------------------------------------------
-- 5) Link da Entrevista de Desligamento: 30 dias e sem CPF/telefone
-- ---------------------------------------------------------------------------
create or replace function public.entrevista_desligamento_publico_get(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
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

create or replace function public.entrevista_desligamento_publico_salvar(p_token text, p_respostas jsonb)
returns boolean
language plpgsql security definer set search_path = public as $$
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
revoke all on function public.entrevista_desligamento_publico_get(text) from public;
revoke all on function public.entrevista_desligamento_publico_salvar(text, jsonb) from public;
grant execute on function public.entrevista_desligamento_publico_get(text) to anon, authenticated;
grant execute on function public.entrevista_desligamento_publico_salvar(text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------------
select item, detalhe from public.seguranca_fase1_relatorio
union all
select 'regras FOR ALL que sobraram', count(*)::text from pg_policies where schemaname = 'public' and cmd = 'ALL'
union all
select 'funções que o visitante sem login executa', coalesce(string_agg(p.proname, ', ' order by p.proname), 'nenhuma')
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'EXECUTE')
union all
select 'gatilho de cadastro autorizado', count(*)::text from pg_trigger where tgname = 'hub_cadastro_so_autorizado'
union all
select 'gatilho de proteção do Administrador', count(*)::text from pg_trigger where tgname = 'profiles_protege_admin'
order by 1, 2;
