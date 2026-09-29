# Recipe takeoff rules

Recipes do not contain geometry formulas. They select a named takeoff basis and optional commercial/production adjustments.

Examples:

| Application | Basis | Factor | Meaning |
| --- | --- | ---: | --- |
| Compriband outside | perimeter | 1 | external contour once |
| Sealant outside | perimeter | 1 | external contour once |
| Sealant inside + outside | perimeter | 2 | external contour twice |
| Reveal cladding | two_sides_plus_head | 1 | left + right + head |
| Sill / window board | width | 1 | width only |
| Coupling profile | internal_joint | 1 | internal coupling length |
| Glass/panel allowance | part_area | 1 | sum of part areas |

Waste, rounding and minimum quantities are separate rule attributes. Geometry remains objective and reusable.
