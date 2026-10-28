-- Boletim da Liderança — rode UMA vez no SQL Editor do Supabase, depois do
-- supabase-migration.sql e do supabase-engajamento.sql. Idempotente.
--
-- Alimenta Indicadores → Boletim da Liderança. A maior parte dos números vem
-- de tabelas que o Hub já tem (colaboradores, feedbacks, one_on_one,
-- celebracoes, twygo_participantes, avaliacao_experiencia_45/90,
-- engajamento_pulso/participacao). Aqui ficam só:
--
--   humor_mensal          Termômetro de Humor, agregado por mês × unidade × departamento
--   engajamento_notas     notas da Pesquisa de Engajamento, agregadas por dia × unidade × departamento × dimensão
--   satisfacao_suporte    Pesquisa de Satisfação com o Suporte do Escritório, agregada por pesquisa × unidade × departamento
--   boletim_entradas      valores informados à mão (Unibê, Academia Hering, ajustes)
--   boletim_fechamento    foto congelada do boletim de cada mês/operação (o que foi publicado)
--
-- Nenhuma dessas tabelas guarda nome, CPF, e-mail ou comentário: as planilhas
-- são agregadas no navegador antes de gravar (js/parsers-boletim.js).
-- Gravação só pelas funções abaixo (exigem a permissão admin.upload).

-- ----------------------------------------------------------------------------
-- Tabelas
-- ----------------------------------------------------------------------------
create table if not exists public.humor_mensal (
  id bigserial primary key,
  mes date not null,              -- 1º dia do mês
  unidade text,
  departamento text,
  registros int not null,
  soma numeric not null,          -- soma das notas (1 a 5) → média = soma / registros
  pessoas int not null,           -- pessoas distintas que registraram humor no mês
  dist jsonb not null default '{}'  -- {"1": n, ..., "5": n}
);
create index if not exists humor_mensal_mes_idx on public.humor_mensal (mes);

create table if not exists public.engajamento_notas (
  id bigserial primary key,
  dia date not null,
  unidade text,
  departamento text,
  dimensao text not null,         -- pilar; 'NPS' para a pergunta de recomendação (0 a 10)
  soma numeric not null,
  n int not null,
  promotores int not null default 0,   -- só NPS: notas 9-10
  detratores int not null default 0    -- só NPS: notas 0-6
);
create index if not exists engajamento_notas_dia_idx on public.engajamento_notas (dia);

create table if not exists public.satisfacao_suporte (
  id bigserial primary key,
  pesquisa date not null,         -- mês de referência (coluna PESQUISA da planilha)
  unidade text,
  departamento text,
  respondentes int not null,
  areas jsonb not null default '{}'   -- {"DP": {"soma": 52, "n": 6}, ...}
);
create index if not exists satisfacao_suporte_pesquisa_idx on public.satisfacao_suporte (pesquisa);

create table if not exists public.boletim_entradas (
  id bigserial primary key,
  mes date not null,
  operacao text not null,         -- id da operação (boti-rj, hering, ...) — ver js/metrics-boletim.js
  loja text,                      -- departamento; null = valor da operação inteira
  indicador text not null,        -- unibe_adesao, academia_pontos, ...
  valor numeric not null,
  atualizado_por text,
  atualizado_em timestamptz not null default now()
);
create unique index if not exists boletim_entradas_chave on public.boletim_entradas (mes, operacao, coalesce(loja, ''), indicador);

create table if not exists public.boletim_fechamento (
  id bigserial primary key,
  mes date not null,
  operacao text not null,
  dados jsonb not null,           -- indicadores da operação e das lojas, como publicados
  fechado_por text,
  fechado_em timestamptz not null default now(),
  unique (mes, operacao)
);

-- ----------------------------------------------------------------------------
-- Leitura (RLS): permissão indicadores.boletim; linhas por unidade/departamento
-- respeitam o recorte do usuário (can_see), como o resto dos Indicadores.
-- ----------------------------------------------------------------------------
alter table public.humor_mensal enable row level security;
alter table public.engajamento_notas enable row level security;
alter table public.satisfacao_suporte enable row level security;
alter table public.boletim_entradas enable row level security;
alter table public.boletim_fechamento enable row level security;

drop policy if exists humor_mensal_select on public.humor_mensal;
create policy humor_mensal_select on public.humor_mensal for select
  using (public.has_permission('indicadores.boletim') and public.can_see(unidade, departamento));

drop policy if exists engajamento_notas_select on public.engajamento_notas;
create policy engajamento_notas_select on public.engajamento_notas for select
  using (public.has_permission('indicadores.boletim') and public.can_see(unidade, departamento));

drop policy if exists satisfacao_suporte_select on public.satisfacao_suporte;
create policy satisfacao_suporte_select on public.satisfacao_suporte for select
  using (public.has_permission('indicadores.boletim') and public.can_see(unidade, departamento));

drop policy if exists boletim_entradas_select on public.boletim_entradas;
create policy boletim_entradas_select on public.boletim_entradas for select
  using (public.has_permission('indicadores.boletim'));

drop policy if exists boletim_fechamento_select on public.boletim_fechamento;
create policy boletim_fechamento_select on public.boletim_fechamento for select
  using (public.has_permission('indicadores.boletim'));

-- ----------------------------------------------------------------------------
-- Gravação. As planilhas são enviadas em lotes: o PRIMEIRO lote vem com
-- p_limpar = true e apaga o período coberto pelo arquivo; os seguintes só
-- inserem. Assim o arquivo pode ter qualquer tamanho sem estourar o limite de
-- uma requisição.
-- ----------------------------------------------------------------------------
create or replace function public.boletim_salvar_humor(p_meses date[], p_linhas jsonb, p_limpar boolean)
returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not public.has_permission('admin.upload') then raise exception 'Você não tem permissão para importar planilhas.'; end if;
  if p_limpar then delete from public.humor_mensal where mes = any(p_meses); end if;
  insert into public.humor_mensal (mes, unidade, departamento, registros, soma, pessoas, dist)
  select x.mes, x.unidade, x.departamento, x.registros, x.soma, x.pessoas, coalesce(x.dist, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(p_linhas, '[]'::jsonb)) as x(mes date, unidade text, departamento text, registros int, soma numeric, pessoas int, dist jsonb);
  get diagnostics v = row_count;
  return v;
end;
$$;

create or replace function public.boletim_salvar_eng_notas(p_inicio date, p_fim date, p_linhas jsonb, p_limpar boolean)
returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not public.has_permission('admin.upload') then raise exception 'Você não tem permissão para importar planilhas.'; end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio then raise exception 'Período inválido.'; end if;
  if p_limpar then delete from public.engajamento_notas where dia between p_inicio and p_fim; end if;
  insert into public.engajamento_notas (dia, unidade, departamento, dimensao, soma, n, promotores, detratores)
  select x.dia, x.unidade, x.departamento, x.dimensao, x.soma, x.n, coalesce(x.promotores, 0), coalesce(x.detratores, 0)
  from jsonb_to_recordset(coalesce(p_linhas, '[]'::jsonb)) as x(dia date, unidade text, departamento text, dimensao text, soma numeric, n int, promotores int, detratores int)
  where x.dia between p_inicio and p_fim;
  get diagnostics v = row_count;
  return v;
end;
$$;

create or replace function public.boletim_salvar_satisfacao(p_meses date[], p_linhas jsonb, p_limpar boolean)
returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not public.has_permission('admin.upload') then raise exception 'Você não tem permissão para importar planilhas.'; end if;
  if p_limpar then delete from public.satisfacao_suporte where pesquisa = any(p_meses); end if;
  insert into public.satisfacao_suporte (pesquisa, unidade, departamento, respondentes, areas)
  select x.pesquisa, x.unidade, x.departamento, x.respondentes, coalesce(x.areas, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(p_linhas, '[]'::jsonb)) as x(pesquisa date, unidade text, departamento text, respondentes int, areas jsonb);
  get diagnostics v = row_count;
  return v;
end;
$$;

-- Valor manual: p_valor null apaga a entrada.
create or replace function public.boletim_salvar_entrada(p_mes date, p_operacao text, p_loja text, p_indicador text, p_valor numeric, p_usuario text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('admin.upload') then raise exception 'Você não tem permissão para editar o boletim.'; end if;
  -- Mês fechado não aceita edição (reabra o mês para alterar).
  if exists (select 1 from public.boletim_fechamento where mes = p_mes) then
    raise exception 'Este mês está fechado. Reabra o mês para alterar os valores manuais.';
  end if;
  delete from public.boletim_entradas
    where mes = p_mes and operacao = p_operacao and coalesce(loja, '') = coalesce(p_loja, '') and indicador = p_indicador;
  if p_valor is not null then
    insert into public.boletim_entradas (mes, operacao, loja, indicador, valor, atualizado_por)
    values (p_mes, p_operacao, nullif(p_loja, ''), p_indicador, p_valor, p_usuario);
  end if;
end;
$$;

-- Fecha (congela) o boletim do mês: p_itens = [{"operacao": "...", "dados": {...}}, ...].
-- Fechar de novo o mesmo mês substitui a foto anterior.
create or replace function public.boletim_fechar(p_mes date, p_itens jsonb, p_usuario text)
returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not public.has_permission('admin.upload') then raise exception 'Você não tem permissão para fechar o boletim.'; end if;
  delete from public.boletim_fechamento where mes = p_mes
    and operacao in (select x.operacao from jsonb_to_recordset(p_itens) as x(operacao text));
  insert into public.boletim_fechamento (mes, operacao, dados, fechado_por)
  select p_mes, x.operacao, x.dados, p_usuario
  from jsonb_to_recordset(coalesce(p_itens, '[]'::jsonb)) as x(operacao text, dados jsonb);
  get diagnostics v = row_count;
  return v;
end;
$$;

create or replace function public.boletim_reabrir(p_mes date)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('admin.upload') then raise exception 'Você não tem permissão para reabrir o boletim.'; end if;
  delete from public.boletim_fechamento where mes = p_mes;
end;
$$;

revoke all on function public.boletim_salvar_humor(date[], jsonb, boolean) from public, anon;
revoke all on function public.boletim_salvar_eng_notas(date, date, jsonb, boolean) from public, anon;
revoke all on function public.boletim_salvar_satisfacao(date[], jsonb, boolean) from public, anon;
revoke all on function public.boletim_salvar_entrada(date, text, text, text, numeric, text) from public, anon;
revoke all on function public.boletim_fechar(date, jsonb, text) from public, anon;
revoke all on function public.boletim_reabrir(date) from public, anon;
grant execute on function public.boletim_salvar_humor(date[], jsonb, boolean) to authenticated;
grant execute on function public.boletim_salvar_eng_notas(date, date, jsonb, boolean) to authenticated;
grant execute on function public.boletim_salvar_satisfacao(date[], jsonb, boolean) to authenticated;
grant execute on function public.boletim_salvar_entrada(date, text, text, text, numeric, text) to authenticated;
grant execute on function public.boletim_fechar(date, jsonb, text) to authenticated;
grant execute on function public.boletim_reabrir(date) to authenticated;

-- ----------------------------------------------------------------------------
-- O boletim também lê a participação da Pesquisa de Engajamento e a Avaliação
-- da Experiência. Quem tem indicadores.boletim pode ler essas linhas mesmo sem
-- as permissões próprias daqueles menus (policies permissivas somam com as
-- que já existem; o recorte por unidade/departamento continua valendo).
-- ----------------------------------------------------------------------------
drop policy if exists boletim_le_engajamento_pulso on public.engajamento_pulso;
create policy boletim_le_engajamento_pulso on public.engajamento_pulso for select
  using (public.has_permission('indicadores.boletim'));

drop policy if exists boletim_le_engajamento_participacao on public.engajamento_participacao;
create policy boletim_le_engajamento_participacao on public.engajamento_participacao for select
  using (public.has_permission('indicadores.boletim') and public.can_see(unidade, departamento));

do $$
declare t text;
begin
  foreach t in array array['avaliacao_experiencia_45', 'avaliacao_experiencia_90'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists boletim_le_%1$s on public.%1$I', t);
      execute format('create policy boletim_le_%1$s on public.%1$I for select using (public.has_permission(''indicadores.boletim'') and public.can_see(unidade, departamento))', t);
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Permissão indicadores.boletim: o Administrador já enxerga (has_permission).
-- Quem já tem o perfil RH recebe a permissão agora; o preset RH do Cadastro de
-- Acessos já a inclui para os próximos. O preset Gestor NÃO inclui.
-- ----------------------------------------------------------------------------
update public.profiles
   set permissoes = coalesce(permissoes, '{}'::jsonb) || '{"indicadores.boletim": true}'::jsonb
 where perfil = 'rh'
   and coalesce(status, '') <> 'desligado';  -- a tabela profiles não deixa editar cadastro desligado
