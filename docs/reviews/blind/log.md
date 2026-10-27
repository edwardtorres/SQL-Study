dispatch: high, 0 ambiguities, queued shipments of 500 kg or more, top five by weight
unbilled: high, 0 ambiguities, repaired COUNT so the LEFT JOIN placeholder row is not counted
c1-i1: high, 1 ambiguities, customers whose name starts with B to D
c1-i2: high, 0 ambiguities, ten latest delivery dates, id tie-break decides the ties
c1-i3: high, 0 ambiguities, routes from warehouses 1 or 2 longer than 300 km
c1-i4: high, 1 ambiguities, distinct shipment statuses, alphabetical
c1-b1-p1: high, 0 ambiguities, queued shipments of 500 to 900 kg inclusive
c1-b1-p2: high, 1 ambiguities, tracking codes ending 0010 to 0019
c1-b1-p3: high, 0 ambiguities, three heaviest in_transit shipments, NULL weights excluded
c2-i1: high, 0 ambiguities, customers with a NULL region
c2-i2: high, 0 ambiguities, average known weight to one decimal
c2-i3: high, 0 ambiguities, customers with no shipments and a NULL region
c2-i4: high, 0 ambiguities, invoices with NULL paid_at
c2-b1-p1: high, 0 ambiguities, drivers with no supervisor
c2-b1-p2: high, 1 ambiguities, settled timestamp per invoice via COALESCE, type ambiguity
c3-i1: medium, 1 ambiguities, billed total per customer, zero-invoice customers ambiguous
c3-i2: high, 0 ambiguities, weighed percentage per route, title says Heavy routes
c3-i3: high, 0 ambiguities, first and last booking per customer
c3-i4: high, 0 ambiguities, share of whole table per status
c3-b1-p1: high, 0 ambiguities, UTC booking days with at least two bookings
c3-b1-p2: high, 0 ambiguities, shipment count and billed total per customer, no fan-out
c4-i1: high, 0 ambiguities, shipments 1 to 10 with driver name, LEFT JOIN keeps NULL drivers
c4-i2: high, 1 ambiguities, drivers with supervisor name via self-join
c4-i3: high, 0 ambiguities, route destination city
c4-i4: high, 0 ambiguities, shipments 1 to 6 with customer and origin city
c4-i5: high, 0 ambiguities, shipments with no events, NOT EXISTS
c4-i6: medium, 1 ambiguities, shipments and events per customer, zero-shipment customers ambiguous
c4-i7: high, 1 ambiguities, drivers who delivered on route_id 1 or 2, route vs warehouse ambiguous
c4-b1-p1: high, 0 ambiguities, manifest for shipments 1 to 12
c4-b1-p2: high, 1 ambiguities, customers with no delivered shipment, includes zero-shipment customers
c4-b1-p3: high, 0 ambiguities, scan events per origin city
c5-i1: high, 0 ambiguities, drivers who supervise nobody, NOT EXISTS avoids the NULL trap
c5-i2: high, 1 ambiguities, shipments above their customer average, average scope ambiguous
c5-i3: high, 0 ambiguities, WITH per_customer, customers with 30 or more shipments
c5-i4: high, 0 ambiguities, customers with an invoiced shipment, EXISTS
c5-i5: high, 1 ambiguities, customers whose average beats the table average
c5-b1-p1: high, 1 ambiguities, queued shipments above the queued average, scope ambiguous
c5-b1-p2: high, 1 ambiguities, customers with a shipment of 900 kg or more, cancelled rows ambiguous
c5-b1-p3: high, 0 ambiguities, heavy queued count per driver, zero-filled
c6-i1: high, 0 ambiguities, weight labels, NULL tested first
c6-i2: high, 0 ambiguities, tracking prefix and four-character serial
c6-i3: high, 0 ambiguities, January 2026 UTC bookings, half-open range
c6-i4: high, 1 ambiguities, rounded average weight per early customer, tie rule ambiguous
c6-i5: high, 1 ambiguities, name and region label, the example contradicts the data
c6-b1-p1: medium, 1 ambiguities, weight-band counts, zero-row bands ambiguous
c6-b1-p2: high, 0 ambiguities, tracking prefix and UTC booking day
c6-b1-p3: high, 1 ambiguities, shipment count and rounded average per customer

## Resolution (author, after the blind run)

The blind solver's SQL agreed with the reference on all datasets for 46 of 47 tickets. The one disagreement, c1-b1-p3, was a wrong reference: a shipment with no recorded weight has no place among the heaviest, and the reference let it sort first under DESC. The reference now excludes missing weights and the ticket says so. A rerun of the comparison (docs/reviews/blind/compare.json) gives 47 of 47.

Wording issues found by the blind solver and handled: the c6-i5 example named customer 1's region as North, but that region is NULL in the seed; the example now uses customer 2 (South). The c3-i2 title promised averages but the ticket measures the weighed share, so the title now reads "Weighed shipments by route". Not changed: the other 15 ambiguous phrases listed above (each had one plausible reading that the reference matched on all datasets), the data observation that shipments 1 and 2 are booked on 31 January 2026, the c5-i3 threshold separating nothing on the visible sample, and the 90071992.01 invoice amounts that dominate billed totals.
