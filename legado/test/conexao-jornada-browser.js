(function(){
  'use strict';
  const C=HUB_CONEXAO_CORE,K=HUB_CONEXAO_CONDUCAO_CORE,W=HUB_CONEXAO_CONDUCAO,today=C.today(),date=C.add(today,-1);
  let data={sessions:[],executions:[],reports:[],committees:[],events:[],actions:[]},modal;
  const employees=[{key:'pessoa-ficticia',name:'Pessoa fictícia',unit:'Unidade de teste',department:'Departamento de teste',manager:'Gestão fictícia',role:'Atendimento',admission:C.add(date,-30)}];
  for(let index=0;index<6;index++){
    const session={id:'turma-'+index,milestone:30,date,time:'10:00',duration:45,facilitator:'RH fictício',mode:'Online',participants:['pessoa-ficticia'],created:date+'T12:00:00Z'};data.sessions.push(session);
    if(!index)continue;
    const execution={...K.executionDraft(session,employees),summary:'Síntese fictícia de integração e apoio.',roster:employees.map(p=>({...p,attendance:'presente',agreement:''}))};
    const report=K.finalize(data,session,execution,{id:'relatorio-'+index,now:new Date().toISOString(),today,time:'23:59'});
    if(index===1)continue;
    report.status='ready';if(index===2)continue;
    const committee={id:'comite-'+index,report:report.id,session:session.id,date:today,time:'00:00',duration:15,rh:'RH fictício',td:'T&D fictícia',management:'Gestão fictícia',region:'Regional de teste',units:report.units,status:index===3?'scheduled':'done',plan:[],decisions:'Decisões fictícias',link:''};data.committees.push(committee);
    if(index===5)committee.feedback={date:today,channel:'Canal de teste',message:'Devolutiva fictícia registrada.'};
  }
  const context={model:{employees},filters:{},read:()=>structuredClone(data),save:fn=>{try{const copy=structuredClone(data);fn(copy);data=copy;return true;}catch(error){context.toast(error.message);return false;}},refresh:render,id:()=>crypto.randomUUID(),userName:'Facilitador de teste',toast:message=>{document.getElementById('notice').textContent=message;},dialog:(title,body)=>{modal?.remove();modal=document.createElement('dialog');modal.className='cx-dialog';modal.setAttribute('aria-label',title);const row=document.createElement('div');row.className='cx-row';const h=document.createElement('h2');h.textContent=title;const close=document.createElement('button');close.className='cx-close';close.textContent='Fechar';close.onclick=()=>modal.close();row.append(h,close);modal.append(row);modal.insertAdjacentHTML('beforeend',body);document.body.append(modal);modal.showModal();return modal;},editSession:()=>context.toast('Edição fora do escopo deste teste.'),cancelSession:()=>context.toast('Cancelamento fora do escopo deste teste.'),communication:()=>context.toast('Comunicação fora do escopo deste teste.'),nps:(session,dialog)=>dialog('NPS','<p>NPS fictício, sem requisições externas.</p>')};
  function render(){const root=document.getElementById('fixture');root.innerHTML=W.board(context);root.onclick=event=>{const button=event.target.closest('[data-cx-session-detail]');if(button)W.openSession(button.dataset.cxSessionDetail,context);};}
  render();
})();
