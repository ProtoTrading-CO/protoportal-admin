# Apollo Command Centre — Product Charter v1.0

**Status:** Canonical product governance  
**Product:** Apollo Command Centre  
**Infrastructure freeze:** Pending `/version`, Apollo production deployment, and smoke-test acceptance

Development covenant: [`APOLLO_DEVELOPMENT_COVENANT.md`](../APOLLO_DEVELOPMENT_COVENANT.md)

## Mission

**Apollo helps Proto run better every day.**

Apollo remembers. Apollo understands. Apollo recommends. **Humans decide.**

## Vision

Apollo is the operating layer through which Proto manages important work.
Every important part of Proto is represented by a durable **Workspace**.

Every Workspace provides:

- **Truth** — sourced business facts
- **Timeline** — an immutable record of what happened
- **Memory** — relevant knowledge, decisions, promises, and outcomes
- **Tasks** — clear ownership and deadlines
- **Recommendations** — explainable next actions for human approval

Apollo is not measured by APIs, contexts, routing rules, or model output. Those
are engineering inputs. Apollo is measured by business work it makes safer,
faster, or unnecessary.

## Product layers

### 1. Infrastructure

SQL Bridge, deployment, authentication, routing, truth access, and diagnostics.

After production acceptance this layer is **frozen**. Changes are bug fixes,
security fixes, reliability fixes, or work required by a proven business need.

### 2. Business Objects

Order · Customer · Supplier · Container · Product · Quote · Task · Reminder ·
Meeting · Memo

These are durable backend objects and the source of truth. Every state change
is audited. Consequential actions require human approval.

### 3. Workspaces

Orders · Customers · Containers · Buying · Suppliers · Daily Brief

Workspaces are the product experience. Deterministic services provide
timelines, reminders, memory, recommendations, files, and notifications.

## Success metric

> **What new piece of Proto can Apollo actively help manage this week?**

Every release must replace or significantly improve one manual business
process. Each release must name the process, its owner, the acceptance evidence,
and the time or risk removed.

## The Notebook Test

Before building a Workspace, answer:

> **After this ships, what page of Gee's notebook disappears forever?**

If the answer is “none,” do not build it yet.

## Human-control rule

Apollo may organize, explain, prepare, remind, and recommend. Humans approve
communications, quotations, purchases, price changes, financial commitments,
and irreversible actions.

## Proto maturity model

1. **Answers** — Apollo answers sourced questions.
2. **Remembers** — Apollo preserves memory, timelines, promises, and relationships.
3. **Manages** — Apollo manages durable Orders, Customers, and Containers Workspaces.
4. **Advises** — Apollo proactively surfaces briefs, exceptions, risks, and recommendations.
5. **Institutional memory** — Apollo preserves years of decisions, lessons, patterns, and outcomes.

## Long-term measure

> **If Apollo disappeared tomorrow, what manual work would Proto need to resume?**

The living business scoreboard is
[`BUSINESS_AUTOMATION_SCOREBOARD.md`](./BUSINESS_AUTOMATION_SCOREBOARD.md).
Apollo's enduring philosophy remains defined by
[`APOLLO_MISSION.md`](./APOLLO_MISSION.md).
