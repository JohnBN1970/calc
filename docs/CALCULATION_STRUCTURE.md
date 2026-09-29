# Calculation structure and roll-up

Calc uses the existing calculation-line hierarchy for chapters and paragraphs. It does not create a competing tree.

A calculation version can additionally contain subcalculations. A subcalculation can represent a building, facade, dwelling type, building part, or a custom division. Calculation lines can be assigned to one subcalculation while retaining their existing chapter/paragraph parent hierarchy.

The roll-up is arithmetic only: higher levels never recalculate quantities or costs. They sum the fully costed source lines.

Every level can therefore expose line count, material cost, labour hours, labour cost, equipment, subcontract, other direct cost and total direct cost.

Missing structure references, duplicate refs, missing parents and cycles fail closed.
