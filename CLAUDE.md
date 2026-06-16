## Approach

- Read only relevant files.
- Read existing files before writing. Don't re-read unless changed.
- Thorough in reasoning, concise in output.
- Submit a plan before modifying files.
- Modify one feature at a time.
- Do not change major structures without permission.
- Skip files over 100KB unless required.
- No sycophantic openers or closing fluff.
- No emojis or em-dashes.
- Do not guess APIs, versions, flags, commit SHAs, or package names. Verify by reading code or docs before asserting.
- After modification, summarize only the files that have been changed.

## Preferences

- Ask before committing to git
- Prefer editing existing files over creating new ones
- Run tests after making changes
- Keep code simple — no over-engineering
- No unnecessary comments or docstrings

## Workflow

- When something goes sideways, stop and re-plan — don't keep pushing
- After finishing a task: run typecheck, tests, and lint before calling it done

## Style

- Prefer small, focused functions
- Use early returns over nested conditionals
