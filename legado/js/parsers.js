// Leitura e mapeamento das planilhas para o formato das tabelas do Supabase.
//
// Cada planilha do RH tem um "molde" fixo de colunas (o nome da empresa não
// muda), mas a ORDEM das colunas e colunas extras não importam aqui: cada
// campo é lido pelo nome do cabeçalho, normalizado (sem acentuação de caixa,
// sem espaços/quebras de linha duplicados). Reenviar a mesma planilha sempre
// funciona, mesmo que o Twygo troque o nome da aba a cada exportação.
(function () {
  function normHeader(h) {
    return String(h == null ? '' : h)
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function buildIndex(row) {
    const idx = {};
    for (const k of Object.keys(row)) {
      const n = normHeader(k);
      if (!(n in idx)) idx[n] = k;
    }
    return idx;
  }

  function pick(row, idx, candidates) {
    for (const c of candidates) {
      const key = idx[normHeader(c)];
      if (key !== undefined) {
        const v = row[key];
        if (v !== undefined && v !== null) return v;
      }
    }
    return '';
  }

  function str(v) {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
  }

  const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

  function num(v) {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (v instanceof Date) {
      // Coluna formatada como horário no Excel (ex.: "Carga horária" como
      // 09:06:28) vem como Date com a data-base do Excel — a diferença em
      // dias desde essa época, ×24, dá a quantidade de horas decimais.
      if (isNaN(v.getTime())) return null;
      return ((v.getTime() - EXCEL_EPOCH_MS) / 86400000) * 24;
    }
    let s = String(v).trim();
    if (s === '') return null;
    const isPct = /%$/.test(s);
    s = s.replace('%', '').replace(/\./g, m => m).trim();
    // números pt-BR usam vírgula decimal; só troca se não houver ponto decimal já
    if (/,\d{1,2}$/.test(s) && !/\.\d/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    if (!isFinite(n)) return null;
    return isPct ? n / 100 : n;
  }

  function intOrNull(v) {
    const n = num(v);
    return n === null ? null : Math.round(n);
  }

  // "Carga horária" no Twygo é formatada como duração (H:MM:SS), e o
  // SheetJS (cellDates:true) converte esse tipo de célula pra um objeto
  // Date com um deslocamento de horário espúrio (bug de conversão de
  // formato de duração customizado — reproduzido consistentemente com a
  // planilha real: célula "0:00:00" virava 1899-12-30T03:06:28Z em vez de
  // 00:00:00Z, inflando a soma em ~42x). O texto formatado que o próprio
  // Excel mostra (via sheet_to_json com raw:false) sempre bate com o valor
  // certo, então essa duração é lida à parte, em modo texto, e convertida
  // pra horas decimais na mão.
  function parseDuracaoTexto(s) {
    if (s === undefined || s === null || s === '') return null;
    const m = String(s).trim().match(/^(\d+):(\d{2}):(\d{2})$/);
    if (!m) return num(s);
    return parseInt(m[1], 10) + parseInt(m[2], 10) / 60 + parseInt(m[3], 10) / 3600;
  }

  function toISODate(v) {
    if (v === undefined || v === null || v === '') return null;
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return null;
      return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())).toISOString().slice(0, 10);
    }
    if (typeof v === 'number') {
      const d = new Date(EXCEL_EPOCH_MS + Math.round(v) * 86400000);
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    const s = String(v).trim();
    if (!s) return null;
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) {
      let [, mm, dd, yy] = m;
      if (yy.length === 2) yy = (parseInt(yy, 10) < 50 ? '20' : '19') + yy;
      const d = new Date(Date.UTC(+yy, +mm - 1, +dd));
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  function sheetToRows(ws) {
    return XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
  }

  // Escolhe, entre as abas do workbook, a que tem a maior interseção de
  // cabeçalhos esperados — assim funciona mesmo se a aba tiver nome
  // dinâmico (ex: exports do Twygo) ou se houver abas extras/vazias.
  function pickSheet(wb, expectedHeaders, opts) {
    opts = opts || {};
    let best = null;
    let bestScore = -1;
    for (const name of wb.SheetNames) {
      if (opts.preferName && normHeader(name) === normHeader(opts.preferName)) {
        const ws = wb.Sheets[name];
        const rows = sheetToRows(ws);
        if (rows.length) return { name, rows };
      }
    }
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      const rows = sheetToRows(ws);
      if (!rows.length) continue;
      const idx = buildIndex(rows[0]);
      let score = 0;
      for (const h of expectedHeaders) if (idx[normHeader(h)] !== undefined) score++;
      if (score > bestScore) {
        bestScore = score;
        best = { name, rows, score };
      }
    }
    return best;
  }

  function requireSignature(rows, expectedHeaders, minMatches, label) {
    if (!rows || !rows.length) throw new Error(`Não encontrei nenhuma linha de dados no arquivo (esperado: ${label}).`);
    const idx = buildIndex(rows[0]);
    let score = 0;
    for (const h of expectedHeaders) if (idx[normHeader(h)] !== undefined) score++;
    if (score < minMatches) {
      throw new Error(
        `Este arquivo não parece ser a planilha "${label}". ` +
        `Verifique se selecionou o arquivo certo (colunas esperadas não encontradas).`
      );
    }
    return idx;
  }

  // ---------------------------------------------------------------------
  // Motivo de desligamento: a Feedz traz "Questões Pessoas" (erro de digitação)
  // e variações ("Questão Pessoais", "Questões pessoais") — tudo vira
  // "Questões Pessoais", para o motivo não aparecer repartido nos indicadores.
  function corrigirMotivoDesligamento(v) {
    const s = str(v);
    return s ? s.replace(/quest(?:ão|ões|ao|oes)\s+pesso(?:ai|a)s/i, 'Questões Pessoais') : s;
  }

  // 1. Colaboradores.xlsx  (aba "Headcount")
  // ---------------------------------------------------------------------
  function parseColaboradores(wb) {
    const sig = ['Nome completo', 'Situação', 'Departamento', 'Unidade', 'Gestor Direto', 'Papel'];
    const picked = pickSheet(wb, sig, { preferName: 'Headcount' });
    if (!picked) throw new Error('Não encontrei dados na planilha de Colaboradores.');
    requireSignature(picked.rows, sig, 4, 'Colaboradores');
    return picked.rows.map(row => {
      const idx = buildIndex(row);
      const g = (...c) => pick(row, idx, c);
      return {
        external_id: str(g('ID')),
        nome: str(g('Nome')),
        nome_completo: str(g('Nome completo')) || str(g('Nome')),
        matricula: str(g('Matrícula')),
        email: str(g('Email')),
        cpf: str(g('CPF')),
        cargo: str(g('Cargo')),
        cargo_visivel: str(g('Cargo visível')),
        unidade: str(g('Unidade')),
        departamento: str(g('Departamento')),
        grupos: str(g('Grupos')),
        papel: str(g('Papel')),
        gestor_direto: str(g('Gestor Direto')),
        gestor_email: str(g('Gestor Direto - E-mail')),
        etnia: str(g('Etnia')),
        sexo: str(g('Sexo')),
        genero: str(g('Gênero')),
        data_nascimento: toISODate(g('Data de Nascimento')),
        data_admissao: toISODate(g('Data Admissão')),
        data_cadastro: toISODate(g('Data de Cadastro')),
        situacao: str(g('Situação')),
        ultimo_acesso: toISODate(g('Último Acesso')),
        origem_cadastro: str(g('Origem do Cadastro')),
        participa_gamificacao: str(g('Participa gamificação')),
        desligamento_tipo: str(g('Desligamento - Tipo')),
        desligamento_motivo: corrigirMotivoDesligamento(g('Desligamento - Motivo')),
        ultimo_dia_trabalhado: toISODate(g('Último dia trabalhado')),
        idioma: str(g('Idioma'))
      };
    }).filter(r => r.nome_completo || r.nome);
  }

  // ---------------------------------------------------------------------
  // 4. Feedbacks.xlsx (aba "Feedbacks")
  // ---------------------------------------------------------------------
  function parseFeedbacks(wb) {
    const sig = ['De', 'Para', 'Para Unidade', 'Para Departamento', 'Feedback', 'Avaliação', 'Data'];
    const picked = pickSheet(wb, sig, { preferName: 'Feedbacks' });
    if (!picked) throw new Error('Não encontrei dados na planilha de Feedbacks.');
    requireSignature(picked.rows, sig, 4, 'Feedbacks');
    return picked.rows.map(row => {
      const idx = buildIndex(row);
      const g = (...c) => pick(row, idx, c);
      return {
        de: str(g('De')),
        para: str(g('Para')),
        unidade: str(g('Para Unidade')),
        departamento: str(g('Para Departamento')),
        cargo: str(g('Cargo')),
        anonimo: str(g('Anônimo')),
        template: str(g('Template')),
        feedback: str(g('Feedback')),
        avaliacao: str(g('Avaliação')),
        data: toISODate(g('Data')),
        data_visualizacao: toISODate(g('Data de visualização do Feedback')),
        respostas: {
          r1: str(g('Resposta 1')), r2: str(g('Resposta 2')), r3: str(g('Resposta 3')),
          r4: str(g('Resposta 4')), r5: str(g('Resposta 5')), r6: str(g('Resposta 6'))
        }
      };
    }).filter(r => r.de || r.para);
  }

  // ---------------------------------------------------------------------
  // 5. 1 on 1.xlsx (aba "Worksheet")
  // ---------------------------------------------------------------------
  function parseOneOnOne(wb) {
    const sig = ['Líder/Participante', 'Liderado/Participante', 'Status', 'Data agendada', 'Relação entre os participantes'];
    const picked = pickSheet(wb, sig, { preferName: 'Worksheet' });
    if (!picked) throw new Error('Não encontrei dados na planilha de 1:1.');
    requireSignature(picked.rows, sig, 3, '1 on 1');
    return picked.rows.map(row => {
      const idx = buildIndex(row);
      const g = (...c) => pick(row, idx, c);
      return {
        lider: str(g('Líder/Participante')),
        lider_email: str(g('E-mail (Líder/Participante)')),
        lider_departamento: str(g('Departamento (Líder/Participante)')),
        lider_papel: str(g('Papel (Líder/Participante)')),
        liderado: str(g('Liderado/Participante')),
        liderado_email: str(g('Email (Líderado/Participante)', 'Email (Liderado/Participante)')),
        liderado_matricula: str(g('Matrícula (Líderado/Participante)', 'Matrícula (Liderado/Participante)')),
        unidade: null,
        departamento: str(g('Departamento (Liderado/Participante)', 'Departamento (Líderado/Participante)')),
        liderado_papel: str(g('Papel (Liderado/Participante)', 'Papel (Líderado/Participante)')),
        relacao: str(g('Relação entre os participantes')),
        categoria: str(g('Categoria')),
        data_agendada: toISODate(g('Data agendada')),
        data_realizada: toISODate(g('Data realizada')),
        status: str(g('Status')),
        topicos_lider: str(g('Tópicos (Líder/Participante)')),
        topicos_liderado: str(g('Tópicos (Liderado/Participante)', 'Tópicos (Líderado/Participante)')),
        anotacoes_lider: str(g('Anotações Privadas (Líder/Participante)')),
        anotacoes_liderado: str(g('Anotações Privadas (Liderado/Participante)', 'Anotações Privadas (Líderado/Participante)')),
        acoes_ativas_lider: str(g('Ações Ativas (Líder/Participante)')),
        acoes_concluidas_lider: str(g('Ações Concluídas (Líder/Participante)')),
        acoes_ativas_liderado: str(g('Ações Ativas (Liderado/Participante)', 'Ações Ativas (Líderado/Participante)')),
        acoes_concluidas_liderado: str(g('Ações Concluídas (Liderado/Participante)', 'Ações Concluídas (Líderado/Participante)'))
      };
    }).filter(r => r.lider || r.liderado);
  }

  // ---------------------------------------------------------------------
  // 20. Celebrações.xlsx (aba "Worksheet" — ignora abas de tabela dinâmica)
  // ---------------------------------------------------------------------
  function parseCelebracoes(wb) {
    const sig = ['Colaborador enviou', 'Colaboradores que receberam', 'Mensagem', 'Quantidade de curtidas', 'Data'];
    const picked = pickSheet(wb, sig, { preferName: 'Worksheet' });
    if (!picked) throw new Error('Não encontrei dados na planilha de Celebrações.');
    requireSignature(picked.rows, sig, 3, 'Celebrações');
    return picked.rows.map(row => {
      const idx = buildIndex(row);
      const g = (...c) => pick(row, idx, c);
      return {
        codigo: str(g('Código')),
        colaborador_enviou: str(g('Colaborador enviou')),
        unidade: str(g('Unidade')),
        departamento: str(g('Departamento')),
        papel: str(g('Papel')),
        cargo_enviou: str(g('Cargo do colaborador que enviou')),
        colaboradores_receberam: str(g('Colaboradores que receberam')),
        cargo_recebeu: str(g('Cargo do colaborador que recebeu')),
        mensagem: str(g('Mensagem')),
        curtidas: intOrNull(g('Quantidade de curtidas')),
        comentarios: intOrNull(g('Quantidade de comentários')),
        data: toISODate(g('Data'))
      };
    }).filter(r => r.colaborador_enviou);
  }

  // A planilha "34. Nova Entrevista de Desligamento.xlsx" não é mais
  // enviada por upload — entrevista_pesquisa/entrevista_solicitacao viraram
  // só o arquivo histórico (importado uma única vez via SQL, ver
  // import-historico-entrevista-desligamento.sql), e os dados novos vêm do
  // link público de entrevista (js/entrevista-desligamento-publico.js), que
  // grava direto em entrevistas_desligamento — ver
  // js/metrics-indicadores.js (entrevistaMetrics já lê as duas fontes).

  // ---------------------------------------------------------------------
  // 27. Twygo.xlsx — participantes/matrículas (nível inscrição)
  // ---------------------------------------------------------------------
  function parseTwygoParticipantes(wb) {
    const sig = ['ID do conteúdo', 'Título do conteúdo', 'Nome', 'Sobrenome', 'E-mail', 'Progresso', 'Situação da Inscrição'];
    const picked = pickSheet(wb, sig);
    if (!picked) throw new Error('Não encontrei dados na planilha de participantes do Twygo.');
    requireSignature(picked.rows, sig, 4, 'Twygo - Participantes');
    // Segunda leitura da mesma aba em modo texto formatado, só pra pegar
    // "Carga horária" sem o bug de conversão de data/duração do SheetJS
    // (ver parseDuracaoTexto). Mesma ordem de linhas garantida pelo SheetJS.
    const textRows = XLSX.utils.sheet_to_json(wb.Sheets[picked.name], { defval: '', raw: false });
    return picked.rows.map((row, i) => {
      const idx = buildIndex(row);
      const g = (...c) => pick(row, idx, c);
      const textRow = textRows[i] || {};
      const textIdx = buildIndex(textRow);
      const cargaTexto = pick(textRow, textIdx, ['Carga horária', 'Carga Horária do conteúdo']);
      // O export real do Twygo (relatório "Participantes", modelo Inscrições)
      // vem com "Nome" e "Sobrenome" em colunas separadas, sem nenhuma coluna
      // "Nome completo" — junta os dois pro indicador não ficar com o nome
      // partido. Mantém "Nome completo" como alternativa caso algum export
      // diferente venha com as duas partes já combinadas numa coluna só.
      const nomeCompleto = str(g('Nome completo')) || [str(g('Nome')), str(g('Sobrenome'))].filter(Boolean).join(' ') || null;
      return {
        content_id: str(g('ID do conteúdo')),
        content_title: str(g('Título do conteúdo')),
        content_type: str(g('Tipo do conteúdo')),
        nome_completo: nomeCompleto,
        email: str(g('E-mail')),
        unidade: str(g('Empresa')),
        departamento: str(g('Área')),
        cargo: str(g('Cargo')),
        data_inscricao: toISODate(g('Data de inscrição')),
        ultimo_acesso: toISODate(g('Último Acesso')),
        situacao_inscricao: str(g('Situação da Inscrição')),
        situacao: str(g('Situação')),
        situacao_ambiente: str(g('Situação no ambiente')),
        progresso: num(g('Progresso')),
        nota: num(g('Nota / Média Geral')),
        frequencia: num(g('Frequência')),
        pontuacao: num(g('Pontuação')),
        carga_horaria: parseDuracaoTexto(cargaTexto),
        emitido_em: toISODate(g('Emitido em')),
        // Data em que a inscrição chegou a 100% e data de aprovação: dão a série
        // de conclusões e horas concluídas por mês (supabase-treinamentos.sql).
        concluido_em: toISODate(g('Conclusão 100%')),
        aprovado_em: toISODate(g('Data de Aprovação'))
      };
    }).filter(r => r.nome_completo || r.email);
  }

  // ---------------------------------------------------------------------
  // 27.1. Twygo usuários.xlsx (nível pessoa)
  // ---------------------------------------------------------------------
  function parseTwygoUsuarios(wb) {
    const sig = ['Nome completo', 'E-mail', 'Pontuação', 'Progresso', 'Situação', 'Registrado em'];
    const picked = pickSheet(wb, sig);
    if (!picked) throw new Error('Não encontrei dados na planilha de usuários do Twygo.');
    requireSignature(picked.rows, sig, 4, 'Twygo - Usuários');
    return picked.rows.map(row => {
      const idx = buildIndex(row);
      const g = (...c) => pick(row, idx, c);
      return {
        twygo_id: str(g('Id')),
        nome_completo: str(g('Nome completo')),
        email: str(g('E-mail')),
        cpf: str(g('CPF')),
        ultimo_acesso: toISODate(g('Último acesso em')),
        perfil: str(g('Perfil')),
        pontuacao: num(g('Pontuação')),
        progresso: num(g('Progresso')),
        situacao: str(g('Situação')),
        registrado_em: toISODate(g('Registrado em')),
        cargo: str(g('Cargo')),
        unidade: str(g('Empresa')),
        departamento: str(g('Área'))
      };
    }).filter(r => r.nome_completo || r.email);
  }

  // ---------------------------------------------------------------------
  // 27.1. Twygo conteúdos.xlsx (nível curso/trilha)
  // ---------------------------------------------------------------------
  function parseTwygoConteudos(wb) {
    const sig = ['Nome', 'Tipo', 'Inscrições', 'Progresso', 'Situação', 'Código do Conteúdo'];
    const picked = pickSheet(wb, sig);
    if (!picked) throw new Error('Não encontrei dados na planilha de conteúdos do Twygo.');
    requireSignature(picked.rows, sig, 3, 'Twygo - Conteúdos');
    return picked.rows.map(row => {
      const idx = buildIndex(row);
      const g = (...c) => pick(row, idx, c);
      return {
        codigo_conteudo: str(g('Código do Conteúdo')),
        tipo: str(g('Tipo')),
        nome: str(g('Nome')),
        situacao: str(g('Situação')),
        inscricoes: intOrNull(g('Incrições', 'Inscrições')),
        carga_horaria: num(g('Carga Horária (Horas)')),
        progresso: num(g('Progresso')),
        categorias: str(g('Categorias')),
        data_inicio: toISODate(g('Data de início')),
        data_termino: toISODate(g('Data de término')),
        criado_em: toISODate(g('Criado em')),
        publicado_em: toISODate(g('Publicado em'))
      };
    }).filter(r => r.nome);
  }

  // ---------------------------------------------------------------------
  // 28. Avaliação da Experiência (AVE 45 DIAS.xlsx / AVE 90 DIAS.xlsx)
  // ---------------------------------------------------------------------
  // Cada planilha tem 2 abas: "Respostas da avaliação" (formato LONGO — uma
  // linha por colaborador × competência × tipo de avaliação, com nota 1-4 e
  // comentário) e "Ações Feitas" (adesão — uma linha por ação esperada:
  // autoavaliação do colaborador / avaliação do gestor, com o status "Realizou"
  // ou "Não realizou"). Aqui as duas são consolidadas em UMA LINHA POR
  // COLABORADOR AVALIADO, que é o formato guardado no Supabase (~1,5 mil
  // linhas por ciclo em vez de ~15 mil): as notas e os comentários por
  // competência ficam em colunas JSON.
  function normNome(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  // "Data da resposta" vem como DD-MM-AAAA, "Data de admissão" como
  // AAAA-MM-DD hh:mm:ss (texto) ou como DD/MM/AAAA na aba de Ações — nenhum
  // desses é o MM/DD/AAAA (formato americano) que toISODate assume.
  function toISODateAve(v) {
    if (v === undefined || v === null || v === '') return null;
    if (v instanceof Date || typeof v === 'number') return toISODate(v);
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return null;
  }

  const AVE_ABA_RESPOSTAS = 'Respostas da avaliação';
  const AVE_ABA_ACOES = 'Ações Feitas';

  function pickAveSheet(wb, nomeAba, sig, minMatches) {
    let rows = null;
    for (const name of wb.SheetNames) {
      if (normHeader(name) === normHeader(nomeAba)) { rows = sheetToRows(wb.Sheets[name]); break; }
    }
    if (!rows) {
      const picked = pickSheet(wb, sig);
      rows = picked ? picked.rows : null;
    }
    requireSignature(rows, sig, minMatches, 'Avaliação da Experiência (aba "' + nomeAba + '")');
    return rows;
  }

  function parseAveExperiencia(wb, ciclo) {
    const respostas = pickAveSheet(wb, AVE_ABA_RESPOSTAS,
      ['Nome', 'Competência', 'Tipo de Avaliação', 'Status', 'Nota', 'Data da resposta', 'Unidade no Ciclo'], 5);
    const acoes = pickAveSheet(wb, AVE_ABA_ACOES,
      ['Nome do participante', 'Ação do participante', 'Status da ação do participante', 'Nome do avaliado'], 3);

    const pessoas = new Map();
    function pessoa(nome, admISO) {
      const key = normNome(nome) + '|' + (admISO || '');
      if (!pessoas.has(key)) {
        pessoas.set(key, {
          pessoa_key: key, ciclo, cpf: null, matricula: null, nome: str(nome), cargo: null, papel: null,
          unidade: null, departamento: null, gestor: null, gestor_direto: null, gestor_avaliador: null,
          data_admissao: admISO || null, data_avaliacao: null, data_autoavaliacao: null,
          status_gestor: null, status_auto: null, martelo: null, martelo_comentario: null,
          // Sempre presentes (mesmo em quem só aparece na aba "Ações Feitas",
          // sem nenhuma resposta): as colunas são NOT NULL no banco, e o
          // insert em lote do supabase-js manda null pra chave ausente.
          notas_gestor: {}, notas_auto: {}, comentarios_gestor: {}, comentarios_auto: {},
          _slots: { gestor: new Map(), auto: new Map() }, _acaoGestor: null, _acaoAuto: null
        });
      }
      return pessoas.get(key);
    }
    function preencher(p, campo, valor) {
      const v = str(valor);
      if (v && !p[campo]) p[campo] = v;
    }
    function papelAve(v) {
      const s = normHeader(v);
      if (s.startsWith('admin')) return 'Admin';
      if (s.startsWith('gestor')) return 'Gestor';
      if (s.startsWith('colaborador')) return 'Colaborador';
      return str(v);
    }

    for (const row of respostas) {
      const idx = buildIndex(row);
      const g = (...c) => pick(row, idx, c);
      const nome = g('Nome');
      if (!str(nome)) continue;
      const p = pessoa(nome, toISODateAve(g('Data de admissão')));
      preencher(p, 'cpf', g('Cpf')); preencher(p, 'matricula', g('Matrícula'));
      preencher(p, 'cargo', g('Cargo no Ciclo')); preencher(p, 'unidade', g('Unidade no Ciclo'));
      preencher(p, 'departamento', g('Departamento no Ciclo'));
      preencher(p, 'gestor', g('Gestor(es) na avaliação')); preencher(p, 'gestor_direto', g('Gestor direto atual'));
      if (!p.papel) p.papel = papelAve(g('Papel'));

      const tipo = normHeader(g('Tipo de Avaliação'));
      const lado = tipo === 'autoavaliação' ? 'auto' : tipo === 'avaliação do gestor' ? 'gestor' : null;
      const comp = str(g('Competência'));
      if (!lado || !comp) continue;
      const concluida = normHeader(g('Status')).startsWith('conclu');
      const nota = intOrNull(g('Nota'));
      const data = toISODateAve(g('Data da resposta'));
      const slot = p._slots[lado];
      const atual = slot.get(comp);
      const melhor = !atual
        || (concluida && !atual.concluida)
        || (concluida === atual.concluida && (data || '') > (atual.data || ''));
      if (melhor) slot.set(comp, { concluida, nota, data, feedback: str(g('Feedback')) });
    }

    const MARTELO = 'batendo o martelo';
    for (const p of pessoas.values()) {
      for (const lado of ['gestor', 'auto']) {
        const notas = {}, coment = {};
        let ultima = null, temRascunho = false, temConcluida = false;
        for (const [comp, s] of p._slots[lado]) {
          if (!s.concluida) { temRascunho = true; continue; }
          if (s.nota === null || s.nota < 1 || s.nota > 4) continue;
          temConcluida = true;
          if (s.data && (!ultima || s.data > ultima)) ultima = s.data;
          if (lado === 'gestor' && normHeader(comp).startsWith(MARTELO)) {
            p.martelo = s.nota;
            if (s.feedback) p.martelo_comentario = s.feedback.slice(0, 1500);
            continue;
          }
          notas[comp] = s.nota;
          if (s.feedback) coment[comp] = s.feedback.slice(0, 1500);
        }
        if (lado === 'gestor') {
          p.notas_gestor = notas; p.comentarios_gestor = coment; p.data_avaliacao = ultima;
          p.status_gestor = temConcluida ? 'concluida' : temRascunho ? 'rascunho' : null;
        } else {
          p.notas_auto = notas; p.comentarios_auto = coment; p.data_autoavaliacao = ultima;
          p.status_auto = temConcluida ? 'concluida' : temRascunho ? 'rascunho' : null;
        }
      }
    }

    for (const row of acoes) {
      const idx = buildIndex(row);
      const g = (...c) => pick(row, idx, c);
      const acao = normHeader(g('Ação do participante'));
      const status = normHeader(g('Status da ação do participante'));
      const feita = status.startsWith('realizou');
      if (acao.startsWith('autoavalia')) {
        const p = pessoa(g('Nome do participante'), toISODateAve(g('Data de admissão do participante')));
        preencher(p, 'cpf', g('CPF do participante')); preencher(p, 'matricula', g('Matrícula do participante'));
        preencher(p, 'cargo', g('Cargo do participante no ciclo')); preencher(p, 'unidade', g('Unidade do participante no ciclo'));
        preencher(p, 'departamento', g('Departamento do participante no Ciclo'));
        preencher(p, 'gestor', g('Gestor(es) do participante na avaliação')); preencher(p, 'gestor_direto', g('Gestor direto atual do participante'));
        if (!p.papel) p.papel = papelAve(g('Papel do participante no ciclo'));
        p._acaoAuto = feita ? 'concluida' : 'pendente';
      } else if (acao.startsWith('avaliação como gestor')) {
        const p = pessoa(g('Nome do avaliado'), toISODateAve(g('Data de admissão do avaliado')));
        preencher(p, 'unidade', g('Unidade do avaliado')); preencher(p, 'departamento', g('Departamento do avaliado'));
        preencher(p, 'gestor_avaliador', g('Nome do participante'));
        p._acaoGestor = feita ? 'concluida' : 'pendente';
      }
    }

    const rows = [];
    for (const p of pessoas.values()) {
      if (!p.status_gestor) p.status_gestor = p._acaoGestor;
      if (!p.status_auto) p.status_auto = p._acaoAuto;
      delete p._slots; delete p._acaoGestor; delete p._acaoAuto;
      if (p.nome) rows.push(p);
    }
    rows.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    return rows;
  }

  // ---------------------------------------------------------------------
  function readWorkbook(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
          resolve(wb);
        } catch (err) {
          reject(new Error('Não consegui ler este arquivo como planilha Excel (.xlsx).'));
        }
      };
      reader.onerror = () => reject(new Error('Falha ao carregar o arquivo.'));
      reader.readAsArrayBuffer(file);
    });
  }

  window.HUB_PARSERS = {
    readWorkbook,
    parseColaboradores,
    parseFeedbacks,
    parseOneOnOne,
    parseCelebracoes,
    parseTwygoParticipantes,
    parseTwygoUsuarios,
    parseTwygoConteudos,
    parseAveExperiencia,
    _internal: { corrigirMotivoDesligamento, normHeader, toISODate, num, str, intOrNull, parseDuracaoTexto }
  };
})();
