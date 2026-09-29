# Material cost pipeline

This module joins the calculation layers into one explainable material-cost result.

`gross recipe quantity -> physical consumption -> commercial packaging -> actual purchase cost`

Example:
1. geometry produces perimeter;
2. recipe says sealant = perimeter x 2 + technical waste;
3. consumption converts the resulting requirement to the article's physical unit;
4. packaging rounds to full cartridges/sausages/boxes;
5. price is applied to what BREBO must actually buy.

The output keeps every intermediate quantity, including packaging remainder and effective cost per recipe unit.

Profiles and sheet materials may use their dedicated cutting/nesting engines instead of simple package conversion. The same principle applies: the final price is based on actual commercial stock consumed/purchased, while technical demand remains traceable.

This is calculation logic only. Purchasing execution remains outside Calc.
