# Task: Implement Ada - The Architecture Advisor Mentat

## Context

TeamTime already has two AI agents ("Shackled Mentats"):
- **Office Manager** - Automated, runs on cron, handles staff operations
- **Revenue Optimizer** - Automated, runs nightly, handles business analysis

We need to add a third agent: **Ada (Architecture Development Advisor)**

Ada is different from the other two:
- She is **interactive**, not automated (no cron)
- She **never modifies files directly**
- She produces **Claude Code prompts** for implementation
- She creates **Architecture Decision Records (ADRs)**
- She has access to read Spec.md, schema.ts, and codebase structure

## Existing AI Infrastructure

The AI system is already implemented at `src/lib/ai/` with:
- `types.ts` - Core interfaces (AIAgent, AITool, AIContextProvider, etc.)
- `providers/` - Anthropic and OpenAI adapters
- `orchestrators/` - Office Manager and Revenue Optimizer
- `tools/` - Tool implementations per agent
- `context/` - Context providers
- `prompts/` - System prompt builders

Schema tables exist in `src/lib/server/db/schema.ts`:
- `aiConfig` - Agent configuration
- `aiActions` - Action audit log  
- `aiCooldowns` - Rate limiting
- `aiMemory` - Long-term observations
- `aiPolicyNotes` - Behavior modifiers

The `aiAgentEnum` currently has: `'office_manager' | 'revenue_optimizer'`

## Requirements

### 1. Schema Additions

Add to `src/lib/server/db/schema.ts`:

**Update the agent enum:**
```typescript
export const aiAgentEnum = pgEnum('ai_agent', [
    'office_manager', 
    'revenue_optimizer', 
    'architect'
]);
```

**Add architecture status enum:**
```typescript
export const architectureStatusEnum = pgEnum('architecture_status', [
    'proposed',
    'approved', 
    'in_progress',
    'implemented',
    'rejected',
    'superseded'
]);
```

**Add `architectureDecisions` table:**
```typescript
export const architectureDecisions = pgTable('architecture_decisions', {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    status: architectureStatusEnum('status').notNull().default('proposed'),
    category: text('category').notNull(), // 'schema', 'api', 'ui', 'integration', 'security', 'architecture'
    
    context: text('context').notNull(),
    decision: text('decision').notNull(),
    consequences: text('consequences'),
    
    claudeCodePrompt: text('claude_code_prompt'),
    implementationPlan: jsonb('implementation_plan').$type<{
        phases: { name: string; tasks: string[]; dependencies?: string[] }[];
    }>(),
    
    relatedFiles: jsonb('related_files').$type<string[]>(),
    implementedAt: timestamp('implemented_at', { withTimezone: true }),
    
    createdByAiRunId: uuid('created_by_ai_run_id'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});
```

**Add `architectureChats` table:**
```typescript
export const architectureChats = pgTable('architecture_chats', {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title'),
    
    messages: jsonb('messages').$type<{
        role: 'user' | 'assistant';
        content: string;
        timestamp: string;
        toolCalls?: { name: string; params: unknown; result?: unknown }[];
    }[]>().notNull().default([]),
    
    contextModules: jsonb('context_modules').$type<string[]>(),
    tokensUsed: integer('tokens_used').default(0),
    costCents: integer('cost_cents').default(0),
    decisionsCreated: jsonb('decisions_created').$type<string[]>().default([]),
    promptsGenerated: integer('prompts_generated').default(0),
    
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});
```

**Add relations for new tables.**

**Add type exports:**
```typescript
export type ArchitectureDecision = typeof architectureDecisions.$inferSelect;
export type ArchitectureChat = typeof architectureChats.$inferSelect;
```

### 2. Update Types

In `src/lib/ai/types.ts`, update:
```typescript
export type AIAgent = 'office_manager' | 'revenue_optimizer' | 'architect';
```

### 3. Create Architect Module

Create directory structure:
```
src/lib/ai/architect/
├── index.ts
├── chat.ts
├── system-prompt.ts
├── context/
│   ├── index.ts
│   ├── spec.ts
│   ├── schema.ts
│   ├── codebase.ts
│   └── mentats.ts
└── tools/
    ├── index.ts
    ├── create-claude-prompt.ts
    ├── create-decision.ts
    └── analyze-impact.ts
```

### 4. Implement Context Providers

**`src/lib/ai/architect/context/spec.ts`**
- Reads `Spec.md` from project root
- Extracts section headers
- Formats full content for prompt

**`src/lib/ai/architect/context/schema.ts`**
- Reads `src/lib/server/db/schema.ts`
- Extracts table names and enum names
- Formats for prompt with summary

**`src/lib/ai/architect/context/codebase.ts`**
- Uses `find` command to list TypeScript/Svelte files
- Extracts API routes from `src/routes/api/`
- Extracts pages from `src/routes/`
- Lists lib modules

**`src/lib/ai/architect/context/mentats.ts`**
- Queries `aiConfig` for current agent statuses
- Queries recent `aiActions` count per agent
- Summarizes AI system state

**`src/lib/ai/architect/context/index.ts`**
- Exports all providers
- Provides `assembleArchitectContext(moduleIds: string[])` function

### 5. Implement Tools

**`src/lib/ai/architect/tools/create-claude-prompt.ts`**

Tool name: `create_claude_code_prompt`

Parameters:
- `title: string` - Brief task title
- `context: string` - Background info for Claude Code
- `requirements: string[]` - List of requirements
- `filesToModify: string[]` - File paths to create/modify
- `implementationNotes?: string` - Technical guidance
- `testingGuidance?: string` - How to verify

Output: Formatted markdown prompt + optionally saves to `architectureDecisions`

**`src/lib/ai/architect/tools/create-decision.ts`**

Tool name: `create_architecture_decision`

Parameters:
- `title: string`
- `category: 'schema' | 'api' | 'ui' | 'integration' | 'security' | 'architecture'`
- `context: string` - Why is this needed?
- `decision: string` - What are we doing?
- `consequences?: string` - Tradeoffs
- `implementationPhases?: { name: string; tasks: string[]; dependencies?: string[] }[]`

Output: Saves to `architectureDecisions` table, returns ID

**`src/lib/ai/architect/tools/analyze-impact.ts`**

Tool name: `analyze_change_impact`

Parameters:
- `description: string` - What change is being considered
- `affectedAreas: string[]` - Which parts of system

Output: Analysis of what tables, routes, and components would be affected

**`src/lib/ai/architect/tools/index.ts`**
- Exports all tools
- Provides `getArchitectTools()` and `executeToolCall()` functions

### 6. Implement System Prompt

**`src/lib/ai/architect/system-prompt.ts`**

Create `ARCHITECT_BASE_PROMPT` constant with:
- Ada's role and personality
- Her constraints (never modifies files, produces prompts)
- TeamTime architecture overview (tech stack, modules, patterns)
- The Mentats system overview
- Output format guidelines for Claude Code prompts
- Output format for ADRs

Create `buildArchitectPrompt(context: AssembledContext)` function that:
- Starts with base prompt
- Appends assembled context (spec, schema, codebase, mentats)
- Returns complete system prompt

### 7. Implement Chat Session Management

**`src/lib/ai/architect/chat.ts`**

Functions:
- `startArchitectChat(userId: string, contextModules?: string[]): Promise<ChatSession>`
- `sendArchitectMessage(chatId: string, message: string, config: {...}): Promise<ChatMessage>`
- `getChatHistory(chatId: string): Promise<ChatMessage[]>`

The `sendArchitectMessage` function should:
1. Load existing chat from DB
2. Add user message to history
3. Assemble context from selected modules
4. Build system prompt
5. Call LLM with conversation history and tools
6. Process any tool calls
7. Add assistant message to history
8. Update chat record with new messages, token usage, cost
9. Log to `aiActions` table
10. Return assistant message

### 8. Create API Routes

**`src/routes/api/ai/architect/chat/+server.ts`**

POST handler with actions:
- `start` - Create new chat session, return chatId
- `message` - Send message to existing chat, return response
- `history` - Get chat history

Require admin or manager role.

**`src/routes/api/ai/architect/decisions/+server.ts`**

- GET - List architecture decisions (with filters for status, category)
- GET with id - Get single decision
- PATCH - Update decision status (approve, reject, mark implemented)

### 9. Create Admin UI

**`src/routes/(app)/admin/ai/architect/+page.svelte`**

Chat interface with:
- Start new session button
- Message history display (scrollable)
- Input field with send button
- Loading state indicator
- When a Claude Code prompt is generated, show modal with copy button
- Display tool usage badges on messages

**`src/routes/(app)/admin/ai/architect/+page.server.ts`**

Load:
- Recent architecture decisions
- Current chat session (if any)
- AI config for architect agent

**`src/routes/(app)/admin/ai/architect/decisions/+page.svelte`**

List view of all architecture decisions with:
- Filter by status
- Filter by category
- Click to view full decision
- Approve/Reject buttons for proposed decisions
- Copy prompt button if `claudeCodePrompt` exists

### 10. Add Navigation

Update admin navigation to include link to `/admin/ai/architect`

## Files to Create

```
src/lib/server/db/schema.ts (MODIFY - add tables and enums)
src/lib/ai/types.ts (MODIFY - add 'architect' to AIAgent)
src/lib/ai/architect/index.ts
src/lib/ai/architect/chat.ts
src/lib/ai/architect/system-prompt.ts
src/lib/ai/architect/context/index.ts
src/lib/ai/architect/context/spec.ts
src/lib/ai/architect/context/schema.ts
src/lib/ai/architect/context/codebase.ts
src/lib/ai/architect/context/mentats.ts
src/lib/ai/architect/tools/index.ts
src/lib/ai/architect/tools/create-claude-prompt.ts
src/lib/ai/architect/tools/create-decision.ts
src/lib/ai/architect/tools/analyze-impact.ts
src/routes/api/ai/architect/chat/+server.ts
src/routes/api/ai/architect/decisions/+server.ts
src/routes/(app)/admin/ai/architect/+page.svelte
src/routes/(app)/admin/ai/architect/+page.server.ts
src/routes/(app)/admin/ai/architect/decisions/+page.svelte
src/routes/(app)/admin/ai/architect/decisions/+page.server.ts
```

## Implementation Notes

### Context Provider Pattern
Follow the existing pattern in `src/lib/ai/context/providers/`. Each provider implements `AIContextProvider<T>` with:
- `moduleId`, `moduleName`, `description`, `priority`
- `agents: ['architect']`
- `isEnabled()`, `getContext()`, `estimateTokens()`, `formatForPrompt()`

### Tool Pattern
Follow existing pattern in `src/lib/ai/tools/`. Each tool implements `AITool<TParams, TResult>` with:
- `name`, `description`, `agent: 'architect'`
- `parameters` (JSON schema)
- `requiresApproval: false`
- `rateLimit: { maxPerHour: number }`
- `validate()`, `execute()`, `formatResult()`

### File System Access
For reading Spec.md and schema.ts, use Node.js `fs/promises`:
```typescript
import fs from 'fs/promises';
import path from 'path';

const specPath = path.join(process.cwd(), 'Spec.md');
const content = await fs.readFile(specPath, 'utf-8');
```

### Codebase Structure
For getting file lists, use child_process:
```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

const { stdout } = await execAsync('find src -name "*.ts" | head -100');
```

### Error Handling
Wrap all file system and exec operations in try/catch. If files don't exist, return empty/default context rather than throwing.

### Role Protection
API routes should check that user has 'admin' or 'manager' role before allowing access to architect features.

## Testing

After implementation:

1. Run database migration: `npm run db:push`

2. Test context providers:
   - Verify Spec.md loads correctly
   - Verify schema.ts parses tables/enums
   - Verify codebase structure returns file lists

3. Test chat flow:
   - Start new chat session
   - Send a message like "What tables exist in the database?"
   - Verify response includes schema information

4. Test tool execution:
   - Ask Ada to create a Claude Code prompt for a simple feature
   - Verify prompt is generated and can be copied
   - Check that decision record was created in DB

5. Test admin UI:
   - Navigate to /admin/ai/architect
   - Verify chat interface works
   - Test decisions list page

## Example Interactions

Once implemented, Ada should handle conversations like:

**User:** "I want to add an inventory tracking module to TeamTime"

**Ada:** *Analyzes current schema and spec, then:*
- Asks clarifying questions about requirements
- Proposes schema additions (inventory items, stock levels, etc.)
- Creates an ADR documenting the decision
- Generates a Claude Code prompt for Phase 1 implementation

**User:** "Generate a prompt to add the inventory tables"

**Ada:** *Uses `create_claude_code_prompt` tool to output:*
```markdown
# Task: Add Inventory Module Schema

## Context
TeamTime needs inventory tracking for the consignment mall...

## Requirements
1. Create `inventoryItems` table with...
2. Create `stockMovements` table with...
...

## Files to Modify/Create
- `src/lib/server/db/schema.ts`
...
```

This prompt can then be copied and given to Claude Code for implementation.
