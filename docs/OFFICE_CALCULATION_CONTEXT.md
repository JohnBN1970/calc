# Office CalculationContext snapshot

Calc consumes Office-owned calculation source context through:

`GET /api/workbench/current/calculation-context`

The Calc API derives the Office calculation and project identifiers from the authenticated Calc session and calls the HMAC-protected Workspace v2 endpoint in Office.

Contract:

`brebo-calculation-context-snapshot-v1`

The snapshot keeps these layers separate:

- CalculationDocumentSet metadata;
- selected/proposed document references;
- provenance-preserving structured facts;
- source-independent geometric take-off;
- unresolved review items.

A proposed document or fact remains proposed in Calc. Reading the snapshot does not promote extracted evidence to canonical truth.

The snapshot is source context only. Calc owns the calculation workflow and may use reviewed/proposed context to build a reviewable concept, but must keep provenance and review state visible.
