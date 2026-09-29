# Sheet nesting

Area alone is not enough to price sheet material. Calc therefore supports a geometric first-fit nesting plan.

Inputs:
- commercial sheet width and height;
- edge trim;
- saw kerf;
- required rectangular pieces with quantity;
- whether each piece may rotate;
- optional calculation/work-package grouping reference.

Outputs:
- actual number of full sheets;
- placement coordinates per sheet;
- rotation per piece;
- purchased area;
- used piece area;
- geometric remainder/waste.

The engine uses a practical rectangular free-space heuristic. It is intentionally deterministic and explainable rather than claiming mathematically optimal 2D nesting.

Rotation can be disabled for directional/decorative/grain-sensitive material. A later material-specific rule can also reserve reusable remnants.

Pricing must use the resulting whole-sheet count, not required square metres.
