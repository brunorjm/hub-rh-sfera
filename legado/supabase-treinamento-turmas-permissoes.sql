-- Turmas e Multiplicadoras — camada de proteção (decisões do RH, 14/10/2026).
-- Rode DEPOIS de supabase-treinamento-turmas-ajustes.sql. Pode rodar mais de uma vez.
--
-- Papéis (o perfil Administrador sempre tem todos):
--   treinamento_dev.turmas_gestor  GESTOR DE T&D: vê, lança, edita e exclui qualquer turma,
--                                  valida ou devolve justificativas, pede ajuste, altera mês fechado.
--   treinamento_dev.turmas_lancar  MULTIPLICADORA: vê e lança só as próprias turmas; edita até o
--                                  mês ser fechado no Fechamento do Período; não exclui; justifica.
--   treinamento_dev.turmas         RH GERAL: vê tudo, SOMENTE LEITURA.
-- Justificativa da multiplicadora fica "aguardando validação" até o gestor validar ou devolver.
-- Toda inclusão, alteração e exclusão fica registrada em treinamento_turmas_log.

-- ----------------------------------------------------------------------------
-- 1. Validação da justificativa e pedido de ajuste do gestor
-- ----------------------------------------------------------------------------
alter table public.treinamento_turmas add column if not exists validacao text;          -- null | pendente | validada | devolvida
alter table public.treinamento_turmas add column if not exists validado_por text;
alter table public.treinamento_turmas add column if not exists validado_em timestamptz;
alter table public.treinamento_turmas add column if not exists gestor_comentario text;  -- motivo da devolução ou pedido de ajuste
alter table public.treinamento_turmas add column if not exists ajuste_pedido boolean not null default false;
alter table public.treinamento_turmas add column if not exists ajuste_pedido_por text;
alter table public.treinamento_turmas add column if not exists ajuste_pedido_em timestamptz;
-- Justificativas já escritas entram como "aguardando validação".
update public.treinamento_turmas set validacao = 'pendente' where justificativa is not null and validacao is null;

-- ----------------------------------------------------------------------------
-- 2. Mês fechado no Fechamento do Período (mensal, bimestral, semestral ou anual)
-- ----------------------------------------------------------------------------
create or replace function public.treinamento_mes_fechado(p_data date)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.fechamento_periodo f
    where f.status = 'fechado'
      and f.ano = extract(year from p_data)::int
      and extract(month from p_data)::int between
          (f.n - 1) * (case f.tipo when 'mensal' then 1 when 'bimestral' then 2 when 'semestral' then 6 else 12 end) + 1
      and f.n * (case f.tipo when 'mensal' then 1 when 'bimestral' then 2 when 'semestral' then 6 else 12 end)
  );
$$;

-- Meses fechados ('AAAA-MM'), para a tela travar os campos (a multiplicadora não lê o Fechamento).
create or replace function public.treinamento_meses_fechados()
returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct to_char(make_date(f.ano, m, 1), 'YYYY-MM')), '{}')
  from public.fechamento_periodo f
  cross join lateral generate_series(
    (f.n - 1) * (case f.tipo when 'mensal' then 1 when 'bimestral' then 2 when 'semestral' then 6 else 12 end) + 1,
    f.n * (case f.tipo when 'mensal' then 1 when 'bimestral' then 2 when 'semestral' then 6 else 12 end)) as m
  where f.status = 'fechado';
$$;

-- ----------------------------------------------------------------------------
-- 3. Leitura: RH geral e gestor veem tudo; a multiplicadora só as próprias
-- ----------------------------------------------------------------------------
drop policy if exists treinamento_turmas_select on public.treinamento_turmas;
create policy treinamento_turmas_select on public.treinamento_turmas for select
  using (public.has_permission('treinamento_dev.turmas')
    or public.has_permission('treinamento_dev.turmas_gestor')
    or (public.has_permission('treinamento_dev.turmas_lancar') and criado_por = auth.uid()));

-- ----------------------------------------------------------------------------
-- 4. Histórico de alterações (gravado por trigger, lido pelo gestor)
-- ----------------------------------------------------------------------------
create table if not exists public.treinamento_turmas_log (
  id bigserial primary key,
  turma_id bigint not null,
  acao text not null,              -- inclusão | alteração | exclusão
  quando timestamptz not null default now(),
  usuario_id uuid,
  usuario_nome text,
  antes jsonb,
  depois jsonb
);
create index if not exists treinamento_turmas_log_turma_idx on public.treinamento_turmas_log (turma_id);
alter table public.treinamento_turmas_log enable row level security;
drop policy if exists treinamento_turmas_log_select on public.treinamento_turmas_log;
create policy treinamento_turmas_log_select on public.treinamento_turmas_log for select
  using (public.has_permission('treinamento_dev.turmas_gestor'));

create or replace function public.treinamento_turmas_registrar()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  select nome into v_nome from public.profiles where id = auth.uid();
  insert into public.treinamento_turmas_log (turma_id, acao, usuario_id, usuario_nome, antes, depois)
  values (coalesce(new.id, old.id),
          case tg_op when 'INSERT' then 'inclusão' when 'UPDATE' then 'alteração' else 'exclusão' end,
          auth.uid(), v_nome,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end;
$$;
drop trigger if exists treinamento_turmas_log_trg on public.treinamento_turmas;
create trigger treinamento_turmas_log_trg after insert or update or delete on public.treinamento_turmas
  for each row execute function public.treinamento_turmas_registrar();

-- ----------------------------------------------------------------------------
-- 5. Lançar / editar
-- ----------------------------------------------------------------------------
create or replace function public.treinamento_turma_salvar(p_id bigint, p_dados jsonb)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_gestor boolean := public.has_permission('treinamento_dev.turmas_gestor');
  v_lanca boolean := public.has_permission('treinamento_dev.turmas_lancar');
  v_id bigint;
  v_dono uuid;
  v_origem text;
  v_data_ant date;
  v_just_ant text;
  d jsonb := coalesce(p_dados, '{}'::jsonb);
  v_data date := nullif(d->>'data', '')::date;
  v_just text := nullif(trim(coalesce(d->>'justificativa', '')), '');
begin
  if not (v_gestor or v_lanca) then raise exception 'Você não tem permissão para lançar turmas (acesso somente leitura).'; end if;
  if v_data is null or nullif(trim(d->>'tema'), '') is null then raise exception 'Informe a data e o tema da turma.'; end if;
  if coalesce((d->>'horas')::numeric, 0) <= 0 then raise exception 'Informe a duração da turma (horário de início e fim).'; end if;
  if nullif(d->>'hora_inicio', '') is not null and nullif(d->>'hora_fim', '') is not null and (d->>'hora_fim') <= (d->>'hora_inicio') then
    raise exception 'O horário de fim precisa ser depois do início.';
  end if;
  if coalesce((d->>'presentes')::int, 0) > coalesce((d->>'convocados')::int, 0) and v_just is null then
    raise exception 'Vieram mais pessoas que as convocadas: explique o motivo no campo Justificativa.';
  end if;
  if not v_gestor and public.treinamento_mes_fechado(v_data) then
    raise exception 'Este mês já foi fechado no Fechamento do Período: só o gestor de T&D pode lançar ou alterar turmas dele.';
  end if;

  if p_id is not null then
    select criado_por, origem, data, justificativa into v_dono, v_origem, v_data_ant, v_just_ant from public.treinamento_turmas where id = p_id;
    if not found then raise exception 'Turma não encontrada.'; end if;
    if not v_gestor and v_dono is distinct from auth.uid() then raise exception 'Você só pode editar as turmas que lançou.'; end if;
    if not v_gestor and public.treinamento_mes_fechado(v_data_ant) then
      raise exception 'Este mês já foi fechado no Fechamento do Período: peça a alteração ao gestor de T&D (a justificativa continua liberada).';
    end if;
    update public.treinamento_turmas set
      planilha = coalesce(nullif(d->>'planilha', ''), planilha), data = v_data, tema = d->>'tema',
      categoria = d->>'categoria', modalidade = d->>'modalidade', local = d->>'local', hora_inicio = d->>'hora_inicio', hora_fim = d->>'hora_fim',
      horas = (d->>'horas')::numeric, publico = d->>'publico',
      marcas = coalesce(array(select jsonb_array_elements_text(d->'marcas')), '{}'), marca_original = d->>'marca_original', canal = d->>'canal',
      convocados = (d->>'convocados')::int, presentes = (d->>'presentes')::int,
      multiplicadoras = coalesce(array(select jsonb_array_elements_text(d->'multiplicadoras')), '{}'), multiplicador_original = d->>'multiplicador_original',
      observacao = nullif(d->>'observacao', ''), alertas = '{}', atualizado_em = now(), atualizado_por = d->>'usuario',
      justificativa = v_just,
      justificado_em = case when v_just is distinct from v_just_ant then case when v_just is null then null else now() end else justificado_em end,
      justificado_por = case when v_just is distinct from v_just_ant then case when v_just is null then null else d->>'usuario' end else justificado_por end,
      -- A multiplicadora mexeu: o ajuste pedido foi atendido e a justificativa volta para validação.
      -- O gestor que escreve a justificativa já a dá por validada.
      ajuste_pedido = case when v_gestor then ajuste_pedido else false end,
      validacao = case when v_just is null then null
                       when v_gestor then case when v_just is distinct from v_just_ant then 'validada' else validacao end
                       else 'pendente' end,
      validado_por = case when v_gestor and v_just is distinct from v_just_ant and v_just is not null then d->>'usuario' else validado_por end,
      validado_em = case when v_gestor and v_just is distinct from v_just_ant and v_just is not null then now() else validado_em end
    where id = p_id;
    return p_id;
  end if;

  insert into public.treinamento_turmas (origem, planilha, arquivo, data, tema, tema_original, categoria, modalidade, local, hora_inicio, hora_fim, horas,
    publico, marcas, marca_original, canal, convocados, presentes, multiplicadoras, multiplicador_original, observacao, alertas, criado_por, criado_por_nome,
    justificativa, justificado_em, justificado_por, validacao)
  values ('hub', coalesce(nullif(d->>'planilha', ''), d->>'usuario'), null, v_data, d->>'tema', d->>'tema', d->>'categoria', d->>'modalidade', d->>'local',
    d->>'hora_inicio', d->>'hora_fim', (d->>'horas')::numeric, d->>'publico',
    coalesce(array(select jsonb_array_elements_text(d->'marcas')), '{}'), d->>'marca_original', d->>'canal', (d->>'convocados')::int, (d->>'presentes')::int,
    coalesce(array(select jsonb_array_elements_text(d->'multiplicadoras')), '{}'), d->>'multiplicador_original', nullif(d->>'observacao', ''), '{}', auth.uid(), d->>'usuario',
    v_just, case when v_just is null then null else now() end, case when v_just is null then null else d->>'usuario' end,
    case when v_just is null then null when v_gestor then 'validada' else 'pendente' end)
  returning id into v_id;
  return v_id;
end;
$$;

-- Só a justificativa: liberada para a multiplicadora mesmo em mês fechado.
create or replace function public.treinamento_turma_justificar(p_id bigint, p_texto text, p_usuario text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_dono uuid;
  v_gestor boolean := public.has_permission('treinamento_dev.turmas_gestor');
  v_texto text := nullif(trim(coalesce(p_texto, '')), '');
begin
  select criado_por into v_dono from public.treinamento_turmas where id = p_id;
  if not found then raise exception 'Turma não encontrada.'; end if;
  if not (v_gestor or (public.has_permission('treinamento_dev.turmas_lancar') and v_dono = auth.uid())) then
    raise exception 'Você só pode justificar as turmas que lançou.';
  end if;
  update public.treinamento_turmas
  set justificativa = v_texto,
      justificado_em = case when v_texto is null then null else now() end,
      justificado_por = case when v_texto is null then null else p_usuario end,
      validacao = case when v_texto is null then null when v_gestor then 'validada' else 'pendente' end,
      validado_por = case when v_gestor and v_texto is not null then p_usuario else validado_por end,
      validado_em = case when v_gestor and v_texto is not null then now() else validado_em end,
      ajuste_pedido = case when v_gestor then ajuste_pedido else false end
  where id = p_id;
end;
$$;

-- Excluir: só o gestor.
create or replace function public.treinamento_turma_excluir(p_id bigint)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('treinamento_dev.turmas_gestor') then
    raise exception 'Só o gestor de T&D pode excluir turmas. Peça a exclusão a ele(a).';
  end if;
  delete from public.treinamento_turmas where id = p_id;
  if not found then raise exception 'Turma não encontrada.'; end if;
end;
$$;

-- Ações do gestor: validar ou devolver a justificativa, pedir ou cancelar um ajuste.
create or replace function public.treinamento_turma_gestao(p_id bigint, p_acao text, p_comentario text, p_usuario text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_coment text := nullif(trim(coalesce(p_comentario, '')), '');
begin
  if not public.has_permission('treinamento_dev.turmas_gestor') then raise exception 'Só o gestor de T&D pode fazer isso.'; end if;
  if p_acao in ('devolver', 'pedir_ajuste') and v_coment is null then raise exception 'Escreva o que a multiplicadora precisa ajustar.'; end if;
  if p_acao = 'validar' then
    update public.treinamento_turmas set validacao = 'validada', validado_por = p_usuario, validado_em = now() where id = p_id and justificativa is not null;
  elsif p_acao = 'devolver' then
    update public.treinamento_turmas set validacao = 'devolvida', validado_por = p_usuario, validado_em = now(), gestor_comentario = v_coment where id = p_id;
  elsif p_acao = 'pedir_ajuste' then
    update public.treinamento_turmas set ajuste_pedido = true, ajuste_pedido_por = p_usuario, ajuste_pedido_em = now(), gestor_comentario = v_coment where id = p_id;
  elsif p_acao = 'cancelar_ajuste' then
    update public.treinamento_turmas set ajuste_pedido = false where id = p_id;
  else
    raise exception 'Ação inválida: %', p_acao;
  end if;
  if not found then raise exception 'Turma não encontrada.'; end if;
end;
$$;

revoke all on function public.treinamento_mes_fechado(date) from public, anon;
revoke all on function public.treinamento_meses_fechados() from public, anon;
revoke all on function public.treinamento_turma_salvar(bigint, jsonb) from public, anon;
revoke all on function public.treinamento_turma_justificar(bigint, text, text) from public, anon;
revoke all on function public.treinamento_turma_excluir(bigint) from public, anon;
revoke all on function public.treinamento_turma_gestao(bigint, text, text, text) from public, anon;
grant execute on function public.treinamento_mes_fechado(date) to authenticated;
grant execute on function public.treinamento_meses_fechados() to authenticated;
grant execute on function public.treinamento_turma_salvar(bigint, jsonb) to authenticated;
grant execute on function public.treinamento_turma_justificar(bigint, text, text) to authenticated;
grant execute on function public.treinamento_turma_excluir(bigint) to authenticated;
grant execute on function public.treinamento_turma_gestao(bigint, text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Contas
-- ----------------------------------------------------------------------------
-- Multiplicadoras (têm "lançar"): perdem o "ver tudo" — passam a ver só as próprias turmas.
update public.profiles
set permissoes = permissoes - 'treinamento_dev.turmas'
where perfil <> 'admin' and coalesce(status, 'ativo') <> 'desligado'
  and (permissoes ->> 'treinamento_dev.turmas_lancar')::boolean is true
  and permissoes ? 'treinamento_dev.turmas';

-- Gestor de T&D: Rodrigo de Pinho Souza (indicado pelo RH em 14/10/2026). Outros gestores
-- são ligados depois, conta a conta, no Cadastro de Acessos.
update public.profiles
set permissoes = coalesce(permissoes, '{}'::jsonb) || '{"treinamento_dev.turmas_gestor": true}'::jsonb
where coalesce(status, 'ativo') <> 'desligado'
  and nome ilike 'rodrigo%pinho%';

-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------
select p.nome as conta, p.perfil,
  case when p.perfil = 'admin' then 'gestor (administrador)'
       when (p.permissoes ->> 'treinamento_dev.turmas_gestor')::boolean then 'gestor de T&D'
       when (p.permissoes ->> 'treinamento_dev.turmas_lancar')::boolean then 'multiplicadora (só as próprias)'
       when (p.permissoes ->> 'treinamento_dev.turmas')::boolean then 'RH geral (somente leitura)'
  end as papel,
  (select count(*) from public.treinamento_turmas t where t.criado_por = p.id) as turmas_dela
from public.profiles p
where coalesce(p.status, 'ativo') <> 'desligado'
  and (p.perfil = 'admin' or p.permissoes ?| array['treinamento_dev.turmas', 'treinamento_dev.turmas_gestor', 'treinamento_dev.turmas_lancar'])
order by 3, 1;
