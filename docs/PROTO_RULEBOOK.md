# Proto Rulebook

**Version:** Rulebook v1.0  
**Apollo UI:** 3.x (separate version line)

If **Proto Memory** is Apollo's experience, the **Rulebook** is Apollo's judgment framework.  
Memory stores what Proto knows. Rules teach Apollo how Proto thinks.

---

## Knowledge assets

| Asset | Purpose | Example | Where it lives |
| --- | --- | --- | --- |
| Business Knowledge | Stable facts | Addie prefers black packaging | Proto Memory |
| Decision Knowledge | Outcomes | Ordering extra wallets prevented stock-outs | Proto Memory |
| Operational State | Temporary context | Container 58 awaiting customs | Proto Memory |
| **Business Rules** | **How to interpret the business** | **Negative stock during GRV is expected** | **Rulebook** |

Business Rules are different from the other three. They do not describe the business — they describe **how to interpret** the business.

---

## Principles

1. Never alert on expected business behaviour. Alert only on unexpected behaviour.
2. Apollo must distinguish between **operational timing** and **operational problems**.

---

## Rulebook v1.0 — active rules

### Negative stock during GRV — Expected

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

**Validation target:** *"Temporary stock timing observed 417 times. 412 resolved automatically. 5 became investigations."*

**Implementation:** `api/_apollo-business-rules.js`, `api/_apollo-negative-stock-rules.js`

---

## Rulebook v1.0 — planned rules

These belong in the Rulebook, not in code comments. Implement when the detector exists.

| Rule | Expected behaviour |
| --- | --- |
| Supplier ships two days early | Expected within grace window |
| Container ETA changes &lt;12 hours | Ignore — operational timing |
| Christmas buying begins October | Expected seasonal uplift |
| Customer skips one weekly order | Ignore — normal variance |
| Customer spend drops 70% over eight weeks | Investigate |
| Supplier reliability below 85% | Warn buyers |

---

## Scoping model

Rules do not use coarse profiles like `warehouse` vs `imports` as the only axis.  
Each rule declares **appliesTo** scopes:

```yaml
businessRule:
  appliesTo: supplier
  match: Motarro
  gracePeriodHours: 48
```

Supported dimensions: `supplier`, `department`, `warehouse`, `product`.  
Most specific match wins.

---

## Metrics

### Business rules applied today

How much operational judgment Apollo applied **before** bothering anyone.

Example:

```
Business rules applied today: 37
  Negative Stock Timing    18
  Supplier Grace Period     4
  Container Delay           3
  Seasonal Buying          12
```

### Expected behaviour suppressed

Alerts Apollo chose not to generate because the Rulebook said timing, not problem.

### Resolved automatically

Feedback loop — Apollo learns it was right not to alert.

---

## Knowledge hub placement

```
Knowledge
├── Customer Knowledge      (Proto Memory)
├── Supplier Knowledge      (Proto Memory)
├── Buying Knowledge        (Proto Memory)
├── Decision Knowledge      (Proto Memory)
├── Operational State       (Proto Memory)
└── Business Rules          (Rulebook — separate asset)
```

Business Rules are Apollo's operating manual. They are **not** stored inside Proto Memory.

---

## Adding a rule

1. Document it here first — operating philosophy, not exception logic.
2. Add to `APOLLO_BUSINESS_RULES` in `api/_apollo-business-rules.js` with `metricKey` and scopes.
3. Wire the detector to set `payload.businessRuleApplied` and `payload.businessRuleMetricKey`.
4. Bump **Rulebook** version when rules change materially (not Apollo UI version).

---

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| v1.0 | Jul 2026 | Negative stock GRV timing; scoped appliesTo; resolved-automatically feedback |
