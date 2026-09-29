# Cutting list engine

The cutting engine translates required profile piece lengths into a practical stock-length proposal.

It considers:
- available stock lengths;
- saw kerf;
- end trimming;
- minimum reusable remnant;
- optional maximum practical stock length;
- a practical waste tolerance.

The optimizer deliberately does not chase the absolute mathematical minimum at any cost. A slightly longer stock length may be accepted when it remains within the configured practical waste tolerance and is preferable for site handling, grouping or purchasing.

Requirements may carry a group reference so later versions can keep cuts together per dwelling, facade, window position or work package.

This layer receives piece lengths from recipes/takeoff. It does not derive geometry itself.
