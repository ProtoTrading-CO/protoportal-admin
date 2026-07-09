# Apollo Memory Engine

**Status:** Engineering blueprint (evolves)  
**Last updated:** 2026-07-09  
**Phase:** B — not implemented  
**Foundation:** `docs/APOLLO_MISSION.md` · **Lifecycle:** `docs/APOLLO_MEMORY_MODEL.md`

---

## Purpose

Implement **Apollo Memory** — persistent storage for the Apollo Knowledge Graph.

Promotion logic lives in **`docs/APOLLO_PROMOTION_ENGINE.md`**. This engine stores what the Promotion Engine commits.

Apollo has **one graph**. External truth is linked, not duplicated. Confirmed and historical memory live here.

---

## Architecture position

Apollo Memory sits **in the middle** of the stack:

```
External Truth → Truth Layer → Context Layer → Apollo Memory → Reasoning → Recommendations → Outcome → Learning → Apollo Memory
```

Everything passes through it. Learning flows back into it.

---

## Intelligence types

| Type | Lifecycle stage | Storage |
|------|-----------------|---------|
| Fact (linked) | Fact | Graph edge to ERP/source; no duplication |
| Customer / Product / Supplier intelligence | Lesson, Decision | Apollo Memory tables |
| Hypothesis | Hypothesis | Tentative store; auto-expire or promote |
| Decision | Decision | Permanent; linked to entity |
| Outcome | Outcome | Linked to decision or recommendation |
| Principle | Principle | Policy-scope; manual review rules |
| Model | Model | Statistical / behavioural patterns |
| Learning | Learning | Confidence adjustments, domain scores |

---

## Memory record schema

| Field | Description |
|-------|-------------|
| **Entity** | Customer, product, supplier, domain, etc. |
| **Stage** | Lifecycle stage (see memory model) |
| **Content** | Observation, hypothesis, lesson, decision, etc. |
| **Evidence** | Dates, figures, source refs, ERP links |
| **Confidence** | 0–100% |
| **Confirmed by** | User who approved promotion |
| **Source** | ERP link, vault, Apollo inference, manual |
| **Timestamp** | Created |
| **Status** | pending, active, superseded, disputed, archived |
| **Last validated** | Last evidence check |

---

## Examples

### Customer lesson (permission granted)

```
Entity:       Customer — Addie
Stage:        lesson
Content:      Christmas ordering begins 6–8 weeks earlier than average
Evidence:     2023, 2024, 2025 order spikes vs portfolio
Confidence:   97%
Confirmed by: Gee
Source:       Apollo inference + portal.orders
Prompt:       "Would you like me to remember this as customer knowledge?"
Status:       active
```

### Supplier hypothesis → lesson

```
Stage 1 — Hypothesis (automatic, tentative):
  Entity: Motarro
  Content: Deliveries appear slower
  Evidence: 2 late shipments
  Confidence: 45%
  Status: pending

Stage 2 — Lesson (after 3rd delay + user confirms):
  Content: Repeated delivery delays
  Evidence: 3 late shipments
  Confidence: 85%
  Confirmed by: Gee
  Status: active
```

### Principle

```
Entity:       Product category — Leather wallets
Stage:        principle
Content:      Never discontinue leather wallets without manual review
Confirmed by: Gee
Source:       admin policy capture
Status:       active
```

### Model

```
Entity:       Cross-sell — Product A → Product B
Stage:        model
Content:      Customers buying A usually buy B within 60 days
Evidence:     18-month order analysis
Confidence:   82%
Status:       active
```

### Outcome

```
Entity:       Safety stock decision — Motarro SKUs
Stage:        outcome
Content:      Stockouts reduced 70% vs prior Christmas
Linked:       Decision ID 2026-07-09
Status:       active
```

---

## Promotion integration

All writes go through the Promotion Engine:

- Observations and hypotheses: not stored here (or tentative table only)
- Staged knowledge: promotion queue (may live in Promotion Engine or shared store)
- Confirmed + historical memory: this engine

See `docs/APOLLO_PROMOTION_ENGINE.md`.

---

## Git storage mapping

| Git stage | Storage |
|-----------|---------|
| Observation | Not persisted |
| Hypothesis | `apollo_hypotheses` (tentative, TTL) |
| Staged knowledge | `apollo_promotion_queue` |
| Confirmed memory | `apollo_memory` |
| Historical memory | `apollo_memory` where `status = superseded` |

---

## Input sources

1. **External truth** — ERP, website, CRM (linked facts, not copied)
2. **Knowledge Vault** — SOPs, buying philosophy
3. **Promoted events** — confirmed hypotheses, decisions, principles
4. **Outcomes** — post-hoc linkage from recommendations and decisions
5. **Learning Engine** — models and confidence updates (Phase C)

---

## Query patterns (target)

| Query | Returns |
|-------|---------|
| "Everything we know about Motarro" | Linked ERP facts + hypotheses + lessons + decisions + outcomes |
| "What did we decide about stone wallets?" | Decision + linked outcomes + validation |
| "How's Addie doing since we last reviewed?" | Lessons + delta facts + continuity narrative |
| "What principles apply to leather wallets?" | Principles + supporting lessons |

---

## Storage (TBD)

Requirements:

- Apollo Memory as dedicated schema (Supabase or separate store)
- Graph edges table (entity ↔ entity ↔ memory)
- Read-only on query path (AES-001)
- Write only via promotion API with `confirmed_by`
- Full Trust fields on every record served to UI
- Hypothesis TTL or status `pending` → promote or discard

---

## Dependencies

| Prerequisite | Phase |
|--------------|-------|
| Truth layer live (ERP read) | A |
| Entity resolution (IDs across systems) | A |
| Promotion UI ("Remember this?") | B |
| Hypothesis staging | B |
| Learning Engine (outcome → learning) | C |

---

## Success criteria (Phase B)

- [ ] Apollo Memory schema with lifecycle stages
- [ ] Hypothesis prevents premature lesson promotion
- [ ] Permission flow end-to-end (Addie Christmas pattern)
- [ ] Entity killer query: external truth + memory graph
- [ ] Daily Brief cites prior decisions from Apollo Memory
- [ ] Learning Score bar for Apollo Memory moves off 0%
