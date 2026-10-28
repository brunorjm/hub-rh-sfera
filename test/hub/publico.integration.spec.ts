// Links públicos sem login (src/server/publico/api.ts) no hub_test, com dados
// inventados. Os registros com token nascem pelo mesmo caminho do hub logado
// (operações recrutamento.inserir/atualizar e conexao.salvar/npsSync); a página
// pública só passa pelas funções do banco.
import { randomUUID } from "node:crypto";
import { getRedis } from "@/lib/redis";
import { atenderPublico, type PaginaPublica } from "@/server/publico/api";
import { paginaPublica } from "@/server/publico/paginas";
import { criarConta, executar, limpar, prisma } from "../helpers/hub";

type Linha = Record<string, unknown>;

// IP próprio por execução: o limite por IP (Redis) não vaza entre rodadas.
const IP = `teste-${randomUUID()}`;
const CPF = "00000000191";
const TELEFONE = "11999990000";

async function chamar(pagina: PaginaPublica, corpo: unknown, opcoes: { ip?: string; origem?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", "x-real-ip": opcoes.ip ?? IP };
  if (opcoes.origem) headers.origin = opcoes.origem;
  const r = await atenderPublico(
    pagina,
    new Request(`http://localhost/api/publico/${pagina}`, {
      method: "POST", headers, body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
    }),
  );
  return { status: r.status, corpo: (await r.json()) as { dados?: unknown; erro?: string }, headers: r.headers };
}

const TABELAS = ["pareceres_gestor", "entrevistas_desligamento", "candidatos", "vagas", "colaboradores"];
const limparConexao = () =>
  prisma.$executeRawUnsafe("truncate conexao_private.records, conexao_private.audit, conexao_private.nps restart identity");

// O limite é fail-open: sem esperar a conexão, o primeiro pedido passaria sem contar.
beforeAll(async () => {
  const redis = getRedis();
  if (redis.status !== "ready") await new Promise((ok) => redis.once("ready", ok));
});

beforeEach(async () => {
  await limparConexao();
  await limpar(...TABELAS);
});

afterAll(async () => {
  await limparConexao();
  await limpar(...TABELAS);
  await prisma.$disconnect();
  await getRedis().quit();
});

describe("páginas públicas (caminhos antigos)", () => {
  it("HTML sem o cliente do banco antigo, com <base>, ponte pública e cabeçalhos", async () => {
    for (const [nome, script] of [
      ["parecer", "js/parecer-publico.js"],
      ["entrevista-desligamento", "js/entrevista-desligamento-publico.js"],
      ["conexao-nps", "js/conexao-nps-publico.js"],
    ] as const) {
      const r = paginaPublica(nome);
      expect(r.headers.get("cache-control")).toBe("no-store");
      expect(r.headers.get("referrer-policy")).toBe("no-referrer");
      expect(r.headers.get("x-frame-options")).toBe("DENY");
      const html = await r.text();
      expect(html).toContain('<base href="/legado-ui/">');
      expect(html).toContain('<meta name="referrer" content="no-referrer">');
      expect(html.indexOf("js/publico-api.js?v=")).toBeLessThan(html.indexOf(`${script}?v=`));
      expect(html).not.toMatch(/supabase|config\.js|hub-api|__VERSAO__/i);
    }
  });
});

describe("/api/publico/parecer", () => {
  const TOKEN = randomUUID();

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`
      insert into public.vagas (id, data_abertura, unidade, departamento, cargo, status)
      values ('VAGA-1','2026-10-01','Loja Centro','Vendas','Consultora','Aberta')`);
    await prisma.$executeRawUnsafe(
      `insert into public.candidatos (id, vaga_id, nome, email, contato, unidade, departamento, observacoes)
       values ('CAND-1','VAGA-1','Candidata Inventada','candidata@exemplo.test',$1,'Loja Centro','Vendas','Observação inventada')`,
      TELEFONE,
    );
    // Como a tela Candidatos faz: cria o parecer e, ao gerar o link, grava o token.
    const admin = await criarConta({ perfil: "admin" });
    const ins = await executar("recrutamento.inserir", {
      tabela: "pareceres_gestor",
      linha: {
        id: "PG-1", candidato_id: "CAND-1", candidato_nome: "Candidata Inventada", vaga_id: "VAGA-1", cargo: "Consultora",
        modelo: "hering", recrutador: "Recrutadora Teste", status: "Pendente", unidade: "Loja Centro", departamento: "Vendas",
        dados: { cargo: "Consultora" },
      },
    }, admin);
    expect(ins.status).toBe(200);
    const upd = await executar("recrutamento.atualizar", { tabela: "pareceres_gestor", id: "PG-1", linha: { link_token: TOKEN } }, admin);
    expect(upd.status).toBe(200);
  });

  it("ler com token válido devolve só os campos que a página usa, sem contato", async () => {
    const r = await chamar("parecer", { acao: "ler", token: TOKEN });
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.corpo.dados).toEqual({
      candidatoNome: "Candidata Inventada", cargo: "Consultora", modelo: "hering", recrutador: "Recrutadora Teste",
      dados: { cargo: "Consultora" }, observacoesCandidato: "Observação inventada",
    });
    expect(JSON.stringify(r.corpo)).not.toMatch(new RegExp(`${TELEFONE}|candidata@exemplo`));
  });

  it("salvar grava pela função, atualiza o candidato e o token passa a ser recusado", async () => {
    const dados = {
      dados: { gestorNome: "Gestora Inventada", nivelRecomendacao: 4 }, nivelRecomendacao: 4,
      parecerFinal: "Aprovado(a) - Banco de Talentos", justificativa: "Justificativa inventada", preenchidoPor: "Gestora Inventada",
    };
    const r = await chamar("parecer", { acao: "salvar", token: TOKEN, dados });
    expect(r.status).toBe(200);
    expect(r.corpo.dados).toBe(true);
    const [pg] = await prisma.$queryRawUnsafe<Linha[]>(
      "select status, nivel_recomendacao, parecer_final, preenchido_por, dados from public.pareceres_gestor where id = 'PG-1'",
    );
    expect(pg).toMatchObject({
      status: "Preenchido", nivel_recomendacao: 4, parecer_final: "Aprovado(a) - Banco de Talentos",
      preenchido_por: "Gestora Inventada", dados: dados.dados,
    });
    const [c] = await prisma.$queryRawUnsafe<Linha[]>("select resultado_gestor, etapa_gestor_status from public.candidatos where id = 'CAND-1'");
    expect(c).toEqual({ resultado_gestor: "Banco de Talentos", etapa_gestor_status: "Concluída" });

    // Uso único: a leitura volta null (a página mostra "link não é válido…") e não grava de novo.
    expect((await chamar("parecer", { acao: "ler", token: TOKEN })).corpo).toEqual({ dados: null });
    const de2 = await chamar("parecer", { acao: "salvar", token: TOKEN, dados });
    expect(de2.status).toBe(400);
    expect(de2.corpo.erro).toMatch(/não é mais válido/);
  });

  it("token inexistente devolve null; formato errado, pedido torto e outra origem são recusados", async () => {
    expect((await chamar("parecer", { acao: "ler", token: randomUUID() })).corpo).toEqual({ dados: null });
    for (const token of ["curto", "A".repeat(20), `${TOKEN}'--`, "x".repeat(65), 12345678901234567]) {
      const r = await chamar("parecer", { acao: "ler", token });
      expect(r.status).toBe(400);
    }
    expect((await chamar("parecer", { acao: "apagar", token: TOKEN })).status).toBe(400);
    expect((await chamar("parecer", { acao: "ler", token: TOKEN, extra: 1 })).status).toBe(400);
    expect((await chamar("parecer", "{nao é json")).status).toBe(400);
    expect((await chamar("parecer", { acao: "salvar", token: TOKEN, dados: { dados: { x: "y".repeat(100_001) } } })).status).toBe(400);
    expect((await chamar("parecer", { acao: "salvar", token: TOKEN, dados: { dados: {}, x: "y".repeat(300_000) } })).status).toBe(413);
    const fora = await chamar("parecer", { acao: "ler", token: TOKEN }, { origem: "https://outro-site.test" });
    expect(fora.status).toBe(403);
    // Nada disso tocou o parecer.
    const [pg] = await prisma.$queryRawUnsafe<Linha[]>("select status from public.pareceres_gestor where id = 'PG-1'");
    expect(pg!.status).toBe("Pendente");
  });

  it("rate limit por IP: estourou, 429 com Retry-After", async () => {
    const ip = `teste-${randomUUID()}`;
    const token = randomUUID();
    for (let i = 0; i < 20; i++) {
      expect((await chamar("parecer", { acao: "salvar", token, dados: { dados: {} } }, { ip })).status).toBe(400);
    }
    const r = await chamar("parecer", { acao: "salvar", token, dados: { dados: {} } }, { ip });
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
    // Outro IP segue normal.
    expect((await chamar("parecer", { acao: "ler", token: TOKEN })).status).toBe(200);
  });
});

describe("/api/publico/entrevista-desligamento", () => {
  const TOKEN = randomUUID();

  async function criarEntrevista(id: string, token: string) {
    // Como a tela Entrevista Desligamento faz ao gerar o link.
    const admin = await criarConta({ perfil: "admin" });
    const r = await executar("recrutamento.inserir", {
      tabela: "entrevistas_desligamento",
      linha: {
        id, colaborador_external_id: "EXT-1", colaborador_nome: "Pessoa Inventada", colaborador_cpf: CPF,
        colaborador_email: "pessoa@exemplo.test", colaborador_telefone: TELEFONE, cargo: "Consultora",
        unidade: "Loja Centro", departamento: "Vendas", unidade_trabalho: "Loja", local: "Loja Centro",
        departamento_forms: "Vendas", respostas: {}, status: "Pendente", link_token: token, gerado_por: "RH Teste",
      },
    }, admin);
    expect(r.status).toBe(200);
  }

  beforeEach(() => criarEntrevista("ED-1", TOKEN));

  it("ler devolve só os campos da página: sem CPF nem telefone", async () => {
    const r = await chamar("entrevista-desligamento", { acao: "ler", token: TOKEN });
    expect(r.status).toBe(200);
    expect(r.corpo.dados).toEqual({
      colaboradorNome: "Pessoa Inventada", colaboradorEmail: "pessoa@exemplo.test", unidadeTrabalho: "Loja",
      local: "Loja Centro", departamentoForms: "Vendas", respostas: {},
    });
    expect(JSON.stringify(r.corpo)).not.toMatch(new RegExp(`${CPF}|${TELEFONE}|EXT-1`));
  });

  it("salvar grava as respostas e o token passa a ser recusado", async () => {
    const respostas = { motivo: "Outra oportunidade (inventado)", nps: 8 };
    const r = await chamar("entrevista-desligamento", { acao: "salvar", token: TOKEN, dados: { respostas } });
    expect(r.status).toBe(200);
    expect(r.corpo.dados).toBe(true);
    const [e] = await prisma.$queryRawUnsafe<Linha[]>("select status, respostas from public.entrevistas_desligamento where id = 'ED-1'");
    expect(e).toEqual({ status: "Preenchido", respostas });
    expect((await chamar("entrevista-desligamento", { acao: "ler", token: TOKEN })).corpo).toEqual({ dados: null });
    const de2 = await chamar("entrevista-desligamento", { acao: "salvar", token: TOKEN, dados: { respostas } });
    expect(de2.status).toBe(400);
    expect(de2.corpo.erro).toMatch(/não é mais válido/);
  });

  it("link com mais de 30 dias é recusado", async () => {
    const vencido = randomUUID();
    await criarEntrevista("ED-2", vencido);
    await prisma.$executeRawUnsafe("update public.entrevistas_desligamento set criado_em = now() - interval '31 days' where id = 'ED-2'");
    expect((await chamar("entrevista-desligamento", { acao: "ler", token: vencido })).corpo).toEqual({ dados: null });
    const r = await chamar("entrevista-desligamento", { acao: "salvar", token: vencido, dados: { respostas: { a: 1 } } });
    expect(r.status).toBe(400);
    expect(r.corpo.erro).toMatch(/venceu/);
    const [e] = await prisma.$queryRawUnsafe<Linha[]>("select status from public.entrevistas_desligamento where id = 'ED-2'");
    expect(e!.status).toBe("Pendente");
  });

  it("token inexistente devolve null; formato errado e respostas inválidas dão 400", async () => {
    expect((await chamar("entrevista-desligamento", { acao: "ler", token: randomUUID() })).corpo).toEqual({ dados: null });
    expect((await chamar("entrevista-desligamento", { acao: "ler", token: "abc" })).status).toBe(400);
    expect((await chamar("entrevista-desligamento", { acao: "salvar", token: TOKEN, dados: { respostas: [1, 2] } })).status).toBe(400);
    expect((await chamar("entrevista-desligamento", { acao: "salvar", token: TOKEN })).status).toBe(400);
  });
});

describe("/api/publico/conexao-nps", () => {
  let token: string;

  beforeEach(async () => {
    const [col] = await prisma.$queryRawUnsafe<{ id: bigint }[]>(
      `insert into public.colaboradores (nome, unidade, departamento, situacao, cpf, matricula, data_admissao)
       values ('Pessoa Conexão', 'Norte', 'Loja 1', 'Ativo', $1, $2, '2025-12-01') returning id`,
      CPF, TELEFONE,
    );
    const chave = `${Number(col!.id)}@2025-12-01`;
    // Como a Conexão RH faz: encontro finalizado com presença → npsSync gera o link.
    const admin = await criarConta({ perfil: "admin" });
    const sessao = randomUUID();
    const base = { date: "2026-01-10", time: "10:00", duration: 60, milestone: 30, facilitator: "Facilitadora Teste" };
    const s = await executar("conexao.salvar", {
      changes: [
        { kind: "sessions", id: sessao, revision: 0, data: { id: sessao, ...base, participants: [chave], importedPilot: true } },
        {
          kind: "executions", id: sessao, revision: 0,
          data: { session: sessao, ...base, status: "final", summary: "Síntese inventada", roster: [{ key: chave, attendance: "presente" }] },
        },
      ],
    }, admin);
    expect(s.status).toBe(200);
    const sync = await executar("conexao.npsSync", {}, admin);
    expect(sync.status).toBe(200);
    token = ((sync as { dados: Linha[] }).dados[0]!.token as string);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ler devolve só encontro, data e se já respondeu", async () => {
    const r = await chamar("conexao-nps", { acao: "ler", token });
    expect(r.status).toBe(200);
    expect(r.corpo.dados).toEqual({ milestone: 30, date: "2026-01-10", answered: false });
  });

  it("salvar grava a nota; o mesmo link não avalia de novo", async () => {
    const r = await chamar("conexao-nps", { acao: "salvar", token, dados: { nota: 9, comentario: "  Comentário inventado  " } });
    expect(r.status).toBe(200);
    expect(r.corpo.dados).toEqual({ milestone: 30, date: "2026-01-10", answered: true });
    const [n] = await prisma.$queryRawUnsafe<Linha[]>("select score, comment from conexao_private.nps");
    expect(n).toEqual({ score: 9, comment: "Comentário inventado" });
    expect((await chamar("conexao-nps", { acao: "ler", token })).corpo.dados).toMatchObject({ answered: true });
    const de2 = await chamar("conexao-nps", { acao: "salvar", token, dados: { nota: 3, comentario: null } });
    expect(de2.status).toBe(400);
    expect(de2.corpo.erro).toMatch(/já foi avaliado/);
  });

  it("token inexistente ou vencido: recusado com a mensagem da função, como antes", async () => {
    const outro = "a".repeat(64);
    const r = await chamar("conexao-nps", { acao: "ler", token: outro });
    expect(r.status).toBe(400);
    expect(r.corpo.erro).toMatch(/inválido ou expirado/);
    await prisma.$executeRawUnsafe("update conexao_private.nps set expires_at = now() - interval '1 day'");
    const venc = await chamar("conexao-nps", { acao: "salvar", token, dados: { nota: 5 } });
    expect(venc.status).toBe(400);
    expect(venc.corpo.erro).toMatch(/inválido ou expirado/);
    const [n] = await prisma.$queryRawUnsafe<Linha[]>("select score from conexao_private.nps");
    expect(n!.score).toBeNull();
  });

  it("formato errado e nota fora de 0–10 dão 400", async () => {
    expect((await chamar("conexao-nps", { acao: "ler", token: randomUUID() })).status).toBe(400);
    expect((await chamar("conexao-nps", { acao: "ler", token: token.toUpperCase() })).status).toBe(400);
    expect((await chamar("conexao-nps", { acao: "salvar", token, dados: { nota: 11 } })).status).toBe(400);
    expect((await chamar("conexao-nps", { acao: "salvar", token, dados: { nota: 5, comentario: "x".repeat(2001) } })).status).toBe(400);
  });
});
