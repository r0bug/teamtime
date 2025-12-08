# Ada - Architecture Advisor

Ada is an AI-powered architecture advisor that provides architectural guidance, creates Claude Code prompts, and documents Architecture Decision Records (ADRs).

## Features

### Multi-Model Consultation System

Ada uses a tiered consultation system that selects the appropriate AI model(s) based on the complexity of the question:

#### Quick Tier
- **Use case**: Simple questions, clarifications, brief queries
- **Model**: Claude Sonnet 4
- **Cost**: Lowest

#### Standard Tier
- **Use case**: Normal architectural discussion, design questions
- **Model**: Claude Opus 4.5
- **Cost**: Medium

#### Deliberate Tier
- **Use case**: Major decisions, ADRs, schema design, implementation prompts
- **Flow**:
  1. **Primary** (Claude Opus 4.5) - Initial recommendation
  2. **Review** (GPT-4o) - Peer review and critique
  3. **Synthesis** (Claude Sonnet 4) - Unified final answer
- **Cost**: Highest (uses 3 model calls)

### Automatic Tier Detection

The system automatically detects which tier to use based on:

- **ADR Creation**: Mentions of "architecture decision", "ADR", "document decision"
- **Prompt Generation**: Requests to create implementation prompts
- **Schema Design**: Database, table, schema, or data model discussions
- **Explicit Request**: User asks for "deliberation" or "multiple perspectives"

### Tools Available to Ada

1. **create_architecture_decision** - Create and store ADRs
2. **create_claude_code_prompt** - Generate implementation prompts
3. **search_codebase** - Search the project codebase
4. **read_file** - Read specific files
5. **list_files** - List directory contents

## Architecture

```
src/lib/ai/architect/
├── index.ts           # Module exports
├── README.md          # This file
├── context.ts         # Context assembly for prompts
├── tools.ts           # Tool definitions and execution
├── config.ts          # Configuration management
├── triggers.ts        # Tier detection logic
├── multi-model.ts     # Multi-model consultation
└── chat/
    ├── index.ts       # Chat session exports
    └── session.ts     # Chat session management
```

## Database Schema

### architectConfig Table

Stores configuration for the multi-model system:

| Column | Type | Description |
|--------|------|-------------|
| quick_provider | enum | Provider for quick tier (anthropic/openai) |
| quick_model | text | Model ID for quick tier |
| standard_provider | enum | Provider for standard tier |
| standard_model | text | Model ID for standard tier |
| deliberate_primary_* | - | Primary model for deliberation |
| deliberate_review_* | - | Review model for deliberation |
| deliberate_synth_* | - | Synthesis model for deliberation |
| trigger_on_adr_creation | boolean | Trigger deliberation for ADRs |
| trigger_on_prompt_generation | boolean | Trigger for prompt creation |
| trigger_on_schema_design | boolean | Trigger for schema discussions |
| trigger_on_explicit_request | boolean | Trigger on user request |
| presentation_mode | enum | How to show results |

### architectureChats Table

Stores chat sessions with Ada, including messages and consultation metadata.

### architectureDecisions Table

Stores Architecture Decision Records created by Ada.

## API Endpoints

- `POST /api/architect/chats` - Create new chat session
- `GET /api/architect/chats/:id` - Get chat session
- `POST /api/architect/chats/:id/messages` - Send message to Ada
- `GET /api/architect/decisions` - List ADRs
- `GET /api/architect/decisions/:id` - Get specific ADR

## UI Features

The admin UI shows consultation metadata for each response:

- **Tier Badge**: Color-coded indicator (green=quick, blue=standard, purple=deliberate)
- **Model Names**: Which models contributed to the response
- **Cost**: Estimated API cost in cents
- **Expandable Details**: Full consultation metadata on click

## Configuration

Default model configuration:

| Tier | Provider | Model |
|------|----------|-------|
| Quick | Anthropic | claude-sonnet-4-20250514 |
| Standard | Anthropic | claude-opus-4-20250514 |
| Deliberate Primary | Anthropic | claude-opus-4-20250514 |
| Deliberate Review | OpenAI | gpt-4o |
| Deliberate Synthesis | Anthropic | claude-sonnet-4-20250514 |

## Usage Example

```typescript
import { sendMessage } from '$lib/ai/architect';

const result = await sendMessage(
  chatId,
  "Help me design the database schema for user notifications",
  config,
  ['schema', 'api'] // context modules
);

console.log(result.consultation.tier); // 'deliberate'
console.log(result.consultation.models); // Shows all models used
console.log(result.response); // Synthesized recommendation
```
