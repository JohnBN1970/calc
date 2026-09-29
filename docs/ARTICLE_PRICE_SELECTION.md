# Article price selection

A realistic quantity is only useful when Calc also knows which price it is allowed to use.

Price selection is date-aware and deterministic:
- only prices valid on the calculation date qualify;
- the most recently effective valid price is preferred;
- an expired future/old price is not silently used;
- if multiple equally current candidates remain, Calc refuses to guess and requires explicit article/supplier selection.

The selected record keeps its article, supplier, package, validity and source reference so a calculation can later explain which price was used.

Office/article data remains authoritative. Calc selects from supplied candidates; it does not invent supplier prices.


## Cost trace

Once a price is selected, its article reference, supplier reference, source reference, selected calculation date, package description and package price remain attached to the material cost result. The material-cost pipeline must not reduce a selected price to an anonymous euro amount.

This makes every calculated material cost explainable later: required quantity -> purchased package quantity -> selected article/supplier/source -> package price -> total material cost.
