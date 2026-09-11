# Capability verification and operating choices
Checked against official OpenAI documentation on 7 September 2026. These capabilities can change; inspect the actual client/permissions at execution. This is a capability map, not a guarantee that every tool is enabled on this account.

## Supported mechanisms used here
Codex reads project instructions through AGENTS.md, with AGENTS.override.md taking precedence at a directory and a documented default combined instruction limit of 32 KiB. This package appends a small router, preserves existing guidance and gives an explicit START_HERE fallback. A fresh chat after installation is recommended. No global instruction-limit edit is made.
Source: https://learn.chatgpt.com/docs/agent-configuration/agents-md

Local repository skills are discovered under .agents/skills; a SKILL.md defines the name, description and instructions. The installed skill is a convenience; the plain-language router does not depend on a particular slash-command syntax. Skill changes may require reload/restart if not picked up. Do not auto-run a stage just because a skill is discovered.
Source: https://learn.chatgpt.com/docs/build-skills

Codex supports explicitly requested subagents and instruction-requested delegation. Availability, limits and configuration vary; use a maximum of two concurrent read-only specialists here by default and no nested swarm. Missing multi-agent tools mean sequential work, not fabricated parallel results. Token use can be higher with subagents. This package does not install version-sensitive custom-agent TOML or set model IDs.
Source: https://learn.chatgpt.com/docs/agent-configuration/subagents

Computer Use is documented for Codex/Work on supported desktop clients and regions, with a plugin and OS/app permissions. macOS requires Screen Recording and Accessibility. It is suitable for iOS simulator/UI tasks. The docs recommend GPT-6 Astra for difficult visual work when available in the selector. These are capabilities in an execution surface, not a separate founder-managed “Astra operator” requirement.
Source: https://learn.chatgpt.com/docs/computer-use

Local permission profiles/sandbox settings are separate controls. Configuration is version-sensitive, and GUI actions can affect state outside project command boundaries. Do not install broad/full-access settings or disable approvals. Use existing local write permission for setup and narrow further permissions at the relevant stage.
Sources: https://learn.chatgpt.com/docs/permissions ; https://help.openai.com/en/articles/20001510-manage-browser-and-computer-use-in-your-enterprise-workspace

Codex local execution can use local repositories/terminals/developer tools; cloud and local contexts are distinct. An open cloud chat is not proof of access to the Mac/Xcode or ignored local artifacts.
Source: https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex

## Deliberate simplifications from the earlier strategy
One local Codex lead throughout replaces required ChatGPT/Astra/Codex handoffs. Keep six quality stages but hide the numbered prompts from the founder. Add a dispatcher, local routing state, exact next-action display and conflict-aware offline installer. Move baseline execution after an approved isolation envelope. Make minimum prototype-enablement explicit. Keep independent QA and per-action release approvals. Do not build a custom server, paid orchestration framework, plugin store product or scheduled workflow merely to manage Markdown files.

Use ChatGPT as an optional second opinion on a genuinely disputed product/architecture issue. Prepare a sanitized brief and import conclusions as proposals until the founder approves them. Do not share account data unnecessarily or treat another chat's advice as live test evidence.

## What cannot be supplied by this ZIP
An available account/model, permission grants, login sessions, MFA, Xcode/runtimes, real devices, subscription/Apple approvals, truthful legal facts, or durable execution while no task is running. Instructions do not cryptographically enforce approvals. Local state is not automatically shared across clones/machines/worktrees/cloud contexts. The installer and checker are helpers, not a security sandbox or production launch certificate.
