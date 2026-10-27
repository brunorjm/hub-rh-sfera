-- ============================================================================
-- Controle de Desligamento: departamento do histórico com os nomes do
-- Headcount. O histórico importado da planilha usa nomes curtos ("Rio Sul",
-- "VD Madureira (RJ)"); os perfis dos gestores e a regra de acesso do banco
-- (can_see) usam os nomes do Headcount ("Levis Rio Sul", "O Boticário VD
-- Madureira"). Sem isso, gestores restritos por departamento não enxergam os
-- desligamentos da própria loja no painel.
-- Converte por par unidade + departamento (o mesmo nome curto existe em marcas
-- diferentes). Ficam como estão: "VD Sorrento Benfica (JF)" (o Headcount tem
-- dois nomes para essa loja), "Quem disse, Berenice?", "Escritório" e uma
-- "Copacabana" da Levis (sem loja correspondente no Headcount).
-- Pode rodar de novo: só altera o que ainda estiver com o nome antigo.
-- ============================================================================

with mapa(unidade, antigo, novo) as (values
  ('Boticário - Interior de MG', 'Manhuaçu (MG)', 'O Boticário Manhuaçu (MG)'),
  ('Boticário - Três Rios', '3R Quiosque', 'O Boticário 3R Quiosque'),
  ('Hering', 'Rio Sul', 'Hering Rio Sul'),
  ('Hering', 'Catete', 'Hering Catete'),
  ('Boticário VD - Rio de Janeiro', 'VD Madureira (RJ)', 'O Boticário VD Madureira'),
  ('Boticário - Rio de Janeiro', 'Calçadão Madu', 'O Boticário Calçadão Madu'),
  ('Boticário - Rio de Janeiro', 'Polo 01', 'O Boticário Polo 01'),
  ('Boticário - Juiz de Fora', 'Halfeld', 'O Boticário Halfeld'),
  ('Boticário - Interior de MG', 'Leopoldina (MG)', 'O Boticário Leopoldina (MG)'),
  ('Boticário - Rio de Janeiro', 'Partage', 'O Boticário Partage'),
  ('Boticário - Rio de Janeiro', 'Madureira Shop', 'O Boticário Madureira Shop'),
  ('Boticário - Juiz de Fora', 'Carrefour Rio Branco', 'O Boticário Carrefour Rio Branco'),
  ('Boticário - Rio de Janeiro', 'Norte Shop P2', 'O Boticário Norte Shop P2'),
  ('Boticário - Rio de Janeiro', 'Alcântara', 'O Boticário Alcântara'),
  ('Boticário - Rio de Janeiro', 'Guanabara', 'O Boticário Guanabara'),
  ('Boticário - Interior de MG', 'Santos Dumont (MG)', 'O Boticário Santos Dumont (MG)'),
  ('Boticário VD - Interior de MG', 'VD Santos Dumont (MG)', 'O Boticário VD Santos Dumont (MG)'),
  ('Boticário VD - Três Rios', 'VD Liva (3R)', 'O Boticário VD Liva'),
  ('Levis', 'Rio Sul', 'Levis Rio Sul'),
  ('Boticário VD - Rio de Janeiro', 'VD Alcântara (SG)', 'O Boticário VD Alcântara'),
  ('Boticário VD - Interior de MG', 'VD Raul Soares (MG)', 'O Boticário VD Raul Soares (MG)'),
  ('Boticário - Interior de MG', 'Caratinga Olegário (MG)', 'O Boticário Caratinga Olegário (MG)'),
  ('Boticário - Interior de MG', 'Carangola (MG)', 'O Boticário Carangola (MG)'),
  ('Boticário VD - Interior de MG', 'VD Leopoldina (MG)', 'O Boticário VD Leopoldina (MG)'),
  ('Boticário - Interior de MG', 'Manhumirim (MG)', 'O Boticário Manhumirim (MG)'),
  ('Hering', 'Plaza', 'Hering Plaza'),
  ('Boticário - Interior de MG', 'Caratinga Raul (MG)', 'O Boticário Caratinga Raul (MG)'),
  ('Boticário - Juiz de Fora', 'Santa Cruz', 'O Boticário Santa Cruz'),
  ('Boticário - Três Rios', '3R Galeria', 'O Boticário 3R Galeria'),
  ('Boticário - Interior de MG', 'Raul Soares (MG)', 'O Boticário Raul Soares (MG)'),
  ('Boticário - Juiz de Fora', 'Jardim Norte', 'O Boticário Jardim Norte'),
  ('Boticário - Interior de MG', 'Carandaí (MG)', 'O Boticário Carandaí (MG)'),
  ('Boticário - Rio de Janeiro', 'Mercadão', 'O Boticário Mercadão'),
  ('Levis', 'Barra', 'Levis Barra'),
  ('Boticário - Juiz de Fora', 'Marechal', 'O Boticário Marechal'),
  ('Boticário VD - Interior de MG', 'VD Além Paraíba (MG)', 'O Boticário VD Além Paraíba (MG)'),
  ('Boticário - Rio de Janeiro', 'Sulacap', 'O Boticário Sulacap'),
  ('Levis', 'Nova América', 'Levis Nova América'),
  ('Boticário - Rio de Janeiro', 'Norte Shop P1', 'O Boticário Norte Shop P1'),
  ('Hering', 'Icaraí', 'Hering Icaraí'),
  ('Levis', 'Tijuca', 'Levis Tijuca'),
  ('Hering', 'Américas Shop', 'Hering Américas Shop'),
  ('Hering', 'Copacabana', 'Hering Copacabana'),
  ('Boticário - Rio de Janeiro', 'São Gonçalo Shop', 'O Boticário São Gonçalo Shop'),
  ('Boticário - Juiz de Fora', 'Independência', 'O Boticário Independência'),
  ('Boticário VD - Rio de Janeiro', 'VD Partage (SG)', 'O Boticário VD Partage'),
  ('Boticário VD - Juiz de Fora', 'VD Sorrento Centro (JF)', 'O Boticário VD Sorrento Centro'),
  ('Levis', 'Norte', 'Levis Norte'),
  ('Boticário - Juiz de Fora', 'Mister', 'O Boticário Mister'),
  ('Boticário VD - Interior de MG', 'VD Manhuaçu (MG)', 'O Boticário VD Manhuaçu (MG)'),
  ('Boticário VD - Interior de MG', 'VD Carangola (MG)', 'O Boticário VD Carangola (MG)'),
  ('Boticário - Rio de Janeiro', 'Carrefour', 'O Boticário Carrefour'),
  ('Levis', 'Plaza', 'Levis Plaza'),
  ('Boticário - Rio de Janeiro', 'Valqueire', 'O Boticário Valqueire'),
  ('Boticário - Interior de MG', 'Além Paraíba (MG)', 'O Boticário Além Paraíba (MG)'),
  ('Levis', 'Caxias', 'Levis Caxias'),
  ('Boticário - Rio de Janeiro', 'Rodo', 'O Boticário Rodo'),
  ('Boticário - Rio de Janeiro', 'RODO', 'O Boticário Rodo'),
  ('Hering', 'Via Parque', 'Hering Via Parque'),
  ('Boticário VD - Interior de MG', 'VD Caratinga (MG)', 'O Boticário VD Caratinga (MG)'),
  ('Boticário - Interior de MG', 'Ipanema (MG)', 'O Boticário Ipanema (MG)'),
  ('Boticário - Interior de MG', 'Barroso (MG)', 'O Boticário Barroso (MG)'),
  ('Boticário VD - Interior de MG', 'VD Aimorés (MG)', 'O Boticário VD Aimorés (MG)'),
  ('Boticário - Interior de MG', 'Inhapim (MG)', 'O Boticário Inhapim (MG)'),
  ('Boticário - Interior de MG', 'Aimorés (MG)', 'O Boticário Aimorés (MG)'),
  ('Boticário - Rio de Janeiro', 'Campinho', 'O Boticário Campinho'),
  ('Boticário - Interior de MG', 'Espera Feliz (MG)', 'O Boticário Espera Feliz (MG)'),
  ('Boticário - Rio de Janeiro', 'Shop Madureira', 'O Boticário Madureira Shop')
)
update public.controle_desligamento c
set departamento = m.novo
from mapa m
where c.departamento = m.antigo
  and c.unidade is not distinct from m.unidade;

-- Conferência: desligamentos cujo departamento não existe no Headcount
-- (esperado: só os casos listados acima, cerca de 44)
select c.unidade, c.departamento, count(*) as desligamentos
from public.controle_desligamento c
where c.departamento is not null
  and not exists (select 1 from public.colaboradores h where h.departamento = c.departamento)
group by 1, 2 order by 3 desc;
