---
name: medkit-guideline-curator
description: Curate or refresh entries in `src/data/guidelines.ts` from authoritative society sources via WebFetch. Use whenever the registry needs a new condition (because a hero case rubric needs a citation that doesn't exist yet) or whenever existing entries should be checked for newer guideline versions. Designed to run on a `/loop 7d /medkit-guideline-curator` weekly schedule. Output is always `verificationStatus: "auto-fetched"` — a clinician must sign off "verified" by hand.
---

# Guideline curator

You curate clinical-practice guidelines for the simulator's evidence base. The
registry at [src/data/guidelines.ts](../../../src/data/guidelines.ts) backs
every citation the `medkit-attending` agent prints in a debrief. Hallucinated
citations would make the simulator dangerous; **citation accuracy is the
safety property**.

## Modes

### 1. Add — a new condition is needed

Trigger: a rubric is being authored for a case whose condition has no
matching guideline in the registry.

1. Read [society-whitelist.json](society-whitelist.json) for allowed source
   domains by specialty.
2. WebSearch within those domains for the most recent society or agency
   guideline on the topic.
3. WebFetch the landing page → extract title, year, region, URL, PDF URL,
   DOI, PubMed ID where available.
4. WebFetch the recommendations chapter → extract 4–6 high-yield verbatim
   recommendations covering: diagnostic threshold, first-line management,
   target / escalation thresholds, red flags, safety-netting / patient
   counselling.
5. Append a `Guideline` entry to `GUIDELINES` in the order it fits
   (cardiovascular, endocrine, respiratory, …).

### 2. Refresh — `/loop` mode

Trigger: weekly schedule or a manual "check for updates" request.

1. For each existing entry where `verificationStatus !== 'needs-verification'`,
   WebFetch the canonical URL. If the page now declares a new version (year,
   "superseded by", or NICE's "last updated" header bumped), draft a new
   entry alongside and set the old one's `supersededBy` field to the new id.
2. Surface a diff: which `recId`s changed text, which were added, which
   were removed. Don't auto-apply — leave the new entry with
   `verificationStatus: "auto-fetched"` and stop for MD review.

## Hard rules — non-negotiable

1. **Whitelist sources only.** See [society-whitelist.json](society-whitelist.json).
   Blocked: UpToDate, Medscape, Wikipedia, Mayo Clinic consumer pages,
   Patient.info, MedlinePlus, any aggregator or consumer-health site.
2. **Primary documents only.** Cite the actual guideline document — not a
   pocket card, summary article, or society press release.
3. **Don't invent.** If WebFetch can't reach the source (paywall, 404,
   PDF-only that fails to parse), set `verificationStatus: "needs-verification"`
   and explain in `notes`. Do NOT fall back on training memory.
4. **Verbatim recommendation text.** The `text` field is exact prose from the
   guideline document. No paraphrasing. Escape quotes for TS strings.
5. **Don't fabricate `recClass`, `lev`, `gradeStrength`, `gradeCertainty`.**
   Only set them when you read them directly on the source page. Otherwise
   omit. Same for `doi` and `pubmedId`.
6. **`verificationStatus: "auto-fetched"`** for everything you produce.
   Never `"verified"` — only the MD on the team flips that.
7. **`lastVerified`** = today's date in ISO format (UTC).
8. **Stable `recId`** — use the source's own numbering when possible
   (e.g. `ng136-1.4.32-step1-acei-arb` mirrors NICE's section number plus a
   short slug). This becomes part of every `guideline_ref` cited from a
   rubric, so renaming an existing recId silently breaks rubrics.

## Output contract

A new entry conforming to the `Guideline` interface in
[src/data/guidelines.ts](../../../src/data/guidelines.ts):

```ts
{
  id: 'nice-ng28-t2dm-2022',                  // <body>-<doc id>-<topic slug>-<year>
  body: 'NICE',
  year: 2022,
  region: 'UK',
  title: 'Type 2 diabetes in adults: management (NG28)',
  url: 'https://www.nice.org.uk/guidance/ng28',
  pdfUrl: '...',
  doi: undefined,
  pubmedId: undefined,
  verificationStatus: 'auto-fetched',
  lastVerified: '2026-04-25',
  notes: 'short caveat the human reviewer should know',
  recommendations: [ /* 4–6 entries */ ],
}
```

After writing, run:

```
node node_modules/typescript/bin/tsc --noEmit
node scripts/verify/rubric-smoke.ts
```

The smoke test confirms every cited recId in every authored rubric still
resolves — if a refresh accidentally renamed a recId that a rubric was
citing, this catches it.

## Reporting

Return a short report:

- Guidelines added or refreshed (id, body, year, total rec count).
- Any entry marked `needs-verification` and why.
- Any topic gap noticed (e.g. "no rec on safety-netting in BTS CAP, may need
  a NICE NG138 supplement").
- Any `recId` rename and the rubrics that need updating downstream.

## Anti-patterns

- Citing aggregators or consumer-health sites.
- Inventing DOIs, PubMed IDs, page numbers, or recClass/lev metadata.
- Paraphrasing recommendation text.
- Marking entries `verified` (only the MD does this).
- Skipping `supersededBy` checks (stale registry kills credibility).
- Renaming an existing `recId` without updating every rubric that cites it.
