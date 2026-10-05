import test from "node:test";
import assert from "node:assert/strict";
import { deriveSourceContextBinding, sourceContextIsCurrent } from "./sourceContextBinding.js";

const details=(officeVersion:string,selectionVersion:string|null)=>JSON.stringify({
  context_binding:{officeVersion,selectionVersion}
});

test("handmatige calculatie vereist geen broncontextbinding",()=>{
  assert.deepEqual(deriveSourceContextBinding([{priceSourceType:"manual",sourceDetails:null}]),{
    sourceLineCount:0,status:"not_required",binding:null
  });
});

test("receptregels met gelijke context leveren één binding",()=>{
  const result=deriveSourceContextBinding([
    {priceSourceType:"recipe",sourceDetails:details("7","sel-2")},
    {priceSourceType:"recipe",sourceDetails:details("7","sel-2")}
  ]);
  assert.equal(result.status,"bound");
  assert.deepEqual(result.binding,{officeVersion:"7",selectionVersion:"sel-2"});
});

test("oude of gemengde receptcontext wordt niet stil geaccepteerd",()=>{
  assert.equal(deriveSourceContextBinding([{priceSourceType:"recipe",sourceDetails:"{}"}]).status,"unbound");
  assert.equal(deriveSourceContextBinding([
    {priceSourceType:"recipe",sourceDetails:details("7","a")},
    {priceSourceType:"recipe",sourceDetails:details("8","b")}
  ]).status,"mixed");
});

test("binding moet zowel Office- als documentselectieversie volgen",()=>{
  const binding={officeVersion:"7",selectionVersion:"sel-2"};
  assert.equal(sourceContextIsCurrent({binding,officeVersion:"7",selectionVersion:"sel-2"}),true);
  assert.equal(sourceContextIsCurrent({binding,officeVersion:"8",selectionVersion:"sel-2"}),false);
  assert.equal(sourceContextIsCurrent({binding,officeVersion:"7",selectionVersion:"sel-3"}),false);
});
