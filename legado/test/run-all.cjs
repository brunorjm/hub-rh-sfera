const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
for(const file of fs.readdirSync(__dirname).filter(n=>/\.test\.(cjs|js)$/.test(n)).sort()){
 const result=spawnSync(process.execPath,[path.join(__dirname,file)],{encoding:'utf8'});console.log(result.stdout);if(result.status!==0){console.error(result.stderr);process.exit(result.status||1);}
}
