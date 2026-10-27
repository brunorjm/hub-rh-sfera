-- Treinamento e Desenvolvimento → Turmas e Multiplicadoras: controle das turmas
-- dadas pelas multiplicadoras (planilha "Controle de Treinamentos" de cada uma).
-- Rode ANTES de publicar o código novo. Pode rodar mais de uma vez.
--
-- Fase 1 (09/10/2026): cada multiplicadora continua na própria planilha e o RH
-- sobe o arquivo em Administração → Upload. Cada arquivo substitui só as turmas
-- daquela planilha (coluna "planilha" = a multiplicadora dona do arquivo). Só
-- quantidades (convocados/presentes): há turmas com revendedores, fora do cadastro.
-- Fase 2 (futura): as multiplicadoras lançam as turmas direto no Hub.
--
-- Acesso: só T&D e RH (permissão treinamento_dev.turmas, preset RH; fora do preset Gestor).

create table if not exists public.treinamento_turmas (
  id bigserial primary key,
  planilha text not null,          -- multiplicadora dona do arquivo
  arquivo text,                    -- nome do arquivo enviado
  linha int,                       -- linha na planilha (para achar e corrigir)
  data date not null,
  tema text not null,              -- tema padronizado
  tema_original text,
  categoria text,                  -- Integração e onboarding | Produto e vendas | Outros
  modalidade text,                 -- Presencial | Online
  local text,
  hora_inicio text,                -- HH:MM
  hora_fim text,
  horas numeric,                   -- "Volume de horas" da planilha, em horas decimais
  publico text,                    -- Liderados | Líderes
  marcas text[] not null default '{}',   -- Levi's, Hering, Sfera, O Boticário, ...
  marca_original text,
  canal text,                      -- Loja | Escritório | Loja e Escritório
  convocados int,
  presentes int,
  multiplicadoras text[] not null default '{}',
  multiplicador_original text,
  alertas text[] not null default '{}',  -- inconsistências achadas na leitura
  importado_em timestamptz not null default now()
);
create index if not exists treinamento_turmas_data_idx on public.treinamento_turmas (data);
create index if not exists treinamento_turmas_planilha_idx on public.treinamento_turmas (planilha);

-- Fase 2 (09/10/2026): a multiplicadora lança as próprias turmas no Hub (aba
-- "Lançamentos"). origem = 'planilha' (upload) | 'hub' (lançada na tela). O
-- upload só substitui as turmas de planilha; as lançadas no Hub nunca são apagadas por ele.
alter table public.treinamento_turmas add column if not exists origem text not null default 'planilha';
alter table public.treinamento_turmas add column if not exists observacao text;
alter table public.treinamento_turmas add column if not exists criado_por uuid;
alter table public.treinamento_turmas add column if not exists criado_por_nome text;
alter table public.treinamento_turmas add column if not exists atualizado_em timestamptz;
alter table public.treinamento_turmas add column if not exists atualizado_por text;
create index if not exists treinamento_turmas_criado_por_idx on public.treinamento_turmas (criado_por);

-- Leitura: T&D e RH (treinamento_dev.turmas) veem tudo; a multiplicadora
-- (treinamento_dev.turmas_lancar) vê só as turmas que ela mesma lançou.
alter table public.treinamento_turmas enable row level security;
drop policy if exists treinamento_turmas_select on public.treinamento_turmas;
create policy treinamento_turmas_select on public.treinamento_turmas for select
  using (public.has_permission('treinamento_dev.turmas')
    or (public.has_permission('treinamento_dev.turmas_lancar') and criado_por = auth.uid()));

-- Grava a planilha de uma multiplicadora numa transação: apaga as turmas dela e
-- insere as do arquivo.
create or replace function public.treinamento_salvar_turmas(p_planilha text, p_arquivo text, p_linhas jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not public.has_permission('admin.upload') then raise exception 'Você não tem permissão para importar planilhas.'; end if;
  if coalesce(trim(p_planilha), '') = '' then raise exception 'Não consegui identificar a multiplicadora da planilha.'; end if;
  delete from public.treinamento_turmas where planilha = p_planilha and origem = 'planilha';
  insert into public.treinamento_turmas (planilha, arquivo, linha, data, tema, tema_original, categoria, modalidade, local, hora_inicio, hora_fim, horas,
    publico, marcas, marca_original, canal, convocados, presentes, multiplicadoras, multiplicador_original, alertas)
  select p_planilha, p_arquivo, x.linha, x.data, x.tema, x.tema_original, x.categoria, x.modalidade, x.local, x.hora_inicio, x.hora_fim, x.horas,
    x.publico, coalesce(x.marcas, '{}'), x.marca_original, x.canal, x.convocados, x.presentes, coalesce(x.multiplicadoras, '{}'), x.multiplicador_original, coalesce(x.alertas, '{}')
  from jsonb_to_recordset(coalesce(p_linhas, '[]'::jsonb)) as x(linha int, data date, tema text, tema_original text, categoria text, modalidade text, local text,
    hora_inicio text, hora_fim text, horas numeric, publico text, marcas text[], marca_original text, canal text, convocados int, presentes int,
    multiplicadoras text[], multiplicador_original text, alertas text[])
  where x.data is not null and x.tema is not null;
  get diagnostics v = row_count;
  return v;
end;
$$;
revoke all on function public.treinamento_salvar_turmas(text, text, jsonb) from public, anon;
grant execute on function public.treinamento_salvar_turmas(text, text, jsonb) to authenticated;

-- Lançamento pela tela (origem 'hub'). p_id null = turma nova. Quem tem
-- treinamento_dev.turmas (T&D/RH) lança e edita qualquer turma do Hub; quem só
-- tem treinamento_dev.turmas_lancar (multiplicadora) edita só as que lançou.
-- Turma importada de planilha não é editada aqui: corrige-se na planilha.
create or replace function public.treinamento_turma_salvar(p_id bigint, p_dados jsonb)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_tudo boolean := public.has_permission('treinamento_dev.turmas');
  v_lanca boolean := public.has_permission('treinamento_dev.turmas_lancar');
  v_id bigint;
  v_dono uuid;
  v_origem text;
  d jsonb := coalesce(p_dados, '{}'::jsonb);
begin
  if not (v_tudo or v_lanca) then raise exception 'Você não tem permissão para lançar turmas.'; end if;
  if nullif(d->>'data', '') is null or nullif(trim(d->>'tema'), '') is null then raise exception 'Informe a data e o tema da turma.'; end if;
  if coalesce((d->>'horas')::numeric, 0) <= 0 then raise exception 'Informe a duração da turma (horário de início e fim).'; end if;
  if coalesce((d->>'presentes')::int, 0) > coalesce((d->>'convocados')::int, 0) then raise exception 'Presentes não pode ser maior que convocados.'; end if;
  if p_id is not null then
    select criado_por, origem into v_dono, v_origem from public.treinamento_turmas where id = p_id;
    if not found then raise exception 'Turma não encontrada.'; end if;
    if v_origem <> 'hub' then raise exception 'Esta turma veio da planilha da multiplicadora: corrija na planilha e reenvie.'; end if;
    if not v_tudo and v_dono is distinct from auth.uid() then raise exception 'Você só pode editar as turmas que lançou.'; end if;
    update public.treinamento_turmas set
      planilha = coalesce(nullif(d->>'planilha', ''), planilha), data = (d->>'data')::date, tema = d->>'tema', tema_original = d->>'tema',
      categoria = d->>'categoria', modalidade = d->>'modalidade', local = d->>'local', hora_inicio = d->>'hora_inicio', hora_fim = d->>'hora_fim',
      horas = (d->>'horas')::numeric, publico = d->>'publico',
      marcas = coalesce(array(select jsonb_array_elements_text(d->'marcas')), '{}'), marca_original = d->>'marca_original', canal = d->>'canal',
      convocados = (d->>'convocados')::int, presentes = (d->>'presentes')::int,
      multiplicadoras = coalesce(array(select jsonb_array_elements_text(d->'multiplicadoras')), '{}'), multiplicador_original = d->>'multiplicador_original',
      observacao = nullif(d->>'observacao', ''), alertas = '{}', atualizado_em = now(), atualizado_por = d->>'usuario'
    where id = p_id;
    return p_id;
  end if;
  insert into public.treinamento_turmas (origem, planilha, arquivo, data, tema, tema_original, categoria, modalidade, local, hora_inicio, hora_fim, horas,
    publico, marcas, marca_original, canal, convocados, presentes, multiplicadoras, multiplicador_original, observacao, alertas, criado_por, criado_por_nome)
  values ('hub', coalesce(nullif(d->>'planilha', ''), d->>'usuario'), null, (d->>'data')::date, d->>'tema', d->>'tema', d->>'categoria', d->>'modalidade', d->>'local',
    d->>'hora_inicio', d->>'hora_fim', (d->>'horas')::numeric, d->>'publico',
    coalesce(array(select jsonb_array_elements_text(d->'marcas')), '{}'), d->>'marca_original', d->>'canal', (d->>'convocados')::int, (d->>'presentes')::int,
    coalesce(array(select jsonb_array_elements_text(d->'multiplicadoras')), '{}'), d->>'multiplicador_original', nullif(d->>'observacao', ''), '{}', auth.uid(), d->>'usuario')
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.treinamento_turma_excluir(p_id bigint)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tudo boolean := public.has_permission('treinamento_dev.turmas');
  v_dono uuid;
  v_origem text;
begin
  select criado_por, origem into v_dono, v_origem from public.treinamento_turmas where id = p_id;
  if not found then raise exception 'Turma não encontrada.'; end if;
  if v_origem <> 'hub' then raise exception 'Esta turma veio da planilha da multiplicadora: tire da planilha e reenvie.'; end if;
  if not (v_tudo or (public.has_permission('treinamento_dev.turmas_lancar') and v_dono = auth.uid())) then
    raise exception 'Você só pode excluir as turmas que lançou.';
  end if;
  delete from public.treinamento_turmas where id = p_id;
end;
$$;

revoke all on function public.treinamento_turma_salvar(bigint, jsonb) from public, anon;
revoke all on function public.treinamento_turma_excluir(bigint) from public, anon;
grant execute on function public.treinamento_turma_salvar(bigint, jsonb) to authenticated;
grant execute on function public.treinamento_turma_excluir(bigint) to authenticated;

-- Permissão nova: liga para as contas de RH ativas (o preset RH já inclui; contas
-- antigas guardam o mapa de permissões e não recebem chaves novas sozinhas).
-- Contas desligadas ficam de fora (o trigger de profiles não deixa editá-las).
update public.profiles
set permissoes = coalesce(permissoes, '{}'::jsonb) || '{"treinamento_dev.turmas": true}'::jsonb
where perfil = 'rh'
  and coalesce(status, 'ativo') <> 'desligado'
  and not coalesce((permissoes ->> 'treinamento_dev.turmas')::boolean, false);

-- Conferência: a policy e quantas contas têm a permissão (fora o Administrador, que vê tudo).
select 'policy' as objeto, qual as valor from pg_policies where schemaname = 'public' and tablename = 'treinamento_turmas' and cmd = 'SELECT'
union all
select 'contas com treinamento_dev.turmas (' || perfil || ')', count(*)::text
from public.profiles
where coalesce(status, 'ativo') <> 'desligado' and (permissoes ->> 'treinamento_dev.turmas')::boolean is true
group by perfil
union all
-- Multiplicadoras: liga-se no Cadastro de Acessos, conta a conta ("Lançar as próprias turmas").
select 'contas com treinamento_dev.turmas_lancar (' || perfil || ')', count(*)::text
from public.profiles
where coalesce(status, 'ativo') <> 'desligado' and (permissoes ->> 'treinamento_dev.turmas_lancar')::boolean is true
group by perfil
union all
select 'turmas por origem: ' || origem, count(*)::text from public.treinamento_turmas group by origem;
