# Session Start Prompt

Copy and paste this into a new Claude Code session:

---

```
Read implementation-plan/00-OVERVIEW.md to see project progress.

I'm working on Phase [PHASE_NUMBER]: [PHASE_NAME].

[ADD YOUR CONTEXT HERE]
```

---s

## Quick Reference

| Phase | Name                      | Status         |
| ----- | ------------------------- | -------------- |
| 0     | Dev Environment Setup     | ✅ Complete    |
| 1     | Admin UI + Product Import | 🔄 In Progress |
| 2     | Inventory Sync            | ⬚ Not Started  |
| 3     | Order Routing             | ⬚ Not Started  |

## Example Prompts

**Continue where you left off:**

```
Read implementation-plan/00-OVERVIEW.md to see project progress.

I'm working on Phase 1: Admin UI + Product Import.

Continue with Iteration 1: Foundation.
```

**Debug a specific issue:**

```
Read implementation-plan/00-OVERVIEW.md to see project progress.

I'm working on Phase 1: Admin UI + Product Import.

The product import is failing with error X. Help me debug.
```

**Review and commit:**

```
Read implementation-plan/00-OVERVIEW.md to see project progress.

I'm working on Phase 1: Admin UI + Product Import.

Review changes and commit progress for Iteration 2.
```
