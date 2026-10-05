# Calculation pipeline

`runCalculationPipeline` is a deterministic domain/reference pipeline for geometry-to-cost calculations. It is not the active persisted Calc workbench flow and has no public workbench preview endpoint.

Order:

1. validate position and structure identity
2. calculate outer/assembly takeoff
3. generate recipe-driven calculation lines
4. derive material quantity from the generated line
5. calculate commercial material consumption and package cost
6. attach labour norms and labour rates
7. attach position-specific equipment, subcontracting and other direct costs
8. assign every position to the calculation hierarchy
9. roll up direct costs
10. build the sales price
11. create snapshot v2
12. pass the establishment gate and fingerprint the immutable result

## Identity rule

A generated calculation line is uniquely identified by:

`recipeRef + recipeLineRef + positionRef`

The position remains intact through costing and structure assignment. This prevents the same recipe used on multiple windows, facades or dwelling types from silently sharing or duplicating costs.

## Quantity ownership

Geometry plus recipe rules own the calculated quantity. Material plans do not accept a second manually supplied gross quantity. The orchestrator injects the generated quantity into material costing and fails closed on missing or duplicate material plans.

This preserves one source of truth for calculated quantities.


## Active workbench ownership

The active Calc workbench owns persisted calculation structure, recipes, subcalculations, tail costs, line-level VAT, version snapshots and explicit publication to Office. Do not introduce a second HTTP orchestration path that rebuilds those responsibilities outside the workbench lifecycle.
