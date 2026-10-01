type Variables = Record<string, number>;

function tokenize(formula:string):string[] {
  const tokens:string[]=[];
  const re=/\s*(\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|[()+\-*/,])\s*/gy;
  let index=0;
  while(index<formula.length){
    re.lastIndex=index;
    const match=re.exec(formula);
    if(!match||match.index!==index) throw new Error("Ongeldige of niet-ondersteunde receptformule.");
    tokens.push(match[1]);
    index=re.lastIndex;
  }
  return tokens;
}

export function evaluateRecipeFormula(formula:string|null|undefined,variables:Variables):number {
  const source=String(formula??"").trim();
  if(!source) return 0;
  const tokens=tokenize(source);
  let pos=0;

  const expression=():number=>{
    let value=term();
    while(tokens[pos]==="+"||tokens[pos]==="-"){
      const op=tokens[pos++],rhs=term();
      value=op==="+"?value+rhs:value-rhs;
    }
    return value;
  };
  const term=():number=>{
    let value=factor();
    while(tokens[pos]==="*"||tokens[pos]==="/"){
      const op=tokens[pos++],rhs=factor();
      if(op==="/"&&Math.abs(rhs)<Number.EPSILON) throw new Error("Deling door nul in receptformule.");
      value=op==="*"?value*rhs:value/rhs;
    }
    return value;
  };
  const fn=(name:string):number=>{
    pos++; // (
    const args:number[]=[];
    if(tokens[pos]!==")"){
      while(true){
        args.push(expression());
        if(tokens[pos]!==",") break;
        pos++;
      }
    }
    if(tokens[pos]!==")") throw new Error("Sluitende haak ontbreekt in receptfunctie.");
    pos++;
    if(name==="min"){if(!args.length)throw new Error("min() vereist argumenten.");return Math.min(...args);}
    if(name==="max"){if(!args.length)throw new Error("max() vereist argumenten.");return Math.max(...args);}
    if(name==="round"){if(args.length!==1)throw new Error("round() vereist één argument.");return Math.round(args[0]);}
    if(name==="ceil"){if(args.length!==1)throw new Error("ceil() vereist één argument.");return Math.ceil(args[0]);}
    if(name==="floor"){if(args.length!==1)throw new Error("floor() vereist één argument.");return Math.floor(args[0]);}
    throw new Error(`Niet-ondersteunde receptfunctie: ${name}`);
  };
  const factor=():number=>{
    const token=tokens[pos];
    if(token==null) throw new Error("Onverwacht einde van receptformule.");
    if(token==="+"||token==="-"){pos++;const v=factor();return token==="-"?-v:v;}
    if(token==="("){pos++;const v=expression();if(tokens[pos]!==")")throw new Error("Sluitende haak ontbreekt.");pos++;return v;}
    if(/^\d/.test(token)){pos++;return Number(token);}
    if(/^[A-Za-z_]/.test(token)){
      pos++;
      if(tokens[pos]==="(") return fn(token);
      if(!(token in variables)||!Number.isFinite(variables[token])) throw new Error(`Onbekende receptvariabele: ${token}`);
      return variables[token];
    }
    throw new Error("Ongeldig token in receptformule.");
  };

  const result=expression();
  if(pos!==tokens.length) throw new Error("Onverwacht token in receptformule.");
  if(!Number.isFinite(result)) throw new Error("Receptformule gaf geen eindige waarde.");
  return result;
}
