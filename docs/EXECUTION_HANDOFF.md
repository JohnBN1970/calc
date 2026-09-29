# Calc -> Office execution handoff

Calc stops at an approved, execution-ready calculation.

Calc responsibilities:
- geometry and takeoff;
- recipes and calculated quantities;
- cutting/material proposal;
- purchase/workshop/site output proposals;
- release an immutable handoff reference and snapshot.

Office responsibilities after handoff:
- work preparation;
- production bundles and QR labels;
- workshop progress;
- transport;
- site execution;
- deviations, photos and instructions;
- completion and reporting.

Calc MUST NOT own production, dispatch, on-site or completion statuses.

Contract: `brebo-calc-execution-handoff-v1`.

The handoff is a boundary object, not an execution workflow. Office imports or references it and creates its own work packages and execution records.
