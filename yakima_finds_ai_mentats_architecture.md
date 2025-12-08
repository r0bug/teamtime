# Yakima Finds AI "Binary of Shackled Mentats"

## Architecture for HR Office Manager + Revenue Optimizer

## 1. Objectives

We are building two cooperating AI agents that operate over TeamTime +
POS + (future) auction data:

1.  **HR Office Manager (Fast / System 1)**
    -   Runs frequently (e.g., every 10--15 minutes).
    -   Focuses on staff experience, schedule adherence, task
        follow-through, and gentle operational nudging.
    -   Never touches raw revenue metrics directly.
2.  **Back Room Revenue Optimizer (Slow / System 2)**
    -   Runs infrequently (e.g., nightly, plus optional weekly deep
        dives).
    -   Reads historical performance from POS and internal systems.
    -   Writes long-term "memories" and "policy notes" that influence
        the Office Manager.
    -   Optimizes for revenue and throughput subject to HR fairness and
        fatigue constraints.

Core principle: **No agent holds state internally across calls. All
state lives in the database.**\
Each LLM call is fully stateless and auditable.

------------------------------------------------------------------------

## 2. High-Level Components

### 2.1 AI Core Layer

Shared infrastructure for both agents:

-   LLM Provider Abstraction (OpenAI, Anthropic)
-   Context Provider System (modular data loaders)
-   Tool Registry with schema validation and cooldown rules
-   Two Orchestrators:
    -   `runOfficeManagerTick()`
    -   `runRevenueOptimizerTick()`

------------------------------------------------------------------------

## 3. Data Model Additions

### 3.1 AI Configuration (`ai_config`)

-   id
-   enabled
-   agent (`office_manager | revenue_optimizer`)
-   provider
-   model
-   api_key_encrypted
-   instructions
-   cron_schedule
-   max_tokens_context
-   temperature
-   dry_run_mode
-   created_at
-   updated_at

------------------------------------------------------------------------

### 3.2 AI Actions Log (`ai_actions`)

-   id
-   agent
-   run_id
-   run_started_at
-   context_snapshot (JSONB)
-   context_tokens
-   reasoning
-   tool_name
-   tool_params (JSONB)
-   executed
-   execution_result (JSONB)
-   blocked_reason
-   error
-   target_user_id
-   created_task_id
-   created_message_id
-   tokens_used
-   cost_cents
-   created_at

------------------------------------------------------------------------

### 3.3 Cooldowns (`ai_cooldowns`)

-   id
-   agent
-   user_id
-   action_type
-   related_entity_id
-   related_entity_type
-   expires_at
-   reason
-   ai_action_id
-   created_at

------------------------------------------------------------------------

### 3.4 AI Memory (`ai_memory`)

-   id
-   scope (`user | location | auction | global`)
-   user_id
-   location_id
-   auction_id
-   memory_type
-   content
-   confidence
-   observation_count
-   last_observed_at
-   is_active
-   expires_at
-   created_at
-   updated_at

Written only by Revenue Optimizer.

------------------------------------------------------------------------

### 3.5 AI Policy Notes (`ai_policy_notes`)

-   id
-   scope
-   content
-   priority
-   updated_by
-   created_at
-   updated_at

These dynamically modify Office Manager behavior.

------------------------------------------------------------------------

### 3.6 Metrics Tables / Views

**Staff Metrics Daily:** - total sales - transaction count - avg
transaction value - items per transaction - revenue per labor hour - avg
transaction duration - till variance total & count - tasks completed -
auction lots handled - refund/complaint counts

**Location Metrics Daily:** Same structure, grouped per location.

**Auction Metrics:** - lots listed - lots sold - sell-through % - avg
final price - no-pay rate - creation → bid time - bid → hammer time -
hammer → payment time - payment → shipment time - avg photos per lot

------------------------------------------------------------------------

## 4. Context Providers

Each module implements:

-   `moduleId`
-   `priority`
-   `isEnabled()`
-   `getContext()`
-   `estimateTokens()`
-   `formatForPrompt()`

Office Manager Providers: - Attendance - Tasks - Purchases - Expenses -
Auction Ops (future) - Memory (filtered) - Policy Notes

Revenue Optimizer Providers: - POS Metrics - Auction Metrics - AI Action
Summaries - Attendance History - Task History - Memory & Policies

------------------------------------------------------------------------

## 5. Tools Per Agent

### Office Manager Tools

-   send_direct_message
-   create_task
-   send_notification
-   flag_for_manager

Constraints: - No pay changes - No firing - No schedule editing - No
direct purchase approvals

------------------------------------------------------------------------

### Revenue Optimizer Tools

-   write_memory
-   update_policy_notes
-   draft_manager_report
-   propose_kpi_thresholds (optional)

Constraints: - No direct staff messaging - No direct HR decisions

------------------------------------------------------------------------

## 6. Execution Model

### Scheduling

-   Office Manager: every 10--15 minutes
-   Revenue Optimizer: nightly + weekly

Each tick: 1. Load config 2. Assemble context 3. Build system prompt
(base + policy + memory) 4. Run LLM 5. Validate tools 6. Execute or
dry-run 7. Log in ai_actions

------------------------------------------------------------------------

## 7. Safety & Governance

-   POS access is read-only
-   HR-first behavior enforced
-   Full auditability
-   Kill switch via admin UI
-   Dry-run default for rollout

------------------------------------------------------------------------

## 8. Implementation Phases

### Phase 1 --- AI Infrastructure

-   Add all AI tables
-   Provider abstraction
-   Tool execution framework

### Phase 2 --- Office Manager

-   Context assembly
-   HR-safe tools
-   Dry-run + admin UI

### Phase 3 --- Revenue Optimizer

-   POS ingestion
-   Historical metrics
-   Memory + policy generators

### Phase 4 --- Mentat Linkage

-   Office Manager reads memory/policies
-   HR-revenue balance tuning

### Phase 5 --- Auction Expansion

-   Auction context providers
-   Auction KPI feedback loops
