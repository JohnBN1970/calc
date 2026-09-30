# Calculation pipeline API

Endpoint:

`POST /api/workbench/current/pipeline/preview`

The endpoint is session-protected and always binds the calculation identity to the current BREBO Calc session.

The client supplies only the calculation content needed by the deterministic pipeline:
- positions and geometry;
- material plans;
- labour norms and rates;
- direct cost components;
- calculation structure;
- sales-price components.

Calc loads the active draft version itself and injects:
- local calculation id;
- current version number;
- a stable version timestamp used for the preview snapshot.

The client cannot select another calculation or version through the request body.

The endpoint is currently a preview/orchestration endpoint. It does not yet replace the persisted draft lines or establish/send the calculation to Office. Those write actions should be added separately after the preview contract is stable.
