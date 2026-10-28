(function(root){
  'use strict';
  function summarize(rows){
    const valid=rows.filter(r=>r.eligible!==false&&Number.isInteger(r.score)&&r.score>=0&&r.score<=10);
    const count=valid.length,promoters=valid.filter(r=>r.score>=9).length,detractors=valid.filter(r=>r.score<=6).length;
    return {count,promoters,detractors,passives:count-promoters-detractors,average:count?valid.reduce((s,r)=>s+r.score,0)/count:null,nps:count?(promoters-detractors)/count*100:null};
  }
  const api={summarize};if(typeof module==='object'&&module.exports)module.exports=api;else root.HUB_CONEXAO_NPS_METRICS=api;
})(typeof window==='object'?window:globalThis);
