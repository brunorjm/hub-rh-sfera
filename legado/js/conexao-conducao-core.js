(function(root){
  'use strict';
  const C=typeof module==='object'&&module.exports?require('./conexao-core.js'):HUB_CONEXAO_CORE;
  const guides={
    30:{title:'Primeiras impressões e integração',objective:'Entender a adaptação inicial, a clareza do papel, o apoio da liderança e os recursos necessários para trabalhar.',focus:['Integração e onboarding','Clareza de responsabilidades','Apoio da gestão e da equipe','Recursos, condições de trabalho e acolhimento'],phases:[
      ['Abertura e combinados',5,'Apresente o propósito do encontro. Combine respeito, escuta sem interrupções e confidencialidade. Convide cada pessoa a se apresentar.'],
      ['Termômetro da jornada',10,'Peça uma palavra que resuma os primeiros dias. Explore o que ajudou na integração e o que poderia ter sido diferente, sem identificar falas no consolidado.'],
      ['Roleta de perguntas',20,'Escolha quatro ou cinco temas, convide todos a participar e peça exemplos para compreender o contexto.'],
      ['Escuta aberta',10,'Abra espaço para dúvidas e sugestões ainda não abordadas. Acolha o que surgir e combine encaminhamentos possíveis.'],
      ['Fechamento e próximos passos',5,'Agradeça a participação. Explique o NPS, a síntese em até 48 horas e a devolutiva das ações em até 15 dias.']
    ],questions:[['Expectativa e realidade','O que está diferente do que você imaginava sobre o trabalho?'],['Clareza do papel','Você sabe o que se espera de você e a quem recorrer quando tem dúvida?'],['Suporte da liderança','Que apoio e orientação você tem recebido da gestão?'],['Integração com a equipe','O que ajudou você a se sentir parte do time?'],['Ferramentas e recursos','Quais recursos estão disponíveis e o que ainda faz falta?'],['Treinamento inicial','O que o onboarding preparou bem e o que precisa ser retomado?'],['Primeiros desafios','Qual foi o principal desafio e que apoio ajudaria?'],['Fatores de permanência','O que tem sido positivo na sua experiência até aqui?']]},
    75:{title:'Evolução da experiência e vínculo',objective:'Retomar os primeiros combinados, compreender a adaptação e identificar apoios e oportunidades que fortaleçam a experiência na equipe.',focus:['Evolução desde o primeiro encontro','Feedback e apoio da gestão','Pertencimento e cooperação','Reconhecimento e perspectivas de crescimento'],phases:[
      ['Abertura e retomada dos combinados',5,'Reforce as regras de escuta e confidencialidade. Convide cada pessoa a dizer como chega para este encontro.'],
      ['Retrospectiva e evolução',8,'Retome as necessidades identificadas no primeiro marco. Explore o que mudou, o que melhorou e o que continua desafiador.'],
      ['Termômetro da jornada',8,'Peça uma palavra sobre a experiência atual e explore as mudanças percebidas desde o início.'],
      ['Roleta de perguntas',20,'Selecione temas de vínculo, liderança, reconhecimento e crescimento, garantindo espaço para diferentes experiências.'],
      ['Escuta aberta',9,'Pergunte o que a empresa deve continuar fazendo e que apoio precisa começar a oferecer.'],
      ['Fechamento e próximos passos',5,'Recapitule os combinados e as ações que serão analisadas. Explique a síntese, o NPS e o próximo marco de 120 dias.']
    ],questions:[['Vínculo com a Sfera','O que faz você se sentir parte da empresa e da equipe?'],['Apoio da gestão','Você tem recebido feedback e sabe como está evoluindo?'],['Crescimento','Quais possibilidades de aprendizagem e crescimento você enxerga?'],['Fatores de permanência','O que contribui para você querer continuar aqui?'],['Desafios atuais','O que mais dificulta sua experiência e que apoio faria diferença?'],['Clima de equipe','Como estão a cooperação e o acolhimento no time?'],['Condições de trabalho','Que condições ajudam ou dificultam uma rotina de trabalho sustentável?'],['Reconhecimento','Como você percebe o reconhecimento do seu trabalho?']]},
    120:{title:'Desenvolvimento e continuidade da jornada',objective:'Revisitar a evolução no ciclo, identificar interesses de desenvolvimento e combinar os próximos passos com RH, T&D e liderança.',focus:['Retrospectiva do ciclo','Competências e interesses de aprendizagem','Expectativas de desenvolvimento e carreira','Apoios e continuidade do acompanhamento'],phases:[
      ['Abertura e conquistas',5,'Convide cada pessoa a compartilhar uma conquista do período e apresente o objetivo de encerrar o ciclo com próximos passos claros.'],
      ['Retrospectiva do ciclo',10,'Explore aprendizados e mudanças desde a admissão e retome os apoios combinados nos encontros anteriores.'],
      ['Mapa de competências',15,'Peça que cada pessoa indique habilidades que deseja desenvolver. Relacione os interesses a situações reais de trabalho e apoios possíveis.'],
      ['Visão de futuro',12,'Converse sobre expectativas para os próximos meses, possibilidades conhecidas e informações que ainda precisam ser esclarecidas.'],
      ['Escuta aberta',8,'Abra uma última rodada de sugestões e pontos que precisam de continuidade.'],
      ['Fechamento do ciclo',5,'Agradeça a participação, explique como os combinados serão encaminhados e mantenha o canal de RH disponível após o ciclo.']
    ],questions:[['Evolução','Qual foi a principal evolução que você percebe desde o primeiro dia?'],['Aprendizados','O que você aprendeu e que prática ajudou nesse aprendizado?'],['Competências','Que habilidades você gostaria de desenvolver e por quê?'],['Apoios de desenvolvimento','Que apoio, prática ou treinamento ajudaria nos próximos passos?'],['Expectativas de futuro','Que desafios e possibilidades de crescimento fazem sentido para você?'],['Alinhamento','Que informações sobre desenvolvimento e carreira precisam ser esclarecidas?'],['Continuidade','O que precisa continuar sendo acompanhado após este ciclo?']]}
  };
  const textFields=['summary','thermometer','strengths','opportunities','requests','openListening','nextSteps'];
  const clean=(value,max=4000)=>String(value||'').trim().slice(0,max);
  function guide(milestone,duration=45){const source=guides[milestone];if(!source)return null;const total=source.phases.reduce((sum,p)=>sum+p[1],0),alloc=source.phases.map((p,i)=>({title:p[0],minutes:Math.floor(duration*p[1]/total),text:p[2],fraction:duration*p[1]/total%1,index:i}));let remaining=duration-alloc.reduce((sum,p)=>sum+p.minutes,0);for(const p of [...alloc].sort((a,b)=>b.fraction-a.fraction||a.index-b.index)){if(remaining--<=0)break;p.minutes++;}return {...source,phases:alloc,source:'Guia do Facilitador Conexão RH · versão 1.0, janeiro/2026',adaptation:'Roteiro adaptado aos marcos 30/75/120 e ao tempo da turma. O guia original contém referências divergentes a 70/180 dias.'};}
  function lastAttendance(events,session,employee){return events.filter(e=>e.session===session.id&&e.stage===employee+':'+session.milestone).at(-1)?.type||'';}
  function executionDraft(session,employees,events=[],existing){
    const valid=session.participants.map(k=>employees.find(e=>e.key===k)).filter(Boolean);
    const roster=valid.map(e=>({key:e.key,name:e.name,unit:e.unit,department:e.department,role:e.role,manager:e.manager,admission:e.admission,attendance:existing?.roster.find(p=>p.key===e.key)?.attendance||lastAttendance(events,session,e.key),agreement:existing?.roster.find(p=>p.key===e.key)?.agreement||''}));
    return {session:session.id,milestone:session.milestone,date:existing?.date||session.date,time:existing?.time||session.time,duration:existing?.duration||session.duration,facilitator:existing?.facilitator||session.facilitator,status:existing?.status||'draft',roster,checklist:existing?.checklist||[],...Object.fromEntries(textFields.map(k=>[k,existing?.[k]||'']))};
  }
  function validateExecution(execution,session,{today=C.today(),time='23:59',final=false}={}){
    const errors=[];if(session.cancelled)errors.push('Uma turma cancelada não pode receber execução.');
    if(!execution.roster.length)errors.push('A turma precisa de colaboradores no cadastro atual.');
    if(execution.session!==session.id||execution.milestone!==session.milestone||new Set(execution.roster.map(p=>p.key)).size!==execution.roster.length||execution.roster.some(p=>!session.participants.includes(p.key)))errors.push('A execução não corresponde aos participantes e ao marco da turma.');
    if(!guide(execution.milestone,execution.duration))errors.push('O roteiro de condução contempla os marcos de 30, 75 e 120 dias.');
    if(!C.date(execution.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(execution.time||''))errors.push('Informe uma data e um horário válidos.');
    if(C.date(execution.date)&&execution.roster.some(p=>p.admission&&execution.date<p.admission))errors.push('A execução não pode ocorrer antes da admissão de um participante.');
    if(!Number.isInteger(execution.duration)||execution.duration<15||execution.duration>180)errors.push('Informe duração entre 15 e 180 minutos.');
    if(!clean(execution.facilitator,100))errors.push('Informe quem conduziu o encontro.');
    if(execution.roster.some(p=>p.attendance&&!['presente','faltou'].includes(p.attendance)))errors.push('Revise os registros de presença.');
    if(final){
      if(execution.date>today)errors.push('Finalize apenas encontros já realizados.');
      if(execution.date===today&&execution.time){const end=+execution.time.slice(0,2)*60+ +execution.time.slice(3)+execution.duration,now=+time.slice(0,2)*60+ +time.slice(3);if(end>now)errors.push('Aguarde o término do encontro para finalizar.');}
      if(execution.roster.some(p=>!['presente','faltou'].includes(p.attendance)))errors.push('Informe a participação de todos os colaboradores da turma.');
      if(!execution.roster.some(p=>p.attendance==='presente'))errors.push('Sem participantes presentes, registre as faltas e reagende a turma; não finalize como realizada.');
      if(!clean(execution.summary))errors.push('Registre a síntese da condução para gerar o relatório.');
    }
    return [...new Set(errors)];
  }
  function reportFrom(execution,id,now){return {id,session:execution.session,milestone:execution.milestone,date:execution.date,time:execution.time,duration:execution.duration,facilitator:execution.facilitator,units:[...new Set(execution.roster.filter(p=>p.attendance==='presente').map(p=>p.unit))],scope:execution.roster.map(({key,name,unit,department,manager})=>({key,name,unit,department,manager})),present:execution.roster.filter(p=>p.attendance==='presente').length,absent:execution.roster.filter(p=>p.attendance==='faltou').length,fields:Object.fromEntries(textFields.map(k=>[k,clean(execution[k])])),status:'draft',created:now,updated:now,summaryDue:C.add(execution.date,2),feedbackDue:C.add(execution.date,15)};}
  function finalize(data,session,execution,{id,now,today,time}){
    if(data.executions.some(x=>x.session===session.id&&x.status==='final'))throw Error('A execução desta turma já foi finalizada.');
    const errors=validateExecution(execution,session,{today,time,final:true});if(errors.length)throw Error(errors.join(' '));
    const completed={...structuredClone(execution),status:'final',finalizedAt:now},report=reportFrom(completed,id,now);
    data.executions=data.executions.filter(x=>x.session!==session.id).concat(completed);
    for(const person of completed.roster)data.events.push({id:id+':'+person.key+':'+now,session:session.id,stage:person.key+':'+session.milestone,type:person.attendance,date:execution.date,created:now});
    data.reports=data.reports.filter(r=>r.session!==session.id).concat(report);return report;
  }
  function reportMatches(report,filters,committees=[]){return report.scope.some(p=>C.matchesEmployee(p,filters))&&(C.inPeriod(report.date,filters)||committees.some(c=>c.report===report.id&&C.inPeriod(c.date,filters)));}
  function validateCommittee(value,report,others=[],{today=C.today()}={}){
    const errors=[];if(report.status!=='ready')errors.push('Revise e marque o relatório como pronto antes de agendar o comitê.');
    if(!C.date(value.date)||value.date<today||value.date<report.date)errors.push('Agende o comitê para uma data atual ou futura, após o encontro.');
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time||''))errors.push('Informe um horário válido.');
    if(!Number.isInteger(value.duration)||value.duration<15||value.duration>180)errors.push('Informe duração de 15 a 180 minutos.');
    for(const [key,label]of [['region','regional'],['rh','RH/DHO que conduziu o Conexão'],['td','multiplicadora de T&D'],['management','gestão regional']])if(!clean(value[key],150))errors.push('Informe '+label+'.');
    if(!value.units?.length||value.units.some(u=>!report.units.includes(u)))errors.push('Selecione as unidades contempladas pelo comitê.');
    if(value.link&&!/^https:\/\//i.test(value.link))errors.push('O link deve começar com https://.');
    const minutes=t=>Number(t?.slice(0,2))*60+Number(t?.slice(3));
    if(value.date===report.date&&minutes(value.time)<minutes(report.time)+report.duration)errors.push('O comitê deve ocorrer após o término do encontro.');
    for(const c of others.filter(c=>c.id!==value.id&&c.status==='scheduled'&&c.date===value.date)){if(minutes(value.time)<minutes(c.time)+c.duration&&minutes(c.time)<minutes(value.time)+value.duration&&[value.rh,value.td,value.management].some(name=>[c.rh,c.td,c.management].some(other=>C.norm(name)===C.norm(other))))errors.push('Há conflito de horário com outro comitê para um dos participantes.');}
    return [...new Set(errors)];
  }
  function saveCommittee(data,value,{today=C.today()}={}){const report=data.reports.find(r=>r.id===value.report),previous=data.committees.find(c=>c.id===value.id);if(!report)throw Error('Relatório não encontrado.');if(previous&&(previous.report!==value.report||previous.status==='done'))throw Error('Este comitê não pode ser alterado.');const errors=validateCommittee(value,report,data.committees,{today});if(errors.length)throw Error(errors.join(' '));data.committees=data.committees.filter(c=>c.id!==value.id).concat({plan:[],decisions:'',...previous,...structuredClone(value)});}
  function completeCommittee(data,id,decisions,plan,{today=C.today(),time='23:59',now,actionId}){const c=data.committees.find(c=>c.id===id);if(!c||c.status!=='scheduled')throw Error('O comitê não está disponível para conclusão.');const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));if(c.date>today||c.date===today&&minutes(c.time)+c.duration>minutes(time))throw Error('Conclua o comitê após o horário da reunião.');if(!clean(decisions))throw Error('Registre as decisões do comitê.');if(plan.some(a=>!clean(a.title,180)||!clean(a.owner,100)||!C.date(a.due)||a.due<c.date))throw Error('Complete cada ação com responsável e prazo a partir da data do comitê.');const normalized=plan.map(a=>({title:clean(a.title,180),owner:clean(a.owner,100),due:a.due}));Object.assign(c,{status:'done',decisions:clean(decisions),plan:normalized,completedAt:now});for(const action of normalized)data.actions.push({...action,id:actionId(),session:c.session,committee:c.id,report:c.report,done:false,created:now});}
  function recordFeedback(data,id,feedback,{today=C.today()}={}){const c=data.committees.find(c=>c.id===id);if(!c||c.status!=='done'||c.feedback)throw Error('Conclua o comitê antes de registrar uma nova devolutiva.');if(!C.date(feedback.date)||feedback.date<c.date||feedback.date>today||!clean(feedback.channel,100)||!clean(feedback.message))throw Error('Informe uma comunicação realizada após o comitê, com canal e síntese, sem data futura.');c.feedback={...feedback,channel:clean(feedback.channel,100),message:clean(feedback.message)};}
  const journeyColumns=[
    {id:'scheduled',title:'Agendada',hint:'Preparar e realizar o encontro'},
    {id:'report',title:'Relatório em preparação',hint:'Revisar a síntese da execução'},
    {id:'waiting',title:'Aguardando comitê',hint:'Definir a reunião regional'},
    {id:'committee',title:'Comitê agendado',hint:'Realizar e registrar as decisões'},
    {id:'feedback',title:'Devolutiva e ações',hint:'Comunicar e acompanhar os compromissos'},
    {id:'done',title:'Concluída',hint:'Devolutivas e ações finalizadas'}
  ];
  function journeyStage(session,data){
    if(session.cancelled)return 'cancelled';
    const execution=data.executions.find(e=>e.session===session.id&&e.status==='final');
    const report=data.reports.find(r=>r.session===session.id);
    if(!execution&&!report)return 'scheduled';
    if(!report||report.status!=='ready')return 'report';
    const committees=data.committees.filter(c=>c.report===report.id);
    if(!committees.length)return 'waiting';
    if(committees.some(c=>c.status!=='done'))return 'committee';
    const covered=new Set(committees.flatMap(c=>c.units||[]));
    if(report.units.some(u=>!covered.has(u)))return 'waiting';
    if(committees.some(c=>!c.feedback)||data.actions.some(a=>(a.session===session.id||a.report===report.id)&&!a.done))return 'feedback';
    return 'done';
  }
  function journeyScope(data,employees,filters={}){
    const matching=C.scopeSessions(data.sessions,employees,filters).matching;
    const visible=matching.filter(s=>C.sessionInPeriod(s,filters)||data.reports.some(r=>r.session===s.id&&reportMatches(r,filters,data.committees))||data.actions.some(a=>a.session===s.id&&C.inPeriod(a.due,filters))||data.executions.some(e=>e.session===s.id&&C.inPeriod(e.date,filters)));
    return {matching,visible,outsidePeriod:matching.filter(s=>!visible.includes(s))};
  }
  const api={guide,textFields,clean,executionDraft,validateExecution,finalize,reportFrom,reportMatches,validateCommittee,saveCommittee,completeCommittee,recordFeedback,journeyColumns,journeyStage,journeyScope};if(typeof module==='object'&&module.exports)module.exports=api;else root.HUB_CONEXAO_CONDUCAO_CORE=api;
})(typeof window==='object'?window:globalThis);
