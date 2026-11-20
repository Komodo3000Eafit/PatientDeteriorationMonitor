# Specification Quality Checklist: Register Patient

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-20
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- By project convention (D-24, same as TS-13 and TS-14), the spec names the page address
  (`/patients/new`), the operation (`POST /api/patients`), the existing tables and fields
  (`patients`, `triage_events`, `source`, `previous_level`, `created_by_id`, `occurred_at`,
  `admitted_at`) and the shared components (Button, Card, TriageLevelBadge, `lucide-react`). These
  are the agreed contract and glossary terms the story must use, not leaked implementation
  choices; the plan still decides the code structure, the validation mechanism and how the retry
  is done.
- Success criteria mention HTTP status codes only as the user-visible refusal outcomes that the
  input description fixed (401/403/422); they stay verifiable without knowing the implementation.
- No [NEEDS CLARIFICATION] markers: the user's five decisions settled the open points (code
  generation, name rule, roles, triage time, navigation). Remaining defaults (highest + 1 with no
  gap filling, rejecting extra fields, fixed initial-event reason, doctor message on
  `/patients/new`) are recorded in Assumptions and can be revisited in `/speckit-clarify`.
- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`.
