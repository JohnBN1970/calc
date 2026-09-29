# Scanable production bundles

Every released production bundle receives:
- an immutable UUID;
- a human-readable production label;
- a scan path;
- a production status.

The QR code should encode only the stable scan URL/path, not dimensions, quantities or other project data.

After scanning, the application resolves the bundle ID and shows the current authoritative information. A printed label therefore remains usable when descriptions or planning metadata change.

Initial status flow:

`planned -> released -> in_production -> ready -> dispatched -> on_site -> completed`

`blocked` is available when production or installation cannot continue.

The scan view can later expose, subject to role/authorization:
- project/building/facade/dwelling/position/product identity;
- piece list and dimensions;
- production instructions;
- bundle status;
- destination;
- related drawings/photos;
- completion or exception actions.

QR is an access pointer, not a trust boundary. Authorization remains server-side.
