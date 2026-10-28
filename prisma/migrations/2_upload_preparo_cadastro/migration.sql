-- 2_upload_preparo_cadastro — upload de planilha atômico e cadastro só para e-mail autorizado.
--
-- Aditiva: cria uma tabela, uma função e uma trigger. Não mexe em dado existente.
--
-- 1) upload_preparo: área de preparo do Upload de Planilhas (Administração).
--    O navegador manda as linhas em lotes (admin.uploadLote) e a operação final
--    (admin.uploadConcluir) troca a tabela de destino numa transação só:
--    admin_truncate + insert de tudo o que está no preparo + upload_log. Se
--    qualquer passo falhar, nada muda e os dados antigos ficam (antes: truncate
--    e insert em lotes de 500; se caísse no meio, a tabela ficava vazia).
--    Cada pessoa só vê e apaga os próprios lotes, e só com admin.upload.
--
-- 2) Cadastro só para e-mail autorizado (Segurança Fase 1, item 2): no Supabase
--    a trigger hub_cadastro_so_autorizado ficava em auth.users. Aqui o login é
--    public.usuarios, então a mesma regra vai para ela: criar login exige o
--    e-mail em cadastro_autorizado há menos de 1 dia, e a autorização é
--    consumida. Vale para quem cria pela aplicação (auth.uid() preenchido);
--    o dono do banco (migrations, importação, seeds) passa, como o SQL Editor
--    passava em profiles_protege_admin.

-- ---------------------------------------------------------------------------
-- 1) upload_preparo
-- ---------------------------------------------------------------------------
create table if not exists public.upload_preparo (
  id bigint generated always as identity primary key,
  usuario_id uuid not null default auth.uid(),
  lote uuid not null,
  tabela text not null,
  ordem integer not null check (ordem >= 0),
  colunas text[] not null,
  linhas jsonb not null check (jsonb_typeof(linhas) = 'array'),
  qtd integer not null check (qtd >= 0),
  criado_em timestamptz not null default now(),
  unique (usuario_id, lote, ordem)
);
create index if not exists upload_preparo_usuario_criado_idx on public.upload_preparo (usuario_id, criado_em);

alter table public.upload_preparo enable row level security;
drop policy if exists upload_preparo_select on public.upload_preparo;
create policy upload_preparo_select on public.upload_preparo for select to hub_app
  using (usuario_id = (select auth.uid()) and (select public.has_permission('admin.upload')));
drop policy if exists upload_preparo_insert on public.upload_preparo;
create policy upload_preparo_insert on public.upload_preparo for insert to hub_app
  with check (usuario_id = (select auth.uid()) and (select public.has_permission('admin.upload')));
drop policy if exists upload_preparo_delete on public.upload_preparo;
create policy upload_preparo_delete on public.upload_preparo for delete to hub_app
  using (usuario_id = (select auth.uid()) and (select public.has_permission('admin.upload')));

-- Sem update: um lote gravado não muda; reenviar = lote novo.
revoke all on public.upload_preparo from hub_app;
grant select, insert, delete on public.upload_preparo to hub_app;

-- ---------------------------------------------------------------------------
-- 2) Login só para e-mail autorizado
-- ---------------------------------------------------------------------------
create or replace function public.usuarios_cadastro_so_autorizado()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new; -- dono do banco: migrations, importação, seeds
  end if;
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
revoke all on function public.usuarios_cadastro_so_autorizado() from public;

drop trigger if exists usuarios_cadastro_so_autorizado on public.usuarios;
create trigger usuarios_cadastro_so_autorizado before insert on public.usuarios
  for each row execute function public.usuarios_cadastro_so_autorizado();
