# Calc result handoff to Office

Calc owns the complete calculation: structure, lines, recipes, subcalculations, tail costs, VAT assignment and calculation logic.

Office does not receive or reconstruct that calculation. The Calc -> Office boundary contains only the commercial result that Office needs for downstream business processes.

## Contract

The published commercial summary contains:

- purchase total
- sales total
- margin
- margin percentage
- total VAT
- VAT breakdown per configured Calc VAT regime

Each VAT breakdown item contains the regime code and label, rate where applicable, taxable base, VAT amount and whether VAT is reverse charged.

For mixed VAT calculations, Office receives multiple breakdown items. Reverse-charge and exempt regimes keep their taxable base while contributing no VAT amount.

## Ownership rule

Office may store and present the commercial summary, but must not use it to reconstruct or become authoritative for:

- chapters or paragraphs
- calculation lines
- recipes
- subcalculations
- tail costs
- line-level VAT choices
- calculation formulas

Those remain Calc-owned.

## Roundtrip verification

After publishing, Calc reads the Office acknowledgement/state back and verifies that the commercial values and VAT breakdown match what Calc published.

A missing or mismatching commercial acknowledgement is treated as a sync failure. The Calc calculation itself remains the source of truth.
