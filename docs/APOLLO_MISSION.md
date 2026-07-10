# Apollo Mission v1.0

> **Apollo does not exist to replace human judgement. Apollo exists to preserve, improve, and extend it.**

If you read only that sentence, you understand how to build Apollo: read-only (AES-001), curated memory, hypotheses before lessons, explainable recommendations, humans as final decision-makers.

**Status:** Canonical · **Architecture:** Frozen v1.0 (2026-07-09)  
**Last updated:** 2026-07-09

This document defines Apollo's purpose.

It should only change if the fundamental purpose of Apollo changes.

Features evolve. Capabilities evolve. Implementation evolves. **Apollo's purpose and architecture remain stable.**

**Freeze:** No new philosophy unless implementation proves something is fundamentally wrong. Educate Apollo — see `docs/APOLLO_EDUCATION_PLAN.md`.

Related (frozen specs): `docs/APOLLO_MEMORY_MODEL.md` · `docs/APOLLO_PROMOTION_ENGINE.md` · `docs/APOLLO_MEMORY_ENGINE.md`  
Related (development covenant): `APOLLO_DEVELOPMENT_COVENANT.md`
Related (product governance): `docs/APOLLO_PRODUCT_CHARTER.md` · `docs/BUSINESS_AUTOMATION_SCOREBOARD.md`
Related (living): `docs/CURRENT_APOLLO_CAPABILITIES.md` · `docs/APOLLO_EDUCATION_PLAN.md`

---

## Mission

Apollo exists to **understand Proto better than anyone else**.

**Every day Apollo should know more about Proto than it did yesterday.**

Apollo doesn't exist to answer questions. Apollo exists to **help Proto make better decisions tomorrow than it made yesterday.**

Apollo is not an AI assistant. Apollo is **how Proto remembers, understands, and improves.**

Apollo never operates the business. Apollo helps Proto operate the business better. (AES-001 Read-Only Observer.)

---

## What Apollo is building

Apollo is not building memory. **Apollo is building judgement.**

Memory is one ingredient. So are truth, context, outcomes, and learning. Together they produce judgement — the ability to decide what matters and what to do.

Imagine a new employee at Proto:

| Tenure | What they gain |
|--------|----------------|
| One week | **Facts** |
| One month | **Context** |
| One year | **Experience** |
| Ten years | **Judgement** |

That is Apollo's maturity journey.

---

## Four levels of maturity

Not capabilities. **Maturity.**

### Level 1 — Aware

*What happened?*

ERP. SQL. Website. CRM. Information.

**On `apollo-core`:** largely here — Query Engine, Truth layer, daily brief facts.

### Level 2 — Understanding

*Why did it happen?*

Seasonality, buying cycles, supplier behaviour, customer behaviour. Context.

**On `apollo-core`:** partial — Business Contexts; semantic Proto knowledge still growing.

### Level 3 — Judgement

*What should we do?*

Not because a model guessed — because Apollo combines **Truth + Context + Memory + Outcomes**.

**On `apollo-core`:** early — recommendations without full memory/outcome loop.

### Level 4 — Wisdom

*Should this become permanent knowledge?*

Not everything deserves to be remembered. Wisdom is knowing what to promote into institutional knowledge.

**On `apollo-core`:** not built — Phase B (Promotion Engine) + Phase C (Learning).

---

## Direction

The centre is not SQL, React, APIs, or queries.

> Apollo should understand Proto better tomorrow than it does today.

Five years from now, people won't say *"Apollo is our AI."* They'll say:

> **"Apollo is how Proto remembers, understands, and improves."**

The question will be: **Does Apollo know Proto?**

---

## Architecture

```
                External Truth

    ERP · Website · CRM · Email · Analytics · Knowledge Vault

                            │
                            ▼
                      Truth Layer
                            │
                            ▼
                     Context Layer
                            │
                            ▼
                      Apollo Memory
                            │
                            ▼
                        Reasoning
                            │
                            ▼
                    Recommendations
                            │
                            ▼
                         Outcome
                            │
                            ▼
                        Learning
                            │
                            ▼
                      Apollo Memory
```

Apollo has **one graph**, not siloed databases. Everything connects:

```
Customer → Orders → Products → Suppliers → Decisions → Lessons → Recommendations → Outcomes
```

External truth is linked, not duplicated. Apollo Memory holds promoted intelligence. The **Apollo Knowledge Graph** is the whole — no silos.

Lifecycle and Git model: `docs/APOLLO_MEMORY_MODEL.md`  
Promotion: `docs/APOLLO_PROMOTION_ENGINE.md`

---

## Knowledge promotion

Apollo's hardest job is not storing knowledge. It is deciding **what gets promoted into institutional knowledge.**

That is the **Promotion Engine** — a subsystem separate from storage.

**Knowledge Promotion** (not "permission to learn"): Apollo asks to make something institutional.

*"I've observed a consistent Christmas buying pattern for Addie. Would you like me to remember this as customer knowledge?"*

Humans stay involved. Memory is curated.

---

## Scientist model

Apollo thinks like a scientist:

```
Observation:  Motarro deliveries seem slower
      ↓
Hypothesis:   Motarro reliability may be declining
      ↓
Evidence:     Three delayed shipments
      ↓
Lesson:       Increase safety stock
      ↓
Outcome:      Christmas stockouts reduced
      ↓
Learning:     Supplier reliability model updated
```

The Hypothesis stage prevents every coincidence from becoming gospel.

---

## Six pillars

| Pillar | Question |
|--------|----------|
| **Truth** | What is? |
| **Context** | Why does it matter? |
| **Memory** | What did we learn? (ingredient, not the goal) |
| **Reasoning** | What should we do? |
| **Learning** | Did we get a better outcome? |
| **Trust** | Can we explain it? |

Trust over cleverness. Facts over opinions.

---

## Daily Brief

Four questions every morning:

1. **What changed?**
2. **What matters?**
3. **What should we do?**
4. **What should we investigate?**

The fourth is **Curiosity** — Apollo may propose investigations or hypotheses. Observant, not autonomous. Examples:

- *"Three customers who buy Product A have stopped buying Product B. Would you like me to investigate?"*
- *"This supplier's lead time has increased for three consecutive shipments. Should I start tracking this as a hypothesis?"*

Evidence and **Why?** remain required on every recommendation (Trust pillar).

---

## Curiosity

A seventh layer beneath the six pillars: **Curiosity**.

Apollo should not only answer questions. It should occasionally ask one worth investigating — routed through Knowledge Promotion, never auto-committed.

---

## Engineering discipline

> Every line of code added to Apollo should increase its understanding of Proto.

If a feature doesn't do that, ask whether it belongs in Apollo at all.

---

## KPI: Understanding

Apollo has one primary metric: **Understanding**.

Every sprint should increase Apollo's understanding of Proto.

Supporting metrics (truth coverage, memory depth, trust completeness, outcome accuracy) serve Understanding — they are not the goal.

**Weekly:** *What new questions can Apollo answer today that it couldn't answer last Friday?*

**Daily:** *Does Apollo understand Proto better today than yesterday?*

Scoreboard: `docs/CURRENT_APOLLO_CAPABILITIES.md`

---

## What we are building

Institutional memory for Proto — knowledge that persists beyond any one person, with humans firmly in control of what becomes truth.

Read-only at the core (AES-001). Judgement preserved, improved, and extended — never replaced.
