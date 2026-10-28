(function(){
 'use strict';let rows=[],account='',error='',pending;
 async function sync(){if(pending)return pending;const user=HUB_USER.id;
  pending=(async()=>{try{const {data,error:failure}=await sb.rpc('conexao_nps_sync');if(failure)throw Error(failure.message);if(HUB_USER?.id===user){account=user;rows=data.map(r=>({...r,eligible:!r.revoked,responded:r.respondedAt,status:r.respondedAt?'answered':new Date(r.expiresAt)<new Date()?'expired':'pending'}));error='';}return rows;}catch(e){error='Não foi possível consultar o NPS. '+e.message;throw e;}})();
  try{return await pending;}finally{pending=null;}
 }
 window.HUB_CONEXAO_NPS={sync,get rows(){return account===window.HUB_USER?.id?rows:[];},get error(){return error;},url:r=>new URL('/conexao-nps-publico.html#token='+r.token,location.origin).href};
})();
