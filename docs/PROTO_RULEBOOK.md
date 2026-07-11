# Proto Rulebook

**Version:** Rulebook v1.0  
**Apollo UI:** 3.x (separate version line)  
**Architecture:** See [APOLLO_ARCHITECTURE.md](./APOLLO_ARCHITECTURE.md)

If **Knowledge** is what Proto has learned, the **Rulebook** is how Proto chooses to interpret events.

**This document is the source of truth.** Code in `api/_apollo-business-rules.js` implements it — it does not define it.

---

## Governance workflow

```
docs/PROTO_RULEBOOK.md  →  Reviewed  →  Implemented  →  Validated  →  Institutional
```

### Statuses

| Status | Meaning |
| --- | --- |
| Draft | Documented philosophy; detector not live or not yet validated |
| Validated | Live in production; accuracy tracked from outcomes |
| Institutional | Earned judgment — high confidence, documented owner, reviewed |

Apollo earns judgment through validation. It does not only inherit it.

---

## Principles

1. Never alert on expected business behaviour. Alert only on unexpected behaviour.
2. Apollo must distinguish between **operational timing** and **operational problems**.

---

## Active rules

### Negative stock during GRV — Expected

| Field | Value |
| --- | --- |
| **Rule** | Negative Stock Timing |
| **Owner** | Operations |
| **Approved by** | Gee |
| **Last reviewed** | 12 July 2026 |
| **Governance status** | Validated |
| **Implementation** | Active |

**Statement:** Negative stock during GRV processing is operational timing, not a stock problem.

**Applies to:** Configurable by supplier, department, warehouse, or product.

| Scope | Match | Grace | Recent GRV |
| --- | --- | --- | --- |
| Default | — | 24h | 8h |
| Warehouse | main | 12h | 6h |
| Warehouse | imports | 48h | 12h |
| Supplier | Motarro | 48h | 12h |
| Department | Toys | 24h | 8h |

**Classifications:**

- 🟡 Stock Awaiting GRV — recent receipt, sales posted afterwards
- 🟡 GRV In Progress — inbound still processing
- 🔴 Inventory Investigation — persists past grace, no GRV, selling, significant magnitude
- 🟢 Resolved Automatically — was timing yesterday, positive today without operator action

**Validation target (Institutional):**

> Temporary stock timing observed 417 times. 412 resolved automatically. 5 became investigations. Accuracy 98.8%.

**Why does Apollo ignore negative stock?** Because GRV timing is expected at Proto. This rule documents that judgment.

**Implementation:** `api/_apollo-negative-stock-rules.js`

---

## Draft rules

Documented here first. Implement when the detector exists.

| Rule | Owner | Expected behaviour | Governance |
| --- | --- | --- | --- |
| Supplier ships two days early | Operations | Expected within grace window | Draft |
| Container ETA changes &lt;12 hours | Operations | Ignore — operational timing | Draft |
| Christmas buying begins October | Buying | Expected seasonal uplift | Draft |
| Customer skips one weekly order | Sales | Ignore — normal variance | Draft |
| Customer spend drops 70% over eight weeks | Sales | Investigate | Draft |
| Supplier reliability below 85% | Buying | Warn buyers | Draft |

---

## Scoping model

Each rule declares **appliesTo** scopes — not coarse code profiles:

```yaml
businessRule:
  appliesTo: supplier
  match: Motarro
  gracePeriodHours: 48
```

Supported dimensions: `product`, `supplier`, `department`, `warehouse`. Most specific match wins.

---

## Rule interactions (future)

When multiple rules apply, Reasoning explains precedence:

```
Rule A:  Christmas buying begins October.
Rule B:  Cash preservation mode.
Rule C:  Supplier lead time increased.

Reasoning: "Three rules apply. Cash preservation outweighs seasonal buying this month."
```

---

## Metrics

### Business rules applied today

Operational judgment applied **before** interrupting anyone.

```
Business rules applied today: 37
  Negative Stock Timing    18
  Supplier Grace Period     4
  Container Delay           3
  Seasonal Buying          12
```

### Expected behaviour suppressed

Alerts avoided because the Rulebook classified timing, not problem.

### Resolved automatically

Feedback loop validating the rule.

---

## Knowledge library placement

```
Knowledge
├── Customer Knowledge       (Proto Memory)
├── Supplier Knowledge       (Proto Memory)
├── Buying Knowledge         (Proto Memory)
├── Decision Knowledge       (Proto Memory)
├── Operational State        (Proto Memory)
├── Business Rules           (Rulebook — separate asset)
└── Reference Knowledge      (Reserved — Incoterms, VAT, contracts)
```

---

## Adding a rule

1. **Write it here** — operating philosophy, owner, expected behaviour.
2. **Review** with the rule owner.
3. **Implement** in `api/_apollo-business-rules.js` (implements doc, does not replace it).
4. **Validate** — track observed, resolved, investigations, false alarms.
5. **Promote** to Institutional when accuracy is earned.
6. **Bump Rulebook version** when rules change materially (not Apollo UI).

---

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| v1.0 | Jul 2026 | Architecture formalized; negative stock GRV timing; governance model |
