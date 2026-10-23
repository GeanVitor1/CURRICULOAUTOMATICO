import {load} from 'cheerio';
import {parse} from 'acorn';

/** Decode a Nuxt 2 data literal without executing publisher JavaScript. */
export function nuxtPublicData(html:string):Record<string,any>|null {
  try {
    const $=load(html),scripts=$('script:not([src])').toArray().map(n=>$(n).text()).filter(s=>s.startsWith('window.__NUXT__='));
    if(scripts.length!==1||scripts[0].length>500000)return null;
    const ast:any=parse(scripts[0],{ecmaVersion:'latest'});
    if(ast.body.length!==1)return null;
    const assignment=ast.body[0].expression,left=assignment?.left,call=assignment?.right,fn=call?.callee;
    if(assignment?.type!=='AssignmentExpression'||assignment.operator!=='='||left?.type!=='MemberExpression'||left.computed||left.object?.name!=='window'||left.property?.name!=='__NUXT__'||call?.type!=='CallExpression'||fn?.type!=='FunctionExpression'||fn.async||fn.generator||fn.body.body.length!==1||fn.body.body[0].type!=='ReturnStatement'||fn.params.some((p:any)=>p.type!=='Identifier')||fn.params.length!==call.arguments.length)return null;
    const bindings=new Map<string,unknown>();let nodes=0;
    const decode=(n:any,depth=0):any=>{
      if(!n||++nodes>30000||depth>80)throw new Error('Invalid data literal');
      if(n.type==='Literal'&&!n.regex&&['string','number','boolean','object'].includes(typeof n.value))return n.value;
      if(n.type==='Identifier'&&bindings.has(n.name))return bindings.get(n.name);
      if(n.type==='UnaryExpression'&&n.operator==='void'&&n.argument.type==='Literal'&&n.argument.value===0)return undefined;
      if(n.type==='UnaryExpression'&&n.operator==='-'&&n.argument.type==='Literal'&&typeof n.argument.value==='number')return -n.argument.value;
      if(n.type==='ArrayExpression')return n.elements.map((v:any)=>v?decode(v,depth+1):null);
      if(n.type==='ObjectExpression') {
        const result=Object.create(null);
        for(const p of n.properties) {
          if(p.type!=='Property'||p.kind!=='init'||p.method||p.computed)throw new Error('Invalid property');
          const key=p.key.type==='Identifier'?p.key.name:p.key.value;
          if(typeof key!=='string'||['__proto__','constructor','prototype'].includes(key)||Object.hasOwn(result,key))throw new Error('Invalid key');
          result[key]=decode(p.value,depth+1);
        }
        return result;
      }
      throw new Error('Executable expressions are not publisher data');
    };
    const values=call.arguments.map((value:any)=>decode(value));
    fn.params.forEach((param:any,i:number)=>bindings.set(param.name,values[i]));
    const data=decode(fn.body.body[0].argument);
    return data&&typeof data==='object'&&!Array.isArray(data)?data:null;
  }catch{return null;}
}
