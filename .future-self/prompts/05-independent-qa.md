# Session 5 — Independent QA, fix plan and retesting

Read START_HERE, MASTER_CONTEXT and WORKFLOW first, along with the saved checkpoint and relevant live records. This prompt does not authorize itself: the dispatcher must have admitted this stage. Use actual available tools and current founder scope. Checkpoint evidence at each stage boundary. Then follow the saved execution policy and reference/AUTONOMOUS_CONTINUATION.md: continue already-authorized work in the coordinating task, or stop for the specific unmet gate/blocker. A routine boundary does not require another founder message in autonomous mode.

## Entry and independence
Require a named candidate from approved implementation and the authorized test envelope. Use a fresh independent QA task for each candidate cycle, not the implementation agent asserting its own changes are correct. The ongoing coordinator remains the sole checkpoint writer and provides the candidate, scope and test envelope; a QA agent receives no full implementation reasoning history and makes no product fixes. Bounded independent specialists can supplement this. If only a same-agent review is possible, label it and preserve independent acceptance as a blocker where required; do not fabricate a second reviewer.

Verify exact commit AND dirty patch identity, build/profile/runtime, backend revision, environment, remote flags, products and test accounts. Candidate/config drift invalidates affected acceptance. Do not silently test a different build or branch.

## Execute the coverage matrix
Use reference/QA_MATRIX and current approved feature inventory. Test every enabled critical journey and onboarding variant; use risk-based pairwise coverage for lower-risk cross-products. Run automated tests and actual native interaction. Include small/standard/large supported iPhone layouts and relevant actual supported iOS runtimes. Distinguish simulator, physical-device, sandbox and TestFlight evidence. Unavailable mandatory physical-device/critical store tests are blocked, never inferred from code. Exact TestFlight-candidate final acceptance can be scheduled as Stage 6's mandatory pre-review gate; preliminary QA completion does not waive it.

Exercise fresh install/onboarding; anonymous/link/login/recovery/reinstall/cross-device states; feed/messages/settings; all approved purchase types and eligibility/lifecycle/restore/transfer; notification permissions and delivery/receipts; widgets; guest/unpaid/paid/lapsed deletion and cleanup; offline/errors/retries; foreground/background/termination; rapid and concurrent actions; timezone/day/DST; large text/VoiceOver/Reduce Motion and visual quality.

Replay audit attack paths within approved isolated budgets. Check direct-API authorization, input/cardinality limits, retry/idempotency, many identities, upstream refresh/cost amplification and notification/telemetry fan-out. Stop immediately at unintended production contact or cap breaches. Production smoke requires its own small scoped approval; no production stress tests.

## Report, do not silently repair
For every case record pass/fail/blocked/not_run, expected/actual, steps/command, exact candidate/environment/account state and evidence. Measure coverage by critical journey and variant, not only assertion count/screenshots. For every issue record reproduction, severity, confidence, affected scope, recommended fix and regression. Evaluate founder-approved visual acceptance; do not substitute your preference.

Return a prioritized repair plan. If a repair is already within valid approved scope, cite it; otherwise request its approval. On approval save the repair batch, return_to=5 (or release continuation), status=complete and next_stage=4. Validate the checkpoint. In approved autonomous mode the coordinator dispatches a new visible implementation task immediately, then dispatches a fresh QA task after the repaired candidate checkpoint. Never apply product fixes in this QA session just to claim green.

Retest failures plus neighboring transitions, critical regression and relevant adversarial cases on the new candidate. Close findings with evidence, not a developer's assertion.

## Exit gate
G5 accepts only an evidenced candidate with no known unresolved critical/high launch blockers, complete mandatory pre-release coverage, selected visual quality and explicit owner acceptance of lower-risk deferrals. Separate exact TestFlight checks reserved for Stage 6 and do not mark them passed. Other missing critical checks block progression. Record any scope limitation prominently.

After founder G5 acceptance, mark Session5 complete, next_stage=6 and checkpoint. Autonomous continuation may prepare authorized release work; R1/R2/R3 remain separate explicit gates. A request to continue is not approval to upload or submit the app.
