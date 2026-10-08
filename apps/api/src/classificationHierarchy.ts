export type HierarchyLine={
  id?:number|null;
  parentId?:number|null;
  lineType:string;
  code?:string|null;
};

function normalized(value:string|null|undefined):string{
  return String(value??"").trim().replace(/\s+/g,"");
}

export function normalizeNlSfbParents<T extends HierarchyLine>(lines:T[]):T[]{
  const chapterByDigit=new Map<string,T>();
  for(const line of lines){
    if(line.lineType!=="chapter")continue;
    const code=normalized(line.code);
    const match=code.match(/^([1-9])[-.]?$/);
    if(match)chapterByDigit.set(match[1],line);
  }
  return lines.map(line=>{
    if(line.lineType!=="paragraph")return line;
    const code=normalized(line.code);
    const match=code.match(/^([1-9])\d$/);
    if(!match)return line;
    const chapter=chapterByDigit.get(match[1]);
    if(!chapter||chapter.id==null)return line;
    if(line.parentId===chapter.id)return line;
    return{...line,parentId:Number(chapter.id)};
  });
}
