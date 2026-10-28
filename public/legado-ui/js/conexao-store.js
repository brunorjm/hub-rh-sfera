(function(){
 'use strict';
 const kinds=['sessions','events','executions','reports','committees','actions','observations','fits'];
 let cache=null,owner=null,revisions=new Map(),pending=null,busy=false,loadedAt=0;
 const blank=()=>({version:1,windowPolicy:2,launchPolicy:1,cohortPolicy:1,config:HUB_CONEXAO_CORE.settings(),...Object.fromEntries(kinds.map(k=>[k,[]]))});
 function accept(rows,user){
  if(window.HUB_USER?.id!==user)throw Error('A sessão mudou. Abra o módulo novamente.');
  const state=blank(),versions=new Map();
  for(const row of rows){versions.set(row.kind+':'+row.id,row.revision);if(row.kind==='config')state.config=HUB_CONEXAO_CORE.settings(row.data);else if(kinds.includes(row.kind))state[row.kind].push(row.data);}
  state.savedAt=JSON.stringify(rows.map(r=>[r.kind,r.id,r.revision]));cache=state;owner=user;revisions=versions;loadedAt=Date.now();return read();
 }
 function ready(){return !!cache&&owner===window.HUB_USER?.id;}
 function read(){if(!ready())throw Error('Aguarde o carregamento dos registros do Conexão RH.');return structuredClone(cache);}
 async function load(force=false){
  const user=window.HUB_USER?.id;if(!user)throw Error('Entre com seu usuário do Hub.');
  if(ready()&&!force)return read();if(pending)return pending;
  pending=(async()=>{const {data,error}=await sb.rpc('conexao_state');if(error)throw Error(error.message);return accept(data,user);})();
  try{return await pending;}finally{pending=null;}
 }
 const recordId=(kind,row)=>kind==='executions'?row.session:row.id;
 async function mutate(fn){
  if(busy)throw Error('Há um registro sendo salvo. Aguarde a confirmação.');busy=true;const user=window.HUB_USER?.id;
  try{
   const previous=read(),next=structuredClone(previous);fn(next);const changes=[];
   if(JSON.stringify(previous.config)!==JSON.stringify(next.config))changes.push({kind:'config',id:'global',data:next.config,revision:revisions.get('config:global')||0});
   for(const kind of kinds){const old=new Map(previous[kind].map(r=>[recordId(kind,r),r])),ids=new Set();
    for(const row of next[kind]){const id=recordId(kind,row);if(!id||ids.has(id))throw Error('Registro sem identificação única.');ids.add(id);if(JSON.stringify(old.get(id))!==JSON.stringify(row))changes.push({kind,id,data:row,revision:revisions.get(kind+':'+id)||0});}
    if([...old.keys()].some(id=>!ids.has(id)))throw Error('O histórico não pode ser excluído. Cancele ou retifique o registro.');
   }
   if(!changes.length)return read();const {data,error}=await sb.rpc('conexao_save',{changes});
   if(error){if(error.code==='40001'){await load(true);throw Error('Outra pessoa atualizou este registro. Os dados foram recarregados. Reabra a turma e confira suas alterações antes de salvar novamente.');}throw Error(error.message);}
   return accept(data,user);
  }finally{busy=false;}
 }
 window.HUB_CONEXAO_STORE={read,load,ready,mutate,id:()=>crypto.randomUUID(),get loadedAt(){return loadedAt;}};
 window.addEventListener('focus',()=>{if(ready()&&!document.querySelector('dialog[open]')&&Date.now()-loadedAt>30000)load(true).then(()=>{if(document.getElementById('sec-conexao-rh')?.classList.contains('active'))window.HUB_CONEXAO?.render();}).catch(()=>{});});
})();
