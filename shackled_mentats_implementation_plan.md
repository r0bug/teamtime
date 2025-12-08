# TeamTime AI "Binary of Shackled Mentats" Implementation Plan

## For Claude Code Implementation

**Project:** TeamTime Workforce Operations System  
**Feature:** Dual AI Agent System (HR Office Manager + Revenue Optimizer)  
**Architecture:** Stateless LLM agents with database-persisted state  

---

## Executive Summary

This document provides a complete implementation plan for adding two cooperating AI agents to TeamTime:

1. **HR Office Manager (System 1)** — Fast, frequent, staff-focused
2. **Revenue Optimizer (System 2)** — Slow, analytical, business-focused

The Revenue Optimizer writes "memories" and "policy notes" that influence the Office Manager's behavior, creating a feedback loop between operational efficiency and staff wellbeing.

**Core Principle:** No agent holds state internally. All state lives in PostgreSQL. Each LLM call is fully stateless and auditable.

---

## Table of Contents

1. [Existing Codebase Analysis](#1-existing-codebase-analysis)
2. [Directory Structure](#2-directory-structure)
3. [Phase 1: Schema & Infrastructure](#3-phase-1-schema--infrastructure)
4. [Phase 2: Office Manager Agent](#4-phase-2-office-manager-agent)
5. [Phase 3: Revenue Optimizer Agent](#5-phase-3-revenue-optimizer-agent)
6. [Phase 4: Mentat Linkage](#6-phase-4-mentat-linkage)
7. [Phase 5: Admin UI](#7-phase-5-admin-ui)
8. [Phase 6: Auction Expansion](#8-phase-6-auction-expansion)
9. [Spec Additions](#9-spec-additions)
10. [Testing Strategy](#10-testing-strategy)
11. [Deployment Checklist](#11-deployment-checklist)

---

## 1. Existing Codebase Analysis

### Tech Stack
- **Framework:** SvelteKit + TypeScript
- **Database:** PostgreSQL with Drizzle ORM
- **Auth:** Lucia v3
- **Styling:** TailwindCSS
- **Deployment:** Node.js + PM2

### Relevant Existing Tables

The AI system will read from these existing tables:

| Table | AI Use |
|-------|--------|
| `users` | Staff identification, roles |
| `shifts` | Schedule data |
| `time_entries` | Clock in/out, attendance |
| `tasks` | Task assignments, completions |
| `task_completions` | Task history |
| `purchase_requests` | Approval workflow |
| `atm_withdrawals` | Expense tracking |
| `withdrawal_allocations` | Cash reconciliation |
| `messages` | Communication (has `is_system_message` flag) |
| `notifications` | Push notification delivery |
| `audit_logs` | Existing audit pattern to follow |
| `locations` | Location-aware operations |

### Existing Patterns to Follow

1. **UUIDs** for all primary keys (use `defaultRandom()`)
2. **Timestamps** with timezone (`withTimezone: true`)
3. **Enums** via `pgEnum` for constrained values
4. **Relations** defined separately from tables
5. **Type exports** at bottom of schema file

### API Route Structure
```
src/routes/api/
├── atm-withdrawals/
├── clock/
├── conversations/
├── locations/
├── notifications/
├── purchase-requests/
├── shifts/
├── tasks/
└── users/
```

---

## 2. Directory Structure

Create this structure under `src/lib/`:

```
src/lib/
├── ai/
│   ├── index.ts                      # Main exports
│   ├── types.ts                      # Shared interfaces
│   │
│   ├── config/
│   │   ├── index.ts                  # Config loader
│   │   └── defaults.ts               # Default instructions
│   │
│   ├── providers/
│   │   ├── index.ts                  # Provider abstraction
│   │   ├── anthropic.ts              # Anthropic Claude
│   │   └── openai.ts                 # OpenAI GPT
│   │
│   ├── context/
│   │   ├── types.ts                  # Context interfaces
│   │   ├── assembler.ts              # Context assembly
│   │   └── providers/
│   │       ├── index.ts              # Provider registry
│   │       ├── attendance.ts         # Time & attendance
│   │       ├── tasks.ts              # Task management
│   │       ├── purchases.ts          # Purchase approvals
│   │       ├── expenses.ts           # ATM/expenses
│   │       ├── schedule.ts           # Shift schedule
│   │       ├── memory.ts             # AI memory (read)
│   │       ├── policy.ts             # Policy notes (read)
│   │       ├── pos-metrics.ts        # POS data (Phase 3)
│   │       └── auction-metrics.ts    # Auction data (Phase 6)
│   │
│   ├── tools/
│   │   ├── types.ts                  # Tool interfaces
│   │   ├── registry.ts               # Tool registration
│   │   ├── executor.ts               # Tool execution
│   │   ├── cooldowns.ts              # Cooldown management
│   │   │
│   │   ├── office-manager/           # Office Manager tools
│   │   │   ├── send-message.ts
│   │   │   ├── create-task.ts
│   │   │   ├── send-notification.ts
│   │   │   └── flag-for-manager.ts
│   │   │
│   │   └── revenue-optimizer/        # Revenue Optimizer tools
│   │       ├── write-memory.ts
│   │       ├── update-policy.ts
│   │       └── draft-report.ts
│   │
│   ├── orchestrators/
│   │   ├── office-manager.ts         # Office Manager orchestrator
│   │   └── revenue-optimizer.ts      # Revenue Optimizer orchestrator
│   │
│   └── prompts/
│       ├── office-manager.ts         # System prompt builder
│       └── revenue-optimizer.ts      # System prompt builder
│
└── server/
    └── db/
        └── schema.ts                 # ADD AI tables here
```

Also create API routes:

```
src/routes/api/
└── ai/
    ├── config/
    │   └── +server.ts                # GET/PUT config
    ├── actions/
    │   └── +server.ts                # GET action logs
    ├── run/
    │   └── +server.ts                # POST trigger manual run
    └── test/
        └── +server.ts                # POST dry-run test
```

And admin pages:

```
src/routes/(app)/admin/
└── ai/
    ├── +page.svelte                  # Main AI dashboard
    ├── +page.server.ts
    ├── config/
    │   └── +page.svelte              # Configuration editor
    ├── logs/
    │   └── +page.svelte              # Action log viewer
    └── test/
        └── +page.svelte              # Test/dry-run interface
```

---

## 3. Phase 1: Schema & Infrastructure

### 3.1 Add AI Tables to Schema

Add to `src/lib/server/db/schema.ts`:

```typescript
// ============================================
// AI SYSTEM ENUMS
// ============================================

export const aiAgentEnum = pgEnum('ai_agent', ['office_manager', 'revenue_optimizer']);
export const aiProviderEnum = pgEnum('ai_provider', ['anthropic', 'openai']);
export const aiMemoryScopeEnum = pgEnum('ai_memory_scope', ['user', 'location', 'auction', 'global']);
export const aiPolicyScopeEnum = pgEnum('ai_policy_scope', ['global', 'location', 'role']);

// ============================================
// AI CONFIGURATION
// ============================================

export const aiConfig = pgTable('ai_config', {
    id: serial('id').primaryKey(),
    agent: aiAgentEnum('agent').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    provider: aiProviderEnum('provider').notNull().default('anthropic'),
    model: text('model').notNull().default('claude-3-haiku-20240307'),
    apiKeyEncrypted: text('api_key_encrypted'),
    instructions: text('instructions'),
    cronSchedule: text('cron_schedule').notNull().default('*/15 7-19 * * *'),
    maxTokensContext: integer('max_tokens_context').notNull().default(4000),
    temperature: decimal('temperature', { precision: 2, scale: 1 }).notNull().default('0.3'),
    dryRunMode: boolean('dry_run_mode').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
    uniqueAgent: unique().on(table.agent)
}));

// ============================================
// AI ACTIONS LOG
// ============================================

export const aiActions = pgTable('ai_actions', {
    id: uuid('id').primaryKey().defaultRandom(),
    agent: aiAgentEnum('agent').notNull(),
    runId: uuid('run_id').notNull(),
    runStartedAt: timestamp('run_started_at', { withTimezone: true }).notNull(),
    
    // Context snapshot (summary for quick queries)
    contextSnapshot: jsonb('context_snapshot').$type<{
        clockedIn?: number;
        expectedButMissing?: number;
        overdueTasks?: number;
        pendingApprovals?: number;
        unassignedWithdrawals?: number;
        activeMemories?: number;
        activePolicies?: number;
    }>(),
    contextTokens: integer('context_tokens'),
    
    // LLM interaction
    reasoning: text('reasoning'),
    toolName: text('tool_name'),
    toolParams: jsonb('tool_params').$type<Record<string, unknown>>(),
    
    // Execution
    executed: boolean('executed').notNull().default(false),
    executionResult: jsonb('execution_result').$type<Record<string, unknown>>(),
    blockedReason: text('blocked_reason'),
    error: text('error'),
    
    // Linked entities
    targetUserId: uuid('target_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdTaskId: uuid('created_task_id').references(() => tasks.id, { onDelete: 'set null' }),
    createdMessageId: uuid('created_message_id').references(() => messages.id, { onDelete: 'set null' }),
    
    // Cost tracking
    tokensUsed: integer('tokens_used'),
    costCents: integer('cost_cents'),
    
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// ============================================
// AI COOLDOWNS
// ============================================

export const aiCooldowns = pgTable('ai_cooldowns', {
    id: uuid('id').primaryKey().defaultRandom(),
    agent: aiAgentEnum('agent').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    actionType: text('action_type').notNull(),
    relatedEntityId: uuid('related_entity_id'),
    relatedEntityType: text('related_entity_type'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    reason: text('reason'),
    aiActionId: uuid('ai_action_id').references(() => aiActions.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
    // Prevent duplicate cooldowns
    uniqueCooldown: unique().on(table.agent, table.userId, table.actionType, table.relatedEntityId)
}));

// ============================================
// AI MEMORY (Written by Revenue Optimizer)
// ============================================

export const aiMemory = pgTable('ai_memory', {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: aiMemoryScopeEnum('scope').notNull(),
    
    // Scope targets (one will be set based on scope)
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'cascade' }),
    auctionId: uuid('auction_id'), // Future: references auctions table
    
    memoryType: text('memory_type').notNull(), // 'pattern', 'preference', 'observation', 'performance'
    content: text('content').notNull(),
    
    // Confidence tracking
    confidence: decimal('confidence', { precision: 3, scale: 2 }).notNull().default('0.50'),
    observationCount: integer('observation_count').notNull().default(1),
    lastObservedAt: timestamp('last_observed_at', { withTimezone: true }).notNull().defaultNow(),
    
    // Lifecycle
    isActive: boolean('is_active').notNull().default(true),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    
    // Audit
    createdByRunId: uuid('created_by_run_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// ============================================
// AI POLICY NOTES (Written by Revenue Optimizer, Read by Office Manager)
// ============================================

export const aiPolicyNotes = pgTable('ai_policy_notes', {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: aiPolicyScopeEnum('scope').notNull().default('global'),
    
    // Scope target
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'cascade' }),
    targetRole: userRoleEnum('target_role'), // If scope-specific to a role
    
    content: text('content').notNull(),
    priority: integer('priority').notNull().default(50), // 1-100, higher = more important
    
    isActive: boolean('is_active').notNull().default(true),
    
    // Audit
    updatedByRunId: uuid('updated_by_run_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// ============================================
// METRICS TABLES (For Revenue Optimizer)
// ============================================

// Staff daily metrics (populated by POS sync or calculated view)
export const staffMetricsDaily = pgTable('staff_metrics_daily', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    date: timestamp('date', { withTimezone: true }).notNull(),
    
    // Sales metrics
    totalSales: decimal('total_sales', { precision: 10, scale: 2 }).default('0'),
    transactionCount: integer('transaction_count').default(0),
    avgTransactionValue: decimal('avg_transaction_value', { precision: 10, scale: 2 }),
    itemsPerTransaction: decimal('items_per_transaction', { precision: 5, scale: 2 }),
    
    // Efficiency
    revenuePerLaborHour: decimal('revenue_per_labor_hour', { precision: 10, scale: 2 }),
    avgTransactionDuration: integer('avg_transaction_duration_seconds'),
    hoursWorked: decimal('hours_worked', { precision: 5, scale: 2 }),
    
    // Accuracy
    tillVarianceTotal: decimal('till_variance_total', { precision: 10, scale: 2 }),
    tillVarianceCount: integer('till_variance_count').default(0),
    
    // Task performance
    tasksCompleted: integer('tasks_completed').default(0),
    tasksOverdue: integer('tasks_overdue').default(0),
    
    // Quality
    refundCount: integer('refund_count').default(0),
    complaintCount: integer('complaint_count').default(0),
    
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
    uniqueUserDate: unique().on(table.userId, table.date)
}));

// Location daily metrics
export const locationMetricsDaily = pgTable('location_metrics_daily', {
    id: uuid('id').primaryKey().defaultRandom(),
    locationId: uuid('location_id').notNull().references(() => locations.id, { onDelete: 'cascade' }),
    date: timestamp('date', { withTimezone: true }).notNull(),
    
    totalSales: decimal('total_sales', { precision: 10, scale: 2 }).default('0'),
    transactionCount: integer('transaction_count').default(0),
    avgTransactionValue: decimal('avg_transaction_value', { precision: 10, scale: 2 }),
    customerCount: integer('customer_count'),
    laborHours: decimal('labor_hours', { precision: 6, scale: 2 }),
    revenuePerLaborHour: decimal('revenue_per_labor_hour', { precision: 10, scale: 2 }),
    
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
    uniqueLocationDate: unique().on(table.locationId, table.date)
}));

// ============================================
// AI TABLE RELATIONS
// ============================================

export const aiActionsRelations = relations(aiActions, ({ one }) => ({
    targetUser: one(users, {
        fields: [aiActions.targetUserId],
        references: [users.id]
    }),
    createdTask: one(tasks, {
        fields: [aiActions.createdTaskId],
        references: [tasks.id]
    }),
    createdMessage: one(messages, {
        fields: [aiActions.createdMessageId],
        references: [messages.id]
    })
}));

export const aiCooldownsRelations = relations(aiCooldowns, ({ one }) => ({
    user: one(users, {
        fields: [aiCooldowns.userId],
        references: [users.id]
    }),
    aiAction: one(aiActions, {
        fields: [aiCooldowns.aiActionId],
        references: [aiActions.id]
    })
}));

export const aiMemoryRelations = relations(aiMemory, ({ one }) => ({
    user: one(users, {
        fields: [aiMemory.userId],
        references: [users.id]
    }),
    location: one(locations, {
        fields: [aiMemory.locationId],
        references: [locations.id]
    })
}));

export const aiPolicyNotesRelations = relations(aiPolicyNotes, ({ one }) => ({
    location: one(locations, {
        fields: [aiPolicyNotes.locationId],
        references: [locations.id]
    })
}));

export const staffMetricsDailyRelations = relations(staffMetricsDaily, ({ one }) => ({
    user: one(users, {
        fields: [staffMetricsDaily.userId],
        references: [users.id]
    })
}));

export const locationMetricsDailyRelations = relations(locationMetricsDaily, ({ one }) => ({
    location: one(locations, {
        fields: [locationMetricsDaily.locationId],
        references: [locations.id]
    })
}));

// ============================================
// AI TYPE EXPORTS
// ============================================

export type AIConfig = typeof aiConfig.$inferSelect;
export type NewAIConfig = typeof aiConfig.$inferInsert;
export type AIAction = typeof aiActions.$inferSelect;
export type NewAIAction = typeof aiActions.$inferInsert;
export type AICooldown = typeof aiCooldowns.$inferSelect;
export type AIMemory = typeof aiMemory.$inferSelect;
export type NewAIMemory = typeof aiMemory.$inferInsert;
export type AIPolicyNote = typeof aiPolicyNotes.$inferSelect;
export type StaffMetricsDaily = typeof staffMetricsDaily.$inferSelect;
export type LocationMetricsDaily = typeof locationMetricsDaily.$inferSelect;
```

### 3.2 Run Migration

```bash
npm run db:push
```

Or generate migration:

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

### 3.3 Create Core Types

Create `src/lib/ai/types.ts`:

```typescript
// Agent identifiers
export type AIAgent = 'office_manager' | 'revenue_optimizer';

// LLM Providers
export type AIProvider = 'anthropic' | 'openai';

// Context provider interface
export interface AIContextProvider<T = unknown> {
    moduleId: string;
    moduleName: string;
    description: string;
    priority: number;
    agents: AIAgent[]; // Which agents use this provider
    
    isEnabled: () => Promise<boolean>;
    getContext: () => Promise<T>;
    estimateTokens: (context: T) => number;
    formatForPrompt: (context: T) => string;
}

// Assembled context
export interface AssembledContext {
    timestamp: Date;
    agent: AIAgent;
    modules: {
        moduleId: string;
        moduleName: string;
        content: string;
        tokenEstimate: number;
    }[];
    totalTokens: number;
    summary: Record<string, number>;
}

// Tool definition
export interface AITool<TParams = unknown, TResult = unknown> {
    name: string;
    description: string;
    agent: AIAgent;
    parameters: {
        type: 'object';
        properties: Record<string, unknown>;
        required: string[];
    };
    
    // Safety
    requiresApproval: boolean;
    cooldown?: {
        perUser?: number;  // minutes
        global?: number;   // minutes
    };
    rateLimit?: {
        maxPerHour: number;
    };
    
    // Execution
    validate: (params: TParams) => { valid: boolean; error?: string };
    execute: (params: TParams, context: ToolExecutionContext) => Promise<TResult>;
    formatResult: (result: TResult) => string;
}

export interface ToolExecutionContext {
    runId: string;
    agent: AIAgent;
    dryRun: boolean;
    config: {
        provider: AIProvider;
        model: string;
    };
}

// LLM Provider interface
export interface LLMProvider {
    name: AIProvider;
    
    complete: (request: LLMRequest) => Promise<LLMResponse>;
    estimateCost: (inputTokens: number, outputTokens: number, model: string) => number;
}

export interface LLMRequest {
    model: string;
    systemPrompt: string;
    userPrompt: string;
    tools?: AITool[];
    maxTokens?: number;
    temperature?: number;
}

export interface LLMResponse {
    content: string;
    toolCalls?: {
        name: string;
        params: Record<string, unknown>;
    }[];
    usage: {
        inputTokens: number;
        outputTokens: number;
    };
    finishReason: 'stop' | 'tool_use' | 'max_tokens' | 'error';
}

// Run result
export interface AIRunResult {
    runId: string;
    agent: AIAgent;
    startedAt: Date;
    completedAt: Date;
    contextTokens: number;
    actionsLogged: number;
    actionsExecuted: number;
    errors: string[];
    totalCostCents: number;
}
```

### 3.4 Create LLM Provider Abstraction

Create `src/lib/ai/providers/index.ts`:

```typescript
import type { LLMProvider, LLMRequest, LLMResponse, AIProvider } from '../types';
import { anthropicProvider } from './anthropic';
import { openaiProvider } from './openai';

const providers: Record<AIProvider, LLMProvider> = {
    anthropic: anthropicProvider,
    openai: openaiProvider,
};

export function getProvider(name: AIProvider): LLMProvider {
    const provider = providers[name];
    if (!provider) {
        throw new Error(`Unknown AI provider: ${name}`);
    }
    return provider;
}

export { anthropicProvider, openaiProvider };
```

Create `src/lib/ai/providers/anthropic.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, LLMRequest, LLMResponse, AITool } from '../types';

let client: Anthropic | null = null;

function getClient(apiKey?: string): Anthropic {
    if (!client || apiKey) {
        client = new Anthropic({
            apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
        });
    }
    return client;
}

function convertToolsToAnthropic(tools: AITool[]): Anthropic.Tool[] {
    return tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters as Anthropic.Tool.InputSchema,
    }));
}

export const anthropicProvider: LLMProvider = {
    name: 'anthropic',

    async complete(request: LLMRequest): Promise<LLMResponse> {
        const client = getClient();
        
        const messages: Anthropic.MessageParam[] = [
            { role: 'user', content: request.userPrompt }
        ];

        const params: Anthropic.MessageCreateParams = {
            model: request.model,
            max_tokens: request.maxTokens || 1024,
            system: request.systemPrompt,
            messages,
        };

        if (request.tools && request.tools.length > 0) {
            params.tools = convertToolsToAnthropic(request.tools);
        }

        if (request.temperature !== undefined) {
            params.temperature = request.temperature;
        }

        const response = await client.messages.create(params);

        // Extract content and tool calls
        let content = '';
        const toolCalls: { name: string; params: Record<string, unknown> }[] = [];

        for (const block of response.content) {
            if (block.type === 'text') {
                content += block.text;
            } else if (block.type === 'tool_use') {
                toolCalls.push({
                    name: block.name,
                    params: block.input as Record<string, unknown>,
                });
            }
        }

        return {
            content,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            usage: {
                inputTokens: response.usage.input_tokens,
                outputTokens: response.usage.output_tokens,
            },
            finishReason: response.stop_reason === 'tool_use' ? 'tool_use' : 'stop',
        };
    },

    estimateCost(inputTokens: number, outputTokens: number, model: string): number {
        // Prices per million tokens (as of late 2024)
        const pricing: Record<string, { input: number; output: number }> = {
            'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
            'claude-3-5-haiku-20241022': { input: 1.00, output: 5.00 },
            'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
            'claude-3-opus-20240229': { input: 15.00, output: 75.00 },
        };

        const price = pricing[model] || pricing['claude-3-haiku-20240307'];
        const inputCost = (inputTokens / 1_000_000) * price.input;
        const outputCost = (outputTokens / 1_000_000) * price.output;
        
        return Math.ceil((inputCost + outputCost) * 100); // Return cents
    }
};
```

Create `src/lib/ai/providers/openai.ts`:

```typescript
import OpenAI from 'openai';
import type { LLMProvider, LLMRequest, LLMResponse, AITool } from '../types';

let client: OpenAI | null = null;

function getClient(apiKey?: string): OpenAI {
    if (!client || apiKey) {
        client = new OpenAI({
            apiKey: apiKey || process.env.OPENAI_API_KEY,
        });
    }
    return client;
}

function convertToolsToOpenAI(tools: AITool[]): OpenAI.ChatCompletionTool[] {
    return tools.map(tool => ({
        type: 'function' as const,
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
        },
    }));
}

export const openaiProvider: LLMProvider = {
    name: 'openai',

    async complete(request: LLMRequest): Promise<LLMResponse> {
        const client = getClient();

        const params: OpenAI.ChatCompletionCreateParams = {
            model: request.model,
            max_tokens: request.maxTokens || 1024,
            messages: [
                { role: 'system', content: request.systemPrompt },
                { role: 'user', content: request.userPrompt },
            ],
        };

        if (request.tools && request.tools.length > 0) {
            params.tools = convertToolsToOpenAI(request.tools);
        }

        if (request.temperature !== undefined) {
            params.temperature = request.temperature;
        }

        const response = await client.chat.completions.create(params);
        const choice = response.choices[0];

        const toolCalls = choice.message.tool_calls?.map(tc => ({
            name: tc.function.name,
            params: JSON.parse(tc.function.arguments),
        }));

        return {
            content: choice.message.content || '',
            toolCalls,
            usage: {
                inputTokens: response.usage?.prompt_tokens || 0,
                outputTokens: response.usage?.completion_tokens || 0,
            },
            finishReason: choice.finish_reason === 'tool_calls' ? 'tool_use' : 'stop',
        };
    },

    estimateCost(inputTokens: number, outputTokens: number, model: string): number {
        const pricing: Record<string, { input: number; output: number }> = {
            'gpt-4o-mini': { input: 0.15, output: 0.60 },
            'gpt-4o': { input: 2.50, output: 10.00 },
            'gpt-4-turbo': { input: 10.00, output: 30.00 },
        };

        const price = pricing[model] || pricing['gpt-4o-mini'];
        const inputCost = (inputTokens / 1_000_000) * price.input;
        const outputCost = (outputTokens / 1_000_000) * price.output;
        
        return Math.ceil((inputCost + outputCost) * 100);
    }
};
```

### 3.5 Install Dependencies

```bash
npm install @anthropic-ai/sdk openai
```

### 3.6 Add Environment Variables

Update `.env.example` and `.env`:

```env
# AI Configuration
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
AI_ENCRYPTION_KEY=32-byte-hex-key-for-encrypting-api-keys
```

---

## 4. Phase 2: Office Manager Agent

### 4.1 Context Providers

Create `src/lib/ai/context/providers/attendance.ts`:

```typescript
import type { AIContextProvider } from '../types';
import { db } from '$lib/server/db';
import { users, timeEntries, shifts, locations } from '$lib/server/db/schema';
import { eq, and, gte, lte, isNull, sql } from 'drizzle-orm';

interface AttendanceContext {
    clockedIn: {
        id: string;
        name: string;
        role: string;
        clockInTime: Date;
        hoursWorked: number;
        location: string | null;
        scheduledEndTime: Date | null;
    }[];
    expectedButMissing: {
        id: string;
        name: string;
        shiftStart: Date;
        minutesLate: number;
        location: string | null;
    }[];
    recentClockOuts: {
        id: string;
        name: string;
        clockOutTime: Date;
        totalHours: number;
    }[];
}

export const attendanceProvider: AIContextProvider<AttendanceContext> = {
    moduleId: 'attendance',
    moduleName: 'Time & Attendance',
    description: 'Current clock-in status, late arrivals, recent departures',
    priority: 10,
    agents: ['office_manager'],

    async isEnabled() {
        return true;
    },

    async getContext(): Promise<AttendanceContext> {
        const now = new Date();
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

        // Currently clocked in
        const clockedInRaw = await db
            .select({
                id: users.id,
                name: users.name,
                role: users.role,
                clockInTime: timeEntries.clockIn,
                clockInAddress: timeEntries.clockInAddress,
                shiftEndTime: shifts.endTime,
            })
            .from(timeEntries)
            .innerJoin(users, eq(timeEntries.userId, users.id))
            .leftJoin(shifts, eq(timeEntries.shiftId, shifts.id))
            .where(and(
                gte(timeEntries.clockIn, todayStart),
                isNull(timeEntries.clockOut)
            ));

        const clockedIn = clockedInRaw.map(row => ({
            id: row.id,
            name: row.name,
            role: row.role,
            clockInTime: row.clockInTime,
            hoursWorked: (now.getTime() - row.clockInTime.getTime()) / 3600000,
            location: row.clockInAddress,
            scheduledEndTime: row.shiftEndTime,
        }));

        // Today's shifts to find late arrivals
        const todaysShifts = await db
            .select({
                userId: shifts.userId,
                userName: users.name,
                startTime: shifts.startTime,
                locationName: locations.name,
            })
            .from(shifts)
            .innerJoin(users, eq(shifts.userId, users.id))
            .leftJoin(locations, eq(shifts.locationId, locations.id))
            .where(and(
                gte(shifts.startTime, todayStart),
                lte(shifts.startTime, now)
            ));

        const clockedInUserIds = new Set(clockedIn.map(c => c.id));
        
        const expectedButMissing = todaysShifts
            .filter(shift => !clockedInUserIds.has(shift.userId))
            .map(shift => ({
                id: shift.userId,
                name: shift.userName,
                shiftStart: shift.startTime,
                minutesLate: Math.floor((now.getTime() - shift.startTime.getTime()) / 60000),
                location: shift.locationName,
            }));

        // Recent clock-outs
        const recentClockOutsRaw = await db
            .select({
                id: users.id,
                name: users.name,
                clockIn: timeEntries.clockIn,
                clockOut: timeEntries.clockOut,
            })
            .from(timeEntries)
            .innerJoin(users, eq(timeEntries.userId, users.id))
            .where(and(
                gte(timeEntries.clockOut, twoHoursAgo),
                lte(timeEntries.clockOut, now)
            ))
            .orderBy(sql`${timeEntries.clockOut} DESC`)
            .limit(5);

        const recentClockOuts = recentClockOutsRaw
            .filter(row => row.clockOut !== null)
            .map(row => ({
                id: row.id,
                name: row.name,
                clockOutTime: row.clockOut!,
                totalHours: (row.clockOut!.getTime() - row.clockIn.getTime()) / 3600000,
            }));

        return { clockedIn, expectedButMissing, recentClockOuts };
    },

    estimateTokens(context) {
        return (
            context.clockedIn.length * 40 +
            context.expectedButMissing.length * 35 +
            context.recentClockOuts.length * 25 +
            30
        );
    },

    formatForPrompt(context) {
        const lines: string[] = ['## Time & Attendance'];
        
        if (context.clockedIn.length === 0) {
            lines.push('No one currently clocked in.');
        } else {
            lines.push(`### Currently Working (${context.clockedIn.length}):`);
            for (const p of context.clockedIn) {
                const hours = p.hoursWorked.toFixed(1);
                const loc = p.location || 'location unknown';
                const endNote = p.scheduledEndTime 
                    ? ` (shift ends ${p.scheduledEndTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })})`
                    : '';
                lines.push(`- **${p.name}** (${p.role}): ${hours}h at ${loc}${endNote}`);
            }
        }

        if (context.expectedButMissing.length > 0) {
            lines.push('');
            lines.push('### ⚠️ Expected But Not Clocked In:');
            for (const p of context.expectedButMissing) {
                const loc = p.location ? ` at ${p.location}` : '';
                lines.push(`- **${p.name}**: ${p.minutesLate} min late (shift started ${p.shiftStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}${loc})`);
            }
        }

        if (context.recentClockOuts.length > 0) {
            lines.push('');
            lines.push('### Recent Clock-Outs:');
            for (const p of context.recentClockOuts) {
                lines.push(`- ${p.name}: left at ${p.clockOutTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} (${p.totalHours.toFixed(1)}h worked)`);
            }
        }

        return lines.join('\n');
    }
};
```

*(Continue with tasks.ts, purchases.ts, expenses.ts, memory.ts, policy.ts providers following the same pattern)*

### 4.2 Context Provider Registry

Create `src/lib/ai/context/providers/index.ts`:

```typescript
import type { AIContextProvider, AIAgent } from '../../types';
import { attendanceProvider } from './attendance';
import { tasksProvider } from './tasks';
import { purchasesProvider } from './purchases';
import { expensesProvider } from './expenses';
import { memoryProvider } from './memory';
import { policyProvider } from './policy';
// Phase 3:
// import { posMetricsProvider } from './pos-metrics';
// import { attendanceHistoryProvider } from './attendance-history';

// All registered providers
export const allProviders: AIContextProvider<unknown>[] = [
    attendanceProvider,
    tasksProvider,
    purchasesProvider,
    expensesProvider,
    memoryProvider,
    policyProvider,
];

// Get providers for a specific agent
export function getProvidersForAgent(agent: AIAgent): AIContextProvider<unknown>[] {
    return allProviders
        .filter(p => p.agents.includes(agent))
        .sort((a, b) => a.priority - b.priority);
}

export {
    attendanceProvider,
    tasksProvider,
    purchasesProvider,
    expensesProvider,
    memoryProvider,
    policyProvider,
};
```

### 4.3 Context Assembler

Create `src/lib/ai/context/assembler.ts`:

```typescript
import type { AssembledContext, AIAgent } from '../types';
import { getProvidersForAgent } from './providers';

export async function assembleContext(
    agent: AIAgent,
    maxTokens: number = 4000
): Promise<AssembledContext> {
    const now = new Date();
    const providers = getProvidersForAgent(agent);
    
    const modules: AssembledContext['modules'] = [];
    let totalTokens = 0;
    const summary: Record<string, number> = {};

    for (const provider of providers) {
        try {
            const enabled = await provider.isEnabled();
            if (!enabled) continue;

            const context = await provider.getContext();
            const formatted = provider.formatForPrompt(context);
            const tokens = provider.estimateTokens(context);

            if (totalTokens + tokens > maxTokens) {
                console.log(`[AI Context] Skipping ${provider.moduleId} - would exceed token budget`);
                continue;
            }

            modules.push({
                moduleId: provider.moduleId,
                moduleName: provider.moduleName,
                content: formatted,
                tokenEstimate: tokens,
            });

            totalTokens += tokens;

            // Extract summary counts
            if (typeof context === 'object' && context !== null) {
                const ctx = context as Record<string, unknown>;
                for (const [key, value] of Object.entries(ctx)) {
                    if (Array.isArray(value)) {
                        summary[`${provider.moduleId}_${key}`] = value.length;
                    }
                }
            }

        } catch (error) {
            console.error(`[AI Context] Error from ${provider.moduleId}:`, error);
        }
    }

    return {
        timestamp: now,
        agent,
        modules,
        totalTokens,
        summary,
    };
}

export function formatContextForLLM(assembled: AssembledContext): string {
    const lines: string[] = [
        '# Current System State',
        `Generated: ${assembled.timestamp.toLocaleString()}`,
        '',
    ];

    for (const module of assembled.modules) {
        lines.push(module.content);
        lines.push('');
    }

    return lines.join('\n');
}
```

### 4.4 Office Manager Tools

Create `src/lib/ai/tools/office-manager/send-message.ts`:

```typescript
import type { AITool, ToolExecutionContext } from '../../types';
import { db } from '$lib/server/db';
import { conversations, conversationParticipants, messages, users } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

interface SendMessageParams {
    toUserId: string;
    message: string;
}

interface SendMessageResult {
    conversationId: string;
    messageId: string;
    delivered: boolean;
}

// System user ID for AI messages (create this user in your DB)
const AI_SYSTEM_USER_ID = 'ai-office-manager-system-user'; // Replace with actual UUID

export const sendMessageTool: AITool<SendMessageParams, SendMessageResult> = {
    name: 'send_direct_message',
    description: 'Send a direct message to an employee. Use for reminders, check-ins, and coordination. Be warm but direct.',
    agent: 'office_manager',
    parameters: {
        type: 'object',
        properties: {
            toUserId: { 
                type: 'string', 
                description: 'UUID of the user to message' 
            },
            message: { 
                type: 'string', 
                description: 'Message content (max 500 characters)' 
            },
        },
        required: ['toUserId', 'message']
    },
    
    requiresApproval: false,
    cooldown: {
        perUser: 30, // Can't message same user more than once per 30 min
    },
    rateLimit: {
        maxPerHour: 20,
    },

    validate(params) {
        if (!params.toUserId || typeof params.toUserId !== 'string') {
            return { valid: false, error: 'toUserId is required and must be a string' };
        }
        if (!params.message || typeof params.message !== 'string') {
            return { valid: false, error: 'message is required and must be a string' };
        }
        if (params.message.length > 500) {
            return { valid: false, error: 'message must be 500 characters or less' };
        }
        if (params.message.length < 10) {
            return { valid: false, error: 'message is too short' };
        }
        return { valid: true };
    },

    async execute(params, context): Promise<SendMessageResult> {
        if (context.dryRun) {
            return {
                conversationId: 'dry-run-conversation-id',
                messageId: 'dry-run-message-id',
                delivered: false,
            };
        }

        // Find or create direct conversation with this user
        // First, check if conversation exists
        const existingConversation = await db.query.conversations.findFirst({
            where: eq(conversations.type, 'direct'),
            with: {
                participants: true,
            },
        });

        let conversationId: string;

        // This is simplified - in production, properly find existing 1:1 conversation
        // For now, always create new conversation
        const [newConversation] = await db.insert(conversations).values({
            type: 'direct',
            createdBy: AI_SYSTEM_USER_ID,
        }).returning();

        conversationId = newConversation.id;

        // Add participants
        await db.insert(conversationParticipants).values([
            { conversationId, userId: AI_SYSTEM_USER_ID },
            { conversationId, userId: params.toUserId },
        ]);

        // Send message
        const [newMessage] = await db.insert(messages).values({
            conversationId,
            senderId: AI_SYSTEM_USER_ID,
            content: params.message,
            isSystemMessage: true,
        }).returning();

        // TODO: Trigger push notification via existing notification system

        return {
            conversationId,
            messageId: newMessage.id,
            delivered: true,
        };
    },

    formatResult(result) {
        if (result.delivered) {
            return `Message sent (ID: ${result.messageId})`;
        }
        return `Message logged but not sent (dry-run mode)`;
    }
};
```

*(Create similar tools for create-task.ts, send-notification.ts, flag-for-manager.ts)*

### 4.5 Office Manager Orchestrator

Create `src/lib/ai/orchestrators/office-manager.ts`:

```typescript
import { v4 as uuidv4 } from 'uuid';
import type { AIRunResult, AIAgent } from '../types';
import { db } from '$lib/server/db';
import { aiConfig, aiActions, aiCooldowns } from '$lib/server/db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { getProvider } from '../providers';
import { assembleContext, formatContextForLLM } from '../context/assembler';
import { buildOfficeManagerPrompt } from '../prompts/office-manager';
import { getToolsForAgent, executeToolCall, checkCooldown } from '../tools/registry';

const AGENT: AIAgent = 'office_manager';

export async function runOfficeManagerTick(): Promise<AIRunResult> {
    const runId = uuidv4();
    const startedAt = new Date();
    const errors: string[] = [];
    let actionsLogged = 0;
    let actionsExecuted = 0;
    let totalCostCents = 0;
    let contextTokens = 0;

    try {
        // 1. Load config
        const config = await db.query.aiConfig.findFirst({
            where: eq(aiConfig.agent, AGENT),
        });

        if (!config || !config.enabled) {
            return {
                runId,
                agent: AGENT,
                startedAt,
                completedAt: new Date(),
                contextTokens: 0,
                actionsLogged: 0,
                actionsExecuted: 0,
                errors: ['Agent is disabled or not configured'],
                totalCostCents: 0,
            };
        }

        // 2. Assemble context
        const context = await assembleContext(AGENT, config.maxTokensContext);
        contextTokens = context.totalTokens;
        const contextString = formatContextForLLM(context);

        // 3. Build system prompt (includes policies and memories)
        const systemPrompt = await buildOfficeManagerPrompt(config.instructions || '');

        // 4. Get available tools
        const tools = getToolsForAgent(AGENT);

        // 5. Call LLM
        const provider = getProvider(config.provider);
        const response = await provider.complete({
            model: config.model,
            systemPrompt,
            userPrompt: contextString,
            tools,
            temperature: parseFloat(config.temperature.toString()),
            maxTokens: 1024,
        });

        const costCents = provider.estimateCost(
            response.usage.inputTokens,
            response.usage.outputTokens,
            config.model
        );
        totalCostCents += costCents;

        // 6. Process tool calls
        if (response.toolCalls && response.toolCalls.length > 0) {
            for (const toolCall of response.toolCalls) {
                actionsLogged++;

                // Check cooldown
                const cooldownCheck = await checkCooldown(AGENT, toolCall.name, toolCall.params);
                
                if (!cooldownCheck.allowed) {
                    // Log blocked action
                    await db.insert(aiActions).values({
                        agent: AGENT,
                        runId,
                        runStartedAt: startedAt,
                        contextSnapshot: context.summary,
                        contextTokens,
                        reasoning: response.content,
                        toolName: toolCall.name,
                        toolParams: toolCall.params,
                        executed: false,
                        blockedReason: cooldownCheck.reason,
                        tokensUsed: response.usage.inputTokens + response.usage.outputTokens,
                        costCents,
                    });
                    continue;
                }

                // Execute tool
                try {
                    const result = await executeToolCall(
                        toolCall.name,
                        toolCall.params,
                        {
                            runId,
                            agent: AGENT,
                            dryRun: config.dryRunMode,
                            config: {
                                provider: config.provider,
                                model: config.model,
                            },
                        }
                    );

                    if (!config.dryRunMode) {
                        actionsExecuted++;
                    }

                    // Log successful action
                    await db.insert(aiActions).values({
                        agent: AGENT,
                        runId,
                        runStartedAt: startedAt,
                        contextSnapshot: context.summary,
                        contextTokens,
                        reasoning: response.content,
                        toolName: toolCall.name,
                        toolParams: toolCall.params,
                        executed: !config.dryRunMode,
                        executionResult: result as Record<string, unknown>,
                        targetUserId: (toolCall.params as { toUserId?: string }).toUserId,
                        tokensUsed: response.usage.inputTokens + response.usage.outputTokens,
                        costCents,
                    });

                } catch (toolError) {
                    const errorMsg = toolError instanceof Error ? toolError.message : String(toolError);
                    errors.push(`Tool ${toolCall.name} failed: ${errorMsg}`);

                    await db.insert(aiActions).values({
                        agent: AGENT,
                        runId,
                        runStartedAt: startedAt,
                        contextSnapshot: context.summary,
                        contextTokens,
                        reasoning: response.content,
                        toolName: toolCall.name,
                        toolParams: toolCall.params,
                        executed: false,
                        error: errorMsg,
                        tokensUsed: response.usage.inputTokens + response.usage.outputTokens,
                        costCents,
                    });
                }
            }
        } else {
            // No tool calls - just log the observation
            await db.insert(aiActions).values({
                agent: AGENT,
                runId,
                runStartedAt: startedAt,
                contextSnapshot: context.summary,
                contextTokens,
                reasoning: response.content,
                toolName: null,
                toolParams: null,
                executed: false,
                blockedReason: 'No action needed',
                tokensUsed: response.usage.inputTokens + response.usage.outputTokens,
                costCents,
            });
        }

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(errorMsg);
        console.error('[Office Manager] Run failed:', error);
    }

    return {
        runId,
        agent: AGENT,
        startedAt,
        completedAt: new Date(),
        contextTokens,
        actionsLogged,
        actionsExecuted,
        errors,
        totalCostCents,
    };
}
```

### 4.6 System Prompt Builder

Create `src/lib/ai/prompts/office-manager.ts`:

```typescript
import { db } from '$lib/server/db';
import { aiPolicyNotes, aiMemory } from '$lib/server/db/schema';
import { eq, and, gt } from 'drizzle-orm';

const BASE_PROMPT = `You are the AI Office Manager for Yakima Finds, a consignment mall and antique business.

## Your Role
You monitor staff operations and take helpful actions to keep things running smoothly. Think "helpful parent energy" - you notice when things need attention and handle them warmly but directly.

## Personality Guidelines
- Be warm and direct, never corporate or robotic
- One reminder per issue per shift - don't nag
- Assume good intent - people forget things, they're not lazy
- Escalate to manager only after giving someone a chance to self-correct

## Operating Hours
- Only take actions between 7 AM and 7 PM local time
- Respect people's off-hours

## What You Can Do
- Send direct messages to staff (friendly check-ins, reminders)
- Create tasks for follow-up
- Send notifications
- Flag issues for manager attention

## What You Cannot Do
- Change pay or schedules
- Make firing decisions
- Approve purchases directly
- Send more than one message per person per 30 minutes
- Nag about the same issue twice in one shift

## Decision Framework
1. Is someone more than 10 minutes late? Send ONE friendly check-in
2. Is a task 1+ hours overdue? Send ONE reminder to the assignee
3. Is a task 3+ hours overdue with no response? Escalate to manager
4. Is someone clocked in 6+ hours? Suggest a break
5. Is an ATM withdrawal unassigned 3+ days? Remind the purchaser
6. Is something unusual? Flag it for manager review rather than acting`;

export async function buildOfficeManagerPrompt(customInstructions: string): Promise<string> {
    const sections: string[] = [BASE_PROMPT];

    // Add custom instructions from config
    if (customInstructions && customInstructions.trim()) {
        sections.push(`\n## Additional Instructions\n${customInstructions}`);
    }

    // Add active policies from Revenue Optimizer
    const policies = await db.query.aiPolicyNotes.findMany({
        where: eq(aiPolicyNotes.isActive, true),
        orderBy: (table, { desc }) => [desc(table.priority)],
        limit: 10,
    });

    if (policies.length > 0) {
        sections.push('\n## Active Policies');
        for (const policy of policies) {
            sections.push(`- ${policy.content}`);
        }
    }

    // Add relevant memories (global only for now)
    const memories = await db.query.aiMemory.findMany({
        where: and(
            eq(aiMemory.isActive, true),
            eq(aiMemory.scope, 'global'),
        ),
        limit: 10,
    });

    if (memories.length > 0) {
        sections.push('\n## Things to Remember');
        for (const memory of memories) {
            sections.push(`- ${memory.content}`);
        }
    }

    sections.push('\n## Response Format');
    sections.push('Analyze the current system state. If action is needed, use the appropriate tool. If no action is needed, briefly explain why.');

    return sections.join('\n');
}
```

### 4.7 Cron Job Setup

Create `src/lib/ai/cron.ts`:

```typescript
import { runOfficeManagerTick } from './orchestrators/office-manager';
// import { runRevenueOptimizerTick } from './orchestrators/revenue-optimizer';

// This can be called from a cron endpoint or PM2 cron
export async function runScheduledTasks() {
    const now = new Date();
    const hour = now.getHours();

    // Office Manager: Every 15 minutes, 7am-7pm
    if (hour >= 7 && hour < 19) {
        console.log('[AI Cron] Running Office Manager tick...');
        const result = await runOfficeManagerTick();
        console.log(`[AI Cron] Office Manager complete: ${result.actionsExecuted} actions executed`);
    }

    // Revenue Optimizer: Nightly at 11pm
    // if (hour === 23) {
    //     console.log('[AI Cron] Running Revenue Optimizer tick...');
    //     const result = await runRevenueOptimizerTick();
    //     console.log(`[AI Cron] Revenue Optimizer complete`);
    // }
}
```

Create API endpoint `src/routes/api/ai/cron/+server.ts`:

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runScheduledTasks } from '$lib/ai/cron';

// Called by external cron (e.g., crontab, PM2 cron, or cloud scheduler)
export const POST: RequestHandler = async ({ request }) => {
    // Verify cron secret
    const authHeader = request.headers.get('Authorization');
    const expectedSecret = process.env.AI_CRON_SECRET;
    
    if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        await runScheduledTasks();
        return json({ success: true, timestamp: new Date().toISOString() });
    } catch (error) {
        console.error('[AI Cron] Error:', error);
        return json({ error: 'Cron execution failed' }, { status: 500 });
    }
};
```

Add to crontab or PM2:
```bash
# Every 15 minutes
*/15 * * * * curl -X POST -H "Authorization: Bearer YOUR_SECRET" https://your-domain.com/api/ai/cron
```

---

## 5. Phase 3: Revenue Optimizer Agent

### 5.1 Revenue Optimizer Context Providers

Create providers that read historical data:

- `src/lib/ai/context/providers/pos-metrics.ts` — Staff and location sales metrics
- `src/lib/ai/context/providers/attendance-history.ts` — Historical attendance patterns
- `src/lib/ai/context/providers/task-history.ts` — Task completion patterns
- `src/lib/ai/context/providers/ai-action-summary.ts` — What Office Manager has been doing

### 5.2 Revenue Optimizer Tools

Create `src/lib/ai/tools/revenue-optimizer/write-memory.ts`:

```typescript
import type { AITool, ToolExecutionContext } from '../../types';
import { db } from '$lib/server/db';
import { aiMemory } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

interface WriteMemoryParams {
    scope: 'user' | 'location' | 'global';
    userId?: string;
    locationId?: string;
    memoryType: 'pattern' | 'preference' | 'observation' | 'performance';
    content: string;
    confidence: number;
    expiresInDays?: number;
}

interface WriteMemoryResult {
    memoryId: string;
    isUpdate: boolean;
}

export const writeMemoryTool: AITool<WriteMemoryParams, WriteMemoryResult> = {
    name: 'write_memory',
    description: 'Record an observation or pattern for future reference. These memories influence the Office Manager\'s behavior.',
    agent: 'revenue_optimizer',
    parameters: {
        type: 'object',
        properties: {
            scope: {
                type: 'string',
                enum: ['user', 'location', 'global'],
                description: 'Scope of the memory'
            },
            userId: {
                type: 'string',
                description: 'User ID if scope is "user"'
            },
            locationId: {
                type: 'string',
                description: 'Location ID if scope is "location"'
            },
            memoryType: {
                type: 'string',
                enum: ['pattern', 'preference', 'observation', 'performance'],
                description: 'Type of memory'
            },
            content: {
                type: 'string',
                description: 'The memory content (max 500 chars)'
            },
            confidence: {
                type: 'number',
                minimum: 0,
                maximum: 1,
                description: 'Confidence level (0.0 to 1.0)'
            },
            expiresInDays: {
                type: 'number',
                description: 'Optional: days until this memory expires'
            }
        },
        required: ['scope', 'memoryType', 'content', 'confidence']
    },

    requiresApproval: false,
    rateLimit: {
        maxPerHour: 50,
    },

    validate(params) {
        if (params.scope === 'user' && !params.userId) {
            return { valid: false, error: 'userId required for user-scoped memory' };
        }
        if (params.scope === 'location' && !params.locationId) {
            return { valid: false, error: 'locationId required for location-scoped memory' };
        }
        if (params.content.length > 500) {
            return { valid: false, error: 'content must be 500 characters or less' };
        }
        if (params.confidence < 0 || params.confidence > 1) {
            return { valid: false, error: 'confidence must be between 0 and 1' };
        }
        return { valid: true };
    },

    async execute(params, context): Promise<WriteMemoryResult> {
        if (context.dryRun) {
            return { memoryId: 'dry-run-memory-id', isUpdate: false };
        }

        // Check for existing similar memory to update
        const existingMemory = await db.query.aiMemory.findFirst({
            where: and(
                eq(aiMemory.scope, params.scope),
                eq(aiMemory.memoryType, params.memoryType),
                params.userId ? eq(aiMemory.userId, params.userId) : undefined,
                params.locationId ? eq(aiMemory.locationId, params.locationId) : undefined,
            ),
        });

        const expiresAt = params.expiresInDays
            ? new Date(Date.now() + params.expiresInDays * 24 * 60 * 60 * 1000)
            : null;

        if (existingMemory) {
            // Update existing memory
            await db.update(aiMemory)
                .set({
                    content: params.content,
                    confidence: params.confidence.toString(),
                    observationCount: existingMemory.observationCount + 1,
                    lastObservedAt: new Date(),
                    expiresAt,
                    updatedAt: new Date(),
                    createdByRunId: context.runId,
                })
                .where(eq(aiMemory.id, existingMemory.id));

            return { memoryId: existingMemory.id, isUpdate: true };
        }

        // Create new memory
        const [newMemory] = await db.insert(aiMemory).values({
            scope: params.scope,
            userId: params.userId,
            locationId: params.locationId,
            memoryType: params.memoryType,
            content: params.content,
            confidence: params.confidence.toString(),
            expiresAt,
            createdByRunId: context.runId,
        }).returning();

        return { memoryId: newMemory.id, isUpdate: false };
    },

    formatResult(result) {
        return result.isUpdate
            ? `Memory updated (ID: ${result.memoryId})`
            : `Memory created (ID: ${result.memoryId})`;
    }
};
```

*(Create similar tools for update-policy.ts, draft-report.ts)*

### 5.3 Revenue Optimizer Orchestrator

Create `src/lib/ai/orchestrators/revenue-optimizer.ts` following the same pattern as office-manager.ts but with:
- Different context providers (metrics-focused)
- Different tools (memory/policy writing)
- Different prompt (analytical, long-term focused)

---

## 6. Phase 4: Mentat Linkage

### 6.1 Memory Provider for Office Manager

Update `src/lib/ai/context/providers/memory.ts` to read memories written by Revenue Optimizer and include them in Office Manager context.

### 6.2 Policy Provider

Update `src/lib/ai/context/providers/policy.ts` to read active policy notes and inject them into Office Manager's system prompt.

### 6.3 Feedback Loop Testing

Create test scenarios:
1. Revenue Optimizer notices "Jake is often late on Fridays" → writes memory
2. Office Manager reads this memory → adjusts check-in timing
3. Revenue Optimizer notices improvement → updates confidence score

---

## 7. Phase 5: Admin UI

### 7.1 AI Dashboard Page

Create `src/routes/(app)/admin/ai/+page.svelte`:

```svelte
<script lang="ts">
    import type { PageData } from './$types';
    
    export let data: PageData;
</script>

<div class="container mx-auto p-4">
    <h1 class="text-2xl font-bold mb-6">AI Office Manager</h1>

    <!-- Status Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <!-- Office Manager Status -->
        <div class="card bg-base-200 p-4">
            <h2 class="font-semibold">Office Manager</h2>
            <div class="flex items-center gap-2 mt-2">
                <div class="badge {data.officeManager.enabled ? 'badge-success' : 'badge-error'}">
                    {data.officeManager.enabled ? 'Enabled' : 'Disabled'}
                </div>
                {#if data.officeManager.dryRunMode}
                    <div class="badge badge-warning">Dry Run</div>
                {/if}
            </div>
            <p class="text-sm mt-2">
                Last run: {data.officeManager.lastRun || 'Never'}
            </p>
            <p class="text-sm">
                Actions today: {data.officeManager.actionsToday}
            </p>
        </div>

        <!-- Revenue Optimizer Status -->
        <div class="card bg-base-200 p-4">
            <h2 class="font-semibold">Revenue Optimizer</h2>
            <div class="flex items-center gap-2 mt-2">
                <div class="badge {data.revenueOptimizer.enabled ? 'badge-success' : 'badge-error'}">
                    {data.revenueOptimizer.enabled ? 'Enabled' : 'Disabled'}
                </div>
            </div>
            <p class="text-sm mt-2">
                Last run: {data.revenueOptimizer.lastRun || 'Never'}
            </p>
            <p class="text-sm">
                Active memories: {data.revenueOptimizer.activeMemories}
            </p>
        </div>
    </div>

    <!-- Quick Actions -->
    <div class="flex gap-2 mb-6">
        <a href="/admin/ai/config" class="btn btn-primary">Configure</a>
        <a href="/admin/ai/logs" class="btn btn-secondary">View Logs</a>
        <a href="/admin/ai/test" class="btn btn-outline">Test Run</a>
    </div>

    <!-- Recent Actions -->
    <div class="card bg-base-100 shadow">
        <div class="card-body">
            <h2 class="card-title">Recent Actions</h2>
            <div class="overflow-x-auto">
                <table class="table table-zebra">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Agent</th>
                            <th>Action</th>
                            <th>Target</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each data.recentActions as action}
                            <tr>
                                <td>{new Date(action.createdAt).toLocaleString()}</td>
                                <td>{action.agent}</td>
                                <td>{action.toolName || 'Observation'}</td>
                                <td>{action.targetUser?.name || '-'}</td>
                                <td>
                                    {#if action.executed}
                                        <span class="badge badge-success">Executed</span>
                                    {:else if action.blockedReason}
                                        <span class="badge badge-warning" title={action.blockedReason}>Blocked</span>
                                    {:else if action.error}
                                        <span class="badge badge-error" title={action.error}>Error</span>
                                    {:else}
                                        <span class="badge">Logged</span>
                                    {/if}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>
```

---

## 8. Phase 6: Auction Expansion

### 8.1 Auction Metrics Table

Add when auction module is ready:

```typescript
export const auctionMetrics = pgTable('auction_metrics', {
    id: uuid('id').primaryKey().defaultRandom(),
    auctionId: uuid('auction_id').notNull(),
    date: timestamp('date', { withTimezone: true }).notNull(),
    
    lotsListed: integer('lots_listed').default(0),
    lotsSold: integer('lots_sold').default(0),
    sellThroughPercent: decimal('sell_through_percent', { precision: 5, scale: 2 }),
    avgFinalPrice: decimal('avg_final_price', { precision: 10, scale: 2 }),
    
    noPayRate: decimal('no_pay_rate', { precision: 5, scale: 4 }),
    avgPhotosPerLot: decimal('avg_photos_per_lot', { precision: 4, scale: 2 }),
    
    // Timing metrics (in minutes)
    avgCreationToBidMinutes: integer('avg_creation_to_bid_minutes'),
    avgBidToHammerMinutes: integer('avg_bid_to_hammer_minutes'),
    avgHammerToPaymentMinutes: integer('avg_hammer_to_payment_minutes'),
    avgPaymentToShipmentMinutes: integer('avg_payment_to_shipment_minutes'),
    
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});
```

### 8.2 Auction Context Providers

Create providers for:
- `auction-ops.ts` — Current auction operations (for Office Manager)
- `auction-metrics.ts` — Historical auction metrics (for Revenue Optimizer)

---

## 9. Spec Additions

Add this section to `Spec.md`:

```markdown
---

## 21. AI Agent System

### 21.1 Overview

TeamTime includes two cooperating AI agents:

1. **HR Office Manager (System 1)** — Frequent, staff-focused
2. **Revenue Optimizer (System 2)** — Nightly, analytics-focused

The Revenue Optimizer writes memories and policies that influence Office Manager behavior.

### 21.2 Context Provider Standard

Every module exposing operational data MUST implement an AI Context Provider.

#### Interface

```typescript
interface AIContextProvider<T> {
    moduleId: string;
    moduleName: string;
    description: string;
    priority: number;          // 1-100, lower = higher priority
    agents: AIAgent[];         // Which agents use this
    
    isEnabled(): Promise<boolean>;
    getContext(): Promise<T>;
    estimateTokens(context: T): number;
    formatForPrompt(context: T): string;
}
```

#### Priority Bands

| Range | Category | Examples |
|-------|----------|----------|
| 1-20 | Critical state | Attendance, Schedule |
| 21-40 | Pending actions | Tasks, Approvals |
| 41-60 | Communication | Messages |
| 61-80 | Analytics | Metrics, History |
| 81-100 | Enrichment | Policies, Memories |

### 21.3 Tool Standard

AI tools follow a strict interface with validation, cooldowns, and rate limits.

### 21.4 Safety Controls

- **Dry-run mode** (default): Log actions without executing
- **Cooldowns**: Prevent repeated actions on same entity
- **Rate limits**: Max actions per hour per tool
- **Approval workflow**: Some actions require manager confirmation
- **Kill switch**: Admin can disable agents instantly

### 21.5 New Module Checklist

When adding a module:

- [ ] Create context provider in `src/lib/ai/context/providers/`
- [ ] Register in provider index with appropriate agents
- [ ] Set priority based on data criticality
- [ ] Add tools if module has AI-actionable operations
- [ ] Document exposed data in this spec section
```

---

## 10. Testing Strategy

### 10.1 Unit Tests

- Test each context provider in isolation
- Test tool validation
- Test prompt building

### 10.2 Integration Tests

- Test full orchestrator run with mocked LLM
- Test tool execution with test database

### 10.3 Manual Testing

1. Enable dry-run mode
2. Trigger manual runs via admin UI
3. Review logged actions
4. Verify reasoning is appropriate
5. Gradually enable live execution

---

## 11. Deployment Checklist

### Pre-Deployment

- [ ] Run database migration
- [ ] Set environment variables (API keys, cron secret)
- [ ] Install npm dependencies
- [ ] Create AI system user in database

### Initial Rollout

- [ ] Enable Office Manager in dry-run mode
- [ ] Run for 1 week, review logs
- [ ] Tune instructions based on logged reasoning
- [ ] Enable live execution for low-risk tools first

### Full Deployment

- [ ] Enable all Office Manager tools
- [ ] Enable Revenue Optimizer (dry-run)
- [ ] Tune memory/policy generation
- [ ] Enable full Mentat linkage

### Monitoring

- [ ] Set up alerts for AI errors
- [ ] Monitor cost tracking
- [ ] Review weekly action summaries
- [ ] Adjust cooldowns/rate limits as needed

---

## Appendix A: File Checklist

```
Phase 1:
[ ] src/lib/server/db/schema.ts (AI tables)
[ ] src/lib/ai/types.ts
[ ] src/lib/ai/providers/index.ts
[ ] src/lib/ai/providers/anthropic.ts
[ ] src/lib/ai/providers/openai.ts

Phase 2:
[ ] src/lib/ai/context/types.ts
[ ] src/lib/ai/context/assembler.ts
[ ] src/lib/ai/context/providers/index.ts
[ ] src/lib/ai/context/providers/attendance.ts
[ ] src/lib/ai/context/providers/tasks.ts
[ ] src/lib/ai/context/providers/purchases.ts
[ ] src/lib/ai/context/providers/expenses.ts
[ ] src/lib/ai/context/providers/memory.ts
[ ] src/lib/ai/context/providers/policy.ts
[ ] src/lib/ai/tools/types.ts
[ ] src/lib/ai/tools/registry.ts
[ ] src/lib/ai/tools/executor.ts
[ ] src/lib/ai/tools/cooldowns.ts
[ ] src/lib/ai/tools/office-manager/send-message.ts
[ ] src/lib/ai/tools/office-manager/create-task.ts
[ ] src/lib/ai/tools/office-manager/send-notification.ts
[ ] src/lib/ai/tools/office-manager/flag-for-manager.ts
[ ] src/lib/ai/prompts/office-manager.ts
[ ] src/lib/ai/orchestrators/office-manager.ts
[ ] src/lib/ai/cron.ts
[ ] src/routes/api/ai/cron/+server.ts

Phase 3:
[ ] src/lib/ai/context/providers/pos-metrics.ts
[ ] src/lib/ai/context/providers/attendance-history.ts
[ ] src/lib/ai/tools/revenue-optimizer/write-memory.ts
[ ] src/lib/ai/tools/revenue-optimizer/update-policy.ts
[ ] src/lib/ai/tools/revenue-optimizer/draft-report.ts
[ ] src/lib/ai/prompts/revenue-optimizer.ts
[ ] src/lib/ai/orchestrators/revenue-optimizer.ts

Phase 5:
[ ] src/routes/(app)/admin/ai/+page.svelte
[ ] src/routes/(app)/admin/ai/+page.server.ts
[ ] src/routes/(app)/admin/ai/config/+page.svelte
[ ] src/routes/(app)/admin/ai/logs/+page.svelte
[ ] src/routes/(app)/admin/ai/test/+page.svelte
[ ] src/routes/api/ai/config/+server.ts
[ ] src/routes/api/ai/actions/+server.ts
[ ] src/routes/api/ai/run/+server.ts
[ ] src/routes/api/ai/test/+server.ts
```

---

*End of Implementation Plan*
