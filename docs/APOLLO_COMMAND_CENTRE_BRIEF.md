# Apollo Command Centre — UX Phase 2

**Document type:** CTO design brief  
**Status:** Active sprint specification  
**Scope:** Presentation only — no intelligence changes

---

## Mission

Apollo is no longer a chat application.

**Apollo is Proto Trading's Operational Brain.**

This sprint does not add features. It makes Apollo's **existing intelligence immediately obvious and usable**.

---

## Success criteria

1. A first-time employee understands **what deserves attention within 30 seconds** of opening Apollo.
2. Apollo answers one question **before the user types anything:**

   > *"If I only have one productive hour today, where should I spend it?"*

3. A morning review can be completed **without using chat**.
4. Chat becomes a **supporting tool** — not the homepage.

---

## Do not modify

This is a **presentation-only** sprint. Do not change business logic.

| Frozen system | Reason |
|---------------|--------|
| Action Engine | Execution responsibility earned |
| Context Resolver | Context responsibility earned |
| Notification Engine | Attention pipeline |
| Exception Engine | Detection + severity |
| Daily Brief generation | Truth source |
| Validation Week logic | Engineering metric — UI weight only |
| Proto Memory logic | Earns responsibility separately |
| SQL / API contracts | No schema or endpoint changes |
| Existing recommendation logic | Compose, don't duplicate |

**Reuse** `ApolloToday.jsx`, `ApolloPanel.jsx`, `OrdersWorkspacePanel.jsx`, Exception Engine output, Notifications API.

---

## Problem

| Today | Required |
|-------|----------|
| Backend behaves like an Operational Brain | UI still looks like an admin dashboard |
| Every section has equal visual weight | Nothing tells the user what matters most |
| Focus is below the fold | Focus must dominate |
| Chat is section 6, collapsed | Chat is ~20–25% width, always available |
| Validation Week dominates for owners | Collapsed by default |

Apollo must become a **command centre**, not a reporting page.

---

## Information hierarchy

Visual priority (highest → lowest):

1. **Today's Focus** — hero
2. **Business Health** — header card
3. **Apollo Recommends** — explainable actions
4. **Daily Brief** — scan summary
5. **Notifications** — grouped urgency
6. **Remember** — business knowledge (read-only until Memory earns)
7. **Chat** — supporting depth

---

## Page layout

```
┌──────────────────────────────────────────────────────────────┐
│ APOLLO COMMAND CENTRE                                        │
│ Good Morning Gee                    Business Health  9.4 / 10  │
└──────────────────────────────────────────────────────────────┘

████████████████████████████████████████████████████████████████
 TODAY'S FOCUS
 If you only have one productive hour today…
 1. Approve Addie quotation
 2. Contact Motarro
 3. Review wallet stock
 4. Check Container ETA
████████████████████████████████████████████████████████████████

 LEFT                  CENTRE                 RIGHT
 Remember              Daily Brief            Apollo Chat (~24%)
 Notifications         Apollo Recommends      Quick Actions
 Operations            Buying                 Activity
```

**Default nav label:** **Today** — the homepage and default route when Apollo opens.

**Application title:** **Apollo Command Centre** — the product identity in the header.

This follows the convention used by Notion, Slack, Teams, and Linear: the app has an identity; the nav item describes what you are looking at. Employees instantly understand **Today**. They should not have to learn internal terminology like "Operational Brief".

Today's Focus **dominates** the Today page. Everything else is secondary.

---

## Design principles

Apollo is not an admin dashboard. Apollo is not a reporting application. **Apollo is Proto Trading's Operational Brain.** Every UI decision should reinforce that.

When multiple good options exist, choose the one that best satisfies these principles:

### 1. Attention before information

Show what matters first. Do not treat all information equally. Users should know today's priorities within five seconds.

### 2. Action before analysis

Every major card should naturally answer: *"What should I do next?"* Avoid passive reporting.

### 3. Scan before read

Users should understand the page by scanning headings. Large paragraphs should be avoided.

### 4. Explain before confidence

Recommendations must show **Why**, **Evidence**, then **Confidence**. Never display confidence without reasoning.

### 5. Progressive disclosure

Show only the most important information initially. Reveal additional detail only when requested. Validation Week is the canonical example — collapsed by default, fully functional when expanded.

### 6. One primary focus

Every screen should have one dominant visual element. On **Today**, that is **Today's Focus**. Nothing else should compete with it.

### 7. Operational consistency

Every workspace should follow the same structure: Overview · Timeline · Knowledge · Tasks · Commitments · Files · Activity. Users should never relearn navigation.

### 8. Calm interface

Reduce unnecessary borders, competing colours, and visual noise. Severity colour communicates priority — not decoration. Whitespace and hierarchy do the work; density is not a virtue.

---

## Section specifications

### Header

- Title: **Apollo Command Centre**
- Greeting: **Good morning {name}**
- **Business Health** card in header (prominent)
  - Score bar: `██████████░`
  - Score: `9.4 / 10`
  - Label: Excellent | Healthy | Needs attention | At risk
  - Delta since yesterday: **only when data exists** — never invented

### Today's Focus (hero)

Answers: *"What should I do first?"*

- Maximum **5** items, highest impact first
- Numbered, clickable
- Uses existing `focusToday` actions — no new ranking logic

### Daily Brief

Compress to scan-friendly bullets. No long paragraphs.

| Bucket | Source |
|--------|--------|
| Risks | Urgent focus + exceptions |
| Wins | Positive `whatChangedSinceYesterday` |
| Changes | Since-yesterday lines |
| Recommendations | Top focus actions |

One glance should suffice.

### Apollo Recommends

Never label "Recommendation". Always **Apollo Recommends**.

Each card shows, in order:

1. **Recommendation** (action title)
2. **Why?** (reason lines)
3. **Evidence** (from existing exception payload)
4. **Confidence** — **only when evidence exists**

### Notifications

Group by urgency. Never a flat list.

| Group | Meaning |
|-------|---------|
| 🔴 Immediate | Critical / urgent |
| 🟡 Today | Action / review |
| ⚪ Information | Everything else |

### Remember

Homepage label: **Remember** (not Memory).

- Human tone — business facts, not technical docs
- Read-only until Proto Memory earns responsibility
- Empty state when no knowledge — no fabricated examples

### Validation Week

- Engineering metric — **not** a homepage hero
- **Collapsed by default**, expandable
- All functionality preserved, visual weight reduced

### Quick Actions

Compact chips launching existing workflows:

- Create Order · Remember · Customer · Supplier · Buying · Search

No new backend logic.

### Apollo Chat

- **~20–25%** layout width
- Supporting tool — ask when depth is needed
- Always visible on **Today**, not collapsed
- Reduced visual weight vs hero and health

### Start My Day (optional workflow)

Guided sequence: Brief → Notifications → Orders → Buying → Done.

Presentation-only scroll/highlight — no new intelligence.

---

## Operational responsibilities (header maturity)

Display business capabilities, not software versions:

| Capability | Status |
|------------|--------|
| Truth | ✓ earned |
| Context | ✓ earned |
| Execution | ✓ earned |
| Attention | ✓ earned |
| Memory | △ emerging |
| Reasoning | △ emerging |
| Advice | △ emerging |

---

## What this sprint earns

| Responsibility | Proof |
|----------------|-------|
| **Attention** | Apollo opened before email for two weeks |
| **Trust** | Today page completes morning review without chat |

Does **not** earn Memory, Reasoning, or Advice.

---

## Verification

```bash
npm run test:bi
npm run build
git diff --check
```

Manual: first-time employee 30-second scan test on **Today**.

---

## Out of scope

- New detectors or thresholds
- Proto Memory implementation or migration
- Advice / reasoning features
- Orders Phase 2 execution
- Deploy (until explicitly approved)

---

*Apollo Command Centre reveals the Operational Brain. It does not replace it.*
