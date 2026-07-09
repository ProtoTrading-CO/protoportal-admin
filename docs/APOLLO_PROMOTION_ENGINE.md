# Apollo Promotion Engine

**Status:** Engineering blueprint (evolves)  
**Last updated:** 2026-07-09  
**Phase:** B — not implemented  
**Foundation:** `docs/APOLLO_MISSION.md`  
**Storage:** `docs/APOLLO_MEMORY_ENGINE.md` · **Lifecycle:** `docs/APOLLO_MEMORY_MODEL.md`

---

## Purpose

Apollo's hardest job is not storing knowledge. It is **judgement** — deciding what deserves to become permanent, institutional knowledge.

The Promotion Engine is a dedicated subsystem for that decision. Apollo Memory stores what gets promoted. The Promotion Engine decides **what** and **when** — with humans at the commit step.

---

## Knowledge Promotion

Apollo does not ask "permission to learn." It performs **Knowledge Promotion** — asking permission to make something **institutional**.

```
Staged knowledge:  "Would you like me to remember this?"
Confirmed memory:  Proto has accepted this.
```

Learning happens continuously. Promotion is the gate to permanence.

---

## Git model

Apollo Memory works like Git. Everyone understands this:

| Git | Apollo |
|-----|--------|
| Working directory | **Observation** — "I noticed something." (ephemeral) |
| Staging | **Hypothesis** — "I think this might be true." (tentative) |
| `git add` | **Staged knowledge** — "Would you like me to remember this?" |
| Commit | **Confirmed memory** — Proto has accepted this |
| History | **Historical memory** — never deleted; only **superseded** |

```
Observation
      ↓
Hypothesis
      ↓
Staged Knowledge    ← Knowledge Promotion prompt
      ↓
Confirmed Memory
      ↓
Historical Memory   (superseded, never deleted)
```

Nothing is committed automatically. Staging requires evidence. Commit requires human confirmation (for lessons, principles, and policy-scope knowledge).

---

## Promotion pipeline

### 1. Detect (Working directory)

Pattern in facts or user remark → **Observation** (session/ephemeral).

Not stored in Apollo Memory.

### 2. Infer (Staging area)

Apollo forms **Hypothesis** when evidence is suggestive but insufficient for a lesson.

```
Hypothesis: Motarro reliability may be declining
Evidence:   2 delayed shipments
Confidence: 45%
Status:     pending
```

Hypotheses age, accumulate evidence, or expire.

### 3. Propose (Staged knowledge)

When evidence threshold met (or user initiates), Apollo stages for promotion:

```
Apollo: I've observed a consistent Christmas buying pattern for Addie
        (three consecutive years). Would you like me to remember this
        as customer knowledge?

Actions: [Yes, remember] [Not now] [Never for this pattern]
```

UI/API: Promotion queue in admin or inline in Apollo panel.

### 4. Commit (Confirmed memory)

User confirms → write to Apollo Memory with:

- `confirmed_by`
- `evidence`
- `confidence`
- `timestamp`
- full Trust fields

### 5. Supersede (Historical memory)

When disproven or replaced:

- Status → `superseded`
- Link to replacement memory
- **Never delete** — audit trail and learning depend on history

---

## Promotion rules

| Stage | Auto? | Human required? |
|-------|-------|-----------------|
| Observation | Detect only | No |
| Hypothesis | Apollo infers | No |
| Staged knowledge | Apollo proposes | **Yes** to commit |
| Confirmed memory | — | Already confirmed |
| Principle / Model | Apollo proposes | **Yes** — policy scope |
| Decision | Admin capture | **Yes** |
| Outcome | System links | No (factual) |
| Learning | Learning Engine | No (derived) |

**Never auto-commit:** chat text, single data points, weak hypotheses, opinions without evidence.

---

## Scientist flow (Motarro example)

```
1. Observation:  Deliveries seem slower          [working directory]
2. Hypothesis:   Reliability may be declining    [staged, tentative]
3. Evidence:     3rd delayed shipment           [threshold met]
4. Promotion:    "Record as supplier lesson?"   [staged knowledge]
5. Commit:       User: Yes                      [confirmed memory]
6. Decision:     Increase safety stock          [linked decision]
7. Outcome:      Stockouts down 70%             [outcome]
8. Learning:     Supplier model updated         [learning → memory]
```

---

## Subsystem boundaries

| Subsystem | Responsibility |
|-----------|----------------|
| **Truth Layer** | External facts (ERP, portal, CRM) |
| **Promotion Engine** | Detect, hypothesise, propose, gate commits |
| **Apollo Memory Engine** | Persist confirmed + historical memory, graph edges |
| **Learning Engine** | Outcome analysis → confidence updates (Phase C) |

Promotion Engine **does not** duplicate ERP data. It **proposes graph edges and memory records**.

---

## API surface (target)

```
POST /api/apollo/promotion/propose    — Apollo stages knowledge (internal)
GET  /api/apollo/promotion/pending    — User's promotion queue
POST /api/apollo/promotion/confirm    — Commit to Apollo Memory
POST /api/apollo/promotion/dismiss    — Not now / never
POST /api/apollo/promotion/supersede  — Replace with new memory
```

All writes require admin auth. AES-001: no business operations — only memory commits.

---

## Success criteria (Phase B)

- [ ] Hypothesis staging without auto-lesson
- [ ] Promotion queue UI or inline prompt
- [ ] Knowledge Promotion flow end-to-end (Addie pattern)
- [ ] Confirmed memory written with `confirmed_by` + evidence
- [ ] Supersede preserves historical memory
- [ ] No raw chat in Apollo Memory — only promoted knowledge
