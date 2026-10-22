import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {buildLaunch,keyReceipt} from './SIR-private-AI-launcher.mjs';

export const setupHtml=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SIR — Connect AI privately</title>
<style>body{font:18px system-ui;background:#101824;color:#eef3fa;max-width:680px;margin:50px auto;padding:24px}label{display:block;margin:20px 0}input[type=password]{box-sizing:border-box;width:100%;padding:14px;font:inherit}button{font:inherit;background:#a3dfce;padding:12px 20px;border:0;border-radius:8px;margin:10px 8px 10px 0;cursor:pointer}button:disabled{opacity:.5}#status{white-space:pre-line}small{line-height:1.5}</style>
<h1>Connect SIR to OpenAI</h1><p>Paste your existing SIR key into this normal text box. It stays masked. The key goes only to SIR on this computer, is held for this session, and is not written to a file.</p><small>AI requests use your OpenAI API account when you choose Ask SIR. This step checks the paste, not whether OpenAI accepts the key.</small>
<form id="setup" autocomplete="off"><label>OpenAI API key<input id="key" type="password" autocomplete="off" spellcheck="false" autofocus></label><button type="button" id="paste">Paste from clipboard</button><p id="receipt" role="status">No key entered yet.</p><label><input id="confirmed" type="checkbox"> The character count and last four characters match my private copy.</label><button id="start" type="submit" disabled>Start SIR</button></form><p id="status" role="status"></p>
<script>
const key=document.getElementById('key'),confirm=document.getElementById('confirmed'),start=document.getElementById('start'),status=document.getElementById('status');
function validate(){const text=key.value.trim(),valid=/^sk-[A-Za-z0-9_-]+$/.test(text);document.getElementById('receipt').textContent=valid?'Paste received: '+text.length+' characters; ends in '+text.slice(-4)+'.':text?'That does not look like the secret key. Copy only the key, without quotes or shortened dots.':'No key entered yet.';start.disabled=!valid||!confirm.checked;}
key.addEventListener('input',()=>{confirm.checked=false;validate();});confirm.addEventListener('change',validate);
document.getElementById('paste').onclick=async()=>{try{key.value=await navigator.clipboard.readText();confirm.checked=false;validate();}catch{status.textContent='Click inside the key box and press Ctrl+V, or right-click inside it and choose Paste.';key.focus();}};
document.getElementById('setup').onsubmit=async event=>{event.preventDefault();if(start.disabled)return;start.disabled=true;status.textContent='Starting SIR…';try{const response=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:key.value.trim(),confirmed:confirm.checked})});const result=await response.json();if(!response.ok)throw Error(result.error||'SIR could not start.');key.value='';confirm.checked=false;document.getElementById('setup').hidden=true;document.getElementById('receipt').textContent='';status.textContent='SIR has started. Switch to the SIR tab that opens. Keep the black startup window open. This setup page can be closed.';}catch(error){status.textContent=error.message;validate();}};
</script></html>`;

export function validateSetup(input){
  if(input?.confirmed!==true)throw Error('Confirm the paste details before starting.');
  keyReceipt(input.key||'');return input.key.trim();
}
export async function main(){
 const token=randomBytes(24).toString('hex');const path='/setup/'+token;let launching=false;
 const setup=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
  try{
   const host='127.0.0.1:'+setup.address().port;
   if(req.headers.host!==host||req.url!==path||(req.headers.origin&&req.headers.origin!=='http://'+host)){res.writeHead(403);return res.end();}
   if(req.method==='GET'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(setupHtml);}
   if(req.method!=='POST'||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){res.writeHead(405);return res.end();}
   if(launching)throw Error('SIR is already starting.');
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4096)throw Error('The pasted value is too long.');chunks.push(chunk);}
   const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));let key=validateSetup(input);input.key='';const launch=buildLaunch(key);key='';launching=true;
   const child=spawn(process.execPath,launch.args,{cwd:launch.app,env:launch.env,stdio:'inherit'});delete launch.env.OPENAI_API_KEY;
   await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',()=>reject(Error('SIR could not start. Check its application folder.')));});
   child.once('exit',code=>{setup.close();process.exitCode=code??0;});res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({started:true}));setup.close();
  }catch(error){launching=false;res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error instanceof SyntaxError?'The setup request could not be read. Try again.':error.message}));}
 });
 setup.listen(0,'127.0.0.1',()=>{console.log('SIR private AI setup is opening in your browser. Paste the key there, not in this black window.');console.log('Keep this window open. No key is printed or saved.');execFile('cmd.exe',['/d','/c','start','','http://127.0.0.1:'+setup.address().port+path],error=>{if(error)console.log('Open this local setup address: http://127.0.0.1:'+setup.address().port+path);});});
 setup.on('error',()=>{console.error('The local setup page could not start. Close this window and try again.');process.exitCode=1;});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('SIR setup could not start.');process.exitCode=1;});
