-- 1_rls_original — as regras de acesso (RLS) do Supabase, de volta como rede de segurança.
--
-- O servidor do hub roda cada operação numa transação com
--   set local role hub_app; select set_config('app.usuario_id', <id>, true);
-- (src/lib/rls.ts). O papel hub_app NÃO é dono das tabelas, então as policies
-- abaixo valem para ele exatamente como valiam para "authenticated" no Supabase.
-- O dono (usuário do banco do app) continua ignorando RLS: migrations, jobs e
-- as funções security definer funcionam como antes.
--
-- Gerado a partir do dump de produção de 27/10/2026 (pg_restore -s): os
-- "ENABLE ROW LEVEL SECURITY" e os 164 "CREATE POLICY" são cópia literal, com
-- "TO authenticated[, anon]" trocado por "TO hub_app".

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'hub_app') then
    create role hub_app nologin;
  end if;
end $$;
-- Quem roda as migrations (o usuário do app) precisa poder assumir hub_app.
grant hub_app to current_user;

grant usage on schema public, auth, extensions to hub_app;
grant select, insert, update, delete on all tables in schema public to hub_app;
grant usage, select on all sequences in schema public to hub_app;
grant execute on all functions in schema public, auth, extensions to hub_app;
-- conexao_private: só pelas funções security definer, como no Supabase.

ALTER TABLE conexao_private.audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE conexao_private.nps ENABLE ROW LEVEL SECURITY;
ALTER TABLE conexao_private.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE conexao_private.secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academia_hering ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acesso_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avaliacao_experiencia_45 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avaliacao_experiencia_90 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boletim_entradas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boletim_fechamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadastro_autorizado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cargos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.celebracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.controle_desligamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.controle_vagas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desempenho_regras_relatorio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engajamento_notas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engajamento_participacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engajamento_pulso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entrevista_pesquisa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entrevista_pesquisa_perguntas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entrevista_solicitacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entrevistas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entrevistas_desligamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiencia_candidato ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fechamento_periodo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fontes_captacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hub_versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.humor_individual ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.humor_mensal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metas_vagas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.niveis_vaga ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.one_on_one ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pareceres_gestor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pesquisa_clima ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pesquisa_clima_hc ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recrutadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recrutamento_departamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.satisfacao_ciclo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.satisfacao_respostas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.satisfacao_suporte ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.satisfacao_triagem ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seguranca_fase1_relatorio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treinamento_turmas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treinamento_turmas_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.twygo_conteudos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.twygo_participantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.twygo_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unibe_pdv ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unibe_pessoas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vagas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viewas_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitas_loja ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_no_direct_access ON conexao_private.audit AS RESTRICTIVE TO hub_app USING (false) WITH CHECK (false);
CREATE POLICY nps_no_direct_access ON conexao_private.nps AS RESTRICTIVE TO hub_app USING (false) WITH CHECK (false);
CREATE POLICY records_no_direct_access ON conexao_private.records AS RESTRICTIVE TO hub_app USING (false) WITH CHECK (false);
CREATE POLICY secrets_no_direct_access ON conexao_private.secrets AS RESTRICTIVE TO hub_app USING (false) WITH CHECK (false);
CREATE POLICY academia_hering_select ON public.academia_hering FOR SELECT USING ((( SELECT public.has_permission('indicadores.treinamentos'::text) AS has_permission) AND public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), COALESCE(unidade, '(sem unidade)'::text), departamento)));
CREATE POLICY acesso_log_select ON public.acesso_log FOR SELECT USING (( SELECT public.has_permission('admin.log_acessos'::text) AS has_permission));
CREATE POLICY avaliacao_experiencia_45_select ON public.avaliacao_experiencia_45 FOR SELECT USING ((( SELECT public.has_permission('indicadores.experiencia'::text) AS has_permission) AND public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento)));
CREATE POLICY avaliacao_experiencia_45_write_del ON public.avaliacao_experiencia_45 FOR DELETE USING (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY avaliacao_experiencia_45_write_ins ON public.avaliacao_experiencia_45 FOR INSERT WITH CHECK (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY avaliacao_experiencia_45_write_upd ON public.avaliacao_experiencia_45 FOR UPDATE USING (( SELECT public.has_permission('admin.upload'::text) AS has_permission)) WITH CHECK (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY avaliacao_experiencia_90_select ON public.avaliacao_experiencia_90 FOR SELECT USING ((( SELECT public.has_permission('indicadores.experiencia'::text) AS has_permission) AND public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento)));
CREATE POLICY avaliacao_experiencia_90_write_del ON public.avaliacao_experiencia_90 FOR DELETE USING (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY avaliacao_experiencia_90_write_ins ON public.avaliacao_experiencia_90 FOR INSERT WITH CHECK (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY avaliacao_experiencia_90_write_upd ON public.avaliacao_experiencia_90 FOR UPDATE USING (( SELECT public.has_permission('admin.upload'::text) AS has_permission)) WITH CHECK (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY boletim_entradas_select ON public.boletim_entradas FOR SELECT USING (( SELECT public.has_permission('indicadores.boletim'::text) AS has_permission));
CREATE POLICY boletim_fechamento_select ON public.boletim_fechamento FOR SELECT USING (( SELECT public.has_permission('indicadores.boletim'::text) AS has_permission));
CREATE POLICY boletim_le_avaliacao_experiencia_45 ON public.avaliacao_experiencia_45 FOR SELECT USING ((( SELECT public.has_permission('indicadores.boletim'::text) AS has_permission) AND public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento)));
CREATE POLICY boletim_le_avaliacao_experiencia_90 ON public.avaliacao_experiencia_90 FOR SELECT USING ((( SELECT public.has_permission('indicadores.boletim'::text) AS has_permission) AND public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento)));
CREATE POLICY boletim_le_engajamento_participacao ON public.engajamento_participacao FOR SELECT USING ((( SELECT public.has_permission('indicadores.boletim'::text) AS has_permission) AND public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento)));
CREATE POLICY boletim_le_engajamento_pulso ON public.engajamento_pulso FOR SELECT USING (( SELECT public.has_permission('indicadores.boletim'::text) AS has_permission));
CREATE POLICY cadastro_autorizado_delete ON public.cadastro_autorizado FOR DELETE USING (( SELECT public.has_permission('admin.usuarios'::text) AS has_permission));
CREATE POLICY cadastro_autorizado_insert ON public.cadastro_autorizado FOR INSERT WITH CHECK (( SELECT public.has_permission('admin.usuarios'::text) AS has_permission));
CREATE POLICY cadastro_autorizado_select ON public.cadastro_autorizado FOR SELECT USING (( SELECT public.has_permission('admin.usuarios'::text) AS has_permission));
CREATE POLICY cadastro_autorizado_update ON public.cadastro_autorizado FOR UPDATE USING (( SELECT public.has_permission('admin.usuarios'::text) AS has_permission)) WITH CHECK (( SELECT public.has_permission('admin.usuarios'::text) AS has_permission));
CREATE POLICY candidatos_select ON public.candidatos FOR SELECT USING ((public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento) AND (( SELECT public.has_permission('recrutamento.dashboard'::text) AS has_permission) OR ( SELECT public.has_permission('indicadores.recrutamento'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.vagas'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.candidatos'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.agenda'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.banco_talentos'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.aprovacoes'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.historico'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.parecer_gestor'::text) AS has_permission))));
CREATE POLICY candidatos_write_del ON public.candidatos FOR DELETE USING ((( SELECT public.has_permission('recrutamento.candidatos'::text) AS has_permission) AND public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento)));
CREATE POLICY candidatos_write_ins ON public.candidatos FOR INSERT WITH CHECK ((( SELECT public.has_permission('recrutamento.candidatos'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.parecer_gestor'::text) AS has_permission)));
CREATE POLICY candidatos_write_upd ON public.candidatos FOR UPDATE USING (((( SELECT public.has_permission('recrutamento.candidatos'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.parecer_gestor'::text) AS has_permission)) AND public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento))) WITH CHECK ((( SELECT public.has_permission('recrutamento.candidatos'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.parecer_gestor'::text) AS has_permission)));
CREATE POLICY cargos_select ON public.cargos FOR SELECT USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY cargos_write_del ON public.cargos FOR DELETE USING (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission));
CREATE POLICY cargos_write_ins ON public.cargos FOR INSERT WITH CHECK (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission));
CREATE POLICY cargos_write_upd ON public.cargos FOR UPDATE USING (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission)) WITH CHECK (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission));
CREATE POLICY celebracoes_select ON public.celebracoes FOR SELECT USING ((public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento) AND ( SELECT public.has_permission('indicadores.celebracoes'::text) AS has_permission)));
CREATE POLICY celebracoes_write_del ON public.celebracoes FOR DELETE USING (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY celebracoes_write_ins ON public.celebracoes FOR INSERT WITH CHECK (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY celebracoes_write_upd ON public.celebracoes FOR UPDATE USING (( SELECT public.has_permission('admin.upload'::text) AS has_permission)) WITH CHECK (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY colaboradores_select ON public.colaboradores FOR SELECT USING (public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento));
CREATE POLICY colaboradores_write_del ON public.colaboradores FOR DELETE USING (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY colaboradores_write_ins ON public.colaboradores FOR INSERT WITH CHECK (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY colaboradores_write_upd ON public.colaboradores FOR UPDATE USING (( SELECT public.has_permission('admin.upload'::text) AS has_permission)) WITH CHECK (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY controle_desligamento_insert ON public.controle_desligamento FOR INSERT WITH CHECK (( SELECT public.has_permission('indicadores.controle_desligamento'::text) AS has_permission));
CREATE POLICY controle_desligamento_select ON public.controle_desligamento FOR SELECT USING ((public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento) AND ( SELECT public.has_permission('indicadores.controle_desligamento'::text) AS has_permission)));
CREATE POLICY controle_desligamento_update ON public.controle_desligamento FOR UPDATE USING (( SELECT public.has_permission('indicadores.controle_desligamento'::text) AS has_permission)) WITH CHECK (( SELECT public.has_permission('indicadores.controle_desligamento'::text) AS has_permission));
CREATE POLICY controle_vagas_select ON public.controle_vagas FOR SELECT USING ((public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento) AND ( SELECT public.has_permission('indicadores.fechamento'::text) AS has_permission)));
CREATE POLICY engajamento_notas_select ON public.engajamento_notas FOR SELECT USING ((( SELECT public.has_permission('indicadores.boletim'::text) AS has_permission) AND public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento)));
CREATE POLICY engajamento_participacao_select ON public.engajamento_participacao FOR SELECT USING ((( SELECT public.has_permission('indicadores.engajamento'::text) AS has_permission) AND public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento)));
CREATE POLICY engajamento_pulso_select ON public.engajamento_pulso FOR SELECT USING (( SELECT public.has_permission('indicadores.engajamento'::text) AS has_permission));
CREATE POLICY entrevista_pesquisa_perguntas_select ON public.entrevista_pesquisa_perguntas FOR SELECT TO hub_app USING (true);
CREATE POLICY entrevista_pesquisa_select ON public.entrevista_pesquisa FOR SELECT USING ((public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento) AND ( SELECT public.has_permission('indicadores.desligamento'::text) AS has_permission)));
CREATE POLICY entrevista_pesquisa_write_del ON public.entrevista_pesquisa FOR DELETE USING (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY entrevista_pesquisa_write_ins ON public.entrevista_pesquisa FOR INSERT WITH CHECK (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY entrevista_pesquisa_write_upd ON public.entrevista_pesquisa FOR UPDATE USING (( SELECT public.has_permission('admin.upload'::text) AS has_permission)) WITH CHECK (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY entrevista_solicitacao_select ON public.entrevista_solicitacao FOR SELECT USING ((public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento) AND ( SELECT public.has_permission('indicadores.desligamento'::text) AS has_permission)));
CREATE POLICY entrevista_solicitacao_write_del ON public.entrevista_solicitacao FOR DELETE USING (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY entrevista_solicitacao_write_ins ON public.entrevista_solicitacao FOR INSERT WITH CHECK (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY entrevista_solicitacao_write_upd ON public.entrevista_solicitacao FOR UPDATE USING (( SELECT public.has_permission('admin.upload'::text) AS has_permission)) WITH CHECK (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY entrevistas_desligamento_insert ON public.entrevistas_desligamento FOR INSERT WITH CHECK ((( SELECT public.has_permission('indicadores.controle_desligamento'::text) AS has_permission) OR ( SELECT public.has_permission('indicadores.desligamento_gerar_link'::text) AS has_permission)));
CREATE POLICY entrevistas_desligamento_select ON public.entrevistas_desligamento FOR SELECT USING ((public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento) AND (( SELECT public.has_permission('indicadores.controle_desligamento'::text) AS has_permission) OR ( SELECT public.has_permission('indicadores.desligamento_gerar_link'::text) AS has_permission))));
CREATE POLICY entrevistas_desligamento_update ON public.entrevistas_desligamento FOR UPDATE USING ((( SELECT public.has_permission('indicadores.controle_desligamento'::text) AS has_permission) OR ( SELECT public.has_permission('indicadores.desligamento_gerar_link'::text) AS has_permission))) WITH CHECK ((( SELECT public.has_permission('indicadores.controle_desligamento'::text) AS has_permission) OR ( SELECT public.has_permission('indicadores.desligamento_gerar_link'::text) AS has_permission)));
CREATE POLICY entrevistas_select ON public.entrevistas FOR SELECT USING ((public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, NULL::text) AND (( SELECT public.has_permission('recrutamento.dashboard'::text) AS has_permission) OR ( SELECT public.has_permission('indicadores.recrutamento'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.agenda'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.candidatos'::text) AS has_permission))));
CREATE POLICY entrevistas_write_del ON public.entrevistas FOR DELETE USING ((( SELECT public.has_permission('recrutamento.agenda'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.candidatos'::text) AS has_permission)));
CREATE POLICY entrevistas_write_ins ON public.entrevistas FOR INSERT WITH CHECK ((( SELECT public.has_permission('recrutamento.agenda'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.candidatos'::text) AS has_permission)));
CREATE POLICY entrevistas_write_upd ON public.entrevistas FOR UPDATE USING ((( SELECT public.has_permission('recrutamento.agenda'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.candidatos'::text) AS has_permission))) WITH CHECK ((( SELECT public.has_permission('recrutamento.agenda'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.candidatos'::text) AS has_permission)));
CREATE POLICY etapas_select ON public.etapas FOR SELECT USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY etapas_write_del ON public.etapas FOR DELETE USING (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission));
CREATE POLICY etapas_write_ins ON public.etapas FOR INSERT WITH CHECK (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission));
CREATE POLICY etapas_write_upd ON public.etapas FOR UPDATE USING (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission)) WITH CHECK (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission));
CREATE POLICY experiencia_candidato_select ON public.experiencia_candidato FOR SELECT USING (public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento));
CREATE POLICY experiencia_candidato_write_del ON public.experiencia_candidato FOR DELETE USING (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY experiencia_candidato_write_ins ON public.experiencia_candidato FOR INSERT WITH CHECK (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY experiencia_candidato_write_upd ON public.experiencia_candidato FOR UPDATE USING (( SELECT public.has_permission('admin.upload'::text) AS has_permission)) WITH CHECK (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY fechamento_periodo_insert ON public.fechamento_periodo FOR INSERT WITH CHECK (( SELECT public.has_permission('indicadores.fechamento'::text) AS has_permission));
CREATE POLICY fechamento_periodo_select ON public.fechamento_periodo FOR SELECT USING (( SELECT public.has_permission('indicadores.fechamento'::text) AS has_permission));
CREATE POLICY fechamento_periodo_update ON public.fechamento_periodo FOR UPDATE USING (( SELECT public.has_permission('indicadores.fechamento'::text) AS has_permission)) WITH CHECK (( SELECT public.has_permission('indicadores.fechamento'::text) AS has_permission));
CREATE POLICY feedbacks_select ON public.feedbacks FOR SELECT USING ((public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento) AND ( SELECT public.has_permission('indicadores.feedbacks'::text) AS has_permission)));
CREATE POLICY feedbacks_write_del ON public.feedbacks FOR DELETE USING (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY feedbacks_write_ins ON public.feedbacks FOR INSERT WITH CHECK (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY feedbacks_write_upd ON public.feedbacks FOR UPDATE USING (( SELECT public.has_permission('admin.upload'::text) AS has_permission)) WITH CHECK (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY fontes_captacao_select ON public.fontes_captacao FOR SELECT USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY fontes_captacao_write_del ON public.fontes_captacao FOR DELETE USING (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission));
CREATE POLICY fontes_captacao_write_ins ON public.fontes_captacao FOR INSERT WITH CHECK (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission));
CREATE POLICY fontes_captacao_write_upd ON public.fontes_captacao FOR UPDATE USING (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission)) WITH CHECK (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission));
CREATE POLICY historico_select ON public.historico FOR SELECT USING (( SELECT public.has_permission('recrutamento.historico'::text) AS has_permission));
CREATE POLICY historico_write ON public.historico FOR INSERT WITH CHECK ((( SELECT public.has_permission('recrutamento.vagas'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.candidatos'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.agenda'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.aprovacoes'::text) AS has_permission)));
CREATE POLICY hub_versoes_select ON public.hub_versoes FOR SELECT TO hub_app USING (true);
CREATE POLICY humor_individual_insert ON public.humor_individual FOR INSERT TO hub_app WITH CHECK ((( SELECT public.has_permission('admin.upload'::text) AS has_permission) AND ( SELECT public.has_permission('indicadores.boletim'::text) AS has_permission) AND ( SELECT public.has_permission('indicadores.headcount_completo'::text) AS has_permission) AND (EXISTS ( SELECT 1
   FROM public.colaboradores c
  WHERE ((c.external_id = humor_individual.colaborador_external_id) AND (c.data_admissao = humor_individual.data_admissao))))));
CREATE POLICY humor_individual_select ON public.humor_individual FOR SELECT TO hub_app USING ((( SELECT public.has_permission('indicadores.headcount'::text) AS has_permission) AND ( SELECT public.has_permission('indicadores.boletim'::text) AS has_permission) AND (EXISTS ( SELECT 1
   FROM public.colaboradores c
  WHERE ((c.external_id = humor_individual.colaborador_external_id) AND (c.data_admissao = humor_individual.data_admissao) AND public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), c.unidade, c.departamento) AND (( SELECT public.has_permission('indicadores.headcount_completo'::text) AS has_permission) OR (c.external_id IN ( SELECT g.external_id
           FROM public.organograma_meu_galho() g(external_id, nome, nome_completo, cargo, departamento, unidade, gestor_direto, situacao, grupos, data_admissao, relacao)
          WHERE (g.relacao = ANY (ARRAY['eu'::text, 'abaixo'::text]))))))))));
CREATE POLICY humor_mensal_select ON public.humor_mensal FOR SELECT USING ((( SELECT public.has_permission('indicadores.boletim'::text) AS has_permission) AND public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento)));
CREATE POLICY metas_vagas_select ON public.metas_vagas FOR SELECT USING (( SELECT public.has_permission('indicadores.fechamento'::text) AS has_permission));
CREATE POLICY niveis_vaga_select ON public.niveis_vaga FOR SELECT USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY niveis_vaga_write_del ON public.niveis_vaga FOR DELETE USING (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission));
CREATE POLICY niveis_vaga_write_ins ON public.niveis_vaga FOR INSERT WITH CHECK (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission));
CREATE POLICY niveis_vaga_write_upd ON public.niveis_vaga FOR UPDATE USING (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission)) WITH CHECK (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission));
CREATE POLICY onboarding_insert ON public.onboarding FOR INSERT WITH CHECK ((( SELECT public.has_permission('recrutamento.candidatos'::text) AS has_permission) OR ( SELECT public.has_permission('treinamento_dev.onboarding'::text) AS has_permission)));
CREATE POLICY onboarding_select ON public.onboarding FOR SELECT USING ((public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento) AND (( SELECT public.has_permission('treinamento_dev.onboarding'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.candidatos'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.vagas'::text) AS has_permission))));
CREATE POLICY onboarding_update ON public.onboarding FOR UPDATE USING ((( SELECT public.has_permission('treinamento_dev.onboarding'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.vagas'::text) AS has_permission))) WITH CHECK ((( SELECT public.has_permission('treinamento_dev.onboarding'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.vagas'::text) AS has_permission)));
CREATE POLICY one_on_one_select ON public.one_on_one FOR SELECT USING ((public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento) AND ( SELECT public.has_permission('indicadores.oneonone'::text) AS has_permission)));
CREATE POLICY one_on_one_write_del ON public.one_on_one FOR DELETE USING (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY one_on_one_write_ins ON public.one_on_one FOR INSERT WITH CHECK (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY one_on_one_write_upd ON public.one_on_one FOR UPDATE USING (( SELECT public.has_permission('admin.upload'::text) AS has_permission)) WITH CHECK (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY pareceres_gestor_insert ON public.pareceres_gestor FOR INSERT WITH CHECK (( SELECT public.has_permission('recrutamento.candidatos'::text) AS has_permission));
CREATE POLICY pareceres_gestor_select ON public.pareceres_gestor FOR SELECT USING ((public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento) AND (( SELECT public.has_permission('recrutamento.parecer_gestor'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.candidatos'::text) AS has_permission))));
CREATE POLICY pareceres_gestor_update ON public.pareceres_gestor FOR UPDATE USING ((( SELECT public.has_permission('recrutamento.parecer_gestor'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.candidatos'::text) AS has_permission))) WITH CHECK ((( SELECT public.has_permission('recrutamento.parecer_gestor'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.candidatos'::text) AS has_permission)));
CREATE POLICY pesquisa_clima_hc_select ON public.pesquisa_clima_hc FOR SELECT USING ((( SELECT public.has_permission('indicadores.pesquisa_clima'::text) AS has_permission) AND public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento)));
CREATE POLICY pesquisa_clima_hc_write_del ON public.pesquisa_clima_hc FOR DELETE USING (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY pesquisa_clima_hc_write_ins ON public.pesquisa_clima_hc FOR INSERT WITH CHECK (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY pesquisa_clima_hc_write_upd ON public.pesquisa_clima_hc FOR UPDATE USING (( SELECT public.has_permission('admin.upload'::text) AS has_permission)) WITH CHECK (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY pesquisa_clima_select ON public.pesquisa_clima FOR SELECT USING ((( SELECT public.has_permission('indicadores.pesquisa_clima'::text) AS has_permission) AND public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento)));
CREATE POLICY pesquisa_clima_write_del ON public.pesquisa_clima FOR DELETE USING (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY pesquisa_clima_write_ins ON public.pesquisa_clima FOR INSERT WITH CHECK (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY pesquisa_clima_write_upd ON public.pesquisa_clima FOR UPDATE USING (( SELECT public.has_permission('admin.upload'::text) AS has_permission)) WITH CHECK (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY portais_select ON public.portais FOR SELECT USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY portais_write_del ON public.portais FOR DELETE USING (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission));
CREATE POLICY portais_write_ins ON public.portais FOR INSERT WITH CHECK (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission));
CREATE POLICY portais_write_upd ON public.portais FOR UPDATE USING (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission)) WITH CHECK (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission));
CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (((id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.has_permission('admin.usuarios'::text) AS has_permission)));
CREATE POLICY profiles_write_del ON public.profiles FOR DELETE USING (( SELECT public.has_permission('admin.usuarios'::text) AS has_permission));
CREATE POLICY profiles_write_ins ON public.profiles FOR INSERT WITH CHECK (( SELECT public.has_permission('admin.usuarios'::text) AS has_permission));
CREATE POLICY profiles_write_upd ON public.profiles FOR UPDATE USING (( SELECT public.has_permission('admin.usuarios'::text) AS has_permission)) WITH CHECK (( SELECT public.has_permission('admin.usuarios'::text) AS has_permission));
CREATE POLICY recrutadores_select ON public.recrutadores FOR SELECT USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY recrutadores_write_del ON public.recrutadores FOR DELETE USING (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission));
CREATE POLICY recrutadores_write_ins ON public.recrutadores FOR INSERT WITH CHECK (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission));
CREATE POLICY recrutadores_write_upd ON public.recrutadores FOR UPDATE USING (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission)) WITH CHECK (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission));
CREATE POLICY recrutamento_departamentos_select ON public.recrutamento_departamentos FOR SELECT USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY recrutamento_departamentos_write_del ON public.recrutamento_departamentos FOR DELETE USING (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission));
CREATE POLICY recrutamento_departamentos_write_ins ON public.recrutamento_departamentos FOR INSERT WITH CHECK (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission));
CREATE POLICY recrutamento_departamentos_write_upd ON public.recrutamento_departamentos FOR UPDATE USING (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission)) WITH CHECK (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission));
CREATE POLICY satisfacao_ciclo_select ON public.satisfacao_ciclo FOR SELECT USING ((( SELECT public.has_permission('indicadores.satisfacao'::text) AS has_permission) OR ( SELECT public.has_permission('admin.usuarios'::text) AS has_permission)));
CREATE POLICY satisfacao_suporte_select ON public.satisfacao_suporte FOR SELECT USING ((( SELECT public.has_permission('indicadores.boletim'::text) AS has_permission) AND public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento)));
CREATE POLICY solicitacoes_insert ON public.solicitacoes FOR INSERT WITH CHECK ((( SELECT public.has_permission('recrutamento.vagas'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.candidatos'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.agenda'::text) AS has_permission)));
CREATE POLICY solicitacoes_select ON public.solicitacoes FOR SELECT USING (( SELECT public.has_permission('recrutamento.aprovacoes'::text) AS has_permission));
CREATE POLICY solicitacoes_update ON public.solicitacoes FOR UPDATE USING (( SELECT public.has_permission('recrutamento.aprovacoes'::text) AS has_permission)) WITH CHECK (( SELECT public.has_permission('recrutamento.aprovacoes'::text) AS has_permission));
CREATE POLICY treinamento_turmas_log_select ON public.treinamento_turmas_log FOR SELECT USING (( SELECT public.has_permission('treinamento_dev.turmas_gestor'::text) AS has_permission));
CREATE POLICY treinamento_turmas_select ON public.treinamento_turmas FOR SELECT USING ((( SELECT public.has_permission('treinamento_dev.turmas'::text) AS has_permission) OR ( SELECT public.has_permission('treinamento_dev.turmas_gestor'::text) AS has_permission) OR (( SELECT public.has_permission('treinamento_dev.turmas_lancar'::text) AS has_permission) AND (criado_por = ( SELECT auth.uid() AS uid)))));
CREATE POLICY twygo_conteudos_select ON public.twygo_conteudos FOR SELECT USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY twygo_conteudos_write_del ON public.twygo_conteudos FOR DELETE USING (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY twygo_conteudos_write_ins ON public.twygo_conteudos FOR INSERT WITH CHECK (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY twygo_conteudos_write_upd ON public.twygo_conteudos FOR UPDATE USING (( SELECT public.has_permission('admin.upload'::text) AS has_permission)) WITH CHECK (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY twygo_participantes_select ON public.twygo_participantes FOR SELECT USING ((public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento) AND ( SELECT public.has_permission('indicadores.treinamentos'::text) AS has_permission)));
CREATE POLICY twygo_participantes_write_del ON public.twygo_participantes FOR DELETE USING (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY twygo_participantes_write_ins ON public.twygo_participantes FOR INSERT WITH CHECK (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY twygo_participantes_write_upd ON public.twygo_participantes FOR UPDATE USING (( SELECT public.has_permission('admin.upload'::text) AS has_permission)) WITH CHECK (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY twygo_usuarios_select ON public.twygo_usuarios FOR SELECT USING ((public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento) AND ( SELECT public.has_permission('indicadores.treinamentos'::text) AS has_permission)));
CREATE POLICY twygo_usuarios_write_del ON public.twygo_usuarios FOR DELETE USING (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY twygo_usuarios_write_ins ON public.twygo_usuarios FOR INSERT WITH CHECK (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY twygo_usuarios_write_upd ON public.twygo_usuarios FOR UPDATE USING (( SELECT public.has_permission('admin.upload'::text) AS has_permission)) WITH CHECK (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY unibe_pdv_select ON public.unibe_pdv FOR SELECT USING ((( SELECT public.has_permission('indicadores.treinamentos'::text) AS has_permission) AND (public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), COALESCE(unidade, '(sem unidade)'::text), departamento) OR public.treinamentos_ve_escritorio())));
CREATE POLICY unibe_pessoas_select ON public.unibe_pessoas FOR SELECT USING ((( SELECT public.has_permission('indicadores.treinamentos'::text) AS has_permission) AND (public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), COALESCE(unidade, '(sem unidade)'::text), departamento) OR public.treinamentos_ve_escritorio())));
CREATE POLICY unidades_select ON public.unidades FOR SELECT USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY unidades_write_del ON public.unidades FOR DELETE USING (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission));
CREATE POLICY unidades_write_ins ON public.unidades FOR INSERT WITH CHECK (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission));
CREATE POLICY unidades_write_upd ON public.unidades FOR UPDATE USING (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission)) WITH CHECK (( SELECT public.has_permission('admin.cadastros_recrutamento'::text) AS has_permission));
CREATE POLICY upload_log_insert ON public.upload_log FOR INSERT WITH CHECK (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY upload_log_select ON public.upload_log FOR SELECT USING (( SELECT public.has_permission('admin.upload'::text) AS has_permission));
CREATE POLICY vagas_select ON public.vagas FOR SELECT USING ((public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento) AND (( SELECT public.has_permission('recrutamento.dashboard'::text) AS has_permission) OR ( SELECT public.has_permission('indicadores.recrutamento'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.vagas'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.candidatos'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.agenda'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.banco_talentos'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.aprovacoes'::text) AS has_permission) OR ( SELECT public.has_permission('recrutamento.historico'::text) AS has_permission))));
CREATE POLICY vagas_write_del ON public.vagas FOR DELETE USING ((( SELECT public.has_permission('recrutamento.vagas'::text) AS has_permission) AND public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento)));
CREATE POLICY vagas_write_ins ON public.vagas FOR INSERT WITH CHECK (( SELECT public.has_permission('recrutamento.vagas'::text) AS has_permission));
CREATE POLICY vagas_write_upd ON public.vagas FOR UPDATE USING ((( SELECT public.has_permission('recrutamento.vagas'::text) AS has_permission) AND public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), unidade, departamento))) WITH CHECK (( SELECT public.has_permission('recrutamento.vagas'::text) AS has_permission));
CREATE POLICY viewas_log_insert ON public.viewas_log FOR INSERT WITH CHECK (( SELECT public.has_permission('admin.usuarios'::text) AS has_permission));
CREATE POLICY viewas_log_select ON public.viewas_log FOR SELECT USING (( SELECT public.has_permission('admin.usuarios'::text) AS has_permission));
CREATE POLICY viewas_log_update ON public.viewas_log FOR UPDATE USING (( SELECT public.has_permission('admin.usuarios'::text) AS has_permission)) WITH CHECK (( SELECT public.has_permission('admin.usuarios'::text) AS has_permission));
CREATE POLICY visitas_loja_insert ON public.visitas_loja FOR INSERT WITH CHECK (( SELECT public.has_permission('treinamento_dev.visita_loja'::text) AS has_permission));
CREATE POLICY visitas_loja_select ON public.visitas_loja FOR SELECT USING ((public.can_see_escopo(( SELECT public.hub_escopo() AS hub_escopo), area, 'Treinamento e Desenvolvimento'::text) AND ( SELECT public.has_permission('treinamento_dev.visita_loja'::text) AS has_permission)));
CREATE POLICY visitas_loja_update ON public.visitas_loja FOR UPDATE USING (( SELECT public.has_permission('treinamento_dev.visita_loja'::text) AS has_permission)) WITH CHECK (( SELECT public.has_permission('treinamento_dev.visita_loja'::text) AS has_permission));
