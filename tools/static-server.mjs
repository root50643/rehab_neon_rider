import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
 try{const url=new URL(req.url,'http://127.0.0.1');if(url.pathname==='/'){res.writeHead(302,{Location:'/rehab_neon_rider/'});res.end();return;}
 const rel=decodeURIComponent(url.pathname).replace(/^\/rehab_neon_rider\//,'');
 const file=path.resolve(root,rel||'index.html');if(file!==root&&!file.startsWith(root+path.sep))throw new Error('outside root');
 const target=(await stat(file)).isDirectory()?path.join(file,'index.html'):file;
 res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});res.end(await readFile(target));
 }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(4173,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:4173/rehab_neon_rider/'));
