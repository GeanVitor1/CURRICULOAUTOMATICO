import type {BrowserSessionPortal} from '../shared/browser-connectors';

export default function ConnectionBrand({portal}:{portal:BrowserSessionPortal}){
 return <span className={`connection-brand connection-brand-${portal}`} aria-hidden="true">{portal==='linkedin'?'in':portal==='infojobs'?'ij':portal==='gupy'?'g':<span className="connection-glassdoor-mark"/>}</span>;
}
