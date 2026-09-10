# Process record

Working documents kept for one reason: they show _how_ the codebase reached its
current state, which is usually more informative than the state itself.

| Document                                           | What it is                                                                                                                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md) | The phased plan written before the first line of app code, updated as each phase closed.                                                                       |
| [PRINCIPAL-REVIEW.md](./PRINCIPAL-REVIEW.md)       | A point-in-time internal review of the codebase against a Lead/Principal bar — findings, evidence, and an explicit KEEP list. Counts in it are from that date. |
| [REMEDIATION-LOG.md](./REMEDIATION-LOG.md)         | Every accepted finding and follow-up epic, with evidence, implementation and acceptance criteria. All closed.                                                  |
| [CODEBASE-CLEANUP.md](./CODEBASE-CLEANUP.md)       | The consolidation pass: what was removed, what was deliberately _not_ abstracted, and why.                                                                     |

Current-state documentation lives one level up: [architecture](../architecture),
[design](../design), [backend](../backend), [ADRs](../adr) and
[PRODUCTION-READINESS.md](../PRODUCTION-READINESS.md). Where a process document
and a current-state document disagree, the current-state document wins.
