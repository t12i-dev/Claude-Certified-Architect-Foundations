---
name: eli5
description: Explain a topic, code, or error in simple terms with an analogy, tailored to an audience. Use only when the user invokes /eli5.
disable-model-invocation: true
---

# /eli5: Explain it at the right level

The topic, file, or error to explain is whatever follows `/eli5`. If a file path is given, read it first. If the request names an audience ("to my manager", "like I'm 10"), tailor to that audience.

## Step 1: Identify the audience

**Default (no audience stated):** a software engineer with backend and AWS experience who is new to this specific topic.
- Use backend/infra analogies: queues, caches, load balancers, connection pools, API gateways.
- Skip basics they already know.
- Be concise. Highlight trade-offs, edge cases, and failure modes.

**If an audience is stated, adapt:**

| Audience | Style |
| --- | --- |
| Age 5-10 | Very simple words, short sentences, toys / animals / games analogies, enthusiastic tone |
| Age 15 | Slightly casual, social media / phone / gaming references, no "fellow kids" energy |
| Adult non-technical | Clear and respectful, analogies from daily life, work, money, home |
| Parents / partner | Warm and patient, familiar technology and household analogies, no condescension |
| Manager / Director | Lead with impact, cost, timeline, risk; what decision is needed; skip implementation details |
| Product Manager | User value, scope, priorities, what to build vs. skip |
| Designer | User experience, flow, accessibility, how it affects the user |
| Engineer (other domain) | Proper terminology, architecture, trade-offs, compare to concepts they know |
| Grad student | Assume strong foundations; focus on nuance, edge cases, precision |

## Step 2: Understand the source first

- **Code:** read the relevant files; grasp the purpose before the mechanism.
- **Concept:** break it into its core components.
- **Error:** find the root cause, not just the surface message.
- **Document:** extract only the points that matter to this audience.

## Step 3: Write the explanation

Structure:
1. **What**: one sentence capturing the essence.
2. **Analogy**: connect to something the audience already knows.
3. **Details**: add layers only as deep as the audience needs.
4. **So what**: why it matters to them specifically.

Calibration:
- **Simple audiences:** zero jargon (define any essential term immediately), one idea per sentence, concrete over abstract, address them as "you".
- **Technical audiences:** use proper terms, focus on the interesting parts (trade-offs, design decisions), be concise.
- **Business audiences:** outcomes first, quantify where possible, frame as decisions ("this means we should...").

## Example (default audience)

`/eli5 database connection pooling`

> A connection pool keeps a set of already-open DB connections ready to reuse, instead of opening a new one per request. Think of a taxi rank: cars wait at the stand, so you skip the cost of summoning one each time. Trade-off: too few connections and requests queue up; too many and the database is overloaded. Pool size should roughly match what the DB can actually run concurrently, not your request volume.

## Reminders

- Never talk down to anyone. A child's explanation should be delightful; a manager's should be empowering.
- For code, always explain the purpose before the mechanism.
- For very non-technical audiences, it's fine to simplify heavily: getting 80% of the idea across beats a perfect explanation that loses them.
- Match length to audience: short for kids, more depth for technical readers who want it.
