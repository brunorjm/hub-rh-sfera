-- ============================================================================
-- Controle de Desligamento: motivo do desligamento vira lista fixa.
-- 1) Cria o campo motivo_detalhe (texto livre opcional; obrigatório no "Outro").
-- 2) Converte o histórico: cada variação antiga (texto exato) vira um item da
--    lista; textos raros, com informação a mais, ficam guardados no detalhe.
-- Pode rodar de novo: só converte o que ainda estiver com o texto antigo.
-- ============================================================================

alter table public.controle_desligamento add column if not exists motivo_detalhe text;

with mapa(original, novo, detalhe) as (values
  ('A cargo da gestão', 'Outro', 'A cargo da gestão'),
  ('Abandono de Emprego', 'Abandono de emprego', null),
  ('Adaptação a Cultura Organizacional', 'Adaptação à cultura organizacional', null),
  ('Adequação do quadro da loja', 'Redução ou adequação de quadro', 'Adequação do quadro da loja'),
  ('Assiduidade', 'Assiduidade (faltas e atrasos)', null),
  ('Atestado Falso', 'Ato de improbidade (ex.: atestado falso)', 'Atestado Falso'),
  ('Ato de Improbidade', 'Ato de improbidade (ex.: atestado falso)', null),
  ('Baixo Desempenho/ Performance', 'Baixo desempenho / performance', null),
  ('Bolsa de estudos - Curso de 1mês', 'Estudos', 'Bolsa de estudos - Curso de 1mês'),
  ('Cobrindo Férias', 'Término de contrato (experiência, temporário, aprendiz, extra)', 'Cobrindo Férias'),
  ('Colaborador alega estar com problemas de saúde, disse que está muito puxado o trabalho no estoque e não pode pegar peso', 'Problemas de saúde', 'Colaborador alega estar com problemas de saúde, disse que está muito puxado o trabalho no estoque e não pode pegar peso'),
  ('Colaborador alegou que não gostaria de continuar pois sentiu que não iria se adaptar bem', 'Adaptação à cultura organizacional', 'Colaborador alegou que não gostaria de continuar pois sentiu que não iria se adaptar bem'),
  ('Colaborador não consegue auxiliar o horário de trabalho com a faculdade.', 'Estudos', 'Colaborador não consegue auxiliar o horário de trabalho com a faculdade.'),
  ('Colaboradora entregou atestado falso', 'Ato de improbidade (ex.: atestado falso)', 'Colaboradora entregou atestado falso'),
  ('Comportamento Inadequado', 'Comportamento inadequado', null),
  ('Comum Acordo', 'Outro', 'Comum Acordo'),
  ('Contratação de empresa terceirizada', 'Redução ou adequação de quadro', 'Contratação de empresa terceirizada'),
  ('Corte de funcionários segundo a supervisão', 'Redução ou adequação de quadro', 'Corte de funcionários segundo a supervisão'),
  ('Dedicar-se Aos Estudos', 'Estudos', 'Dedicar-se Aos Estudos'),
  ('Dificuldade com processo - não se adaptado a rotina de loja', 'Adaptação à cultura organizacional', 'Dificuldade com processo - não se adaptado a rotina de loja'),
  ('Diminuição de Quadro', 'Redução ou adequação de quadro', 'Diminuição de Quadro'),
  ('Diminuição de quadro', 'Redução ou adequação de quadro', 'Diminuição de quadro'),
  ('Dispensa', 'Outro', 'Dispensa'),
  ('Disse que nesse momento quer se dedicar aos estudos visto que irá começar a faculdade no ano que vem', 'Estudos', 'Disse que nesse momento quer se dedicar aos estudos visto que irá começar a faculdade no ano que vem'),
  ('EXTRA NATAL', 'Término de contrato (experiência, temporário, aprendiz, extra)', 'EXTRA NATAL'),
  ('Em Busca de Crescimento Profissional', 'Outra oportunidade — cargo e/ou crescimento', 'Em Busca de Crescimento Profissional'),
  ('Encerramento de Operação Hering', 'Encerramento de loja / operação', 'Encerramento de Operação Hering'),
  ('Encerramento do CNPJ', 'Encerramento de loja / operação', 'Encerramento do CNPJ'),
  ('Entrou apenas para extra natal e cobrir férias', 'Término de contrato (experiência, temporário, aprendiz, extra)', 'Entrou apenas para extra natal e cobrir férias'),
  ('Está retornando de licença maternidade e deseja ficar em casa no primeiro ano do filho', 'Questões pessoais', 'Está retornando de licença maternidade e deseja ficar em casa no primeiro ano do filho'),
  ('Extra Natal - Término Contrato', 'Término de contrato (experiência, temporário, aprendiz, extra)', 'Extra Natal - Término Contrato'),
  ('Extra Natal - Término de Contrato', 'Término de contrato (experiência, temporário, aprendiz, extra)', 'Extra Natal - Término de Contrato'),
  ('Extra natal - Termino de contrato', 'Término de contrato (experiência, temporário, aprendiz, extra)', 'Extra natal - Termino de contrato'),
  ('Extranatal ( Time já esta completo )', 'Término de contrato (experiência, temporário, aprendiz, extra)', 'Extranatal ( Time já esta completo )'),
  ('Falta injustificada, atrasos constantes', 'Assiduidade (faltas e atrasos)', 'Falta injustificada, atrasos constantes'),
  ('Fechamento Loja', 'Encerramento de loja / operação', 'Fechamento Loja'),
  ('Incompatibilidade com o Cargo', 'Incompatibilidade com o cargo', null),
  ('Interesse em outra vaga + insatisfação com equipe', 'Outra oportunidade — cargo e/ou crescimento', 'Interesse em outra vaga + insatisfação com equipe'),
  ('Irá trabalhar com turismo', 'Outra oportunidade — cargo e/ou crescimento', 'Irá trabalhar com turismo'),
  ('Justa Causa', 'Outro', 'Justa Causa'),
  ('Loja Encerrará as Operações', 'Encerramento de loja / operação', 'Loja Encerrará as Operações'),
  ('MAIS PROXIMO DA SUA CASA', 'Outra oportunidade — modalidade de trabalho', 'MAIS PROXIMO DA SUA CASA'),
  ('Mudança de Cidade', 'Mudança de cidade', null),
  ('Mudança de cidade', 'Mudança de cidade', 'Mudança de cidade'),
  ('Mudança de quadro', 'Redução ou adequação de quadro', 'Mudança de quadro'),
  ('Não tem ninguém para ficar com os filhos', 'Questões pessoais', 'Não tem ninguém para ficar com os filhos'),
  ('Não teremos mais a função no quadro fixo', 'Redução ou adequação de quadro', 'Não teremos mais a função no quadro fixo'),
  ('Oportunidade de crescimento', 'Outra oportunidade — cargo e/ou crescimento', 'Oportunidade de crescimento'),
  ('Outra Oportunidade de Trabalho - Cargo e/ou Perspectiva de Crescimento', 'Outra oportunidade — cargo e/ou crescimento', null),
  ('Outra Oportunidade de Trabalho - Modalidade de Trabalho', 'Outra oportunidade — modalidade de trabalho', null),
  ('Outra Oportunidade de Trabalho - Remun. e/ou Benef', 'Outra oportunidade — remuneração e/ou benefícios', 'Outra Oportunidade de Trabalho - Remun. e/ou Benef'),
  ('Outra Oportunidade de Trabalho - Remun. e/ou Benef.', 'Outra oportunidade — remuneração e/ou benefícios', null),
  ('Outra oportunidade de trabalho', 'Outra oportunidade — cargo e/ou crescimento', 'Outra oportunidade de trabalho'),
  ('Performance / Resultado', 'Baixo desempenho / performance', 'Performance / Resultado'),
  ('Prefere não especificar o motivo', 'Prefere não informar', null),
  ('Problema de Saude', 'Problemas de saúde', 'Problema de Saude'),
  ('Problemas Pessoais', 'Questões pessoais', 'Problemas Pessoais'),
  ('Quadro Completo', 'Redução ou adequação de quadro', null),
  ('Quadro Completo / Extra Natal', 'Término de contrato (experiência, temporário, aprendiz, extra)', null),
  ('Quadro de Funcionários', 'Redução ou adequação de quadro', 'Quadro de Funcionários'),
  ('Qualidade de Vida', 'Qualidade de vida', null),
  ('Qualidade de vida', 'Qualidade de vida', null),
  ('Questão Pessoal', 'Questões pessoais', null),
  ('Questões Pessoais', 'Questões pessoais', null),
  ('Questões Pessoas', 'Questões pessoais', null),
  ('Questões Pessoas - Problemas de Saúde', 'Problemas de saúde', 'Questões Pessoas - Problemas de Saúde'),
  ('Questões pessoas', 'Questões pessoais', null),
  ('Redução de Quadro', 'Redução ou adequação de quadro', null),
  ('Reestruturação Organizacional', 'Redução ou adequação de quadro', 'Reestruturação Organizacional'),
  ('Relacionamento com a Equipe', 'Relacionamento com a equipe', null),
  ('Relacionamento com a Gestão', 'Relacionamento com a gestão', null),
  ('Remuneração', 'Outra oportunidade — remuneração e/ou benefícios', 'Remuneração'),
  ('SUBSTITUIÇÃO DE FÉRIAS', 'Término de contrato (experiência, temporário, aprendiz, extra)', 'SUBSTITUIÇÃO DE FÉRIAS'),
  ('Se desmotivou', 'Questões pessoais', 'Se desmotivou'),
  ('Será recontratada como Consultora de Vendas', 'Outro', 'Será recontratada como Consultora de Vendas'),
  ('Termino de contrato de experiencia', 'Término de contrato (experiência, temporário, aprendiz, extra)', 'Termino de contrato de experiencia'),
  ('Termino de contrato jovem aprediz', 'Término de contrato (experiência, temporário, aprendiz, extra)', 'Termino de contrato jovem aprediz'),
  ('Teste', 'Outro', 'Teste'),
  ('Transição de Carreira', 'Transição de carreira', null),
  ('TÉRMINO DE CONTRATO', 'Término de contrato (experiência, temporário, aprendiz, extra)', null),
  ('Término de Contrato', 'Término de contrato (experiência, temporário, aprendiz, extra)', 'Término de Contrato'),
  ('Término de Contrato Temporário', 'Término de contrato (experiência, temporário, aprendiz, extra)', 'Término de Contrato Temporário'),
  ('Término de Contrato na Data (Pela Empresa)', 'Término de contrato (experiência, temporário, aprendiz, extra)', 'Término de Contrato na Data (Pela Empresa)'),
  ('Término de contrato', 'Término de contrato (experiência, temporário, aprendiz, extra)', 'Término de contrato'),
  ('Vai se dedicar a faculdade - fazer os estágios presenciais', 'Estudos', 'Vai se dedicar a faculdade - fazer os estágios presenciais'),
  ('devido a ter recebido uma medida disciplinar', 'Comportamento inadequado', 'devido a ter recebido uma medida disciplinar'),
  ('estagio faculdade', 'Estudos', 'estagio faculdade'),
  ('falsificação de atestado médico', 'Ato de improbidade (ex.: atestado falso)', 'falsificação de atestado médico'),
  ('problemas de saúde', 'Problemas de saúde', 'problemas de saúde')
)
update public.controle_desligamento c
set motivo = m.novo,
    motivo_detalhe = coalesce(c.motivo_detalhe, m.detalhe)
from mapa m
where c.motivo = m.original and c.motivo is distinct from m.novo;

-- Conferência: quantidade por motivo depois da conversão
select coalesce(motivo, '(sem motivo)') as motivo, count(*) as desligamentos
from public.controle_desligamento
group by 1 order by 2 desc;
