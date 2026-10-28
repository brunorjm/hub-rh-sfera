// O formulário do Parecer do Gestor (public/legado-ui/js/pareceres/render-comum.js)
// volta a desenhar o que o gestor externo gravou pelo link público: todo
// valor salvo sai escapado. Carrega os scripts como estão, num contexto do
// Node que finge o "window" (mesmo jeito de legado/test/*.test.js).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const JS = path.join(process.cwd(), "public", "legado-ui", "js");

type Render = {
  renderFormBody: (modelo: unknown, d: Record<string, unknown>, dis: string, opts?: Record<string, unknown>) => string;
};
type Contexto = Record<string, unknown> & { HUB_PARECER_RENDER: Render; HUB_PARECER_MODELOS: Record<string, unknown> };

function carregar(): Contexto {
  const ctx = { console, Intl, Date } as Record<string, unknown>;
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["utils.js", "pareceres/comum.js", "pareceres/vd-comum.js", "pareceres/modelo-hering.js", "pareceres/render-comum.js"]) {
    vm.runInContext(fs.readFileSync(path.join(JS, f), "utf8"), ctx, { filename: f });
  }
  return ctx as Contexto;
}

const MALICIOSO = '"><img src=x onerror=alert(1)>';

describe("render-comum.js do Parecer do Gestor", () => {
  const ctx = carregar();
  const modelo = ctx.HUB_PARECER_MODELOS.hering;

  it("dataEntrevista gravada com HTML sai escapada no value", () => {
    const html = ctx.HUB_PARECER_RENDER.renderFormBody(modelo, { dataEntrevista: MALICIOSO }, "");
    expect(html).not.toContain("<img");
    expect(html).toContain('id="pg-dataEntrevista" value="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"');
  });

  it("outros campos de texto gravados (gestor, justificativa, candidato) também saem escapados", () => {
    const d = {
      gestorNome: MALICIOSO, justificativa: `</textarea>${MALICIOSO}`, candidatoNome: MALICIOSO, recrutadorNome: MALICIOSO,
      cargo: MALICIOSO, local: MALICIOSO, regional: MALICIOSO, parecerFinal: MALICIOSO, candidatoCompareceu: "Sim",
      perfilFezSentido: "Sim", grupoCargo: MALICIOSO,
    };
    for (const opts of [{}, { editarGestorNome: true }]) {
      const html = ctx.HUB_PARECER_RENDER.renderFormBody(modelo, d, "disabled", opts);
      expect(html).not.toContain("<img");
      expect(html).toContain("&lt;/textarea&gt;");
      expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    }
  });
});
