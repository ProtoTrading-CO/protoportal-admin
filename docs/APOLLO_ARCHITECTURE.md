# Apollo Architecture

**Apollo** — Operational Brain

This document formalizes how Apollo separates **experience from judgment**. That distinction is the architectural foundation.

---

## Operational brain

```
                    APOLLO
              Operational Brain
                     │
    ┌────────────────┼────────────────┐
    │                │                │
    ▼                ▼                ▼
   DATA         KNOWLEDGE        RULEBOOK
 (What is)    (What we know)   (How we think)
                     │
                     ▼
               DECISION HISTORY
            (What happened when)
```

| Pillar | Question it answers | Changes because… |
| --- | --- | --- |
| **Data** | What happened? | ERP transactions |
| **Knowledge** | What have we learned? | Experience |
| **Rulebook** | How should we interpret this? | Business policy |
| **Decision History** | What happened after we decided? | Outcomes |

**Data** is not memory. **Knowledge** is not policy. **Rulebook** is not code.

---

## Knowledge library

Knowledge mode is a **library** — each shelf answers a different business question.

| Type | Purpose | Storage | Status |
| --- | --- | --- | --- |
| Business Knowledge | Learned facts | Proto Memory | Active |
| Decision Knowledge | Outcomes | Proto Memory | Active |
| Operational State | Temporary context | Proto Memory | Active |
| Business Rules | Operational judgment | Rulebook | Active (v1.0) |
| Reference Knowledge | External policy and reference | Reference store | Reserved (not v1) |

### Reference Knowledge (reserved)

Not learned. Not business rules. Material Apollo **consults**.

Examples: Incoterms, VAT rules, freight policies, import procedures, supplier contracts.

---

## Experience vs judgment

| | Proto Memory (Knowledge) | Rulebook |
| --- | --- | --- |
| Stores | What Proto has learned | How Proto chooses to interpret events |
| Example | Last Christmas wallets sold out | Christmas buying begins in October |
| Analogy | Experience | Judgment framework |
| Source of truth | Promoted memories | `docs/PROTO_RULEBOOK.md` |

A competitor can buy the same ERP and use the same LLM. They cannot easily recreate fifteen years of Proto judgment encoded as an explainable Rulebook.

---

## Responsibility ladder

Apollo earns responsibilities in order. Reasoning requires **two inputs**: Knowledge (experience) and Rulebook (policy).

```
Truth
  ↓
Context
  ↓
Knowledge
  ↓
Rulebook
  ↓
Reasoning        ← combines Knowledge + Rulebook
  ↓
Advice
  ↓
Execution
  ↓
Coordination
  ↓
Stewardship
```

### Reasoning example

```
Knowledge:     Last Christmas wallets sold out.
Rulebook:      Christmas buying begins in October.
      ↓
Reasoning:     Demand will exceed stock again.
      ↓
Advice:        Increase wallet order 20%.
```

That chain is explainable. Every step has a source.

### Rule conflicts (future)

When multiple rules apply, Reasoning must explain precedence:

> Three rules apply. Cash preservation outweighs seasonal buying this month.

---

## Rulebook governance

**Source of truth is always documentation — not code.**

```
docs/PROTO_RULEBOOK.md
        ↓
    Reviewed
        ↓
   Implemented
        ↓
    Validated
        ↓
  Institutional
```

Code **implements** the Rulebook. Code does **not** define it.

### Governance statuses

| Status | Meaning |
| --- | --- |
| **Draft** | Documented, not yet validated in production |
| **Validated** | Observed in use; accuracy tracked |
| **Institutional** | Trusted operational judgment; earned through evidence |

### Rule ownership

Every rule documents:

- **Owner** — who maintains it (e.g. Operations)
- **Approved by** — who signed it off
- **Last reviewed** — when it was last checked against reality
- **Validation** — observed, resolved automatically, investigations, false alarms, accuracy

Example:

```
Rule:          Negative Stock Timing
Owner:         Operations
Approved by:   Gee
Last Reviewed: 12 July 2026
Status:        Institutional
Validated:     417 times
False alarms:  5
Accuracy:      98.8%
```

Years from now, when someone asks *"Why does Apollo ignore negative stock?"* — the answer is documented.

---

## Version lines

| Layer | Version | Evolves when… |
| --- | --- | --- |
| Apollo UI | 3.x | Presentation and workspaces |
| Rulebook | v1.0, v1.3… | Business policy changes |
| Proto Memory | — | Knowledge promoted |

Apollo UI and Rulebook version **independently**.

---

## Implementation map

| Pillar / type | Primary location |
| --- | --- |
| Data | ERP bridge, `api/intelligence/` contexts |
| Knowledge | `api/intelligence/proto-memory/` |
| Rulebook | `docs/PROTO_RULEBOOK.md`, `api/_apollo-business-rules.js` |
| Decision History | Validation metrics, notification outcomes |
| Knowledge UI | `src/lib/apolloCommandCentre.js` domains |
| Responsibility UI | `src/lib/apolloCommandCentrePresentation.js` |

---

## Principles

1. Never alert on expected business behaviour. Alert only on unexpected behaviour.
2. Apollo must distinguish between operational timing and operational problems.
3. Documentation before implementation. Implementation before institutional status.
