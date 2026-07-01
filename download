---
name: medkit-managed-agent-setup
description: Set up, bootstrap, or modify the `medkit-attending` Claude Managed Agent. Use this skill whenever work involves src/agents/*, the backend `/agent/*` proxy endpoints, the attending system prompt, custom tool schemas, or the event-stream renderer. Also use when adding a new custom tool the agent can summon as rich UI.
---

# medkit-attending Managed Agent — setup & maintenance

We use **one Managed Agent** (`medkit-attending`, Opus 4.7) that watches the trainee work through cases and surfaces feedback via custom-tool UI cards. The scaffolding is in place — this skill keeps its moving parts aligned.

## Key files

| File | Role |
|---|---|
| `backend/server.py` (Managed Agents section) | FastAPI proxy. Keeps the Anthropic API key server-side. Owns the agent config + custom tool JSON schemas. |
| `backend/.env.example` | Env-var template. Copy to `backend/.env.local`. |
| `src/agents/managedAgent.ts` | Browser client for the proxy. Handles SSE stream, reconnect+backfill, idle-break gate. |
| `src/agents/customTools.ts` | Zod schemas for every custom tool. Validates `agent.custom_tool_use` inputs before render. |
| `src/agents/eventStreamRenderer.tsx` | `<ManagedAgentPanel sessionId>`. Maps tool names → React components. |
| `vite.config.ts` | `/agent/*` → `http://127.0.0.1:8787` proxy rule. |
| `spec.md` | Canonical list of primitives we're using (`Agents`, `Environments`, `Sessions`, custom tools, vaults). Update when scope changes. |

## First-run bootstrap

1. `cp backend/.env.example backend/.env.local`.
2. Set `ANTHROPIC_API_KEY` in `backend/.env.local`.
3. Start the backend: `backend/.venv/Scripts/python.exe backend/server.py`.
4. `curl -X POST http://127.0.0.1:8787/agent/bootstrap` (or hit it from the browser).
5. Response will include `agent_id`, `environment_id`, and `"created": true`. Paste both IDs into `backend/.env.local` under `MEDKIT_AGENT_ID` and `MEDKIT_ENV_ID`.
6. Restart the backend. Subsequent `/agent/bootstrap` calls are no-ops (`"created": false`).

## Adding a custom tool (3-step contract)

A custom tool is defined in THREE places and all three MUST stay in sync:

1. **`backend/server.py` → `MEDKIT_CUSTOM_TOOLS`** — JSON schema, sent to `agents.create`.
2. **`src/agents/customTools.ts`** — Zod schema + discriminated-union entry.
3. **`src/agents/eventStreamRenderer.tsx` → `renderCustomTool`** — React component mapping.

Shape must match across all three. If a field is optional on the Python side but required in Zod, the renderer will reject valid agent emissions.

**After adding a custom tool,** the agent must be updated (not replaced). Use `client.beta.agents.update(agent_id, tools=[...])` — this creates a new agent version. Existing sessions keep their pinned version; new sessions pick up the latest. Archiving the agent is permanent — don't.

**Shortcut: call `POST /agent/refresh`** — this pushes the current in-file `MEDKIT_ATTENDING_SYSTEM_PROMPT` *and* `MEDKIT_CUSTOM_TOOLS` up to the existing agent and bumps its version. Always call this after editing either. If you forget, V1 of the agent will run in production without the new tool, you'll see `agent.custom_tool_use` events for tools the current version doesn't know about, and the renderer will surface "unknown tool" errors.

## Custom-tool permission policy

Each custom tool has a `permission` of `auto` or `confirm` in `src/agents/customTools.ts` → `CUSTOM_TOOL_PERMISSIONS`. `auto` tools ack immediately (read-shaped). `confirm` tools render an approve/decline UI in `eventStreamRenderer.tsx`; `user.custom_tool_result` is only sent after the human clicks. When you add a tool, set its permission deliberately — writes (anything that would cause a user-visible side-effect) must be `confirm`. Tests in `scripts/test/custom-tools.test.ts` enforce that every name has a permission entry.

## Credential vault (hospital-ehr-mcp stub)

`lookup_ehr_history` is backed by `POST /agent/vault/ehr/lookup`. The flow: agent emits the tool call → browser POSTs to the vault endpoint (no token in the request) → backend attaches `EHR_API_TOKEN` server-side → response returns data, never the token → browser sends the JSON back as `user.custom_tool_result`. Tests in `backend/tests/test_vault.py` assert the token never appears in response bodies, headers, or log lines. When adding a new third-party integration, mirror this pattern — never put a credential in a `user.message` or a custom-tool input.

## Direct-inference triage endpoint

`POST /agent/triage/classify` is a SEPARATE Opus 4.7 inference — not Managed Agents. Called at ER arrival for a one-shot ESI classification before the observer agent has enough context to form an opinion. System prompt inlines the ESI rules from `.claude/skills/medkit-triage-logic.md`; keep the two in sync. Pure function `run_triage_reasoning` is unit-tested with a mocked client (`backend/tests/test_triage.py`) — don't add a second model call without mirroring those tests.

## Modifying the system prompt

- Edit `MEDKIT_ATTENDING_SYSTEM_PROMPT` in `backend/server.py`.
- Run `client.beta.agents.update(agent_id, system=...)` (new version).
- **Don't** re-create the agent — the ID in `MEDKIT_AGENT_ID` stays the same; just the version bumps.

## Event-type cheatsheet

| Event | What to do |
|---|---|
| `agent.message` | Render the text content in the chat panel. |
| `agent.custom_tool_use` | Validate input with Zod → render card → send `user.custom_tool_result` (even if just "rendered"). The session stays idle until we reply. |
| `session.status_idle` with `stop_reason.type === 'requires_action'` | Agent is blocked on US. Keep the stream open. |
| `session.status_idle` with any other stop_reason | Terminal. Break the stream. |
| `session.status_terminated` | Session is done. Break the stream. |

**Do not break on bare `session.status_idle`.** The idle gate is implemented correctly in `openEventStream` — don't duplicate that logic in consumers.

## Don'ts

- Don't call `agents.create()` per session — that's a bootstrap anti-pattern, creates orphan agents and defeats versioning.
- Don't put `ANTHROPIC_API_KEY` in any `VITE_*` variable — it ends up in the browser bundle.
- Don't archive the agent or environment — both are permanent. Update instead.
- Don't add prompt-caching markers (`cache_control`) to the Managed Agent's system prompt. The Managed Agents harness caches automatically.

## Debugging

- Full event history: `GET /agent/sessions/:id/events` (paginated, up to 1000).
- Server logs: `uvicorn` stdout on `:8787`. Exceptions inside the proxy surface as `proxy_error` SSE events on the client.
- Session status / usage: `client.beta.sessions.retrieve(session_id)` — add a `/agent/sessions/:id` proxy endpoint if you need this from the browser.
