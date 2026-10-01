import test from "node:test";
import assert from "node:assert/strict";
import { verifyOfficeCalcResultSync, type OfficeCalcResultReadModel } from "./calcResultSync.js";

function model(overrides:Partial<OfficeCalcResultReadModel> = {}):OfficeCalcResultReadModel {
  return {
    snapshot_id: 7,
    content_hash: "abc123",
    published_by: 1,
    published_at: 1_700_000_000,
    calculation_id: 41,
    office_version: "v3",
    calc_version: "12",
    current_for_office_version: true,
    lines: [{description:"Materiaal"},{description:"Arbeid"}],
    totals: {direct_cost:100,markup_amount:30,sales_price:130},
    source: {engine:"brebo-calc"},
    ...overrides
  };
}

test("Office roundtrip bevestigt exact Calc-resultaat", () => {
  assert.doesNotThrow(() => verifyOfficeCalcResultSync({
    publishedContentHash:"abc123",
    expectedOfficeVersion:"v3",
    expectedTotals:{direct_cost:100,markup_amount:30,sales_price:130},
    expectedLineCount:2,
    calcResult:model()
  }));
});

test("Office roundtrip weigert andere hash", () => {
  assert.throws(() => verifyOfficeCalcResultSync({
    publishedContentHash:"abc123",
    expectedOfficeVersion:"v3",
    expectedTotals:{direct_cost:100,markup_amount:30,sales_price:130},
    expectedLineCount:2,
    calcResult:model({content_hash:"anders"})
  }), /content_hash/);
});

test("Office roundtrip weigert stale Office-versie", () => {
  assert.throws(() => verifyOfficeCalcResultSync({
    publishedContentHash:"abc123",
    expectedOfficeVersion:"v3",
    expectedTotals:{direct_cost:100,markup_amount:30,sales_price:130},
    expectedLineCount:2,
    calcResult:model({current_for_office_version:false})
  }), /actuele Office-versie/);
});

test("Office roundtrip weigert afwijkende totalen of regels", () => {
  assert.throws(() => verifyOfficeCalcResultSync({
    publishedContentHash:"abc123",
    expectedOfficeVersion:"v3",
    expectedTotals:{direct_cost:100,markup_amount:30,sales_price:130},
    expectedLineCount:2,
    calcResult:model({totals:{direct_cost:99,markup_amount:30,sales_price:129}})
  }), /direct_cost/);

  assert.throws(() => verifyOfficeCalcResultSync({
    publishedContentHash:"abc123",
    expectedOfficeVersion:"v3",
    expectedTotals:{direct_cost:100,markup_amount:30,sales_price:130},
    expectedLineCount:3,
    calcResult:model()
  }), /Aantal Calc-regels/);
});
