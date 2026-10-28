// Carga das telas antigas (spec de otimização da carga, fase 1): tabelas em
// paralelo (no máximo 4), páginas de 5000 e observações dos candidatos sob
// demanda. Carrega os dal-*.js de verdade num contexto isolado, com um
// HUB_API falso. Dados inventados.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

type Chamada = { op: string; dados: Record<string, unknown> };
type Responder = (c: Chamada) => unknown;

function carregar(arquivo: string, responder: Responder) {
  const chamadas: Chamada[] = [];
  let ativas = 0;
  let pico = 0;
  const ctx: Record<string, unknown> = {
    console, setTimeout, clearTimeout,
    HUB_API: {
      async chamar(op: string, dados: Record<string, unknown>) {
        chamadas.push({ op, dados });
        ativas++;
        pico = Math.max(pico, ativas);
        try {
          await new Promise((r) => setTimeout(r, 2));
          return responder({ op, dados });
        } finally {
          ativas--;
        }
      },
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const js = path.join(process.cwd(), "public", "legado-ui", "js", arquivo);
  vm.runInContext(fs.readFileSync(js, "utf8"), ctx, { filename: arquivo });
  return { ctx, chamadas, pico: () => pico };
}

// Tabela com `n` linhas de id 1..n, paginada como o servidor (id > aposId, limite).
function paginar(n: number, c: Chamada) {
  const apos = Number(c.dados.aposId ?? 0);
  const limite = Number(c.dados.limite);
  const r = [];
  for (let id = apos + 1; id <= Math.min(n, apos + limite); id++) r.push({ id, tabela: c.dados.tabela });
  return r;
}

describe("dal-indicadores.js loadAll", () => {
  it("lê todas as tabelas com no máximo 4 ao mesmo tempo, em páginas de 5000", async () => {
    const tamanhos: Record<string, number> = { colaboradores: 12000, twygo_participantes: 5000 };
    const { ctx, chamadas, pico } = carregar("dal-indicadores.js", (c) => paginar(tamanhos[c.dados.tabela as string] ?? 3, c));
    const dal = ctx.HUB_DAL as { TABLES: string[]; loadAll: (p: unknown) => Promise<Record<string, unknown[]>> };
    const progresso: [string, number, number, number][] = [];
    const dados = await dal.loadAll((t: string, i: number, total: number, n: number) => progresso.push([t, i, total, n]));

    expect(pico()).toBeLessThanOrEqual(4);
    expect(pico()).toBeGreaterThan(1);
    for (const t of dal.TABLES) expect(dados[t]).toHaveLength(tamanhos[t] ?? 3);
    expect(chamadas.every((c) => c.dados.limite === 5000)).toBe(true);
    // 12000 → 3 páginas; 5000 → a página cheia pede mais uma (vazia).
    expect(chamadas.filter((c) => c.dados.tabela === "colaboradores").map((c) => c.dados.aposId)).toEqual([0, 5000, 10000]);
    expect(chamadas.filter((c) => c.dados.tabela === "twygo_participantes")).toHaveLength(2);
    // Progresso: posição entre 0 e total-1, total fixo, linhas acumuladas por tabela.
    expect(progresso.every(([, i, total]) => i >= 0 && i < total && total === dal.TABLES.length)).toBe(true);
    expect(progresso.filter(([t]) => t === "colaboradores").map(([, , , n]) => n)).toEqual([5000, 10000, 12000]);
  });

  it("tabela que falha fica vazia, as outras carregam, e o erro sai na ordem de TABLES", async () => {
    const { ctx } = carregar("dal-indicadores.js", (c) => {
      if (c.dados.tabela === "celebracoes" || c.dados.tabela === "feedbacks") throw new Error("falhou " + c.dados.tabela);
      return paginar(2, c);
    });
    const dal = ctx.HUB_DAL as { loadAll: () => Promise<unknown> };
    await expect(dal.loadAll()).rejects.toThrow("Algumas tabelas não carregaram — feedbacks: falhou feedbacks; celebracoes: falhou celebracoes");
    const dados = ctx.HUB_DATA as Record<string, unknown[]>;
    expect(dados.feedbacks).toEqual([]);
    expect(dados.colaboradores).toHaveLength(2);
  });
});

describe("dal-recrutamento.js", () => {
  const recrut = (responder: Responder) => {
    const r = carregar("dal-recrutamento.js", responder);
    return { ...r, R: r.ctx.HUB_RECRUIT as Record<string, (...a: unknown[]) => Promise<unknown>> & { observacoesCarregadas: (c: unknown) => boolean } };
  };

  it("reload lê as tabelas em paralelo (≤ 4), páginas de 5000, e erro sai na ordem", async () => {
    const { ctx, chamadas, pico, R } = recrut((c) => {
      if (c.op === "recrutamento.versoes") return null;
      if (c.op === "recrutamento.resumo") return [];
      if (c.dados.tabela === "onboarding") throw new Error("caiu");
      return paginar(c.dados.tabela === "candidatos" ? 7000 : 2, c);
    });
    await expect(R.reload()).rejects.toThrow("Não consegui atualizar os dados do Recrutamento — onboarding: caiu");
    expect(pico()).toBeLessThanOrEqual(4);
    expect(pico()).toBeGreaterThan(1);
    const D = ctx.HUB_RECRUIT_DATA as Record<string, unknown[]>;
    expect(D.candidatos).toHaveLength(7000);
    expect(D.vagas).toHaveLength(2);
    expect(D.onboarding).toEqual([]);
    expect(chamadas.filter((c) => c.op === "recrutamento.lerPagina").every((c) => c.dados.limite === 5000)).toBe(true);
  });

  it("carregarObservacoes busca só as que faltam, em lotes de 1000, e guarda no próprio objeto", async () => {
    const { chamadas, R } = recrut((c) => {
      const ids = c.dados.ids as string[];
      // CAND-5 não volta (apagado ou fora do recorte).
      return ids.filter((id) => id !== "CAND-5").map((id) => ({ id, observacoes: id === "CAND-2" ? null : "obs " + id }));
    });
    const cands: Record<string, unknown>[] = Array.from({ length: 2500 }, (_, i) => ({ id: `CAND-${i}`, nome: "x" }));
    cands[3]!.observacoes = "já carregada";
    await R.carregarObservacoes(cands);

    expect(chamadas.map((c) => (c.dados.ids as string[]).length)).toEqual([1000, 1000, 499]);
    expect(chamadas.every((c) => c.op === "recrutamento.observacoes")).toBe(true);
    expect(cands[1]!.observacoes).toBe("obs CAND-1");
    expect(cands[2]!.observacoes).toBeNull();
    expect(R.observacoesCarregadas(cands[2])).toBe(true);
    expect(cands[3]!.observacoes).toBe("já carregada");
    expect(R.observacoesCarregadas(cands[5])).toBe(false);

    // Segunda vez: só o que ainda falta (CAND-5).
    chamadas.length = 0;
    await R.carregarObservacoes(cands);
    expect(chamadas.map((c) => c.dados.ids)).toEqual([["CAND-5"]]);
  });

  it("falha ao buscar observações sobe e não marca nada como carregado", async () => {
    const { R } = recrut(() => { throw new Error("sem rede"); });
    const c = { id: "CAND-1" };
    await expect(R.carregarObservacoes([c])).rejects.toThrow("sem rede");
    expect(R.observacoesCarregadas(c)).toBe(false);
  });
});
