import { useMemo, useState } from 'react';
import { TopBar } from './primitives';
import { store } from '../game/store';
import { GUIDELINES } from '../data/guidelines';
import { POLYCLINIC_CASES } from '../data/polyclinicPatients';
import { PATIENT_CASES } from '../data/patients';

type TabKey = 'grading' | 'cases' | 'service';

interface InfoCard {
  title: string;
  subtitle: string;
  tone: string;
  bullets: string[];
}

function countCases() {
  let polyclinic = 0;
  let withRubric = 0;

  for (const [specialty, cases] of Object.entries(POLYCLINIC_CASES) as Array<[string, typeof PATIENT_CASES]>) {
    if (specialty === 'all-specialties') continue;
    for (const item of cases) {
      polyclinic += 1;
      if (item.rubric) withRubric += 1;
    }
  }

  for (const item of PATIENT_CASES) {
    if (item.rubric) withRubric += 1;
  }

  return {
    total: polyclinic + PATIENT_CASES.length,
    withRubric,
    fallback: polyclinic + PATIENT_CASES.length - withRubric,
  };
}

const CASE_STATS = countCases();
const RECOMMENDATION_COUNT = GUIDELINES.reduce((sum, guideline) => sum + guideline.recommendations.length, 0);

const TABS: Array<{ key: TabKey; label: string; sub: string }> = [
  { key: 'grading', label: 'Grading flow', sub: 'How the shipped learner flow becomes an assessment' },
  { key: 'cases', label: 'Cases', sub: 'How Medlife cases and citations are structured' },
  { key: 'service', label: 'AI debrief', sub: 'What the optional backend service does, and what it does not do' },
];

const GRADING_CARDS: InfoCard[] = [
  {
    title: '1. Guided encounter',
    subtitle: 'Current learner product',
    tone: 'var(--mint)',
    bullets: [
      'Learners move through the guided browser flow rather than a freeform live AI patient chat.',
      'Encounter actions, tests, prescriptions, and diagnosis choices are recorded locally.',
      'The debrief can still complete even if the backend is offline.',
    ],
  },
  {
    title: '2. Debrief request builder',
    subtitle: 'Frontend contract layer',
    tone: 'var(--butter)',
    bullets: [
      'The frontend assembles a structured encounter payload with rubric context and guideline slices.',
      'Encounter IDs make retries and saved history records deterministic.',
      'Only the relevant registry slice is forwarded for grading.',
    ],
  },
  {
    title: '3. Assessment result',
    subtitle: 'AI when available, rule-based when not',
    tone: 'var(--peach)',
    bullets: [
      'If runtime capabilities allow, Medlife requests an AI debrief from the backend.',
      'If the AI path is unavailable, the learner gets a local rule-based assessment instead.',
      'Both paths render back into the same debrief-oriented UI shape for the learner.',
    ],
  },
];

const CASE_CARDS: InfoCard[] = [
  {
    title: 'Case catalogue',
    subtitle: `${CASE_STATS.total} total cases`,
    tone: 'var(--sky)',
    bullets: [
      `${CASE_STATS.withRubric} cases have authored rubrics.`,
      `${CASE_STATS.fallback} cases rely on auto-derived fallback grading.`,
      'Cases are synthetic educational simulations, not real patient records.',
    ],
  },
  {
    title: 'Guideline registry',
    subtitle: `${GUIDELINES.length} guideline sources / ${RECOMMENDATION_COUNT} recommendations`,
    tone: 'var(--mint)',
    bullets: [
      'Citations come from the registry rather than model improvisation.',
      'Case rubrics point to recommendation IDs the frontend can resolve.',
      'Unresolved citation references should degrade safely instead of claiming certainty.',
    ],
  },
  {
    title: 'Authoring model',
    subtitle: 'Human-authored plus scripted verification',
    tone: 'var(--cream)',
    bullets: [
      'Cases, rubrics, and guidelines are stored as repository data files.',
      'Verification scripts and parity tests protect the contract around grading behavior.',
      'Architecture skills and docs may describe future automation, but learner truth is defined by the shipped runtime.',
    ],
  },
];

const SERVICE_CARDS: InfoCard[] = [
  {
    title: 'Optional AI debrief service',
    subtitle: 'Backend capability, not the baseline product',
    tone: 'var(--peach)',
    bullets: [
      'The backend can call a provider-backed debrief service when configured.',
      'This service grades completed encounters; it is not the learner-facing consultation UI.',
      'Guided flow remains the primary product and still works without this service.',
    ],
  },
  {
    title: 'Voice architecture boundary',
    subtitle: 'Planned or experimental work',
    tone: 'var(--rose)',
    bullets: [
      'Voice files and token endpoints document experimentation and future integration points.',
      'Learner-facing live voice is not part of the current shipped guided browser flow.',
      'Runtime labels only advertise live voice when backend and frontend support it together.',
    ],
  },
  {
    title: 'Demo helpers',
    subtitle: 'Support systems around the product',
    tone: 'var(--butter)',
      bullets: [
        'Demo EHR and triage endpoints are educational helpers, not a production health platform.',
        'Learner accounts and server-backed encounter history now exist alongside signed-out local mode.',
        'Architecture notes should always separate demo helpers from guaranteed student-facing capabilities.',
      ],
  },
];

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="plush" style={{ background: 'var(--paper)', padding: 14 }}>
      <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.08em', color: 'var(--ink-2)', marginTop: 6 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginTop: 6, lineHeight: 1.45 }}>{sub}</div>
    </div>
  );
}

function Card({ card }: { card: InfoCard }) {
  return (
    <div
      className="plush"
      style={{
        background: card.tone,
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div>
        <h3 style={{ margin: 0, fontSize: 22, lineHeight: 1.1 }}>{card.title}</h3>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', marginTop: 4 }}>{card.subtitle}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {card.bullets.map((bullet) => (
          <div key={bullet} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: 'var(--ink)',
                flexShrink: 0,
                marginTop: 6,
              }}
            />
            <span style={{ fontSize: 13, lineHeight: 1.45, fontWeight: 600 }}>{bullet}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderTab(tab: TabKey) {
  if (tab === 'grading') {
    return GRADING_CARDS.map((card) => <Card key={card.title} card={card} />);
  }

  if (tab === 'cases') {
    return CASE_CARDS.map((card) => <Card key={card.title} card={card} />);
  }

  return SERVICE_CARDS.map((card) => <Card key={card.title} card={card} />);
}

export function AgenticRoundsScreen() {
  const [tab, setTab] = useState<TabKey>('grading');
  const activeTab = useMemo(() => TABS.find((item) => item.key === tab) ?? TABS[0], [tab]);

  return (
    <div className="screen paper" style={{ overflowY: 'auto' }}>
      <TopBar
        here={6}
        steps={['Polyclinic', 'GP', 'Case', 'Brief', 'Encounter', 'Debrief', 'Architecture']}
      />

      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '24px 24px 60px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <section
          className="plush-lg"
          style={{
            background: 'linear-gradient(135deg, #fff8ef, #fff3df)',
            padding: 24,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 18,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 860 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div className="chip butter" style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.08em' }}>
                ARCHITECTURE VIEW
              </div>
              <div className="chip" style={{ background: 'white', fontSize: 12 }}>
                {CASE_STATS.total} cases · {CASE_STATS.withRubric} authored rubrics · {GUIDELINES.length} guideline sets
              </div>
            </div>

            <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.05 }}>{activeTab.sub}</h1>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, fontWeight: 600, color: 'var(--ink)' }}>
              This screen mixes shipped learner flow, optional backend features, and target-state architecture notes. It is a product map, not a claim that every service shown is currently live in the student experience.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span className="chip" style={{ background: 'white' }}>Guided flow first</span>
              <span className="chip" style={{ background: 'white' }}>AI debrief optional</span>
              <span className="chip" style={{ background: 'white' }}>Voice still planned/experimental</span>
            </div>
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
            Back
          </button>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <Stat label="Learner flow" value="Guided" sub="The current website experience is a guided consultation simulator." />
          <Stat label="Debrief path" value="Optional AI" sub="Backend AI grading is additive, not required for the product to work." />
          <Stat label="Fallback" value="Rule-based" sub="Local assessment remains available when the backend or provider is unavailable." />
          <Stat label="Voice" value="Not shipped" sub="Learner-facing live voice is not part of the current guided browser flow." />
        </section>

        <section style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }} role="tablist">
          {TABS.map((item) => {
            const active = item.key === tab;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                className="tap"
                onClick={() => setTab(item.key)}
                style={{
                  background: active ? 'var(--butter)' : 'var(--paper)',
                  border: '3px solid var(--line)',
                  borderRadius: 14,
                  padding: '10px 14px',
                  minWidth: 190,
                  textAlign: 'left',
                  boxShadow: active ? '0 4px 0 var(--line)' : '0 2px 0 var(--line)',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--ink)' }}>{item.label}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginTop: 4 }}>{item.sub}</div>
              </button>
            );
          })}
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {renderTab(tab)}
        </section>

        <section
          className="plush"
          style={{
            background: 'var(--paper)',
            padding: 20,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 14,
          }}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.08em', color: 'var(--ink-2)' }}>RUNTIME TRUTH</div>
            <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5, fontWeight: 600 }}>
              Home and debrief labels should reflect actual runtime capabilities rather than architecture intent.
            </p>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.08em', color: 'var(--ink-2)' }}>PRODUCT TRUTH</div>
            <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5, fontWeight: 600 }}>
              Guided flow, AI debrief, demo EHR, and voice experimentation are separate layers and should be described separately.
            </p>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.08em', color: 'var(--ink-2)' }}>SAFETY TRUTH</div>
            <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5, fontWeight: 600 }}>
              Medlife remains a synthetic educational simulator and not a real clinical decision system.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
