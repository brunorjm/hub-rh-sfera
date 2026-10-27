// Cálculo dos indicadores de cada menu do módulo Indicadores a partir de
// window.HUB_DATA (já carregado do Supabase) e do estado de filtros da barra
// superior. O indicador de Recrutamento NÃO fica aqui — é calculado ao vivo
// por metrics-recrutamento.js a partir das tabelas do módulo Recrutamento.
(function () {
  const U = HUB_UTILS;

  function norm(s) { return U.normalizeText(s || '').trim(); }

  // "Grupos" (coluna K da planilha de Colaboradores) guarda tags soltas por
  // colaborador (ex.: "cota.pcd", "afastamento.inss") — geralmente mais de
  // uma por pessoa, separadas por vírgula/ponto-e-vírgula/quebra de linha.
  // Checa por substring normalizada em vez de split exato: cobre tanto lista
  // com separador quanto um valor único, sem depender de qual separador a
  // planilha realmente usa.
  function temGrupo(colaborador, tag) {
    return norm(colaborador.grupos).includes(norm(tag));
  }

  // ------------------------------------------------------------------
  // Filtro genérico: recebe as linhas de uma tabela + um "mapa" dizendo em
  // quais campos daquela tabela estão data/unidade/departamento/pessoa(s)
  // relevantes, e devolve só as linhas que batem com os filtros ativos.
  // ------------------------------------------------------------------
  function filterRows(rows, map, f) {
    return rows.filter(r => {
      if (map.date) {
        const d = r[map.date];
        if (f.start || f.end) {
          if (!d) return false;
          if (!U.inRange(d, f.start, f.end)) return false;
        }
      }
      if (map.unidade && !U.matchesAny(r[map.unidade], f.unidade)) return false;
      if (map.departamento && !U.matchesAny(r[map.departamento], f.departamento)) return false;
      if (f.colaborador && map.pessoa) {
        const fields = Array.isArray(map.pessoa) ? map.pessoa : [map.pessoa];
        if (!fields.some(fld => U.normIncludes(r[fld], f.colaborador))) return false;
      }
      if (f.gestor && map.gestor) {
        const fields = Array.isArray(map.gestor) ? map.gestor : [map.gestor];
        if (!fields.some(fld => U.normIncludes(r[fld], f.gestor))) return false;
      }
      if (f.trilha && map.tipoConteudo && !U.normIncludes(r[map.tipoConteudo], f.trilha)) return false;
      if (f.conteudo && map.conteudo && !U.normIncludes(r[map.conteudo], f.conteudo)) return false;
      return true;
    });
  }

  function countBy(rows, field) {
    const m = new Map();
    for (const r of rows) {
      const k = r[field] || 'Não informado';
      m.set(k, (m.get(k) || 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  }

  function sumBy(rows, field, valueField) {
    const m = new Map();
    for (const r of rows) {
      const k = r[field] || 'Não informado';
      const v = Number(r[valueField]) || 0;
      m.set(k, (m.get(k) || 0) + v);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  }

  function avgBy(rows, field, valueField) {
    const m = new Map();
    for (const r of rows) {
      const k = r[field] || 'Não informado';
      if (!m.has(k)) m.set(k, { sum: 0, count: 0 });
      const e = m.get(k);
      e.sum += Number(r[valueField]) || 0;
      e.count++;
    }
    return Array.from(m.entries())
      .map(([label, e]) => ({ label, value: e.count ? e.sum / e.count : 0 }))
      .sort((a, b) => b.value - a.value);
  }

  // ==================================================================
  // COLABORADORES — headcount, dedupe de nomes ativos duplicados
  // ==================================================================
  function dedupeHeadcount(rows) {
    // situacao Desligado nunca entra no headcount.
    const candidatas = rows.filter(r => norm(r.situacao) !== 'desligado' && norm(r.situacao) !== '');
    const byName = new Map();
    for (const r of candidatas) {
      const key = norm(r.nome_completo || r.nome);
      if (!key) continue;
      const atual = byName.get(key);
      if (!atual) { byName.set(key, r); continue; }
      const atualAtivo = norm(atual.situacao) === 'ativo';
      const rAtivo = norm(r.situacao) === 'ativo';
      if (rAtivo && !atualAtivo) { byName.set(key, r); continue; }
      if (rAtivo === atualAtivo) {
        const rDate = r.data_cadastro || r.data_admissao || '';
        const aDate = atual.data_cadastro || atual.data_admissao || '';
        if (rDate > aDate) byName.set(key, r);
      }
    }
    return Array.from(byName.values());
  }

  function colaboradoresMetrics(f) {
    let all = (HUB_DATA.colaboradores || []);
    // f.galho (Set de HUB_GALHO.chave): quem não tem indicadores.headcount_completo
    // conta só a si mesmo e a equipe abaixo — ver sections/indicadores.js.
    if (f.galho) all = all.filter(r => f.galho.has(HUB_GALHO.chave(r)));
    let rows = dedupeHeadcount(all);
    rows = rows.filter(r => U.matchesAny(r.unidade, f.unidade));
    rows = rows.filter(r => U.matchesAny(r.departamento, f.departamento));
    if (f.gestor) rows = rows.filter(r => U.normIncludes(r.gestor_direto, f.gestor));
    if (f.colaborador) rows = rows.filter(r => U.normIncludes(r.nome_completo, f.colaborador));

    const hoje = U.todayISO();
    // Período de experiência CLT: 45 dias + prorrogação de mais 45 (90 no
    // total) contados da admissão. "Em experiência" aqui é sempre relativo a
    // HOJE (não ao período do filtro de data, que esta tela nem usa) — é uma
    // foto do quadro atual, igual Ativos/Desativados.
    const emExperienciaRows = rows.filter(r => {
      const d = r.data_admissao ? daysBetween(r.data_admissao, hoje) : null;
      return d !== null && d >= 0 && d <= 90;
    });
    if (f.experiencia) rows = emExperienciaRows;

    const ativos = rows.filter(r => norm(r.situacao) === 'ativo');
    const desativados = rows.filter(r => norm(r.situacao) === 'desativado');
    const mesAtual = hoje.slice(5, 10);
    const hojeOrd = ordinalOfMD(mesAtual);
    const aniversariantes = rows
      .filter(r => r.data_nascimento)
      .map(r => ({ nome: r.nome_completo || r.nome, cargo: r.cargo, data: r.data_nascimento, md: r.data_nascimento.slice(5, 10), unidade: r.unidade, departamento: r.departamento }))
      .map(r => {
        let diff = ordinalOfMD(r.md) - hojeOrd;
        if (diff < 0) diff += 365;
        return Object.assign(r, { diasParaAniversario: diff });
      })
      .filter(r => r.diasParaAniversario < 30)
      .sort((a, b) => a.diasParaAniversario - b.diasParaAniversario);

    const tempoMedio = rows.length
      ? rows.reduce((s, r) => s + (U.tenureMonths(r.data_admissao) || 0), 0) / rows.length
      : 0;

    return {
      total: rows.length,
      ativos: ativos.length,
      desativados: desativados.length,
      emExperiencia: f.experiencia ? rows.length : emExperienciaRows.length,
      cotaPcd: rows.filter(r => temGrupo(r, 'cota.pcd')).length,
      cotaAprendiz: rows.filter(r => temGrupo(r, 'cota.aprendiz')).length,
      afastamentoInss: rows.filter(r => temGrupo(r, 'afastamento.inss')).length,
      afastamentoMaternidade: rows.filter(r => temGrupo(r, 'afastamento.maternidade')).length,
      // Férias: a Feedz não tem marca própria — é quem está desativado e não
      // tem tag de afastamento (INSS ou maternidade).
      ferias: desativados.filter(r => !temGrupo(r, 'afastamento.inss') && !temGrupo(r, 'afastamento.maternidade')).length,
      porUnidade: countBy(rows, 'unidade'),
      porDepartamento: countBy(rows, 'departamento'),
      porGestor: countBy(rows, 'gestor_direto'),
      porSexo: countBy(rows, 'sexo'),
      tempoMedioMeses: tempoMedio,
      aniversariantes: aniversariantes.slice(0, 50),
      lista: rows
    };
  }

  function ordinalOfMD(md) {
    const [m, d] = md.split('-').map(Number);
    const dt = new Date(Date.UTC(2001, m - 1, d));
    const start = new Date(Date.UTC(2001, 0, 1));
    return Math.round((dt - start) / 86400000);
  }

  // ==================================================================
  // ROTATIVIDADE — turnover geral/voluntário/involuntário, taxa, série temporal
  // ==================================================================
  function tipoDesligamento(r) {
    const t = norm(r.desligamento_tipo);
    if (t.includes('involunt')) return 'Involuntário';
    if (t.includes('volunt')) return 'Voluntário';
    return 'Não informado';
  }

  function daysBetween(startIso, endIso) {
    if (!startIso || !endIso) return null;
    const s = new Date(startIso + 'T00:00:00Z');
    const e = new Date(endIso + 'T00:00:00Z');
    return Math.round((e - s) / 86400000);
  }

  // Data de saída de um desligado: só o "Último dia trabalhado" da planilha.
  // Antes, quando faltava, usava a data de admissão no lugar — o desligamento
  // caía no mês da admissão (mês errado, às vezes fora do período filtrado) e,
  // no turnover na experiência, contava como "saiu com 0 dias de casa". Sem a
  // data, o desligamento fica fora das contas por período e é reportado à
  // parte (semDataSaida), pra quem corrige a planilha saber que ele existe.
  function dataSaida(r) { return r.ultimo_dia_trabalhado || null; }

  function headcountAt(rows, dateISO) {
    return rows.filter(r => {
      if (!r.data_admissao || r.data_admissao > dateISO) return false;
      if (norm(r.situacao) !== 'desligado') return true;
      const fim = r.ultimo_dia_trabalhado || r.data_admissao;
      return fim > dateISO;
    }).length;
  }

  function rotatividadeMetrics(f) {
    let rows = HUB_DATA.colaboradores || [];
    // f.galho só vem preenchido no Dashboard (ver comGalho em
    // sections/indicadores.js): quem vê o headcount só da própria equipe tem
    // o turnover calculado sobre a mesma equipe — senão o cartão de
    // colaboradores e o de turnover usam bases diferentes, lado a lado.
    if (f.galho) rows = rows.filter(r => f.galho.has(HUB_GALHO.chave(r)));
    rows = rows.filter(r => U.matchesAny(r.unidade, f.unidade));
    rows = rows.filter(r => U.matchesAny(r.departamento, f.departamento));
    if (f.gestor) rows = rows.filter(r => U.normIncludes(r.gestor_direto, f.gestor));

    const start = f.start || '2020-01-01';
    const end = f.end || U.todayISO();

    const todosDesligados = rows.filter(r => norm(r.situacao) === 'desligado');
    const semDataSaida = todosDesligados.filter(r => !dataSaida(r)).length;
    const desligados = todosDesligados.filter(r => dataSaida(r));
    const desligadosPeriodo = desligados.filter(r => U.inRange(dataSaida(r), start, end));
    const voluntarios = desligadosPeriodo.filter(r => tipoDesligamento(r) === 'Voluntário');
    const involuntarios = desligadosPeriodo.filter(r => tipoDesligamento(r) === 'Involuntário');
    // Turnover (rotatividade) considera admissões E desligamentos — mede a
    // movimentação total do quadro. Taxa de desligamento considera só saídas.
    const admitidosPeriodo = rows.filter(r => U.inRange(r.data_admissao, start, end));

    // Turnover na experiência: dos admitidos no período, quantos também
    // foram desligados dentro dos primeiros 90 dias (período de experiência
    // do CLT, ~3 meses) — mede quem "entrou e saiu" antes de passar pela
    // experiência, independente de a saída em si cair dentro do período.
    const desligadosExperiencia = admitidosPeriodo.filter(r => {
      if (norm(r.situacao) !== 'desligado' || !dataSaida(r)) return false;
      const dias = daysBetween(r.data_admissao, dataSaida(r));
      return dias !== null && dias >= 0 && dias <= 90;
    });
    const taxaTurnoverExperiencia = admitidosPeriodo.length > 0 ? desligadosExperiencia.length / admitidosPeriodo.length : 0;

    // Mesmos 3 gráficos de baixo (voluntário x involuntário por mês, motivos,
    // top cargos), mas só com quem desligou dentro do período de experiência
    // (até 90 dias após a admissão) — mede o que está acontecendo logo na
    // entrada, separado do desligamento "normal" do resto da série.
    const mesesExperiencia = U.monthsBetween(start.slice(0, 7), end.slice(0, 7));
    const serieExperiencia = mesesExperiencia.map(mk => {
      const desMes = desligadosExperiencia.filter(r => U.monthKey(dataSaida(r)) === mk);
      return {
        mes: mk, label: U.monthLabel(mk),
        voluntarios: desMes.filter(r => tipoDesligamento(r) === 'Voluntário').length,
        involuntarios: desMes.filter(r => tipoDesligamento(r) === 'Involuntário').length
      };
    });
    const motivosExperiencia = countBy(desligadosExperiencia, 'desligamento_motivo');
    const cargosDesligadosExperiencia = countBy(desligadosExperiencia, 'cargo');

    const meses = U.monthsBetween(start.slice(0, 7), end.slice(0, 7));
    const serie = meses.map(mk => {
      const monthStart = mk + '-01';
      const hcInicio = headcountAt(rows, monthStart);
      const desMes = desligados.filter(r => U.monthKey(dataSaida(r)) === mk);
      const admMes = rows.filter(r => U.monthKey(r.data_admissao) === mk);
      const vol = desMes.filter(r => tipoDesligamento(r) === 'Voluntário').length;
      const invol = desMes.filter(r => tipoDesligamento(r) === 'Involuntário').length;
      const taxaDesligamento = hcInicio > 0 ? desMes.length / hcInicio : 0;
      const taxaTurnover = hcInicio > 0 ? ((admMes.length + desMes.length) / 2) / hcInicio : 0;
      return {
        mes: mk, label: U.monthLabel(mk), headcountInicio: hcInicio,
        desligamentos: desMes.length, admissoes: admMes.length,
        voluntarios: vol, involuntarios: invol, taxaDesligamento, taxaTurnover
      };
    });

    const hcMedioPeriodo = serie.length ? serie.reduce((s, m) => s + m.headcountInicio, 0) / serie.length : 0;
    const taxaDesligamentoGeral = hcMedioPeriodo > 0 ? desligadosPeriodo.length / hcMedioPeriodo : 0;
    const taxaVoluntaria = hcMedioPeriodo > 0 ? voluntarios.length / hcMedioPeriodo : 0;
    const taxaInvoluntaria = hcMedioPeriodo > 0 ? involuntarios.length / hcMedioPeriodo : 0;
    const taxaTurnoverGeral = hcMedioPeriodo > 0 ? ((admitidosPeriodo.length + desligadosPeriodo.length) / 2) / hcMedioPeriodo : 0;
    const turnoverMedio = serie.length ? serie.reduce((s, m) => s + m.taxaTurnover, 0) / serie.length : 0;
    const taxaDesligamentoMedia = serie.length ? serie.reduce((s, m) => s + m.taxaDesligamento, 0) / serie.length : 0;

    const motivos = countBy(desligadosPeriodo, 'desligamento_motivo');
    const cargosDesligados = countBy(desligadosPeriodo, 'cargo');
    const listaDesligados = desligadosPeriodo
      .map(r => ({
        nome: r.nome_completo || r.nome, cargo: r.cargo, unidade: r.unidade, departamento: r.departamento,
        data: dataSaida(r), tipo: tipoDesligamento(r), motivo: r.desligamento_motivo
      }))
      .sort((a, b) => (b.data || '').localeCompare(a.data || ''));

    const insights = [];
    if (desligadosPeriodo.length === 0) {
      insights.push({ tipo: 'info', texto: 'Nenhum desligamento no período selecionado.' });
    } else {
      if (taxaDesligamentoGeral > 0.03) insights.push({ tipo: 'alerta', texto: `Taxa de desligamento de ${U.fmtPct(taxaDesligamentoGeral)} no período está acima do saudável para a maioria dos varejos (referência: até 3% a.m.). Priorize ações de retenção.` });
      if (involuntarios.length > voluntarios.length) {
        insights.push({ tipo: 'acao', texto: 'Desligamentos involuntários predominam: revise critérios de contratação, integração (onboarding) e acompanhamento de performance nos primeiros 90 dias.' });
      } else if (voluntarios.length > 0) {
        insights.push({ tipo: 'acao', texto: 'Desligamentos voluntários predominam: aprofunde a Entrevista de Desligamento e pesquisas de clima para identificar causas de saída e agir em remuneração, liderança ou carreira.' });
      }
      if (motivos[0]) insights.push({ tipo: 'info', texto: `Principal motivo de desligamento no período: "${motivos[0].label}" (${motivos[0].value} caso(s)).` });
    }
    if (admitidosPeriodo.length > 0) {
      insights.push({
        tipo: taxaTurnoverExperiencia > 0.2 ? 'alerta' : 'info',
        texto: `Turnover na experiência: ${U.fmtPct(taxaTurnoverExperiencia)} dos admitidos no período saíram nos primeiros 3 meses (${desligadosExperiencia.length} de ${admitidosPeriodo.length}).`
      });
    }

    return {
      semDataSaida,
      totalDesligados: desligadosPeriodo.length,
      totalAdmitidos: admitidosPeriodo.length,
      voluntarios: voluntarios.length,
      involuntarios: involuntarios.length,
      taxaTurnoverGeral, taxaVoluntaria, taxaInvoluntaria,
      taxaDesligamentoGeral, turnoverMedio, taxaDesligamentoMedia,
      taxaTurnoverExperiencia, totalDesligadosExperiencia: desligadosExperiencia.length,
      serie, motivos, cargosDesligados, listaDesligados, insights,
      serieExperiencia, motivosExperiencia, cargosDesligadosExperiencia
    };
  }

  // ==================================================================
  // ENTREVISTA DE DESLIGAMENTO
  // ==================================================================
  // Leitura tolerante do JSONB `respostas` (guarda cada resposta da pesquisa
  // com a chave = cabeçalho original da planilha, \r\n e tudo). Mesma lógica
  // de normalização de parsers.js (normHeader/pick), mas operando sobre o
  // objeto já salvo no banco em vez de uma linha de planilha.
  function normHeaderKey(h) {
    return String(h == null ? '' : h).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function respostaIndex(respostas) {
    return Object.keys(respostas || {}).map(k => [normHeaderKey(k), k]);
  }

  // Tenta igualdade exata primeiro (cabeçalhos praticamente únicos na
  // planilha real); só cai pra prefixo se não achar, e só com candidato longo
  // o bastante pra não confundir perguntas diferentes que começam parecido.
  function getResposta(entradas, respostas, candidate) {
    const nc = normHeaderKey(candidate);
    let hit = entradas.find(([nh]) => nh === nc);
    if (!hit && nc.length > 30) hit = entradas.find(([nh]) => nh.startsWith(nc) || nc.startsWith(nh));
    if (!hit) return null;
    const v = respostas[hit[1]];
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
  }

  // Várias perguntas da pesquisa são "marque até 2 opções" e chegam como um
  // texto só com os itens separados por ";" — aqui viram itens independentes
  // pra contagem no gráfico, em vez de uma combinação única.
  function splitMulti(v) {
    if (!v) return [];
    return String(v).split(';').map(s => s.trim()).filter(Boolean);
  }

  function countAnswers(values, opts) {
    opts = opts || {};
    const m = new Map();
    for (const v of values) {
      if (!v) continue;
      const items = opts.multi ? splitMulti(v) : [v];
      for (const it of items) m.set(it, (m.get(it) || 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  }

  function isPositivoValor(v, positivos) {
    if (!positivos || !positivos.length || v == null) return false;
    const nv = norm(v);
    return positivos.some(p => norm(p) === nv);
  }

  // Configuração declarativa dos 11 índices da Entrevista de Desligamento —
  // cada um lê uma coluna principal (pergunta fechada) da planilha real "34.
  // Nova Entrevista de Desligamento.xlsx" e, quando não é "simples", abre um
  // gráfico/lista de comentários complementar ao lado (coluna diferente
  // conforme a resposta ter sido classificada como positiva ou negativa).
  // outrosGatilho+colOutros cobrem os dois casos de detalhamento aninhado:
  // Liderança Direta só abre um 3º nível ao clicar em "Outros (especifique)";
  // Remuneração abre a qualquer clique no gráfico negativo (BU), sem gatilho.
  const DESL_INDICES = [
    {
      key: 'drivers_atracao',
      titulo: 'Drivers de Atração de Candidatos',
      colPrincipal: 'Ao ingressar na Sfera Multifranquias o que mais lhe motivou a optar pela empresa foi:',
      simples: true
    },
    {
      key: 'transparencia_recrutamento',
      titulo: 'Índice de Transparência no Recrutamento',
      colPrincipal: 'As informações do Processo Seletivo, referente a remuneração, atribuições e benefícios, correspondem ao que foi aplicado?',
      positivos: ['Sim'],
      colPositiva: 'Como você avalia a clareza e a coerência das informações apresentadas durante o Processo Seletivo, especialmente em relação à remuneração, atribuições e benefícios?',
      colNegativa: 'Por favor, descreva abaixo o que não foi passado corretamente durante o Processo Seletivo, referente a remuneração, atribuições e benefícios.'
    },
    {
      key: 'satisfacao_contratacao',
      titulo: 'Índice de Satisfação com o Processo de Contratação (DP)',
      colPrincipal: 'As informações do Processo de Contratação, referente a remuneração, benefícios, jornada de trabalho, correspondem ao que foi aplicado?',
      positivos: ['Sim'],
      colPositiva: 'Se sim, como você avalia essa experiência no Processo de Contratação?',
      colNegativa: 'Por favor, descreva abaixo o que não foi passado corretamente durante o Processo de Contratação, referente a remuneração, benefícios, jornada de trabalho, correspondem ao que foi aplicado?'
    },
    {
      key: 'efetividade_onboarding',
      titulo: 'Índice de Efetividade do Onboarding',
      colPrincipal: 'Você considera o Onboarding e os treinamentos iniciais aderentes às tarefas desempenhadas?',
      positivos: ['Sim'],
      colPositiva: 'Se sim, como você avalia essa experiência no nosso Onboarding?',
      colNegativa: 'Você poderia compartilhar quais aspectos do onboarding ou dos treinamentos iniciais não atenderam às demandas do seu dia a dia',
      negativaMulti: true
    },
    {
      key: 'percepcao_carga_treinamentos',
      titulo: 'Índice de Percepção da Carga de Treinamentos',
      colPrincipal: 'Como você avalia a quantidade de treinamentos obrigatórios durante sua permanência na empresa?',
      positivos: ['Satisfatório', 'Adequada à função e rotina'],
      colPositiva: 'Qual a opção que melhor representa sua experiência em relação aos treinamentos obrigatórios?',
      colNegativa: 'O que poderia ser melhor em relação aos treinamentos obrigatórios?',
      negativaMulti: true
    },
    {
      key: 'qualidade_relacao_gestor',
      titulo: 'Índice de Qualidade da Relação com o Gestor',
      colPrincipal: 'Como avalia o relacionamento com seu gestor direto?',
      positivos: ['Excelente, havia abertura, apoio e boa comunicação', 'Bom, com interações produtivas e respeitosas'],
      colPositiva: 'Qual a opção que melhor representa seu relacionamento com seu gestor direto?',
      colNegativa: 'Sinalize o que poderia ser melhor ou o que não era bom no relacionamento com seu gestor direto.',
      negativaMulti: true
    },
    {
      key: 'qualidade_lideranca_direta',
      titulo: 'Índice de Qualidade da Liderança Direta',
      colPrincipal: 'Como você considera a gestão do seu superior imediato?',
      positivos: ['Boa, com direcionamentos claros e apoio adequado', 'Excelente, com liderança inspiradora e bem estruturada'],
      colPositiva: 'Qual a opção que melhor representa a gestão do seu superior imediato?',
      colNegativa: 'Você poderia detalhar por que considera a gestão do seu superior imediato insatisfatória?',
      outrosGatilho: 'Outros (especifique)',
      colOutros: 'Você poderia descrever com mais detalhes o motivo pelo qual considera a gestão do seu superior imediato insatisfatória?'
    },
    {
      key: 'relacionamento_equipe',
      titulo: 'Índice de Relacionamento com a Equipe',
      colPrincipal: 'Como avalia o relacionamento com sua equipe?',
      positivos: ['Excelente, havia colaboração, respeito e bom clima', 'Bom, com interações positivas e produtivas'],
      colPositiva: 'Selecione a opção que melhor representa sua experiência.',
      colNegativa: 'Sinalize quais aspectos do relacionamento com sua equipe você considera que poderiam ter sido melhores?',
      negativaMulti: true
    },
    {
      key: 'satisfacao_remuneracao',
      titulo: 'Índice de Satisfação com a Remuneração',
      colPrincipal: 'Como você classificaria os seguintes aspectos de nossa empresa em relação a REMUNERAÇÃO:',
      positivos: ['Bom', 'Excelente'],
      colPositiva: 'Se considera positiva, selecione a opção que melhor representa sua experiência:',
      colNegativa: 'Você poderia detalhar por que considera a remuneração da empresa insatisfatória?',
      negativaMulti: true,
      // BV só é preenchida junto com BU (mesmas 191 respostas) — é o
      // detalhamento em texto livre do motivo de insatisfação com a
      // remuneração, então abre pra qualquer clique no gráfico negativo
      // (BU), sem precisar de um gatilho específico como "Outros".
      colOutros: 'Você poderia descrever com mais detalhes o motivo pelo qual considera a remuneração insatisfatória?'
    },
    {
      key: 'satisfacao_beneficios',
      titulo: 'Índice de Satisfação com os Benefícios',
      colPrincipal: 'Como você classificaria os seguintes aspectos de nossa empresa em relação a BENEFÍCIOS onde:',
      positivos: ['Bom', 'Excelente'],
      colPositiva: 'Se considera positiva, selecione a opção que melhor representa sua experiência.',
      colNegativa: 'Você poderia detalhar por que considera os benefícios da empresa insatisfatórios?'
    },
    {
      key: 'percepcao_crescimento',
      titulo: 'Índice de Percepção de Crescimento Profissional',
      colPrincipal: 'Como você classificaria os seguintes aspectos de nossa empresa em relação a POSSIBILIDADE DE CRESCIMENTO onde:',
      positivos: ['Bom', 'Excelente'],
      colPositiva: 'Se considera positiva, selecione a opção que melhor representa sua experiência',
      colNegativa: 'Você poderia detalhar por que considera a possibilidade de crescimento na empresa insatisfatória?'
    }
  ];

  function buildIndiceDesligamento(cfg, rows) {
    const linhas = rows.map(r => {
      const entradas = respostaIndex(r.respostas);
      const principal = getResposta(entradas, r.respostas, cfg.colPrincipal);
      let bucket = null, secundaria = null, terciaria = null;
      if (principal != null && !cfg.simples) {
        bucket = isPositivoValor(principal, cfg.positivos) ? 'positivo' : 'negativo';
        const col = bucket === 'positivo' ? cfg.colPositiva : cfg.colNegativa;
        secundaria = getResposta(entradas, r.respostas, col);
        if (bucket === 'negativo' && cfg.colOutros) terciaria = getResposta(entradas, r.respostas, cfg.colOutros);
      }
      return { principal, bucket, secundaria, terciaria, unidade: r.unidade, departamento: r.departamento };
    }).filter(l => l.principal != null);

    return {
      key: cfg.key, titulo: cfg.titulo, simples: !!cfg.simples,
      // Pergunta original da planilha — mostrada como subtítulo pra dar
      // contexto do que o índice (nome dado pelo RH) está de fato medindo.
      pergunta: cfg.colPrincipal,
      perguntaPositiva: cfg.colPositiva || null,
      perguntaNegativa: cfg.colNegativa || null,
      negativaMulti: !!cfg.negativaMulti,
      // outrosGatilho definido: terciária só abre se clicar nesse valor
      // específico (ex.: "Outros (especifique)"). Sem gatilho, mas com
      // colOutros: terciária abre pra qualquer clique no gráfico negativo
      // (caso Remuneração — BV acompanha qualquer resposta de BU).
      outrosGatilho: cfg.outrosGatilho || null,
      temTerciaria: !!cfg.colOutros,
      principal: countAnswers(linhas.map(l => l.principal)),
      total: linhas.length,
      linhas
    };
  }

  function longTextValues(respostas) {
    if (!respostas) return [];
    return Object.values(respostas).filter(v => typeof v === 'string' && v.trim().length >= 25);
  }

  function bestComment(respostas) {
    if (!respostas) return null;
    const entries = Object.entries(respostas).filter(([, v]) => typeof v === 'string' && v.trim().length >= 15);
    let best = null;
    for (const [k, v] of entries) {
      const nk = norm(k);
      if (nk.includes('acrescentar') || nk.includes('sugest') || nk.includes('por qual motivo')) {
        if (!best || v.length > best.length) best = v;
      }
    }
    if (best) return best;
    let longest = null;
    for (const [, v] of entries) if (!longest || v.length > longest.length) longest = v;
    return longest;
  }

  // O link público (pergunta 80 de modelo.js) usa uma escala de 5 opções
  // ('Sim, com certeza' / 'Provavelmente sim' / 'Talvez, dependendo das
  // condições' / 'Provavelmente não' / 'Não trabalharia novamente'), não só
  // Sim/Não — checar só `.startsWith('sim')` classificava "Provavelmente
  // sim" (uma resposta que pende pro positivo) como negativo, e é essa
  // mistura que fazia os comentários positivos/negativos parecerem
  // invertidos. A planilha histórica (Sim/Não simples) continua batendo,
  // porque "sim" sozinho também está na lista.
  const RESPOSTAS_POSITIVAS_TRABALHARIA = ['sim', 'sim, com certeza', 'provavelmente sim'];
  function isPositivo(r) {
    const t = norm(r.trabalharia_novamente);
    return RESPOSTAS_POSITIVAS_TRABALHARIA.some(v => t === v);
  }

  // Converte um registro de entrevistas_desligamento (respostas por índice
  // de pergunta, ver js/entrevista-desligamento/modelo.js) pro mesmo
  // "formato pesquisa" que entrevista_pesquisa (planilha histórica) já usa —
  // respostas viram um mapa {texto da pergunta: texto da resposta}, e como
  // o texto das perguntas do link é praticamente idêntico ao da planilha
  // original (mesmo formulário), os índices DESL_INDICES acima (que fazem
  // busca fuzzy por cabeçalho, ver getResposta) funcionam sem nenhuma
  // adaptação nos dois casos. Nunca inclui nome/CPF/e-mail do respondente —
  // só unidade/departamento, que já era o único contexto de pessoa exposto
  // nos comentários anônimos mesmo antes desta mudança.
  function converterRespostaLink(row) {
    const M = window.HUB_ED_MODELO, PR = window.HUB_ED_RENDER;
    if (!M || !PR || !row.respostas) return null;
    const respostas = {};
    let motivo = null, submotivo = null, nps = null, trabalhariaNovamente = null;
    for (const qidStr of Object.keys(row.respostas)) {
      const qid = Number(qidStr);
      const q = M.PERGUNTAS[qid];
      if (!q) continue;
      const legivel = PR.respostaLegivel(qid, q, row.respostas[qidStr]);
      if (legivel === null || legivel === undefined) continue;
      if (q.tipo === 'nps') { nps = legivel; continue; }
      const texto = Array.isArray(legivel) ? legivel.join('; ') : String(legivel);
      respostas[q.titulo] = texto;
      if (qid === 18) motivo = texto;
      else if (qid >= 19 && qid <= 28) submotivo = texto;
      else if (qid === 80) trabalhariaNovamente = texto;
    }
    const dataConclusao = row.dataFinalizacao ? String(row.dataFinalizacao).slice(0, 10) : null;
    return {
      unidade: row.unidade, departamento: row.departamento,
      motivo_desligamento: motivo, submotivo_desligamento: submotivo,
      trabalharia_novamente: trabalhariaNovamente, nps,
      data_inicio: dataConclusao, data_conclusao: dataConclusao,
      respostas
    };
  }

  // Todo link gerado (preenchido ou não) conta como uma "solicitação de
  // entrevista" — mesmo papel que entrevista_solicitacao tinha na planilha
  // histórica (KPI "Solicitações de desligamento" + gráfico "Status da
  // entrevista").
  function converterSolicitacaoLink(row) {
    return {
      unidade: row.unidade, departamento: row.departamento,
      data_demissao: row.dataDesligamento || null,
      // link gerado e ainda não respondido = entrevista enviada
      // encerrado = a pessoa recusou a entrevista (ficha "Recusado")
      status_entrevista: row.status === 'Preenchido' ? 'Realizada' : row.status === 'Encerrado' ? 'Recusado' : 'Enviada',
      tipo: null
    };
  }

  // Junta as solicitações da planilha de controle com os links gerados no Hub
  // SEM contar a mesma pessoa duas vezes. A planilha é o universo de
  // desligamentos (traz tipo, motivo, status na Feedz); o link é o andamento
  // da entrevista de parte desses desligamentos. Para cada link:
  //  - se a pessoa já está na planilha (mesmo nome; entre homônimos, a data de
  //    desligamento mais próxima), NÃO vira uma solicitação nova — só atualiza
  //    o status da entrevista daquela linha: respondido → "Realizada";
  //    pendente → "Enviada", a menos que a planilha já registre um desfecho
  //    ("Recusado", "Inelegível", "Realizada");
  //  - se não está (ainda não foi lançada na planilha), entra como solicitação.
  // Universo de desligamentos: o resumo do Controle de Desligamento
  // (função controle_desligamento_indicadores, sem dado pessoal). Só quando o
  // resumo não está disponível (null — função ausente ou erro de carga) usa a
  // cópia antiga da planilha (entrevista_solicitacao); lista vazia significa
  // que a pessoa não tem desligamentos no seu recorte, e fica vazia mesmo.
  // Pedidos cancelados ou com ID duplicado não são desligamentos.
  function solicitacoesBase() {
    const controle = window.HUB_RECRUIT_DATA ? window.HUB_RECRUIT_DATA.controle_desligamento_ind : null;
    if (!Array.isArray(controle)) return HUB_DATA.entrevista_solicitacao || [];
    return controle
      .filter(d => d.statusFeedz !== 'Cancelado' && d.statusFeedz !== 'ID Duplicado')
      .map(d => ({
        planilha_id: d.idDesligamento, nome: d.colaboradorNome, unidade: d.unidade, departamento: d.departamento,
        data_solicitacao: d.dataSolicitacao, data_demissao: d.dataDemissao, tipo: d.tipo,
        tipo_desligamento: d.tipoDesligamento, motivo_desligamento: d.motivo,
        status_feedz: d.statusFeedz, status_entrevista: d.statusEntrevista
      }));
  }

  const STATUS_MANTIDOS_SE_PENDENTE = new Set(['recusado', 'inelegivel', 'realizada']);
  // Links de entrevista para os Indicadores: o resumo sem dado pessoal
  // (entrevistas_desligamento_indicadores) quando disponível; senão a tabela
  // completa (só existe para quem tem a permissão do Controle).
  function linksParaIndicadores() {
    const RD = window.HUB_RECRUIT_DATA || {};
    return Array.isArray(RD.entrevistas_desligamento_ind) ? RD.entrevistas_desligamento_ind : (RD.entrevistas_desligamento || []);
  }

  function juntarSolicitacoes(planilha, links) {
    const chaveNome = s => norm(s).replace(/[^a-z]/g, '');
    const dia = s => (s ? new Date(String(s).slice(0, 10) + 'T12:00:00Z').getTime() : null);
    const porNome = new Map();
    const linhas = planilha.map(r => {
      const c = Object.assign({}, r);
      const k = chaveNome(r.nome);
      if (k) { if (!porNome.has(k)) porNome.set(k, []); porNome.get(k).push(c); }
      return c;
    });
    const novos = [];
    const usadas = new Set();
    const porId = new Map();
    for (const c of linhas) if (c.planilha_id) porId.set(String(c.planilha_id), c);
    for (const l of links) {
      // Resumo do banco: o link já vem dizendo se pertence a um desligamento
      // do Controle — e o status desse desligamento já é sincronizado pelo
      // gatilho do banco. Só os links sem desligamento lançado contam à parte.
      if (l.temDesligamento === true) continue;
      if (l.temDesligamento === false) { novos.push(converterSolicitacaoLink(l)); continue; }
      const peloId = l.idDesligamento && porId.get(String(l.idDesligamento));
      const cands = peloId && !usadas.has(peloId) ? [peloId] : (porNome.get(chaveNome(l.colaboradorNome)) || []).filter(c => !usadas.has(c));
      if (!cands.length) { novos.push(converterSolicitacaoLink(l)); continue; }
      const dl = dia(l.dataDesligamento);
      const alvo = cands.slice().sort((a, b) => {
        const da = dl && dia(a.data_demissao) ? Math.abs(dia(a.data_demissao) - dl) : Infinity;
        const db = dl && dia(b.data_demissao) ? Math.abs(dia(b.data_demissao) - dl) : Infinity;
        return (da - db) || String(b.data_demissao || '').localeCompare(String(a.data_demissao || ''));
      })[0];
      usadas.add(alvo);
      if (l.status === 'Preenchido') alvo.status_entrevista = 'Realizada';
      else if (l.status === 'Encerrado') alvo.status_entrevista = 'Recusado';
      else if (!STATUS_MANTIDOS_SE_PENDENTE.has(norm(alvo.status_entrevista))) alvo.status_entrevista = 'Enviada';
    }
    return linhas.concat(novos);
  }

  // ------------------------------------------------------------------
  // Equivalência de nomes de departamento entre as fontes da Entrevista de
  // Desligamento. O filtro da barra superior oferece os nomes do cadastro de
  // Colaboradores (Headcount, ex.: "O Boticário VD Caratinga (MG)"), mas a
  // pesquisa (Forms) grava "Caratinga VD (MG)" e as solicitações "VD Caratinga
  // (MG)" — comparados por texto exato, o filtro não achava nada. Aqui cada
  // nome vira uma chave sem "O Boticário", sem ordem das palavras e (numa
  // segunda tentativa) sem a sigla do estado/cidade; nas solicitações de
  // Hering/Levi's o nome curto da loja ("Rio Sul") ganha o prefixo da marca.
  // ------------------------------------------------------------------
  const DEPTO_SIGLAS = new Set(['mg', 'rj', 'jf', 'sg', '3r', 'sp']);
  function deptoTokens(s) {
    return norm(s).replace(/[()\-,.\/']/g, ' ').split(/\s+/).filter(t => t && t !== 'o' && t !== 'boticario');
  }
  function deptoChave(s, semSiglas) {
    return deptoTokens(s).filter(t => !semSiglas || !DEPTO_SIGLAS.has(t)).sort().join(' ');
  }
  function marcaDaUnidade(u) {
    const n = norm(u);
    if (n.includes('hering')) return 'hering';
    if (n.includes('levi')) return 'levis';
    if (n.includes('berenice')) return 'quem disse berenice';
    return '';
  }
  let cacheDeptoIdx = { ref: null, n: -1, idx1: null, idx2: null };
  function indicesDepartamentosHeadcount() {
    const cols = (window.HUB_DATA && window.HUB_DATA.colaboradores) || [];
    if (cacheDeptoIdx.ref === cols && cacheDeptoIdx.n === cols.length) return cacheDeptoIdx;
    const idx1 = new Map(), idx2 = new Map();
    const add = (idx, k, nome) => { if (!idx.has(k)) idx.set(k, new Set()); idx.get(k).add(nome); };
    for (const c of cols) {
      if (!c.departamento) continue;
      add(idx1, deptoChave(c.departamento, false), c.departamento);
      add(idx2, deptoChave(c.departamento, true), c.departamento);
    }
    cacheDeptoIdx = { ref: cols, n: cols.length, idx1, idx2 };
    return cacheDeptoIdx;
  }
  // Nomes do Headcount equivalentes a (departamento, unidade); vazio se nenhum.
  function departamentosHeadcountDe(dep, unidade) {
    const { idx1, idx2 } = indicesDepartamentosHeadcount();
    const marca = marcaDaUnidade(unidade);
    const tentativas = [
      [idx1, deptoChave(dep, false)], [idx2, deptoChave(dep, true)],
      [idx2, deptoChave(marca + ' ' + dep, true)], [idx1, deptoChave(marca + ' ' + dep, false)]
    ];
    for (const [idx, k] of tentativas) { const s = idx.get(k); if (s && s.size) return s; }
    return null;
  }
  // Devolve um predicado (linha → bool) que aceita as grafias equivalentes do
  // departamento selecionado em cada fonte. Compara departamento E unidade
  // juntos (o mesmo nome curto "Rio Sul" existe na Hering e na Levi's), por
  // isso não dá para só ampliar a lista de nomes selecionados.
  function filtroDepartamentoEquivalente(selecionados) {
    if (!selecionados || !selecionados.length) return null;
    const alvo = new Set();
    for (const s of selecionados) {
      alvo.add(norm(s));
      const eq = departamentosHeadcountDe(s, '');
      if (eq) for (const n of eq) alvo.add(norm(n));
    }
    const cache = new Map();
    return r => {
      if (!r.departamento) return false;
      const ck = r.departamento + '|' + (r.unidade || '');
      let ok = cache.get(ck);
      if (ok === undefined) {
        ok = alvo.has(norm(r.departamento));
        if (!ok) {
          const eq = departamentosHeadcountDe(r.departamento, r.unidade);
          if (eq) for (const n of eq) if (alvo.has(norm(n))) { ok = true; break; }
        }
        cache.set(ck, ok);
      }
      return ok;
    };
  }

  function entrevistaMetrics(f) {
    // Duas fontes: entrevista_pesquisa/entrevista_solicitacao (arquivo
    // histórico, importado uma única vez via SQL — não recebe mais upload)
    // + entrevistas_desligamento (link público, alimentado ao vivo pelas
    // respostas de quem preenche a entrevista pela tela Indicadores →
    // Entrevista Desligamento → Lista de Colaboradores). Ver
    // converterRespostaLink/converterSolicitacaoLink acima.
    const linksGerados = linksParaIndicadores();
    const pesquisaLink = linksGerados.filter(r => r.status === 'Preenchido').map(converterRespostaLink).filter(Boolean);

    let pesquisa = (HUB_DATA.entrevista_pesquisa || []).concat(pesquisaLink);
    let solicitacao = juntarSolicitacoes(solicitacoesBase(), linksGerados);

    // O filtro de período aqui é por quando a ENTREVISTA foi respondida
    // (não quando a pessoa se desligou — a pesquisa pode ser respondida bem
    // depois do desligamento, então filtrar por data_desligamento excluía
    // entrevistas de fato realizadas dentro do período escolhido).
    pesquisa = pesquisa.map(r => Object.assign({}, r, { data_entrevista: r.data_conclusao || r.data_inicio }));
    // Anonimizado de propósito: sem `pessoa` no mapa de filtro — ninguém
    // consegue buscar/filtrar a Entrevista de Desligamento pelo nome de
    // quem respondeu, só por unidade/departamento (pedido explícito: as
    // respostas nunca se ligam a um nome na tela).
    const map = { date: 'data_entrevista', unidade: 'unidade', departamento: 'departamento' };
    // Departamento: casa também as grafias equivalentes de cada fonte (ver acima)
    const okDep = filtroDepartamentoEquivalente(f.departamento);
    const fSemDep = Object.assign({}, f, { departamento: [] });
    pesquisa = filterRows(pesquisa, map, fSemDep);
    if (okDep) pesquisa = pesquisa.filter(okDep);
    const mapSol = { date: 'data_demissao', unidade: 'unidade', departamento: 'departamento' };
    solicitacao = filterRows(solicitacao, mapSol, fSemDep);
    if (okDep) solicitacao = solicitacao.filter(okDep);
    // As duas fontes não trazem o nome do gestor direto, então o filtro
    // "Gestor" da barra superior não se aplica a este menu.

    const positivos = pesquisa.filter(isPositivo);
    const negativos = pesquisa.filter(r => r.trabalharia_novamente && !isPositivo(r));

    const npsValores = pesquisa.map(r => r.nps).filter(n => n !== null && n !== undefined);
    const promotores = npsValores.filter(n => n >= 9).length;
    const detratores = npsValores.filter(n => n <= 6).length;
    const neutros = npsValores.length - promotores - detratores;
    const nps = npsValores.length ? Math.round(((promotores - detratores) / npsValores.length) * 100) : null;
    const npsDetalhe = {
      total: npsValores.length, promotores, neutros, detratores,
      pctPromotores: npsValores.length ? promotores / npsValores.length : 0,
      pctNeutros: npsValores.length ? neutros / npsValores.length : 0,
      pctDetratores: npsValores.length ? detratores / npsValores.length : 0
    };

    const textosPositivos = positivos.flatMap(r => longTextValues(r.respostas));
    const textosNegativos = negativos.flatMap(r => longTextValues(r.respostas));

    const indicesDesligamento = DESL_INDICES.map(cfg => buildIndiceDesligamento(cfg, pesquisa));

    // Anonimizados: sem nome do respondente, só unidade/departamento pra dar contexto.
    const comentariosPositivos = positivos.map(r => ({ unidade: r.unidade, departamento: r.departamento, texto: bestComment(r.respostas) })).filter(c => c.texto);
    const comentariosNegativos = negativos.map(r => ({ unidade: r.unidade, departamento: r.departamento, texto: bestComment(r.respostas) })).filter(c => c.texto);

    const nomesColaboradores = (HUB_DATA.colaboradores || []).map(r => r.nome_completo).filter(Boolean);
    const pessoasCitadas = U.extractMentions(textosPositivos.concat(textosNegativos), nomesColaboradores).slice(0, 20);

    const motivos = countBy(pesquisa, 'motivo_desligamento');
    const submotivos = countBy(pesquisa, 'submotivo_desligamento');
    // Pares motivo/submotivo (sem nomes) pra alimentar o drill-down ao clicar
    // numa barra do gráfico de motivos.
    const motivoSubmotivoPairs = pesquisa.map(r => ({ motivo: r.motivo_desligamento || 'Não informado', submotivo: r.submotivo_desligamento || 'Não informado' }));
    const statusEntrevista = countBy(solicitacao, 'status_entrevista');
    const tipoSolicitacao = countBy(solicitacao, 'tipo');

    // Participação: dos desligados do período (mesma base das Solicitações,
    // pela data de demissão), quantos fizeram a entrevista ("Realizada" no
    // Controle). Não usa "Respostas de pesquisa", que conta pela data da
    // resposta — as duas bases não fecham dentro do mesmo período. Elegíveis =
    // sem os "Inelegível" (justa causa, duplicidade etc.).
    const entrevistasRealizadas = solicitacao.filter(r => norm(r.status_entrevista) === 'realizada').length;
    const elegiveis = solicitacao.filter(r => norm(r.status_entrevista) !== 'inelegivel').length;
    const participacao = solicitacao.length ? entrevistasRealizadas / solicitacao.length : null;
    const participacaoElegiveis = elegiveis ? entrevistasRealizadas / elegiveis : null;

    const insights = [];
    if (pesquisa.length) {
      const pctRetornaria = positivos.length / pesquisa.length;
      insights.push({ tipo: 'info', texto: `${U.fmtPct(pctRetornaria)} dos respondentes trabalhariam novamente na empresa (${positivos.length} de ${pesquisa.length}).` });
      if (nps !== null) insights.push({ tipo: nps < 0 ? 'alerta' : 'info', texto: `eNPS de desligados: ${nps}.` });
      if (motivos[0]) insights.push({ tipo: 'info', texto: `Motivo de desligamento mais citado: "${motivos[0].label}" (${motivos[0].value}).` });
      if (pessoasCitadas.length) insights.push({ tipo: 'info', texto: `Pessoas mais citadas nos depoimentos: ${pessoasCitadas.slice(0, 5).map(p => p.nome).join(', ')}.` });
    } else {
      insights.push({ tipo: 'info', texto: 'Nenhuma resposta de pesquisa de desligamento no período/filtro selecionado.' });
    }
    if (solicitacao.length) {
      const naoRealizadas = solicitacao.filter(r => norm(r.status_entrevista) !== 'realizada').length;
      if (naoRealizadas > 0) insights.push({ tipo: 'acao', texto: `${naoRealizadas} entrevista(s) de desligamento ainda não realizada(s) — recomenda-se contato para aplicação da pesquisa.` });
    }

    return {
      totalRespostas: pesquisa.length,
      totalSolicitacoes: solicitacao.length,
      entrevistasRealizadas, elegiveis, participacao, participacaoElegiveis,
      positivos: positivos.length, negativos: negativos.length,
      nps, npsDetalhe, motivos, submotivos, motivoSubmotivoPairs, statusEntrevista, tipoSolicitacao,
      comentariosPositivos, comentariosNegativos,
      pessoasCitadas, insights, indicesDesligamento
    };
  }

  // ==================================================================
  // CELEBRAÇÕES / FEEDBACKS / 1:1 — volume por departamento e por gestor
  // ==================================================================
  function celebracoesMetrics(f) {
    const map = { date: 'data', unidade: 'unidade', departamento: 'departamento', pessoa: ['colaborador_enviou', 'colaboradores_receberam'], gestor: 'colaborador_enviou' };
    const rows = filterRows(HUB_DATA.celebracoes || [], map, f);
    return {
      total: rows.length,
      curtidas: rows.reduce((s, r) => s + (r.curtidas || 0), 0),
      comentarios: rows.reduce((s, r) => s + (r.comentarios || 0), 0),
      porDepartamento: countBy(rows, 'departamento'),
      porUnidade: countBy(rows, 'unidade'),
      porGestor: countBy(rows.filter(r => norm(r.papel) === 'gestor'), 'colaborador_enviou'),
      porRemetente: countBy(rows, 'colaborador_enviou').slice(0, 15),
      serie: seriePorMes(rows, 'data')
    };
  }

  function feedbacksMetrics(f) {
    const map = { date: 'data', unidade: 'unidade', departamento: 'departamento', pessoa: ['de', 'para'], gestor: 'de' };
    const rows = filterRows(HUB_DATA.feedbacks || [], map, f);
    return {
      total: rows.length,
      porDepartamento: countBy(rows, 'departamento'),
      porUnidade: countBy(rows, 'unidade'),
      porGestor: countBy(rows, 'de').slice(0, 15),
      porDestinatario: countBy(rows, 'para').slice(0, 15),
      serie: seriePorMes(rows, 'data')
    };
  }

  // A planilha de 1:1 do Feedz não traz unidade (o parser grava null), então
  // o filtro de Unidade não tinha efeito nenhum aqui. Busca a unidade do
  // liderado no cadastro de Colaboradores — pelo e-mail (mais confiável) e,
  // sem e-mail, pelo nome. Quem não for encontrado fica sem unidade e só sai
  // da conta quando há unidade selecionada no filtro.
  function unidadeDoLiderado() {
    const porEmail = new Map(), porNome = new Map();
    for (const c of (HUB_DATA.colaboradores || [])) {
      if (!c.unidade) continue;
      const ativo = norm(c.situacao) === 'ativo';
      const e = norm(c.email);
      if (e && (ativo || !porEmail.has(e))) porEmail.set(e, c.unidade);
      for (const n of [c.nome_completo, c.nome]) {
        const k = norm(n);
        if (k && (ativo || !porNome.has(k))) porNome.set(k, c.unidade);
      }
    }
    return r => porEmail.get(norm(r.liderado_email)) || porNome.get(norm(r.liderado)) || null;
  }

  function oneOnOneMetrics(f) {
    const map = { date: 'data_realizada', unidade: 'unidade', departamento: 'departamento', pessoa: ['lider', 'liderado'], gestor: 'lider' };
    let base = HUB_DATA.one_on_one || [];
    if (f.unidade && f.unidade.length) {
      const achar = unidadeDoLiderado();
      base = base.map(r => r.unidade ? r : Object.assign({}, r, { unidade: achar(r) }));
    }
    let rows = filterRows(base, map, f);
    const realizados = rows.filter(r => norm(r.status) === 'realizado');

    // Headcount liderado por gestor: ativos + desativados (mesma regra do
    // Headcount — sem desligados, sem nome duplicado) que respondem
    // diretamente ao gestor na planilha de Colaboradores. Departamento e
    // Unidade do filtro valem para o LIDERADO (o cadastro de Colaboradores
    // tem os dois), igual ao recorte das linhas de 1:1 acima.
    const headcountPorGestor = new Map();
    for (const c of dedupeHeadcount(HUB_DATA.colaboradores || [])) {
      if (!U.matchesAny(c.departamento, f.departamento) || !U.matchesAny(c.unidade, f.unidade)) continue;
      const k = norm(c.gestor_direto);
      if (k) headcountPorGestor.set(k, (headcountPorGestor.get(k) || 0) + 1);
    }
    const porGestor = countBy(realizados, 'lider').slice(0, 15).map(g => {
      const headcount = headcountPorGestor.get(norm(g.label)) || 0;
      return { label: g.label, value: g.value, realizados: g.value, headcount, pctRealizados: headcount ? g.value / headcount : null };
    });

    return {
      total: rows.length,
      realizados: realizados.length,
      agendados: rows.filter(r => norm(r.status) === 'agendado').length,
      porDepartamento: countBy(realizados, 'departamento'),
      porGestor,
      serie: seriePorMes(realizados, 'data_realizada')
    };
  }

  function seriePorMes(rows, field) {
    const m = new Map();
    for (const r of rows) {
      const k = U.monthKey(r[field]);
      if (!k) continue;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([mes, value]) => ({ mes, label: U.monthLabel(mes), value }));
  }

  // ==================================================================
  // TREINAMENTOS (Twygo)
  // ==================================================================
  // Agrega pontuação/progresso por pessoa a partir das próprias inscrições —
  // usado quando as planilhas opcionais de usuários/conteúdos não foram
  // enviadas (o Twygo participantes sozinho já sustenta o menu inteiro).
  function agregarPessoasDeParticipantes(participantes) {
    const m = new Map();
    for (const r of participantes) {
      const key = norm(r.email) || norm(r.nome_completo);
      if (!key) continue;
      if (!m.has(key)) m.set(key, { nome_completo: r.nome_completo, pontuacao: 0, progressoSoma: 0, count: 0 });
      const agg = m.get(key);
      agg.pontuacao += r.pontuacao || 0;
      agg.progressoSoma += r.progresso || 0;
      agg.count++;
    }
    return Array.from(m.values()).map(a => ({ nome_completo: a.nome_completo, pontuacao: a.pontuacao, progresso: a.count ? a.progressoSoma / a.count : 0 }));
  }

  // Ranking de taxa de conclusão + progresso médio, agrupado por departamento
  // ou por colaborador — usado nos "top 10" do menu Treinamentos.
  function rankingConclusaoProgresso(rows, groupField) {
    const m = new Map();
    for (const r of rows) {
      const k = r[groupField];
      if (!k) continue;
      if (!m.has(k)) m.set(k, { total: 0, concluidos: 0, progressoSoma: 0 });
      const g = m.get(k);
      g.total++;
      if (norm(r.situacao).includes('conclu') || (r.progresso != null && r.progresso >= 1)) g.concluidos++;
      g.progressoSoma += r.progresso || 0;
    }
    return Array.from(m.entries())
      .map(([label, g]) => ({
        label, total: g.total,
        taxaConclusao: g.total ? g.concluidos / g.total : 0,
        progressoMedio: g.total ? g.progressoSoma / g.total : 0
      }))
      .sort((a, b) => b.taxaConclusao - a.taxaConclusao || b.progressoMedio - a.progressoMedio);
  }

  function treinamentosMetrics(f) {
    // Só considera quem está Ativo no ambiente Twygo — pedido explícito:
    // desconsiderar qualquer pessoa/matrícula marcada como Inativo.
    const participantesAtivos = (HUB_DATA.twygo_participantes || []).filter(r => norm(r.situacao_ambiente) !== 'inativo');
    const usuariosAtivos = (HUB_DATA.twygo_usuarios || []).filter(r => norm(r.situacao) !== 'inativo');

    const mapPart = { date: 'data_inscricao', unidade: 'unidade', departamento: 'departamento', pessoa: 'nome_completo', tipoConteudo: 'content_type', conteudo: 'content_title' };
    let participantes = filterRows(participantesAtivos, mapPart, f);
    // Só considera inscrição "Confirmada" — "Cancelada" (e qualquer outro
    // status) distorce horas/progresso/conclusão, pedido explícito do RH.
    participantes = participantes.filter(r => norm(r.situacao_inscricao).includes('confirmad'));

    const mapUsu = { date: 'registrado_em', unidade: 'unidade', departamento: 'departamento', pessoa: 'nome_completo' };
    const usuarios = filterRows(usuariosAtivos, mapUsu, f);
    // Planilha de usuários é opcional — sem ela, deriva pontuação/progresso
    // por pessoa direto das inscrições do Twygo.
    const pessoas = usuarios.length ? usuarios : agregarPessoasDeParticipantes(participantes);

    const isConcluido = r => norm(r.situacao).includes('conclu') || (r.progresso != null && r.progresso >= 1);
    const concluidos = participantes.filter(isConcluido);
    const naoIniciados = participantes.filter(r => !isConcluido(r) && (r.progresso || 0) === 0);
    const emAndamento = participantes.filter(r => !isConcluido(r) && (r.progresso || 0) > 0);
    const progressoMedio = participantes.length
      ? participantes.reduce((s, r) => s + (r.progresso || 0), 0) / participantes.length
      : 0;
    // Soma direta de Carga Horária das inscrições confirmadas (ambiente
    // ativo) — sem ponderar por progresso, conforme validado com o RH
    // contra a soma da planilha real (1.417h).
    const horasTotais = participantes.reduce((s, r) => s + (r.carga_horaria || 0), 0);

    const topDepartamentos = rankingConclusaoProgresso(participantes, 'departamento').slice(0, 10);
    // Cargo/departamento de cada pessoa (pega da primeira inscrição
    // encontrada) só pra dar contexto na tabela do Top 10 colaboradores.
    const cargoPorPessoa = new Map();
    for (const r of participantes) {
      if (r.nome_completo && !cargoPorPessoa.has(r.nome_completo)) {
        cargoPorPessoa.set(r.nome_completo, { cargo: r.cargo, departamento: r.departamento });
      }
    }
    const topColaboradores = rankingConclusaoProgresso(participantes, 'nome_completo').slice(0, 10)
      .map(x => Object.assign({}, x, cargoPorPessoa.get(x.label)));

    // Sem slice — a tela mostra todos os cursos num contêiner com rolagem.
    const progressoPorCurso = avgBy(participantes, 'content_title', 'progresso');

    let porColaborador = [];
    if (f.colaborador) {
      const cursos = participantes.filter(r => U.normEq(r.nome_completo, f.colaborador));
      const pessoaAgregada = pessoas.find(u => U.normEq(u.nome_completo, f.colaborador));
      porColaborador = {
        cursos: cursos.map(c => ({
          curso: c.content_title, situacao: c.situacao, progresso: c.progresso,
          nota: c.nota, cargaHoraria: c.carga_horaria, dataInscricao: c.data_inscricao, ultimoAcesso: c.ultimo_acesso
        })),
        horasTotais: cursos.reduce((s, c) => s + (c.carga_horaria || 0), 0),
        progressoGeral: pessoaAgregada ? pessoaAgregada.progresso : (cursos.length ? cursos.reduce((s, c) => s + (c.progresso || 0), 0) / cursos.length : null),
        pontuacao: pessoaAgregada ? pessoaAgregada.pontuacao : (cursos.length ? cursos.reduce((s, c) => s + (c.pontuacao || 0), 0) : null),
        cursosConcluidos: cursos.filter(c => norm(c.situacao).includes('conclu') || (c.progresso != null && c.progresso >= 1)).length,
        totalCursos: cursos.length
      };
    }

    return {
      totalInscricoes: participantes.length,
      totalConcluidos: concluidos.length,
      totalNaoIniciados: naoIniciados.length,
      totalEmAndamento: emAndamento.length,
      taxaConclusao: participantes.length ? concluidos.length / participantes.length : 0,
      progressoMedio, horasTotais,
      totalUsuarios: pessoas.length,
      pontuacaoMedia: pessoas.length ? pessoas.reduce((s, u) => s + (u.pontuacao || 0), 0) / pessoas.length : 0,
      progressoPorCurso,
      topDepartamentos, topColaboradores,
      serie: seriePorMes(participantes, 'data_inscricao'),
      porColaborador
    };
  }

  // ==================================================================
  // DASHBOARD — resumo dos principais indicadores de cada menu (menos
  // Recrutamento, que é calculado ao vivo por metrics-recrutamento.js)
  // ==================================================================
  function dashboardMetrics(f) {
    const colab = colaboradoresMetrics(f);
    const rot = rotatividadeMetrics(f);
    const entr = entrevistaMetrics(f);
    const cel = celebracoesMetrics(f);
    const fb = feedbacksMetrics(f);
    const oo = oneOnOneMetrics(f);
    const tr = treinamentosMetrics(f);
    return { colab, rot, entr, cel, fb, oo, tr };
  }

  window.HUB_METRICS_LINKS = linksParaIndicadores;
  window.HUB_METRICS = {
    filterRows, countBy, sumBy, avgBy, seriePorMes, countAnswers, temGrupo,
    colaboradoresMetrics, rotatividadeMetrics, entrevistaMetrics,
    celebracoesMetrics, feedbacksMetrics, oneOnOneMetrics, treinamentosMetrics,
    dashboardMetrics
  };
})();
