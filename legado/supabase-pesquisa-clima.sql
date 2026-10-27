-- Pesquisa de Clima (Pré-GPTW 2026) — rode UMA vez no SQL Editor do Supabase,
-- depois do supabase-migration.sql principal. Alimenta Indicadores → Pesquisa
-- de Clima. Não há upload: os dados foram importados uma única vez.
--
-- ANONIMATO: a pesquisa é anônima. Estas tabelas NÃO guardam nome, CPF nem
-- e-mail. A leitura exige a permissão 'indicadores.pesquisa_clima' além de
-- can_see(unidade, departamento).

create table if not exists public.pesquisa_clima (
  id bigserial primary key,
  dimensao text,            -- ex.: "gptw respeito", "nr-1 demandas", "nps gestor"
  pergunta text,
  nota numeric,             -- 1-5 (GPTW/NR-1) ou 0-10 (NPS)
  comentario text,
  data_resposta date,
  posicao text,             -- "É líder" / "É liderado"
  lider text,
  tempo_empresa_meses int,
  unidade text,
  departamento text
);
create index if not exists pesquisa_clima_unidade_idx on public.pesquisa_clima (unidade);
create index if not exists pesquisa_clima_departamento_idx on public.pesquisa_clima (departamento);
create index if not exists pesquisa_clima_dimensao_idx on public.pesquisa_clima (dimensao);
create index if not exists pesquisa_clima_data_idx on public.pesquisa_clima (data_resposta);

alter table public.pesquisa_clima enable row level security;

drop policy if exists pesquisa_clima_select on public.pesquisa_clima;
create policy pesquisa_clima_select on public.pesquisa_clima for select
  using (public.has_permission('indicadores.pesquisa_clima') and public.can_see(unidade, departamento));

drop policy if exists pesquisa_clima_write on public.pesquisa_clima;
create policy pesquisa_clima_write on public.pesquisa_clima for all
  using (public.has_permission('admin.upload')) with check (public.has_permission('admin.upload'));

-- Headcount da época da pesquisa (aba "Headcount" do Excel): base para calcular
-- participação (HC × respondentes × faltam). SEM nomes — só o recorte.
create table if not exists public.pesquisa_clima_hc (
  id bigserial primary key,
  unidade text,
  departamento text,
  papel text,        -- "Gestor" / "Colaborador"
  lider text,        -- gestor direto
  situacao text      -- "Ativo" / "Desativado"
);
create index if not exists pesquisa_clima_hc_unidade_idx on public.pesquisa_clima_hc (unidade);
alter table public.pesquisa_clima_hc enable row level security;

drop policy if exists pesquisa_clima_hc_select on public.pesquisa_clima_hc;
create policy pesquisa_clima_hc_select on public.pesquisa_clima_hc for select
  using (public.has_permission('indicadores.pesquisa_clima') and public.can_see(unidade, departamento));

drop policy if exists pesquisa_clima_hc_write on public.pesquisa_clima_hc;
create policy pesquisa_clima_hc_write on public.pesquisa_clima_hc for all
  using (public.has_permission('admin.upload')) with check (public.has_permission('admin.upload'));
