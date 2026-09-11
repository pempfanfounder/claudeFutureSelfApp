# Future Self dispatcher — agent instructions, not an automatic trigger

**Loading this file or installing the package is not permission to start a stage.** Follow this controller only when the founder explicitly asks to continue/start/resume Future Self or invokes the future-self skill. A setup/install request stops after setup. A status request is read-only.

## Bootstrap each invocation
1. Resolve the actual workspace root and its applicable AGENTS instructions. Read `.future-self/MASTER_CONTEXT.md` and `.future-self/WORKFLOW.md`. Explicitly read ignored local files by path; ordinary search may omit them.
2. Read `.future-self/local/workflow.json`, NEXT.md and STATE.md. Read DECISIONS.md for current scope and approvals, WORK.md for active blockers/batches, and the relevant QA/RELEASE records. Load only the selected stage prompt and relevant reference sections; do not stuff all historical documents into context.
3. Run the offline helper's `check` before substantive work, or perform its documented checks manually only when execution is denied and record the limitation. Missing/corrupt/conflicting state means STOP and recover from evidence; never recreate blank state or infer that a later stage passed. “Setup complete” means installation only.
4. Read the saved `execution_policy` and `reference/AUTONOMOUS_CONTINUATION.md`. Check the workspace/commit/build/environment against saved state before trusting it. Do not fetch/pull/reset or discard differences. A new revision may invalidate evidence, not the founder's product preferences. Validate approval scope and expiry. Record actual tools available; a model name is not permission or proof of capability.
5. One primary agent owns the checkpoint. If another lead is marked active, determine whether it is genuinely still running; do not steal ownership silently. Execution tasks return findings, not checkpoint writes. An abandoned ownership record can be cleared only after confirming no concurrent controller, preserving the record.

## Route the founder's message
- **Setup / install:** follow INSTALL instructions only; no stage.
- **Status:** report saved stage, blocker and one next action; no stage execution, approvals or state transition.
- **Continue / start / resume:** execute the saved stage under its applicable authority. If complete with next_stage set, verify entry conditions before transitioning. In recorded autonomous mode, checkpoint and continue across already-authorized stages and repair/QA cycles in the same coordinating task; dispatch a fresh independent QA task for each candidate cycle. Follow reference/AUTONOMOUS_CONTINUATION.md. Without that authority, checkpoint and wait at the boundary. Never infer a pending gate passed.
- **Awaiting founder:** “Continue” is not assent. Show the existing specific decision/gate and its exact response instruction. Do not rerun completed investigations or ask already answered questions. A clear founder answer can be recorded; an approval is scoped to the disclosed action only. Once a gate receives unambiguous scoped approval, record it and checkpoint. In approved autonomous mode continue only work admitted by that approval and existing entry conditions; otherwise wait at the boundary. An unapproved gate remains a stop.
- **Blocked:** verify only whether the identified prerequisite was resolved; continue independent allowed work within the current stage if useful. Do not jump stages or turn a blocked test into a pass. Give one precise action for the founder if needed.
- **Awaiting external:** on a new explicit continue request, perform only the currently authorized bounded status check. No polling service or promise of background work. A changed external status does not confer new approval.
- **Explicit Session N request:** check prerequisites rather than skipping to N. Explain the first unmet gate. Reading a future prompt for planning is not executing it.
- **Pause/stop:** stop tools safely, checkpoint actual completed/partial work and active operations, clear ownership when safe, and stop.

## Work and checkpoint
Announce “Session N — [name]. I will [allowed objective]. I will stop before [gate].” Use the mapped prompt. Do not make the founder select a specialist or attach a file. Use the capability-aware delegation in reference/SPECIALISTS.md.

At every stage boundary and before ending: save evidence first, update the five relevant records, increment workflow.json revision, and update NEXT.md from that same checkpoint. Use an atomic write or safe patch and check the result; never overwrite a newer checkpoint. Archive the prior JSON in local/history/ if changing a gate/candidate/stage. Run `workflow.py check`. Clear active_owner if no work is running. Never leave a tool process consuming services without disclosed authority and a stop condition.

End with at most: **Where we are. What I need from you. Exactly what to do next.** Give one action, not a menu of prompt files. In autonomous mode report routine transitions briefly in commentary and continue; do not end with a request to type Continue. At a real stop provide the specific decision, access action or repeated-failure reassessment needed. Preserve manual boundary behavior only when autonomous mode is not authorized. No files need attaching. Do not tell the founder to return to the setup chat.
