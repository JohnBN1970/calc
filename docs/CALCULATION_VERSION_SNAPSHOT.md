# Established calculation snapshot

An established calculation must remain reproducible after source data changes.

## Workbench snapshot v3

The current Calc workbench freezes an established version using `brebo-calc-workbench-snapshot-v3`.

The snapshot contains the Calc-owned state needed to reconstruct a new version without asking Office to rebuild the calculation:

- calculation structure and stable structure keys;
- calculation lines and parent bindings;
- quantities, labour and direct-cost values;
- line-level VAT regime choices;
- source references and source metadata;
- cost allocations;
- subcalculations;
- subcalculation scopes and explicit memberships;
- tail-cost definitions;
- line scope tags;
- the validated commercial result.

DATE and JSON source fields are canonicalized before hashing so a snapshot remains reproducible across database-driver representations.

The canonical payload receives a SHA-256 content fingerprint. Calc stores both the immutable JSON payload and the hash in its version tables.

## Version lifecycle

```
draft
  -> save in Calc
  -> publication readiness
  -> establish + publish
  -> immutable established snapshot
  -> new draft version from snapshot (when changes are needed)
```

A new draft receives new local database IDs while preserving stable structure identities and the Calc-owned meaning of the established source version.

Establishing an empty or financially inconsistent calculation fails closed.

## Legacy contracts

Snapshot v1 and v2 describe the earlier typed calculation pipeline and remain useful for compatibility. They are not the active spreadsheet-workbench publication contract.
