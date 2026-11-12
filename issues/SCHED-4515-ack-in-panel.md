---
id: SCHED-4515
title: Ack moves from the row into an incident panel
status: done
plan: R1, R2, R1a
---

Found in the step-1 recording at 00:17 (build 7b4df7a): on-call pointed at the Ack of INC-2846 (sev1); a new
incident arrived at the top and moved every row down 44 px; the click acked INC-6165 instead.

Product's decision: "New incidents stay live at the top. Ack leaves the row: a row opens its incident panel, and
Ack lives there."

- Rows have no Ack button (`data-testid="ack"` removed). A row opens `incident-panel`, which names the incident id.
- `panel-ack` acks the id the panel names, whatever the list does after the panel opened.
- The panel sits beside the list and never covers rows; a wrong pick is fixed by picking the right row.
- Rows already shown are never moved or removed by a refresh (R1a).

Acceptance: a click that lands on a moved row opens that row's panel, which names it, and acks nothing; Ack in
the panel acks exactly the incident named there.
