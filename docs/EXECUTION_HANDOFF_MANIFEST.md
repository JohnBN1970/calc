# Execution handoff manifest

The handoff manifest is the final Calc output before Office takes over.

It contains the exact approved calculation-derived execution proposal:
- purchase list;
- workshop pre-cut proposal;
- site-cut proposal;
- labels/group references;
- cutting totals and expected waste/remnants;
- calculation version and project reference through the handoff.

This is a released snapshot. Office may create work packages, production bundles and execution records from it, but those later workflow states are not written back into Calc as production state.

Contracts:
- `brebo-calc-execution-handoff-v1`
- `brebo-calc-execution-handoff-manifest-v1`

The manifest makes the transfer reproducible: Office can always identify which Calc version and which exact material/cutting proposal formed the basis of execution.
