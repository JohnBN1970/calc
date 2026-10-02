import test from "node:test";
import assert from "node:assert/strict";
import { generatedScopeTags } from "./lineScopeRepository.js";

test("gegenereerde scope-tags bevatten positie recept en Office-context",()=>{
  const tags=generatedScopeTags({
    priceSourceType:"recipe",
    sourceDetails:JSON.stringify({
      position_ref:"K1",
      recipe:{key:"kozijn"},
      context_scopes:[
        {type:"building",ref:"Gebouw A"},
        {type:"facade",ref:"Noord"},
        {type:"dwelling_type",ref:"Type A"},
        {type:"unknown",ref:"NEE"}
      ]
    })
  });
  assert.deepEqual(tags,[
    {scopeType:"position",scopeRef:"K1",source:"generated"},
    {scopeType:"recipe",scopeRef:"kozijn",source:"generated"},
    {scopeType:"building",scopeRef:"Gebouw A",source:"office_context"},
    {scopeType:"facade",scopeRef:"Noord",source:"office_context"},
    {scopeType:"dwelling_type",scopeRef:"Type A",source:"office_context"}
  ]);
});
