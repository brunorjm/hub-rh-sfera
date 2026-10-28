// Porte de legado/test/conexao-fit.test.cjs (mesmos casos, dados e valores).
// O legado roda os asserts soltos e imprime "24 verificações" fixo no texto,
// mas o arquivo tem 25 asserts; aqui cada assert é uma verificação (25).
import assert from 'node:assert/strict';
import * as F from '@/lib/calculos/conexao-fit-core';

let registradas = 0;
const verificacao = (nome: string, fn: () => void) => { registradas++; test(nome, fn); };

const sample = ['Pessoa de teste\nResultados do Teste: Fit Cultural\nCompletado 28 Mai 26 às 13:25h\n54 % ADERÊNCIA COMPORTAMENTAL\n62 % ADERÊNCIA VALORES\n58 % ADERÊNCIA FINAL\nA configuração das Competências foi alterada', 'Criatividade e Inovação 74%\nEmpreendedorismo 74%\nRelacionamento Interpessoal 74%\nPlanejamento 26%\nValores Pessoais\nVALORES DA EMPRESA ADERÊNCIA\nGENTE QUE GOSTA DE GENTE 88%\n#SOMOS TODOS SFERA 79%\nVALORES DE SCHWARTZ ADERÊNCIA\nAltruísmo 89%\nAuto determinação (líder de si mesmo / autonomia) 78%'];
const parsed = F.parse(sample);
verificacao('relatório reconhecido', () => assert.equal(parsed.recognized, true));
verificacao('candidato', () => assert.equal(parsed.report.candidate, 'Pessoa de teste'));
verificacao('data de conclusão', () => assert.equal(parsed.report.completedDate, '2026-05-28'));
verificacao('aderência comportamental', () => assert.equal(parsed.report.behavioral, 54));
verificacao('aderência valores', () => assert.equal(parsed.report.valuesScore, 62));
verificacao('aderência final', () => assert.equal(parsed.report.final, 58));
verificacao('primeira competência', () => assert.equal(parsed.report.competencies[0].score, 74));
verificacao('última competência', () => assert.equal(parsed.report.competencies.at(-1).score, 26));
verificacao('primeiro valor da empresa', () => assert.equal(parsed.report.values[0].score, 88));
verificacao('segundo valor de Schwartz', () => assert.equal(parsed.report.schwartz[1].score, 78));
verificacao('configuração alterada', () => assert.equal(parsed.report.configChanged, true));
verificacao('competência ausente fica nula', () => assert.equal(parsed.report.competencies[3].score, null));
verificacao('conta campos ausentes', () => assert.ok(parsed.missing > 0));
verificacao('arquivo desconhecido não é reconhecido', () => assert.equal(F.parse(['arquivo desconhecido']).recognized, false));
verificacao('percentual acima de 100 é descartado', () => assert.equal(F.parse(['Pessoa\nFit Cultural\nPlanejamento 101%']).report.competencies.at(-1).score, null));
const guidance = F.guidance(parsed.report);
verificacao('maior aderência primeiro', () => assert.equal(guidance.strengths[0].score, 74));
verificacao('menor aderência no desenvolvimento', () => assert.equal(guidance.development[0].score, 26));
verificacao('jornada nos marcos 30/75/120', () => assert.deepEqual(guidance.journey.map((x: { milestone: number }) => x.milestone), [30, 75, 120]));
verificacao('normalização de nome', () => assert.equal(F.norm('João  da Silva'), 'JOAO DA SILVA'));
verificacao('CPF conferido', () => assert.equal(F.identity('Ana', '11111111111', 'ANA', '111.111.111-11'), 'CPF conferido'));
verificacao('CPF divergente é recusado', () => assert.throws(() => F.identity('Ana', '22222222222', 'Ana', '11111111111')));
verificacao('nome divergente sem CPF é recusado', () => assert.throws(() => F.identity('Outra pessoa', '', 'Ana', '')));
verificacao('nome conferido sem acento', () => assert.equal(F.identity('José da Silva', '', 'Jose da Silva', ''), 'Nome conferido'));
const role = F.parse(['Pessoa de teste\nFit Cultural\nCompetências Comportamentais # COMPETÊNCIA COMPORTAMENTAL DESEJADO ADERÊNCIA 1 Consultor de Vendas 100 % 54%']);
verificacao('cargo comportamental', () => assert.equal(role.report.behavioralRole, 'CONSULTOR DE VENDAS'));
verificacao('aderência desejada', () => assert.equal(role.report.desired, 100));

test('25 verificações (o legado imprime 24 fixo, mas tem 25 asserts)', () => expect(registradas).toBe(25));
