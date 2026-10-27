-- ============================================================================
-- HUB SFERA — schema completo (Indicadores + Recrutamento, base única)
-- Execute este script inteiro, uma vez, no SQL Editor do seu projeto Supabase
-- (https://supabase.com/dashboard/project/_/sql/new)
--
-- Depois de rodar este script, siga o SETUP.md para criar o primeiro usuário
-- administrador (passo obrigatório — sem ele ninguém consegue entrar no app).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PERFIS DE ACESSO (perfil/rótulo + unidades/departamentos liberados +
--    permissões granulares por checkbox — ver js/permissions.js)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nome text not null,
  perfil text not null check (perfil in ('admin','gestor','rh')),
  unidades text[] not null default '{}',
  departamentos text[] not null default '{}',
  permissoes jsonb not null default '{}',
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Um registro por usuário do hub. unidades/departamentos vazios = acesso a todas as linhas (dentro do que "permissoes" já libera). "perfil" é só rótulo/preset usado ao cadastrar — quem manda de verdade é "permissoes".';
comment on column public.profiles.permissoes is 'Mapa {"indicadores.headcount": true, "recrutamento.vagas": true, ...} — chaves definidas em js/permissions.js (HUB_PERMISSIONS.CATALOG). Lido por has_permission(perm) nas policies abaixo.';

-- ----------------------------------------------------------------------------
-- 2. FUNÇÕES AUXILIARES DE VISIBILIDADE (usadas pelas policies de RLS)
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER aqui é necessário, não opcional: a policy profiles_select
-- (mais abaixo) chama is_admin(), que chama current_role_v(), que lê a
-- própria tabela profiles — sem SECURITY DEFINER essa leitura fica sujeita
-- de novo à policy profiles_select, que chama is_admin() de novo, que lê
-- profiles de novo... recursão infinita ("stack depth limit exceeded",
-- login trava). SECURITY DEFINER faz essa leitura interna rodar sem
-- reavaliar RLS, quebrando o ciclo.
create or replace function public.current_role_v()
returns text
language sql stable security definer set search_path = public as $$
  select perfil from public.profiles where id = auth.uid()
$$;

create or replace function public.current_unidades()
returns text[]
language sql stable security definer set search_path = public as $$
  select unidades from public.profiles where id = auth.uid()
$$;

create or replace function public.current_departamentos()
returns text[]
language sql stable security definer set search_path = public as $$
  select departamentos from public.profiles where id = auth.uid()
$$;

-- Checagem de uma permissão granular do catálogo (ex.: 'recrutamento.vagas').
-- perfil='admin' sempre passa, mesmo que "permissoes" esteja incompleto —
-- rede de segurança para nunca travar o próprio administrador fora do hub.
create or replace function public.has_permission(perm text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select perfil = 'admin' or coalesce((permissoes ->> perm)::boolean, false)
     from public.profiles where id = auth.uid()),
    false
  )
$$;

-- Regra de visibilidade por linha: admin e rh veem tudo. Gestor só vê linhas
-- cuja unidade/departamento estejam na lista liberada para ele (lista vazia =
-- sem restrição naquele eixo). Reaproveitada tanto pelas tabelas de
-- Indicadores (row_unidade = colaboradores.unidade, etc.) quanto pelas de
-- Recrutamento (row_unidade = vagas.unidade — não necessariamente o mesmo
-- domínio de valores do "unidade" usado no módulo Indicadores).
--
-- unidade nula é sempre visível porque algumas tabelas (ex.: 1 on 1) nunca
-- têm esse campo por natureza da planilha de origem — não tem o que restringir.
-- departamento nulo, ao contrário, é tratado como NÃO visível quando o gestor
-- tem departamentos específicos liberados — melhor esconder do que vazar.
create or replace function public.can_see(row_unidade text, row_departamento text)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p.perfil in ('admin','rh') then true
    when p.perfil = 'gestor' then
      (
        coalesce(array_length(p.unidades, 1), 0) = 0
        or row_unidade is null
        or lower(trim(row_unidade)) in (select lower(trim(u)) from unnest(p.unidades) as u)
      )
      and
      (
        coalesce(array_length(p.departamentos, 1), 0) = 0
        or (row_departamento is not null and lower(trim(row_departamento)) in (select lower(trim(d)) from unnest(p.departamentos) as d))
      )
    else false
  end
  from (select perfil, unidades, departamentos from public.profiles where id = auth.uid()) p
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_role_v() = 'admin'
$$;

-- ----------------------------------------------------------------------------
-- 3. TABELAS DO MÓDULO INDICADORES (uma por planilha/menu — alimentadas por
--    upload, sem mudança de schema em relação ao Hub de Indicadores original)
-- ----------------------------------------------------------------------------

-- 1. Colaboradores.xlsx (aba "Headcount")
create table if not exists public.colaboradores (
  id bigserial primary key,
  external_id text unique,
  nome text,
  nome_completo text,
  matricula text,
  email text,
  cpf text,
  cargo text,
  cargo_visivel text,
  unidade text,
  departamento text,
  grupos text,
  papel text,
  gestor_direto text,
  gestor_email text,
  etnia text,
  sexo text,
  genero text,
  data_nascimento date,
  data_admissao date,
  data_cadastro date,
  situacao text,
  ultimo_acesso date,
  origem_cadastro text,
  participa_gamificacao text,
  desligamento_tipo text,
  desligamento_motivo text,
  ultimo_dia_trabalhado date,
  idioma text,
  updated_at timestamptz not null default now()
);
create index if not exists colaboradores_unidade_idx on public.colaboradores (unidade);
create index if not exists colaboradores_departamento_idx on public.colaboradores (departamento);
create index if not exists colaboradores_situacao_idx on public.colaboradores (situacao);
create index if not exists colaboradores_nome_completo_idx on public.colaboradores (nome_completo);

-- 4. Feedbacks.xlsx (aba "Feedbacks")
create table if not exists public.feedbacks (
  id bigserial primary key,
  de text,
  para text,
  unidade text,
  departamento text,
  cargo text,
  anonimo text,
  template text,
  feedback text,
  avaliacao text,
  data date,
  data_visualizacao date,
  respostas jsonb not null default '{}'::jsonb
);
create index if not exists feedbacks_unidade_idx on public.feedbacks (unidade);
create index if not exists feedbacks_departamento_idx on public.feedbacks (departamento);
create index if not exists feedbacks_data_idx on public.feedbacks (data);

-- 5. 1 on 1.xlsx (aba "Worksheet")
create table if not exists public.one_on_one (
  id bigserial primary key,
  lider text,
  lider_email text,
  lider_departamento text,
  lider_papel text,
  liderado text,
  liderado_email text,
  liderado_matricula text,
  unidade text,
  departamento text,
  liderado_papel text,
  relacao text,
  categoria text,
  data_agendada date,
  data_realizada date,
  status text,
  topicos_lider text,
  topicos_liderado text,
  anotacoes_lider text,
  anotacoes_liderado text,
  acoes_ativas_lider text,
  acoes_concluidas_lider text,
  acoes_ativas_liderado text,
  acoes_concluidas_liderado text
);
create index if not exists one_on_one_departamento_idx on public.one_on_one (departamento);
create index if not exists one_on_one_data_realizada_idx on public.one_on_one (data_realizada);
create index if not exists one_on_one_lider_idx on public.one_on_one (lider);

-- 20. Celebrações.xlsx (aba "Worksheet")
create table if not exists public.celebracoes (
  id bigserial primary key,
  codigo text,
  colaborador_enviou text,
  unidade text,
  departamento text,
  papel text,
  cargo_enviou text,
  colaboradores_receberam text,
  cargo_recebeu text,
  mensagem text,
  curtidas int,
  comentarios int,
  data date
);
create index if not exists celebracoes_unidade_idx on public.celebracoes (unidade);
create index if not exists celebracoes_departamento_idx on public.celebracoes (departamento);
create index if not exists celebracoes_data_idx on public.celebracoes (data);

-- 34. Nova Entrevista de Desligamento.xlsx (aba "Pesquisa de Desligamento")
create table if not exists public.entrevista_pesquisa (
  id bigserial primary key,
  planilha_id text,
  data_inicio date,
  data_conclusao date,
  nome text,
  email text,
  telefone text,
  unidade text,
  departamento text,
  motivo_desligamento text,
  submotivo_desligamento text,
  data_desligamento date,
  trabalharia_novamente text,
  nps int,
  respostas jsonb not null default '{}'::jsonb
);
create index if not exists entrevista_pesquisa_unidade_idx on public.entrevista_pesquisa (unidade);
create index if not exists entrevista_pesquisa_departamento_idx on public.entrevista_pesquisa (departamento);
create index if not exists entrevista_pesquisa_data_idx on public.entrevista_pesquisa (data_desligamento);

-- 34. Nova Entrevista de Desligamento.xlsx (aba "Solicitação de Desligamento")
create table if not exists public.entrevista_solicitacao (
  id bigserial primary key,
  planilha_id text,
  data_solicitacao date,
  nome_solicitante text,
  nome text,
  cargo text,
  unidade text,
  departamento text,
  data_admissao date,
  data_demissao date,
  tempo_trabalho int,
  tipo text,
  tipo_desligamento text,
  motivo_desligamento text,
  status_feedz text,
  status_entrevista text,
  observacoes text
);
create index if not exists entrevista_solicitacao_unidade_idx on public.entrevista_solicitacao (unidade);
create index if not exists entrevista_solicitacao_departamento_idx on public.entrevista_solicitacao (departamento);
create index if not exists entrevista_solicitacao_data_idx on public.entrevista_solicitacao (data_demissao);

-- Entrevista de Desligamento OPERACIONAL — diferente de entrevista_pesquisa/
-- entrevista_solicitacao acima (que são só leitura, alimentadas por upload de
-- planilha e substituídas por completo a cada reenvio via admin_truncate).
-- Esta tabela é escrita pela própria aplicação: o(a) analista de RH gera um
-- link de entrevista (a partir de um colaborador da planilha de
-- Colaboradores) na tela Indicadores → Entrevista Desligamento, e o(a)
-- ex-colaborador(a) preenche via link público (token), sem login — mesmo
-- padrão de pareceres_gestor/parecer_publico_*. As respostas daqui NÃO
-- entram automaticamente nos indicadores calculados a partir de
-- entrevista_pesquisa/entrevista_solicitacao (essa integração, se quiser,
-- fica para um passo seguinte).
create table if not exists public.entrevistas_desligamento (
  id text primary key,
  colaborador_external_id text, -- referência solta (sem FK) ao external_id de colaboradores — essa tabela é truncada a cada upload de planilha, então uma FK quebraria
  colaborador_nome text,
  colaborador_cpf text,
  colaborador_email text,
  colaborador_telefone text,
  cargo text,
  data_admissao date,
  data_desligamento date, -- colaboradores.ultimo_dia_trabalhado no momento da geração do link
  unidade text,            -- colaboradores.unidade (usado no can_see, igual entrevista_pesquisa/entrevista_solicitacao)
  departamento text,       -- colaboradores.departamento (idem)
  unidade_trabalho text,   -- pergunta 5 do formulário ("Boticário - Juiz de Fora" etc.)
  local text,              -- pergunta 6-13/15-17 (loja/ER) — nulo quando unidade_trabalho = Escritório
  departamento_forms text, -- pergunta 14 — só quando unidade_trabalho = Escritório
  respostas jsonb not null default '{}', -- { "<id da pergunta 18-83>": valor }
  status text not null default 'Pendente', -- 'Pendente' | 'Preenchido'
  link_token text,
  gerado_por text, -- nome/e-mail de quem gerou o link
  data_finalizacao timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists entrevistas_desligamento_status_idx on public.entrevistas_desligamento (status);
create unique index if not exists entrevistas_desligamento_link_token_idx on public.entrevistas_desligamento (link_token) where link_token is not null;

-- 27. Twygo.xlsx (participantes/matrículas — nível inscrição, um por curso por pessoa)
create table if not exists public.twygo_participantes (
  id bigserial primary key,
  content_id text,
  content_title text,
  content_type text,
  nome_completo text,
  email text,
  unidade text,
  departamento text,
  cargo text,
  data_inscricao date,
  ultimo_acesso date,
  situacao_inscricao text,
  situacao text,
  situacao_ambiente text,
  progresso numeric,
  nota numeric,
  frequencia numeric,
  pontuacao numeric,
  carga_horaria numeric,
  emitido_em date
);
create index if not exists twygo_participantes_unidade_idx on public.twygo_participantes (unidade);
create index if not exists twygo_participantes_departamento_idx on public.twygo_participantes (departamento);
create index if not exists twygo_participantes_nome_idx on public.twygo_participantes (nome_completo);
create index if not exists twygo_participantes_content_idx on public.twygo_participantes (content_title);

-- 27.1. Twygo usuários.xlsx (nível pessoa — pontuação e progresso geral)
create table if not exists public.twygo_usuarios (
  id bigserial primary key,
  twygo_id text,
  nome_completo text,
  email text,
  cpf text,
  ultimo_acesso date,
  perfil text,
  pontuacao numeric,
  progresso numeric,
  situacao text,
  registrado_em date,
  cargo text,
  unidade text,
  departamento text
);
create index if not exists twygo_usuarios_unidade_idx on public.twygo_usuarios (unidade);
create index if not exists twygo_usuarios_departamento_idx on public.twygo_usuarios (departamento);
create index if not exists twygo_usuarios_nome_idx on public.twygo_usuarios (nome_completo);

-- 27.1. Twygo conteúdos.xlsx (nível curso/trilha — inscrições e progresso médio)
create table if not exists public.twygo_conteudos (
  id bigserial primary key,
  codigo_conteudo text,
  tipo text,
  nome text,
  situacao text,
  inscricoes int,
  carga_horaria numeric,
  progresso numeric,
  categorias text,
  data_inicio date,
  data_termino date,
  criado_em date,
  publicado_em date
);
create index if not exists twygo_conteudos_nome_idx on public.twygo_conteudos (nome);

-- ----------------------------------------------------------------------------
-- 4. TABELAS DO MÓDULO RECRUTAMENTO (operacionais — escritas pelas telas do
--    hub, não por upload; são a MESMA fonte usada pelo indicador ao vivo
--    "Indicadores → Recrutamento")
--
-- NOTA sobre unidade/departamento: o Recrutamento usa "unidade" (ex.:
-- "Boticário - Interior de MG", "Hering", "Escritório" — 15 valores, um por
-- unidade cadastrada em Administração → Cadastros do Recrutamento) como eixo
-- único de escopo geográfico/organizacional — não existe mais um campo
-- "Marca" separado (removido: unidade + departamento já bastam para
-- identificar uma vaga/candidato). Departamento cascateia a partir de
-- Unidade (recrutamento_departamentos.unidade). Não é necessariamente o
-- mesmo domínio de valores do "unidade" já usado pelo módulo Indicadores
-- (colaboradores.unidade etc.) — não tive como confirmar isso com os dados
-- reais dos dois sistemas.
--
-- can_see() usa a coluna "unidade" (presente em vagas/candidatos/entrevistas/
-- onboarding/pareceres_gestor) como eixo de restrição por unidade/
-- departamento de um gestor dentro do Recrutamento — independente do escopo
-- de "unidade" usado no módulo Indicadores (um gestor restrito precisa ter
-- os nomes de UNIDADE do Recrutamento na lista `profiles.unidades` para
-- enxergar dados de Recrutamento, além dos nomes de "unidade" das planilhas
-- de RH se também usar Indicadores).
--
-- As colunas `marca` abaixo ficam como histórico morto (não são mais lidas
-- nem escritas pelo app) — não foram apagadas para preservar o que já
-- estava gravado em vagas/candidatos/entrevistas/onboarding/pareceres_gestor
-- antes desta mudança.
-- ----------------------------------------------------------------------------

create table if not exists public.vagas (
  id text primary key,
  data_abertura date,
  marca text, -- histórico morto, ver nota no início da seção 4
  unidade text,
  departamento text,
  nivel_vaga text,
  solicitante text,
  cargo text,
  sigilosa text,
  tipo_vaga text,
  responsavel text,
  status text,
  tipo_movimentacao text,
  motivo_aumento text,
  pessoa_substituida text,
  cota text, -- 'Sim' | 'Não' — vaga reservada a cota (PCD ou Jovem Aprendiz)
  tipo_cota text, -- 'PCD' | 'Jovem Aprendiz' — só quando cota='Sim'
  tipo_recrutamento text,
  etapa text,
  motivo_sla text,
  motivo_sla_text text,
  data_congelamento date,
  data_retorno date,
  data_cancelamento date,
  finalistas text,
  contratado text,
  fit_pct numeric,
  data_fechamento date,
  data_inicio date,
  data_prevista_admissao date,
  ultima_divulgacao text,
  data_ultima_divulgacao date,
  fonte text,
  quem_indicou text,
  observacoes text,
  portais_ativos text[] not null default '{}',
  fontes_divulgadas text[] not null default '{}',
  num_inscricoes int,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists vagas_unidade_idx on public.vagas (unidade);
create index if not exists vagas_departamento_idx on public.vagas (departamento);
create index if not exists vagas_status_idx on public.vagas (status);
create index if not exists vagas_responsavel_idx on public.vagas (responsavel);
create index if not exists vagas_data_abertura_idx on public.vagas (data_abertura);

create table if not exists public.candidatos (
  id text primary key,
  vaga_id text references public.vagas(id) on delete set null,
  nome text,
  email text,
  contato text,
  linkedin text,
  cargo text,
  marca text, -- histórico morto, ver nota no início da seção 4
  unidade text,
  departamento text,
  nivel_vaga text,
  entrevistado_por text,
  data_entrevista date,
  horario_entrevista text,
  fit_pct numeric,
  etapa_rh_status text,
  resultado_rh text,
  data_contato_rh date,
  data_agendada_rh date,
  motivo_reprovacao text,
  etapa_analise_status text,
  resultado_analise text,
  data_contato_analise date,
  data_agendada_analise date,
  motivo_analise text,
  data_analise date,
  etapa_checagem_status text,
  resultado_checagem text,
  data_contato_checagem date,
  data_agendada_checagem date,
  motivo_checagem text,
  data_checagem date,
  teste_pratico text,
  data_teste_pratico date,
  etapa_gestor_status text,
  resultado_gestor text,
  data_contato_gestor date,
  data_agendada_gestor date,
  entrevista_gestor text,
  data_entrevista_gestor date,
  horario_gestor text,
  entrevista_diretoria text,
  data_entrevista_diretoria date,
  resultado_final text,
  resultado text,
  data_fechamento date,
  fonte_captacao text,
  data_admissao date,
  observacoes text,
  tags text[] not null default '{}',
  atualizado_por text,
  segmento_ultima_empresa text,
  genero text,
  faixa_etaria text,
  distancia_km numeric,
  escolaridade text,
  estuda text,
  turno_estudo text,
  cargos_possiveis text[] not null default '{}',
  link_pandape text,
  estado_civil text,
  tem_filhos text,
  quantidade_filhos int,
  -- Dados de transporte para o Onboarding: preenchidos pelo(a) recrutador(a)
  -- no próprio cadastro do candidato quando resultado_final = 'Aprovado'
  -- (antes ficavam na tela de Onboarding, preenchidos pelo treinador — mudou
  -- de dono porque é o recrutador quem sabe essa logística ao fechar a vaga).
  tipo_transporte text,
  quantidade_passagens int,
  valor_total_transporte numeric,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists candidatos_vaga_id_idx on public.candidatos (vaga_id);
create index if not exists candidatos_unidade_idx on public.candidatos (unidade);
create index if not exists candidatos_departamento_idx on public.candidatos (departamento);
create index if not exists candidatos_resultado_idx on public.candidatos (resultado);
create index if not exists candidatos_nome_idx on public.candidatos (nome);

create table if not exists public.entrevistas (
  id uuid primary key default gen_random_uuid(),
  candidato_id text references public.candidatos(id) on delete cascade,
  candidato_nome text,
  vaga_id text references public.vagas(id) on delete set null,
  cargo text,
  marca text, -- histórico morto, ver nota no início da seção 4
  unidade text,
  recrutador text,
  etapa text,
  tipo_entrevista text,
  data date,
  horario text,
  duracao text,
  status text,
  tipo_processo text,
  nivel_vaga text,
  observacao text,
  criado_em timestamptz not null default now()
);
create index if not exists entrevistas_candidato_id_idx on public.entrevistas (candidato_id);
create index if not exists entrevistas_vaga_id_idx on public.entrevistas (vaga_id);
create index if not exists entrevistas_unidade_idx on public.entrevistas (unidade);
create index if not exists entrevistas_data_idx on public.entrevistas (data);

-- Módulo Treinamento e Desenvolvimento → Onboarding. Um registro é criado
-- automaticamente (nunca à mão) quando alguém envia, na tela Candidatos, um
-- candidato com resultado_final='Aprovado' cuja vaga já está 'Finalizada' —
-- ver js/sections/candidatos.js (enviarParaOnboarding). Dados de
-- transporte/logística ficam no cadastro do candidato (preenchidos pelo
-- recrutador). A avaliação do treinador foi simplificada de 16 itens
-- individuais para 1 nota por pilar (4 pilares) + 1 nota final geral —
-- obrigatória só quando status='Realizado'.
create table if not exists public.onboarding (
  id uuid primary key default gen_random_uuid(),
  candidato_id text references public.candidatos(id) on delete set null,
  candidato_nome text,
  vaga_id text references public.vagas(id) on delete set null,
  cargo text,
  marca text, -- histórico morto, ver nota no início da seção 4
  departamento text,
  unidade text,
  nivel_vaga text,
  data_prevista_admissao date,
  data_onboarding date,
  local text,
  modalidade text, -- 'Presencial' | 'Híbrido' | 'Online'
  carga_horaria numeric, -- horas de treinamento
  status text not null default 'Pendente', -- 'Pendente' | 'Agendado' | 'Realizado' | 'Não realizado'
  motivo_nao_realizado text, -- 'Faltou' | 'Desistiu' | 'Reagendado' — só quando status='Não realizado'
  observacoes text, -- detalhamento do treinador pro caso de motivo_nao_realizado
  -- Avaliação do treinador (escala 1-5 por pilar; obrigatória quando Realizado)
  pontuacao_comportamento int, -- pilar "Comportamento e Postura"
  pontuacao_atendimento int, -- pilar "Aspectos de Atendimento"
  pontuacao_cultura int, -- pilar "Alinhamento com a Cultura Organizacional"
  pontuacao_engajamento int, -- pilar "Engajamento, Participação e Interesse"
  nota_final numeric, -- nota geral do treinando, 0 a 10
  enviado_por text,
  enviado_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists onboarding_candidato_id_idx on public.onboarding (candidato_id);
create index if not exists onboarding_vaga_id_idx on public.onboarding (vaga_id);
create index if not exists onboarding_unidade_idx on public.onboarding (unidade);
create index if not exists onboarding_status_idx on public.onboarding (status);

-- Módulo Treinamento e Desenvolvimento → Visita em Loja. Porta o formulário
-- "Avaliação de Visita em Loja - O Boticário" (Microsoft Forms) — cada coluna
-- é uma pergunta do formulário original; as perguntas condicionais
-- ("ramificações") ficam null quando não se aplicam ao caso. Nomes de coluna
-- seguem a conversão mecânica camelCase->snake_case usada em toda a base
-- (dal-recrutamento.js) — ver js/sections/visita-loja.js para o texto
-- completo de cada pergunta.
create table if not exists public.visitas_loja (
  id text primary key,
  area text,
  loja text,
  data_visita date,
  todos_presentes text, -- 'Sim' | 'Não'
  colaboradores_ausentes text,
  justificativa_ausencia text,
  clima_equipe text, -- 'Ruim' | 'Regular' | 'Bom' | 'Excelente'
  clima_melhorar text,
  clima_exemplo text,
  uniformizados text, -- 'Sim' | 'Não'
  nao_uniformizados text,
  justificativa_uniforme text,
  postura_gerente text, -- 'Ruim' | 'Regular' | 'Bom' | 'Excelente'
  postura_gerente_melhorar text,
  postura_gerente_exemplo text,
  postura_consultores text, -- 'Ruim' | 'Regular' | 'Bom' | 'Excelente'
  postura_consultores_melhorar text,
  postura_consultores_exemplo text,
  iniciativa_time text, -- 'Ruim' | 'Regular' | 'Bom' | 'Excelente'
  iniciativa_time_melhorar text,
  iniciativa_time_exemplo text,
  se_apresentam text, -- 'Sim' | 'Não'
  nao_se_apresentam text,
  perguntam_motivo text, -- 'Sim' | 'Não'
  nao_perguntam_motivo text,
  perguntam_nome text, -- 'Sim' | 'Não'
  nao_perguntam_nome text,
  momento_cpf text, -- 'Início' | 'Meio' | 'Fim' | 'Não perguntaram'
  quais_nao_cpf_inicio text,
  explicam_fidelidade text, -- 'Sim' | 'Não'
  nao_explicam_fidelidade text,
  incentivam_experimentar text, -- 'Sim' | 'Não'
  nao_incentivam_experimentar text,
  oferece_adicional text, -- 'Sim' | 'Não'
  nao_oferece_adicional text,
  borrifa_fragrancia text, -- 'Sim' | 'Não'
  nao_borrifa_fragrancia text,
  menciona_boti_recicla text, -- 'Sim' | 'Não'
  nao_menciona_boti_recicla text,
  etapas_experimentacao text, -- 'Sim' | 'Não' | 'Em parte'
  etapas_experimentacao_falta text,
  incentiva_beautybox text, -- 'Sim' | 'Não'
  nao_incentiva_beautybox text,
  entendeu_desejo text, -- 'Não' | 'Parcialmente' | 'Sim'
  entendeu_desejo_melhorar text,
  falou_preco_quando_perguntado text, -- 'Sim' | 'Não'
  preco_nao_seguiram text,
  criou_oportunidades text, -- 'Sim' | 'Não'
  oportunidades_melhorar text,
  aproveitou_acompanhante text, -- 'Sim' | 'Não'
  acompanhante_melhorar text,
  experimentar_premium text, -- 'Sim' | 'Não'
  premium_melhorar text,
  usou_pre_venda text, -- 'Sim' | 'Não'
  pre_venda_melhorar text,
  apresentou_alavancas text, -- 'Sim' | 'Não'
  alavancas_melhorar text,
  organizou_caixa_presente text, -- 'Sim' | 'Não'
  caixa_presente_melhorar text,
  ofereceu_acessorios_make text, -- 'Sim' | 'Não'
  acessorios_melhorar text,
  destacou_descontos text, -- 'Sim' | 'Não'
  descontos_melhorar text,
  mostrou_confianca text, -- 'Sim' | 'Não'
  confianca_melhorar text,
  nota_clima_engajamento numeric, -- 0 a 10
  nota_botileza numeric, -- 0 a 10
  nota_atendimento360 numeric, -- 0 a 10
  nota_geral numeric, -- 0 a 10, opcional (única pergunta sem * no formulário original)
  criado_por text,
  criado_em timestamptz not null default now()
);
create index if not exists visitas_loja_area_idx on public.visitas_loja (area);
create index if not exists visitas_loja_data_visita_idx on public.visitas_loja (data_visita);

-- Parecer do Gestor: o(a) recrutador(a), ao agendar a Etapa Entrevista
-- Gestor (ver renderGestorBlock em candidatos.js), escolhe qual dos 6
-- modelos de parecer (Hering/Levi's/O Boticário Loja/O Boticário VD ER,
-- Campo, Logística — ver js/pareceres/*.js) o(a) gestor(a) deve preencher.
-- Isso cria aqui um registro com status='Pendente', que aparece como
-- pendência (tarja amarela) na tela Recrutamento → Parecer do Gestor. Ao
-- finalizar, o(a) gestor(a) grava as respostas em "dados" (jsonb — schema
-- livre, decidido pelo modelo escolhido) e a tela também atualiza
-- automaticamente candidatos.resultado_gestor/etapa_gestor_status/
-- data_entrevista_gestor (ver js/sections/parecer-gestor.js).
create table if not exists public.pareceres_gestor (
  id text primary key,
  candidato_id text references public.candidatos(id) on delete cascade,
  candidato_nome text,
  vaga_id text references public.vagas(id) on delete set null,
  cargo text,
  marca text, -- histórico morto, ver nota no início da seção 4
  unidade text,
  departamento text,
  modelo text not null, -- 'hering' | 'levis' | 'boticario_loja' | 'boticario_vd_er' | 'boticario_vd_campo' | 'boticario_vd_logistica'
  recrutador text, -- quem agendou (preenchido na criação, pelo(a) recrutador(a))
  status text not null default 'Pendente', -- 'Pendente' | 'Preenchido'
  dados jsonb not null default '{}',
  nivel_recomendacao int, -- 1 a 4 estrelas
  parecer_final text, -- 'Aprovado(a) - Avançar no processo' | 'Aprovado(a) - Banco de Talentos' | 'Aprovado(a) - Indicação para outra filial' | 'Reprovado(a) - Não avançar no processo'
  justificativa text,
  preenchido_por text,
  data_finalizacao timestamptz,
  -- Token de acesso ao link público do parecer (parecer-publico.html), gerado
  -- pelo(a) recrutador(a) ao clicar "Gerar link e enviar por e-mail" — dá
  -- acesso de preenchimento SEM LOGIN, via as funções parecer_publico_get/
  -- parecer_publico_salvar abaixo (a única forma de acesso anônimo — a
  -- tabela em si continua sem nenhuma policy para o papel anon).
  link_token text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists pareceres_gestor_candidato_id_idx on public.pareceres_gestor (candidato_id);
create index if not exists pareceres_gestor_status_idx on public.pareceres_gestor (status);
-- O índice único de link_token só é criado mais abaixo, na seção 3.1 — não
-- aqui, porque em bancos que já tinham pareceres_gestor de uma versão
-- anterior desta migration (create table if not exists é no-op nesse caso)
-- a coluna link_token só existe depois do ALTER TABLE ADD COLUMN daquela
-- seção. Criar o índice aqui quebraria com "column link_token does not
-- exist" em qualquer banco que já rodou esta migration antes.

-- ----------------------------------------------------------------------------
-- 3.1 ATUALIZAÇÃO INCREMENTAL (idempotente — roda sem efeito em projeto novo,
-- e traz um projeto já criado com a versão anterior desta migration pro
-- formato atual). Move os dados de transporte do Onboarding pro cadastro do
-- Candidato (preenchidos pelo recrutador, não mais pelo treinador) e troca a
-- rubrica de avaliação de treinamento por um formulário enxuto.
-- ----------------------------------------------------------------------------
alter table public.vagas add column if not exists cota text;
alter table public.vagas add column if not exists tipo_cota text;
alter table public.candidatos add column if not exists tipo_transporte text;
alter table public.candidatos add column if not exists quantidade_passagens int;
alter table public.candidatos add column if not exists valor_total_transporte numeric;
alter table public.pareceres_gestor add column if not exists link_token text;
create unique index if not exists pareceres_gestor_link_token_idx on public.pareceres_gestor (link_token) where link_token is not null;

alter table public.onboarding add column if not exists modalidade text;
alter table public.onboarding add column if not exists carga_horaria numeric;
alter table public.onboarding add column if not exists observacoes text;
alter table public.onboarding add column if not exists pontuacao_comportamento int;
alter table public.onboarding add column if not exists pontuacao_atendimento int;
alter table public.onboarding add column if not exists pontuacao_cultura int;
alter table public.onboarding add column if not exists pontuacao_engajamento int;
alter table public.onboarding add column if not exists nota_final numeric;
alter table public.onboarding drop column if exists quantidade_passagens;
alter table public.onboarding drop column if exists tipo_transporte;
alter table public.onboarding drop column if exists valor_total_transporte;
alter table public.onboarding drop column if exists pontualidade;
alter table public.onboarding drop column if exists postura_profissional;
alter table public.onboarding drop column if exists respeito_interpessoal;
alter table public.onboarding drop column if exists controle_emocional;
alter table public.onboarding drop column if exists comunicacao_cliente;
alter table public.onboarding drop column if exists conhecimento_tecnico;
alter table public.onboarding drop column if exists simulacao_atendimento;
alter table public.onboarding drop column if exists resolucao_problemas;
alter table public.onboarding drop column if exists identificacao_valores;
alter table public.onboarding drop column if exists aderencia_politicas;
alter table public.onboarding drop column if exists postura_trabalho_equipe;
alter table public.onboarding drop column if exists participacao_ativa;
alter table public.onboarding drop column if exists interesse_conteudo;
alter table public.onboarding drop column if exists proatividade;
alter table public.onboarding drop column if exists absorcao_conteudo;
alter table public.onboarding drop column if exists receptividade_feedback;
alter table public.onboarding drop column if exists aptidao_funcao;
alter table public.onboarding drop column if exists nota_geral;
alter table public.onboarding drop column if exists pontos_fortes;
alter table public.onboarding drop column if exists pontos_desenvolvimento;
alter table public.onboarding drop column if exists plano_acao;
alter table public.onboarding drop column if exists observacoes_treinador;
alter table public.onboarding drop column if exists nome_treinador;
alter table public.onboarding drop column if exists data_treinamento;
alter table public.onboarding drop column if exists avaliacao_preenchida;

create table if not exists public.historico (
  id bigserial primary key,
  "timestamp" timestamptz not null default now(),
  acao text,
  vaga_id text,
  campo text,
  valor_anterior text,
  valor_novo text,
  detalhes text,
  usuario text
);
create index if not exists historico_vaga_id_idx on public.historico (vaga_id);
create index if not exists historico_timestamp_idx on public.historico ("timestamp");

create table if not exists public.solicitacoes (
  id uuid primary key default gen_random_uuid(),
  tipo text,
  payload jsonb not null default '{}'::jsonb,
  descricao text,
  solicitante text,
  perfil_solicitante text,
  data_solicitacao timestamptz not null default now(),
  status text not null default 'Pendente',
  aprovado_por text,
  data_decisao timestamptz,
  observacao_admin text
);
create index if not exists solicitacoes_status_idx on public.solicitacoes (status);

-- Listas mestre do Recrutamento (dropdowns) — CRUD em Administração →
-- Cadastros do Recrutamento.
create table if not exists public.unidades (id bigserial primary key, nome text not null, ativo boolean not null default true);
create table if not exists public.cargos (id bigserial primary key, nome text not null, ativo boolean not null default true);
create table if not exists public.etapas (id bigserial primary key, nome text not null, ativo boolean not null default true);
create table if not exists public.fontes_captacao (id bigserial primary key, nome text not null, ativo boolean not null default true);
create table if not exists public.portais (id bigserial primary key, nome text not null, ativo boolean not null default true);
create table if not exists public.niveis_vaga (id bigserial primary key, nome text not null, ativo boolean not null default true);
create table if not exists public.recrutadores (id bigserial primary key, nome text not null, ativo boolean not null default true);
create table if not exists public.recrutamento_departamentos (id bigserial primary key, nome text not null, unidade text, ativo boolean not null default true);

-- ----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.colaboradores enable row level security;
alter table public.feedbacks enable row level security;
alter table public.one_on_one enable row level security;
alter table public.celebracoes enable row level security;
alter table public.entrevista_pesquisa enable row level security;
alter table public.entrevista_solicitacao enable row level security;
alter table public.entrevistas_desligamento enable row level security;
alter table public.twygo_participantes enable row level security;
alter table public.twygo_usuarios enable row level security;
alter table public.twygo_conteudos enable row level security;
alter table public.vagas enable row level security;
alter table public.candidatos enable row level security;
alter table public.entrevistas enable row level security;
alter table public.onboarding enable row level security;
alter table public.visitas_loja enable row level security;
alter table public.pareceres_gestor enable row level security;
alter table public.historico enable row level security;
alter table public.solicitacoes enable row level security;
alter table public.unidades enable row level security;
alter table public.cargos enable row level security;
alter table public.etapas enable row level security;
alter table public.fontes_captacao enable row level security;
alter table public.portais enable row level security;
alter table public.niveis_vaga enable row level security;
alter table public.recrutadores enable row level security;
alter table public.recrutamento_departamentos enable row level security;

-- profiles: cada usuário lê o próprio registro; admin.usuarios lê/escreve todos.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.has_permission('admin.usuarios'));

drop policy if exists profiles_write on public.profiles;
create policy profiles_write on public.profiles for all
  using (public.has_permission('admin.usuarios')) with check (public.has_permission('admin.usuarios'));

-- tabelas de Indicadores com unidade/departamento: leitura conforme
-- can_see(); escrita (upload) só quem tem admin.upload.
do $$
declare
  t text;
begin
  foreach t in array array[
    'colaboradores','feedbacks','one_on_one','celebracoes',
    'entrevista_pesquisa','entrevista_solicitacao',
    'twygo_participantes','twygo_usuarios'
  ]
  loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format(
      'create policy %I_select on public.%I for select using (public.can_see(unidade, departamento))',
      t, t
    );
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for all using (public.has_permission(''admin.upload'')) with check (public.has_permission(''admin.upload''))',
      t, t
    );
  end loop;
end $$;
-- Entrevista de Desligamento: além do recorte, exige a permissão do painel
-- (e o Hub lê a versão anônima entrevista_pesquisa_anon) — ver
-- supabase-entrevista-privacidade.sql.
drop policy if exists entrevista_pesquisa_select on public.entrevista_pesquisa;
create policy entrevista_pesquisa_select on public.entrevista_pesquisa for select
  using (public.can_see(unidade, departamento) and public.has_permission('indicadores.desligamento'));
drop policy if exists entrevista_solicitacao_select on public.entrevista_solicitacao;
create policy entrevista_solicitacao_select on public.entrevista_solicitacao for select
  using (public.can_see(unidade, departamento) and public.has_permission('indicadores.desligamento'));

-- twygo_conteudos: catálogo de cursos, não tem unidade/departamento (não é
-- ligado a uma pessoa) — visível para qualquer usuário logado; escrita via admin.upload.
drop policy if exists twygo_conteudos_select on public.twygo_conteudos;
create policy twygo_conteudos_select on public.twygo_conteudos for select
  using (auth.uid() is not null);

drop policy if exists twygo_conteudos_write on public.twygo_conteudos;
create policy twygo_conteudos_write on public.twygo_conteudos for all
  using (public.has_permission('admin.upload')) with check (public.has_permission('admin.upload'));

-- vagas/candidatos/entrevistas: leitura exige (a) alguma permissão
-- relacionada ao Recrutamento E (b) escopo de unidade/departamento
-- (can_see, usando a coluna "unidade" como eixo de escopo — ver nota na seção 4).
-- Escrita: cada tabela pede a permissão específica da tela que a edita.
drop policy if exists vagas_select on public.vagas;
create policy vagas_select on public.vagas for select
  using (
    public.can_see(unidade, departamento)
    and (
      public.has_permission('recrutamento.dashboard') or public.has_permission('indicadores.recrutamento')
      or public.has_permission('recrutamento.vagas') or public.has_permission('recrutamento.candidatos')
      or public.has_permission('recrutamento.agenda') or public.has_permission('recrutamento.banco_talentos')
      or public.has_permission('recrutamento.aprovacoes') or public.has_permission('recrutamento.historico')
    )
  );
drop policy if exists vagas_write on public.vagas;
create policy vagas_write on public.vagas for all
  using (public.has_permission('recrutamento.vagas')) with check (public.has_permission('recrutamento.vagas'));

drop policy if exists candidatos_select on public.candidatos;
create policy candidatos_select on public.candidatos for select
  using (
    public.can_see(unidade, departamento)
    and (
      public.has_permission('recrutamento.dashboard') or public.has_permission('indicadores.recrutamento')
      or public.has_permission('recrutamento.vagas') or public.has_permission('recrutamento.candidatos')
      or public.has_permission('recrutamento.agenda') or public.has_permission('recrutamento.banco_talentos')
      or public.has_permission('recrutamento.aprovacoes') or public.has_permission('recrutamento.historico')
      or public.has_permission('recrutamento.parecer_gestor')
    )
  );
-- recrutamento.parecer_gestor também entra aqui: quando o(a) gestor(a)
-- termina de preencher o parecer (parecer-gestor.js), a tela grava o
-- resultado (resultado_gestor/etapa_gestor_status/data_entrevista_gestor)
-- direto na linha do candidato — como o RLS do Postgres não restringe por
-- coluna, isso libera a linha inteira pra update por quem só tem essa
-- permissão (mesmo trade-off já aceito em onboarding_update, que libera a
-- tabela inteira via recrutamento.vagas só pra sincronizar 1 campo).
drop policy if exists candidatos_write on public.candidatos;
create policy candidatos_write on public.candidatos for all
  using (public.has_permission('recrutamento.candidatos') or public.has_permission('recrutamento.parecer_gestor'))
  with check (public.has_permission('recrutamento.candidatos') or public.has_permission('recrutamento.parecer_gestor'));

drop policy if exists entrevistas_select on public.entrevistas;
create policy entrevistas_select on public.entrevistas for select
  using (
    public.can_see(unidade, null)
    and (
      public.has_permission('recrutamento.dashboard') or public.has_permission('indicadores.recrutamento')
      or public.has_permission('recrutamento.agenda') or public.has_permission('recrutamento.candidatos')
    )
  );
drop policy if exists entrevistas_write on public.entrevistas;
create policy entrevistas_write on public.entrevistas for all
  using (public.has_permission('recrutamento.agenda') or public.has_permission('recrutamento.candidatos'))
  with check (public.has_permission('recrutamento.agenda') or public.has_permission('recrutamento.candidatos'));

-- onboarding: leitura para quem administra o módulo (treinamento_dev.onboarding)
-- OU para quem mexe em candidatos/vagas (precisam ver o badge "já enviado" /
-- propagar a data prevista de admissão). Criação (insert) só acontece a
-- partir da tela Candidatos — por isso pede recrutamento.candidatos OU
-- treinamento_dev.onboarding. Edição do registro em si (status, avaliação)
-- é do time de treinamento; a única escrita que vem de Recrutamento depois
-- da criação é a sincronização de data_prevista_admissao a partir da vaga,
-- por isso recrutamento.vagas também entra no update.
drop policy if exists onboarding_select on public.onboarding;
create policy onboarding_select on public.onboarding for select
  using (
    public.can_see(unidade, departamento)
    and (
      public.has_permission('treinamento_dev.onboarding')
      or public.has_permission('recrutamento.candidatos')
      or public.has_permission('recrutamento.vagas')
    )
  );
drop policy if exists onboarding_insert on public.onboarding;
create policy onboarding_insert on public.onboarding for insert
  with check (public.has_permission('recrutamento.candidatos') or public.has_permission('treinamento_dev.onboarding'));
drop policy if exists onboarding_update on public.onboarding;
create policy onboarding_update on public.onboarding for update
  using (public.has_permission('treinamento_dev.onboarding') or public.has_permission('recrutamento.vagas'))
  with check (public.has_permission('treinamento_dev.onboarding') or public.has_permission('recrutamento.vagas'));

-- visitas_loja: usa a "área" (Juiz de Fora/Rio de Janeiro/Interior de MG...)
-- como equivalente de unidade no can_see(). Um(a) gestor(a) sem
-- unidades específicas cadastradas continua vendo tudo (can_see trata lista
-- vazia como "sem restrição"); quem tem unidades cadastradas só verá visitas
-- se essas unidades coincidirem com o texto da área.
drop policy if exists visitas_loja_select on public.visitas_loja;
create policy visitas_loja_select on public.visitas_loja for select
  using (public.can_see(area, 'Treinamento e Desenvolvimento') and public.has_permission('treinamento_dev.visita_loja'));
drop policy if exists visitas_loja_insert on public.visitas_loja;
create policy visitas_loja_insert on public.visitas_loja for insert
  with check (public.has_permission('treinamento_dev.visita_loja'));
drop policy if exists visitas_loja_update on public.visitas_loja;
create policy visitas_loja_update on public.visitas_loja for update
  using (public.has_permission('treinamento_dev.visita_loja'))
  with check (public.has_permission('treinamento_dev.visita_loja'));

-- pareceres_gestor: mesmo padrão de escopo de candidatos/vagas
-- (can_see(unidade, departamento)). Leitura liberada tanto para quem tem
-- recrutamento.parecer_gestor (o(a) gestor(a) que vai preencher) quanto
-- para recrutamento.candidatos (o(a) recrutador(a) que agendou, para
-- acompanhar/trocar o modelo antes do preenchimento). Criação só pelo(a)
-- recrutador(a); atualização (preenchimento) por qualquer um dos dois perfis
-- — o próprio front-end só mostra o formulário editável pra quem tem
-- recrutamento.parecer_gestor.
drop policy if exists pareceres_gestor_select on public.pareceres_gestor;
create policy pareceres_gestor_select on public.pareceres_gestor for select
  using (
    public.can_see(unidade, departamento)
    and (public.has_permission('recrutamento.parecer_gestor') or public.has_permission('recrutamento.candidatos'))
  );
drop policy if exists pareceres_gestor_insert on public.pareceres_gestor;
create policy pareceres_gestor_insert on public.pareceres_gestor for insert
  with check (public.has_permission('recrutamento.candidatos'));
drop policy if exists pareceres_gestor_update on public.pareceres_gestor;
create policy pareceres_gestor_update on public.pareceres_gestor for update
  using (public.has_permission('recrutamento.parecer_gestor') or public.has_permission('recrutamento.candidatos'))
  with check (public.has_permission('recrutamento.parecer_gestor') or public.has_permission('recrutamento.candidatos'));

-- entrevistas_desligamento: leitura via indicadores.desligamento (mesmo
-- escopo de can_see() das tabelas de indicadores — colaboradores.unidade/
-- departamento, não marca). Gerar link (insert) é uma permissão à parte,
-- indicadores.desligamento_gerar_link, porque nem todo mundo que vê o
-- indicador deve poder gerar/enviar links reais para ex-colaboradores. O
-- preenchimento em si (update) acontece só via a RPC pública
-- entrevista_desligamento_publico_salvar (SECURITY DEFINER, sem policy de
-- anon aqui) — a policy de update abaixo é só para uso administrativo futuro
-- (ex.: corrigir um dado errado), não faz parte do fluxo normal.
drop policy if exists entrevistas_desligamento_select on public.entrevistas_desligamento;
create policy entrevistas_desligamento_select on public.entrevistas_desligamento for select
  using (public.can_see(unidade, departamento) and public.has_permission('indicadores.desligamento'));
drop policy if exists entrevistas_desligamento_insert on public.entrevistas_desligamento;
create policy entrevistas_desligamento_insert on public.entrevistas_desligamento for insert
  with check (public.has_permission('indicadores.controle_desligamento') or public.has_permission('indicadores.desligamento_gerar_link'));
drop policy if exists entrevistas_desligamento_update on public.entrevistas_desligamento;
create policy entrevistas_desligamento_update on public.entrevistas_desligamento for update
  using (public.has_permission('indicadores.controle_desligamento') or public.has_permission('indicadores.desligamento_gerar_link'))
  with check (public.has_permission('indicadores.controle_desligamento') or public.has_permission('indicadores.desligamento_gerar_link'));

-- historico: leitura via recrutamento.historico; escrita (log automático de
-- auditoria) liberada a qualquer usuário com alguma permissão de Recrutamento.
drop policy if exists historico_select on public.historico;
create policy historico_select on public.historico for select
  using (public.has_permission('recrutamento.historico'));
drop policy if exists historico_write on public.historico;
create policy historico_write on public.historico for insert
  with check (
    public.has_permission('recrutamento.vagas') or public.has_permission('recrutamento.candidatos')
    or public.has_permission('recrutamento.agenda') or public.has_permission('recrutamento.aprovacoes')
  );

-- solicitacoes: aprovar/rejeitar (update) e ver tudo (select) exige
-- recrutamento.aprovacoes; qualquer usuário de Recrutamento pode criar
-- (insert) uma solicitação da própria ação.
drop policy if exists solicitacoes_select on public.solicitacoes;
create policy solicitacoes_select on public.solicitacoes for select
  using (public.has_permission('recrutamento.aprovacoes'));
drop policy if exists solicitacoes_insert on public.solicitacoes;
create policy solicitacoes_insert on public.solicitacoes for insert
  with check (
    public.has_permission('recrutamento.vagas') or public.has_permission('recrutamento.candidatos')
    or public.has_permission('recrutamento.agenda')
  );
drop policy if exists solicitacoes_update on public.solicitacoes;
create policy solicitacoes_update on public.solicitacoes for update
  using (public.has_permission('recrutamento.aprovacoes')) with check (public.has_permission('recrutamento.aprovacoes'));

-- Listas mestre do Recrutamento: leitura livre para qualquer usuário
-- autenticado (são só dados de dropdown); escrita via admin.cadastros_recrutamento.
do $$
declare
  t text;
begin
  foreach t in array array[
    'unidades','cargos','etapas','fontes_captacao','portais',
    'niveis_vaga','recrutadores','recrutamento_departamentos'
  ]
  loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select using (auth.uid() is not null)', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for all using (public.has_permission(''admin.cadastros_recrutamento'')) with check (public.has_permission(''admin.cadastros_recrutamento''))',
      t, t
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 5.1 REDE DE SEGURANÇA: tempo limite de instrução um pouco mais folgado
-- ----------------------------------------------------------------------------
-- O padrão do Supabase pro papel "authenticated" costuma ser baixo (na casa
-- de poucos segundos). Mesmo com can_see() otimizado, tabelas muito grandes
-- (twygo_participantes) podem ficar perto do limite pra gestores restritos
-- (que passam pela checagem completa, diferente de admin/rh). Isso não
-- resolve a causa, só dá mais margem enquanto a consulta ainda está dentro
-- do razoável.
alter role authenticated set statement_timeout = '30s';

-- ----------------------------------------------------------------------------
-- 6. LIMPEZA RÁPIDA PARA REUPLOAD (TRUNCATE em vez de DELETE linha a linha)
-- ----------------------------------------------------------------------------
-- Um DELETE sem filtro numa tabela com dezenas de milhares de linhas (ex.:
-- twygo_participantes) pode estourar o tempo limite de instrução do Postgres.
-- TRUNCATE é instantâneo independente do tamanho da tabela. Só usada pelas
-- tabelas de Indicadores (upload) — as tabelas de Recrutamento nunca são
-- substituídas por completo, só editadas linha a linha pelas telas.
create or replace function public.admin_truncate(target text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('admin.upload') then
    raise exception 'Você não tem permissão para limpar dados de planilha.';
  end if;
  if target not in (
    'colaboradores','feedbacks','one_on_one','celebracoes',
    'entrevista_pesquisa','entrevista_solicitacao',
    'twygo_participantes','twygo_usuarios','twygo_conteudos'
  ) then
    raise exception 'Tabela inválida: %', target;
  end if;
  execute format('truncate table public.%I restart identity', target);
end;
$$;

grant execute on function public.admin_truncate(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. LINK PÚBLICO DO PARECER DO GESTOR (sem login)
-- ----------------------------------------------------------------------------
-- O(a) recrutador(a) pode gerar, na tela Candidatos, um link com token
-- aleatório (pareceres_gestor.link_token) e mandar por e-mail para o(a)
-- Solicitante da vaga — que pode não ter (e em geral não tem) login no Hub
-- Sfera. Em vez de abrir a tabela pro papel `anon` via RLS (o que exigiria
-- confiar o token inteiro à política de RLS, sem controle fino sobre o que
-- cada chamada pode fazer), as duas funções abaixo são o ÚNICO ponto de
-- acesso anônimo: SECURITY DEFINER, validam o token internamente e não
-- expõem nada além do necessário. `pareceres_gestor`/`candidatos` continuam
-- sem qualquer policy para `anon` — só estas duas funções.
create or replace function public.parecer_publico_get(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  result jsonb;
begin
  if p_token is null or length(p_token) < 16 then
    return null;
  end if;
  select jsonb_build_object(
    'candidatoNome', pg.candidato_nome,
    'cargo', pg.cargo,
    'modelo', pg.modelo,
    'recrutador', pg.recrutador,
    'dados', pg.dados,
    'observacoesCandidato', c.observacoes
  ) into result
  from public.pareceres_gestor pg
  left join public.candidatos c on c.id = pg.candidato_id
  where pg.link_token = p_token and pg.status = 'Pendente';
  return result; -- null = token inválido, já usado ou expirado (nunca existiu)
end;
$$;
revoke all on function public.parecer_publico_get(text) from public;
grant execute on function public.parecer_publico_get(text) to anon, authenticated;

create or replace function public.parecer_publico_salvar(
  p_token text, p_dados jsonb, p_nivel_recomendacao int,
  p_parecer_final text, p_justificativa text, p_preenchido_por text
)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_parecer public.pareceres_gestor%rowtype;
  v_resultado text;
  v_agora timestamptz := now();
begin
  if p_token is null or length(p_token) < 16 then
    raise exception 'Link inválido.';
  end if;
  select * into v_parecer from public.pareceres_gestor where link_token = p_token and status = 'Pendente';
  if not found then
    raise exception 'Este link não é mais válido — o parecer já foi preenchido ou o link expirou.';
  end if;

  -- Mesmo mapeamento de resultadoGestorDoParecer em js/sections/parecer-gestor.js
  if p_parecer_final = 'Aprovado(a) - Banco de Talentos' then v_resultado := 'Banco de Talentos';
  elsif p_parecer_final = 'Reprovado(a) - Não avançar no processo' then v_resultado := 'Reprovado';
  else v_resultado := 'Aprovado';
  end if;

  update public.pareceres_gestor set
    status = 'Preenchido', dados = p_dados, nivel_recomendacao = p_nivel_recomendacao,
    parecer_final = p_parecer_final, justificativa = p_justificativa,
    preenchido_por = p_preenchido_por, data_finalizacao = v_agora, atualizado_em = v_agora
  where id = v_parecer.id;

  if v_parecer.candidato_id is not null then
    update public.candidatos set
      resultado_gestor = v_resultado, etapa_gestor_status = 'Concluída',
      data_entrevista_gestor = v_agora::date, atualizado_em = v_agora
    where id = v_parecer.candidato_id;
  end if;

  return true;
end;
$$;
revoke all on function public.parecer_publico_salvar(text, jsonb, int, text, text, text) from public;
grant execute on function public.parecer_publico_salvar(text, jsonb, int, text, text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 8. LINK PÚBLICO DA ENTREVISTA DE DESLIGAMENTO (sem login)
-- ----------------------------------------------------------------------------
-- Mesmo padrão de segurança do link do Parecer do Gestor (seção 7): as duas
-- funções abaixo são o ÚNICO ponto de acesso anônimo a
-- entrevistas_desligamento — a tabela em si não tem nenhuma policy para
-- `anon`. get() só retorna dado enquanto status='Pendente' (nunca depois de
-- preenchido); salvar() exige o mesmo e marca 'Preenchido' de forma
-- atômica, então o token vira inválido para qualquer tentativa seguinte
-- (link de uso único).
create or replace function public.entrevista_desligamento_publico_get(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  result jsonb;
begin
  if p_token is null or length(p_token) < 16 then
    return null;
  end if;
  select jsonb_build_object(
    'colaboradorNome', colaborador_nome,
    'colaboradorCpf', colaborador_cpf,
    'colaboradorEmail', colaborador_email,
    'colaboradorTelefone', colaborador_telefone,
    'unidadeTrabalho', unidade_trabalho,
    'local', local,
    'departamentoForms', departamento_forms,
    'respostas', respostas
  ) into result
  from public.entrevistas_desligamento
  where link_token = p_token and status = 'Pendente';
  return result; -- null = token inválido, já respondido ou expirado (nunca existiu)
end;
$$;
revoke all on function public.entrevista_desligamento_publico_get(text) from public;
grant execute on function public.entrevista_desligamento_publico_get(text) to anon, authenticated;

create or replace function public.entrevista_desligamento_publico_salvar(p_token text, p_respostas jsonb)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_row public.entrevistas_desligamento%rowtype;
  v_agora timestamptz := now();
begin
  if p_token is null or length(p_token) < 16 then
    raise exception 'Link inválido.';
  end if;
  select * into v_row from public.entrevistas_desligamento where link_token = p_token and status = 'Pendente';
  if not found then
    raise exception 'Este link não é mais válido — a entrevista já foi respondida ou o link expirou.';
  end if;
  update public.entrevistas_desligamento set
    respostas = p_respostas, status = 'Preenchido', data_finalizacao = v_agora, atualizado_em = v_agora
  where id = v_row.id;
  return true;
end;
$$;
revoke all on function public.entrevista_desligamento_publico_salvar(text, jsonb) from public;
grant execute on function public.entrevista_desligamento_publico_salvar(text, jsonb) to anon, authenticated;

-- ============================================================================
-- BOOTSTRAP DO PRIMEIRO ADMINISTRADOR (faça isto depois de rodar o script acima)
-- ============================================================================
-- 1. No painel do Supabase: Authentication → Users → Add user
--    Marque "Auto Confirm User". Anote o e-mail e a senha que você definir.
-- 2. Volte aqui no SQL Editor e rode o comando abaixo, trocando o e-mail
--    (o bloco de permissões marca TODAS as chaves do catálogo como true —
--    mantenha igual à lista de js/permissions.js):
--
--    insert into public.profiles (id, email, nome, perfil, permissoes)
--    select id, email, 'Administrador', 'admin', '{
--      "indicadores.headcount": true, "indicadores.recrutamento": true,
--      "indicadores.rotatividade": true, "indicadores.desligamento": true,
--      "indicadores.desligamento_gerar_link": true,
--      "indicadores.feedbacks": true, "indicadores.oneonone": true,
--      "indicadores.treinamentos": true, "indicadores.celebracoes": true,
--      "recrutamento.dashboard": true, "recrutamento.vagas": true,
--      "recrutamento.candidatos": true, "recrutamento.agenda": true,
--      "recrutamento.banco_talentos": true, "recrutamento.aprovacoes": true,
--      "recrutamento.historico": true, "recrutamento.transferencia": true,
--      "recrutamento.parecer_gestor": true,
--      "treinamento_dev.onboarding": true, "treinamento_dev.visita_loja": true,
--      "admin.upload": true,
--      "admin.cadastros_recrutamento": true, "admin.usuarios": true
--    }'::jsonb
--    from auth.users
--    where email = 'coloque-o-email-que-voce-cadastrou@sferamultifranquias.com';
--
-- Depois disso esse usuário já consegue logar no Hub Sfera como administrador
-- e cadastrar os demais acessos pela própria tela do app (Administração →
-- Cadastro de Acessos), com o formulário de checkboxes já preenchendo esse
-- mesmo mapa automaticamente.
-- ============================================================================
