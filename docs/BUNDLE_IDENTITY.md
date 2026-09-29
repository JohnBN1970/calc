# Office-backed bundle identity

Production bundles use structured identity instead of free-text labels.

Preferred hierarchy:

`project -> building -> facade -> dwelling -> position -> product`

Example:

`BREBO-2026-041 | Gebouw A | Zuid | W27 | K03 | Stelkozijn`

The same identity can be rendered as a compact group reference for sorting/scanning:

`BREBO-2026-041/Gebouw A/Zuid/W27/K03/Stelkozijn`

## Authority

Office remains authoritative for project/building and, when the Office calculation-context contract exposes them, facade/dwelling/position identifiers. Calc formats those identifiers for production; it must not invent missing building structure.

The current Office context contract exposes project and buildings. Facade, dwelling and window-position fields therefore remain optional until that contract is expanded.

Product identity comes from the approved calculation/recipe context.

This structure is intended for human-readable labels now and can later carry QR/barcode identifiers without changing the production hierarchy.
