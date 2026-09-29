# Sales price build-up

Sales pricing is a separate layer above direct cost.

Supported explicit components are:

- general costs;
- risk;
- profit;
- other.

A component can be either a percentage or a fixed amount. Percentage components are calculated sequentially on the running base, so the base used for every component is visible and reproducible.

The direct cost from the calculation structure is never overwritten. The pricing layer returns direct cost, each calculated markup amount, total markup and final sales price.

Every component retains its description and optional source reference. Hidden generic markups are not used.
