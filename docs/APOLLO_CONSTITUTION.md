# Apollo Constitution v1.0

**Status:** Frozen · **Version:** 1.0

> This document governs Apollo. Features evolve. Capabilities evolve. Implementation evolves. **This constitution remains stable.**

**Related:** `docs/APOLLO_ARCHITECTURE.md` (technical detail) · `docs/PROTO_RULEBOOK.md` (judgment framework)

---

## Identity

**Apollo is Proto Trading's Operational Brain.**

Apollo exists to help Proto operate better — not to replace human judgement.

---

## Mission

Apollo protects Proto's operational knowledge, focuses attention on what matters, prepares operational work, and explains its reasoning while leaving business decisions to people.

---

## Apollo's four business assets

| Asset | Purpose | Owner |
| --- | --- | --- |
| **Data** | What happened? | ERP / Website |
| **Knowledge** | What have we learned? | Proto Memory |
| **Rulebook** | How should we interpret it? | Proto Rulebook |
| **Decision History** | What happened after we decided? | Apollo |

- Apollo does **not** own Data.
- Apollo helps **build** Knowledge.
- Apollo **consults** the Rulebook.
- Apollo **learns** from Decision History.

---

## Responsibility ladder

```
Truth
  ↓
Context
  ↓
Knowledge
  ↓
Rulebook
  ↓
Reasoning
  ↓
Advice
  ↓
Execution
  ↓
Coordination
  ↓
Stewardship
```

Every future capability must strengthen one rung.

If it doesn't, it probably doesn't belong.

---

## Reasoning model

**Apollo never recommends first. It reasons first.**

```
Knowledge
      +
Rulebook
      +
Current Context
      ↓
Reasoning
      ↓
Advice
      ↓
Human Decision
      ↓
Outcome
      ↓
Decision History
```

That loop is what makes Apollo improve without becoming opaque.

---

## Knowledge model

Apollo maintains different classes of knowledge.

| Type | Purpose |
| --- | --- |
| Business Knowledge | Stable business facts |
| Decision Knowledge | Outcomes of decisions |
| Operational State | Temporary operational context |
| Business Rules | Interpretation of business events |
| Reference Knowledge | Policies, contracts, regulations (future) |

Each class has a different lifecycle.

---

## Rulebook governance

Every business rule contains:

- Owner
- Approved By
- Last Reviewed
- Governance Status
- Implementation Status
- Validation Statistics

**Lifecycle:**

```
Draft
  ↓
Validated
  ↓
Institutional
```

**Documentation is the source of truth. Code implements the Rulebook.**

---

## Engineering rules

Every new capability must answer:

1. Which operational responsibility does it strengthen?
2. What manual operational work does it remove?
3. Can Apollo explain why it reached its conclusion?
4. Does the outcome improve Apollo's knowledge?

**If any answer is "No", it waits.**

---

## Constitution versioning

The Constitution is treated like an API. Changes are extremely rare. **v1.0 is expected to survive for years.**

| Change | Version |
| --- | --- |
| Typo / wording | 1.0.1 |
| Clarification | 1.1 |
| New operational responsibility | 2.0 (only if it genuinely changes the model) |

---

## Behavioural proof

Responsibilities are earned through behaviour, not implementation.

```
Implemented
  ↓
Used
  ↓
Trusted
  ↓
Relied Upon
  ↓
Responsibility Earned
```

---

## Success metrics

Apollo is measured by **operational impact**.

**Not by:**

- Releases
- Components
- Screens
- AI capability

**Instead by:**

- Better decisions
- Time saved
- Mistakes prevented
- Knowledge reused
- Responsibilities earned

---

## Long-term navigation

| Mode | Question |
| --- | --- |
| 🏠 **Today** | What deserves my attention? |
| 📦 **Work** | Now let me work on it. |
| 🧠 **Knowledge** | What do we know? |

**No further top-level navigation should be added.**

Future capabilities grow inside these three modes.

---

## Permanent principle

Apollo should reduce cognitive load before it adds capability.

ERP systems expose information.

Apollo exposes decisions.

---

## Closing

Apollo succeeds when Proto becomes less dependent on any individual remembering operational details, while remaining completely dependent on human judgement for business decisions.

---

## What comes next

Do not write another architecture document. Do not redesign the UI. Do not invent another framework.

After every sprint, ask one question:

> **Which operational responsibility did Apollo earn this month?**

If, a year from now, the answer is:

- ✅ Memory earned
- ✅ Reasoning trusted
- ✅ Advice influencing buying decisions
- ✅ Workspaces used every day

— then Apollo will have become Proto Trading's operational brain. That is the milestone worth optimizing for now.
