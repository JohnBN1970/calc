# Calculation establishment gate

Calc separates **saving a draft** from **establishing and publishing a version**.

A draft save stays inside Calc. It may update calculation lines, structure, scopes, subcalculations, tail costs and calculated totals, but it does not publish a commercial result to Office.

## Workbench establishment gate

The active spreadsheet workbench establishes versions through snapshot contract `brebo-calc-workbench-snapshot-v3`.

Before a draft may be established, Calc reloads the stored version and verifies that:

- the calculation contains at least one priced calculation line;
- the current direct cost matches the last stored Calc direct cost;
- evaluated tail costs match the stored markup amount;
- direct cost plus tail costs equals the sales price;
- subcalculation ownership and financial partitions can be evaluated without overlap errors;
- every commercial sales amount is covered by an explicit Calc VAT regime;
- the VAT taxable bases together cover the complete sales price;
- every line has a stable structure key and every parent reference can be resolved.

Only after these checks does Calc create the immutable workbench snapshot and SHA-256 content hash.

## Publish order

The establishment flow is intentionally ordered:

1. validate the persisted Calc draft;
2. build snapshot v3 and its fingerprint;
3. publish only the commercial summary + VAT breakdown to Office;
4. read the Office result back and verify the roundtrip;
5. persist the immutable snapshot and mark the Calc version `established`.

If publication or verification fails, Calc does not establish the version.

## Immutability

An established version is read-only. Version-bound mutations are rejected server-side and the workbench is read-only in the UI.

Further changes require a new draft version. Calc reconstructs that draft from the immutable snapshot using stable structure keys rather than reusing old database IDs.

## Older snapshot contracts

Snapshot v1/v2 remain part of the technical calculation-pipeline history. New spreadsheet-workbench publications use snapshot v3.
