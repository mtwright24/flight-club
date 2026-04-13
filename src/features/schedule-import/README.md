# JetBlue FLICA normalized schedule import

## Purpose

Pipeline from **screenshot OCR** → **structured draft** → **normalized Supabase rows** for Flight Club schedule UI, pairing detail, layover tools, and a **future contract rules engine** (CBA logic stays out of the parser).

## Architecture

| Stage | Module | Role |
|-------|--------|------|
| Ingestion | App upload + `schedule_import_jobs` / `schedule_import_assets` | Multi-screenshot sessions |
| Extraction | Edge OCR / `raw_schedule_extractions` | Raw text + optional blocks |
| Parse | `parser/pipeline.ts`, `pairingParser`, `dutyDayParser`, `segmentParser`, … | JetBlue FLICA semantics |
| Normalize | `parser/normalizeSchedule.ts` | API payload + DB inserts |
| Storage | Migration `20260422120000_normalized_flica_schedule_import.sql` | Hierarchy + RLS |
| Issues | `schedule_parser_issues` | `parserIssues.ts` codes |

## JetBlue rules (source of truth)

- **`src/features/crew-schedule/jetblueFlicaUnderstanding.ts`** — obsolete fields: **TACLAG, GRNT, DHC** (do not drive logic). **OAEQP** equipment preserved.
- Rig / legality / pay: **`jetblueFlicaRig.ts`** and future `evaluatePairingRules(...)` — **not** in OCR heuristics.

## App integration

1. **Create job** — `buildImportJobRow()` + insert into `schedule_import_jobs` (optional `legacy_schedule_import_id` → existing `schedule_imports` session).
2. **Store assets** — `schedule_import_assets` with storage paths.
3. **Save OCR** — `raw_schedule_extractions` (never overwrite; append new runs for audit).
4. **Run pipeline** — `runFlicaPipeline({ rawText, scheduleYear, scheduleMonthNumber })` → `ParsedScheduleMonthDraft`.
5. **Persist normalized** — insert `normalized_schedule_months` → totals → pairings → duty_days → segments → layovers.
6. **Read UI** — `view_schedule_month_summary`, `view_pairing_detail`, `view_duty_day_segments`, `view_upcoming_segments`.

## Example JSON

See `examples/normalized-schedule-month.example.json` (illustrative; production uses `null` when uncertain).
