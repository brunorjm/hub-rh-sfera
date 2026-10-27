-- ============================================================================
-- Tráfego do Recrutamento — só baixar o que mudou (Fase 4, 14/10/2026)
-- ----------------------------------------------------------------------------
-- O Hub baixava vagas, candidatos etc. INTEIROS (~3 MB comprimidos) a cada
-- tela aberta do Recrutamento / T&D — o maior gasto de tráfego do projeto.
-- Agora:
--   - hub_versoes: um contador por tabela, somado automaticamente a cada
--     gravação (inserir / alterar / apagar / limpar). A tela consulta só esse
--     contador e não baixa de novo a tabela que não mudou.
--   - candidatos e vagas ganham hub_alterado_em (mantido pelo banco): quando
--     mudam, a tela baixa só as linhas alteradas + a lista de ids (para saber
--     o que foi apagado), não a tabela inteira.
-- Sem esse SQL o Hub continua funcionando como antes (baixa tudo).
--
-- Rodar uma vez no SQL Editor do Supabase. Pode rodar de novo sem problema.
-- ============================================================================

create table if not exists public.hub_versoes (
  tabela text primary key,
  versao bigint not null default 0,
  alterado_em timestamptz not null default now()
);
alter table public.hub_versoes enable row level security;
drop policy if exists hub_versoes_select on public.hub_versoes;
create policy hub_versoes_select on public.hub_versoes for select to authenticated using (true); -- só nomes de tabela e contadores
revoke insert, update, delete, truncate on public.hub_versoes from anon, authenticated;

create or replace function public.hub_versao_soma()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.hub_versoes (tabela, versao, alterado_em)
  values (tg_table_name, 1, now())
  on conflict (tabela) do update set versao = public.hub_versoes.versao + 1, alterado_em = now();
  return null;
end;
$$;
revoke all on function public.hub_versao_soma() from public, anon, authenticated;

create or replace function public.hub_marca_alteracao()
returns trigger
language plpgsql as $$
begin
  new.hub_alterado_em := now();
  return new;
end;
$$;
revoke all on function public.hub_marca_alteracao() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['vagas', 'candidatos', 'entrevistas', 'onboarding', 'visitas_loja', 'pareceres_gestor',
                           'entrevistas_desligamento', 'controle_desligamento', 'entrevista_pesquisa'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists hub_versao on public.%I', t);
    execute format('create trigger hub_versao after insert or update or delete or truncate on public.%I for each statement execute function public.hub_versao_soma()', t);
    insert into public.hub_versoes (tabela) values (t) on conflict (tabela) do nothing;
  end loop;

  foreach t in array array['vagas', 'candidatos'] loop
    execute format('alter table public.%I add column if not exists hub_alterado_em timestamptz not null default now()', t);
    execute format('create index if not exists %I on public.%I (hub_alterado_em)', t || '_hub_alterado_em_idx', t);
    execute format('drop trigger if exists hub_marca_alteracao on public.%I', t);
    execute format('create trigger hub_marca_alteracao before insert or update on public.%I for each row execute function public.hub_marca_alteracao()', t);
  end loop;
end $$;

-- Conferência: as tabelas acompanhadas (contador começa em 0).
select tabela, versao, alterado_em from public.hub_versoes order by tabela;
