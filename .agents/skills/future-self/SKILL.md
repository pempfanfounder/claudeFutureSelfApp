---
name: future-self
description: Run or resume the installed Future Self staged launch workflow when the founder explicitly asks Continue Future Self, Start Session N, or invokes this skill. Do not start app work during workflow setup, passive file reading or a status-only request.
---

Read `.future-self/START_HERE.md` from the current workspace root and follow its dispatcher. It loads the saved stage, master context, appropriate prompt and current evidence/approvals; do not ask the founder to attach them. Read ignored local files explicitly by path.

Installation is setup only. “Continue” never approves a pending gate. Follow the saved execution policy and `reference/AUTONOMOUS_CONTINUATION.md`: in approved autonomous mode checkpoint each stage, then continue already-authorized work in the same coordinating task with a fresh independent QA task for each repaired candidate. Do not alter global configuration/permissions, bypass safeguards, fabricate tool capabilities or reset missing/corrupt state. Honor the applicable repository instructions and user request.

Routine boundaries require a saved checkpoint, not another founder message. Stop for a concrete decision/approval, unresolved access/prerequisite blocker, or repeated failure requiring reassessment; preserve all budgets and paused work. Ask for one precise action only when input is actually needed. Setup and status-only requests remain non-executing. Historical handoff text requesting a fresh chat is superseded only for routine boundaries by the recorded autonomy approval.
