-- Turmas e Multiplicadoras — ajustes de 14/10/2026 (decisões do RH na conferência
-- das planilhas). Rode DEPOIS de supabase-treinamento-turmas.sql. Pode rodar mais
-- de uma vez: cada correção é por id ou idempotente.
--
-- A partir daqui as planilhas deixam de ser usadas: TODAS as turmas viram
-- lançamentos do Hub (origem 'hub'), editáveis na aba Lançamentos, ligadas à
-- conta da multiplicadora quando ela tem conta. Divergências não são mais
-- "corrigidas" pelo RH: ficam marcadas na lista e a multiplicadora escreve a
-- justificativa (campo novo).

-- ----------------------------------------------------------------------------
-- 1. Justificativa da multiplicadora
-- ----------------------------------------------------------------------------
alter table public.treinamento_turmas add column if not exists justificativa text;
alter table public.treinamento_turmas add column if not exists justificado_em timestamptz;
alter table public.treinamento_turmas add column if not exists justificado_por text;

-- ----------------------------------------------------------------------------
-- 2. Correções aprovadas (por id)
-- ----------------------------------------------------------------------------
-- Cristina · 11/07/2026 · Onboarding Sfera: início 01:00 → 13:00 (13:00–14:00 = 1 h)
update public.treinamento_turmas set hora_inicio = '13:00' where id = 904 and hora_inicio = '01:00';
-- Cristina · 12/08/2026 · Onboarding Jovem Aprendiz: 13:30–16:20 = 2,83 h
update public.treinamento_turmas set horas = 2.83 where id = 914 and horas = 3.83;
-- Anna · 09/09 · Onboarding (2 turmas separadas): 01:00–06:00 → 13:00–18:00
update public.treinamento_turmas set hora_inicio = '13:00', hora_fim = '18:00' where id in (1081, 1082) and hora_inicio = '01:00';
-- Anna · 17 e 18/09 · Encontro do Ciclo 14: 01:00–03:00 → 13:00–15:00 e 05:00–07:00 → 17:00–19:00
update public.treinamento_turmas set hora_inicio = '13:00', hora_fim = '15:00' where id in (1085, 1088) and hora_inicio = '01:00';
update public.treinamento_turmas set hora_inicio = '17:00', hora_fim = '19:00' where id in (1086, 1089) and hora_inicio = '05:00';
-- Anna · 23/09 · Onboarding: fim 06:00 → 18:00 · 29/09: fim 01:30 → 13:30
update public.treinamento_turmas set hora_fim = '18:00' where id = 1090 and hora_fim = '06:00';
update public.treinamento_turmas set hora_fim = '13:30' where id = 1091 and hora_fim = '01:30';
-- Myllena · 17/09 · Onboarding: duração negativa (fim em branco na planilha) vira "sem duração";
-- a turma fica pendente de justificativa.
update public.treinamento_turmas set horas = null where id in (1076, 1077) and horas < 0;
-- Histórico · 23/05/2025 · Perfumaria/Botileza: 65 presentes (digitação) → 6
update public.treinamento_turmas set presentes = 6 where id = 1733 and presentes = 65;
-- Histórico · 01/10/2025 · "FÉRIAS DO DIA 01 AO 20": não é turma
delete from public.treinamento_turmas where id = 1797;

-- ----------------------------------------------------------------------------
-- 3. Histórico do time (abas antigas): campos no padrão do formulário
-- ----------------------------------------------------------------------------
update public.treinamento_turmas set modalidade = 'Presencial'
  where planilha = 'Histórico do time' and coalesce(modalidade, '') = '';
update public.treinamento_turmas set publico = 'Liderados'
  where planilha = 'Histórico do time' and coalesce(publico, '') = '';
update public.treinamento_turmas set publico = 'Revendedores'
  where planilha = 'Histórico do time' and publico = 'Promotoras';
update public.treinamento_turmas set canal = case when canal in ('Sfera') then 'Escritório' else 'Loja' end
  where planilha = 'Histórico do time' and (coalesce(canal, '') = '' or canal in ('Boticário', 'Boticario', 'Sfera'));
-- Marca: "VD", "Loja", "Juiz de Fora" (canal escrito na marca) → O Boticário; "Escritório" → Sfera; vazia → O Boticário
update public.treinamento_turmas t set marcas = coalesce((
    select array_agg(distinct case when m in ('VD', 'Loja', 'Juiz de Fora') then 'O Boticário' when m = 'Escritório' then 'Sfera' else m end)
    from unnest(t.marcas) as m), '{}')
  where planilha = 'Histórico do time' and marcas && array['VD', 'Loja', 'Juiz de Fora', 'Escritório'];
update public.treinamento_turmas set marcas = array['O Boticário']
  where planilha = 'Histórico do time' and coalesce(array_length(marcas, 1), 0) = 0;

-- ----------------------------------------------------------------------------
-- 4. Marca "O Boticário VD": turma do Boticário com canal VD
-- ----------------------------------------------------------------------------
update public.treinamento_turmas t set marcas = (
    select array_agg(distinct case when m = 'O Boticário' then 'O Boticário VD' else m end) from unnest(t.marcas) as m)
  where 'O Boticário' = any(marcas) and canal = 'VD';

-- ----------------------------------------------------------------------------
-- 5. Suellen · as duas turmas digitadas como 2029 são de 2026 (Caratinga, 10:35–18:00)
-- ----------------------------------------------------------------------------
insert into public.treinamento_turmas (origem, planilha, arquivo, linha, data, tema, tema_original, categoria, modalidade, local,
  hora_inicio, hora_fim, horas, publico, marcas, marca_original, canal, convocados, presentes, multiplicadoras, multiplicador_original, alertas)
select 'planilha', 'Suellen Holanda', 'Controle Treinamento_Suellen Holanda.xlsx (data corrigida de 2029)', x.linha, x.data, x.tema, x.tema, x.categoria, 'Presencial', 'Caratinga',
  '10:35', '18:00', 7.42, x.publico, array['O Boticário'], 'O Boticário', 'Loja', x.n, x.n, array['Suellen Holanda'], 'Suellen Holanda', '{}'
from (values
  (140, date '2026-09-29', 'CULTURA SFERA | NORMAS E PROCEDIMENTOS| PERFUMARIA', 'Integração e onboarding', 'Liderados', 6),
  (141, date '2026-09-30', 'BOTILEZA TECNINCAS DE VENDAS| COMPOSIÇÃO SALARIAL', 'Produto e vendas', 'Líderes e liderados', 8)
) as x(linha, data, tema, categoria, publico, n)
where not exists (select 1 from public.treinamento_turmas t where t.planilha = 'Suellen Holanda' and t.data = x.data and t.tema = x.tema);

-- ----------------------------------------------------------------------------
-- 6. Fim das planilhas: tudo vira lançamento do Hub, ligado à conta da multiplicadora
-- ----------------------------------------------------------------------------
-- Nome usado nas turmas → conta (perfil) da multiplicadora. Turmas da planilha
-- individual ficam com a dona da planilha; no histórico, com a 1ª multiplicadora da turma.
with contas(nome_turma, nome_conta) as (values
  ('Maria Eduarda Vasconcelos', 'maria eduarda figueira de campos vasconcelos'),
  ('Cristina Santos', 'cristina fernandes dos santos'),
  ('Suellen Holanda', 'suellen santos de holanda'),
  ('Myllena Figueiredo', 'myllena gama figueiredo'),
  ('Anna Lorenzetti', 'anna maria lorenzetti')
), alvo as (
  select t.id, p.id as perfil
  from public.treinamento_turmas t
  join contas c on c.nome_turma = case when t.planilha = 'Histórico do time' then t.multiplicadoras[1] else t.planilha end
  join public.profiles p on lower(trim(p.nome)) = c.nome_conta and coalesce(p.status, 'ativo') = 'ativo'
  where t.criado_por is null
)
update public.treinamento_turmas t set criado_por = alvo.perfil
from alvo where t.id = alvo.id;

update public.treinamento_turmas
set origem = 'hub',
    criado_por_nome = coalesce(criado_por_nome, 'Importada da planilha (' || planilha || ')')
where origem = 'planilha';

-- ----------------------------------------------------------------------------
-- 7. Lançamento pela tela: mais presentes que convocados é permitido (o RH quer
--    entender o motivo), mas exige justificativa; fim tem de ser depois do início.
-- ----------------------------------------------------------------------------
create or replace function public.treinamento_turma_salvar(p_id bigint, p_dados jsonb)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_tudo boolean := public.has_permission('treinamento_dev.turmas');
  v_lanca boolean := public.has_permission('treinamento_dev.turmas_lancar');
  v_id bigint;
  v_dono uuid;
  v_origem text;
  v_just_ant text;
  d jsonb := coalesce(p_dados, '{}'::jsonb);
  v_just text := nullif(trim(coalesce(d->>'justificativa', '')), '');
begin
  if not (v_tudo or v_lanca) then raise exception 'Você não tem permissão para lançar turmas.'; end if;
  if nullif(d->>'data', '') is null or nullif(trim(d->>'tema'), '') is null then raise exception 'Informe a data e o tema da turma.'; end if;
  if coalesce((d->>'horas')::numeric, 0) <= 0 then raise exception 'Informe a duração da turma (horário de início e fim).'; end if;
  if nullif(d->>'hora_inicio', '') is not null and nullif(d->>'hora_fim', '') is not null and (d->>'hora_fim') <= (d->>'hora_inicio') then
    raise exception 'O horário de fim precisa ser depois do início.';
  end if;
  if coalesce((d->>'presentes')::int, 0) > coalesce((d->>'convocados')::int, 0) and v_just is null then
    raise exception 'Vieram mais pessoas que as convocadas: explique o motivo no campo Justificativa.';
  end if;
  if p_id is not null then
    select criado_por, origem, justificativa into v_dono, v_origem, v_just_ant from public.treinamento_turmas where id = p_id;
    if not found then raise exception 'Turma não encontrada.'; end if;
    if v_origem <> 'hub' then raise exception 'Esta turma ainda é de planilha.'; end if;
    if not v_tudo and v_dono is distinct from auth.uid() then raise exception 'Você só pode editar as turmas que lançou.'; end if;
    update public.treinamento_turmas set
      planilha = coalesce(nullif(d->>'planilha', ''), planilha), data = (d->>'data')::date, tema = d->>'tema',
      categoria = d->>'categoria', modalidade = d->>'modalidade', local = d->>'local', hora_inicio = d->>'hora_inicio', hora_fim = d->>'hora_fim',
      horas = (d->>'horas')::numeric, publico = d->>'publico',
      marcas = coalesce(array(select jsonb_array_elements_text(d->'marcas')), '{}'), marca_original = d->>'marca_original', canal = d->>'canal',
      convocados = (d->>'convocados')::int, presentes = (d->>'presentes')::int,
      multiplicadoras = coalesce(array(select jsonb_array_elements_text(d->'multiplicadoras')), '{}'), multiplicador_original = d->>'multiplicador_original',
      observacao = nullif(d->>'observacao', ''), alertas = '{}', atualizado_em = now(), atualizado_por = d->>'usuario',
      justificativa = v_just,
      justificado_em = case when v_just is distinct from v_just_ant then case when v_just is null then null else now() end else justificado_em end,
      justificado_por = case when v_just is distinct from v_just_ant then case when v_just is null then null else d->>'usuario' end else justificado_por end
    where id = p_id;
    return p_id;
  end if;
  insert into public.treinamento_turmas (origem, planilha, arquivo, data, tema, tema_original, categoria, modalidade, local, hora_inicio, hora_fim, horas,
    publico, marcas, marca_original, canal, convocados, presentes, multiplicadoras, multiplicador_original, observacao, alertas, criado_por, criado_por_nome,
    justificativa, justificado_em, justificado_por)
  values ('hub', coalesce(nullif(d->>'planilha', ''), d->>'usuario'), null, (d->>'data')::date, d->>'tema', d->>'tema', d->>'categoria', d->>'modalidade', d->>'local',
    d->>'hora_inicio', d->>'hora_fim', (d->>'horas')::numeric, d->>'publico',
    coalesce(array(select jsonb_array_elements_text(d->'marcas')), '{}'), d->>'marca_original', d->>'canal', (d->>'convocados')::int, (d->>'presentes')::int,
    coalesce(array(select jsonb_array_elements_text(d->'multiplicadoras')), '{}'), d->>'multiplicador_original', nullif(d->>'observacao', ''), '{}', auth.uid(), d->>'usuario',
    v_just, case when v_just is null then null else now() end, case when v_just is null then null else d->>'usuario' end)
  returning id into v_id;
  return v_id;
end;
$$;

-- Justificar uma divergência sem mexer no resto da turma (a turma importada pode
-- estar incompleta e não passar nas validações do formulário).
create or replace function public.treinamento_turma_justificar(p_id bigint, p_texto text, p_usuario text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_dono uuid;
begin
  select criado_por into v_dono from public.treinamento_turmas where id = p_id;
  if not found then raise exception 'Turma não encontrada.'; end if;
  if not (public.has_permission('treinamento_dev.turmas') or (public.has_permission('treinamento_dev.turmas_lancar') and v_dono = auth.uid())) then
    raise exception 'Você só pode justificar as turmas que lançou.';
  end if;
  update public.treinamento_turmas
  set justificativa = nullif(trim(coalesce(p_texto, '')), ''),
      justificado_em = case when nullif(trim(coalesce(p_texto, '')), '') is null then null else now() end,
      justificado_por = case when nullif(trim(coalesce(p_texto, '')), '') is null then null else p_usuario end
  where id = p_id;
end;
$$;

revoke all on function public.treinamento_turma_salvar(bigint, jsonb) from public, anon;
revoke all on function public.treinamento_turma_justificar(bigint, text, text) from public, anon;
grant execute on function public.treinamento_turma_salvar(bigint, jsonb) to authenticated;
grant execute on function public.treinamento_turma_justificar(bigint, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------
select 'turmas por origem: ' || origem as item, count(*)::text as valor from public.treinamento_turmas group by origem
union all
select 'ligadas à conta de ' || coalesce(p.nome, '(sem conta)'), count(*)::text
from public.treinamento_turmas t left join public.profiles p on p.id = t.criado_por group by p.nome
union all
select 'marca O Boticário VD', count(*)::text from public.treinamento_turmas where 'O Boticário VD' = any(marcas)
union all
select 'Suellen 29–30/09/2026', count(*)::text from public.treinamento_turmas where planilha = 'Suellen Holanda' and data between '2026-09-29' and '2026-09-30'
order by 1;
