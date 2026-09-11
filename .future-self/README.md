# Future Self — your one-message workflow
Send **Continue Future Self.** in a Codex chat opened in this same local project folder.

Codex finds the correct stage, reads its own prompts and saved records, asks only for decisions it cannot inspect, and stops at approval gates. With the founder-approved autonomous policy it saves each stage checkpoint and continues authorized work in one coordinating task, using fresh independent QA tasks. Routine boundaries need no new message. It stops for a concrete decision, access/prerequisite blocker, or repeated failure requiring reassessment. You never need to choose a numbered file or attach context.

For a status-only answer say **Future Self status.** This does not authorize work.

For an approval, respond to the exact request Codex just showed. It supplies the words to use. “Continue” does not approve pending changes or public release. You may reject or revise any choice.

Stages: discovery → audit → choose motion/UI → implementation → independent QA/fixes/retest → release. A new chat does not mean a new installation. Keep one coordinating task; automatically create a new visible execution task for every subsequent session, including each implementation and independent QA cycle. App Review may be pending across multiple visits; Codex reports the actual status.

The local checkpoint lives in `local/workflow.json`; the readable next action is `local/NEXT.md`. Codex maintains both, along with five evidence/decision documents. Do not edit them manually to skip a gate.

No secret values belong in these records. `local/` is ignored by Git but is not encrypted. Keep your normal private computer backup. Do not force-add this folder or copy it indiscriminately to a public repository or cloud agent.

Fallback if short routing does not load: **Read `.future-self/START_HERE.md` in this workspace and continue Future Self. Respect the saved stage and approval gates.**
