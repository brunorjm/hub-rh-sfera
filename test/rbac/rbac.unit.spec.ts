import { CATALOGO, PRESETS, TODAS_AS_CHAVES, presetPermissoes } from "@/lib/rbac/catalogo";
import { podeVer, temPermissao, filtrarRecorte, type Escopo } from "@/lib/rbac/permissoes";

const usuario = (p: Partial<Escopo>): Escopo => ({
  perfil: "gestor", status: "ativo", permissoes: {}, unidades: [], departamentos: [], ...p,
});

describe("catálogo", () => {
  it("não tem chave repetida", () => {
    expect(new Set(TODAS_AS_CHAVES).size).toBe(TODAS_AS_CHAVES.length);
  });

  it("segue a ordem do menu do hub atual", () => {
    expect(CATALOGO.map((g) => g.group)).toEqual(
      ["indicadores", "desenvolvimento_organizacional", "recrutamento", "treinamento_dev", "administracao"]);
  });

  it("dado sigiloso fica fora dos presets rh e gestor", () => {
    for (const k of ["indicadores.controle_desligamento", "indicadores.satisfacao", "indicadores.satisfacao_completo",
      "indicadores.satisfacao_participacao", "indicadores.fechamento", "indicadores.boletim"]) {
      expect(PRESETS.rh).not.toContain(k);
      expect(PRESETS.gestor).not.toContain(k);
    }
    expect(PRESETS.rh.some((k) => k.startsWith("conexao_rh."))).toBe(false);
  });

  it("gestor recebe indicadores + parecer do gestor, sem 1:1 nem visão completa", () => {
    expect(PRESETS.gestor).toContain("indicadores.engajamento");
    expect(PRESETS.gestor).toContain("recrutamento.parecer_gestor");
    expect(PRESETS.gestor).not.toContain("indicadores.oneonone");
    expect(PRESETS.gestor).not.toContain("indicadores.headcount_completo");
  });

  it("presetPermissoes monta o mapa de checkboxes", () => {
    expect(presetPermissoes("rh")["indicadores.headcount"]).toBe(true);
    expect(presetPermissoes("inexistente")).toEqual({});
  });
});

describe("temPermissao", () => {
  it("admin tem tudo, inclusive chave que o mapa salvo não conhece", () => {
    expect(temPermissao(usuario({ perfil: "admin", permissoes: {} }), "indicadores.fechamento")).toBe(true);
  });
  it("só true conta", () => {
    const u = usuario({ permissoes: { "indicadores.headcount": true, "indicadores.feedbacks": "true" } });
    expect(temPermissao(u, "indicadores.headcount")).toBe(true);
    expect(temPermissao(u, "indicadores.feedbacks")).toBe(false);
  });
  it("conta inativa não tem nada, nem admin", () => {
    expect(temPermissao(usuario({ perfil: "admin", status: "inativo" }), "admin.usuarios")).toBe(false);
  });
});

describe("podeVer (can_see)", () => {
  it("admin vê qualquer linha", () => {
    expect(podeVer(usuario({ perfil: "admin", unidades: ["X"] }), "Y", "Z")).toBe(true);
  });
  it("gestor e RH sem recorte veem tudo", () => {
    expect(podeVer(usuario({ perfil: "gestor" }), "Loja 1", null)).toBe(true);
    expect(podeVer(usuario({ perfil: "rh" }), "Loja 1", "Vendas")).toBe(true);
  });
  it("recorte por unidade ignora caixa e espaços; linha sem unidade passa", () => {
    const u = usuario({ unidades: [" Hering Centro "] });
    expect(podeVer(u, "hering centro", null)).toBe(true);
    expect(podeVer(u, "Hering Norte", null)).toBe(false);
    expect(podeVer(u, null, null)).toBe(true);
  });
  it("recorte por departamento: linha sem departamento NÃO passa", () => {
    const u = usuario({ perfil: "rh", departamentos: ["Vendas"] });
    expect(podeVer(u, "Loja 1", "vendas")).toBe(true);
    expect(podeVer(u, "Loja 1", null)).toBe(false);
  });
  it("perfil desconhecido ou conta inativa não vê nada", () => {
    expect(podeVer(usuario({ perfil: "outro" }), "A", "B")).toBe(false);
    expect(podeVer(usuario({ status: "inativo" }), "A", "B")).toBe(false);
  });
  it("filtrarRecorte aplica a regra numa lista", () => {
    const linhas = [{ u: "A", d: "X" }, { u: "B", d: "X" }];
    expect(filtrarRecorte(usuario({ unidades: ["A"] }), linhas, (l) => ({ unidade: l.u, departamento: l.d })))
      .toEqual([{ u: "A", d: "X" }]);
  });
});
