# Costed calculation line handoff

Generated calculation lines and material-cost results are joined by the stable pair:

- `recipeRef`
- `recipeLineRef`

The join is fail-closed. Missing costs, duplicate cost results or quantity mismatches are rejected instead of guessed.

Each costed line preserves:

- take-off basis, net quantity, waste and gross quantity;
- physical material consumption;
- article and supplier reference;
- source reference and selected calculation date;
- package description and package price;
- purchased quantity, package/order-unit count and packaging remainder;
- total material cost and effective cost per recipe unit.

The Office-facing contract is `brebo-calc-calculation-line-handoff-v1`. It carries calculation/project/version identity, the fully traceable lines and a material-cost total.

Office remains authoritative. This handoff is an explainable proposal/result payload from Calc, not a second calculation truth.
