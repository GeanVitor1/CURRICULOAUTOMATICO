import {expect,it,vi} from 'vitest';
import {authEntryPath,clearAppReturn,pendingAppReturn,rememberAppReturn,safeAppReturn,saveTheme,storedTheme} from '../shared/browser-navigation';

const storage=()=>{const values=new Map<string,string>();return {getItem:(k:string)=>values.get(k)||null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};};
it('preserves the connections page and connection flow across authentication without carrying arbitrary parameters',()=>{
 expect(safeAppReturn('/app#conexoes')).toBe('/app#conexoes');
 expect(safeAppReturn('/app?portal=linkedin&flow=connections&tab=999&returnTo=https://evil.test')).toBe('/app?portal=linkedin&flow=connections');
});
it.each(['gupy','infojobs','glassdoor','linkedin'])('preserves the selected %s portal across login and registration',portal=>{
 const store=storage(),target='/app?portal='+portal;
 expect(rememberAppReturn(store,target)).toBe(target);
 const entry=authEntryPath('/login',target),search=new URL(entry,'https://app.test').search;
 expect(pendingAppReturn(search,null)).toBe(target);
 expect(authEntryPath('/register',pendingAppReturn(search,store))).toContain('returnTo=');
 expect(pendingAppReturn('',store)).toBe(target);clearAppReturn(store);expect(pendingAppReturn('',store)).toBeNull();
});
it.each(['https://evil.test/app','//evil.test/app','/\\evil.test/app','javascript:alert(1)','/api/auth/google','/app/../login'])('rejects an unsafe or non-app return: %s',target=>{
 expect(safeAppReturn(target)).toBeNull();expect(authEntryPath('/login',target)).toBe('/login');
});
it('drops unrelated parameters and unknown fragments',()=>{
 expect(safeAppReturn('/app?portal=infojobs&token=never-store#unknown')).toBe('/app?portal=infojobs');
 expect(safeAppReturn('/app?redirect=https://evil.test#unknown')).toBe('/app');
 expect(safeAppReturn('/app#curriculo')).toBe('/app#curriculo');
});
it('continues navigation and theme changes when storage is unavailable',()=>{
 const blocked={getItem:vi.fn(()=>{throw Error('Blocked');}),setItem:vi.fn(()=>{throw Error('Quota exceeded');}),removeItem:vi.fn(()=>{throw Error('Blocked');})};
 expect(storedTheme(blocked)).toBe('light');expect(()=>saveTheme(blocked,'light')).not.toThrow();
 expect(rememberAppReturn(blocked,'/app?portal=linkedin')).toBe('/app?portal=linkedin');
 expect(pendingAppReturn('?returnTo=%2Fapp%3Fportal%3Dlinkedin',blocked)).toBe('/app?portal=linkedin');
 expect(pendingAppReturn('',blocked)).toBeNull();expect(()=>clearAppReturn(blocked)).not.toThrow();
});
it('uses only supported themes',()=>{
 const store=storage();store.setItem('orbita-theme','invalid');expect(storedTheme(store)).toBe('light');
 saveTheme(store,'dark');expect(storedTheme(store)).toBe('dark');
});
