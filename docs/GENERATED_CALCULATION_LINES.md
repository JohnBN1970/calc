# Recipe-generated calculation lines

Calc can now turn approved geometry/takeoff into traceable calculation lines.

Flow:
`position geometry -> takeoff -> recipe rule -> generated calculation line`

Every generated line retains:
- position reference;
- recipe and recipe-line reference;
- takeoff basis;
- factor;
- waste percentage;
- generated quantity and unit.

Examples:
- outside compriband: perimeter x 1;
- inside + outside sealant: perimeter x 2;
- reveal cladding: two sides + head;
- sill/window board: width;
- coupling profile: internal joint.

Generated lines can be aggregated for the calculation while their source rows preserve the per-position derivation. This is essential: totals remain explainable and can be recalculated when geometry or a recipe changes.

Price/article selection remains a separate step; this module generates quantities, not supplier truth.
