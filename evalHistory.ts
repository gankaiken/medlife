import { Fragment, useMemo, useState } from 'react';
import { TopBar } from './primitives';
import { store } from '../game/store';
import { GUIDELINES } from '../data/guidelines';
import { POLYCLINIC_CASES } from '../data/polyclinicPatients';
import { PATIENT_CASES } from '../data/patients';

// ── Visual canvas ───────────────────────────────────────────────────
//
// Two horizontal lanes — RUN-TIME (encounter) on top, AUTHORING (offline)
// below. Each lane flows left-to-right. A connector ties the authoring
// outputs (registry + rubric) back up into the run-time debrief packager.
//
// Coordinates are viewBox units; the SVG scales responsively.

const VB_W = 1500;
const VB_H = 880;

type NodeKind = 'user' | 'agent' | 'data' | 'external' | 'output';

interface NodeDef {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  subtitle: string;
  badge?: string;
  doodle?: 'star' | 'heart' | 'plus' | 'spark';
  details: NodeDetails;
}

interface NodeDetails {
  what: string;
  files?: Array<{ path: string; line?: number; label?: string }>;
  hardRules?: string[];
  verify?: string[];
  external?: Array<{ url: string; label: string }>;
  liveCounts?: Array<{ label: string; value: string }>;
}

interface EdgeDef {
  from: string;
  to: string;
  label?: string;
  curveOffset?: number;
  dashed?: boolean;
}

const NODE_KIND_BG: Record<NodeKind, string> = {
  user: 'var(--cream)',
  agent: 'var(--peach)',
  data: 'var(--mint)',
  external: 'var(--sky)',
  output: 'var(--butter)',
};

const NODE_KIND_TAG: Record<NodeKind, string> = {
  user: 'TRAINEE',
  agent: 'AGENT',
  data: 'DATA',
  external: 'EXTERNAL',
  output: 'OUTPUT',
};

// ── Live counts pulled from real data files ─────────────────────────
function collectAllCases() {
  let polyTotal = 0;
  let withRubric = 0;
  // POLYCLINIC_CASES has an 'all-specialties' virtual bucket that
  // re-flattens every other specialty — skip it to avoid double-counting.
  for (const [specialty, cases] of Object.entries(POLYCLINIC_CASES)) {
    if (specialty === 'all-specialties') continue;
    for (const c of cases) {
      polyTotal += 1;
      if (c.rubric) withRubric += 1;
    }
  }
  for (const c of PATIENT_CASES) {
    if (c.rubric) withRubric += 1;
  }
  return {
    total: polyTotal + PATIENT_CASES.length,
    withRubric,
    polyTotal,
    erTotal: PATIENT_CASES.length,
  };
}

const recCount = GUIDELINES.reduce((n, g) => n + g.recommendations.length, 0);

const CASE_STATS = collectAllCases();

// ── Layout — RUN-TIME lane (y ≈ 110-330) ────────────────────────────

const NODES: NodeDef[] = [
  // ── RUN-TIME row (all nodes y=170-350, height 180) ──────────────
  {
    id: 'trainee',
    kind: 'user',
    x: 50,
    y: 170,
    w: 160,
    h: 180,
    title: 'Trainee',
    subtitle: 'Sees the 3D polyclinic, speaks to the patient out loud.',
    doodle: 'star',
    details: {
      what: 'A medical student or new-grad doctor running a single GP-style consultation. Free-text voice input via the browser mic; receives the patient\'s reply through the LiveKit audio track. The trainee never sees the agent\'s system prompt or the rubric.',
      files: [
        { path: 'src/components/EncounterScreen.tsx', label: '3D scene + voice dock' },
        { path: 'src/voice/conversation.ts', label: 'mic + audio out + transcript' },
      ],
    },
  },
  {
    id: 'voice',
    kind: 'agent',
    x: 260,
    y: 170,
    w: 210,
    h: 180,
    title: 'Voice stack',
    subtitle: 'LiveKit + Deepgram STT · Cartesia TTS · Haiku 4.5 patient persona.',
    badge: 'real-time',
    doodle: 'spark',
    details: {
      what: 'Real-time pipeline that turns the trainee\'s spoken words into a patient reply spoken back out loud. Sub-1s perceived latency. The patient persona is a Haiku 4.5 system prompt assembled from the case\'s hidden facts + planted cues.',
      files: [
        { path: 'backend/voice_agent.py', label: 'LiveKit Agents worker' },
        { path: 'src/voice/patientPersona.ts', label: 'persona prompt builder' },
        { path: 'backend/server.py', line: 0, label: '/voice/token mint' },
      ],
      external: [
        { url: 'https://livekit.io', label: 'LiveKit Cloud (WebRTC transport)' },
        { url: 'https://deepgram.com', label: 'Deepgram Nova-3 (STT)' },
        { url: 'https://cartesia.ai', label: 'Cartesia Sonic-2 (TTS)' },
      ],
    },
  },
  {
    id: 'store',
    kind: 'data',
    x: 520,
    y: 170,
    w: 180,
    h: 180,
    title: 'Encounter log',
    subtitle: 'Store class — actions, transcript, prescriptions, timestamps.',
    doodle: 'plus',
    details: {
      what: 'One Store instance with useSyncExternalStore bindings. Captures every action the trainee takes: questions asked, tests ordered (with timestamps), treatments given, prescriptions written, submitted diagnosis. The encounter log is what the agent grades against.',
      files: [
        { path: 'src/game/store.ts', label: 'Store class + ActivePatient mutators' },
        { path: 'src/game/types.ts', label: 'PatientCase / ActivePatient / GameState' },
      ],
    },
  },
  {
    id: 'packager',
    kind: 'agent',
    x: 750,
    y: 170,
    w: 210,
    h: 180,
    title: 'Debrief packager',
    subtitle: 'Builds [debrief request] JSON — rubric + registry slice + encounter log.',
    badge: 'pure fn',
    details: {
      what: 'Pure function that runs at end-of-encounter. Reads the case\'s rubric (authored or auto-derived), grabs only the guidelines whose recIds are cited, packages the encounter log, and ships it as a single user.message. Acts as the allowlist that prevents the agent from citing recIds outside the rubric\'s scope.',
      files: [
        { path: 'src/agents/debriefRequest.ts', label: 'buildDebriefRequest()' },
        { path: 'src/agents/useAttendingDebrief.ts', label: 'hook that fires it' },
      ],
      verify: ['node scripts/verify/evaluation-flow.ts'],
    },
  },
  {
    id: 'attending',
    kind: 'agent',
    x: 1010,
    y: 170,
    w: 220,
    h: 180,
    title: 'medkit-attending',
    subtitle: 'Claude Managed Agent · Opus 4.7 · DEBRIEF MODE.',
    badge: 'Opus 4.7',
    doodle: 'star',
    details: {
      what: 'The senior clinician of the simulator. Lives on Anthropic\'s Managed Agents platform, versioned. In DEBRIEF MODE, reads the rubric + registry slice + encounter log, scores three domains (data_gathering, clinical_management, interpersonal), flags safety_breach when warranted, and emits exactly one render_case_evaluation tool use.',
      files: [
        { path: 'backend/server.py', label: 'MEDKIT_ATTENDING_SYSTEM_PROMPT + MEDKIT_CUSTOM_TOOLS' },
        { path: 'src/agents/customTools.ts', label: 'Zod mirror of the tool schema' },
        { path: '.claude/skills/medkit-attending-debrief/SKILL.md', label: 'reference skill' },
      ],
      hardRules: [
        'Cite, don\'t invent — every clinical_management criterion\'s guideline_ref MUST appear in the registry slice. No fabrication.',
        'Specific evidence — verdict tied to a transcript quote or named action, not generic.',
        'Safety first — contraindicated drug or missed red flag leads the narrative regardless of total score.',
        'Verdict bands: ≥0.85 excellent · ≥0.70 good · ≥0.55 satisfactory · ≥0.40 borderline · else clear-fail',
      ],
      verify: [
        'curl -X POST http://127.0.0.1:8787/agent/refresh -H "Origin: http://localhost:5173"',
        'node scripts/verify/live-debrief.ts',
      ],
      liveCounts: [
        { label: 'model', value: 'claude-opus-4-7' },
        { label: 'custom tools', value: '7 (incl. render_case_evaluation)' },
      ],
    },
  },
  {
    id: 'evaluation',
    kind: 'output',
    x: 1280,
    y: 170,
    w: 180,
    h: 180,
    title: 'Evaluation card',
    subtitle: 'Verdict, domain rings, criterion rows + cite-cards.',
    doodle: 'heart',
    details: {
      what: 'The trainee\'s view of the agent\'s grading. Cozy plush layout — verdict banner, three domain progress rings, per-criterion rows with MET/PARTIAL/MISSED icons, expandable cite-cards quoting the verbatim NICE/ESC/AHA recommendation, highlights + improvements list, action chips.',
      files: [
        { path: 'src/components/DebriefScreen.tsx', label: 'cozy screen, live data' },
        { path: 'src/components/CaseEvaluationCard.tsx', label: 'reusable standalone card' },
      ],
    },
  },

  // ── AUTHORING row (all nodes y=540-720, height 180) ────────────
  {
    id: 'sources',
    kind: 'external',
    x: 50,
    y: 540,
    w: 200,
    h: 180,
    title: 'Society sources',
    subtitle: 'NICE · ESC · AHA · ADA · BTS · GINA · GOLD · KDIGO.',
    doodle: 'plus',
    details: {
      what: 'The authoritative documents the registry quotes from. Whitelist-only — never UpToDate, Wikipedia, or consumer-health sites. WebFetch primary documents and extract verbatim recommendation text. recClass / LoE / GRADE metadata only when read directly from the source.',
      external: [
        { url: 'https://www.nice.org.uk', label: 'NICE (UK)' },
        { url: 'https://www.escardio.org', label: 'ESC (Europe)' },
        { url: 'https://www.heart.org', label: 'AHA (US)' },
        { url: 'https://ginasthma.org', label: 'GINA' },
        { url: 'https://goldcopd.org', label: 'GOLD' },
      ],
      files: [
        { path: '.claude/skills/medkit-guideline-curator/society-whitelist.json', label: 'allowlist + blocklist' },
      ],
    },
  },
  {
    id: 'curator',
    kind: 'agent',
    x: 300,
    y: 540,
    w: 220,
    h: 180,
    title: '/medkit-guideline-curator',
    subtitle: 'WebFetch + verbatim extraction. Designed for /loop 7d.',
    badge: 'skill',
    details: {
      what: 'Persistent skill that fills or refreshes the registry. WebFetch the canonical recommendations chapter, extract 4–6 verbatim recommendations per guideline, set verificationStatus to auto-fetched (only the MD on the team flips that to verified). Designed to run on a /loop 7d schedule for supersedence checks.',
      files: [
        { path: '.claude/skills/medkit-guideline-curator/SKILL.md', label: 'SKILL.md (full instructions)' },
        { path: '.claude/skills/medkit-guideline-curator/society-whitelist.json', label: 'allowlist sidecar' },
      ],
      hardRules: [
        'Whitelist sources only.',
        'Verbatim recommendation text — no paraphrasing.',
        'Don\'t invent recClass / lev / DOIs.',
        'verificationStatus: "auto-fetched" only — never auto-promote to verified.',
        'Fall back to needs-verification if WebFetch fails — never use training memory.',
      ],
    },
  },
  {
    id: 'registry',
    kind: 'data',
    x: 570,
    y: 540,
    w: 200,
    h: 180,
    title: 'guidelines.ts',
    subtitle: 'Citation registry — the safety property.',
    badge: `${recCount} recs`,
    doodle: 'plus',
    details: {
      what: 'The evidence base. Every clinical_management criterion in every rubric resolves to a recId here. If a recId is missing, the criterion is dropped — never fabricated. The registry is also the allowlist passed to the agent: it cannot cite anything that isn\'t in the slice.',
      files: [
        { path: 'src/data/guidelines.ts', label: 'GUIDELINES + getRecommendation()' },
      ],
      liveCounts: [
        { label: 'guidelines', value: String(GUIDELINES.length) },
        { label: 'verbatim recommendations', value: String(recCount) },
        { label: 'verification', value: 'auto-fetched (awaiting MD sign-off)' },
      ],
      verify: ['node scripts/verify/rubric-smoke.ts'],
    },
  },
  {
    id: 'rubricauthor',
    kind: 'agent',
    x: 820,
    y: 540,
    w: 220,
    h: 180,
    title: '/medkit-rubric-author',
    subtitle: 'Authors a CaseRubric per case. Citation-disciplined.',
    badge: 'skill',
    details: {
      what: 'Persistent skill invoked per case. Reads the case anamnesis + critical treatments, picks the relevant recIds from the registry, and writes a PLAB2-style rubric in-place into polyclinicPatients.ts (or patients.ts). Drops any criterion that has no matching rec — never fabricates. Cases without an authored rubric get an auto-derived fallback from autoRubric.ts.',
      files: [
        { path: '.claude/skills/medkit-rubric-author/SKILL.md', label: 'SKILL.md' },
        { path: '.claude/skills/medkit-rubric-author/rubric-brief.schema.json', label: 'optional input contract' },
        { path: 'src/data/autoRubric.ts', label: 'fallback derivation' },
      ],
      hardRules: [
        'Cite, don\'t invent — drop criteria with no matching recId.',
        'Specific evidence — name the action or quote the transcript.',
        'Three domains + optional safety_netting + global_rating.',
        'Calibrate weights so a competent doctor scores ~70%.',
      ],
    },
  },
  {
    id: 'rubric',
    kind: 'data',
    x: 1090,
    y: 540,
    w: 200,
    h: 180,
    title: 'case.rubric',
    subtitle: `Per-case OSCE rubric — ${CASE_STATS.withRubric} hero, ${CASE_STATS.total - CASE_STATS.withRubric} auto-fallback.`,
    badge: `${CASE_STATS.total} cases`,
    doodle: 'plus',
    details: {
      what: 'Per-case CaseRubric object embedded directly on the PatientCase. Contains data_gathering / clinical_management / interpersonal criteria + optional safety_netting. Cases without an authored rubric fall back to autoRubric.ts which derives a citation-free version from the case\'s critical treatments + relevant anamnesis items.',
      files: [
        { path: 'src/data/polyclinicPatients.ts', label: '240 polyclinic cases' },
        { path: 'src/data/patients.ts', label: 'ER cases' },
        { path: 'src/game/types.ts', label: 'CaseRubric interface' },
      ],
      liveCounts: [
        { label: 'total cases', value: String(CASE_STATS.total) },
        { label: 'hero (authored rubric)', value: String(CASE_STATS.withRubric) },
        { label: 'auto-fallback', value: String(CASE_STATS.total - CASE_STATS.withRubric) },
      ],
    },
  },
];

const EDGES: EdgeDef[] = [
  // RUN-TIME flow (left to right, single row)
  { from: 'trainee', to: 'voice', label: 'speaks' },
  { from: 'voice', to: 'store', label: 'transcribes' },
  { from: 'store', to: 'packager', label: 'on disposition' },
  { from: 'packager', to: 'attending', label: 'user.message' },
  { from: 'attending', to: 'evaluation', label: 'renders eval' },

  // AUTHORING flow (left to right, single row)
  { from: 'sources', to: 'curator', label: 'WebFetch' },
  { from: 'curator', to: 'registry', label: 'writes' },
  { from: 'registry', to: 'rubricauthor', label: 'allowlist' },
  { from: 'rubricauthor', to: 'rubric', label: 'writes' },

  // Cross-zone — authoring outputs feed the run-time packager
  { from: 'registry', to: 'packager', label: 'registry slice', dashed: true, curveOffset: -90 },
  { from: 'rubric', to: 'packager', label: 'case rubric', dashed: true, curveOffset: -110 },
];

// ── Geometry helpers ────────────────────────────────────────────────

interface PointPair {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cx: number;
  cy: number;
}

function edgeGeom(from: NodeDef, to: NodeDef, curveOffset = 0): PointPair {
  // Pick the closest pair of opposite faces.
  const dx = to.x + to.w / 2 - (from.x + from.w / 2);
  const dy = to.y + to.h / 2 - (from.y + from.h / 2);
  let x1: number, y1: number, x2: number, y2: number;
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      x1 = from.x + from.w; y1 = from.y + from.h / 2;
      x2 = to.x; y2 = to.y + to.h / 2;
    } else {
      x1 = from.x; y1 = from.y + from.h / 2;
      x2 = to.x + to.w; y2 = to.y + to.h / 2;
    }
  } else {
    if (dy >= 0) {
      x1 = from.x + from.w / 2; y1 = from.y + from.h;
      x2 = to.x + to.w / 2; y2 = to.y;
    } else {
      x1 = from.x + from.w / 2; y1 = from.y;
      x2 = to.x + to.w / 2; y2 = to.y + to.h;
    }
  }
  // Bend control point — perpendicular to the chord, magnitude curveOffset
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const cx = mx + (curveOffset === 0 ? 0 : curveOffset * (Math.abs(dx) >= Math.abs(dy) ? 0 : 1));
  const cy = my + (curveOffset === 0 ? 0 : curveOffset * (Math.abs(dx) >= Math.abs(dy) ? 1 : 0));
  return { x1, y1, x2, y2, cx, cy };
}

// ── Component ───────────────────────────────────────────────────────

type TabKey = 'grading' | 'cases' | 'agent';

const TABS: Array<{ key: TabKey; label: string; sub: string }> = [
  { key: 'grading', label: 'Grading flow', sub: 'How the simulator grades you' },
  { key: 'cases',   label: 'Cases',        sub: 'How cases were produced' },
  { key: 'agent',   label: 'The agent',    sub: 'medkit-attending in detail' },
];

export function AgenticRoundsScreen() {
  const [tab, setTab] = useState<TabKey>('grading');

  const tabMeta = TABS.find((t) => t.key === tab) ?? TABS[0];

  return (
    <div className="screen paper" style={{ overflowY: 'auto' }}>
      <TopBar
        here={6}
        steps={['Polyclinic', 'GP', 'Case', 'Brief', 'Encounter', 'Debrief', 'Architecture']}
      />

      <div style={{ padding: '24px 24px 60px', maxWidth: 1500, margin: '0 auto' }}>
        <header style={{ marginBottom: 18, display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div className="chip butter" style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.08em' }}>
                AGENTIC ROUNDS
              </div>
              <div className="chip" style={{ background: 'white', fontSize: 12 }}>
                {CASE_STATS.total} cases · {CASE_STATS.withRubric} hero rubrics · {GUIDELINES.length} guidelines · {recCount} recs
              </div>
            </div>
            <h1 style={{ fontSize: 30, lineHeight: 1.1, margin: 0 }}>
              {tabMeta.sub}
            </h1>
          </div>
          <button
            type="button"
            className="btn-plush ghost"
            style={{ flexShrink: 0, fontSize: 13, padding: '8px 14px' }}
            onClick={() => {
              if (typeof window !== 'undefined' && window.location.pathname.startsWith('/agentic-rounds')) {
                window.history.pushState({}, '', '/');
              }
              store.setScreen('home');
            }}
          >
            ← Back
          </button>
        </header>

        {/* Tab pills */}
        <div role="tablist" style={{ display: 'flex', gap: 10, marginBottom: 22, flexWrap: 'wrap' }}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                className="tap"
                style={{
                  background: active ? 'var(--butter)' : 'var(--paper)',
                  border: '3px solid var(--line)',
                  borderRadius: 14,
                  padding: '10px 16px',
                  boxShadow: active ? '0 4px 0 var(--line)' : '0 2px 0 var(--line)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  minWidth: 200,
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--ink)' }}>
                  {t.label}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>
                  {t.sub}
                </span>
              </button>
            );
          })}
        </div>

        {tab === 'grading' && <GradingTab />}
        {tab === 'cases' && <CasesTab />}
        {tab === 'agent' && <AgentTab />}
      </div>
    </div>
  );
}

// ── Grading tab — the run-time + authoring diagram (existing) ───────

function GradingTab() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => NODES.find((n) => n.id === selectedId) ?? null, [selectedId]);
  const nodeMap = useMemo(() => {
    const m = new Map<string, NodeDef>();
    for (const n of NODES) m.set(n.id, n);
    return m;
  }, []);

  return (
    <>
      <p style={{ fontSize: 15, lineHeight: 1.55, fontWeight: 600, color: 'var(--ink-2)', maxWidth: 880, marginBottom: 22 }}>
        Two flows wrap around one Managed Agent. <strong>Run-time</strong> is
        what happens during the encounter — voice, actions, debrief.
        <strong> Authoring</strong> is offline — society guidelines flow into a
        citation registry that the run-time agent must cite from. Click any
        node for files, hard rules, and how it&apos;s verified.
      </p>

      <div style={{ display: 'flex', gap: 22 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <DiagramCanvas selectedId={selectedId} onSelect={setSelectedId} />
          <Legend />
        </div>
        <DetailsDrawer node={selected} nodeMap={nodeMap} onClose={() => setSelectedId(null)} />
      </div>
    </>
  );
}

// ── Diagram canvas ──────────────────────────────────────────────────

function DiagramCanvas({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div
      className="plush"
      style={{
        position: 'relative',
        background: 'var(--paper)',
        padding: 0,
        overflow: 'hidden',
      }}
    >
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        style={{ display: 'block', width: '100%', height: 'auto' }}
        role="img"
      >
        {/* Lane backgrounds */}
        <rect x="24" y="90" width={VB_W - 48} height="320" rx="22" ry="22"
          fill="rgba(255,182,138,0.08)" stroke="var(--line)" strokeWidth="2" strokeDasharray="6 8" />
        <rect x="24" y="470" width={VB_W - 48} height="320" rx="22" ry="22"
          fill="rgba(168,229,200,0.10)" stroke="var(--line)" strokeWidth="2" strokeDasharray="6 8" />
        {/* Lane labels — sit on the lane border like tabs, well clear of nodes */}
        <LaneLabel y={78} label="RUN-TIME" sub="During the encounter" />
        <LaneLabel y={458} label="AUTHORING" sub="Offline — keeps the evidence base honest" />

        {/* Edges first so nodes paint over them */}
        <defs>
          <marker
            id="arrow-ink"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--line)" />
          </marker>
        </defs>

        {/* Edge paths first — under nodes */}
        {EDGES.map((e, i) => (
          <EdgePath key={`p-${i}`} edge={e} />
        ))}

        {/* Nodes */}
        {NODES.map((n) => (
          <Node
            key={n.id}
            node={n}
            selected={selectedId === n.id}
            onClick={() => onSelect(n.id === selectedId ? null : n.id)}
          />
        ))}

        {/* Edge labels last so they paint on top of nodes when the pill
         *  is wider than the inter-node gap. */}
        {EDGES.map((e, i) => (
          <EdgeLabel key={`l-${i}`} edge={e} />
        ))}
      </svg>
    </div>
  );
}

function LaneLabel({ y, label, sub }: { y: number; label: string; sub: string }) {
  // Conservative width estimate; SVG <text> overflow isn't clipped by the
  // rect anyway, so erring on the wide side just gives extra padding.
  const labelW = label.length * 9 + 18;
  const w = labelW + sub.length * 6 + 22;
  return (
    <g transform={`translate(40 ${y})`}>
      <rect width={w} height={28} rx="14" ry="14"
        fill="var(--paper)" stroke="var(--line)" strokeWidth="2.5" />
      <text x={14} y={19} fontFamily="Nunito, sans-serif" fontWeight={900} fontSize="12"
        letterSpacing=".1em" fill="var(--ink)">{label}</text>
      <text x={labelW + 8} y={19} fontFamily="Nunito, sans-serif" fontWeight={700} fontSize="11"
        opacity={0.6} fill="var(--ink-2)">{sub}</text>
    </g>
  );
}

// ── Edge ────────────────────────────────────────────────────────────

function EdgePath({ edge }: { edge: EdgeDef }) {
  const from = NODES.find((n) => n.id === edge.from);
  const to = NODES.find((n) => n.id === edge.to);
  if (!from || !to) return null;
  const g = edgeGeom(from, to, edge.curveOffset);
  const path = `M ${g.x1},${g.y1} Q ${g.cx},${g.cy} ${g.x2},${g.y2}`;
  return (
    <path
      d={path}
      fill="none"
      stroke="var(--line)"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeDasharray={edge.dashed ? '6 6' : undefined}
      markerEnd="url(#arrow-ink)"
      opacity={edge.dashed ? 0.55 : 0.9}
    />
  );
}

function EdgeLabel({ edge }: { edge: EdgeDef }) {
  if (!edge.label) return null;
  const from = NODES.find((n) => n.id === edge.from);
  const to = NODES.find((n) => n.id === edge.to);
  if (!from || !to) return null;
  const g = edgeGeom(from, to, edge.curveOffset);
  const lx = 0.25 * g.x1 + 0.5 * g.cx + 0.25 * g.x2;
  let ly = 0.25 * g.y1 + 0.5 * g.cy + 0.25 * g.y2;
  // For straight horizontal edges between adjacent nodes, lift the label
  // up into the lane padding zone (above node tops) so the pill never
  // overlaps a node body — only the lane background.
  const dxAbs = Math.abs(g.x2 - g.x1);
  const dyAbs = Math.abs(g.y2 - g.y1);
  if (!edge.curveOffset && dxAbs > dyAbs) {
    ly -= 110;
  }
  return (
    <g transform={`translate(${lx} ${ly})`}>
      <rect
        x={-((edge.label.length * 7) / 2 + 10)}
        y={-13}
        width={edge.label.length * 7 + 20}
        height={26}
        rx={13}
        ry={13}
        fill="var(--paper)"
        stroke="var(--line)"
        strokeWidth="2"
      />
      <text
        x={0}
        y={5}
        textAnchor="middle"
        fontFamily="Nunito, sans-serif"
        fontWeight={800}
        fontSize="12"
        fill="var(--ink)"
      >
        {edge.label}
      </text>
    </g>
  );
}

// ── Node ────────────────────────────────────────────────────────────

function Node({
  node,
  selected,
  onClick,
}: {
  node: NodeDef;
  selected: boolean;
  onClick: () => void;
}) {
  const bg = NODE_KIND_BG[node.kind];
  const tagLabel = NODE_KIND_TAG[node.kind];
  return (
    <g
      transform={`translate(${node.x} ${node.y})`}
      style={{ cursor: 'pointer' }}
      onClick={onClick}
    >
      {/* Drop shadow */}
      <rect x="2" y="4" width={node.w} height={node.h} rx="18" ry="18" fill="var(--line)" opacity="0.9" />
      {/* Main fill */}
      <rect
        x="0"
        y="0"
        width={node.w}
        height={node.h}
        rx="18"
        ry="18"
        fill={bg}
        stroke="var(--line)"
        strokeWidth={selected ? 4 : 3}
      />
      {/* Selected halo */}
      {selected && (
        <rect
          x="-6"
          y="-6"
          width={node.w + 12}
          height={node.h + 12}
          rx="22"
          ry="22"
          fill="none"
          stroke="var(--butter-deep)"
          strokeWidth="3"
          strokeDasharray="4 4"
        />
      )}
      {/* Kind tag */}
      <g transform="translate(14 -10)">
        <rect width={tagLabel.length * 7 + 14} height={22} rx="11" ry="11"
          fill="var(--paper)" stroke="var(--line)" strokeWidth="2" />
        <text x={(tagLabel.length * 7 + 14) / 2} y={15} textAnchor="middle"
          fontFamily="Nunito, sans-serif" fontWeight={900} fontSize="10"
          letterSpacing=".08em" fill="var(--ink)">
          {tagLabel}
        </text>
      </g>
      {/* Title */}
      <text x={18} y={36} fontFamily="Nunito, sans-serif" fontWeight={900} fontSize="18" fill="var(--ink)">
        {node.title}
      </text>
      {/* Subtitle (wrapped) */}
      <foreignObject x={18} y={46} width={node.w - 36} height={node.h - 60}>
        <div
          style={{
            fontFamily: 'Nunito, sans-serif',
            fontSize: 12,
            lineHeight: 1.35,
            fontWeight: 600,
            color: 'var(--ink-2)',
            paddingTop: 4,
          }}
        >
          {node.subtitle}
        </div>
      </foreignObject>
      {/* Badge */}
      {node.badge && (
        <g transform={`translate(${node.w - 14} ${node.h - 14})`}>
          <rect
            x={-(node.badge.length * 6.2 + 10)}
            y={-22}
            width={node.badge.length * 6.2 + 10}
            height={22}
            rx={11}
            ry={11}
            fill="var(--paper)"
            stroke="var(--line)"
            strokeWidth="2"
          />
          <text
            x={-(node.badge.length * 6.2 + 10) / 2}
            y={-7}
            textAnchor="middle"
            fontFamily="Nunito, sans-serif"
            fontWeight={800}
            fontSize="10"
            fill="var(--ink)"
          >
            {node.badge}
          </text>
        </g>
      )}
      {/* Doodles intentionally omitted — they fight title width on
       *  narrower nodes and the kind tag already carries the visual. */}
    </g>
  );
}

// ── Legend ──────────────────────────────────────────────────────────

function Legend() {
  const items: Array<{ kind: NodeKind; label: string; example: string }> = [
    { kind: 'user', label: 'Trainee / output', example: 'cream' },
    { kind: 'agent', label: 'Agent or skill', example: 'peach' },
    { kind: 'data', label: 'Data file', example: 'mint' },
    { kind: 'external', label: 'External source', example: 'sky' },
    { kind: 'output', label: 'Surface in the UI', example: 'butter' },
  ];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
      {items.map((it) => (
        <div
          key={it.kind}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: NODE_KIND_BG[it.kind],
            border: '2.5px solid var(--line)',
            borderRadius: 12,
            padding: '6px 10px',
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          {it.label}
        </div>
      ))}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--paper)',
          border: '2.5px dashed var(--line)',
          borderRadius: 12,
          padding: '6px 10px',
          fontSize: 12,
          fontWeight: 800,
          color: 'var(--ink-2)',
        }}
      >
        Dashed arrow = cross-zone (authoring → run-time)
      </div>
    </div>
  );
}

// ── Details drawer ──────────────────────────────────────────────────

function DetailsDrawer({
  node,
  nodeMap,
  onClose,
}: {
  node: NodeDef | null;
  nodeMap: Map<string, NodeDef>;
  onClose: () => void;
}) {
  if (!node) {
    return (
      <aside
        className="plush"
        style={{
          width: 280,
          flexShrink: 0,
          padding: 16,
          background: 'var(--cream)',
          alignSelf: 'flex-start',
          position: 'sticky',
          top: 16,
        }}
      >
        <div className="chip butter" style={{ marginBottom: 10 }}>HOW TO READ</div>
        <p style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.5, color: 'var(--ink-2)' }}>
          Click any node in the diagram. This panel will show what it is, the
          files involved, the hard rules it operates under, and how to verify
          it. Counts come from the live data files — they update when the
          registry or the case roster grows.
        </p>
        <p style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.5, color: 'var(--ink-2)', marginTop: 10 }}>
          The whole story is one safety property: <strong>cite, don&apos;t invent</strong>.
          Every claim the attending agent makes resolves to a real, named,
          society-published recommendation — or it doesn&apos;t get printed.
        </p>
      </aside>
    );
  }
  return (
    <aside
      className="plush"
      style={{
        width: 320,
        flexShrink: 0,
        padding: 16,
        background: NODE_KIND_BG[node.kind],
        alignSelf: 'flex-start',
        position: 'sticky',
        top: 16,
        maxHeight: 'calc(100vh - 32px)',
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span className="chip" style={{ background: 'white', fontSize: 10 }}>
          {NODE_KIND_TAG[node.kind]}
        </span>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{
            marginLeft: 'auto',
            background: 'var(--paper)',
            border: '2px solid var(--line)',
            borderRadius: 999,
            width: 28,
            height: 28,
            fontWeight: 900,
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>
      <h2 style={{ fontSize: 22, lineHeight: 1.1, margin: '0 0 4px' }}>{node.title}</h2>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 12 }}>
        {node.subtitle}
      </div>

      <p style={{ fontSize: 13, lineHeight: 1.55, fontWeight: 600, color: 'var(--ink)' }}>
        {node.details.what}
      </p>

      {node.details.liveCounts && node.details.liveCounts.length > 0 && (
        <Section title="Live counts">
          {node.details.liveCounts.map((c, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, padding: '4px 0' }}>
              <span style={{ color: 'var(--ink-2)' }}>{c.label}</span>
              <span style={{ color: 'var(--ink)' }}>{c.value}</span>
            </div>
          ))}
        </Section>
      )}

      {node.details.files && node.details.files.length > 0 && (
        <Section title="Files">
          {node.details.files.map((f, i) => (
            <div key={i} style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', padding: '3px 0', wordBreak: 'break-all' }}>
              <code style={{ background: 'var(--paper)', padding: '2px 6px', borderRadius: 6, border: '1.5px solid var(--line)', fontSize: 11 }}>
                {f.path}{f.line ? `:${f.line}` : ''}
              </code>
              {f.label && <div style={{ fontWeight: 600, opacity: 0.8, marginTop: 2 }}>{f.label}</div>}
            </div>
          ))}
        </Section>
      )}

      {node.details.hardRules && node.details.hardRules.length > 0 && (
        <Section title="Hard rules">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.5, fontWeight: 600 }}>
            {node.details.hardRules.map((r, i) => <li key={i} style={{ marginBottom: 4 }}>{r}</li>)}
          </ul>
        </Section>
      )}

      {node.details.verify && node.details.verify.length > 0 && (
        <Section title="How to verify">
          {node.details.verify.map((v, i) => (
            <pre key={i} style={{
              margin: '4px 0',
              background: 'var(--paper)',
              border: '2px solid var(--line)',
              borderRadius: 8,
              padding: '8px 10px',
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}>
              {v}
            </pre>
          ))}
        </Section>
      )}

      {node.details.external && node.details.external.length > 0 && (
        <Section title="External">
          {node.details.external.map((x, i) => (
            <a
              key={i}
              href={x.url}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'block', fontSize: 12, fontWeight: 700, padding: '3px 0', color: 'var(--ink)', textDecoration: 'underline' }}
            >
              {x.label}
            </a>
          ))}
        </Section>
      )}

      {/* eslint-disable-next-line @typescript-eslint/no-unused-vars */}
      {(() => { void nodeMap; return null; })()}
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{
        fontSize: 10,
        fontWeight: 900,
        letterSpacing: '.1em',
        textTransform: 'uppercase',
        color: 'var(--ink-2)',
        marginBottom: 6,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// CASES TAB — how the case roster + rubrics are produced
// ────────────────────────────────────────────────────────────────────

interface PipelineStep {
  kind: NodeKind;
  title: string;
  sub: string;
  badge?: string;
}

const CASE_PIPELINE: PipelineStep[] = [
  { kind: 'external', title: 'Society guideline', sub: 'NICE, ESC, AHA, BTS, GINA, GOLD, KDIGO. Whitelist-only.' },
  { kind: 'agent', title: '/medkit-guideline-curator', sub: 'WebFetch + verbatim extraction. /loop 7d.', badge: 'skill' },
  { kind: 'data', title: 'guidelines.ts', sub: 'Citation registry — 22 verbatim recommendations.' },
  { kind: 'agent', title: '/medkit-patient-generator', sub: 'Authors the PatientCase shape from condition + variant brief.', badge: 'skill' },
  { kind: 'data', title: 'polyclinicPatients.ts', sub: '246 cases across 11 specialties. Demographics, vitals, anamnesis, gold-standard dx.' },
  { kind: 'agent', title: '/medkit-rubric-author', sub: "Adds rubric: { ... } to hero cases. Cite-don't-invent.", badge: 'skill' },
  { kind: 'data', title: 'case.rubric', sub: '3 hero cases · 243 auto-fallback. PLAB2 + RCGP + NURSE + SEGUE tagged.' },
];

const HERO_CASES_TAB = [
  {
    id: 'im-003',
    name: 'Michael Williams · 52',
    chief: 'Pharmacist flagged my BP at 156/96.',
    dx: 'essential-hypertension',
    cites: 'NG136 — diagnostic-threshold · step-1 ACEi/ARB · BP target · same-day referral',
  },
  {
    id: 'im-004',
    name: 'Patricia Brown · 58',
    chief: 'Thirsty all the time and urinating constantly.',
    dx: 'type2-diabetes',
    cites: 'NG28 — structured education · healthy eating · HbA1c monitoring · metformin + SGLT-2',
  },
  {
    id: 'im-005',
    name: 'David Jones · 47',
    chief: 'Productive cough, fever, pleuritic right chest pain over 5 days.',
    dx: 'community-acquired-pna',
    cites: 'NG250 — CRB-65 · oral first-line · start within 4h · stop at 5 days · safety-netting',
  },
];

const CASE_VARIANT_AXES = [
  'age band',
  'duration',
  'control quality',
  'compliance',
  'comorbidity',
  'complication',
  'tone (stoic / anxious / talkative / minimising / pleasant)',
];

const CONDITIONS_FROM_DATA: string[] = (() => {
  const set = new Set<string>();
  for (const [specialty, cases] of Object.entries(POLYCLINIC_CASES)) {
    if (specialty === 'all-specialties') continue;
    for (const c of cases) set.add(c.correctDiagnosisId);
  }
  return [...set].sort();
})();

function CasesTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <p style={{ fontSize: 15, lineHeight: 1.55, fontWeight: 600, color: 'var(--ink-2)', maxWidth: 880, margin: 0 }}>
        Cases are produced by composing two skills around the citation
        registry. <strong>Society guidelines</strong> flow in via the
        curator skill. <strong>Cases</strong> are written from those
        guidelines plus a variant brief. <strong>Rubrics</strong> attach
        per-case — but only cite recIds that already exist in the registry.
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 14,
      }}>
        <BigStat label="cases authored" value={String(CASE_STATS.total)} sub={`${CASE_STATS.polyTotal} polyclinic + ${CASE_STATS.erTotal} ER`} />
        <BigStat label="hero rubrics" value={String(CASE_STATS.withRubric)} sub={`${CASE_STATS.total - CASE_STATS.withRubric} cases on auto-fallback`} />
        <BigStat label="guidelines in registry" value={String(GUIDELINES.length)} sub={`${recCount} verbatim recommendations`} />
        <BigStat label="conditions covered" value={String(CONDITIONS_FROM_DATA.length)} sub="dx labels in the catalogue" />
      </div>

      <Card title="The authoring pipeline">
        <PipelineStrip steps={CASE_PIPELINE} />
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginTop: 12, lineHeight: 1.5 }}>
          Each arrow respects one rule: <strong>cite, don&apos;t invent</strong>.
          The rubric author can only cite recIds the curator put in the
          registry. The patient generator can only build a case from a
          guideline that&apos;s already verified.
        </div>
      </Card>

      <Card title="Variant axes — how a single condition becomes many cases">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {CASE_VARIANT_AXES.map((axis) => (
            <span key={axis} className="chip butter" style={{ fontSize: 12 }}>{axis}</span>
          ))}
        </div>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', marginTop: 12, lineHeight: 1.5 }}>
          Hypertension isn&apos;t one case. It&apos;s a newly-diagnosed
          middle-aged office worker, a poorly-controlled elderly patient with
          early CKD, a pregnant case, and so on. The generator produces 5+
          variants per condition by combining axes above.
        </p>
      </Card>

      <Card title="The PatientCase shape">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          <CaseFieldGroup
            kind="user"
            title="Public — what the trainee sees"
            fields={[
              ['name, age, gender', 'demographics'],
              ['chief complaint', "in the patient's own words"],
              ['vitals', 'hr · bp · spo2 · temp · rr'],
              ['anamnesis[]', 'Q&A pairs with relevant flag'],
              ['testResults[]', 'lab + imaging once ordered'],
              ['diagnosisOptions[]', 'multiple-choice menu'],
            ]}
          />
          <CaseFieldGroup
            kind="agent"
            title="Hidden — what the agent grades against"
            fields={[
              ['correctDiagnosisId', 'gold-standard dx'],
              ['acceptableTreatmentIds[]', 'fine to do'],
              ['criticalTreatmentIds[]', 'must do'],
              ['rubric (optional)', 'PLAB2 / RCGP / NURSE / SEGUE'],
              ['rubric.*.guideline_ref', 'recId into the registry'],
              ['rubric.safety_netting', 'required_elements'],
            ]}
          />
        </div>
      </Card>

      <Card title="Hero cases — fully rubric-graded">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
          {HERO_CASES_TAB.map((c) => (
            <div key={c.id}
              style={{
                background: 'var(--mint)',
                border: '3px solid var(--line)',
                borderRadius: 14,
                padding: 14,
                boxShadow: '0 3px 0 var(--line)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="chip" style={{ background: 'var(--paper)', fontSize: 11 }}>{c.id}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-2)' }}>{c.dx}</span>
              </div>
              <div style={{ fontSize: 16, fontWeight: 900 }}>{c.name}</div>
              <div style={{ fontSize: 13, fontWeight: 600, fontStyle: 'italic', color: 'var(--ink-2)' }}>
                &ldquo;{c.chief}&rdquo;
              </div>
              <div style={{
                marginTop: 6,
                background: 'var(--paper)',
                border: '2px dashed var(--line)',
                borderRadius: 10,
                padding: '8px 10px',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--ink)',
              }}>
                <span style={{ fontSize: 10, fontWeight: 900, color: 'var(--ink-2)', letterSpacing: '.08em' }}>
                  CITES
                </span>
                <div style={{ marginTop: 4 }}>{c.cites}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title={`All ${CONDITIONS_FROM_DATA.length} dx labels in the catalogue`}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {CONDITIONS_FROM_DATA.map((c) => (
            <span
              key={c}
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 9px',
                background: 'var(--cream)',
                border: '1.5px solid var(--line)',
                borderRadius: 999,
                color: 'var(--ink-2)',
              }}
            >
              {c}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}

function BigStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="plush" style={{ padding: 14, background: 'var(--cream)' }}>
      <div style={{ fontSize: 32, fontWeight: 900, lineHeight: 1, color: 'var(--ink)' }}>{value}</div>
      <div style={{
        fontSize: 11,
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '.06em',
        color: 'var(--ink-2)',
        marginTop: 4,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginTop: 6 }}>{sub}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="plush" style={{ padding: 18, background: 'var(--paper)' }}>
      <h3 style={{
        fontSize: 12,
        fontWeight: 900,
        letterSpacing: '.1em',
        textTransform: 'uppercase',
        color: 'var(--ink-2)',
        margin: '0 0 12px',
      }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function PipelineStrip({ steps }: { steps: PipelineStep[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'wrap', gap: 8 }}>
      {steps.map((s, i) => (
        <Fragment key={i}>
          <div
            style={{
              flex: '1 1 160px',
              minWidth: 160,
              maxWidth: 220,
              background: NODE_KIND_BG[s.kind],
              border: '3px solid var(--line)',
              borderRadius: 14,
              padding: '10px 12px',
              boxShadow: '0 3px 0 var(--line)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              position: 'relative',
            }}
          >
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '.08em', color: 'var(--ink-2)' }}>
              {NODE_KIND_TAG[s.kind]}
            </div>
            <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--ink)' }}>
              {s.title}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', lineHeight: 1.35 }}>
              {s.sub}
            </div>
            {s.badge && (
              <span className="chip" style={{ position: 'absolute', bottom: 6, right: 6, fontSize: 10 }}>
                {s.badge}
              </span>
            )}
          </div>
          {i < steps.length - 1 && (
            <div style={{
              alignSelf: 'center',
              fontSize: 22,
              fontWeight: 900,
              color: 'var(--ink-2)',
              padding: '0 2px',
            }}>
              {'→'}
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}

function CaseFieldGroup({
  kind,
  title,
  fields,
}: {
  kind: NodeKind;
  title: string;
  fields: Array<[string, string]>;
}) {
  return (
    <div style={{
      background: NODE_KIND_BG[kind],
      border: '3px solid var(--line)',
      borderRadius: 14,
      padding: 14,
      boxShadow: '0 3px 0 var(--line)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.08em', color: 'var(--ink-2)', marginBottom: 10 }}>
        {title.toUpperCase()}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {fields.map(([name, desc], i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
            <code style={{
              background: 'var(--paper)',
              padding: '2px 8px',
              borderRadius: 8,
              border: '1.5px solid var(--line)',
              fontWeight: 800,
              color: 'var(--ink)',
              fontSize: 12,
              flexShrink: 0,
            }}>
              {name}
            </code>
            <span style={{ fontWeight: 600, color: 'var(--ink-2)', textAlign: 'right' }}>
              {desc}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// AGENT TAB — medkit-attending Managed Agent deep-dive
// ────────────────────────────────────────────────────────────────────

const PRIMITIVES = [
  { name: 'Agent',            role: "Versioned definition on Anthropic's platform — system prompt + custom tool schemas. Bumped via /agent/refresh. Currently v5." },
  { name: 'Environment',      role: 'Cloud container the agent runs in. Network egress restricted to Anthropic + huggingface.co; scratch I/O at /workspace.' },
  { name: 'Session',          role: "Per-trainee, per-shift. Lives up to 30 min idle. Stateful across the trainee's actions. Idle sessions are free to keep open." },
  { name: 'Custom tools',     role: 'Schema-defined client-side tools. The agent emits a tool use, the browser renders or executes, the result goes back. Seven defined.' },
  { name: 'Permission policies', role: "Per-tool: auto-allow reads, confirm writes. Frontend-enforced for custom tools (Anthropic's gate covers native + MCP only)." },
  { name: 'Credential vault', role: 'EHR_API_TOKEN never enters the model context. The agent calls lookup_ehr_history; the backend attaches the token server-side.' },
];

const TWO_MODES = [
  {
    key: 'observing',
    title: 'Observing',
    bg: 'var(--cream)',
    bullets: [
      'Watches encounter events: arrivals, tests ordered, treatments, prescriptions, diagnosis submitted.',
      'Stays silent unless something is genuinely critical (peri-arrest vitals, stroke window, anaphylaxis) — then flag_critical_finding fires.',
      'May emit one render_triage_badge on ER arrivals if vitals warrant a zone call.',
      'Never asks the trainee questions, never narrates the scene.',
    ],
  },
  {
    key: 'debriefing',
    title: 'DEBRIEF MODE',
    bg: 'var(--peach)',
    bullets: [
      'Trigger: a [debrief request] message containing rubric + registry slice + encounter log.',
      'Scores three domains (data_gathering, clinical_management, interpersonal) against the rubric.',
      'Writes 1–3 highlights, 1–3 priority improvements, and a spoken-aloud narrative.',
      'Emits exactly one render_case_evaluation tool use, then stops.',
    ],
  },
];

const TOOLS = [
  { name: 'render_vitals_chart',     perm: 'auto',    desc: 'Line chart of HR / BP / SpO2 / Temp / RR over the encounter.' },
  { name: 'render_bed_map',          perm: 'auto',    desc: 'ER bed occupancy map. ER mode only.' },
  { name: 'render_triage_badge',     perm: 'auto',    desc: 'Red/yellow/green triage zone with a one-line rationale. ER arrivals.' },
  { name: 'render_patient_timeline', perm: 'auto',    desc: 'Tests + treatments in chronological order.' },
  { name: 'render_case_evaluation',  perm: 'auto',    desc: 'End-of-encounter PLAB2 debrief — verdict, criteria, citations, narrative.' },
  { name: 'flag_critical_finding',   perm: 'confirm', desc: 'Disruptive critical-finding banner. Reserved for imminent risk.' },
  { name: 'lookup_ehr_history',      perm: 'auto',    desc: 'EHR lookup via the credential vault — token never reaches the model.' },
];

const HARD_RULES = [
  {
    title: "Cite, don't invent",
    body: "Every clinical_management criterion's guideline_ref MUST appear in the registry slice the packager attached. If no rec applies, drop the criterion.",
  },
  {
    title: 'Specific evidence',
    body: 'Each verdict ties to a transcript quote or named action. "You missed ICE" is not enough.',
  },
  {
    title: 'Safety first',
    body: 'A contraindicated drug or missed red-flag escalation populates safety_breach. The narrative leads with it regardless of total score.',
  },
  {
    title: 'No narration during the encounter',
    body: 'Never asks the trainee questions, never describes the scene. Silence is acceptable and often correct.',
  },
  {
    title: 'No real-patient advice',
    body: 'Output is framed as training only. Cases are synthetic, doses simplified.',
  },
];

const SKILLS_AROUND = [
  { name: 'medkit-attending-debrief',   role: "Reference for the live agent's DEBRIEF MODE contract — files, hard rules, smoke tests." },
  { name: 'medkit-guideline-curator',   role: 'Fills / refreshes the registry from authoritative sources. Designed for /loop 7d.' },
  { name: 'medkit-rubric-author',       role: 'Authors a CaseRubric per case with citation discipline.' },
  { name: 'medkit-managed-agent-setup', role: 'Bootstrap, refresh, custom-tool maintenance.' },
  { name: 'medkit-patient-generator',   role: 'Authors new PatientCase entries from condition + variant brief.' },
];

function AgentTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div
        className="plush-lg popin"
        style={{
          background: 'var(--peach)',
          padding: 22,
          position: 'relative',
          transform: 'rotate(-0.3deg)',
        }}
      >
        <div className="chip butter" style={{ position: 'absolute', top: -12, left: 22, fontSize: 12 }}>
          MANAGED AGENT
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h2 style={{ fontSize: 32, lineHeight: 1.05, margin: '4px 0 8px' }}>
              medkit-attending
            </h2>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-2)' }}>
              Claude Managed Agent · Opus 4.7 · two modes (observing + debriefing)
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.55, marginTop: 10 }}>
              The senior clinician of the simulator. One agent observes the
              entire encounter and grades it at the end. Citation discipline
              is enforced at the system-prompt level — the agent literally
              cannot fabricate a NICE / ESC / AHA recommendation, because
              it&apos;s told to drop any criterion whose recId isn&apos;t in
              the registry slice it was given.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 220 }}>
            <SmallStat label="model" value="claude-opus-4-7" />
            <SmallStat label="custom tools" value={`${TOOLS.length} (1 confirm-gated)`} />
            <SmallStat label="modes" value="observing + DEBRIEF MODE" />
            <SmallStat label="deploy" value="POST /agent/refresh" />
          </div>
        </div>
      </div>

      <Card title="Anthropic Managed Agents primitives we use">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
          {PRIMITIVES.map((p) => (
            <div key={p.name} style={{
              background: 'var(--cream)',
              border: '3px solid var(--line)',
              borderRadius: 14,
              padding: '12px 14px',
              boxShadow: '0 3px 0 var(--line)',
            }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--ink)' }}>{p.name}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', lineHeight: 1.45, marginTop: 4 }}>
                {p.role}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Two modes — same agent, two contexts">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
          {TWO_MODES.map((m) => (
            <div key={m.key} style={{
              background: m.bg,
              border: '3px solid var(--line)',
              borderRadius: 14,
              padding: 16,
              boxShadow: '0 3px 0 var(--line)',
            }}>
              <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>{m.title}</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5, fontWeight: 600, color: 'var(--ink)' }}>
                {m.bullets.map((b, i) => <li key={i} style={{ marginBottom: 4 }}>{b}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Custom tools (browser-rendered)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {TOOLS.map((t) => (
            <div key={t.name} style={{
              display: 'grid',
              gridTemplateColumns: '220px 80px 1fr',
              gap: 12,
              alignItems: 'center',
              background: 'var(--cream)',
              border: '2.5px solid var(--line)',
              borderRadius: 12,
              padding: '8px 12px',
            }}>
              <code style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink)' }}>{t.name}</code>
              <span style={{
                fontSize: 10,
                fontWeight: 900,
                textAlign: 'center',
                padding: '3px 8px',
                borderRadius: 999,
                background: t.perm === 'auto' ? 'var(--mint)' : 'var(--rose)',
                border: '2px solid var(--line)',
              }}>
                {t.perm.toUpperCase()}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', lineHeight: 1.4 }}>{t.desc}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Hard rules baked into the system prompt">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
          {HARD_RULES.map((r) => (
            <div key={r.title} style={{
              background: 'var(--butter)',
              border: '3px solid var(--line)',
              borderRadius: 14,
              padding: '12px 14px',
              boxShadow: '0 3px 0 var(--line)',
            }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--ink)' }}>{r.title}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', lineHeight: 1.45, marginTop: 4 }}>
                {r.body}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Skills composed around the agent (.claude/skills/*)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {SKILLS_AROUND.map((s) => (
            <div key={s.name} style={{
              display: 'grid',
              gridTemplateColumns: '220px 1fr',
              gap: 12,
              alignItems: 'center',
              background: 'var(--cream)',
              border: '2.5px solid var(--line)',
              borderRadius: 12,
              padding: '8px 12px',
            }}>
              <code style={{ fontSize: 12, fontWeight: 800 }}>/{s.name}</code>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', lineHeight: 1.4 }}>{s.role}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="How we deploy changes to the agent">
        <pre style={{
          margin: 0,
          background: 'var(--cream)',
          border: '2.5px solid var(--line)',
          borderRadius: 12,
          padding: 12,
          fontSize: 12,
          fontWeight: 700,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          fontFamily: 'monospace',
        }}>
{'# 1. edit MEDKIT_ATTENDING_SYSTEM_PROMPT or MEDKIT_CUSTOM_TOOLS in backend/server.py\n# 2. restart the FastAPI process (it caches the constants at import time)\n# 3. push to the platform — bumps agent version\ncurl -X POST http://127.0.0.1:8787/agent/refresh \\\n  -H "Origin: http://localhost:5173"'}
        </pre>
      </Card>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      gap: 12,
      background: 'var(--paper)',
      border: '2.5px solid var(--line)',
      borderRadius: 12,
      padding: '8px 12px',
    }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</span>
      <code style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink)' }}>{value}</code>
    </div>
  );
}
