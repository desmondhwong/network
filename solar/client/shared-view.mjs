// Machine-authored Codex/OpenAI. Versioned links contain validated workspace data only.
import {parseWorkspace,validateWorkspace} from './workspace.mjs';
const MAX_BYTES=70000,MAX_LINK=100000;
const utf8=new TextEncoder();
function toBase64(bytes){let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function fromBase64(text){if(!/^[A-Za-z0-9_-]+$/.test(text))throw Error('Invalid view encoding.');return Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));}
async function transform(bytes,stream){
  const reader=new Blob([bytes]).stream().pipeThrough(stream).getReader(),chunks=[];let length=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>MAX_BYTES){await reader.cancel();throw Error('Shared view is too large. Use a workspace file.');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const result=new Uint8Array(length);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
}
export async function encodeSharedView(workspace){
  const bytes=utf8.encode(JSON.stringify(validateWorkspace(workspace)));
  if(bytes.length>MAX_BYTES)throw Error('This view is too large for a link. Export a workspace file.');
  return typeof CompressionStream==='function'?`1g.${toBase64(await transform(bytes,new CompressionStream('gzip')))}`:`1j.${toBase64(bytes)}`;
}
export async function decodeSharedView(token){
  if(typeof token!=='string'||token.length>MAX_LINK)throw Error('Shared view is too large or invalid.');
  const match=/^(1[gj])\.([A-Za-z0-9_-]+)$/.exec(token);if(!match)throw Error('Unsupported shared view.');
  let bytes=fromBase64(match[2]);
  if(match[1]==='1g'){
    if(typeof DecompressionStream!=='function')throw Error('This browser cannot open compressed links. Import a workspace file.');
    bytes=await transform(bytes,new DecompressionStream('gzip'));
  }
  if(bytes.length>MAX_BYTES)throw Error('Shared view is too large.');
  return parseWorkspace(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
