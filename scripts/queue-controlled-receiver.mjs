import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const secret=process.env.QA_RECEIVER_SECRET;
const date=new Date().toISOString();
const description='Desenvolvedor React júnior para criar aplicações web com TypeScript, Git e APIs REST. A equipe escreve testes automatizados, mantém componentes acessíveis e realiza revisões de código. Contratação CLT e trabalho 100% remoto no Brasil.';
if(!secret)throw Error('Missing isolated receiver token');
const counts={},files={},candidates={};
createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path===`/${secret}/status`){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({counts,files,candidates}));return;}
  if(path===`/${secret}/`){res.setHeader('Content-Type','text/html');res.end(`<h1>Empregatos Queues QA</h1><div class="wpjb-job-list">${[0,1,2,3].map(i=>`<a href="/${secret}/job/${i}">Desenvolvedor React QA ${i}</a>`).join('')}</div>`);return;}
  const id=path.match(new RegExp(`^/${secret}/job/([0-3])$`))?.[1];
  if(!id){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');
  if(req.method==='POST'){
    const parts=[];let size=0;
    for await(const p of req){size+=p.length;if(size>100000){res.writeHead(413);res.end();return;}parts.push(p);}
    const bytes=Buffer.concat(parts);
    if(!bytes.includes(Buffer.from('%PDF-'))||!bytes.includes(Buffer.from('queues-qa@example.test'))){res.writeHead(422);res.end('Wrong fictitious file/candidate');return;}
    counts[id]=(counts[id]||0)+1;files[id]=createHash('sha256').update(bytes.subarray(bytes.indexOf('%PDF-'),bytes.indexOf('%%EOF')+5)).digest('hex');candidates[id]=true;
    await writeFile('/vercel/sandbox/queue-receiver-counts.json',JSON.stringify({counts,files,candidates}));
    if(id==='2'){res.writeHead(503);res.end('Controlled missing confirmation after acceptance');return;}
    res.end(`<div class="wpjb-success">Candidatura recebida com sucesso. QA ${id} recibo ${counts[id]}</div>`);return;
  }
  const url=`https://${req.headers.host}${path}`;
  res.end(`<script type="application/ld+json">${JSON.stringify([{'@type':'WebPage',url,datePublished:date},{'@type':'JobPosting',url,title:`Desenvolvedor React QA ${id}`,description,hiringOrganization:{name:'Empregatos Queues QA',sameAs:`https://${req.headers.host}`},datePosted:date,jobLocationType:'TELECOMMUTE',applicantLocationRequirements:{name:'Brasil'}}])}</script><h1>Desenvolvedor React QA ${id}</h1><div class="wpjb-single-job-wrapper"><p>Empregatos Queues QA ${id}</p><p>${description}</p><div class="wpjb-apply-form"><form method="post" enctype="multipart/form-data"><input name="candidate-name"><input type="email" name="candidate-email"><input type="file" name="candidate-cv"><textarea name="candidate-message"></textarea><input type="hidden" name="action" value="apply-for-job">${id==='3'?'<div class="h-captcha" data-sitekey="controlled"></div>':''}<button>Enviar</button></form></div></div>`);
}).listen(3005,'0.0.0.0');
