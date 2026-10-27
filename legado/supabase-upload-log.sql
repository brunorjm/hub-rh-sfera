-- Log de uploads de planilhas (Administração → Upload de Planilhas).
-- Rodar uma vez no SQL Editor do Supabase. Idempotente.

create table if not exists public.upload_log (
  id bigint generated always as identity primary key,
  tabela text not null,
  arquivo text,
  usuario_id uuid,
  usuario_nome text,
  linhas integer,
  status text not null default 'ok' check (status in ('ok', 'erro')),
  erro text,
  created_at timestamptz not null default now()
);

create index if not exists upload_log_tabela_created_idx on public.upload_log (tabela, created_at desc);

alter table public.upload_log enable row level security;

drop policy if exists upload_log_select on public.upload_log;
create policy upload_log_select on public.upload_log for select
  using (public.has_permission('admin.upload'));

drop policy if exists upload_log_insert on public.upload_log;
create policy upload_log_insert on public.upload_log for insert
  with check (public.has_permission('admin.upload'));
