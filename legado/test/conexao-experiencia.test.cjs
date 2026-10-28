const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const X = require('../js/conexao-experiencia.js');
const ctx={window:{HUB_DATA:{colaboradores:[]}},Intl,Date,console};
for(const name of ['utils.js','metrics-experiencia.js']) { vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js',name),'utf8'),ctx); ctx.HUB_UTILS=ctx.window.HUB_UTILS; }
const M=ctx.window.HUB_EXP_METRICS;
const notes=n=>Object.fromEntries(M.CORE.map(c=>[c,n]));
const identity={cpf:'01234567890',admission:'2026-01-01'};
const row={cpf:'01234567890',data_admissao:'2026-01-01',status_gestor:'concluida',status_auto:'concluida',notas_gestor:notes(3),notas_auto:notes(4),martelo:4,data_avaliacao:'2026-02-10'};
let n=0;
function test(name,fn){fn();n++;console.log('OK '+name);}
test('nota final usa exatamente os pesos do módulo AVE',()=>{const r=X.summarize([row],identity,45,M);assert.ok(Math.abs(r.score-3.15)<1e-10);assert.equal(r.decision,'Aprovado SEM ressalvas');});
test('sem autoavaliação usa somente nota do gestor e informa limitação',()=>{const r=X.summarize([{...row,notas_auto:{},status_auto:'pendente'}],identity,45,M);assert.equal(r.score,3);assert.equal(r.partial,true);});
test('sem nota do gestor não inventa resultado com autoavaliação',()=>assert.equal(X.summarize([{...row,notas_gestor:{}}],identity,45,M).score,null));
test('rascunho do gestor não aparece como resultado final',()=>{const r=X.summarize([{...row,status_gestor:'rascunho'}],identity,45,M);assert.equal(r.score,null);assert.equal(r.decision,'Decisão ainda não finalizada');});
test('marcador inválido não vira nota',()=>{const r=X.summarize([{...row,notas_gestor:notes(-4334)}],identity,45,M);assert.equal(r.score,null);});
test('readmissão não mistura avaliações',()=>assert.equal(X.summarize([{...row,data_admissao:'2025-01-01'}],identity,45,M).state,'missing'));
test('duplicidade exige validação',()=>assert.equal(X.summarize([row,{...row}],identity,45,M).state,'ambiguous'));
test('CPF vazio não associa por nome',()=>assert.equal(X.summarize([row],{...identity,cpf:null},45,M).state,'identity'));
test('histórico antigo independe de qualquer período da tela',()=>{const r=X.summarize([row],{...identity,start:'2026-10-01',end:'2026-10-31'},45,M);assert.equal(r.state,'found');assert.equal(r.managerDate,'2026-02-10');});
test('cálculo não modifica registro original da integração',()=>{const source={...row};X.summarize([source],identity,45,M);assert.equal(source._d,undefined);});
console.log(`${n} verificações da integração AVE aprovadas.`);
