---
name: push2git
description: Examine codebase, update all documentation and spec files, then commit and push to GitHub
---

# Push to Git with Documentation Update

This skill performs a complete documentation audit and git workflow:
1. Examines the codebase for recent changes
2. Updates all documentation files (README.md, FEATURES.md, Schema.md, Spec.md)
3. Runs security validation
4. Commits with a descriptive message
5. Pushes to GitHub

## Instructions for Claude

When this skill is invoked, follow these steps IN ORDER:

### Step 1: Analyze Recent Changes

First, gather context about what has changed:

```bash
git status
git diff --stat HEAD~5 HEAD 2>/dev/null || git diff --stat
git log --oneline -10
```

Identify:
- New files added
- Modified files
- New features implemented
- Database schema changes
- API endpoint changes
- UI/component changes

### Step 2: Read Current Documentation

Read these documentation files to understand their current state:
- `README.md` - Project overview, features list, tech stack, table counts
- `FEATURES.md` - Detailed feature documentation
- `Schema.md` - Database schema documentation
- `Spec.md` (if exists) - Functional specification

### Step 3: Identify Documentation Gaps

Compare the codebase changes against the documentation:
- Are new features documented in README.md and FEATURES.md?
- Are new database tables documented in Schema.md?
- Is the table count in README.md accurate?
- Are new API endpoints documented?
- Are new components/pages mentioned?

### Step 4: Update Documentation Files

For each documentation file that needs updates:

**README.md Updates:**
- Update feature descriptions in the appropriate section
- Update table count if new tables were added
- Update any tech stack changes
- Keep the existing structure and style

**FEATURES.md Updates:**
- Add new feature sections with full documentation
- Follow the existing formatting pattern
- Include usage examples where applicable

**Schema.md Updates:**
- Add new table schemas
- Document new columns
- Include example SQL if relevant

**Spec.md Updates (if exists):**
- Update functional specifications
- Document new workflows

### Step 5: Run Security Check

Before committing, run the security validation:

```bash
./PRE_COMMIT_SECURITY_CHECK.sh 2>/dev/null || echo "Security check script not found, proceeding with caution"
```

NEVER commit if the security check fails. Alert the user and stop.

### Step 6: Stage and Review Changes

```bash
git status
git diff --stat
```

Show the user what will be committed.

### Step 7: Create Commit

Create a descriptive commit message following this format:

```
docs: Update documentation for [feature/change summary]

- Updated README.md with [changes]
- Updated FEATURES.md with [changes]
- Updated Schema.md with [changes]
- [Other changes]

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

Execute:
```bash
git add -A
git commit -m "$(cat <<'EOF'
docs: Update documentation for [summary]

[bullet points of changes]

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

### Step 8: Push to GitHub

```bash
git push origin $(git rev-parse --abbrev-ref HEAD)
```

Report success with the commit hash and any relevant URLs.

## Usage Examples

```
/push2git
```
Examines codebase, updates all docs, commits, and pushes.

```
/push2git "Added shoutouts feature"
```
Same as above, but uses the provided message context for commit.

## Key Files to Check

When examining the codebase, pay special attention to:

| File Pattern | Documentation Target |
|--------------|---------------------|
| `src/lib/server/db/schema.ts` | Schema.md, README.md (table count) |
| `src/routes/api/**` | FEATURES.md, Spec.md |
| `src/lib/components/*.svelte` | FEATURES.md |
| `src/lib/ai/tools/**` | FEATURES.md (AI section) |
| `src/routes/(app)/**` | FEATURES.md, README.md |

## Table Count Update

Count tables in schema.ts:
```bash
grep -c "pgTable\|export const.*Table" src/lib/server/db/schema.ts 2>/dev/null || echo "0"
```

Update the table count in README.md if it differs.

## Safety Rules

1. NEVER commit secrets, API keys, or credentials
2. ALWAYS run security check first
3. NEVER force push to main/master
4. ALWAYS show user what will be committed before committing
5. If uncertain about changes, ASK the user before proceeding

## Error Handling

If any step fails:
1. Report the error clearly
2. Do NOT proceed with subsequent steps
3. Suggest how to fix the issue
4. Offer to retry after the user resolves the problem
