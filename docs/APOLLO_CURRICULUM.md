# Apollo Curriculum

**Status:** Operating model (frozen roadmap)  
**Updated:** 2026-07-09  
**Teachers:** George · Daniel · agents on `apollo-core`

Apollo is not loading plugins. **Apollo is learning subjects.**

---

## Pipeline (Apollo Curriculum)

```
User
  ↓
Intent Engine
  ↓
Curriculum check   ← which subject? graduated or not?
  ↓
Business Context
  ↓
Query Engine
  ↓
Truth
  ↓
Reasoning
  ↓
Response
```

**Weekly sprint question:** *What business question can Apollo answer after this sprint that it couldn't answer before?*

**Engineering rhythm (repeat):**

1. Register a query  
2. Build the context  
3. Add evidence  
4. Pass the graduation conversation  
5. Mark the capability graduated  

---

## Report card

*For Apollo's teachers — not end users.*

| Capability | Status | Graduation |
|------------|--------|------------|
| **1.1** Live Product Truth | 🟢 | Graduated (LAN operational) |
| **1.1A** Intent-first Routing | 🟢 | Graduated |
| **1.2** Product Profitability | ⚪ | Not started |
| **1.3** Sales Intelligence | ⚪ | Not started |
| **1.4** Product Behaviour | ⚪ | Not started |
| **1.5** Product Judgement | ⚪ | Not started |

Status key: 🟢 Graduated · 🟡 Learning · ⚪ Not started

Full education record: `docs/graduations/`

---

## Maturity scale (today)

| Level | Score | Notes |
|-------|-------|-------|
| **Aware** | ██████████ 100% | Architecture, routing, curriculum exist |
| **Understanding** | ████░░░░░░ 40% | Product truth + intent-first live |
| **Judgement** | █░░░░░░░░░ 10% | Honest limitations; no buying advice yet |
| **Wisdom** | ░░░░░░░░░░ 0% | Memory + outcomes — Phase B+ |

Good judgement is earned through evidence, memory, and outcomes. Apollo should not claim Judgement early.

---

## Capability stages

| Stage | Behaviour |
|-------|-----------|
| **1 — Not taught** | Understands intent · admits limitation · does not guess |
| **2 — Learning** | Answers with partial confidence and evidence gaps flagged |
| **3 — Graduated** | Passes graduation conversation · full evidence chain |

---

## Graduation conversations

**Not unit tests.** Business acceptance tests — a real conversation that must pass before a capability graduates.

### 1.1 — Live Product Truth

**User:** Tell me about SKU 8626100145

**Apollo must answer with:**

- Product (title, code)
- Department
- Live stock (on hand / booked / available)
- Supplier (with source if cache)
- Evidence per field: **source · timestamp · confidence**

**Pass when:** `dataSource: erp_sql` (operational) and evidence envelopes present.

---

### 1.2 — Product Profitability

**User:** Is this product actually making us money?

**Apollo must answer with:**

- Cost
- Selling price
- Margin
- Trend (if available)
- Evidence
- Recommendation (or honest gap)

**Pass when:** margin fields from live ERP with trust metadata — not portal guesses.

---

### 1.3 — Sales Intelligence

**User:** What sold best today?

**Apollo must answer with:**

- Top products
- Quantities
- Revenue (if available)
- Trend
- Evidence
- Confidence

**Pass when:** registered sales queries return live data with provenance — not `apollo-data` aggregates alone.

---

### 1.4 — Product Behaviour

**User:** Why is this product selling?

**Apollo must answer with:** last sale, velocity, seasonality, stock cover — with evidence.

---

### 1.5 — Product Judgement

**User:** Should we reorder this product?

**Apollo must answer with:** recommendation chained to Truth + Profitability + Sales + Behaviour — not LLM guess.

---

## Trust voice (not-yet-graduated)

When a subject is recognised but not graduated, Apollo should:

1. **Understand** what was asked  
2. **Admit** it cannot answer reliably yet  
3. **Refuse to guess**  
4. **Point** to what it can do today and what's coming  

Example tone:

> I understand what you're asking.  
> I don't yet have the knowledge to answer it reliably.  
> Rather than guess, I'll tell you that **Sales Intelligence** hasn't graduated yet.

---

## Subjects (full curriculum)

| Subject | Capabilities |
|---------|----------------|
| **Products** | 1.1 Truth · 1.2 Profitability · 1.3 Sales · 1.4 Behaviour · 1.5 Judgement |
| **Customers** | 2.x (planned) |
| **Suppliers** | 4.x (planned) |
| **Buying** | 3.x (planned) |
| **Money** | 5.x (planned) |
| **Memory** | Phase B |
| **Judgement** | Cross-cutting — earned last |

Detail: `docs/APOLLO_EDUCATION_PLAN.md`
