-- ============================================================================
-- Entrevista de Desligamento: checkup de dados (30/09/2026).
--
-- Correções seguras encontradas na varredura completa (planilhas 34 e
-- Controle × banco × Feedz × links). Não apaga nada. Pode rodar de novo.
--
-- 1) Regra link ↔ desligamento (controle_ids_do_link) passa a preferir a
--    ficha válida: ignora "ID Duplicado", "Cancelado" e "Cadastro
--    Inexistente" quando existe uma ficha válida da mesma pessoa. Antes, o
--    link respondido marcou como "Realizada" também a duplicata 3652.
-- 2) Desfaz esse efeito na ficha 3652 (volta a "Inelegível", sem data).
-- 3) Liga cada ficha do Controle ao usuário da Feedz (colaborador_external_id),
--    só quando o nome bate e o último dia trabalhado na Feedz confere com a
--    data de demissão (igual, ou até 7 dias, com um único candidato).
--    Recontratações têm usuários diferentes na Feedz, então cada vínculo fica
--    com o seu. Esperado: cerca de 1.770 fichas.
-- 4) Completa a data de admissão vazia das fichas ligadas, pela Feedz.
-- 5) Links de entrevista: grava o ID do desligamento (hoje todos casam só
--    pelo nome) e a data de desligamento que estava vazia em 7 links.
-- 6) Respostas do Forms (planilha 34) com data de realização errada ou vazia:
--    - 3424: a resposta de 05/01 era do vínculo anterior (ficha 3153); a do
--      vínculo de 2026 é de 21/05/2026;
--    - 3153: "Realizada" sem data → 05/01/2026;
--    - 3230: "Realizada" sem data → 09/02/2026 (a data estava na duplicata 3207).
-- 7) Respostas do Forms sem data de desligamento (30): preenche pela Feedz
--    (último dia trabalhado mais recente antes da resposta, nome único).
-- 8) Cópia antiga das solicitações (entrevista_solicitacao, usada só se o
--    Controle não carregar): status iguais aos do Controle e inclui a 3694.
-- ============================================================================

-- 1) Regra link ↔ desligamento, preferindo a ficha válida.
create or replace function public.controle_ids_do_link(p_id_desligamento text, p_external_id text, p_nome text)
returns bigint[]
language plpgsql stable security definer set search_path = public as $$
declare
  alvo bigint[];
  v_nome text := public.normaliza_nome(p_nome);
  invalidos constant text[] := array['ID Duplicado', 'Cancelado', 'Cadastro Inexistente'];
begin
  if coalesce(p_id_desligamento, '') <> '' then
    select array_agg(c.id) into alvo from public.controle_desligamento c
    where c.id_desligamento = p_id_desligamento and public.normaliza_nome(c.colaborador_nome) = v_nome
      and coalesce(c.status_feedz, '') <> all (invalidos);
    if alvo is null then
      select array_agg(c.id) into alvo from public.controle_desligamento c
      where c.id_desligamento = p_id_desligamento and public.normaliza_nome(c.colaborador_nome) = v_nome;
    end if;
    if alvo is null then
      select array_agg(c.id) into alvo from public.controle_desligamento c
      where c.id_desligamento = p_id_desligamento and coalesce(c.status_feedz, '') <> all (invalidos);
    end if;
    if alvo is null then
      select array_agg(c.id) into alvo from public.controle_desligamento c where c.id_desligamento = p_id_desligamento;
    end if;
  end if;
  if alvo is null and coalesce(p_external_id, '') <> '' then
    select array_agg(c.id) into alvo from public.controle_desligamento c
    where c.colaborador_external_id = p_external_id and coalesce(c.status_feedz, '') <> all (invalidos);
    if alvo is null then
      select array_agg(c.id) into alvo from public.controle_desligamento c where c.colaborador_external_id = p_external_id;
    end if;
  end if;
  if alvo is null and v_nome <> '' then
    select array_agg(c.id) into alvo from public.controle_desligamento c
    where public.normaliza_nome(c.colaborador_nome) = v_nome
      and coalesce(c.status_feedz, '') <> all (invalidos)
      and c.data_demissao is not distinct from (
        select max(c2.data_demissao) from public.controle_desligamento c2
        where public.normaliza_nome(c2.colaborador_nome) = v_nome
          and coalesce(c2.status_feedz, '') <> all (invalidos));
    if alvo is null then
      select array_agg(c.id) into alvo from public.controle_desligamento c
      where public.normaliza_nome(c.colaborador_nome) = v_nome
        and c.data_demissao is not distinct from (
          select max(c2.data_demissao) from public.controle_desligamento c2
          where public.normaliza_nome(c2.colaborador_nome) = v_nome);
    end if;
  end if;
  return alvo;
end;
$$;
revoke all on function public.controle_ids_do_link(text, text, text) from public;

-- 2) Duplicata 3652 marcada por engano pelo link.
update public.controle_desligamento
set status_entrevista = 'Inelegível', data_realizacao = null,
    atualizado_por = 'Checkup de dados (30/09/2026)', atualizado_em = now()
where id_desligamento = '3652' and status_feedz = 'ID Duplicado'
  and atualizado_por = 'Link de entrevista (automático)';

-- 3) Ficha ↔ usuário da Feedz.
with feedz as (
  select h.external_id, public.normaliza_nome(h.nome) as n1, public.normaliza_nome(h.nome_completo) as n2,
         nullif(h.ultimo_dia_trabalhado::text, '')::date as ultimo_dia
  from public.colaboradores h
  where coalesce(h.external_id, '') <> '' and nullif(h.ultimo_dia_trabalhado::text, '') is not null
),
nomes_feedz as (
  select public.normaliza_nome(x.nome) as n from public.colaboradores x where x.nome is not null
  union
  select public.normaliza_nome(x.nome_completo) from public.colaboradores x where x.nome_completo is not null
),
fichas as (
  select c.id, public.normaliza_nome(c.colaborador_nome) as n, c.data_demissao
  from public.controle_desligamento c
  where c.colaborador_external_id is null and c.data_demissao is not null
),
cand as (
  -- mesmo nome
  select f.id, h.external_id, abs(h.ultimo_dia - f.data_demissao) as dif
  from fichas f join feedz h on f.n in (h.n1, h.n2)
  union
  -- mesmo nome sem os espaços (usuário antigo com o nome alterado), só se
  -- não existe ninguém com o nome exato
  select f.id, h.external_id, abs(h.ultimo_dia - f.data_demissao)
  from fichas f join feedz h on replace(f.n, ' ', '') in (replace(h.n1, ' ', ''), replace(h.n2, ' ', ''))
  where f.n not in (select n from nomes_feedz)
),
exato as (select id, min(external_id) as ext, count(distinct external_id) as n from cand where dif = 0 group by id),
perto as (select id, min(external_id) as ext, count(distinct external_id) as n from cand where dif <= 7 group by id),
escolha as (
  select p.id, case when e.id is not null then (case when e.n = 1 then e.ext end)
                    when p.n = 1 then p.ext end as ext
  from perto p left join exato e on e.id = p.id
)
update public.controle_desligamento c
set colaborador_external_id = s.ext
from escolha s
where s.id = c.id and s.ext is not null and c.colaborador_external_id is null;

-- 4) Admissão vazia, pela Feedz.
update public.controle_desligamento c
set data_admissao = nullif(h.data_admissao::text, '')::date
from public.colaboradores h
where h.external_id = c.colaborador_external_id
  and c.data_admissao is null and nullif(h.data_admissao::text, '') is not null;

-- 5) Links: ID do desligamento e data de desligamento.
update public.entrevistas_desligamento l
set id_desligamento = c.id_desligamento
from public.controle_desligamento c
where coalesce(l.id_desligamento, '') = ''
  and array_length(public.controle_ids_do_link(null, l.colaborador_external_id, l.colaborador_nome), 1) = 1
  and c.id = (public.controle_ids_do_link(null, l.colaborador_external_id, l.colaborador_nome))[1];

update public.entrevistas_desligamento l
set data_desligamento = c.data_demissao
from public.controle_desligamento c
where l.data_desligamento is null and c.data_demissao is not null
  and c.id = (public.controle_ids_do_link(l.id_desligamento, l.colaborador_external_id, l.colaborador_nome))[1];

-- 6) Datas de realização (respostas do Forms).
update public.controle_desligamento
set data_realizacao = date '2026-05-21', atualizado_por = 'Checkup de dados (30/09/2026)', atualizado_em = now()
where id_desligamento = '3424' and data_realizacao = date '2026-01-05';

update public.controle_desligamento
set data_realizacao = date '2026-01-05', atualizado_por = 'Checkup de dados (30/09/2026)', atualizado_em = now()
where id_desligamento = '3153' and status_entrevista = 'Realizada' and data_realizacao is null;

update public.controle_desligamento
set data_realizacao = date '2026-02-09', atualizado_por = 'Checkup de dados (30/09/2026)', atualizado_em = now()
where id_desligamento = '3230' and status_entrevista = 'Realizada' and data_realizacao is null;

-- 7) Respostas do Forms sem data de desligamento.
with cand as (
  select p.id, max(nullif(h.ultimo_dia_trabalhado::text, '')::date) as ultimo_dia,
         count(distinct public.normaliza_nome(coalesce(h.nome_completo, h.nome))) as pessoas
  from public.entrevista_pesquisa p
  join public.colaboradores h
    on public.normaliza_nome(p.nome) in (public.normaliza_nome(h.nome), public.normaliza_nome(h.nome_completo))
   and nullif(h.ultimo_dia_trabalhado::text, '')::date <= p.data_conclusao + 3
  where p.data_desligamento is null
  group by p.id
)
update public.entrevista_pesquisa p
set data_desligamento = c.ultimo_dia
from cand c
where c.id = p.id and c.pessoas = 1 and p.data_desligamento is null;

-- 8) Cópia antiga das solicitações: status do Controle e a solicitação 3694.
update public.entrevista_solicitacao s
set status_entrevista = c.status_entrevista, status_feedz = c.status_feedz
from public.controle_desligamento c
where c.id_desligamento = s.planilha_id
  and public.normaliza_nome(c.colaborador_nome) = public.normaliza_nome(s.nome)
  and (s.status_entrevista is distinct from c.status_entrevista or s.status_feedz is distinct from c.status_feedz);

insert into public.entrevista_solicitacao
  (planilha_id, data_solicitacao, nome_solicitante, nome, cargo, unidade, departamento, data_admissao, data_demissao,
   tempo_trabalho, tipo, tipo_desligamento, motivo_desligamento, status_feedz, status_entrevista, observacoes)
select c.id_desligamento, c.data_solicitacao, c.solicitante, c.colaborador_nome, c.cargo, c.unidade, c.departamento,
       c.data_admissao, c.data_demissao, (c.data_demissao - c.data_admissao), c.tipo, c.tipo_desligamento,
       c.motivo, c.status_feedz, c.status_entrevista, c.observacoes
from public.controle_desligamento c
where c.id_desligamento = '3694'
  and not exists (select 1 from public.entrevista_solicitacao s where s.planilha_id = '3694');

-- Conferência
select
  (select count(*) from public.controle_desligamento) as fichas,
  (select count(*) from public.controle_desligamento where colaborador_external_id is not null) as fichas_ligadas_feedz,
  (select count(*) from public.controle_desligamento where data_admissao is null) as fichas_sem_admissao,
  (select status_entrevista from public.controle_desligamento where id_desligamento = '3652') as ficha_3652,
  (select count(*) from public.entrevistas_desligamento where coalesce(id_desligamento, '') <> '') as links_com_id,
  (select count(*) from public.entrevistas_desligamento where data_desligamento is null) as links_sem_data,
  (select count(*) from public.entrevista_pesquisa where data_desligamento is null) as respostas_sem_data_desligamento,
  (select count(*) from public.entrevista_solicitacao) as solicitacoes_copia;
