import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {request as httpsRequest} from 'node:https';
import {randomUUID,createHash} from 'node:crypto';

export function publicIPv4(address){
 if(isIP(address)!==4)return false;const [a,b,c]=address.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===192&&b===0&&(c===0||c===2))||(a===192&&b===88&&c===99)||(a===198&&(b===18||b===19))||(a===198&&b===51&&c===100)||(a===203&&b===0&&c===113));
}
export function officialUrl(value,expectedHostname){
 let url;try{url=new URL(value);}catch{throw Error('Enter a complete HTTPS URL for the official merchant page.');}
 if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||isIP(url.hostname)||url.hostname.includes(':')||!url.hostname.includes('.')||/\.(?:local|localhost|internal|test|invalid|example)$/i.test(url.hostname)||url.href.length>1500)throw Error('Use a public merchant domain over HTTPS, without credentials or a custom port.');
 if(expectedHostname&&url.hostname!==expectedHostname)throw Error('Research redirects and additional pages must remain on the same confirmed merchant hostname.');
 url.hash='';return url;
}
export async function fetchOfficial(value,{expectedHostname,lookupImpl=lookup,requestImpl=httpsRequest,redirects=0}={}){
 const url=officialUrl(value,expectedHostname);const addresses=await lookupImpl(url.hostname,{all:true,verbatim:true});
 if(!addresses.length||addresses.some(a=>a.family===4&&!publicIPv4(a.address))||addresses.some(a=>a.family===6&&!/^[23]/.test(a.address)))throw Error('This domain resolves to a private or unsupported address. Research was blocked.');
 const address=addresses.find(a=>a.family===4&&publicIPv4(a.address));if(!address)throw Error('This demo requires a public IPv4 address for merchant research.');
 const result=await new Promise((resolve,reject)=>{
  let timer;const success=value=>{clearTimeout(timer);resolve(value);};const failure=error=>{clearTimeout(timer);reject(error);};
  const req=requestImpl(url,{method:'GET',agent:false,headers:{'User-Agent':'SIR-Prototype/0.2 (user-requested policy lookup)','Accept':'text/html,text/plain','Accept-Encoding':'identity'},lookup:(_host,options,callback)=>options.all?callback(null,[address]):callback(null,address.address,4)},res=>{
   if(res.statusCode>=300&&res.statusCode<400){res.resume();success({redirect:res.headers.location});return;}
   if(res.statusCode!==200){res.resume();failure(Error('The merchant page returned HTTP '+res.statusCode+'. Try a different official policy URL.'));return;}
   if(!/^(?:text\/html|text\/plain)(?:;|$)/i.test(res.headers['content-type']||'')||(res.headers['content-encoding']&&res.headers['content-encoding']!=='identity')){res.resume();failure(Error('This demo can read uncompressed HTML or plain-text policy pages only.'));return;}
   const chunks=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>1000000){req.destroy(Error('The policy page is too large. Choose a more specific page.'));return;}chunks.push(chunk);});res.on('end',()=>success({html:Buffer.concat(chunks).toString('utf8'),url:url.href}));res.on('error',failure);
  });
  timer=setTimeout(()=>req.destroy(Error('The merchant page timed out. Choose a more specific official URL.')),10000);
  req.setTimeout(8000,()=>req.destroy(Error('The merchant page timed out. Try again or choose another official URL.')));req.on('error',error=>failure(['UNABLE_TO_VERIFY_LEAF_SIGNATURE','SELF_SIGNED_CERT_IN_CHAIN','CERT_HAS_EXPIRED'].includes(error.code)?Error('The page’s secure connection could not be verified. Try another official page or check local certificate settings.'):error));req.end();
 });
 if(result.redirect){if(redirects>=3)throw Error('The policy page redirected too many times.');const next=officialUrl(new URL(result.redirect,url).href,url.hostname);return fetchOfficial(next.href,{expectedHostname:url.hostname,lookupImpl,requestImpl,redirects:redirects+1});}
 if(!result.html)throw Error('The merchant page did not contain readable content.');return result;
}
const decode=value=>value.replace(/&(?:amp|quot|apos|lt|gt|nbsp);|&#(?:x[0-9a-f]+|\d+);/gi,entity=>{const map={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '};if(map[entity.toLowerCase()])return map[entity.toLowerCase()];const number=entity.toLowerCase().startsWith('&#x')?parseInt(entity.slice(3,-1),16):parseInt(entity.slice(2,-1),10);return number>0&&number<=0x10ffff?String.fromCodePoint(number):'';});
export function inspectPolicy(html,url){
 const cleaned=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
 const body=cleaned.replace(/<(head|nav|header|footer|h[1-6])\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'\n');
 const text=decode(body.replace(/<\/(?:p|li|div|section|h[1-6]|tr)>|<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,' ')).split('\n').map(line=>line.replace(/\s+/g,' ').trim()).filter(Boolean);
 const title=decode(cleaned.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]*>/g,'')||new URL(url).hostname).slice(0,200);
 const passages=[...new Set(text.filter(line=>/\b(?:cancel\w*|refund\w*|complain\w*|contact|billing|deliver\w*|fault\w*|defect\w*|return\w*|repair\w*|replac\w*|warrant\w*|service|quality|book\w*|reserv\w*|damag\w*|delay\w*|access|activat\w*|payment|privacy|support|guarantee|policy|terms)\b/i.test(line)))].slice(0,12).map((line,index)=>({id:'Q'+(index+1),text:line.slice(0,600),truncated:line.length>600}));
 const links=[],contacts=[];
 for(const match of cleaned.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
  const href=decode(match[1]);const label=decode(match[2].replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim().slice(0,160);
  if(/^mailto:/i.test(href)){const email=href.slice(7).split('?')[0];if(/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email))contacts.push({email,label,url,note:'Observed mailto link. Review whether it is suitable for this complaint.'});continue;}
  try{const target=officialUrl(new URL(href,url).href,new URL(url).hostname);if(/refund|cancel|complain|contact|support|help|delivery|returns|repair|warranty|booking|privacy|terms|policy/i.test(target.pathname+' '+label)&&target.href!==url)links.push({url:target.href,label});}catch{}
 }
 return {title,passages,links:[...new Map(links.map(link=>[link.url,link])).values()].slice(0,12),contacts:[...new Map(contacts.map(contact=>[contact.email,contact])).values()].slice(0,10)};
}
export class ResearchService{
 constructor({fetchImpl=fetchOfficial,now=()=>Date.now()}={}){this.fetch=fetchImpl;this.now=now;this.pending=new Map();this.inFlight=new Set();}
 clean(){for(const [id,value]of this.pending)if(value.expiresAt<=this.now())this.pending.delete(id);}
 async preview(caseId,revision,input){
  if(input?.confirmedOfficial!==true)throw Error('Confirm that the URL belongs to the merchant’s official website.');
  const url=officialUrl(input.url);this.clean();if(this.pending.size>=20)throw Error('Too many pending policy previews. Save one or wait 15 minutes.');if(this.inFlight.has(caseId))throw Error('Merchant research is already running for this case.');
  this.inFlight.add(caseId);
  try{const fetched=await this.fetch(url.href,{expectedHostname:url.hostname});const actual=officialUrl(fetched.url,url.hostname);const parsed=inspectPolicy(fetched.html,actual.href);const result={id:randomUUID(),caseId,revision,url:actual.href,hostname:url.hostname,retrievedAt:new Date(this.now()).toISOString(),contentHash:createHash('sha256').update(fetched.html).digest('hex'),...parsed,limitation:'Keyword-selected passages from a user-confirmed official page. Review applicability and completeness. These are merchant terms, not verified statutory rights. Contact links are observed, not authorised recipients.'};this.pending.set(result.id,{...result,expiresAt:this.now()+15*60*1000});return result;}finally{this.inFlight.delete(caseId);}
 }
 reviewed(caseId,revision,input){
  this.clean();const preview=this.pending.get(input?.previewId);
  if(!preview||preview.caseId!==caseId||preview.revision!==revision)throw Error('The policy preview expired or this case changed. Research it again.');
  if(input.confirmed!==true||!Array.isArray(input.passageIds)||input.passageIds.length<1||input.passageIds.length>3||new Set(input.passageIds).size!==input.passageIds.length||input.passageIds.some(id=>!preview.passages.some(p=>p.id===id)))throw Error('Select one to three displayed passages and confirm their relevance before saving.');
  const {expiresAt,...result}=preview;return {...result,passages:preview.passages.filter(p=>input.passageIds.includes(p.id)),reviewedAt:new Date(this.now()).toISOString()};
 }
 saved(id){this.pending.delete(id);}
}
