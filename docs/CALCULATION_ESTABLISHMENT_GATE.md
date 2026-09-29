# Calculation establishment gate

Snapshot v2 closes the structural reproducibility gap in v1 by freezing each fully costed line together with its structure reference.

Before a calculation version may be established, the gate rebuilds the calculation hierarchy and verifies that:

- every line points to an existing structure node;
- the rolled-up direct cost equals the pricing direct cost;
- calculated markup components equal total markup;
- direct cost plus markup equals sales price;
- the snapshot is non-empty and structurally valid.

Only after these checks is the canonical snapshot fingerprinted with SHA-256.

Snapshot v1 remains readable for compatibility. New established calculations should use v2.
