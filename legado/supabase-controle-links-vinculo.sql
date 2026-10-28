-- ============================================================================
-- Controle de Desligamento: casos conferidos pelo RH (30/09/2026).
--
-- 1) 3673: a entrevista respondida em 16/09 pelo link ED-2026-034 foi gerada
--    (na antiga subaba de gerar link) para o usuário da Feedz do vínculo
--    ANTERIOR da mesma pessoa (ficha 2546, demissão em 04/04/2025), então o
--    link e a data de realização caíram na ficha 2546. O link passa a apontar
--    para o vínculo certo (3673, usuário atual da Feedz) e a 2546 volta a
--    "Não Realizada".
-- 2) 3164: a ficha do Extra Natal criada no checkup (id interno 1934) é o
--    mesmo vínculo da 3164 (mesma admissão, demissão e loja; o nome do usuário
--    antigo foi alterado de formas diferentes na Feedz e na planilha). Remove a
--    ficha repetida e liga a 3164 ao usuário da Feedz.
-- 3) 3478: entrevista presencial, não digitalizada — continua "Realizada"
--    (nenhuma alteração).
-- ============================================================================

-- 1) Link ED-2026-034 → ficha 3673
update public.entrevistas_desligamento l
set id_desligamento = c.id_desligamento,
    colaborador_external_id = c.colaborador_external_id,
    colaborador_nome = coalesce(nullif(trim(h.nome_completo), ''), h.nome, c.colaborador_nome),
    data_desligamento = c.data_demissao,
    data_admissao = coalesce(c.data_admissao, l.data_admissao),
    unidade = c.unidade,
    departamento = c.departamento,
    cargo = coalesce(h.cargo, c.cargo, l.cargo)
from public.controle_desligamento c
left join public.colaboradores h on h.external_id = c.colaborador_external_id
where l.id = 'ED-2026-034' and c.id_desligamento = '3673'
  and c.colaborador_external_id is not null
  and l.id_desligamento is distinct from '3673';

update public.controle_desligamento
set status_entrevista = 'Realizada', data_realizacao = coalesce(data_realizacao, date '2026-09-16'),
    atualizado_por = 'Checkup de dados (30/09/2026)', atualizado_em = now()
where id_desligamento = '3673' and status_feedz = 'Finalizado';

update public.controle_desligamento
set status_entrevista = 'Não Realizada', data_realizacao = null,
    atualizado_por = 'Checkup de dados (30/09/2026)', atualizado_em = now()
where id_desligamento = '2546' and data_realizacao = date '2026-09-16'
  and atualizado_por = 'Link de entrevista (automático)';

-- 2) 3164 × ficha repetida do Extra Natal
update public.controle_desligamento c
set colaborador_external_id = n.colaborador_external_id
from public.controle_desligamento n
where c.id_desligamento = '3164' and c.colaborador_external_id is null
  and n.id = 1934 and n.criado_por = 'Checkup de dados (30/09/2026)'
  and n.data_admissao = c.data_admissao and n.data_demissao = c.data_demissao;

delete from public.controle_desligamento n
where n.id = 1934 and n.criado_por = 'Checkup de dados (30/09/2026)' and n.id_desligamento = '0'
  and exists (select 1 from public.controle_desligamento c
              where c.id_desligamento = '3164' and c.colaborador_external_id = n.colaborador_external_id);

-- Conferência
select 'link' as o_que, l.id as ref, l.id_desligamento as ficha, l.data_desligamento::text as demissao, l.status as status, null::text as realizacao
from public.entrevistas_desligamento l where l.id = 'ED-2026-034'
union all
select 'ficha', c.id_desligamento, c.id_desligamento, c.data_demissao::text, c.status_entrevista, c.data_realizacao::text
from public.controle_desligamento c where c.id_desligamento in ('3673', '2546', '3164', '3478')
union all
select 'ficha 1934 (deve sumir)', c.id::text, c.id_desligamento, c.data_demissao::text, c.status_entrevista, null
from public.controle_desligamento c where c.id = 1934;
