# Practical cutting preferences

The cutting engine now supports two execution-oriented preferences.

## Preferred stock length
A profile may define `preferredStockLengthMm`. The engine uses it when:
- it is an allowed practical stock length;
- the piece fits;
- choosing it stays within the configured practical waste tolerance.

This prevents needless switching between commercial lengths while still rejecting clearly wasteful choices.

## Keep installation groups together
`keepGroupsTogether` defaults to true.

The optimizer prefers placing pieces from the same dwelling/facade/window/work package on the same bars. Mixing groups remains possible when necessary; it is penalized rather than forbidden.

Each cut bar retains its piece-to-group assignments so a later workshop view can show exactly which bar produces which installation set.

The priority is practical execution, not mathematical minimum waste at any cost.
