import {expect,it} from 'vitest';
import {activateAuthorizedPortal} from '../server/submission-consent';
import {createWorkspace} from '../server/workspace';
import {submissionRoute} from '../server/submission-routing';
import type {Job} from '../shared/types';
function workspace(){
 const w=createWorkspace('Pessoa','qa@example.test');w.profile.confirmed=true;
 w.resumes=[{id:'resume',approved:true} as any];
 w.interview={completed:true,answers:{sites:['gupy'],resumeId:'resume'}} as any;
 w.routine.destinationPolicy='official';
 w.sources=[{id:'gupy',board:'gupy',type:'portal',enabled:true,application:true,discovery:true,company:'Gupy',status:''}];
 return w;
}
it('makes the explicitly authorized connected portal usable alongside public forms',()=>{
 const w=workspace(),job={url:'https://empresa.gupy.io/jobs/123',destinations:[],resolution:{state:'partial'}} as any as Job;
 expect(submissionRoute(w,job,['gupy'])).toBeNull();
 expect(activateAuthorizedPortal(w,'gupy','resume',['gupy'])).toBe(true);
 expect(w.routine.destinationPolicy).toBe('any');expect(w.routine.mode).toBe('automatic');
 expect(submissionRoute(w,job,['gupy'])?.method).toBe('browser');
});
it.each(['disconnected','wrong_resume','unapproved_resume','unselected_portal','unconfirmed_profile'])(
 'does not enable automation for %s',condition=>{
  const w=workspace(),ready=condition==='disconnected'?[]:['gupy'];
  if(condition==='unapproved_resume')w.resumes[0].approved=false;
  if(condition==='unselected_portal')w.interview!.answers.sites=['infojobs'];
  if(condition==='unconfirmed_profile')w.profile.confirmed=false;
  const before=JSON.stringify(w);
  expect(activateAuthorizedPortal(w,'gupy',condition==='wrong_resume'?'different':'resume',ready)).toBe(false);
  expect(JSON.stringify(w)).toBe(before);
 });
