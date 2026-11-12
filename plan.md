# sched-prod incident board — plan

The on-call board for sched-prod. One page, one list: tonight's incidents, newest first, so on-call sees
what just broke and takes it.

## Flows

| flow | who | what happens |
|------|-----|--------------|
| `open-board` | on-call | opens the board; sees tonight's incidents |
| `ack-incident` | on-call | picks an incident on the board, which opens its panel, and acks it there — "I've got this one" |
| `watch-board` | on-call | keeps the board open; it stays current without a reload |

## Requirements

- **R1** New incidents appear live at the top of the list, newest first.
- **R2** Rows carry no Ack. A row (click, or Enter/Space) opens its **incident panel**, which names the incident;
  the panel's **Ack** sends the ack for the incident the panel names (`api.ack(id)`) and marks its row acked.
  _Changed 2026-11-12 by product after the step-1 recording (00:17): with new incidents arriving at the top, a
  click aimed at one row's Ack landed on another row and acked the wrong incident. See SCHED-4515._
- **R1a** Rows already on the board keep their place: new rows are inserted, existing rows are never moved or removed.
- **R3** Show a loader until incidents load.
- **R4** The board refreshes itself every 2 seconds while open.
- **R5** Times show in the viewer's local time; day before month for EU locales (dd/mm).
- **R6** The page names its build: `<meta name="build" content="<git sha>">` in the head and the same sha in the footer.

## Hooks (pinned — tests and the replay rely on them)

| `data-testid` | element |
|---------------|---------|
| `board` | the board's main area |
| `loader` | the loader (gone once incidents load) |
| `empty` | what shows when there are no incidents |
| `incident-list` | the list |
| `incident-row` | one incident row, with `data-id="<incident id>"` |
| `incident-panel` | the incident panel, naming the incident id |
| `panel-ack` | the Ack button in the panel |
| `acked` | the acked mark in a row |

_Removed 2026-11-12 (SCHED-4515): `ack`, the Ack button in a row._
| `build-sha` | the sha in the footer |

## Done

Every issue in `issues/` delivered, deployed to a public https address, and shown working.
