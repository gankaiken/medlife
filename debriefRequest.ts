# /loop 30m — Keep Thinking log

Invoke via `/loop 30m /keep-thinking`. Each tick reads `docs/evolution.md` and proposes ONE sharpening tweak — then waits for approval. Don't batch multiple suggestions.

Direct aim at the "Keep Thinking" $5k prize, which rewards idea evolution, not idea quantity.

## Every tick, do this

1. Read `docs/evolution.md` end-to-end. Note the latest entry's date.
2. Read `spec.md` "Success criteria" section.
3. Read the last 10 commits: `git log --oneline -10`.
4. Ask yourself ONE question from the list below — pick whichever hasn't been recently interrogated.
5. Write a single proposed entry to `docs/evolution.md` as a comment at the bottom (do not commit). Message the user: "New evolution candidate in docs/evolution.md — keep, refine, or discard?"

## Rotation of questions

- What's the one feature we'd cut if we had to ship tonight? Why haven't we cut it yet?
- Which of our four success criteria is furthest from demo-ready? What's the smallest step toward it?
- Is the attending agent actually grading meaningfully, or is it just rendering cards on cue? How would we know the difference?
- Would a judge who watched only 30 seconds of the demo understand the product? If not, which 30 seconds?
- What's the weakest story we have right now about *who this is for*? How could we tighten it?
- Does the current feature set still match the Keep Thinking narrative in `evolution.md`, or have we drifted?

## What the proposed entry should look like

Follow the template already in `docs/evolution.md`:

```
## YYYY-MM-DD — <one-line change>

**What changed.**

**Why.**

**What it replaces.**
```

It's a PROPOSAL — not a decision. The user will keep it, refine it, or discard it. If they refine it, update the entry. If they discard it, delete the comment entry and move on.

## Don'ts

- Don't propose a new feature. This loop is about reflection on what's already in motion, not greenfield ideas.
- Don't edit any file other than `docs/evolution.md`.
- Don't run the tool or the dev server — this loop does not touch code.
- Don't write two entries in one tick. One sharpening per 30 minutes.
