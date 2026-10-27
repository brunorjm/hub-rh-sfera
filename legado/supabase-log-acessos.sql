-- ============================================================================
-- Log de Acessos (Administração → Log de Acessos)
-- ----------------------------------------------------------------------------
-- Registra o acesso e o uso do Hub: entrada (login), retorno com a sessão já
-- aberta, saída e cada módulo aberto (o mesmo módulo só é registrado de novo
-- para a mesma pessoa depois de 30 minutos, na mesma aba — ver
-- js/admin/log-acessos.js). Não registra o que a pessoa viu dentro do módulo.
--
-- Gravação só pela função registrar_acesso(), que pega nome, e-mail e perfil
-- do cadastro de quem está logado (ninguém consegue gravar em nome de outro).
-- Não há policy de update/delete: o log não pode ser alterado pelo Hub.
-- Leitura: permissão admin.log_acessos (fora dos presets — só Administrador).
-- Registros com mais de 180 dias são apagados automaticamente (cota do
-- Supabase gratuito).
--
-- Rodar uma vez no SQL Editor do Supabase. Pode rodar de novo sem problema.
-- ============================================================================

create table if not exists public.acesso_log (
  id bigint generated always as identity primary key,
  usuario_id uuid not null,
  usuario_nome text,
  usuario_email text,
  perfil text,
  evento text not null check (evento in ('login', 'sessao', 'logout', 'modulo')),
  modulo text,
  dispositivo text,
  criado_em timestamptz not null default now()
);

create index if not exists acesso_log_criado_idx on public.acesso_log (criado_em desc);
create index if not exists acesso_log_usuario_idx on public.acesso_log (usuario_id, criado_em desc);

alter table public.acesso_log enable row level security;

drop policy if exists acesso_log_select on public.acesso_log;
create policy acesso_log_select on public.acesso_log for select
  using (public.has_permission('admin.log_acessos'));

create or replace function public.registrar_acesso(p_evento text, p_modulo text default null, p_dispositivo text default null)
returns void
language plpgsql security definer set search_path = public as $$
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

revoke all on function public.registrar_acesso(text, text, text) from public, anon;
grant execute on function public.registrar_acesso(text, text, text) to authenticated;

-- Conferência: a tabela existe e está vazia (o log começa a contar a partir
-- da publicação).
select count(*) as registros from public.acesso_log;
