(function(root){
  'use strict';
  const competencies=['Criatividade e Inovação','Empreendedorismo','Relacionamento Interpessoal','Autodesenvolvimento','Tomada de Decisão','Trabalho em Equipe','Automotivação','Negociação','Orientação ao Cliente','Comunicação Oral','Visão Sistêmica','Flexibilidade','Gestão de Conflitos','Liderança','Organização','Orientação à Qualidade','Capacidade de Trabalhar sob Pressão','Comunicação Escrita','Orientação ao Resultado','Planejamento'];
  const values=['GENTE QUE GOSTA DE GENTE','#SOMOS TODOS SFERA','TÁ ESPERANDO O QUE?','MÃO NA MASSA','ABERTO AO NOVO','PAIXÃO PELO NEGÓCIO'];
  const schwartz=['Altruísmo','Auto determinação (líder de si mesmo / autonomia)','Universalidade','Hedonismo','Poder','Tradição','Conformidade','Desempenho competente (ambição)','Estimulação','Segurança'];
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
  const pattern=s=>norm(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/ /g,'\\s*');
  function parse(pages){
    const all=pages.join('\n'),text=norm(all),first=norm(pages[0]);
    const read=(name,scope=text)=>{const m=scope.match(new RegExp(pattern(name)+'\\s*(\\d{1,3})\\s*%'));return m&&+m[1]<=100?+m[1]:null;};
    const table=(names,scope=text)=>names.map(name=>({name,score:read(name,scope)}));
    const score=label=>{const m=first.match(new RegExp('(\\d{1,3})\\s*%\\s*'+pattern(label)));return m&&+m[1]<=100?+m[1]:null;};
    const completed=text.match(/COMPLETADO\s+(\d{1,2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{2,4})/);
    const months=['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
    const completedDate=completed?`${completed[3].length===2?'20':''}${completed[3]}-${String(months.indexOf(completed[2])+1).padStart(2,'0')}-${completed[1].padStart(2,'0')}`:'';
    const candidate=pages[0].split('\n').map(x=>x.trim()).find(x=>x.length>5&&!/^[\d\W]+$/.test(x))||'';
    const valuesScope=text.split('VALORES DA EMPRESA')[1]?.split('VALORES DE SCHWARTZ')[0]||'';
    const schwartzScope=text.split('VALORES DE SCHWARTZ').slice(1).join(' ');
    const roleMatch=(first.split('COMPETENCIAS COMPORTAMENTAIS')[1]||'').match(/\b1\s+(.+?)\s+(\d{1,3})\s*%\s*(\d{1,3})\s*%/);
    const report={candidate,completedDate,behavioral:score('ADERÊNCIA COMPORTAMENTAL'),valuesScore:score('ADERÊNCIA VALORES'),final:score('ADERÊNCIA FINAL'),competencies:table(competencies),values:table(values,valuesScope),schwartz:table(schwartz,schwartzScope),configChanged:/CONFIGURACAO DAS COMPETENCIAS FOI ALTERADA/.test(text)};
    const cpf=all.match(/CPF\s*([\d.\- ]{11,18})/i)?.[1].replace(/\D/g,'')||'';
    report.behavioralRole=roleMatch?.[1]||'';report.desired=roleMatch?+roleMatch[2]:null;
    return {report,cpf,recognized:/FIT\s*CULTURAL/.test(text),missing:[report.behavioral,report.valuesScore,report.final,...report.competencies.map(x=>x.score),...report.values.map(x=>x.score),...report.schwartz.map(x=>x.score)].filter(x=>x==null).length};
  }
  function guidance(report){
    const ranked=report.competencies.filter(x=>x.score!=null).slice().sort((a,b)=>b.score-a.score);
    const practices={
      'PLANEJAMENTO':'Combinar três prioridades por turno, prazo e responsável; revisar os combinados com uma pessoa de referência.',
      'ORIENTACAO AO RESULTADO':'Escolher um objetivo concreto de aprendizagem ou atendimento e acompanhar o progresso em conversas curtas.',
      'COMUNICACAO ESCRITA':'Praticar mensagens de atendimento e registros de loja com exemplos, modelos e devolutiva sobre clareza.',
      'CAPACIDADE DE TRABALHAR SOB PRESSAO':'Ensaiar situações de maior movimento e combinar quando pedir apoio, como priorizar e a quem recorrer.',
      'ORIENTACAO A QUALIDADE':'Usar um checklist de conferência do atendimento e dos processos; revisar exemplos junto com a liderança.',
      'ORGANIZACAO':'Definir uma rotina simples para materiais, pendências e passagem de turno, conferida em conjunto.',
      'COMUNICACAO ORAL':'Praticar abordagens e explicações de produtos em simulações curtas, com retorno objetivo.',
      'GESTAO DE CONFLITOS':'Combinar uma forma de escutar, esclarecer a situação e buscar apoio da liderança em divergências.'
    };
    const development=ranked.slice(-5).reverse();
    return {strengths:ranked.slice(0,3),development,practices:development.map(row=>({name:row.name,text:practices[norm(row.name)]||'Escolher uma situação real relacionada a esta competência, combinar uma prática e retomar exemplos no próximo encontro.'})),journey:[
      {milestone:30,text:'Combinar uma rotina de integração com prioridades claras, roteiro de atendimento e apoio de uma pessoa de referência. Explorar exemplos das competências com maior aderência no relatório.'},
      {milestone:75,text:'Revisar situações reais de loja, combinar uma prática de desenvolvimento por vez e verificar quais orientações e recursos ajudaram no trabalho.'},
      {milestone:120,text:'Retomar os combinados, comparar exemplos observados ao longo da jornada e construir com a pessoa o próximo plano de desenvolvimento.'}
    ]};
  }
  function identity(candidate,reportCpf,employeeName,employeeCpf){const cpf=String(employeeCpf||'').replace(/\D/g,'');if(cpf&&reportCpf&&cpf!==reportCpf)throw Error('O CPF do relatório não corresponde ao vínculo aberto. Nenhum dado foi salvo.');if(norm(candidate)!==norm(employeeName)&&!(cpf&&cpf===reportCpf))throw Error('O nome do relatório não corresponde à ficha aberta. Confira o documento antes de anexar.');return cpf&&reportCpf?'CPF conferido':'Nome conferido';}
  const api={parse,guidance,norm,identity};if(typeof module==='object'&&module.exports)module.exports=api;else root.HUB_CONEXAO_FIT_CORE=api;
})(typeof window==='object'?window:globalThis);
