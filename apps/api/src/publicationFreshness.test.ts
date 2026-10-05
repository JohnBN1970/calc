import test from "node:test";
import assert from "node:assert/strict";
import { calculatePublicationFreshness } from "./publicationFreshness.js";

test("nog nooit gepubliceerd",()=>{
  const result=calculatePublicationFreshness({
    latest:{id:2,versionNo:2,status:"draft"},
    latestEstablished:null,
    officeResult:null
  });
  assert.equal(result.status,"never_published");
});

test("gepubliceerde versie is actueel",()=>{
  const result=calculatePublicationFreshness({
    latest:{id:2,versionNo:2,status:"established"},
    latestEstablished:{id:2,versionNo:2},
    officeResult:{calcVersion:"2",officeVersion:"7",currentForOfficeVersion:true}
  });
  assert.equal(result.status,"current");
});

test("nieuw Calc-concept maakt Office niet fout maar wel achterlopend",()=>{
  const result=calculatePublicationFreshness({
    latest:{id:3,versionNo:3,status:"draft"},
    latestEstablished:{id:2,versionNo:2},
    officeResult:{calcVersion:"2",officeVersion:"7",currentForOfficeVersion:true}
  });
  assert.equal(result.status,"draft_pending");
});

test("Office-wijziging na publicatie wordt expliciet zichtbaar",()=>{
  const result=calculatePublicationFreshness({
    latest:{id:2,versionNo:2,status:"established"},
    latestEstablished:{id:2,versionNo:2},
    officeResult:{calcVersion:"2",officeVersion:"8",currentForOfficeVersion:false}
  });
  assert.equal(result.status,"office_changed");
});

test("Office verwijst nooit stil naar verkeerde Calc-versie",()=>{
  const result=calculatePublicationFreshness({
    latest:{id:3,versionNo:3,status:"established"},
    latestEstablished:{id:3,versionNo:3},
    officeResult:{calcVersion:"2",officeVersion:"8",currentForOfficeVersion:true}
  });
  assert.equal(result.status,"version_mismatch");
});
