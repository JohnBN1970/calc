import test from "node:test";
import assert from "node:assert/strict";
import { generateCalcOwnedRecipeLines } from "./calcOwnedRecipeGenerator.js";
import type { CalcRecipeVersion } from "./calcRecipeRepository.js";
import type { OfficeCalcSourceResolution } from "./officeClient.js";

const recipe:CalcRecipeVersion={
  id:10,recipeId:5,recipeKey:"test",name:"Test",description:null,versionNo:1,status:"published",applicability:null,
  lines:[{
    id:1,lineRef:"M1",sortOrder:1,costKind:"material",description:"Materiaal",unit:"m2",
    quantitySourceType:null,quantitySourceRef:null,costSourceType:"article",costSourceRef:"A-1",
    takeoffBasis:"area",factor:1,wastePct:0,fixedQuantity:null,roundingStep:null,minimumQuantity:null,metadata:null
  }]
};
const takeoff={id:1,position_ref:"K1",quantity:1,width_mm:1000,height_mm:1000};

test("ontbrekende kostprijsbron wordt unresolved en nooit een resolved nulprijs",()=>{
  const resolution:OfficeCalcSourceResolution={
    contract:"brebo-office-calc-source-resolution-v1",project_id:1,
    results:[{request_index:0,type:"article",ref:"A-1",status:"unresolved",value:null,unit:null,description:"",source:{},reason:"Office article source not found: A-1"}]
  };
  const [line]=generateCalcOwnedRecipeLines({recipe,takeoff,resolution});
  assert.equal(line.resolutionStatus,"unresolved");
  assert.match(line.resolutionReason??"",/not found/);
  assert.equal(line.sourceUnitPrice,null);
  assert.equal(line.material,0);
});

test("gevonden kostprijsbron blijft resolved",()=>{
  const resolution:OfficeCalcSourceResolution={
    contract:"brebo-office-calc-source-resolution-v1",project_id:1,
    results:[{request_index:0,type:"article",ref:"A-1",status:"resolved",value:12.5,unit:"m2",description:"Materiaal",source:{price_id:7}}]
  };
  const [line]=generateCalcOwnedRecipeLines({recipe,takeoff,resolution});
  assert.equal(line.resolutionStatus,"resolved");
  assert.equal(line.material,12.5);
  assert.equal(line.sourceUnitPrice,12.5);
});


test("conceptbron en pagina blijven traceerbaar in receptregel",()=>{
  const resolution:OfficeCalcSourceResolution={
    contract:"brebo-office-calc-source-resolution-v1",project_id:1,
    results:[{request_index:0,type:"article",ref:"A-1",status:"resolved",value:12.5,unit:"m2",description:"Materiaal",source:{price_id:7}}]
  };
  const [line]=generateCalcOwnedRecipeLines({
    recipe,
    takeoff,
    resolution,
    evidence:{
      documentIds:[12,18],
      pages:[3,4],
      components:[{
        componentRef:"V1",componentKind:"operable",componentType:"draaikiep",
        documentId:12,sourcePage:3,sourceFragment:"V1 draaikiep HR++"
      }]
    }
  });
  const details=JSON.parse(line.sourceDetails);
  assert.equal(details.position_ref,"K1");
  assert.equal(details.recipe.key,"test");
  assert.deepEqual(details.evidence.document_ids,[12,18]);
  assert.deepEqual(details.evidence.pages,[3,4]);
  assert.deepEqual(details.evidence.components,[{
    componentRef:"V1",componentKind:"operable",componentType:"draaikiep",
    documentId:12,sourcePage:3,sourceFragment:"V1 draaikiep HR++"
  }]);
});


test("positiecontext blijft in sourceDetails van receptregel behouden",()=>{
  const resolution:OfficeCalcSourceResolution={
    contract:"brebo-office-calc-source-resolution-v1",project_id:1,
    results:[{request_index:0,type:"article",ref:"A-1",status:"resolved",value:12.5,unit:"m2",description:"Materiaal",source:{price_id:7}}]
  };
  const [line]=generateCalcOwnedRecipeLines({recipe,takeoff,resolution,scopes:[
    {type:"facade",ref:"Noord"},{type:"dwelling_type",ref:"Type A"}
  ]});
  const details=JSON.parse(line.sourceDetails);
  assert.deepEqual(details.context_scopes,[
    {type:"facade",ref:"Noord"},{type:"dwelling_type",ref:"Type A"}
  ]);
});


test("component-scoped area rekent alleen geselecteerde glasvakken",()=>{
  const componentRecipe:CalcRecipeVersion={
    ...recipe,
    id:11,
    lines:[{
      ...recipe.lines[0],
      id:2,
      lineRef:"G1",
      description:"Glas",
      takeoffBasis:"area",
      metadata:{componentKind:"glass"}
    }]
  };
  const resolution:OfficeCalcSourceResolution={
    contract:"brebo-office-calc-source-resolution-v1",project_id:1,
    results:[{request_index:0,type:"article",ref:"A-1",status:"resolved",value:10,unit:"m2",description:"Glas",source:{price_id:8}}]
  };
  const components:any[]=[
    {
      id:1,document_id:1,position_ref:"K1",component_ref:"V1",parent_component_ref:"K1",
      component_type:"glas",classification_ref:null,description:"Glasvak 1",quantity:1,width_mm:500,height_mm:1000,
      area_m2:null,perimeter_m:null,source_page:1,source_fragment:null,extraction_method:"managed",confidence:1,review_status:"reviewed",
      component_kind:"glass",component_kind_source:"explicit",calculated_area_m2:.5,calculated_perimeter_m:3,
      effective_area_m2:.5,effective_perimeter_m:3,geometry_status:"complete",warnings:[]
    },
    {
      id:2,document_id:1,position_ref:"K1",component_ref:"V2",parent_component_ref:"K1",
      component_type:"glas",classification_ref:null,description:"Glasvak 2",quantity:2,width_mm:400,height_mm:1000,
      area_m2:null,perimeter_m:null,source_page:1,source_fragment:null,extraction_method:"managed",confidence:1,review_status:"reviewed",
      component_kind:"glass",component_kind_source:"explicit",calculated_area_m2:.8,calculated_perimeter_m:5.6,
      effective_area_m2:.8,effective_perimeter_m:5.6,geometry_status:"complete",warnings:[]
    }
  ];
  const [line]=generateCalcOwnedRecipeLines({recipe:componentRecipe,takeoff,resolution,components});
  assert.equal(line.quantity,1.3);
  assert.equal(line.material,10);
  const details=JSON.parse(line.sourceDetails);
  assert.equal(details.quantity_rule.component_kind,"glass");
});

test("component-scoped receptregel valt nooit stil terug op hele positie",()=>{
  const componentRecipe:CalcRecipeVersion={
    ...recipe,
    id:12,
    lines:[{
      ...recipe.lines[0],
      id:3,
      lineRef:"P1",
      description:"Paneel",
      takeoffBasis:"area",
      metadata:{componentKind:"panel"}
    }]
  };
  const resolution:OfficeCalcSourceResolution={
    contract:"brebo-office-calc-source-resolution-v1",project_id:1,
    results:[{request_index:0,type:"article",ref:"A-1",status:"resolved",value:10,unit:"m2",description:"Paneel",source:{price_id:9}}]
  };
  assert.throws(
    ()=>generateCalcOwnedRecipeLines({recipe:componentRecipe,takeoff,resolution,components:[]}),
    /Geen vak\/component/
  );
});
