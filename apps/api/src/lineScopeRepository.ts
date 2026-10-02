import type { PoolConnection } from "mysql2/promise";

export type LineScopeTag={
  scopeType:"building"|"facade"|"dwelling"|"dwelling_type"|"building_part"|"position"|"structure"|"recipe"|"custom";
  scopeRef:string;
  source:"generated"|"manual"|"office_context";
};

export function generatedScopeTags(input:{priceSourceType?:string|null;sourceDetails?:string|null}):LineScopeTag[]{
  if(input.priceSourceType!=="recipe"||!input.sourceDetails)return [];
  try{
    const details=JSON.parse(input.sourceDetails) as any;
    const tags:LineScopeTag[]=[];
    const position=String(details?.position_ref??"").trim();
    const recipe=String(details?.recipe?.key??"").trim();
    if(position)tags.push({scopeType:"position",scopeRef:position,source:"generated"});
    if(recipe)tags.push({scopeType:"recipe",scopeRef:recipe,source:"generated"});
    const allowed=new Set<LineScopeTag["scopeType"]>(["building","facade","dwelling","dwelling_type","building_part"]);
    if(Array.isArray(details?.context_scopes)){
      for(const item of details.context_scopes){
        const scopeType=String(item?.type??"") as LineScopeTag["scopeType"];
        const scopeRef=String(item?.ref??"").trim();
        if(allowed.has(scopeType)&&scopeRef){
          tags.push({scopeType,scopeRef,source:"office_context"});
        }
      }
    }
    return tags;
  }catch{return [];}
}

export async function storeLineScopeTags(connection:PoolConnection,lineId:number,tags:LineScopeTag[]):Promise<void>{
  for(const tag of tags){
    await connection.execute(
      `INSERT INTO calculation_line_scope_tags(line_id,scope_type,scope_ref,source)
       VALUES(?,?,?,?)
       ON DUPLICATE KEY UPDATE source=VALUES(source)`,
      [lineId,tag.scopeType,tag.scopeRef,tag.source]
    );
  }
}


export function manualScopeTags(
  input:Array<{scopeType?:unknown;scopeRef?:unknown}>|null|undefined,
  generated:LineScopeTag[]=[]
):LineScopeTag[]{
  if(!Array.isArray(input))return [];
  const allowed=new Set<LineScopeTag["scopeType"]>(["building","facade","dwelling","dwelling_type","building_part","position","custom"]);
  const generatedKeys=new Set(generated.map(tag=>tag.scopeType+"\u0000"+tag.scopeRef));
  const seen=new Set<string>();
  const tags:LineScopeTag[]=[];
  for(const item of input){
    const scopeType=String(item?.scopeType??"") as LineScopeTag["scopeType"];
    const scopeRef=String(item?.scopeRef??"").trim().slice(0,255);
    const key=scopeType+"\u0000"+scopeRef;
    if(!allowed.has(scopeType)||!scopeRef||seen.has(key)||generatedKeys.has(key))continue;
    seen.add(key);
    tags.push({scopeType,scopeRef,source:"manual"});
  }
  return tags;
}
