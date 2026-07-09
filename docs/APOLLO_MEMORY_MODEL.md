# Apollo Memory Model

**Status:** Engineering spec (evolves)  
**Last updated:** 2026-07-09  
**Phase:** B  
**Foundation:** `docs/APOLLO_MISSION.md` (canonical)  
**Promotion:** `docs/APOLLO_PROMOTION_ENGINE.md` · **Storage:** `docs/APOLLO_MEMORY_ENGINE.md`

---

## Purpose

Define how knowledge moves from observation to institutional memory — and how everything connects in **one graph**.

Apollo builds **judgement**, not just memory. Memory is storage. The Promotion Engine decides what gets stored.

---

## One graph

Apollo does not have siloed databases. It has **one graph**:

```
Customer → Orders → Products → Suppliers → Decisions → Lessons → Recommendations → Outcomes
```

External systems (ERP, Website, CRM, Email, Knowledge Vault) feed **linked truth**. Apollo Memory holds **promoted intelligence**. No duplication — connection.

---

## Knowledge lifecycle

```
Fact
  ↓
Observation
  ↓
Hypothesis
  ↓
Lesson
  ↓
Decision
  ↓
Outcome
  ↓
Learning
```

Promotion gates sit between Hypothesis → Lesson (and similar). See Git model below.

---

## Git model for Apollo Memory

| Stage | Meaning | Persisted? |
|-------|---------|------------|
| **Observation** | "I noticed something." | No — working directory |
| **Hypothesis** | "I think this might be true." | Tentative only |
| **Staged knowledge** | "Would you like me to remember this?" | Promotion queue |
| **Confirmed memory** | "Proto has accepted this." | Yes — Apollo Memory |
| **Historical memory** | Superseded, never deleted | Yes — audit trail |

**Knowledge Promotion** commits staged knowledge to confirmed memory. Humans approve institutional truth.

---

## Intelligence types

| Type | Example |
|------|---------|
| **Fact** | Customer bought 200 wallets (linked to ERP) |
| **Observation** | Customer buys before Christmas (ephemeral) |
| **Hypothesis** | Motarro reliability may be declining |
| **Lesson** | Motarro has repeated delivery delays |
| **Decision** | Gee increased safety stock |
| **Outcome** | Stockouts reduced 70% |
| **Principle** | Never discontinue leather wallets without manual review |
| **Model** | Product A buyers usually buy Product B within 60 days |
| **Learning** | Supplier reliability confidence updated |

---

## Scientist flow

```
Observation:  Motarro deliveries seem slower
      ↓
Hypothesis:   Motarro reliability may be declining
      ↓
Evidence:     Three delayed shipments
      ↓
Lesson:       Increase safety stock          ← Knowledge Promotion
      ↓
Outcome:      Christmas stockouts reduced
      ↓
Learning:     Supplier reliability model updated
```

Hypothesis prevents coincidence from becoming lesson without evidence and promotion.

---

## Stage definitions

### Fact

Linked external truth. Not duplicated in Apollo Memory — graph edge to source.

### Observation

Ephemeral pattern or remark. Working directory. Not committed.

### Hypothesis

Tentative theory. Staging area. May expire, strengthen, or move to promotion queue.

### Lesson

Confirmed institutional knowledge. Requires **Knowledge Promotion** unless policy defines auto-commit thresholds (TBD — default: human confirms).

### Decision · Outcome · Learning

As defined in prior spec. Decisions human-captured; outcomes measured; learning flows back to memory.

### Principle · Model

Durable intelligence. Always requires promotion — policy and statistical scope are too important to auto-commit.

---

## Knowledge Promotion (example)

```
Apollo: I've observed a consistent Christmas buying pattern for Addie
        (three consecutive years). Would you like me to remember this
        as customer knowledge?

User:   Yes.

→ Confirmed memory: lesson, evidence, confidence, confirmed_by
```

---

## Maturity mapping

| Apollo maturity | Knowledge stage |
|-----------------|-----------------|
| Level 1 — Aware | Facts |
| Level 2 — Understanding | Context around facts |
| Level 3 — Judgement | Lessons + decisions → recommendations |
| Level 4 — Wisdom | Promotion — what becomes permanent |

---

## Record fields

| Field | When |
|-------|------|
| Entity | Always |
| Stage | lifecycle stage |
| Content | Text |
| Evidence | hypothesis onward |
| Confidence | hypothesis, lesson, model, learning |
| Confirmed by | confirmed memory, principles |
| Source | Always |
| Timestamp | Always |
| Status | pending, staged, active, superseded, archived |
| Supersedes / superseded_by | historical memory chain |

---

## Success criteria

- [ ] Git model implemented (observation → hypothesis → staged → confirmed)
- [ ] Knowledge Promotion UI/API
- [ ] One-graph entity query across external truth + memory
- [ ] Historical memory never deleted — supersede only
- [ ] Scientist flow demonstrable on Motarro + Addie examples
