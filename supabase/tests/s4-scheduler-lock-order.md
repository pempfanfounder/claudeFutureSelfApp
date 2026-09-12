# Scheduler parent/state lock order — S5-RB13

Status: confirmed source review; SQL runtime unrun for this repair. This document does not accept S5C13-M01 or G5.

## Change and bound

Only enqueue_due_notifications(integer) is replaced. Its due candidate cursor reads ordered user IDs without locking. Before each admission it exits if v_admitted >= p_batch (validated range 1–500). It attempts auth.users FOR KEY SHARE SKIP LOCKED, then re-reads the same due notification_state row FOR UPDATE SKIP LOCKED. The due predicate and current counters/date are refreshed under the state lock. A missing/deleting parent is skipped without consuming an admission. A locked, missing, or no-longer-due child raises deliberate NO_DATA_FOUND inside the small admission savepoint; that rollback releases the temporary parent lock. Successful admission increments v_admitted before entering the existing user-work savepoint.

This bounds retained daily-pass auth parents and state rows to p_batch, including the provisional next parent. Candidate scanning/sorting may examine more due rows, just as the former LockRows SKIP LOCKED could scan past locked rows; there is no new fixed scan/runtime bound or throughput claim. Read-only cursor prefetch cannot lock unrelated parents. The unchanged streak pass has its own original p_batch bound and may acquire additional parent references through producer inserts; the daily-pass bound is not a global all-pass parent bound.

A locked first user does not consume a successful admission, including p_batch=1. A successful user with a denied quota or work failure still consumes one admission, matching the old selected-state limit. Successful parent/state locks are acquired before the work exception block, so that block’s rollback and backoff retain them. These are explicit PL/pgSQL statements; no join-rowmark order or WHERE side-effect placement is assumed.

## Effective functions and callers reviewed

| Path | Relevant order and consequence |
|---|---|
| Due scheduler | Pipeline control → push_schedule policy/windows → auth parent key share (nonwaiting) → state update (nonwaiting) → existing user work → producer/recalc. No child is held when attempting a deleting parent. |
| Auth deletion | auth.users deletion lock → cascading FK children, including state and schedule claims. If scheduler admitted first, deletion waits on auth before reaching state; if deletion entered first, scheduler skips auth. The Edge delete-account handler makes budget/receipt/admin.deleteUser calls as separate requests; its budget RPC is not held as the auth-delete transaction. Native Auth API behavior remains unverified. |
| enqueue_push_job, effective 20260908015000 | Pipeline control → admission/read-only gates → push_enqueue policy/windows → schedule-claim insertion (auth FK key share) → pgmq send → claim queue ID. Daily scheduler now already owns the matching auth key share. Standalone/trial producer starts with no state lock. Producer control serializes queue/cap reservation with other producers/senders. Its body is unchanged. |
| Streak scheduler | Same pipeline control/schedule budget → producer claim/FK parent → state upsert. It does not acquire state before producer entry. On producer failure the existing savepoint rolls back producer effects before its state backoff. No new trial/streak logic. |
| recalc_notification_state, effective 20260908011000 | Reads profile/prefs, creates missing prefs if needed (notification_prefs policy/row and auth FK), inserts state (auth FK), reads/updates counters/due. It takes no pipeline control or push_schedule/push_enqueue policy. The scheduler already has parent/state; its missing-prefs branch exits before recalc. No replacement is necessary for the observed scheduler/delete inversion. |
| recalc_my_notification_state | notification_prefs budget → recalc; no producer/pipeline acquisition. |
| register_device | register_device budget → install/device row → recalc current and sometimes previous owner; old-owner transfer and arbitrary preheld-lock transactions remain separate leads, not accepted by this repair. |
| save_notification_prefs/direct prefs writes | notification_prefs policy → prefs row; statement trigger takes the policy first. No scheduler call in this SQL function. Clients call recalc via a separate RPC. |
| Sender/finalizer paths | Existing pipeline control/parent helper paths remain unchanged. No grants, RLS, entitlement finalizer, ACL, client, quota, gate or provider changes. |

This is a scoped compatibility argument for the observed call paths, not a proof that arbitrary callers with externally preheld locks or all existing multi-user transfers are deadlock-free. The existing recalc missing-prefs creation and independent caller interactions remain outside acceptance. A late recalc failure after the existing v_count increment was not repaired or newly accepted; the focused error scenario injects failure before that increment and asserts actual rows/counters as well as count.

## Regression review

The staging package contains S (actual scheduler first, exact auth-row blocking barrier, terminal delete completion and unselected-parent deletability), D (actual uncommitted delete first, exact parent NOWAIT rejection, p_batch=1 healthy successor), and K (state-only prelock, actual scheduler successor, then skipped-parent deletion while scheduler still owns its other locks). Each pair requires matching reciprocal PID/backend-start values, explicit terminal SQLSTATE 00000 in both results, and its case assertions. Count zero or absent errors is never a pass.

The single-session SQL scenario exercises normal reservation, duplicate claim, daily cap, premium exclusion, paused pipeline, queue cap, old/fresh token-free synthetic receipt and per-user error/healthy progression. Its disposable trigger and rows roll back. Concurrent error-path auth retention is static-only: a transactional CREATE TRIGGER would itself confound the deletion barrier, so that paired draft is rejected and preserved outside the dispatchable staging directory. Fresh QA must review instrumentation if that runtime case is needed.

No SQL parser/server was available locally and zero staging SQL requests were assigned. The source-contract checks test structure only. Existing Node backend/push fixtures exercise handler code with in-process SQL/provider doubles; they do not execute this migration. PostgreSQL PL/pgSQL parsing, query execution, lock footprint, statement/lock timeout fit, both overlap orders and source/ACL readback remain mandatory unrun checks.
