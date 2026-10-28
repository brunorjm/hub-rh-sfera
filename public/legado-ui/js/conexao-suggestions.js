(function (root) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./conexao-core.js') : root.HUB_CONEXAO_CORE;
  function groupKey(employee) {
    if (/\bvd\b/.test(C.norm(employee.unit+' '+employee.department))) return 'vd';
    const unit=C.norm(employee.unit);
    return unit && unit!=='nao informada' ? 'unit:'+unit : 'unknown:'+employee.key;
  }
  function groupLabel(employee) {
    return groupKey(employee)==='vd' ? 'VD · unidades VD juntas' : employee.unit || 'Unidade não informada';
  }
  function sameGroup(participants, employee, employees) {
    return participants.every(key=>groupKey(employees.find(e=>e.key===key)||{key})===groupKey(employee));
  }
  function storeCount(participants, employee, employees) {
    return participants.filter(key=>{const member=employees.find(e=>e.key===key);return C.norm(member?.unit)===C.norm(employee.unit)&&C.norm(member?.department)===C.norm(employee.department);}).length;
  }
  function options(input, config, reference) {
    const value = { startDate: C.add(reference,7), startTime: C.sessionHours.start, minTimeToday: '00:00', facilitator: '', maxPerStore: config.capacity, maxPerDay: 4, horizon: 21, breakMinutes: 15, allowUrgent: true, ...input };
    if (!C.date(value.startDate) || value.startDate < reference) throw new Error('A data preferencial deve ser hoje ou posterior.');
    if (!/^\d{2}:\d{2}$/.test(value.startTime) || +value.startTime.slice(0,2)>23 || +value.startTime.slice(3)>59) throw new Error('Informe um horário válido.');
    if (!/^\d{2}:\d{2}$/.test(value.minTimeToday) || +value.minTimeToday.slice(0,2)>23 || +value.minTimeToday.slice(3)>59) throw new Error('Horário atual inválido.');
    if (!value.facilitator.trim()) throw new Error('Informe o facilitador.');
    for (const [key,min,max] of [['maxPerStore',1,config.capacity],['maxPerDay',1,8],['horizon',1,60],['breakMinutes',0,120]]) if (!Number.isInteger(value[key]) || value[key]<min || value[key]>max) throw new Error('Parâmetro inválido: '+key);
    if (config.duration < 15 || config.duration > 180) throw new Error('Para sugerir horários, use duração entre 15 e 180 minutos nas regras do programa.');
    const begin=+value.startTime.slice(0,2)*60 + +value.startTime.slice(3);
    if (begin < 10*60 || begin + config.duration > 16*60) throw new Error('O primeiro horário deve permitir uma turma completa entre 10h e 16h.');
    return value;
  }
  function generate(model, stages, input = {}) {
    const c = model.config, ref = model.reference, o = options(input,c,ref);
    const proposals = [], skipped = [], seen = new Set(), existing = (model.sessions || []).filter(s=>s.participants.some(k=>model.employees.some(e=>e.key===k)));
    const pool = [...stages].sort((a,b)=>a.end.localeCompare(b.end)||a.target.localeCompare(b.target)||a.employee.name.localeCompare(b.employee.name));
    const finalDate = C.add(o.startDate,o.horizon-1);
    const startMinute = +o.startTime.slice(0,2)*60 + +o.startTime.slice(3);
    const minutes = time => +time.slice(0,2)*60 + +time.slice(3);
    const fmt = value => String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');
    const weekday = value => ![0,6].includes(new Date(value+'T12:00:00Z').getUTCDay());
    for (const stage of pool) {
      const e=stage.employee;
      if (seen.has(e.key)) continue;
      seen.add(e.key);
      const skip = reason => skipped.push({ employee:e, milestone:stage.milestone, reason });
      if (!e.available) { skip('Disponibilidade do vínculo precisa ser confirmada.');continue; }
      if (stage.completed || stage.scheduled || stage.previousSession) { skip('Já possui turma ou precisa revisar um agendamento anterior.');continue; }
      const earliest=[ref,c.launchDate,stage.start].sort().at(-1);
      const latest=[stage.end,C.add(e.admission,c.maxEligibleAge),finalDate].sort()[0];
      if (earliest>latest) { skip('Sem data dentro da janela e do limite de '+c.maxEligibleAge+' dias.');continue; }
      const dates=[];
      for(let d=earliest;d<=latest;d=C.add(d,1)) if(weekday(d)) dates.push(d);
      const preferred=dates.filter(d=>d>=o.startDate), urgent=o.allowUrgent?dates.filter(d=>d<o.startDate):[];
      let placed=false;
      for (const day of [...preferred,...urgent]) {
        // Fill a compatible group before creating another one.
        for (const group of proposals.filter(p=>p.date===day&&p.milestone===stage.milestone&&p.initialThirty===!!stage.initialThirty&&p.participants.length<c.capacity&&p.groupKey===groupKey(e))) {
          if(storeCount(group.participants,e,model.employees)>=o.maxPerStore)continue;
          const candidate={...group,participants:[...group.participants,e.key]};
          if(C.sessionConflicts(candidate,[...existing,...proposals],c,model.employees).length)continue;
          group.participants.push(e.key);group.stageKeys.push(stage.key);placed=true;break;
        }
        if(placed)break;
        const occupied=[...existing,...proposals].filter(s=>!s.cancelled&&s.date===day&&C.norm(s.facilitator)===C.norm(o.facilitator));
        if(occupied.length>=o.maxPerDay)continue;
        for(let slot=0;slot<o.maxPerDay;slot++) {
          const begin=startMinute+slot*(c.duration+o.breakMinutes);
          if(begin+c.duration>16*60 || begin<10*60 || day===ref&&begin<=minutes(o.minTimeToday))continue;
          const candidate={id:'suggestion-'+(proposals.length+1),milestone:stage.milestone,initialThirty:!!stage.initialThirty,groupKey:groupKey(e),groupLabel:groupLabel(e),date:day,time:fmt(begin),duration:c.duration,facilitator:o.facilitator.trim(),mode:'Online',link:'',participants:[e.key],stageKeys:[stage.key],created:ref,shortNotice:C.days(ref,day)<7,beforePreferred:day<o.startDate};
          const tooClose=occupied.some(s=>begin<minutes(s.time)+s.duration+o.breakMinutes&&minutes(s.time)<begin+c.duration+o.breakMinutes);
          if(tooClose||C.sessionConflicts(candidate,[...existing,...proposals],c,model.employees).length)continue;
          proposals.push(candidate);placed=true;break;
        }
        if(placed)break;
      }
      if(!placed)skip('Sem vaga em dia útil e horário disponível dentro da janela. Revise a antecedência, o limite por loja ou a disponibilidade do facilitador.');
    }
    // Combine compatible small groups first, freeing facilitator slots.
    const byKey=new Map(pool.map(stage=>[stage.employee.key,stage]));
    let combined=true;
    while(combined) {
      combined=false;
      for(const source of [...proposals].sort((a,b)=>a.participants.length-b.participants.length)) {
        for(const target of [...proposals].filter(p=>p!==source&&p.milestone===source.milestone&&p.initialThirty===source.initialThirty&&p.groupKey===source.groupKey&&p.participants.length+source.participants.length<=c.capacity).sort((a,b)=>b.participants.length-a.participants.length)) {
          if(target.date<o.startDate&&!o.allowUrgent)continue;
          const candidate={...target,participants:[...target.participants,...source.participants]};
          if(!source.participants.every(key=>{const stage=byKey.get(key);return stage&&target.date>=stage.start&&target.date<=stage.end&&C.days(stage.employee.admission,target.date)<=c.maxEligibleAge&&storeCount(candidate.participants,stage.employee,model.employees)<=o.maxPerStore;}))continue;
          if(C.sessionConflicts(candidate,[...existing,...proposals.filter(p=>p!==source)],c,model.employees).length)continue;
          target.participants.push(...source.participants);target.stageKeys.push(...source.stageKeys);
          proposals.splice(proposals.indexOf(source),1);combined=true;break;
        }
        if(combined)break;
      }
    }
    // Move eligible people from fuller to smaller groups within the same cohort.
    // Window, availability, facilitator, and store limits still govern every move.
    let moved=true;
    while(moved) {
      moved=false;
      for(const source of [...proposals].sort((a,b)=>b.participants.length-a.participants.length)) {
        for(const target of [...proposals].filter(p=>p!==source&&p.milestone===source.milestone&&p.initialThirty===source.initialThirty&&p.groupKey===source.groupKey&&p.participants.length<source.participants.length-1).sort((a,b)=>a.participants.length-b.participants.length)) {
          const key=source.participants.find(key=>{
            const stage=byKey.get(key),person=stage?.employee;
            if(!stage||target.date<stage.start||target.date>stage.end||C.days(person.admission,target.date)>c.maxEligibleAge||storeCount(target.participants,person,model.employees)>=o.maxPerStore)return false;
            const candidate={...target,participants:[...target.participants,key]};
            const rest=proposals.filter(p=>p!==source).concat({...source,participants:source.participants.filter(k=>k!==key)});
            return !C.sessionConflicts(candidate,[...existing,...rest],c,model.employees).length;
          });
          if(key){const index=source.participants.indexOf(key);source.participants.splice(index,1);source.stageKeys.splice(index,1);target.participants.push(key);target.stageKeys.push(byKey.get(key).key);moved=true;break;}
        }
        if(moved)break;
      }
    }
    proposals.sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
    return { proposals, skipped, options:o };
  }
  function validate(proposals, model, existing = model.sessions || []) {
    const errors=[], accepted=[], assigned=new Set();
    const current=C.launchQueue(model,{}).queue;
    for(const proposal of proposals) {
      errors.push(...C.sessionConflicts(proposal,[...existing,...accepted],model.config,model.employees));
      const first=model.employees.find(e=>e.key===proposal.participants[0]);
      if(first&&!sameGroup(proposal.participants,first,model.employees))errors.push('Uma turma sugerida não pode misturar unidades diferentes. Colaboradores VD podem participar juntos.');
      for(const key of proposal.participants) {
        if(assigned.has(key))errors.push('Um colaborador aparece em mais de uma turma sugerida.');
        assigned.add(key);
        const stage=current.find(s=>s.employee.key===key&&s.milestone===proposal.milestone);
        if(!stage||stage.scheduled||stage.previousSession||!!stage.initialThirty!==!!proposal.initialThirty||proposal.date<stage.start||proposal.date>stage.end)errors.push('Um participante não está mais disponível para a janela sugerida. Gere as sugestões novamente.');
      }
      accepted.push(proposal);
    }
    return [...new Set(errors)];
  }
  const api={generate,validate,groupKey,groupLabel,sameGroup};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HUB_CONEXAO_SUGGESTIONS=api;
})(typeof window!=='undefined'?window:globalThis);
