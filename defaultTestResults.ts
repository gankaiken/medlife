import { useMemo, useState } from 'react';
import { TopBar } from './primitives';
import { store } from '../game/store';

// ── Agent topology — Opus 4.7 hub with live data-flow pulses ──────────
//
// Top-down map of the medkit-attending Managed Agent (Opus 4.7) and the
// sub-rules + sessions it orchestrates. Every link carries a continuous
// stream of SVG-animated pulses so the screen reads as "always on".
//
// Pure SVG + a tiny CSS keyframe block — no extra deps.

const VB_W = 1500;
const VB_H = 860;

const HUB = { cx: 750, cy: 430, r: 115 };

// Left + right column geometry
const LEFT_CX = 200;
const RIGHT_CX = 1300;
const CARD_W = 300;
const CARD_H = 130;
const ROW_YS = [190, 350, 510, 670];

interface NodeDetails {
  description: string;
  files?: string[];
  bullets?: string[];
  meta?: Array<{ label: string; value: string }>;
}

interface ChildNode {
  id: string;
  side: 'left' | 'right';
  title: string;
  subtitle: string;
  badge: string;
  color: string;
  deep: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  details: NodeDetails;
}

const HUB_DETAILS: NodeDetails = {
  description:
    'The Managed Agent that grades every encounter. Reads the trainee transcript plus tool-call logs, runs clinical reasoning passes, and emits a deterministic debrief payload the UI can render.',
  meta: [
    { label: 'Model', value: 'claude-opus-4-7' },
    { label: 'Hosted in', value: 'backend/server.py · /agent/* proxy' },
    { label: 'Output contract', value: 'render_case_evaluation tool call' },
  ],
  files: [
    'backend/server.py',
    'src/agents/managedAgent.ts',
    'src/agents/customTools.ts',
    'src/agents/eventStreamRenderer.tsx',
  ],
  bullets: [
    'Reasoning pass uses the case rubric as ground truth',
    'Citations must resolve in src/data/guidelines.ts',
    'Skills compose — no specialist sub-agents permitted',
  ],
};

// Sub-rules (left column) — what the agent MUST follow.
const SUB_RULES: ChildNode[] = [
  {
    id: 'rule-skills',
    side: 'left',
    title: 'Compose with skills',
    subtitle: 'no specialist sub-agents — skills only',
    badge: 'POLICY',
    color: 'var(--butter)',
    deep: 'var(--butter-deep)',
    cx: LEFT_CX,
    cy: ROW_YS[0],
    w: CARD_W,
    h: CARD_H,
    details: {
      description:
        'CLAUDE.md forbids specialist sub-agents like triage-expert or pharmacology-expert. The Managed Agent composes behaviour from skills under .claude/skills/ instead, keeping the topology flat and inspectable.',
      files: ['CLAUDE.md', '.claude/skills/'],
      bullets: [
        'Skills are markdown procedures the agent loads on demand',
        'New behaviour ships as a skill, not a new agent',
        'Hard rules live as hooks in settings.json, not in prompts',
      ],
    },
  },
  {
    id: 'rule-debrief',
    side: 'left',
    title: 'Debrief mode',
    subtitle: 'render_case_evaluation payload',
    badge: 'CONTRACT',
    color: 'var(--sky)',
    deep: 'var(--sky-deep)',
    cx: LEFT_CX,
    cy: ROW_YS[1],
    w: CARD_W,
    h: CARD_H,
    details: {
      description:
        'Final agent output is a structured render_case_evaluation tool call. The UI renders the JSON deterministically — domain scores, criteria, citations — so the trainee always sees the same shape.',
      files: [
        'src/agents/eventStreamRenderer.tsx',
        'src/agents/customTools.ts',
        'src/components/DebriefScreen.tsx',
      ],
      bullets: [
        'domain_scores: { data_gathering, clinical_management, interpersonal }',
        'Each criterion carries a guideline_ref → renders as a citation chip',
        'Verdict ∈ excellent · good · satisfactory · borderline · clear-fail',
      ],
    },
  },
  {
    id: 'rule-cite',
    side: 'left',
    title: 'Cite, don\'t invent',
    subtitle: 'guideline_ref must resolve in guidelines.ts',
    badge: 'HARD RULE',
    color: 'var(--peach)',
    deep: 'var(--peach-deep)',
    cx: LEFT_CX,
    cy: ROW_YS[2],
    w: CARD_W,
    h: CARD_H,
    details: {
      description:
        'Every clinical_management criterion in a CaseRubric must point at a recommendation that exists in src/data/guidelines.ts. Unresolved citations refuse to render in the UI — surfacing fabricated guidance immediately.',
      files: ['src/data/guidelines.ts', 'src/data/polyclinicPatients.ts'],
      bullets: [
        'guideline_ref shape: { source, recommendationId }',
        'Unknown ids → citation chip degrades to "unresolved" state',
        'Curator skill keeps guidelines.ts fresh from society sources',
      ],
    },
  },
  {
    id: 'rule-rubric',
    side: 'left',
    title: 'PLAB2 · RCGP · NURSE · SEGUE',
    subtitle: 'four-framework rubric scoring per case',
    badge: 'FRAMEWORK',
    color: 'var(--mint)',
    deep: 'var(--mint-deep)',
    cx: LEFT_CX,
    cy: ROW_YS[3],
    w: CARD_W,
    h: CARD_H,
    details: {
      description:
        'Each rubric criterion is tagged with one of four frameworks so the debrief can roll up scores by competency model. Hero cases must use hand-authored rubrics; the rest fall back to an auto-derived rubric.',
      files: ['src/data/polyclinicPatients.ts', '.claude/skills/medkit-rubric-author/'],
      bullets: [
        'PLAB2 — UK clinical exam rubric',
        'RCGP — Royal College of GPs assessment',
        'NURSE — empathic communication acronym',
        'SEGUE — patient-centred consultation framework',
      ],
    },
  },
];

// Sessions (right column) — what the agent is currently routing through.
const SESSIONS: ChildNode[] = [
  {
    id: 'sess-attending',
    side: 'right',
    title: 'medkit-attending · grading',
    subtitle: 'Opus 4.7 · clinical reasoning passes',
    badge: 'SESSION',
    color: 'var(--peach)',
    deep: 'var(--peach-deep)',
    cx: RIGHT_CX,
    cy: ROW_YS[0],
    w: CARD_W,
    h: CARD_H,
    details: {
      description:
        'The live grading session. The encounter transcript and tool-call log stream into the Managed Agent, which reasons over the rubric and emits a debrief payload back to the browser.',
      meta: [
        { label: 'Model', value: 'claude-opus-4-7' },
        { label: 'Transport', value: 'POST /agent/* via FastAPI' },
      ],
      files: ['backend/server.py', 'src/agents/managedAgent.ts'],
      bullets: [
        'Streamed event log renders progressively in the debrief screen',
        'Tool calls intercepted client-side via customTools.ts',
        'Final render_case_evaluation closes the session',
      ],
    },
  },
  {
    id: 'sess-rubric',
    side: 'right',
    title: 'medkit-rubric-author',
    subtitle: 'CaseRubric authoring · polyclinic',
    badge: 'SKILL',
    color: 'var(--mint)',
    deep: 'var(--mint-deep)',
    cx: RIGHT_CX,
    cy: ROW_YS[1],
    w: CARD_W,
    h: CARD_H,
    details: {
      description:
        'Authors a hand-crafted CaseRubric for a polyclinic case so it can graduate from the auto-derived fallback to hero-grade scoring. Output is an in-place edit of polyclinicPatients.ts adding a rubric: { ... } field.',
      meta: [{ label: 'Path', value: '.claude/skills/medkit-rubric-author/' }],
      files: ['src/data/polyclinicPatients.ts', 'src/data/guidelines.ts'],
      bullets: [
        'Tags every criterion with PLAB2 / RCGP / NURSE / SEGUE',
        'guideline_ref must resolve in guidelines.ts — cite, don\'t invent',
        'Triggered when a hero case lacks a rubric',
      ],
    },
  },
  {
    id: 'sess-curator',
    side: 'right',
    title: 'medkit-guideline-curator',
    subtitle: 'WebFetch refresh of guidelines.ts',
    badge: 'SKILL · LOOP',
    color: 'var(--sky)',
    deep: 'var(--sky-deep)',
    cx: RIGHT_CX,
    cy: ROW_YS[2],
    w: CARD_W,
    h: CARD_H,
    details: {
      description:
        'Walks authoritative society sources via WebFetch and refreshes entries in guidelines.ts. Output is always verificationStatus: "auto-fetched" — a clinician must hand-flip it to "verified" before it counts for grading.',
      meta: [
        { label: 'Path', value: '.claude/skills/medkit-guideline-curator/' },
        { label: 'Schedule', value: '/loop 7d' },
      ],
      files: ['src/data/guidelines.ts'],
      bullets: [
        'Adds new conditions when a hero rubric needs a missing citation',
        'Re-checks existing entries for newer guideline versions',
        'Never auto-promotes status — clinician sign-off required',
      ],
    },
  },
  {
    id: 'sess-verify',
    side: 'right',
    title: 'medkit-verify-simulation',
    subtitle: 'deterministic invariants → verify.log',
    badge: 'SKILL · LOOP',
    color: 'var(--rose)',
    deep: 'var(--rose-deep)',
    cx: RIGHT_CX,
    cy: ROW_YS[3],
    w: CARD_W,
    h: CARD_H,
    details: {
      description:
        'Runs deterministic invariant checks on src/data/* — patient cases, tests, treatments, medications — and appends a PASS/FAIL line to verify.log. Catches drift between data files and game-state expectations.',
      meta: [
        { label: 'Path', value: '.claude/skills/medkit-verify-simulation/' },
        { label: 'Schedule', value: '/loop 20m' },
        { label: 'Command', value: 'npm run verify' },
      ],
      files: ['scripts/verify/run-all.ts', 'verify.log'],
      bullets: [
        'No mocks — runs against real data files',
        'Run after every data/type/store edit',
        'Failure aborts the loop, surfaces in chat',
      ],
    },
  },
];

const CHILDREN = [...SUB_RULES, ...SESSIONS];

// Cubic bezier from hub side → child node inner side
function buildPath(target: ChildNode): string {
  // Hub edge facing target
  const sx = HUB.cx + (target.side === 'left' ? -HUB.r * 0.92 : HUB.r * 0.92);
  const sy = HUB.cy;
  // Target inner edge (right side of left cards, left side of right cards)
  const tx = target.cx + (target.side === 'left' ? target.w / 2 : -target.w / 2);
  const ty = target.cy;

  // Control points: pull horizontally away from each end so curve is smooth
  const dx = (sx - tx) * 0.5;
  const c1x = sx - dx;
  const c1y = sy;
  const c2x = tx + dx;
  const c2y = ty;

  return `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tx} ${ty}`;
}

interface PulseParams {
  pathId: string;
  delay: number;
  duration: number;
  color: string;
  size?: number;
}

function Pulse({ pathId, delay, duration, color, size = 7 }: PulseParams) {
  return (
    <circle r={size} fill={color} opacity={0.95}>
      <animateMotion
        dur={`${duration}s`}
        begin={`${delay}s`}
        repeatCount="indefinite"
        rotate="auto"
      >
        <mpath href={`#${pathId}`} />
      </animateMotion>
      <animate
        attributeName="opacity"
        values="0;1;1;0"
        keyTimes="0;0.08;0.92;1"
        dur={`${duration}s`}
        begin={`${delay}s`}
        repeatCount="indefinite"
      />
      <animate
        attributeName="r"
        values={`${size * 0.5};${size};${size};${size * 0.4}`}
        keyTimes="0;0.2;0.8;1"
        dur={`${duration}s`}
        begin={`${delay}s`}
        repeatCount="indefinite"
      />
    </circle>
  );
}

interface NodeCardProps {
  node: ChildNode;
  onSelect: (id: string) => void;
}

function NodeCard({ node, onSelect }: NodeCardProps) {
  const x = node.cx - node.w / 2;
  const y = node.cy - node.h / 2;
  return (
    <g
      style={{ cursor: 'pointer' }}
      onClick={() => onSelect(node.id)}
    >
      {/* drop shadow */}
      <rect
        x={x + 4}
        y={y + 6}
        width={node.w}
        height={node.h}
        rx={20}
        fill="var(--line)"
        opacity={0.18}
      />
      <rect
        x={x}
        y={y}
        width={node.w}
        height={node.h}
        rx={20}
        fill={node.color}
        stroke="var(--line)"
        strokeWidth={3}
      />
      {/* badge */}
      <g transform={`translate(${x + 16}, ${y + 16})`}>
        <rect
          width={110}
          height={22}
          rx={11}
          fill="white"
          stroke="var(--line)"
          strokeWidth={2}
        />
        <text
          x={55}
          y={15}
          textAnchor="middle"
          fontSize={10}
          fontWeight={900}
          fill="var(--ink)"
          fontFamily="Nunito, sans-serif"
          letterSpacing="0.08em"
        >
          {node.badge}
        </text>
      </g>
      {(() => {
        // Roughly 12px per char at fontSize 20 weight 900 Nunito.
        const maxTextW = node.w - 36;
        const estW = node.title.length * 12;
        const overflow = estW > maxTextW;
        return (
          <text
            x={x + 18}
            y={y + 68}
            fontSize={overflow ? 17 : 20}
            fontWeight={900}
            fill="var(--ink)"
            fontFamily="Nunito, sans-serif"
            {...(overflow
              ? { textLength: maxTextW, lengthAdjust: 'spacingAndGlyphs' }
              : {})}
          >
            {node.title}
          </text>
        );
      })()}
      <text
        x={x + 18}
        y={y + 96}
        fontSize={13}
        fontWeight={600}
        fill="var(--ink-2)"
        fontFamily="Nunito, sans-serif"
      >
        {node.subtitle}
      </text>
      {/* tiny live dot */}
      <circle
        cx={x + node.w - 22}
        cy={y + 26}
        r={6}
        fill={node.deep}
        stroke="var(--line)"
        strokeWidth={2}
      >
        <animate
          attributeName="opacity"
          values="0.3;1;0.3"
          dur="1.6s"
          repeatCount="indefinite"
        />
      </circle>
    </g>
  );
}

export function AgentTopologyScreen() {
  const paths = useMemo(
    () =>
      CHILDREN.map((c) => ({
        id: `path-${c.id}`,
        node: c,
        d: buildPath(c),
      })),
    [],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => {
    if (!selectedId) return null;
    if (selectedId === 'hub') {
      return {
        title: 'Opus 4.7 — medkit-attending Managed Agent',
        badge: 'MANAGED AGENT',
        color: 'var(--peach)',
        deep: 'var(--peach-deep)',
        details: HUB_DETAILS,
      };
    }
    const c = CHILDREN.find((n) => n.id === selectedId);
    return c
      ? {
          title: c.title,
          badge: c.badge,
          color: c.color,
          deep: c.deep,
          details: c.details,
        }
      : null;
  }, [selectedId]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        background:
          'radial-gradient(circle at 50% 20%, var(--cream) 0%, var(--cream-2) 70%)',
      }}
    >
      <TopBar steps={['Home', 'Agent topology']} here={1} />

      <style>{`
        @keyframes hub-spin { to { transform: rotate(360deg); } }
        @keyframes hub-aura {
          0%   { r: 130; opacity: 0.45; }
          100% { r: 220; opacity: 0; }
        }
        @keyframes hub-aura-2 {
          0%   { r: 130; opacity: 0.35; }
          100% { r: 260; opacity: 0; }
        }
        @keyframes hub-pulse-scale {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.04); }
        }
        @keyframes link-flow {
          to { stroke-dashoffset: -28; }
        }
      `}</style>

      <div style={{ padding: '20px 28px 8px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 16,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: '0.12em',
                color: 'var(--ink-2)',
                textTransform: 'uppercase',
              }}
            >
              Live · agent topology
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--ink)' }}>
              Opus 4.7 — medkit-attending Managed Agent
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-2)', marginTop: 4 }}>
              Sub-rules feed in from the left · sessions stream out to the right · pulses are real
              tokens of work in flight.
            </div>
          </div>
          <button
            type="button"
            className="btn-plush ghost"
            style={{ fontSize: 13, padding: '10px 14px' }}
            onClick={() => store.setScreen('home')}
          >
            ← Home
          </button>
        </div>
      </div>

      <div style={{ flex: 1, padding: '8px 24px 24px' }}>
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          width="100%"
          style={{
            display: 'block',
            maxHeight: 'calc(100vh - 200px)',
            margin: '0 auto',
            background:
              'repeating-linear-gradient(0deg, transparent 0 38px, rgba(43,30,22,0.04) 38px 39px),' +
              'repeating-linear-gradient(90deg, transparent 0 38px, rgba(43,30,22,0.04) 38px 39px)',
            borderRadius: 24,
            border: '3px solid var(--line)',
            boxShadow: 'var(--plush-sm)',
          }}
        >
          <defs>
            <radialGradient id="hub-grad" cx="50%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#FFE7B5" />
              <stop offset="55%" stopColor="var(--peach)" />
              <stop offset="100%" stopColor="var(--peach-deep)" />
            </radialGradient>
            <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {paths.map((p) => (
              <path key={p.id} id={p.id} d={p.d} />
            ))}
          </defs>

          {/* ── visible link strokes (dashed flow) ── */}
          {paths.map((p) => (
            <g key={`link-${p.id}`}>
              {/* base dim track */}
              <use
                href={`#${p.id}`}
                fill="none"
                stroke="var(--line)"
                strokeWidth={2.5}
                strokeOpacity={0.35}
              />
              {/* moving dashed flow on top */}
              <use
                href={`#${p.id}`}
                fill="none"
                stroke={p.node.deep}
                strokeWidth={3}
                strokeDasharray="4 10"
                strokeLinecap="round"
                style={{
                  animation: `link-flow 1.6s linear infinite`,
                }}
              />
            </g>
          ))}

          {/* ── pulses travelling each link ── */}
          {paths.map((p) => {
            const dur = 2.6;
            return (
              <g key={`pulses-${p.id}`}>
                <Pulse pathId={p.id} delay={0} duration={dur} color={p.node.deep} size={9} />
                <Pulse
                  pathId={p.id}
                  delay={dur / 3}
                  duration={dur}
                  color={p.node.deep}
                  size={7}
                />
                <Pulse
                  pathId={p.id}
                  delay={(2 * dur) / 3}
                  duration={dur}
                  color="white"
                  size={5}
                />
              </g>
            );
          })}

          {/* ── child node cards ── */}
          {CHILDREN.map((c) => (
            <NodeCard key={c.id} node={c} onSelect={setSelectedId} />
          ))}

          {/* ── HUB: Opus 4.7 ── */}
          <g
            style={{
              transformOrigin: `${HUB.cx}px ${HUB.cy}px`,
              animation: 'hub-pulse-scale 3.2s ease-in-out infinite',
              cursor: 'pointer',
            }}
            onClick={() => setSelectedId('hub')}
          >
            {/* expanding auras */}
            <circle
              cx={HUB.cx}
              cy={HUB.cy}
              fill="none"
              stroke="var(--peach-deep)"
              strokeWidth={3}
              style={{ animation: 'hub-aura 2.4s ease-out infinite' }}
            />
            <circle
              cx={HUB.cx}
              cy={HUB.cy}
              fill="none"
              stroke="var(--peach)"
              strokeWidth={2.5}
              style={{ animation: 'hub-aura-2 2.4s ease-out infinite', animationDelay: '0.8s' }}
            />
            <circle
              cx={HUB.cx}
              cy={HUB.cy}
              fill="none"
              stroke="var(--butter-deep)"
              strokeWidth={2}
              style={{ animation: 'hub-aura 2.4s ease-out infinite', animationDelay: '1.6s' }}
            />

            {/* outer rotating ring with ticks */}
            <g
              style={{
                transformOrigin: `${HUB.cx}px ${HUB.cy}px`,
                animation: 'hub-spin 14s linear infinite',
              }}
            >
              <circle
                cx={HUB.cx}
                cy={HUB.cy}
                r={HUB.r + 22}
                fill="none"
                stroke="var(--line)"
                strokeWidth={2}
                strokeDasharray="2 10"
              />
              {Array.from({ length: 12 }).map((_, i) => {
                const a = (i / 12) * Math.PI * 2;
                const r1 = HUB.r + 14;
                const r2 = HUB.r + 30;
                return (
                  <line
                    key={i}
                    x1={HUB.cx + Math.cos(a) * r1}
                    y1={HUB.cy + Math.sin(a) * r1}
                    x2={HUB.cx + Math.cos(a) * r2}
                    y2={HUB.cy + Math.sin(a) * r2}
                    stroke="var(--line)"
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                );
              })}
            </g>

            {/* drop shadow */}
            <circle
              cx={HUB.cx + 4}
              cy={HUB.cy + 8}
              r={HUB.r}
              fill="var(--line)"
              opacity={0.22}
            />
            {/* core */}
            <circle
              cx={HUB.cx}
              cy={HUB.cy}
              r={HUB.r}
              fill="url(#hub-grad)"
              stroke="var(--line)"
              strokeWidth={4}
              filter="url(#soft-glow)"
            />
            {/* inner highlight */}
            <ellipse
              cx={HUB.cx - 30}
              cy={HUB.cy - 38}
              rx={42}
              ry={22}
              fill="white"
              opacity={0.45}
            />
            {/* label */}
            <text
              x={HUB.cx}
              y={HUB.cy - 18}
              textAnchor="middle"
              fontSize={14}
              fontWeight={900}
              fontFamily="Nunito, sans-serif"
              fill="var(--ink)"
              letterSpacing="0.18em"
            >
              MANAGED AGENT
            </text>
            <text
              x={HUB.cx}
              y={HUB.cy + 14}
              textAnchor="middle"
              fontSize={36}
              fontWeight={900}
              fontFamily="Nunito, sans-serif"
              fill="var(--ink)"
            >
              Opus 4.7
            </text>
            <text
              x={HUB.cx}
              y={HUB.cy + 40}
              textAnchor="middle"
              fontSize={13}
              fontWeight={700}
              fontFamily="Nunito, sans-serif"
              fill="var(--ink-2)"
            >
              medkit-attending
            </text>
          </g>

          {/* ── column titles ── */}
          <g>
            <rect
              x={LEFT_CX - 90}
              y={70}
              width={180}
              height={32}
              rx={16}
              fill="white"
              stroke="var(--line)"
              strokeWidth={2.5}
            />
            <text
              x={LEFT_CX}
              y={92}
              textAnchor="middle"
              fontSize={13}
              fontWeight={900}
              fontFamily="Nunito, sans-serif"
              fill="var(--ink)"
              letterSpacing="0.14em"
            >
              SUB-RULES
            </text>

            <rect
              x={RIGHT_CX - 90}
              y={70}
              width={180}
              height={32}
              rx={16}
              fill="white"
              stroke="var(--line)"
              strokeWidth={2.5}
            />
            <text
              x={RIGHT_CX}
              y={92}
              textAnchor="middle"
              fontSize={13}
              fontWeight={900}
              fontFamily="Nunito, sans-serif"
              fill="var(--ink)"
              letterSpacing="0.14em"
            >
              SESSIONS
            </text>
          </g>

          {/* ── footer counters ── */}
          <g transform={`translate(${VB_W / 2 - 280}, ${VB_H - 60})`}>
            <rect
              width={560}
              height={48}
              rx={24}
              fill="white"
              stroke="var(--line)"
              strokeWidth={3}
            />
            <text
              x={140}
              y={30}
              textAnchor="middle"
              fontSize={14}
              fontWeight={800}
              fontFamily="Nunito, sans-serif"
              fill="var(--ink)"
            >
              {SUB_RULES.length} sub-rules enforced
            </text>
            <line x1={280} y1={10} x2={280} y2={38} stroke="var(--line)" strokeWidth={2} />
            <text
              x={420}
              y={30}
              textAnchor="middle"
              fontSize={14}
              fontWeight={800}
              fontFamily="Nunito, sans-serif"
              fill="var(--ink)"
            >
              {SESSIONS.length} sessions in flight
            </text>
            <circle cx={28} cy={24} r={8} fill="var(--mint-deep)">
              <animate attributeName="opacity" values="0.3;1;0.3" dur="1.4s" repeatCount="indefinite" />
            </circle>
            <circle cx={532} cy={24} r={8} fill="var(--peach-deep)">
              <animate attributeName="opacity" values="0.3;1;0.3" dur="1.4s" repeatCount="indefinite" />
            </circle>
          </g>
        </svg>
      </div>

      {selected && (
        <div
          onClick={() => setSelectedId(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(43, 30, 22, 0.32)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: 24,
            animation: 'fade-in 160ms ease-out',
          }}
        >
          <style>{`
            @keyframes fade-in { from { opacity: 0 } to { opacity: 1 } }
            @keyframes pop-in { from { transform: translateY(8px) scale(0.97); opacity: 0 } to { transform: none; opacity: 1 } }
          `}</style>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              border: '4px solid var(--line)',
              borderRadius: 24,
              boxShadow: 'var(--plush)',
              maxWidth: 620,
              width: '100%',
              maxHeight: '88vh',
              overflowY: 'auto',
              animation: 'pop-in 200ms ease-out',
            }}
          >
            <div
              style={{
                background: selected.color,
                padding: '18px 22px',
                borderBottom: '3px solid var(--line)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div>
                <div
                  style={{
                    display: 'inline-block',
                    background: 'white',
                    border: '2.5px solid var(--line)',
                    borderRadius: 11,
                    padding: '4px 12px',
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: '0.08em',
                    color: 'var(--ink)',
                  }}
                >
                  {selected.badge}
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--ink)', marginTop: 8 }}>
                  {selected.title}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Close"
                style={{
                  flexShrink: 0,
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  border: '3px solid var(--line)',
                  background: 'white',
                  cursor: 'pointer',
                  fontWeight: 900,
                  fontSize: 16,
                  color: 'var(--ink)',
                  boxShadow: 'var(--plush-tiny)',
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: '20px 22px 22px' }}>
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.5,
                  color: 'var(--ink)',
                  margin: 0,
                  fontWeight: 600,
                }}
              >
                {selected.details.description}
              </p>

              {selected.details.meta && selected.details.meta.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  {selected.details.meta.map((m) => (
                    <div
                      key={m.label}
                      style={{
                        display: 'flex',
                        gap: 12,
                        padding: '6px 0',
                        borderBottom: '1.5px dashed var(--line)',
                        fontSize: 13,
                      }}
                    >
                      <span
                        style={{
                          minWidth: 90,
                          fontWeight: 800,
                          color: 'var(--ink-2)',
                          textTransform: 'uppercase',
                          fontSize: 11,
                          letterSpacing: '0.06em',
                          paddingTop: 2,
                        }}
                      >
                        {m.label}
                      </span>
                      <span style={{ fontWeight: 700, color: 'var(--ink)', fontFamily: 'monospace' }}>
                        {m.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {selected.details.bullets && selected.details.bullets.length > 0 && (
                <ul
                  style={{
                    margin: '18px 0 0',
                    padding: 0,
                    listStyle: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {selected.details.bullets.map((b, i) => (
                    <li
                      key={i}
                      style={{
                        display: 'flex',
                        gap: 10,
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--ink)',
                        lineHeight: 1.45,
                      }}
                    >
                      <span
                        style={{
                          flexShrink: 0,
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          background: selected.deep,
                          marginTop: 6,
                        }}
                      />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}

              {selected.details.files && selected.details.files.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 900,
                      letterSpacing: '0.08em',
                      color: 'var(--ink-2)',
                      textTransform: 'uppercase',
                      marginBottom: 8,
                    }}
                  >
                    Files
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {selected.details.files.map((f) => (
                      <code
                        key={f}
                        style={{
                          fontSize: 12,
                          fontFamily: 'ui-monospace, monospace',
                          background: 'var(--cream-2)',
                          border: '2px solid var(--line)',
                          borderRadius: 8,
                          padding: '4px 8px',
                          fontWeight: 700,
                          color: 'var(--ink)',
                        }}
                      >
                        {f}
                      </code>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
