import { montarLinhas, parseHoras, STATUS_MAP, twygoBuscarTudo } from "@/lib/twygo";

const resposta = (corpo: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => corpo }) as unknown as Response;

describe("twygoBuscarTudo", () => {
  it("segue next_page até acabar e manda o token no cabeçalho", async () => {
    const chamadas: { url: string; auth: string }[] = [];
    const paginas = [
      { data: { users: [{ user_id: 1 }, { user_id: 2 }], pagination: { next_page: 2 } } },
      { data: { users: [{ user_id: 3 }], pagination: { next_page: null } } },
    ];
    const r = await twygoBuscarTudo("/users", "tk-falso", "users", async (url, init) => {
      chamadas.push({ url, auth: init.headers.Authorization! });
      return resposta(paginas[chamadas.length - 1]);
    });
    expect(r.map((u) => u.user_id)).toEqual([1, 2, 3]);
    expect(chamadas[1]!.url).toContain("page=2&per_page=100");
    expect(chamadas[0]!.auth).toBe("Bearer tk-falso");
  });

  it("falha com o status HTTP, sem ecoar o corpo da resposta", async () => {
    await expect(twygoBuscarTudo("/attendees", "x", "attendees", async () => resposta({ segredo: "eco" }, 401)))
      .rejects.toThrow("Twygo API /attendees falhou (HTTP 401).");
  });
});

describe("montarLinhas (mesmo mapeamento da Edge Function)", () => {
  const users = [
    { user_id: 10, name: "Pessoa Inventada", email: "p@exemplo.test", enterprise: "Loja Centro", department: "Vendas", role: "Vendedora", situation: "active" },
    { user_id: 11, name: "Outra Pessoa", situation: "inactive" },
  ];
  const contents = [{ content_id: 5, name: "Atendimento", content_type: "course", hours: "0001:30:00" }];

  it("mapeia situação, progresso, horas e datas", () => {
    const [l] = montarLinhas(
      [{ user_id: 10, content_id: 5, status: "confirmed", approved_at: "2026-09-10T12:00:00Z", progress: 45, created_at: "2026-09-01T08:00:00Z",
        certificates: [{ certificate_issuing_date: "2026-09-11T00:00:00Z" }] }],
      users, contents,
    );
    expect(l).toMatchObject({
      content_id: "5", content_title: "Atendimento", nome_completo: "Pessoa Inventada", unidade: "Loja Centro",
      situacao_inscricao: "Confirmado", situacao: "Aprovado", situacao_ambiente: "Ativo",
      progresso: 0.45, carga_horaria: 1.5, data_inscricao: "2026-09-01", aprovado_em: "2026-09-10", emitido_em: "2026-09-11",
    });
  });

  it("inativo, pendente/cancelado e sem aprovação", () => {
    const linhas = montarLinhas(
      [{ user_id: 11, content_id: 5, status: "refund_sent" }, { user_id: 11, content_id: 5, status: "pending" }],
      users, contents,
    );
    expect(linhas.map((l) => [l.situacao_ambiente, l.situacao_inscricao, l.situacao])).toEqual([
      ["Inativo", "Cancelada", "Em Andamento"],
      ["Inativo", "Pendente", "Em Andamento"],
    ]);
  });

  it("descarta inscrição sem nome nem e-mail", () => {
    expect(montarLinhas([{ user_id: 999, content_id: 5 }], users, contents)).toEqual([]);
  });

  it("parseHoras e STATUS_MAP", () => {
    expect(parseHoras("0000:30:00")).toBe(0.5);
    expect(parseHoras("abc")).toBeNull();
    expect(STATUS_MAP.payment_overdue).toBe("Cancelada");
  });
});
