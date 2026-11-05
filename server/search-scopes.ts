import type {Filters,Workspace} from '../shared/types';

/** Remote hiring territory and a local workplace must never share one query. */
export function searchWorkspaces(workspace:Workspace):Workspace[]{
 const modes=workspace.filters.modalities.length?workspace.filters.modalities:[''];
 return modes.flatMap(mode=>{
  const remote=mode==='Remoto'&&workspace.filters.remoteAnywhere!==false;
  const places=remote||!workspace.filters.locations.length?['']:workspace.filters.locations.slice(0,3);
  return places.map(place=>({...workspace,filters:{...workspace.filters,modalities:mode?[mode]:[],locations:remote?workspace.filters.locations:place?[place]:[]}}));
 });
}
export function searchPlace(filters:Filters){
 return filters.modalities.length===1&&filters.modalities[0]==='Remoto'&&filters.remoteAnywhere!==false
  ? 'Brasil' : filters.locations[0]||'Brasil';
}
export function searchScopeText(filters:Filters){
 const modes=filters.modalities.length?filters.modalities.join(' ou '):'todas as modalidades';
 return `Busque somente vagas ${modes}, no território ${searchPlace(filters)}. Não inclua modalidades não selecionadas. Para remoto, confirme o território de contratação; sede da empresa não é o local de trabalho.`;
}
