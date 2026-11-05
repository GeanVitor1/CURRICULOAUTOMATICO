import {it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ChromePortalConnection from '../src/ChromePortalConnection';
import {linkedinLocalNotice,type LocalLoginObservation} from '../shared/session-transfer-policy';

const observation=():LocalLoginObservation=>({observedAt:new Date().toISOString(),expiresAt:Date.now()+900000,extensionVersion:'2.0.6'});
function render(localLogin:LocalLoginObservation|null,status?:{kind:string;text:string}){
 return renderToStaticMarkup(createElement(ChromePortalConnection,{
  portal:'linkedin',onCloud:()=>{},onOpenConnector:()=>{},
  access:{available:true,mode:'local-browser',notice:linkedinLocalNotice,localLogin},
  extensionStatus:status?{...status,version:'2.0.6'}:null,
 }));
}
it('finishes a recorded verification instead of sending the person back through the initial instructions',()=>{
 const html=render(observation(),{kind:'verified',text:'Verificação registrada.'});
 expect(html).toContain('Verificação do LinkedIn concluída');
 expect(html).toContain('href="/app#automacao">Concluir e voltar ao painel');
 expect(html).not.toContain('<ol');expect(html).not.toContain('Primeira instalação');
 expect(html).not.toContain('Abrir conector do Chrome');expect(html).not.toContain('Clique em');
 expect(html).toContain('Verificar novamente');
});
it('keeps completion when reopening the page and does not repeat generic extension instructions',()=>{
 const saved=observation();
 for(const status of [undefined,{kind:'ready',text:'Abra a aba do conector para autorizar a transferência.'}]){
  const html=render(saved,status);expect(html).toContain('Verificação do LinkedIn concluída');
  expect(html).not.toContain('autorizar a transferência');expect(html).not.toContain('<ol');
 }
});
it('keeps an older observation visible without claiming that the login is currently active',()=>{
 const html=render({observedAt:new Date(Date.now()-3600000).toISOString(),expiresAt:Date.now()-1000,extensionVersion:'2.0.6'});
 expect(html).toContain('Login reconhecido na última verificação');
 expect(html).toContain('Este é um registro anterior');expect(html).not.toContain('Verificação do login pendente');
 expect(html).not.toContain('<ol');expect(html).toContain('Concluir e voltar ao painel');
});
it('shows instructions only before the first verification',()=>{
 const html=render(null);expect(html).toContain('Verificação do login pendente');expect(html).toContain('<ol');
 expect(html).not.toContain('Concluir e voltar ao painel');
});
it('shows progress without asking the person to repeat the action while it is running',()=>{
 const html=render(observation(),{kind:'connecting',text:'Registrando a verificação…'});
 expect(html).toContain('aria-busy="true"');expect(html).toContain('Aguarde nesta página');
 expect(html).not.toContain('<ol');expect(html).not.toContain('Concluir e voltar ao painel');
});
it('preserves the previous observation but does not announce that a failed new verification succeeded',()=>{
 const html=render(observation(),{kind:'error',text:'Não foi possível registrar a nova verificação.'});
 expect(html).toContain('role="alert"');expect(html).toContain('Verificação anterior do LinkedIn registrada');
 expect(html).toContain('Não foi possível concluir a nova verificação');
 expect(html).not.toContain('Verificação do LinkedIn concluída');
});
