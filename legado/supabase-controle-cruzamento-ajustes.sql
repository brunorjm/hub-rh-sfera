-- ============================================================================
-- Controle de Desligamento × respostas da entrevista: acertos do cruzamento
-- pessoa a pessoa (30/09/2026). Pode rodar de novo (não duplica).
--
-- A) Data de demissão digitada errada no Controle (ano ou mês trocado);
--    a data certa confere com o último dia na Feedz e com a solicitação.
--    3167: com a data errada, o checkup criou por engano uma 2ª ficha
--    (Extra Natal) para a mesma pessoa — essa ficha nova é removida.
-- B) Respostas de um vínculo creditadas também ao vínculo anterior da mesma
--    pessoa (recontratação): a ficha antiga volta a "Não Realizada".
-- C) Respostas que não casaram pelo nome escrito diferente ou pela demissão
--    divergente entre planilha e Controle: a ficha passa a "Realizada" com a
--    data da resposta.
-- D) Data de desligamento das respostas do Forms que vinham com a data errada.
-- E) Liga à Feedz as fichas que tiveram a data corrigida.
-- ============================================================================

-- A) Datas de demissão
with fix(id_desl, antiga, nova) as (values
  ('3170', date '2025-02-06', date '2026-02-06'),
  ('3156', date '2025-01-26', date '2026-01-26'),
  ('3167', date '2025-01-03', date '2025-12-31'),
  ('2705', date '2024-05-30', date '2025-05-30'),
  ('1974', date '2024-04-19', date '2024-08-19'),
  ('2889', date '2025-05-28', date '2025-08-28')
)
update public.controle_desligamento c
set data_demissao = f.nova, atualizado_por = 'Checkup de dados (30/09/2026)', atualizado_em = now()
from fix f
where c.id_desligamento = f.id_desl and c.data_demissao = f.antiga and c.status_feedz = 'Finalizado';

-- 3167 e sua duplicata criada no checkup (mesma pessoa, Extra Natal)
delete from public.controle_desligamento n
where n.id = 1945 and n.criado_por = 'Checkup de dados (30/09/2026)' and n.id_desligamento = '0'
  and exists (select 1 from public.controle_desligamento c
              where c.id_desligamento = '3167'
                and public.normaliza_nome(c.colaborador_nome) = public.normaliza_nome(n.colaborador_nome));

-- B) Vínculo anterior com a entrevista do vínculo novo
with fix(antiga, nova) as (values ('2054', '3346'), ('2371', '3421'), ('2807', '3354'))
update public.controle_desligamento c
set status_entrevista = 'Não Realizada', data_realizacao = null,
    atualizado_por = 'Checkup de dados (30/09/2026)', atualizado_em = now()
from fix f
where c.id_desligamento = f.antiga and c.status_entrevista = 'Realizada'
  and exists (select 1 from public.controle_desligamento k
              where k.id_desligamento = f.nova and k.status_entrevista = 'Realizada'
                and k.data_realizacao = c.data_realizacao
                and public.normaliza_nome(k.colaborador_nome) = public.normaliza_nome(c.colaborador_nome));

-- C) Respostas × fichas (resposta, ficha)
with par(pid, id_desl, por_id) as (values
  ('158', '3231', false), ('91', '0', true),
  ('P30-41', '1540', false), ('P30-99', '1628', false), ('P30-161', '1683', false), ('P30-140', '1557', false),
  ('P30-268', '2564', false), ('P30-318', '2782', false), ('P30-308', '2889', false), ('P30-292', '2244', false),
  ('P30-307', '2830', false)
)
update public.controle_desligamento c
set status_entrevista = 'Realizada',
    data_realizacao = coalesce(c.data_realizacao, p.data_conclusao),
    atualizado_por = 'Checkup de dados (30/09/2026)', atualizado_em = now()
from par x
join public.entrevista_pesquisa p on p.planilha_id = x.pid
where c.id_desligamento = x.id_desl
  and coalesce(c.status_feedz, '') not in ('ID Duplicado', 'Cancelado', 'Cadastro Inexistente')
  and (c.status_entrevista is distinct from 'Realizada' or c.data_realizacao is null)
  and (
    -- ficha da resposta 91: a do Extra Natal (id 1934)
    (x.por_id and c.id = 1934)
    -- demais: mesmo nome; ou nome parecido, quando é a única ficha com esse ID
    or (not x.por_id and (public.normaliza_nome(c.colaborador_nome) = public.normaliza_nome(p.nome)
                          or (select count(*) from public.controle_desligamento k where k.id_desligamento = x.id_desl) = 1))
  );

-- D) Data de desligamento das respostas do Forms
with fix(pid, antiga, nova) as (values
  ('89',  date '2026-05-16', date '2025-12-31'),
  ('158', date '2026-07-25', date '2026-01-31'),
  ('102', date '2025-01-03', date '2025-12-31'),
  ('165', date '2025-02-06', date '2026-02-06'),
  ('223', date '2025-01-26', date '2026-01-26')
)
update public.entrevista_pesquisa p
set data_desligamento = f.nova
from fix f
where p.planilha_id = f.pid and p.data_desligamento = f.antiga;

update public.entrevista_pesquisa
set data_desligamento = date '2025-12-31'
where planilha_id = '91' and data_desligamento is null;

-- E) Ficha ↔ usuário da Feedz para as datas corrigidas
with feedz as (
  select h.external_id, public.normaliza_nome(h.nome) as n1, public.normaliza_nome(h.nome_completo) as n2,
         nullif(h.ultimo_dia_trabalhado::text, '')::date as ultimo_dia
  from public.colaboradores h
  where coalesce(h.external_id, '') <> '' and nullif(h.ultimo_dia_trabalhado::text, '') is not null
),
cand as (
  select c.id, h.external_id
  from public.controle_desligamento c
  join feedz h on public.normaliza_nome(c.colaborador_nome) in (h.n1, h.n2) and h.ultimo_dia = c.data_demissao
  where c.colaborador_external_id is null and c.id_desligamento in ('3170', '3156', '3167', '2705', '1974', '2889')
),
unico as (select id, min(external_id) as ext from cand group by id having count(distinct external_id) = 1)
update public.controle_desligamento c
set colaborador_external_id = u.ext
from unico u
where u.id = c.id and c.colaborador_external_id is null;

-- Conferência
select c.id_desligamento, c.data_demissao, c.status_entrevista, c.data_realizacao, (c.colaborador_external_id is not null) as ligada_feedz
from public.controle_desligamento c
where c.id_desligamento in ('3170', '3156', '3167', '2705', '1974', '2889', '2054', '2371', '2807', '3231',
                            '1540', '1628', '1683', '2564', '2782', '2244', '2830')
   or c.id in (1934, 1945)
order by c.id_desligamento;
