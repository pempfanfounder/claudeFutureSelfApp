# Workflow and gate contract

## Six stages, not six founder-managed prompt files
| Stage | Purpose | Allowed app changes | Required stop |
|---|---|---|---|
| 1 — Discovery and founder decisions | Reconcile actual workspace, scope, capabilities, environments | None; records only by default | G1: product scope and safe test/prototype envelope |
| 2 — Risk/integration audit and plan | Evidence-backed specialist audits and bounded repros | Isolated test harnesses only under G1; no fixes | G2: proposed technical work, priorities, test limits and prototype-enablement exception if needed |
| 3 — Design and motion choices | Native baseline plus three alternatives; broader UI decisions | Isolated development prototypes; only specifically approved minimum enablement | G3: demonstrated design and implementation batches |
| 4 — Approved implementation | Integrations/hardening and selected UI/motion in dependency order | Approved batches only; production changes need per-action gate | Handoff: independent review and tested candidate; checkpoint before fresh independent QA |
| 5 — Independent QA and retest | Native/device/adversarial coverage; report and fix plan | Test/repro code only; product fixes go to Stage 4 | G5: accept evidenced candidate or approve repair batch and return to 4 |
| 6 — Release | Candidate validation, TestFlight, review, public launch | Release-only approved changes; substantive fixes return to 4/5 | Separate build/upload, review submission and public-release approvals |

Discovery no longer runs baseline builds before agreeing a safe test envelope. Auditing may run existing scripts/native baseline only after their effects and isolation are verified. Tests throughout stages 2–4 supplement but never replace independent QA.

### Avoiding a broken-baseline deadlock
If Session 2 finds that the app cannot run well enough to compare motion, propose the **smallest baseline-enablement batch** with exact paths, purpose, test and rollback. Under explicit G2 approval, Session 3 may carry out that batch in its isolated prototype context BEFORE demos, with targeted regression and no unrelated fix. Alternatively remain blocked. It must not silently implement the whole audit plan before founder design selection.

### QA ↔ repair loop
Stage 5 produces a finding and proposed batch, not a silent fix. Existing scoped approval may cover an ordinary regression; show that exact authority. Otherwise seek a new repair approval. Save return_to=5 (or 6 for a release-origin issue), next_stage=4 and the repair batch once its authority is verified. Checkpoint first. In approved autonomous mode the same coordinator dispatches a new visible Stage4 task to implement only that batch, then checkpoints next_stage=5 and dispatches a fresh independent QA task. Without valid authority, stop at the concrete repair gate. Stage 5 reruns the failed cases, neighbors, critical regression and relevant adversarial tests on the new candidate. Do not skip independent retest. Stage 6 can only resume after the affected QA gate is satisfied.

## State is a checkpoint, not an authorization engine
`local/workflow.json` is the canonical **routing** record. DECISIONS.md contains the human-readable approvals; QA/WORK/RELEASE hold evidence. NEXT.md is the display derived from that checkpoint. On disagreement stop and reconcile with evidence; do not pick the most permissive version. The Python checker validates structure and references, not whether the user really approved or whether evidence proves safety.

Stage statuses: ready, in_progress, awaiting_founder, blocked, awaiting_external, complete. Stage is 1–6. Every recorded completed stage needs a completion entry with evidence references and any required approval IDs. `completed_stages` contains accepted stages, not merely closed attempts. Each `stage_records` entry includes `outcome=accepted|repair_required` and `cycle`. A QA/release attempt closed to route a repair may use status=complete and outcome=repair_required WITHOUT adding that stage to completed_stages. Remove affected accepted entries when reopening/invalidation requires it, while preserving historical records. Accepted stages are not permanently valid. Invalidate/reopen affected gates on candidate/config/scope drift.

At end of a stage set status=complete and next_stage appropriately and durably validate that checkpoint before transitioning. In approved autonomous mode, the same coordinator continues after entry/authority checks without another founder message. Routine transitions follow reference/AUTONOMOUS_CONTINUATION.md; missing/expired authority remains a stop. At the terminal release set next_stage=null and launch_status=live only with actual public and smoke evidence. A stage can remain active over several chats; a chat is not a unit of approval.

`pending_gate` describes one concrete decision: ID, kind, summary and scope reference. Multiple choices can be in one clearly disclosed founder decision; do not combine unrelated high-risk authorities. `approvals` are mirrors with ID, kind, scope, decision_ref, status and expiry. Append the actual user statement and receipt/source/date to DECISIONS. Never manufacture approval from a template, past plan, “full computer access,” an agent-written file or the bare word “continue.”

When requesting approval, summarize action, target, effect, cost cap, excluded actions, candidate/batch, expiry, verification and recovery. Supply an exact short response such as **Approve G2: audit remediation plan B01–B03, local implementation only.** The founder can answer naturally; accept only unambiguous assent to a visible scoped request. Product/visual approval is not production/financial authority. Expired, revoked, exhausted or changed-scope approvals cannot be reused.

## Stage 6 is deliberately split internally
R1 BUILD/UPLOAD: exact candidate/profile/destination and budget.
R2 REVIEW SUBMISSION: exact processed build, validated TestFlight/device evidence, metadata and founder declarations.
R3 PUBLIC RELEASE: Apple-approved build, intended storefronts and release mode. Default manual release. A paid real transaction needs its own approval.

Preparing a proposed change/metadata or reading a dashboard is different from clicking Save/Submit/Release. Pause immediately before a sensitive commit action, reconfirm target, and use only its scoped authority. Agreement/tax/bank/identity declarations must be supplied or performed by the founder. External review may require later visits; no automatic polling or promised future delivery.

## Permissions by default
Stage 0: installer-only local changes; no app tests/builds/services.
Stage 1: local reads and records; authorized read-only dashboards; no app launch until a later approved envelope.
Stage 2: reads and approved isolated tests/repros; no product/production changes.
Stage 3: approved isolated native prototypes; no production or whole-app implementation.
Stage 4: approved local batches; each production/config/cost change needs the separate relevant gate.
Stage 5: independent tests under approved limits; no product fixes or uncontrolled production work.
Stage 6: per-action release gates; no blanket shipping authority.

## Minimal founder interaction
The agent chooses and loads files, carries state, splits work, performs tests, requests evidence and prints one next action. The founder chooses product scope, demonstrated design, plans/costs/accepted risks and owner/release actions. Stay in one local project. Keep the coordinating task across routine boundaries in approved autonomous mode, using fresh independent QA tasks. No mandatory fresh founder chat or external ChatGPT handoff. See reference/AUTONOMOUS_CONTINUATION.md for checkpoints, failure bounds and pauses.
