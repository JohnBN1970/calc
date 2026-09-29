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


## Workshop versus site production

A profile can be configured as:
- workshop: pre-cut when geometry is sufficiently reliable;
- site: cut or fit on site;
- either: planner may choose.

Workshop production is preferred for repeatable components such as battens, subframe/profile pieces and other components whose final piece length follows reliably from approved geometry.

Pre-cut pieces are not delivered as one project-wide pile. They are bundled according to the configured production unit (position, dwelling, facade or work package) and labelled with their destination.

The optimizer therefore prioritizes execution flow as well as material yield:
1. keep installation sets together;
2. use preferred practical stock lengths where sensible;
3. minimize unnecessary profile/length changes;
4. retain only genuinely reusable remnants;
5. accept modest extra material use when it produces a substantially clearer workshop and installation flow.

Items that depend on final site conditions remain site-cut and are not falsely optimized as workshop-ready pieces.
