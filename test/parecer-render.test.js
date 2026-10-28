// Parecer do Gestor: dado gravado pelo link público (sem login) não pode virar
// HTML/JS na tela do recrutador. Caso real: "Data da entrevista" ia para o
// value="" sem escape (corrigido em js/pareceres/render-comum.js).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ctx = vm.createContext({ console });
ctx.window = ctx;
for (const f of ['js/utils.js', 'js/pareceres/comum.js', 'js/pareceres/vd-comum.js', 'js/pareceres/modelo-hering.js', 'js/pareceres/render-comum.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}

let ok = 0, falhas = 0;
function check(nome, cond) { if (cond) { ok++; console.log('  OK  ' + nome); } else { falhas++; console.log('  FALHA  ' + nome); } }

const R = ctx.HUB_PARECER_RENDER;
const modelo = Object.values(ctx).find(v => v && typeof v === 'object' && v.id === 'hering' && Array.isArray(v.blocos)) ||
  (ctx.HUB_PARECER_MODELOS && (ctx.HUB_PARECER_MODELOS.hering || Object.values(ctx.HUB_PARECER_MODELOS)[0]));

console.log('\nXSS no parecer gravado pelo link público');
check('renderFormBody está exposto', R && typeof R.renderFormBody === 'function');
check('modelo Hering carregado', !!modelo);
if (R && typeof R.renderFormBody === 'function' && modelo) {
  const malicioso = '"><img src=x onerror=alert(1)>';
  const html = R.renderFormBody(modelo, { dataEntrevista: malicioso }, '', {});
  check('dataEntrevista não abre tag', !/<img src=x onerror/i.test(html));
  check('dataEntrevista sai escapada', html.includes('&quot;&gt;&lt;img'));
}

console.log('\n' + ok + ' ok, ' + falhas + ' falha(s)');
if (falhas) process.exit(1);
