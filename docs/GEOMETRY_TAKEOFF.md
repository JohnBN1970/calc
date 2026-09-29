# Calculation geometry and takeoff

## Purpose

Geometry is stored as objective source data before recipes turn it into calculation quantities.

The first geometry record contains:

- position reference
- width in millimetres
- height in millimetres
- quantity
- source type
- optional Office source-document id
- recognition confidence

Derived takeoff values are calculated from this geometry and are not copied from supplier text.

## First derived values

For a rectangular position with width `W`, height `H` and quantity `Q`:

- area: `W * H * Q`
- perimeter: `2 * (W + H) * Q`
- two sides plus head: `(2 * H + W) * Q`
- width only: `W * Q`
- height only: `H * Q`

Dimensions are stored in millimetres. Derived linear takeoff is exposed in metres and area in square metres.

## Architecture rule

The chain is:

`source -> position -> geometry -> takeoff -> recipe -> calculation quantity -> cutting / purchasing`

Recipes must choose an explicit takeoff basis. They must not assume that every material runs around the full perimeter. For example, a sill can use width only while sealant can use one or two perimeters.

Geometry must remain source-neutral. It may later originate from Office document recognition, drawings, window schedules, Sparingsmeter or manual input without changing downstream recipe logic.

Cutting-list optimisation is deliberately outside this first layer.


## Coupled window assemblies

A coupled window or facade position is one geometry assembly with an outer envelope, zero or more parts and zero or more internal joints.

The outer envelope drives external takeoff such as perimeter sealant, compriband and reveals. Parts retain their own width, height and local x/y position. Internal joints are stored separately and drive products such as coupling profiles or coupling fasteners.

Example: three parts with a total outer envelope of 3300 x 2400 mm and two vertical joints of 2400 mm produce:

- external perimeter: 11.40 m
- internal joint length: 4.80 m

Internal joints are never added to external perimeter implicitly. A recipe must explicitly select the required basis.
