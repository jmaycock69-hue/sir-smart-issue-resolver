import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const version=process.versions.node.split('.').map(Number);
if(version[0]<22||(version[0]===22&&version[1]<13)){console.error('SIR needs Node.js 22.13 or later. Installed: '+process.versions.node);process.exit(1);}
const runtime=join(root,'.runtime');mkdirSync(runtime,{recursive:true});
const stateFile=join(runtime,'demo.json');
function openBrowser(url){if(process.argv.includes('--no-browser'))return;if(process.platform==='win32')spawn('cmd.exe',['/d','/c','start','',url],{windowsHide:true,stdio:'ignore'}).unref();}
if(existsSync(stateFile)){
 try{const state=JSON.parse(readFileSync(stateFile));if(state.root===root&&/^http:\/\/127\.0\.0\.1:\d+$/.test(state.url)){
  process.kill(state.pid,0);
  const status=await fetch(state.url+'/api/ai/status',{signal:AbortSignal.timeout(1500)}).then(r=>r.json());
  if(status.mode==='scripted'){console.log('SIR is already running: '+state.url);openBrowser(state.url);process.exit(0);}
 }}catch{/* Stale launch information is replaced only by this folder's new instance. */}
}
console.log('Starting SIR. Your cases stay in this folder.\nNo API key is needed. Nothing is sent by email.');
const child=spawn(process.execPath,[join(root,'server.js'),'--demo'],{cwd:root,windowsHide:true,env:{...process.env,PORT:'0',SIR_DATA_DIR:join(root,'data-demo'),SIR_DEMO_MODE:'scripted',OPENAI_API_KEY:'',SIR_AI_MODEL:'',SIR_NODE_MODULES:''},stdio:['inherit','pipe','pipe']});
let ready=false,buffer='';
child.stdout.on('data',bytes=>{buffer+=bytes;const match=buffer.match(/SIR fictional demo: (http:\/\/127\.0\.0\.1:\d+)/);if(!ready&&match){ready=true;writeFileSync(stateFile,JSON.stringify({pid:child.pid,root,url:match[1]},null,2));console.log('\nSIR is ready: '+match[1]+'\nYour browser will open. Keep this window open.\nTo stop safely, press Ctrl+C in this window.');openBrowser(match[1]);}});
child.stderr.on('data',bytes=>process.stderr.write(bytes));
child.on('error',error=>{console.error('SIR could not start: '+error.message);process.exitCode=1;});
const timer=setTimeout(()=>{if(!ready){console.error('SIR did not finish starting. See the message above; verify this folder is writable and Node.js is installed.');child.kill();process.exitCode=1;}},12000);timer.unref();
child.on('exit',code=>{clearTimeout(timer);if(!ready)console.error('Startup stopped. '+buffer.trim());process.exitCode=code||0;});
process.on('SIGINT',()=>{console.log('\nStopping SIR. Saved cases are retained.');child.kill();});
process.on('SIGTERM',()=>child.kill());
