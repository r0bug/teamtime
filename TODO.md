# TeamTime TODOs

## Rework: AI Cron Orchestrator (`runOfficeManager` / `runRevenueOptimizer`)

**Status:** Disabled (2026-04-18). Cron lines commented out in crontab; `ai_config.enabled=false` for both agents.

### Why it was disabled
- Cron endpoint hardening in late 2025 moved auth from `?secret=` query param to `Authorization: Bearer` / `X-Cron-Secret` header. The crontab entries were never updated, so the endpoint returned `401 Unauthorized` for ~4 months without anyone noticing (cron output isn't alerted on).
- Even when it did run, its value was low: it fired every 15 minutes, wrote an observation row, and occasionally nagged/awarded points — but the pre-flight triage caught most empty runs, and the chat-based Office Manager (web + SMS) handles the real interactive work.
- Its `ai_token_usage` insert hardcoded `inputTokens: 0, outputTokens: 0, model: 'unknown', provider: 'anthropic'`, so the usage dashboard numbers it produced were never trustworthy.

### What to rework before re-enabling
1. **Value proposition:** decide what autonomous actions actually justify recurring LLM spend. Candidates:
   - End-of-shift clock-out reminders
   - Stale-task nudges after N hours idle
   - Early-morning "today's schedule summary" broadcast
   - Drift detection vs. the default schedule template
2. **Config hygiene:**
   - Make the auth path obvious (the current pattern silently 401s — consider panicking loudly or exposing a health probe).
   - Kill `dryRunMode` if we never trust it; otherwise wire it into the UI properly.
3. **Observability:**
   - Log real `inputTokens`/`outputTokens`/`model` into `ai_token_usage` (the chat orchestrator already does this correctly — mirror that helper).
   - Fail loudly if inserts into `ai_token_usage` fail (currently swallowed in a try/catch that warns only).
4. **Trigger gating:**
   - The pre-flight triage is good but ignores how recently the same trigger fired — it will re-fire `late_staff` every 15 minutes for the same person. Add cooldowns keyed on `(trigger, targetUserId)`.
5. **Prompt budget:**
   - Context assembly currently uses 2k tokens for routine runs; we should be able to do most autonomous jobs in <500 tokens with Haiku 4.5. Revisit.

### Related unrelated cron issue
`/api/tasks/cron` (task rules evaluator) uses the same broken `?secret=` pattern and has been 401'ing since the same auth change. If task rules are still wanted, update that cron entry to use `-H "X-Cron-Secret: ..."`.

---

## Chat Office Manager
- **Default model is now `claude-haiku-4-5-20251001`** (Haiku 4.5) for cost. Can be overridden per chat if richer reasoning is needed.
- Every LLM call now writes a row to `ai_token_usage` with real token counts, model, and cost. Visible on `/admin/ai/usage`.
