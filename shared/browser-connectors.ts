/** Explicit per-provider session boundaries, shared by server and extension. */
export const browserConnectors = {
  gupy: {name:'Gupy',domains:['gupy.io'],accountUrl:'https://portal.gupy.io/my/applications',
    signedSelector:'#header-message-icon, a[href*="logout"], a[href*="signout"], button[aria-label*="Abrir menu de usuário"]'},
  infojobs: {name:'InfoJobs',domains:['infojobs.com.br'],accountUrl:'https://www.infojobs.com.br/candidate/',
    signedSelector:'a[href*="Logout"], a[href*="logout"], a[href*="Candidate/CV"], a[href*="candidate/cv"]'},
  glassdoor: {name:'Glassdoor',domains:['glassdoor.com','glassdoor.com.br'],accountUrl:'https://www.glassdoor.com/member/profile/',
    signedSelector:'a[href*="logout"], a[href*="signout"], [data-test="user-profile-menu"]'},
  linkedin: {name:'LinkedIn',domains:['linkedin.com'],accountUrl:'https://www.linkedin.com/feed/',
    // The current feed no longer exposes global-nav classes. Require both
    // private-navigation links and an expandable avatar menu, not any photo.
    signedSelector:'.global-nav__me, .global-nav__me-photo, .global-nav__primary-link-me-menu-trigger, body:has(a[href*="/messaging/"]):has(a[href*="/mynetwork/"]) button[aria-expanded]:has(img)'},
} as const;
export type BrowserSessionPortal=keyof typeof browserConnectors;
/** LinkedIn stays in the person's browser. Never export its authentication. */
export const browserConnectionMode=(portal:BrowserSessionPortal)=>portal==='linkedin'?'local-browser':'cloud-session';
export const isBrowserSessionPortal=(value:string):value is BrowserSessionPortal=>Object.hasOwn(browserConnectors,value);
export function sessionDomain(portal:BrowserSessionPortal,domain:string){
 const host=domain.replace(/^\./,'').toLowerCase();
 return /^[a-z0-9.-]+$/.test(host)&&browserConnectors[portal].domains.some(root=>host===root||host.endsWith('.'+root));
}
