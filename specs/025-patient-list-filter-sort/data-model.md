# Phase 1 Data Model: Patient List Filter and Sort (US-09)

US-09 adds **no database entity, no column and no migration**. It reads the existing `GET /api/patients` response (US-02) and introduces only client-side view state. This document describes the shapes the frontend works with.

## Input (unchanged, from US-02)

`GET /api/patients` → `{ "patients": PatientListEntry[] }`

### PatientListEntry (read-only; US-09 reads these fields, changes none)

| Field | Type | Used by US-09 |
|---|---|---|
| `identifier` | string (`PAT-<digits>`) | sort key "code"; the row link (unchanged) |
| `name` | string | displayed (unchanged) |
| `age` | integer | not used by filter/sort |
| `sex` | `"female" \| "male" \| "other"` | not used |
| `triage_level` | integer 1–5 (1 = most urgent) | **filter key**; sort key "triage" |
| `admitted_at` | ISO datetime string | not used |
| `latest_score` | `{ recorded_at, total, band } \| null` | sort keys "score" (`total`) and "latest" (`recorded_at`); `null` ⇒ "no reading" group |

`latest_score.total` is an integer (NEWS2 score, read as stored, never recomputed). `latest_score.recorded_at` is an ISO datetime string. `latest_score.band` is the stored risk band (displayed via `ScoreBadge`, not used as a sort key).

## Client-side view state (new, in-memory only, not persisted)

### FilterSelection

```
triageLevel: null | 1 | 2 | 3 | 4 | 5
```

- `null` means "Todos" / "All" (no filter) — the default on page open.
- Exactly one value at a time (single-select; no multi-level).

### SortSelection

```
column:    null | 'triage' | 'score' | 'code' | 'latest'
direction: 'asc' | 'desc'
```

- `column === null` is the default: rows are shown in the server's order (AC5/FR-005). `direction` is ignored while `column` is `null`.
- One active column at a time. First click on a header sets its **default direction** (R6); clicking the active header again flips `direction`.

| `column` | Sort key | Default direction | Meaning of default |
|---|---|---|---|
| `'triage'` | `triage_level` (number) | `asc` | most urgent first (Triage I = 1) |
| `'score'` | `latest_score.total` (number) | `desc` | highest NEWS2 score first |
| `'code'` | `identifier` (string, `localeCompare`) | `asc` | PAT-001, PAT-002, … |
| `'latest'` | `latest_score.recorded_at` (timestamp) | `desc` | most recent reading first |

## Derivation rule (pure)

`filterAndSort(patients, filter, sort) -> PatientListEntry[]`

1. **Filter**: if `filter.triageLevel !== null`, keep only rows whose `triage_level === filter.triageLevel`; otherwise keep all. Order is not changed by filtering.
2. **Sort**:
   - If `sort.column === null`: return the filtered rows in their original (API) order.
   - If `sort.column` is `'triage'` or `'code'`: stable-sort all filtered rows by the key in `sort.direction`.
   - If `sort.column` is `'score'` or `'latest'`: partition into rows with `latest_score != null` and rows with `latest_score == null`; stable-sort the first group by the key in `sort.direction`; append the second group **in original API order** at the end regardless of direction.
3. The sort is **stable**: equal keys keep their original relative order (so rows do not reorder between 15 s refreshes).

### Validation / invariants

- The function is pure and does not mutate its input array.
- Output length equals the number of rows passing the filter.
- "No reading" rows (`latest_score == null`) are never ranked by a coerced numeric/time value; they only appear last when sorting by score or time (AC7/FR-006).
- The function never inspects or recomputes `band`/NEWS2 thresholds (Principle V) — it compares stored `total`, `recorded_at`, `triage_level` and `identifier` only.

## Derived display values (not stored)

- **Result count**: `shown = filterAndSort(...).length`, `total = patients.length`; rendered as `patientList.resultCount` (e.g. "3 de 12 pacientes"). Shown when a filter is active (AC10/FR-009).
- **Filtered-empty**: when a filter is active and `shown === 0`, render `patientList.filteredEmpty` ("No hay pacientes en este nivel.") — distinct from the US-02 empty state (`patients.length === 0`, "No hay pacientes activos.").
