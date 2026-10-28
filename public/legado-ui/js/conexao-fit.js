(function(){
  'use strict';
  const partition=()=>HUB_USER.id;
  // PDFs pelo servidor do Hub (/api/arquivos/conexao-fit/<id>), que confere sessão,
  // conexao_rh.documentos e o escopo do colaborador. Não há URL pública do arquivo.
  async function arquivo(id,options,prefix){
    let resp;try{resp=await fetch('/api/arquivos/conexao-fit/'+encodeURIComponent(id),{credentials:'same-origin',...options});}catch(e){throw Error(prefix+'sem conexão com o servidor do Hub.');}
    if(resp.status===401)window.location.assign('/login');
    if(!resp.ok){let body=null;try{body=await resp.json();}catch(e){}throw Error(prefix+((body&&body.erro)||('Erro '+resp.status)));}
    return resp;
  }
  async function list(employee){
    if(!HUB_PERMISSIONS.hasPerm(HUB_USER,'conexao_rh.documentos'))throw Error('Seu perfil não tem acesso aos documentos de Fit Cultural.');
    await HUB_CONEXAO_STORE.load(true);
    const records=HUB_CONEXAO_STORE.read().fits.filter(r=>r.employee===employee).sort((a,b)=>b.created.localeCompare(a.created));
    return Promise.all(records.map(async r=>{const resp=await arquivo(r.id,{},'Não foi possível abrir o PDF: ');return {...r,owner:partition(),file:await resp.blob()};}));
  }
  async function save(record){
    if(record.owner!==partition())throw Error('A sessão mudou. Reabra a ficha.');
    const previous=HUB_CONEXAO_STORE.read().fits.find(r=>r.id===record.id),pdfPath=record.employee+'/'+record.id+'.pdf';
    if(!previous)await arquivo(record.id,{method:'POST',headers:{'Content-Type':'application/pdf','X-Conexao-Colaborador':record.employee},body:record.file},'Não foi possível anexar o PDF: ');
    const {file,owner,...metadata}=record;metadata.path=pdfPath;
    await HUB_CONEXAO_STORE.mutate(state=>{const i=state.fits.findIndex(r=>r.id===record.id);if(i<0)state.fits.push(metadata);else state.fits[i]=metadata;});
  }
  async function extract(file,employee,raw){
    const owner=partition();
    if(file.size>10*1024*1024)throw Error('Selecione um PDF de até 10 MB.');
    const bytes=await file.arrayBuffer();if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw Error('O arquivo selecionado não é um PDF válido.');
    const pdfjs=await import('../assets/vendor/pdfjs/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/legado-ui/assets/vendor/pdfjs/pdf.worker.min.mjs';
    const doc=await pdfjs.getDocument({data:new Uint8Array(bytes.slice(0)),isEvalSupported:false,disableFontFace:true,useSystemFonts:true}).promise;
    let pages=[];try{if(doc.numPages>40)throw Error('O relatório deve ter no máximo 40 páginas.');for(let n=1;n<=doc.numPages;n++){const page=await doc.getPage(n),content=await page.getTextContent();pages.push(content.items.map(item=>item.str+(item.hasEOL?'\n':' ')).join(''));}}finally{await doc.destroy();}
    const result=HUB_CONEXAO_FIT_CORE.parse(pages);
    if(!result.recognized)throw Error('Não foi possível reconhecer um relatório de Fit Cultural com texto. Use o PDF original, com texto selecionável.');
    const identity=HUB_CONEXAO_FIT_CORE.identity(result.report.candidate,result.cpf,employee.name,raw?.cpf);
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    return {id:crypto.randomUUID(),owner,employee:employee.key,created:new Date().toISOString(),fileName:file.name,fileSize:file.size,file:new Blob([bytes],{type:'application/pdf'}),hash:Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join(''),report:result.report,missing:result.missing,identity,reviewed:false,notes:''};
  }
  window.HUB_CONEXAO_FIT={list,save,extract};
})();
