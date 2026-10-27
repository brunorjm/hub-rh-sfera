-- ============================================================================
-- Corrige cadastros com "ver todos" marcado sem a permissão principal
-- ----------------------------------------------------------------------------
-- "Headcount — ver todos os colaboradores" (indicadores.headcount_completo) e
-- "Organograma — ver a estrutura completa" (indicadores.organograma_completo)
-- só ampliam a tela principal; sozinhos não liberam nada. Em 08/10/2026, 15
-- contas tinham o "ver todos" marcado e a principal desmarcada (sem o menu
-- Headcount/Organograma e sem o cartão de Colaboradores no Dashboard). Decisão
-- do usuário: marcar a permissão principal nessas contas.
--
-- Contas desligadas ficam de fora (o cadastro delas não pode ser editado).
-- Rodar uma vez no SQL Editor do Supabase. Pode rodar de novo sem problema.
-- ============================================================================

-- Conferência antes (quem vai mudar):
select nome, perfil,
       (permissoes ->> 'indicadores.headcount_completo')::boolean is true
         and coalesce((permissoes ->> 'indicadores.headcount')::boolean, false) = false  as ganha_headcount,
       (permissoes ->> 'indicadores.organograma_completo')::boolean is true
         and coalesce((permissoes ->> 'indicadores.organograma')::boolean, false) = false as ganha_organograma
from public.profiles
where coalesce(status, 'ativo') <> 'desligado'
  and (
    ((permissoes ->> 'indicadores.headcount_completo')::boolean is true and coalesce((permissoes ->> 'indicadores.headcount')::boolean, false) = false)
    or ((permissoes ->> 'indicadores.organograma_completo')::boolean is true and coalesce((permissoes ->> 'indicadores.organograma')::boolean, false) = false)
  )
order by nome;

update public.profiles
set permissoes = permissoes || '{"indicadores.headcount": true}'::jsonb
where coalesce(status, 'ativo') <> 'desligado'
  and (permissoes ->> 'indicadores.headcount_completo')::boolean is true
  and coalesce((permissoes ->> 'indicadores.headcount')::boolean, false) = false;

update public.profiles
set permissoes = permissoes || '{"indicadores.organograma": true}'::jsonb
where coalesce(status, 'ativo') <> 'desligado'
  and (permissoes ->> 'indicadores.organograma_completo')::boolean is true
  and coalesce((permissoes ->> 'indicadores.organograma')::boolean, false) = false;
