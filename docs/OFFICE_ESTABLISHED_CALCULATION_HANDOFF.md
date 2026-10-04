# Calc result handoff to Office

Calc owns the complete calculation: structure, lines, recipes, subcalculations, tail costs, VAT assignment, versions and calculation logic.

Office does not receive or reconstruct that calculation. The Calc -> Office boundary contains only the commercial result that Office needs for downstream business processes.

## Draft boundary

Saving a Calc draft does **not** publish anything to Office.

This is a hard boundary: work-in-progress changes remain Calc-owned until the user explicitly establishes and publishes a version.

## Publication contract

The published commercial summary contains:

- purchase total;
- sales total;
- margin;
- margin percentage;
- total VAT;
- VAT breakdown per configured Calc VAT regime.

Each VAT breakdown item contains the regime code and label, rate where applicable, taxable base, VAT amount and whether VAT is reverse charged.

For mixed VAT calculations, Office receives multiple breakdown items. Reverse-charge and exempt regimes keep their taxable base while contributing no VAT amount.

## Publication gate

Calc publishes only after its persisted draft is publication-ready. The gate checks financial consistency, subcalculation integrity and complete VAT coverage.

Calc then creates an immutable workbench snapshot and content hash, publishes the commercial summary, and reads the Office state back.

The Calc version becomes `established` only after that roundtrip verifies successfully.

## Ownership rule

Office may store and present the commercial summary and canonical Calc-version reference, but must not reconstruct or become authoritative for:

- chapters or paragraphs;
- calculation lines;
- recipes;
- subcalculations;
- tail costs;
- line-level VAT choices;
- calculation formulas;
- Calc version snapshots.

Those remain Calc-owned.

## Follow-up changes

An established Calc version is immutable. A later change starts a new Calc draft version reconstructed from the established snapshot. Office continues to receive only explicitly published established results.
