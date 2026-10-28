-- Pesquisa de Engajamento (índice de participação por pulso) — rode UMA vez no
-- SQL Editor do Supabase, depois do supabase-migration.sql principal. Alimenta
-- Indicadores → Pesquisa de Engajamento. Idempotente.
--
-- Este módulo acompanha SÓ a participação (convidados × responderam), por
-- unidade e departamento. NÃO guarda respostas, notas, comentários nem nomes:
-- a pesquisa é anônima e aqui só entram contagens.
--
-- Carga dos dados (Administração → Upload de Planilhas): UMA planilha, a "33. Pesquisa de
-- Engajamento" (abas Adesão e Respostas). A base de convidados por unidade/departamento
-- vem do headcount ativo do Hub. Toda gravação passa pela função engajamento_salvar_base
-- (uma transação só, exige a permissão admin.upload) — as tabelas não têm policy de
-- escrita direta.

create table if not exists public.engajamento_pulso (
  id bigserial primary key,
  inicio date not null unique,
  fim date not null,
  numero int,                    -- 26 = "26º pulso"; null se ainda não há histórico
  convidados int not null,
  respondentes int not null,
  parcial boolean not null default false,
  ultima_resposta timestamp,     -- "última resposta registrada" informada pelo Feedz
  fonte text not null default 'feedz' check (fonte in ('feedz', 'historico')),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.engajamento_participacao (
  id bigserial primary key,
  pulso_inicio date not null references public.engajamento_pulso (inicio) on delete cascade,
  unidade text,
  departamento text,
  gestor text,                   -- gestor direto mais frequente entre os convidados do departamento
  convidados int,                -- "foto" do headcount ativo; null nos pulsos antigos (base estimada na tela)
  respondentes int not null default 0
);
-- Origem do pulso: 'base' = planilha 33 (atual); 'feedz'/'historico' = cargas antigas.
alter table public.engajamento_pulso drop constraint if exists engajamento_pulso_fonte_check;
alter table public.engajamento_pulso add constraint engajamento_pulso_fonte_check check (fonte in ('feedz', 'historico', 'base'));
create index if not exists engajamento_participacao_pulso_idx on public.engajamento_participacao (pulso_inicio);
create index if not exists engajamento_participacao_unidade_idx on public.engajamento_participacao (unidade);

alter table public.engajamento_pulso enable row level security;
alter table public.engajamento_participacao enable row level security;

-- Totais por pulso (sem unidade/departamento): quem tem a permissão vê.
drop policy if exists engajamento_pulso_select on public.engajamento_pulso;
create policy engajamento_pulso_select on public.engajamento_pulso for select
  using (public.has_permission('indicadores.engajamento'));

-- Participação por unidade/departamento: respeita o recorte do usuário.
drop policy if exists engajamento_participacao_select on public.engajamento_participacao;
create policy engajamento_participacao_select on public.engajamento_participacao for select
  using (public.has_permission('indicadores.engajamento') and public.can_see(unidade, departamento));

-- ----------------------------------------------------------------------------
-- Grava a planilha 33 inteira (todos os pulsos) numa transação só.
--   • Substitui todos os pulsos e as linhas de participação pelo conteúdo do arquivo.
--   • A base de convidados por unidade/departamento ("foto" do headcount ativo) é
--     gravada no pulso mais recente. Enquanto o pulso está aberto ela é refeita a
--     cada upload; depois que o pulso encerra (fim < p_hoje) fica CONGELADA: os
--     próximos uploads atualizam só os respondentes e mantêm a base daquela época.
-- p_pulsos:  [{inicio, fim, numero, convidados, respondentes, parcial, ultima_resposta}]
-- p_linhas:  [{pulso_inicio, unidade, departamento, gestor, convidados, respondentes}]
-- ----------------------------------------------------------------------------
create or replace function public.engajamento_salvar_base(p_pulsos jsonb, p_linhas jsonb, p_hoje date)
returns jsonb
language plpgsql security definer set search_path = public as $$
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

  -- Base congelada: pulsos já encerrados que têm a foto do headcount gravada.
  create temp table _eng_congelado on commit drop as
    select r.pulso_inicio, r.unidade, r.departamento, r.gestor, r.convidados
    from public.engajamento_participacao r
    join public.engajamento_pulso p on p.inicio = r.pulso_inicio
    where p.fim < p_hoje and r.convidados is not null;

  delete from public.engajamento_pulso where true;   -- as linhas de participação saem junto (cascade)

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

revoke all on function public.engajamento_salvar_base(jsonb, jsonb, date) from public, anon;
grant execute on function public.engajamento_salvar_base(jsonb, jsonb, date) to authenticated;

-- Versões anteriores (dois uploads: histórico + export do Feedz) — não são mais usadas.
drop function if exists public.engajamento_salvar_pulso(jsonb, jsonb);
drop function if exists public.engajamento_salvar_historico(jsonb, jsonb);

-- Permissão indicadores.engajamento: só o perfil Administrador enxerga o módulo
-- (has_permission() já libera o admin). Ninguém mais recebe automaticamente — RH e
-- Gestor ficam fora dos presets; se um dia for preciso liberar alguém, marque a
-- permissão no Cadastro de Acessos.
