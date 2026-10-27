-- Módulo Treinamentos (Indicadores → Treinamentos): Unibê e Academia Hering por
-- upload, com histórico mês a mês, e a data de conclusão das inscrições do Twygo.
-- Rode ANTES de publicar o código novo. Pode rodar mais de uma vez.
--
--   unibe_pdv        planilha 27.1 Unibê, aba "Visão Geral - PDV" (adesão oficial da loja)
--   unibe_pessoas    planilha 27.1 Unibê, aba "Visão Geral - Pessoa"
--   academia_hering  planilha 27.2 Academia Hering (horas e performance por pessoa)
--
-- As duas planilhas não têm data (são uma foto do dia da exportação): quem envia
-- escolhe o mês de referência no card de upload. Reenviar o mesmo mês substitui
-- só aquele mês. A unidade/departamento de cada linha vem do cadastro de
-- Colaboradores (casado pelo nome no navegador, na hora do upload) e segue o
-- recorte de acesso de sempre: can_see(unidade, departamento) + permissão
-- indicadores.treinamentos.

-- ----------------------------------------------------------------------------
-- Twygo: data em que a inscrição chegou a 100% e data de aprovação
-- ----------------------------------------------------------------------------
alter table public.twygo_participantes add column if not exists concluido_em date;
alter table public.twygo_participantes add column if not exists aprovado_em date;

-- ----------------------------------------------------------------------------
-- Tabelas
-- ----------------------------------------------------------------------------
create table if not exists public.unibe_pdv (
  id bigserial primary key,
  mes date not null,              -- 1º dia do mês de referência
  pdv text not null,              -- código do PDV
  nome_pdv text,
  regiao text,
  segmento text,
  gerente text,
  supervisao text,
  multi text,
  adesao numeric,                 -- 0 a 1 ("ADESÃO ATUAL")
  pessoas int,                    -- pessoas da aba Pessoa neste PDV
  unidade text,
  departamento text
);
create index if not exists unibe_pdv_mes_idx on public.unibe_pdv (mes);

create table if not exists public.unibe_pessoas (
  id bigserial primary key,
  mes date not null,
  nome text not null,
  cargo text,
  pdv text,
  nome_pdv text,
  regiao text,
  segmento text,
  adesao numeric,                 -- 0 a 1 ("ADESÃO IAF")
  unidade text,
  departamento text,
  no_cadastro boolean not null default false,  -- achado no cadastro de Colaboradores
  nome_cadastro text              -- nome completo no cadastro (a Academia abrevia os nomes)
);
create index if not exists unibe_pessoas_mes_idx on public.unibe_pessoas (mes);

create table if not exists public.academia_hering (
  id bigserial primary key,
  mes date not null,
  nome text not null,
  cargo text,
  loja text,                      -- como vem da Academia ("HERING STORE - RUA DO CATETE")
  ultimo_acesso date,
  horas numeric,                  -- horas decimais
  performance numeric,            -- pontos
  unidade text,
  departamento text,
  no_cadastro boolean not null default false,
  nome_cadastro text
);
create index if not exists academia_hering_mes_idx on public.academia_hering (mes);

-- ----------------------------------------------------------------------------
-- Leitura (RLS)
-- Academia Hering é só da marca Hering e Unibê só do Boticário (loja e VD): as
-- linhas levam a unidade do cadastro (só unidades da marca entram no casamento),
-- e linha SEM unidade não passa para quem tem recorte (no can_see, unidade nula
-- passaria para todos) — por isso o coalesce.
-- ----------------------------------------------------------------------------
-- Unibê também é aberta ao Escritório (decisão do RH, 09/10/2026): quem tem a
-- unidade Escritório liberada no cadastro vê a Unibê inteira. A Academia Hering não.
create or replace function public.treinamentos_ve_escritorio()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'ativo'
      and exists (select 1 from unnest(p.unidades) as u where lower(trim(u)) in ('escritório', 'escritorio'))
  )
$$;
revoke all on function public.treinamentos_ve_escritorio() from public, anon;
grant execute on function public.treinamentos_ve_escritorio() to authenticated;

alter table public.unibe_pdv enable row level security;
alter table public.unibe_pessoas enable row level security;
alter table public.academia_hering enable row level security;

do $$
declare t text;
begin
  foreach t in array array['unibe_pdv', 'unibe_pessoas', 'academia_hering'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select using (public.has_permission(%L) and (public.can_see(coalesce(unidade, %L), departamento)%s))',
      t || '_select', t, 'indicadores.treinamentos', '(sem unidade)',
      case when t like 'unibe%' then ' or public.treinamentos_ve_escritorio()' else '' end
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Gravação: um mês por vez, numa transação (apaga o mês e grava o arquivo).
-- ----------------------------------------------------------------------------
create or replace function public.treinamentos_salvar_unibe(p_mes date, p_pdvs jsonb, p_pessoas jsonb)
returns int
language plpgsql security definer set search_path = public as $$
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

create or replace function public.treinamentos_salvar_academia(p_mes date, p_linhas jsonb)
returns int
language plpgsql security definer set search_path = public as $$
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

revoke all on function public.treinamentos_salvar_unibe(date, jsonb, jsonb) from public, anon;
revoke all on function public.treinamentos_salvar_academia(date, jsonb) from public, anon;
grant execute on function public.treinamentos_salvar_unibe(date, jsonb, jsonb) to authenticated;
grant execute on function public.treinamentos_salvar_academia(date, jsonb) to authenticated;

-- Conferência: as 3 policies e as 2 colunas novas do Twygo.
select tablename as objeto, qual as regra
from pg_policies
where schemaname = 'public' and tablename in ('unibe_pdv', 'unibe_pessoas', 'academia_hering') and cmd = 'SELECT'
union all
select 'twygo_participantes.' || column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'twygo_participantes' and column_name in ('concluido_em', 'aprovado_em')
order by 1;
