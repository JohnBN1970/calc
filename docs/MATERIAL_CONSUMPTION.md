# Material consumption conversions

Recipe quantities describe technical need. Articles are bought in commercial units. A conversion sits between those two layers.

Supported conversion types:
- direct: recipe quantity already matches article content unit;
- paint_liter: m2 x coats / coverage = litres;
- linear_roll: required metres feed roll/package costing;
- sheet_by_area: required m2 -> whole sheets by sheet dimensions;
- piece: required quantity -> whole pieces.

Examples:
- 155 m2, 2 coats, 8 m2/l = 38.75 litres before can packaging;
- 214 m compriband = 214 m before roll packaging;
- 23 m2 board with 1.22 x 2.44 m sheets = 8 sheets before package/order rules.

The conversion is deliberately separate from:
1. technical waste in the recipe;
2. commercial packaging remainder;
3. article price.

That separation keeps every cost explainable.
