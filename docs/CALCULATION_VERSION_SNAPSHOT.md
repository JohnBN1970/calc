# Established calculation snapshot

An established calculation must remain reproducible after source data changes.

Snapshot v1 freezes the complete priced calculation input/output that matters for reproduction: structure, fully costed lines, quantities, material price/source data, labour norm/rate/source data, explicit direct-cost components, and the sales-price build-up.

The snapshot is canonicalized with stable object-key ordering and receives a SHA-256 content fingerprint. The fingerprint can be stored in the existing calculation_versions.content_hash field and the immutable payload in calculation_version_snapshots.

Establishing an empty calculation fails closed. Editing source prices, recipes, norms or markups later does not mutate an established snapshot; a changed calculation requires a new calculation version.
