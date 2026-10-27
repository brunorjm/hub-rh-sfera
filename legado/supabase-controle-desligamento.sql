-- ============================================================================
-- Controle de Desligamento (Entrevista de Desligamento → guia "Controle de
-- Desligamento"). Substitui a aba "ATUALIZADA (MOVIMENTAR)" da planilha
-- "Controle de Desligamento.xlsx": o RH lança o ID de desligamento que chega
-- pelo Forms do gestor, acompanha o status na Feedz e depois a entrevista.
--
-- FUNCIONALIDADE RESTRITA: ler, lançar e editar exige a permissão
-- 'indicadores.controle_desligamento' (liberada usuário a usuário em
-- Administração → Cadastro de Acessos; não vem em nenhum preset). Os
-- Indicadores de Entrevista de Desligamento usam só um resumo sem dado pessoal
-- (função controle_desligamento_indicadores), disponível para quem já vê
-- aquele painel.
--
-- Rodar UMA vez no SQL Editor do Supabase (pode rodar de novo sem problema).
-- Não altera dados existentes: cria a tabela nova, duas funções e acrescenta
-- a coluna opcional id_desligamento em entrevistas_desligamento.
-- ============================================================================

create table if not exists public.controle_desligamento (
  id bigserial primary key,
  id_desligamento text not null,          -- ID que chega por e-mail do Forms do gestor
  data_solicitacao date,
  solicitante text,                        -- gestor que pediu o desligamento
  colaborador_external_id text,            -- ID do usuário na Feedz (colaboradores.external_id), quando identificado
  colaborador_nome text not null,
  colaborador_cpf text,                    -- guardado no lançamento: a Feedz apaga o CPF do usuário antigo se a pessoa for recontratada
  contato text,                            -- celular para contato após o desligamento (dado pessoal — só com a permissão)
  cargo text,
  unidade text,                            -- usado no can_see (mesmo padrão das outras tabelas)
  departamento text,
  data_admissao date,
  data_demissao date,
  tipo text,                               -- Voluntária/Involuntária - Com/Sem Aviso, Acordo, Justa Causa
  tipo_desligamento text,
  motivo text,
  status_feedz text,                       -- Pendente | Aguardando último dia | Finalizado | Cancelado | ID Duplicado
  status_entrevista text,                  -- Não Realizada | Enviada | Realizada | Recusado | Inelegível
  data_realizacao date,
  observacoes text,
  extra_natal boolean not null default false,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_por text,
  atualizado_em timestamptz not null default now()
);
alter table public.controle_desligamento add column if not exists contato text;
create index if not exists controle_desligamento_id_desl_idx on public.controle_desligamento (id_desligamento);
create index if not exists controle_desligamento_unidade_idx on public.controle_desligamento (unidade);
create index if not exists controle_desligamento_demissao_idx on public.controle_desligamento (data_demissao);
create index if not exists controle_desligamento_external_idx on public.controle_desligamento (colaborador_external_id);

-- Link de entrevista gerado a partir de um desligamento do controle.
alter table public.entrevistas_desligamento add column if not exists id_desligamento text;

alter table public.controle_desligamento enable row level security;

-- Tabela completa: só com a permissão restrita. Não há exclusão — lançamento
-- errado vira "Cancelado" ou "ID Duplicado".
drop policy if exists controle_desligamento_select on public.controle_desligamento;
create policy controle_desligamento_select on public.controle_desligamento for select
  using (public.can_see(unidade, departamento) and public.has_permission('indicadores.controle_desligamento'));
drop policy if exists controle_desligamento_insert on public.controle_desligamento;
create policy controle_desligamento_insert on public.controle_desligamento for insert
  with check (public.has_permission('indicadores.controle_desligamento'));
drop policy if exists controle_desligamento_update on public.controle_desligamento;
create policy controle_desligamento_update on public.controle_desligamento for update
  using (public.has_permission('indicadores.controle_desligamento'))
  with check (public.has_permission('indicadores.controle_desligamento'));

grant select, insert, update on public.controle_desligamento to authenticated;
grant usage, select on sequence public.controle_desligamento_id_seq to authenticated;

-- Resumo para os Indicadores de Entrevista de Desligamento: sem contato, CPF
-- nem observações; para quem tem a permissão do painel, respeitando as
-- unidades/departamentos de cada usuário.
create or replace function public.controle_desligamento_indicadores()
returns table (
  id_desligamento text, colaborador_nome text, unidade text, departamento text,
  data_solicitacao date, data_demissao date, tipo text, tipo_desligamento text,
  motivo text, status_feedz text, status_entrevista text
)
language sql stable security definer set search_path = public as $$
  select c.id_desligamento, c.colaborador_nome, c.unidade, c.departamento,
         c.data_solicitacao, c.data_demissao, c.tipo, c.tipo_desligamento,
         c.motivo, c.status_feedz, c.status_entrevista
  from public.controle_desligamento c
  where public.has_permission('indicadores.desligamento')
    and public.can_see(c.unidade, c.departamento)
  order by c.id
$$;
revoke all on function public.controle_desligamento_indicadores() from public;
grant execute on function public.controle_desligamento_indicadores() to authenticated;

-- Celular do colaborador na Feedz ("matrícula"), buscado só no momento de
-- preencher o contato no Controle e só para quem tem a permissão restrita —
-- a matrícula não é baixada para o navegador em nenhuma outra tela.
create or replace function public.controle_desligamento_contato_feedz(p_external_id text)
returns text
language sql stable security definer set search_path = public as $$
  select nullif(trim(matricula), '')
  from public.colaboradores
  where external_id = p_external_id
    and public.has_permission('indicadores.controle_desligamento')
  limit 1
$$;
revoke all on function public.controle_desligamento_contato_feedz(text) from public;
grant execute on function public.controle_desligamento_contato_feedz(text) to authenticated;

-- Conferência: deve listar a tabela com RLS ligado
select relname as tabela, relrowsecurity as rls_ligado
from pg_class where relname = 'controle_desligamento';
