# Start and operate Future Self in Cursor

This setup was prepared under the founder's explicit approval. It adds local
Cursor rules, three custom agents and completion/session-start hooks. It does
not change the five-minute automation, app source, provider settings or budgets.
Docs verified: https://cursor.com/docs/hooks and https://cursor.com/docs/subagents

## First start

Open this exact project in Cursor and use Agent mode. Confirm the three custom
agents and project hooks are recognized (Cursor settings/hooks diagnostics).
If this Cursor version cannot load them, stop and report the actual limitation;
do not claim automatic continuation works. No actual Cursor runtime was tested
by Codex; local hook tests are separate evidence.

Read `.future-self/local/platform-handoff/CURSOR_HANDOFF.md` and the CURRENT
workflow.json, NEXT.md, relevant approvals and QA records. Session-start context
provides the real conversation ID when supported. If absent, obtain the actual
ID from Cursor's hook diagnostics; never invent it. Only the founder's explicit
Future Self request starts adoption; unrelated conversations remain inactive.

Adopt owner `cursor:<conversation_id>` in a new durable checkpoint, preserving
all state except authorized coordination fields. Set platform_handoff status
`active`, cursor_task_id to the actual ID and owner_platform cursor. Use the
handoff's checkpoint/mirror procedure, never the old hardcoded Codex wrapper.
Read current revision before every checkpoint; stop on conflict. A parent is
the only checkpoint writer. No scheduler or external service starts on adoption.

## File-only live confirmation

First complete a useful read-only reconciliation of current QA evidence and save
its findings under local/platform-handoff/cursor-results/. Record the newly
verified evidence SHA256 in the run state below. Prepare one bounded follow-up
review instruction there (for example, review those findings for omissions).
Checkpoint the completed reconciliation and admit that follow-up; end the turn.
Confirm Cursor receives exactly one hook-generated follow-up and executes that
review. If it does not, use hook diagnostics and preserve the checkpoint; do not
blindly resubmit or manually claim the hook succeeded. After completion record
live-hook verification and use the same mechanism for subsequent eligible work.
This is file-only coordination validation, not additional app test allowance.

## Coordinator loop

Pick one task admitted by the saved stage, approvals, dependencies and budgets.
Use investigator for code/evidence questions, implementer only for scoped Stage4
repairs, and fresh reviewer for independent source review. Models inherit your
selected model. Collect workers before ending the coordinator turn; no unattended
worker handoff through the hook. Read-only investigations may run concurrently;
only one writer. No automatic nested subagents. Workers return results; parent
saves them and checks their evidence before checkpointing. No cloud/worktree
switch that loses ignored candidate files.

When GUI/device work is needed, record a precise Codex queue reservation and
continue independent admitted work. If all work is blocked, set needs_user or
no next_task, save ready_for_codex and stop. A queue entry is not a passed test.
Never fabricate useful work to keep the loop alive. Stop on user cancellation,
errors, missing/expired scope, candidate drift, repeated failures, exhausted
allowance, no new evidence, or owner change.

## Run-state contract

`.future-self/local/platform-handoff/cursor-run.json` starts disabled. After
adoption, coordinator writes it atomically and mirrors it with other records.
Fields:

- enabled: true only for this founder-requested coordinator conversation.
- conversation_id: actual ID matching active_owner.
- checkpoint_revision: current saved workflow revision.
- active_workers: actual outstanding worker IDs; must be empty to auto-continue.
- needs_user: explicit boolean; true stops.
- last_progress: checkpoint_revision, evidence_ref (relative to local/), sha256
  of newly completed concrete evidence. Rewording a progress note is not progress.
- next_task: id (never reused), kind, status=ready, dependencies_satisfied=true,
  requires_computer_use=false, requires_native=false while native recovery is
  paused, instruction_ref (existing relative local file), budget_required as an
  object over sql/local_checks/aggregate_checks/sentry.
- Zero-budget kinds (`read_only_review`, `artifact_preparation`, `code_repair`)
  must declare all zeros. `service_sql` / `executable_check` must declare the
  exact spend, cite an approved unexpired authority that matches
  `budget_ledger`, match the recorded staging target, and cite an **open**
  finite `budget_allocations` entry whose remaining covers the request.
- The coordinator may create those finite allocations from **existing remaining**
  already-approved budget (founder 2026-09-10). Remaining cap is still a ceiling.
  APP-S5-OVERNIGHT-001 (founder 2026-09-10 sleep authorization) may raise remaining
  caps without resetting historical used: SQL +60, local_checks +40,
  aggregate_checks +20, Sentry +0. While SQL work is active, keep a recovery_floor
  of 10 database requests. Sentry remaining 0 stays blocked. Hook admission never
  invents spend.

Kinds: read_only_review, artifact_preparation, code_repair, service_sql,
executable_check. `code_repair` additionally requires Stage4,
authority_verified=true, authority_id pointing to an approved unexpired scope
and scope_ref to the exact repair brief. The hook conservatively rejects
approvals with a non-null expiration date for that kind; coordinator must stop
rather than clear that date to bypass the check. Expiring scopes require a
reviewed hook extension, not invented approval. Sentry sends stay exhausted. An authorized code change without test allowance remains
unverified; never mark Stage4 fully verified or G5 passed on that basis.

The hook sends a follow-up only after a completed turn, a matching owner, no gate,
a ready/in_progress workflow, an eligible task, and fresh hash-checked evidence.
It persists at-most-once receipts under cursor-hook-receipts using a file lock.
Default at-most-20 follow-ups per conversation. APP-S5-OVERNIGHT-001 raises that
to 40 additional follow-ups or eight hours from overnight adoption, whichever
comes first; `hooks.json` loop_limit is 40 for that window. Preserve prior
receipts. Repeated task IDs, unchanged evidence, same/older revision,
malformed/missing state, overnight deadline, or cancellation all stop. Do not
mint task IDs or start new conversations merely to evade limits. On cap
exhaustion, checkpoint and report remaining work. Lost delivery is not
automatically retried; reconcile evidence before any manual resume.

The hook is a continuation filter, NOT a sandbox or proof that the agent obeyed
its task. It does not bypass Cursor's own tool permissions or validate semantic
consent. It will not auto-approve permission dialogs. Local Cursor must remain
running and the drive available. Stop-hook output does not restart a closed app.
Do not weaken global tool permissions to make the loop run.

## Return to Codex

Collect workers, save actual results/budgets and reservations, set enabled=false,
next_task=null, platform_handoff.status=ready_for_codex, active_owner=null, then
checkpoint/mirror/check. Owner stays cursor until the founder explicitly returns
to Codex and requests adoption. Keep all receipts and evidence for reconciliation.

## Startup prompt

Read `.cursor/FUTURE_SELF_SETUP.md` and
`.future-self/local/platform-handoff/CURSOR_HANDOFF.md`. Verify the Cursor rules,
three subagents and project hooks loaded. Adopt the current checkpoint using your
actual conversation ID, then perform the file-only live continuation check.
Continue eligible Future Self work automatically with independent review and
verified checkpoints. Reserve all computer-use work for Codex. Preserve gates,
budgets and paused native recovery. Stop only when required input or a real limit
blocks further admitted work. Do not change the five-minute automation.
