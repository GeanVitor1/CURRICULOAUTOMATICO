import PDFDocument from 'pdfkit';
import type {PerfectResume} from '../shared/perfect-resume';
export const perfectResumeLabels=(language:PerfectResume['language'])=>language==='en'
 ? {summary:'Professional summary',skills:'Core skills',experience:'Professional experience',education:'Education',projects:'Projects',languages:'Languages',letter:'Cover letter'}
 : {summary:'Resumo profissional',skills:'Competências',experience:'Experiência profissional',education:'Formação',projects:'Projetos',languages:'Idiomas',letter:'Carta de apresentação'};
export function perfectResumeText(d:PerfectResume,letter=false){const l=perfectResumeLabels(d.language),c=d.content;return[d.contact.name,[d.contact.email,d.contact.phone,d.contact.location,...d.contact.links].filter(Boolean).join(' | '),letter?l.letter:c.headline,letter?c.coverLetter:[l.summary,c.summary,l.skills,c.skills.join(' · '),...c.experience.flatMap(e=>[e.heading,e.period,...e.bullets.map(b=>'- '+b.text)]),...c.education,...c.projects.flatMap(e=>[e.heading,...e.bullets.map(b=>'- '+b.text)]),c.languages].filter(Boolean).join('\n\n')].filter(Boolean).join('\n\n');}

/** Selectable text, a single reading column and bounded blocks for ATS and print. */
export async function createPerfectResumePdf(d:PerfectResume,letter=false):Promise<Buffer>{
 const colors={essencial:'#202b36',moderno:'#34724c',executivo:'#243d61'},accent=colors[d.template],margin=50,width=495.28;
 const doc=new PDFDocument({size:'A4',margins:{top:48,bottom:48,left:margin,right:margin},bufferPages:true,info:{Title:letter?'Carta de apresentação':`Currículo - ${d.contact.name}`,Author:d.contact.name}}),chunks:Buffer[]=[];
 const result=new Promise<Buffer>((resolve,reject)=>{doc.on('data',(b:Buffer)=>chunks.push(b));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 const ensure=(height=65)=>{if(doc.y+height>doc.page.height-60)doc.addPage();};
 const paragraph=(value:string,size=10.5)=>{doc.font('Helvetica').fontSize(size).fillColor('#26313c').text(value,{width,lineGap:3});};
 const section=(label:string)=>{ensure(80);doc.moveDown(.7);doc.font('Helvetica-Bold').fontSize(10).fillColor(accent).text(label.toLocaleUpperCase(d.language==='en'?'en-US':'pt-BR'),{width,characterSpacing:1});doc.moveDown(.45);};
 doc.font('Helvetica-Bold').fontSize(26).fillColor(accent).text(d.contact.name,{width});doc.moveDown(.3);
 paragraph([d.contact.email,d.contact.phone,d.contact.location].filter(Boolean).join('  |  '),9);
 if(d.contact.links.length)paragraph(d.contact.links.join('  |  '),9);
 doc.moveDown(.6);doc.strokeColor(accent).lineWidth(d.template==='moderno'?2:1).moveTo(margin,doc.y).lineTo(margin+width,doc.y).stroke();doc.moveDown(.9);
 const c=d.content,l=perfectResumeLabels(d.language);
 doc.font('Helvetica-Bold').fontSize(14).fillColor('#17212b').text(letter?l.letter:c.headline,{width});doc.moveDown(.6);
 if(letter){paragraph(c.coverLetter,11);}else{
  section(l.summary);paragraph(c.summary);
  if(c.skills.length){section(l.skills);paragraph(c.skills.join(' · '));}
  if(c.experience.length){section(l.experience);for(const e of c.experience){ensure(85);doc.font('Helvetica-Bold').fontSize(11).fillColor('#17212b').text(e.heading,{width});if(e.period){doc.moveDown(.25);paragraph(e.period,9);}doc.moveDown(.35);for(const b of e.bullets){ensure(40);paragraph('- '+b.text);doc.moveDown(.25);}doc.moveDown(.5);}}
  if(c.education.length){section(l.education);for(const e of c.education){ensure(45);paragraph(e);doc.moveDown(.4);}}
  if(c.projects.length){section(l.projects);for(const p of c.projects){ensure(75);doc.font('Helvetica-Bold').fontSize(11).fillColor('#17212b').text(p.heading,{width});doc.moveDown(.35);for(const b of p.bullets){ensure(40);paragraph('- '+b.text);doc.moveDown(.25);}doc.moveDown(.4);}}
  if(c.languages){section(l.languages);paragraph(c.languages);}
 }
 const range=doc.bufferedPageRange();for(let i=range.start;i<range.start+range.count;i++){doc.switchToPage(i);const bottom=doc.page.margins.bottom;doc.page.margins.bottom=0;doc.font('Helvetica').fontSize(8).fillColor('#65717b').text(`${i+1} / ${range.count}`,margin,doc.page.height-33,{width,align:'right',lineBreak:false});doc.page.margins.bottom=bottom;}
 doc.end();return result;
}
