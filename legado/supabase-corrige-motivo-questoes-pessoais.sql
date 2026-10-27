-- Corrige a grafia do motivo de desligamento no Headcount (tabela colaboradores):
-- "Questões Pessoas", "Questões pessoais" e "Questão Pessoais" passam a
-- "Questões Pessoais". O upload da planilha de Colaboradores já grava corrigido
-- (js/parsers.js); este script acerta as linhas que já estavam no banco.
-- Rodar uma vez no SQL Editor do Supabase.

-- 1) Conferir o que será alterado (esperado: cerca de 116 linhas)
select desligamento_motivo, count(*)
from colaboradores
where desligamento_motivo ~* 'quest(ão|ões|ao|oes)\s+pesso(ai|a)s'
  and desligamento_motivo !~ 'Questões Pessoais'
group by 1 order by 2 desc;

-- 2) Corrigir
update colaboradores
set desligamento_motivo = regexp_replace(desligamento_motivo, 'quest(ão|ões|ao|oes)\s+pesso(ai|a)s', 'Questões Pessoais', 'i')
where desligamento_motivo ~* 'quest(ão|ões|ao|oes)\s+pesso(ai|a)s'
  and desligamento_motivo !~ 'Questões Pessoais';
