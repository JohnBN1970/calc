# Labour cost pipeline

Calc now keeps labour productivity separate from material waste.

For each generated recipe line:

- the labour norm is resolved by `recipeRef + recipeLineRef`;
- the norm identifies the labour role;
- labour quantity is based on `netQuantity`, not gross material quantity;
- total labour hours = net recipe quantity × norm hours per unit;
- labour cost = total labour hours × hourly cost rate;
- material cost and labour cost are combined into a traceable direct cost.

The pipeline is fail-closed. Missing or duplicate labour norms and missing or duplicate role rates are rejected instead of guessed.

Source references are preserved separately for the productivity norm and hourly cost rate.

The Office-facing contract `brebo-calc-calculation-line-handoff-v2` adds:

- total labour hours;
- labour cost per line;
- total material cost;
- total labour cost;
- total direct cost.

The v1 handoff remains intact for compatibility.
