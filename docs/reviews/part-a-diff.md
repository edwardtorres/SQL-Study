# Part A: itemised change list (regenerated)

Step 4 audit gap. The Part A run recorded 54 items whose reference result changed, but the itemised list was never saved to the repository. This file regenerates it.

## Method

- Compared `b793e96` (the Step 3b baseline on `main`) with `7bafe3d` (Part A).
- For every item and every dataset the item uses, the reference was run through the same engine path as the content test: a read reference through `WarmEngine.run`, and a write reference through `WarmEngine.runState` with the item's policy, checks and constraint tests. The result was reduced to a digest (row count and row digest for reads; digests of check results and constraint outcomes for writes).
- Digests were compared key by key. A key present on only one side means the item's dataset list changed.
- The dump script lives outside the repository. Its output is summarised here, not committed.

## Totals

- Items with at least one changed reference outcome: **63** (of which 11 are write tickets, judged on state).
- Items with a changed dataset list: **12**.
- New item: **c12-i5** (index ticket, Part A).
- Items affected in total: **67** (66 existing, 1 new).
- Changed on the visible sample: **5** (`c9-b1-p3`, `c11-b1-p1`, `c11-g3`, `c11-i3`, `c13-i1`). The other 58 changed only on hidden datasets, which is where edge data belongs.

Reconciliation: the earlier figure of 54 was recorded during the Part A run. It cannot be reproduced from the repository, and the basis of that count is not recorded. The measured figure is 63 changed outcomes at the end of Part A. The difference is not explained here.

## Expected visible-sample changes

- `c13-i1`: scan 1008 is restored in staging, so the islands change.
- `c11-g3`, `c11-i3`, `c11-b1-p1`: watermark and archive loads read staging, and scan 1008 is newer than the watermark.
- `c9-b1-p3`: the trusted check now selects `note`. This changes the check definition, not the data.
- Lesson predict `c13-s2`: answer 9 to 10 (`src/data/lessons/ch13.ts`). Lessons are outside this dump.

## Items

| Item | Changed datasets | On visible sample | Dataset list change |
|---|---|---|---|
| `c1-b1-p1` | boundary | no | none |
| `c1-b1-p3` | ties | no | removed nulltext; added boundary |
| `c1-g1` | ties | no | none |
| `c1-g2` | boundary, ties | no | none |
| `c1-g3` | boundary | no | none |
| `c10-b1-p2` | boundary, nulls | no | none |
| `c10-b1-p3` | boundary, nulls | no | none |
| `c10-g2` | none | no | removed nulls; added ties |
| `c10-i3` | none | no | removed none; added nulltext |
| `c10-i4` | boundary, nulls | no | removed none; added nulltext |
| `c11-b1-p1` | boundary, nulls, sample | yes | none |
| `c11-b1-p2` | nulls, ties | no | none |
| `c11-b1-p3` | boundary, nulls | no | none |
| `c11-g3` | boundary, sample | yes | none |
| `c11-i3` | boundary, sample | yes | none |
| `c11-i5` | nulls | no | none |
| `c11-i6` | boundary | no | none |
| `c11-i7` | boundary | no | none |
| `c12-i2` | boundary | no | none |
| `c12-i5` | none | no | removed none; added sample, nulls, boundary |
| `c13-b1-p1` | nulls, ties | no | none |
| `c13-b1-p2` | boundary, ties | no | removed none; added nulls |
| `c13-b1-p3` | boundary, nulls | no | none |
| `c13-g1` | boundary, ties | no | none |
| `c13-i1` | boundary, nulls, sample | yes | none |
| `c13-i2` | boundary, nulls | no | none |
| `c13-i3` | boundary, nulls | no | none |
| `c13-i4` | boundary, nulls | no | none |
| `c2-i2` | boundary, nulls | no | none |
| `c3-b1-p1` | nulls | no | removed ties; added boundary, precision |
| `c3-b1-p2` | none | no | removed none; added empty |
| `c3-g2` | boundary, ties | no | none |
| `c3-i2` | boundary, nulls | no | none |
| `c3-i3` | boundary | no | removed nulltext; added nulls |
| `c3-i4` | ties | no | none |
| `c4-b1-p3` | boundary, nulls | no | none |
| `c4-i6` | boundary, nulls | no | none |
| `c4-i7` | nulls, ties | no | removed none; added boundary |
| `c5-b1-p1` | boundary | no | none |
| `c5-b1-p2` | nulls | no | removed none; added ties |
| `c5-b1-p3` | boundary | no | removed none; added ties |
| `c5-g1` | boundary, nulls | no | none |
| `c5-g3` | nulls, ties | no | none |
| `c5-i2` | boundary, nulls | no | none |
| `c5-i5` | boundary, nulls, ties | no | none |
| `c6-b1-p1` | boundary, nulls | no | none |
| `c6-b1-p2` | boundary, nulls | no | none |
| `c6-b1-p3` | nulls, ties | no | none |
| `c6-g1` | boundary, nulls | no | none |
| `c6-i1` | boundary, nulls | no | none |
| `c6-i3` | nulls, ties | no | none |
| `c6-i4` | nulls, ties | no | none |
| `c7-b1-p2` | ties | no | none |
| `c8-b1-p1` | boundary, ties | no | none |
| `c8-g1` | boundary, nulls | no | none |
| `c8-g2` | nulls, ties | no | none |
| `c8-g3` | boundary, ties | no | none |
| `c8-g4` | nulls, ties | no | none |
| `c8-i2` | nulls, ties | no | none |
| `c8-i5` | boundary, ties | no | none |
| `c8-i6` | boundary, ties | no | none |
| `c9-b1-p3` | boundary, sample, ties | yes | none |
| `c9-g2` | boundary, ties | no | none |
| `c9-i3` | boundary | no | none |
| `c9-i5` | boundary | no | none |
| `dispatch` | boundary, ties | no | none |
| `latest-event` | boundary, nulls, ties | no | none |
