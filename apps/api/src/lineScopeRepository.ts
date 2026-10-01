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
