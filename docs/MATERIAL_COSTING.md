# Purchasable material costing

Calc must price what BREBO actually has to buy, not an artificial fractional unit.

Flow:
`gross recipe quantity -> physical consumption -> package conversion -> order unit -> purchase cost`

Examples:
- sealant: metres + joint width/depth -> ml -> cartridges/sausages -> boxes if supplier order unit requires it;
- paint: m2 -> litres by coverage/coats -> cans;
- compriband: metres -> rolls;
- board material: m2/pieces -> sheets;
- profiles: required lengths -> commercial stock lengths.

The result keeps both:
- technical required quantity;
- commercially purchased quantity.

The difference is packaging remainder. This is separate from technical waste, because 7% application/cutting loss is not the same as having 180 ml left in the last cartridge.

Material cost is based on full purchasable packages/order units. The effective cost per required unit is derived from the actual purchase cost, so small jobs do not get unrealistically cheap unit costs.

Supplier/article pricing remains an input from the authoritative article/price source; this engine only applies the commercial packaging mathematics.
