# Article price selection

A realistic quantity is only useful when Calc also knows which price it is allowed to use.

Price selection is date-aware and deterministic:
- only prices valid on the calculation date qualify;
- the most recently effective valid price is preferred;
- an expired future/old price is not silently used;
- if multiple equally current candidates remain, Calc refuses to guess and requires explicit article/supplier selection.

The selected record keeps its article, supplier, package, validity and source reference so a calculation can later explain which price was used.

Office/article data remains authoritative. Calc selects from supplied candidates; it does not invent supplier prices.
