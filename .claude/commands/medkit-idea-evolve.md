---
description: Propose one sharpening tweak to docs/evolution.md based on recent work. Draft-only — waits for approval before writing.
---

# `/medkit-idea-evolve`

Keep-Thinking-prize loop. Designed for `/loop 30m /medkit-idea-evolve` over
a work session so the evolution log reflects actual thinking, not just
the first shower-thought.

## What to do

1. Read `docs/evolution.md` — note the last entry date and content.
2. Read the most recent 3 commits: `git log -3 --stat`.
3. Skim open work: `git status`, `git diff --stat`.
4. Consider whether the recent work changes how the submission
   should be pitched or what the demo should emphasize.
5. Draft ONE new entry using the template at the bottom of
   `docs/evolution.md`:
   ```
   ## YYYY-MM-DD — <one-line change>

   **What changed.**

   **Why.**

   **What it replaces.**
   ```
6. Print the draft in chat. Do NOT write it to the file yet. Wait for
   the user to confirm (a simple "yes" / "looks good" / "ship it").
7. Only after approval, append the entry to `docs/evolution.md` just
   above the `## Template for new entries` section.

## Skip the firing if nothing meaningful changed

If the last entry is from today AND no new commits exist since then AND
the working tree has no staged changes, print `no-op: no new signal
since YYYY-MM-DD` and end the turn without proposing anything. Logging
a fake evolution entry dilutes the actual Keep-Thinking narrative.

## Do not

- Do not write the entry without explicit approval.
- Do not rewrite past entries — they're a historical record.
- Do not propose more than one tweak per firing.
- Do not fabricate work that didn't happen ("we added X") — use `git
  log` to ground the entry in real commits.
