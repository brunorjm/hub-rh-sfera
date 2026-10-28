-- ============================================================================
-- Controle de Desligamento: fichas do Extra Natal 2025 e ajustes aprovados
-- pelo RH no checkup de 30/09/2026. Pode rodar de novo (não duplica).
--
-- 1) Cria a ficha dos desligados de dez/2025 que estão na Feedz e não têm
--    ficha (Extra Natal 2025, ~65). Dados da Feedz (nome, cargo, unidade,
--    departamento, admissão, último dia, contato). Entrevista: "Realizada" com
--    a data da resposta, se a pessoa respondeu o Forms depois do desligamento;
--    senão "Não Realizada". ID do desligamento "0" (sem ID do Forms do
--    gestor, mesmo padrão da planilha).
-- 2) Sete desligamentos lançados duas vezes (mesma pessoa, mesma demissão,
--    as duas "Finalizado"): mantém a primeira solicitação e marca a outra
--    como "ID Duplicado".
-- 3) 3568: a entrevista de 03/02/2026 era de um vínculo anterior (admissão
--    deste vínculo em 27/04/2026) → "Não Realizada", sem data.
-- 5) 3136: justa causa que respondeu a entrevista → "Realizada" (tipo e
--    motivo continuam justa causa).
-- ============================================================================

-- 1) Extra Natal 2025
insert into public.controle_desligamento
  (id_desligamento, data_solicitacao, solicitante, colaborador_external_id, colaborador_nome, colaborador_cpf, contato,
   cargo, unidade, departamento, data_admissao, data_demissao, tipo, tipo_desligamento, motivo, motivo_detalhe,
   status_feedz, status_entrevista, data_realizacao, observacoes, extra_natal, criado_por, atualizado_por)
select '0', u.ultimo_dia, null, h.external_id, coalesce(nullif(trim(h.nome_completo), ''), h.nome),
       nullif(regexp_replace(coalesce(h.cpf::text, ''), '\D', '', 'g'), ''),
       nullif(regexp_replace(coalesce(h.matricula::text, ''), '\D', '', 'g'), ''),
       h.cargo, h.unidade, h.departamento, nullif(h.data_admissao::text, '')::date, u.ultimo_dia,
       'Involuntária - Sem Aviso', 'Término de Contrato na Data (Pela Empresa)',
       'Término de contrato (experiência, temporário, aprendiz, extra)', 'Extra Natal 2025',
       'Finalizado',
       case when r.data_conclusao is not null then 'Realizada' else 'Não Realizada' end,
       r.data_conclusao,
       'Ficha criada no checkup de 30/09/2026 a partir da Feedz (desligado do Extra Natal 2025 sem ficha na planilha).',
       true, 'Checkup de dados (30/09/2026)', 'Checkup de dados (30/09/2026)'
from public.colaboradores h
cross join lateral (select nullif(h.ultimo_dia_trabalhado::text, '')::date as ultimo_dia) u
left join lateral (
  select min(p.data_conclusao) as data_conclusao
  from public.entrevista_pesquisa p
  where public.normaliza_nome(p.nome) in (public.normaliza_nome(h.nome), public.normaliza_nome(h.nome_completo))
    and p.data_conclusao >= u.ultimo_dia
) r on true
where u.ultimo_dia between date '2025-12-01' and date '2026-01-10'
  and coalesce(h.external_id, '') <> ''
  and not exists (select 1 from public.controle_desligamento c where c.colaborador_external_id = h.external_id)
  and not exists (select 1 from public.controle_desligamento c
                  where c.data_demissao = u.ultimo_dia
                    and public.normaliza_nome(c.colaborador_nome) in (public.normaliza_nome(h.nome), public.normaliza_nome(h.nome_completo)));

-- 2) Duplicados: (fica, vira ID Duplicado)
with pares(fica, duplicado) as (values
  ('1557', '1637'), ('2242', '2372'), ('1907', '1929'), ('2671', '2680'),
  ('2869', '2894'), ('1711', '1728'), ('1955', '1988')
)
update public.controle_desligamento d
set status_feedz = 'ID Duplicado',
    status_entrevista = case when coalesce(d.status_entrevista, '') in ('', 'Não Realizada') then 'Inelegível' else d.status_entrevista end,
    observacoes = concat_ws(' | ', nullif(d.observacoes, ''), 'Duplicado da solicitação ' || p.fica || ' (checkup 30/09/2026)'),
    atualizado_por = 'Checkup de dados (30/09/2026)', atualizado_em = now()
from pares p
where d.id_desligamento = p.duplicado
  and d.status_feedz = 'Finalizado'
  and exists (select 1 from public.controle_desligamento k
              where k.id_desligamento = p.fica and k.id <> d.id
                and public.normaliza_nome(k.colaborador_nome) = public.normaliza_nome(d.colaborador_nome));

-- 3) 3568
update public.controle_desligamento
set status_entrevista = 'Não Realizada', data_realizacao = null,
    atualizado_por = 'Checkup de dados (30/09/2026)', atualizado_em = now()
where id_desligamento = '3568' and data_realizacao = date '2026-02-03';

-- 5) 3136
update public.controle_desligamento
set status_entrevista = 'Realizada',
    atualizado_por = 'Checkup de dados (30/09/2026)', atualizado_em = now()
where id_desligamento = '3136' and status_entrevista is distinct from 'Realizada';

-- Conferência (esperado: ~65 fichas novas, 28 delas "Realizada"; 7 duplicados; 3568 e 3136 como acima)
select
  (select count(*) from public.controle_desligamento where criado_por = 'Checkup de dados (30/09/2026)') as fichas_extra_natal_novas,
  (select count(*) from public.controle_desligamento where criado_por = 'Checkup de dados (30/09/2026)' and status_entrevista = 'Realizada') as novas_realizadas,
  (select count(*) from public.controle_desligamento where observacoes like '%checkup 30/09/2026%') as marcados_duplicado,
  (select status_entrevista from public.controle_desligamento where id_desligamento = '3568') as ficha_3568,
  (select status_entrevista from public.controle_desligamento where id_desligamento = '3136') as ficha_3136,
  (select count(*) from public.controle_desligamento) as total_fichas;
