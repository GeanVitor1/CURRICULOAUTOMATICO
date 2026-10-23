import {afterEach,expect,it,vi} from 'vitest';
import {destinationFromPage} from '../server/destination-page';
import {detectAts} from '../server/ats-registry';
import {submissionRoute} from '../server/submission-routing';
import {createWorkspace} from '../server/workspace';
import type {Job} from '../shared/types';
const at=new Date().toISOString(),url='https://company.example/jobs/1';
const job={id:'j',url,title:'Desenvolvedor .NET',company:'Company',companyDomain:'https://company.example',description:'Desenvolvimento com C#, .NET e SQL Server em aplicações web e APIs REST. Testes unitários, trabalho remoto, contratação CLT.',location:'Brasil',modality:'Remoto',level:'Pleno',contract:'CLT',source:'company',skills:['.NET','C#'],requiredSkills:[],requiredYears:null,salaryMin:null,salaryMax:null,currency:'',origins:[{source:'company',id:'1',url}],publishedAt:at,discoveredAt:at,saved:false,discarded:false,demo:false,match:{} as Job["match"]} satisfies Job;
const html='<h1>Desenvolvedor .NET</h1><p>Company</p><div class="wpjb-apply-form"><form method="post"><input name="candidate-name"><input name="candidate-email" type="email"><input name="candidate-cv" type="file"><input type="hidden" name="action" value="apply-for-job"></form></div>';
afterEach(()=>vi.unstubAllEnvs());
it('selects the native executor for a verified company form found by resolution, with no browser infrastructure',()=>{
 vi.stubEnv('COMPANY_FORM_AUTHORIZED','company.example');vi.stubEnv('PORTAL_CLOUD_SNAPSHOT_ID','');vi.stubEnv('ATS_EXECUTION_LOCAL','false');
 const d=destinationFromPage(job,job,{url,status:200,contentType:'text/html',html})!;
 expect(d.evidence).toContain('Formulário WP Jobs Board verificado.');
 const w=createWorkspace('Person','p@example.test');w.routine.destinationPolicy='official';
 expect(submissionRoute(w,{...job,destinations:[d]},[])?.method).toBe('ats_browser');
});
it('continues past an unavailable browser destination to a later native destination',()=>{
 vi.stubEnv('COMPANY_FORM_AUTHORIZED','company.example');vi.stubEnv('PORTAL_CLOUD_SNAPSHOT_ID','');vi.stubEnv('ATS_EXECUTION_LOCAL','false');
 const d=destinationFromPage(job,job,{url,status:200,contentType:'text/html',html})!;
 const unsupported={...d,id:'browser-only',url:'https://company.example/other',evidence:[]};
 const w=createWorkspace('Person','p@example.test');w.routine.destinationPolicy='official';
 expect(submissionRoute(w,{...job,destinations:[unsupported,d]},[])?.destination?.id).toBe(d.id);
});
it('does not grant native execution to hidden-token, CAPTCHA or unrelated forms',()=>{
 for(const markup of [html.replace('</form>','<input name="token" type="hidden"></form>'),html.replace('</form>','<div data-sitekey="human"></div></form>')])
  expect(destinationFromPage(job,job,{url,status:200,contentType:'text/html',html:markup})?.evidence).not.toContain('Formulário WP Jobs Board verificado.');
});
it('recognizes the publisher numeric ID in encoded Gupy links without changing deduplication keys',()=>{
 const encoded=Buffer.from(JSON.stringify({jobId:12725139,source:'gupy_portal'})).toString('base64');
 expect(detectAts(`https://vemprapixeon.gupy.io/job/${encoded}?jobBoardSource=gupy_portal`)).toEqual({platform:'gupy',board:'vemprapixeon',postingId:'12725139'});
 expect(detectAts('https://company.example/job/'+encoded)).toBeNull();
});
