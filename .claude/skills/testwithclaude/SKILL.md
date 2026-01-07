---
name: testwithclaude
description: Generate a comprehensive test prompt for the Claude Chrome plugin to test a specific feature
---

# Test with Claude Chrome Plugin

This skill generates a detailed testing prompt that you can copy and paste into the Claude Chrome plugin to have it thoroughly test a specific feature on the live site.

## Instructions for Claude

When this skill is invoked with a feature name or description, generate a comprehensive testing prompt following this format:

### Step 1: Understand the Feature

If the user provides a feature name, search the codebase to understand:
- What the feature does
- Where it's located in the UI
- What user interactions are involved
- What the expected behavior should be
- Any edge cases or error states

### Step 2: Generate the Test Prompt

Output a formatted prompt block that the user can copy directly. The prompt should:

1. **Set Context**: Tell the Claude Chrome plugin what it's testing
2. **Provide Navigation**: How to get to the feature
3. **List Test Cases**: Specific things to test
4. **Define Success Criteria**: What "working" looks like
5. **Request Structured Report**: How to report findings

### Prompt Template

Generate a prompt following this structure:

```
=== CLAUDE CHROME PLUGIN TEST PROMPT ===
Copy everything below this line:
---

# Feature Test: [FEATURE NAME]

You are testing the [FEATURE NAME] feature on TeamTime. Please perform a thorough test and report your findings.

## Site Context
- URL: https://team.yakimafinds.com (or current URL if already on site)
- You may need to log in if not already authenticated

## Navigation
[Specific steps to reach the feature, e.g.:]
1. Click on [menu item] in the left sidebar
2. Navigate to [specific page]
3. Look for [specific element]

## Test Cases

### Basic Functionality
- [ ] [Test case 1 - describe what to do and what should happen]
- [ ] [Test case 2]
- [ ] [Test case 3]

### User Interactions
- [ ] [Click/hover/input tests]
- [ ] [Form submission tests]
- [ ] [Navigation tests]

### Edge Cases
- [ ] [Empty state test]
- [ ] [Error handling test]
- [ ] [Boundary condition test]

### Visual/UI Checks
- [ ] [Layout check]
- [ ] [Responsive behavior]
- [ ] [Styling consistency]

## Success Criteria
- [What indicates the feature is working correctly]
- [Expected visual appearance]
- [Expected behavior after actions]

## Report Format

Please report your findings in this format:

### Test Results Summary
- **Overall Status**: [PASS/FAIL/PARTIAL]
- **Tests Passed**: X/Y
- **Critical Issues**: [Yes/No]

### Detailed Findings

#### Working Correctly:
- [List what works]

#### Issues Found:
- **Issue 1**: [Description]
  - Steps to reproduce: [Steps]
  - Expected: [What should happen]
  - Actual: [What actually happened]
  - Severity: [Critical/High/Medium/Low]

#### Screenshots/Evidence:
[Describe any visual evidence of issues]

### Recommendations
- [Suggested fixes or improvements]

---
=== END OF PROMPT ===
```

## Feature-Specific Templates

### For UI/Layout Features (like sidebar scrolling):
Focus on:
- Visual inspection at different viewport sizes
- Scroll behavior
- Element visibility
- CSS computed styles via DevTools

### For Form Features:
Focus on:
- Input validation
- Submit behavior
- Error messages
- Success feedback

### For Data Display Features:
Focus on:
- Data accuracy
- Loading states
- Empty states
- Pagination/filtering

### For Interactive Features:
Focus on:
- Click handlers
- State changes
- Animations/transitions
- Keyboard accessibility

## Usage Examples

```
/testwithclaude sidebar scrolling
```
Generates a prompt to test that the sidebar navigation scrolls when all menus are expanded.

```
/testwithclaude task creation
```
Generates a prompt to test the task creation workflow.

```
/testwithclaude user login flow
```
Generates a prompt to test the authentication process.

```
/testwithclaude "the schedule copy feature in admin"
```
Generates a prompt to test copying schedules in the admin panel.

## Output Format

Always output the prompt in a code block so the user can easily copy it. Include:
1. A brief explanation of what will be tested
2. The full prompt in a copyable format
3. Any additional context the user should know

## Example Output

When user runs `/testwithclaude sidebar scrolling`:

---

**Testing: Sidebar Navigation Scrolling**

This prompt will have the Claude Chrome plugin test whether the left sidebar properly scrolls when all admin menu sections are expanded.

```
# Feature Test: Sidebar Navigation Scrolling

You are testing the sidebar navigation scrolling feature on TeamTime.

## Navigation
1. You should see a left sidebar with navigation items
2. If you're an admin/manager, you'll see collapsible "Admin" sections

## Test Cases

### Basic Functionality
- [ ] Expand ALL admin sections by clicking each one (User Management, Operations, AI & Automation, Reports & Analytics, System Settings)
- [ ] After all sections are expanded, verify the sidebar content is taller than the viewport
- [ ] Attempt to scroll within the sidebar (mouse wheel or drag)
- [ ] Verify you can reach the bottom items (System Settings sub-items)
- [ ] Verify the user profile section at the very bottom is accessible

### Visual/UI Checks
- [ ] Check if a scrollbar appears when content overflows
- [ ] Verify the scrollbar is styled (thin, gray)
- [ ] Confirm the header "TeamTime" stays fixed at top
- [ ] Confirm the user profile stays fixed at bottom (or scrolls with content)

### DevTools Inspection
- [ ] Open DevTools (F12)
- [ ] Find the <nav> element inside the sidebar <aside>
- [ ] Check computed styles for overflow-y (should be "auto" or "scroll")
- [ ] Check if the nav has a constrained height

## Success Criteria
- Can scroll to see all menu items when sections expanded
- Scrollbar visible when content overflows
- Smooth scrolling behavior
- No content cut off or inaccessible

## Report Format
[Standard report format as above]
```

---
