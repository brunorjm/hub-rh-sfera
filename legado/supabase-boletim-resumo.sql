-- SUBSTITUÍDO por supabase-boletim-resumo-departamento.sql (08/10/2026): o gestor
-- passou a ver só as lojas/departamentos liberados, não a operação inteira.
-- Não rode este arquivo de novo (voltaria à regra antiga).

-- ============================================================================
-- Boletim da Liderança — resumo no Dashboard para quem NÃO tem o módulo
-- ----------------------------------------------------------------------------
-- O módulo Boletim (permissão indicadores.boletim) é só do Administrador. Os
-- gestores veem, no Dashboard, os números PUBLICADOS (mês fechado) do boletim
-- da operação deles — o mesmo boletim que já recebem por newsletter.
--
-- Qual operação cada um vê: a "foto" do mês fechado (boletim_fechamento.dados)
-- guarda as lojas de cada operação; a operação aparece se ao menos uma dessas
-- lojas (departamento, com a unidade tirada do cadastro de Colaboradores)
-- passa pelo can_see() da pessoa — a mesma regra de unidade/departamento do
-- resto do Hub. Ex.: a loja de Valença está no boletim de Juiz de Fora, então
-- quem tem Valença liberada vê a linha de Juiz de Fora.
--
-- Total da empresa: só para quem já enxerga a empresa inteira (Administrador,
-- RH, ou conta sem nenhuma unidade/departamento restrito).
--
-- Devolve o último mês fechado e o mês anterior a ele (se também estiver
-- fechado), para o Dashboard mostrar as setas de comparação.
--
-- Rodar uma vez no SQL Editor do Supabase. Pode rodar de novo sem problema.
-- ============================================================================

create or replace function public.boletim_resumo_publicado()
returns table (mes date, operacao text, dados jsonb)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_mes date;
  v_ant date;
  v_tudo boolean;
begin
  select (p.perfil in ('admin', 'rh'))
         or (coalesce(array_length(p.unidades, 1), 0) = 0 and coalesce(array_length(p.departamentos, 1), 0) = 0)
    into v_tudo
  from public.profiles p
  where p.id = auth.uid() and coalesce(p.status, 'ativo') = 'ativo';
  if v_tudo is null then
    return; -- sem cadastro ativo no Hub
  end if;

  select max(f.mes) into v_mes from public.boletim_fechamento f;
  if v_mes is null then
    return; -- nenhum mês fechado ainda
  end if;
  v_ant := (date_trunc('month', v_mes) - interval '1 month')::date;

  return query
  select f.mes, f.operacao, f.dados
  from public.boletim_fechamento f
  where date_trunc('month', f.mes) in (date_trunc('month', v_mes), date_trunc('month', v_ant))
    and (
      (f.operacao = 'empresa' and v_tudo)
      or (f.operacao <> 'empresa' and (
        v_tudo
        or exists (
          select 1
          from jsonb_array_elements(coalesce(f.dados -> 'lojas', '[]'::jsonb)) l
          join public.colaboradores c
            on lower(trim(c.departamento)) = lower(trim(l ->> 'departamento'))
          where public.can_see(c.unidade, c.departamento)
        )
      ))
    );
end;
$$;

revoke all on function public.boletim_resumo_publicado() from public, anon;
grant execute on function public.boletim_resumo_publicado() to authenticated;
