-- Fechamento do Período — base de vagas do R&S (planilha 18. Controle Geral de
-- Vagas, aba CTRL GERAL) e metas mensais de abertura/fechamento de vagas.
-- Rode UMA vez no SQL Editor do Supabase. Pode rodar de novo sem problema.
--
-- Enquanto o módulo Recrutamento do Hub não é homologado pela gestão de R&S, a
-- planilha é a fonte oficial: o card 18 do Upload de Planilhas substitui a base
-- inteira a cada envio. Sem nome de pessoa (contratado, substituído,
-- finalistas, quem indicou, solicitante) e sem a OBSERVAÇÃO; em vaga sigilosa
-- o cargo também não é gravado (js/parsers-fechamento.js).
--
-- Acesso: indicadores.fechamento (só Administrador por enquanto) + recorte de
-- unidade/departamento do cadastro (can_see), como as demais tabelas.

-- ----------------------------------------------------------------------------
-- Tabelas
-- ----------------------------------------------------------------------------
create table if not exists public.controle_vagas (
  id bigserial primary key,
  linha int,                        -- linha na aba CTRL GERAL (para conferência)
  data_abertura date not null,
  data_fechamento date,
  data_inicio date,
  data_cancelamento date,
  data_congelamento date,
  data_retorno date,
  dias_congelada numeric,
  sla_dias_planilha numeric,        -- coluna SLA da planilha
  status_sla_planilha text,         -- coluna Status SLA ("Expirou SLA" ou vazio)
  motivo_sla text,
  unidade text,
  departamento text,
  cargo text,                       -- null em vaga sigilosa
  sigilosa boolean not null default false,
  tipo_vaga text,                   -- Operacional | Estratégica
  responsavel text,
  status_vaga text,                 -- Aberta | Andamento | Congelada | Finalizada | Cancelada
  natureza text,                    -- coluna TIPO DA VAGA_1 (Substituição, Aumento de Quadro, Extra Natal...)
  motivo_aumento_quadro text,
  tipo_recrutamento text,
  etapa_vaga text,
  fit numeric,                      -- 0 a 1
  fonte text,
  importado_em timestamptz not null default now()
);
create index if not exists controle_vagas_abertura_idx on public.controle_vagas (data_abertura);
create index if not exists controle_vagas_fechamento_idx on public.controle_vagas (data_fechamento);

-- Meta mensal de vagas abertas e fechadas ("Projeção de Vagas" do Fechamento).
create table if not exists public.metas_vagas (
  ano int not null,
  mes int not null check (mes between 1 and 12),
  meta_abertas int,
  meta_fechadas int,
  atualizado_em timestamptz not null default now(),
  primary key (ano, mes)
);

alter table public.controle_vagas enable row level security;
alter table public.metas_vagas enable row level security;

drop policy if exists controle_vagas_select on public.controle_vagas;
create policy controle_vagas_select on public.controle_vagas for select
  using (public.can_see(unidade, departamento) and public.has_permission('indicadores.fechamento'));

drop policy if exists metas_vagas_select on public.metas_vagas;
create policy metas_vagas_select on public.metas_vagas for select
  using (public.has_permission('indicadores.fechamento'));

-- ----------------------------------------------------------------------------
-- Gravação (upload do card 18, exige admin.upload). O primeiro lote vem com
-- p_limpar = true e apaga a base; os seguintes só inserem.
-- ----------------------------------------------------------------------------
create or replace function public.controle_vagas_salvar(p_linhas jsonb, p_limpar boolean)
returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not public.has_permission('admin.upload') then raise exception 'Você não tem permissão para importar planilhas.'; end if;
  if p_limpar then truncate table public.controle_vagas restart identity; end if;
  insert into public.controle_vagas (
    linha, data_abertura, data_fechamento, data_inicio, data_cancelamento, data_congelamento, data_retorno,
    dias_congelada, sla_dias_planilha, status_sla_planilha, motivo_sla, unidade, departamento, cargo, sigilosa,
    tipo_vaga, responsavel, status_vaga, natureza, motivo_aumento_quadro, tipo_recrutamento, etapa_vaga, fit, fonte)
  select x.linha, x.data_abertura, x.data_fechamento, x.data_inicio, x.data_cancelamento, x.data_congelamento, x.data_retorno,
         x.dias_congelada, x.sla_dias_planilha, x.status_sla_planilha, x.motivo_sla, x.unidade, x.departamento, x.cargo, coalesce(x.sigilosa, false),
         x.tipo_vaga, x.responsavel, x.status_vaga, x.natureza, x.motivo_aumento_quadro, x.tipo_recrutamento, x.etapa_vaga, x.fit, x.fonte
  from jsonb_to_recordset(coalesce(p_linhas, '[]'::jsonb)) as x(
    linha int, data_abertura date, data_fechamento date, data_inicio date, data_cancelamento date, data_congelamento date, data_retorno date,
    dias_congelada numeric, sla_dias_planilha numeric, status_sla_planilha text, motivo_sla text, unidade text, departamento text, cargo text, sigilosa boolean,
    tipo_vaga text, responsavel text, status_vaga text, natureza text, motivo_aumento_quadro text, tipo_recrutamento text, etapa_vaga text, fit numeric, fonte text);
  get diagnostics v = row_count;
  return v;
end;
$$;
revoke all on function public.controle_vagas_salvar(jsonb, boolean) from public, anon;
grant execute on function public.controle_vagas_salvar(jsonb, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- Metas 2026 — as mesmas do slide "Projeção de Vagas" do Fechamento de Setembro.
-- ----------------------------------------------------------------------------
insert into public.metas_vagas (ano, mes, meta_abertas, meta_fechadas) values
  (2026,  1,  74,  50), (2026,  2,  45,  50), (2026,  3,  93,  45), (2026,  4,  62,  55),
  (2026,  5,  73,  78), (2026,  6,  48,  66), (2026,  7,  56,  61), (2026,  8,  68,  49),
  (2026,  9, 175,  63), (2026, 10,  72,  94), (2026, 11,  74, 142), (2026, 12,  49,  65)
on conflict (ano, mes) do update
  set meta_abertas = excluded.meta_abertas, meta_fechadas = excluded.meta_fechadas, atualizado_em = now();

-- Conferência: deve listar as 2 tabelas com RLS ligado e 12 metas de 2026.
select 'controle_vagas' as objeto, relrowsecurity::text as rls from pg_class where relname = 'controle_vagas'
union all select 'metas_vagas', relrowsecurity::text from pg_class where relname = 'metas_vagas'
union all select 'metas 2026', count(*)::text from public.metas_vagas where ano = 2026;
