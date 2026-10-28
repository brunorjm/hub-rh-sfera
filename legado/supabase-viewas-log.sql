-- Log de auditoria do "Visualizar como" (Administração → Cadastro de Acessos).
-- Rodar uma vez no SQL Editor do Supabase. Idempotente.
--
-- Registra quem usou o modo de visualização, para qual conta, quando começou
-- e quando terminou (nulo = ainda estava aberto quando a página foi fechada/
-- recarregada, sem clicar em "Sair da visualização"). Só quem tem
-- admin.usuarios (a mesma permissão que libera o próprio recurso) pode ler
-- ou gravar neste log.

create table if not exists public.viewas_log (
  id bigint generated always as identity primary key,
  usuario_id uuid,
  usuario_nome text,
  alvo_profile_id uuid,
  alvo_nome text,
  alvo_email text,
  alvo_perfil text,
  iniciado_em timestamptz not null default now(),
  encerrado_em timestamptz
);

create index if not exists viewas_log_iniciado_idx on public.viewas_log (iniciado_em desc);
create index if not exists viewas_log_usuario_idx on public.viewas_log (usuario_id);
create index if not exists viewas_log_alvo_idx on public.viewas_log (alvo_profile_id);

alter table public.viewas_log enable row level security;

drop policy if exists viewas_log_select on public.viewas_log;
create policy viewas_log_select on public.viewas_log for select
  using (public.has_permission('admin.usuarios'));

drop policy if exists viewas_log_insert on public.viewas_log;
create policy viewas_log_insert on public.viewas_log for insert
  with check (public.has_permission('admin.usuarios'));

-- update só fecha o próprio registro (encerrado_em) — nunca apaga nem
-- reescreve o que já foi gravado no início da visualização.
drop policy if exists viewas_log_update on public.viewas_log;
create policy viewas_log_update on public.viewas_log for update
  using (public.has_permission('admin.usuarios')) with check (public.has_permission('admin.usuarios'));
