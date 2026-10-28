-- Fechamento do Período — o que o RH escreve em cada fechamento e a foto dos
-- números quando o período é fechado. Rode UMA vez no SQL Editor do Supabase,
-- depois do supabase-fechamento-vagas.sql. Pode rodar de novo sem problema.
--
-- Uma linha por período (id = tipo-ano-n, ex.: mensal-2026-9, bimestral-2026-4):
--   textos  → texto de abertura reescrito pelo RH, por slide ({ "rs-finalizadas": "..." })
--   manuais → slides escritos pelo RH ({ "man-rs-projetos": { titulo, subtitulo, cards } })
--   ocultos → slides que não entram na apresentação nem no PPTX
--   status  → 'rascunho' ou 'fechado'; fechado guarda em snapshot os slides
--             como foram apresentados (os números não mudam com uploads novos).
-- Acesso: indicadores.fechamento (o Administrador sempre tem).

create table if not exists public.fechamento_periodo (
  id text primary key,
  tipo text not null check (tipo in ('mensal', 'bimestral', 'semestral', 'anual')),
  ano int not null,
  n int not null,
  textos jsonb not null default '{}'::jsonb,
  manuais jsonb not null default '{}'::jsonb,
  ocultos text[] not null default '{}',
  status text not null default 'rascunho' check (status in ('rascunho', 'fechado')),
  snapshot jsonb,
  fechado_em timestamptz,
  fechado_por text,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

alter table public.fechamento_periodo enable row level security;

drop policy if exists fechamento_periodo_select on public.fechamento_periodo;
create policy fechamento_periodo_select on public.fechamento_periodo for select
  using (public.has_permission('indicadores.fechamento'));

drop policy if exists fechamento_periodo_insert on public.fechamento_periodo;
create policy fechamento_periodo_insert on public.fechamento_periodo for insert
  with check (public.has_permission('indicadores.fechamento'));

drop policy if exists fechamento_periodo_update on public.fechamento_periodo;
create policy fechamento_periodo_update on public.fechamento_periodo for update
  using (public.has_permission('indicadores.fechamento'))
  with check (public.has_permission('indicadores.fechamento'));

-- Período fechado não aceita edição de textos/slides: só reabrir (status volta
-- para 'rascunho') ou continuar fechado sem mudança de conteúdo.
create or replace function public.fechamento_periodo_trava()
returns trigger
language plpgsql as $$
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

drop trigger if exists fechamento_periodo_trava on public.fechamento_periodo;
create trigger fechamento_periodo_trava before update on public.fechamento_periodo
  for each row execute function public.fechamento_periodo_trava();

-- Conferência: deve mostrar RLS ligado e 3 policies.
select 'fechamento_periodo' as objeto, relrowsecurity::text as rls from pg_class where relname = 'fechamento_periodo'
union all
select 'policies', count(*)::text from pg_policies where tablename = 'fechamento_periodo';
