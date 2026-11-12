import { spawn } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
const port=process.env.UI_TEST_PORT || '3100';
const baseURL=`http://localhost:${port}`;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','0.0.0.0','--port',port],{stdio:'inherit'});
let exited=false;server.on('exit',()=>{exited=true;});
try {
  let ready=false;
  for(let i=0;i<60;i++){
    if(exited)throw new Error('UI test server exited');
    try { const response=await fetch(`${baseURL}/login`,{signal:AbortSignal.timeout(3000)}); if(response.ok){ready=true;break;} } catch {}
    await pause(500);
  }
  if(!ready)throw new Error('UI test server did not become ready');
  const tests=spawn('npm',['run','test:ui'],{stdio:'inherit',env:{...process.env,KANBAN_TEST_URL:baseURL}});
  const code=await new Promise((resolve,reject)=>{tests.on('error',reject);tests.on('exit',resolve);});
  if(code!==0)process.exitCode=code || 1;
} finally { server.kill('SIGTERM'); }
