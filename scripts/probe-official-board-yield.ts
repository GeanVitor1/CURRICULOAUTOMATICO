import {writeFile} from 'node:fs/promises';
import {operatorStore} from './operator-firestore';
import {and,eq} from '../server/storage-types';
import {connectors} from '../server/connectors';
import {screenDiscovery} from '../server/discovery-quality';
import type {Source} from '../shared/types';
const source:Source={id:'catalog:ashby:truelogic',board:'truelogic',company:'Truelogic',type:'ashby',enabled:true,discovery:true,application:false,status:''};
const {store,operatorEmail}=await operatorStore();
try{
 const [u]=await store.select('users',{where:eq('email',operatorEmail)}),[r]=await store.select('workspaces',{where:and(eq('userId',u.id),eq('demo',false))});
 const jobs=await connectors.ashby.discover(source),result=screenDiscovery(r.data,source,jobs,new Date().toISOString());
 const report={readOnly:true,employerWrites:0,source,profileYears:r.data.profile.years,languageSummary:r.data.profile.languages,productivity:result.productivity,candidates:result.jobs.filter(j=>j.match.score>=r.data.routine.minScore).map(j=>({url:j.url,title:j.title,publishedAt:j.publishedAt,score:j.match.score,blockers:j.match.blockers,description:j.description})),technicalRecent:jobs.filter(j=>/\.net|angular/i.test(j.title)&&j.publishedAt&&Date.now()-Date.parse(j.publishedAt)<14*86400000).map(j=>({title:j.title,url:j.url,publishedAt:j.publishedAt,description:j.description}))};
 await writeFile('artifacts/official-board-yield-2026-10-23.json',JSON.stringify(report,null,2));console.log(JSON.stringify({productivity:report.productivity,candidates:report.candidates.map(j=>({title:j.title,url:j.url,score:j.score})),profileYears:report.profileYears,languageSummary:report.languageSummary}));
}finally{await store.close();}
