import { OPERACOES } from "@/server/hub/registro";
import { TODAS_AS_CHAVES } from "@/lib/rbac/catalogo";

// Operações liberadas a qualquer conta ativa (a RLS ainda recorta as linhas).
// Entrar nesta lista é decisão consciente: diga no comentário por quê.
const SO_AUTENTICADO = new Set([
  "indicadores.lerPagina", // carga dos Indicadores; cada tabela é recortada pela RLS original
  // Dashboard (sempre visível) de quem não tem o Boletim: boletim_resumo_publicado()
  // é concedida a authenticated e recorta por dentro (profile ativo + can_see_perfil).
  "pesquisas.boletimResumoPublicado",
]);

describe("registro de operações do hub", () => {
  const nomes = Object.keys(OPERACOES);

  it("tem operações registradas", () => {
    expect(nomes.length).toBeGreaterThan(0);
  });

  it.each(nomes)("%s declara permissão do catálogo (ou está na lista de só-autenticado)", (nome) => {
    const { permissao } = OPERACOES[nome]!;
    if (permissao === "autenticado") {
      expect(SO_AUTENTICADO.has(nome)).toBe(true);
      return;
    }
    for (const chave of Array.isArray(permissao) ? permissao : [permissao]) {
      expect(TODAS_AS_CHAVES).toContain(chave);
    }
  });

  it.each(nomes)("%s diz se escreve e valida a entrada", (nome) => {
    const op = OPERACOES[nome]!;
    expect(typeof op.escrita).toBe("boolean");
    expect(typeof op.entrada.safeParse).toBe("function");
  });
});
