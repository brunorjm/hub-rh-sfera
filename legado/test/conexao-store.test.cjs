const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),C=require('../js/conexao-core.js');
async function main(){let remote=[],rejectWrite=false,resolveWrite;
 const user={id:'user-a'},context={window:{HUB_USER:user,addEventListener(){}},HUB_USER:user,HUB_CONEXAO_CORE:C,structuredClone,crypto:require('node:crypto').webcrypto,Date,document:{querySelector:()=>null},sb:{rpc:async(name,args)=>{
  if(name==='conexao_state')return {data:structuredClone(remote)};
  if(rejectWrite)return {error:{message:'Permission denied'}};
  if(resolveWrite===null)await new Promise(resolve=>{resolveWrite=resolve;});
  for(const row of args.changes){const existing=remote.find(r=>r.kind===row.kind&&r.id===row.id);if(existing&&existing.revision!==row.revision)return {error:{code:'40001',message:'Conflict'}};if(existing)Object.assign(existing,{...row,revision:row.revision+1});else remote.push({...row,revision:1});}return {data:structuredClone(remote)};
 }}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../js/conexao-store.js'),'utf8'),context);const S=context.window.HUB_CONEXAO_STORE;
 assert.equal(S.ready(),false);await S.load();assert.equal(S.ready(),true);
 rejectWrite=true;await assert.rejects(()=>S.mutate(d=>d.actions.push({id:'action-a'})),/Permission denied/);assert.equal(S.read().actions.length,0);
 rejectWrite=false;resolveWrite=null;const saving=S.mutate(d=>d.actions.push({id:'action-a',title:'Original'}));await new Promise(r=>setImmediate(r));assert.equal(S.read().actions.length,0);await assert.rejects(()=>S.mutate(()=>{}),/Aguarde/);resolveWrite();await saving;assert.equal(S.read().actions.length,1);
 remote[0].revision=2;remote[0].data.title='Another user';await assert.rejects(()=>S.mutate(d=>d.actions[0].title='Overwrite'),/Outra pessoa/);assert.equal(S.read().actions[0].title,'Another user');
 await assert.rejects(()=>S.mutate(d=>d.actions=[]),/histórico/);assert.equal(remote.length,1);
 user.id='user-b';assert.equal(S.ready(),false);assert.throws(()=>S.read(),/carregamento/);
 console.log('11 verificações de persistência: confirmação remota, falha, concorrência, atualização, histórico e troca de sessão aprovadas.');
}main().catch(e=>{console.error(e);process.exitCode=1;});
