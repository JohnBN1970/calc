# BREBO Workbench Architecture

## System boundary

BREBO Office remains the system of record.

Specialized applications are workbenches:

- Calculatie — costing and commercial calculation
- MJOP — multi-year maintenance planning
- Planning — capacity and resource planning

## Calculatie responsibility

Calculatie owns the user interaction and calculation-domain workflow for:

1. chapters and paragraphs
2. calculation lines
3. quantities and units
4. labour, material, equipment, subcontracting and other direct costs
5. recipes/resources
6. options, allowances and adjustable items
7. commercial parameters
8. draft calculation versions
9. immutable established versions and snapshots
10. line-level VAT regime assignment and roll-up
11. line-level auditability

## Office responsibility

Office owns:

1. project identity
2. customer and organization data
3. buildings and addresses
4. documents and intake
5. users, employees and permissions
6. offer, contract and execution workflow
7. finance and project administration
8. canonical links to established calculation versions

## Integration rule

```
Office --versioned API--> Calculatie
Office <--commercial summary + VAT breakdown-- Calculatie
```

No shared database.

Every cross-system record uses stable identifiers. Calculatie may cache read models for performance, but Office remains authoritative for Office-owned data.

## UX rule

The main calculation screen is a spreadsheet-like work surface inspired by established estimating workflows, without copying third-party UI or code.

Normal estimating must happen without navigating away from the grid:

- add chapter
- add paragraph
- add line
- edit quantity/unit/cost components
- copy/paste
- keyboard navigation
- collapse/expand hierarchy
- select line type
- see direct cost and commercial result

Technical audit, versioning, source details and readiness remain available but secondary.

## Shared BREBO experience

Calculatie, MJOP and Planning must present one BREBO product family:

- same application shell
- same navigation model
- same design tokens
- same typography and spacing
- same button/table/form conventions
- same SSO
- same project-context header

The Calculatie shell becomes the reference implementation for the other workbenches.


## BREBO Workbench standard

BREBO Calc is the reference implementation for external specialist workbenches connected to Office.

Every future BREBO workbench must follow the same rules:

1. Office remains the system of record for shared identity and context.
2. Each workbench has its own repository, runtime and database when domain-specific persistence is needed.
3. No workbench reads or writes the Office database directly.
4. Cross-system access uses a narrow, versioned API contract.
5. Server-to-server communication uses dedicated HMAC-protected credentials or the successor central SSO/API mechanism.
6. Browser users enter through Office or central BREBO authentication; secrets never reach the browser.
7. Stable Office identifiers are stored alongside local workbench identifiers.
8. The BREBO shell, design tokens and navigation model stay visually consistent across applications.
9. Domain-specific draft/work data and full calculation structure belong to the specialist workbench. Office receives only the commercial summary it needs for downstream business processes, plus canonical references.
10. Existing Drupal modules remain available until the replacement workbench is proven in production and migration is complete.

### Planned workbenches

- Calculatie: estimating, recipes, price components and commercial calculation.
- MJOP: condition assessment, measures, cycles, scenarios and multi-year cost planning.
- Planning: project/resource capacity, crews, conflicts and operational scheduling.
- Personeel: skills, certificates, availability, employment/inzet context, leave and HR workflows.

The same launch/session pattern used by Calc should be reused unless a later central BREBO SSO implementation supersedes it.
