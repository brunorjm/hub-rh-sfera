// Ponte entre os testes do legado (check/run com contagem caseira) e o Jest.
//
// Os blocos run() rodam NA HORA, na ordem em que aparecem no arquivo, igual ao
// legado — inclusive o código solto entre um bloco e outro (que muda os dados
// compartilhados). Cada bloco vira um test() do Jest que falha se alguma
// verificação dele falhou ou se o bloco lançou erro. totalEsperado() registra um
// último test() que confere quantas verificações rodaram, para a contagem do
// porte bater com a do legado.
export interface Verificacoes {
  check: (label: string, cond: unknown, detail?: unknown) => void;
  run: (name: string, fn: () => void) => void;
  totalEsperado: (n: number) => void;
  contagem: () => { pass: number; fail: number };
}

export function criarVerificacoes(): Verificacoes {
  let pass = 0, fail = 0;
  let falhasDoBloco: string[] = [];

  function check(label: string, cond: unknown, detail?: unknown) {
    if (cond) pass++;
    else { fail++; falhasDoBloco.push(`${label}${detail !== undefined ? ' — ' + String(detail) : ''}`); }
  }

  function run(name: string, fn: () => void) {
    falhasDoBloco = [];
    let erro: unknown = null;
    try { fn(); } catch (err) { fail++; erro = err; }
    const falhas = falhasDoBloco;
    test(name, () => {
      if (erro) throw erro;
      expect(falhas).toEqual([]);
    });
  }

  function totalEsperado(n: number) {
    const rodadas = pass + fail, falhas = fail;
    test(`${n} verificações (mesma contagem do legado)`, () => {
      expect({ rodadas, falhas }).toEqual({ rodadas: n, falhas: 0 });
    });
  }

  return { check, run, totalEsperado, contagem: () => ({ pass, fail }) };
}

export const perto = (a: number | null | undefined, b: number | null | undefined, tol?: number): boolean =>
  a != null && b != null && Math.abs(a - b) <= (tol || 1e-9);
