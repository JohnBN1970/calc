# Established calculation handoff to Office

Calc owns calculation logic. Office receives the result of an established calculation as an explicit contract and must not reconstruct the price from mutable source data.

Contract `brebo-calc-established-calculation-v1` contains calculation identity, version number, establishment timestamp, SHA-256 content fingerprint, direct cost, total markup and sales price.

The handoff is signed with the existing BREBO shared-secret request scheme. Office must acknowledge with `brebo-office-established-calculation-ack-v1`, acceptance and the exact same content hash.

A missing, rejected or hash-mismatched acknowledgement fails closed. This makes the version boundary explicit and prevents Office and Calc from silently referring to different calculation states.
