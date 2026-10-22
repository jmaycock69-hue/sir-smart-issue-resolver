import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {spawn,spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

export function keyReceipt(key){
  const clean=key.trim();
  if(!/^sk-[A-Za-z0-9_-]+$/.test(clean))throw Error('The pasted value is not a complete-looking OpenAI key. Copy the secret itself, without quotes or the shortened dots.');
  return {characters:clean.length,ending:clean.slice(-4)};
}

export function buildLaunch(key,{env=process.env}={}){
  const clean=key.trim();
  keyReceipt(clean);
  const app=fileURLToPath(new URL('./',import.meta.url));
  const childEnv={...env,OPENAI_API_KEY:clean,SIR_AI_PROVIDER:'openai',SIR_AI_MODEL:env.SIR_AI_MODEL?.trim()||'gpt-5.6-terra'};
  if(childEnv.SIR_AI_MODEL==='gpt-5.6-terra')childEnv.SIR_AI_REASONING='none';
  delete childEnv.SIR_DEMO_MODE; // An explicit live launch cannot inherit scripted mode.
  const supported=spawnSync(process.execPath,['--help'],{encoding:'utf8',windowsHide:true}).stdout?.includes('--use-system-ca');
  return {app,env:childEnv,args:[...(supported?['--use-system-ca']:[]),'server.js','--open']};
}

async function main(){
  if(!process.stdin.isTTY)throw Error('Open Start-SIR-with-AI.cmd directly to enter your key privately.');
  console.log('SIR - private AI startup');
  console.log('Paste your OpenAI API key at the prompt below, then press Enter.');
  console.log('The key will not appear on screen or be saved to a file.');
  console.log('AI requests use your OpenAI API account when you choose Ask SIR.');
  const hidden=new Writable({write(_chunk,_encoding,callback){callback();}});
  hidden.isTTY=true;hidden.columns=process.stdout.columns||80;
  const reader=createInterface({input:process.stdin,output:hidden,terminal:true});
  reader.on('SIGINT',()=>{reader.close();process.exit(0);});
  process.stdout.write('\nOpenAI API key (hidden): ');
  let key;
  try{key=await reader.question('');}finally{reader.close();process.stdout.write('\n');}
  const receipt=keyReceipt(key);
  console.log('Paste received: '+receipt.characters+' characters; ends in '+receipt.ending+'.');
  console.log('Compare those last four characters with your private copy. This does not yet check OpenAI access.');
  const confirm=createInterface({input:process.stdin,output:process.stdout});
  let answer;try{answer=await confirm.question('If they match, type Y and press Enter to start SIR (anything else cancels): ');}finally{confirm.close();}
  if(answer.trim().toUpperCase()!=='Y'){key='';console.log('Cancelled. No server started.');return;}
  const launch=buildLaunch(key);key='';
  console.log('Starting SIR with '+launch.env.SIR_AI_MODEL+'. Keep this window open.');
  const server=spawn(process.execPath,launch.args,{cwd:launch.app,env:launch.env,stdio:'inherit'});
  delete launch.env.OPENAI_API_KEY;
  const code=await new Promise((resolve,reject)=>{server.once('error',()=>reject(Error('SIR could not start. Check that its application folder is still available.')));server.once('exit',code=>resolve(code??1));});
  process.exitCode=code;
}
if(process.argv[1]&&new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1').replaceAll('/','\\').toLowerCase()===process.argv[1].replaceAll('/','\\').toLowerCase())main().catch(error=>{console.error(error.message);process.exitCode=1;});
