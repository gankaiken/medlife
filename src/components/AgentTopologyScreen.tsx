import { TopBar } from './primitives';
import { store } from '../game/store';

interface TopologyCard {
  title: string;
  subtitle: string;
  badge: string;
  tone: string;
  description: string;
  bullets: string[];
  files: string[];
}

const LEFT_COLUMN: TopologyCard[] = [
  {
    title: 'Guided learner flow',
    subtitle: 'What students use today',
    badge: 'SHIPPED',
    tone: 'var(--mint)',
    description:
      'The active learner experience is a guided browser flow: onboarding, case selection, encounter, examination overlay, diagnosis, and debrief.',
    bullets: [
      'Works without the backend',
      'Uses local state and saved history',
      'Falls back safely to rule-based assessment',
    ],
    files: ['src/components/HomeScreen.tsx', 'src/components/EncounterScreen.tsx', 'src/components/DebriefScreen.tsx'],
  },
  {
    title: 'Rubric and guideline rules',
    subtitle: 'What keeps grading bounded',
    badge: 'CONTRACT',
    tone: 'var(--butter)',
    description:
      'Debrief output is constrained by case rubrics and the guideline registry. Unsupported citations should be dropped instead of invented.',
    bullets: [
      'Case rubric defines scoring criteria',
      'Guideline registry provides citation allowlist',
      'Frontend renders structured debrief data deterministically',
    ],
    files: ['src/data/guidelines.ts', 'src/data/polyclinicPatients.ts', 'src/agents/customTools.ts'],
  },
  {
    title: 'History and persistence',
    subtitle: 'Current storage boundary',
    badge: 'HYBRID',
    tone: 'var(--sky)',
    description:
      'Authenticated learners now save encounters, assessments, and progress on the backend, while localStorage remains a clearly labelled offline cache and migration source.',
    bullets: [
      'Encounter IDs make retries idempotent',
      'Pending-sync and recovery state are surfaced in the UI',
      'Signed-out local mode stays distinct from account-backed history',
    ],
    files: ['src/data/evalHistory.ts', 'src/components/HistoryScreen.tsx'],
  },
];

const RIGHT_COLUMN: TopologyCard[] = [
  {
    title: 'AI debrief service',
    subtitle: 'Optional backend runtime',
    badge: 'OPTIONAL',
    tone: 'var(--peach)',
    description:
      'When the backend and provider are configured, Medlife can request an AI debrief for a completed encounter. If that path is unavailable, the learner still receives a local rule-based assessment.',
    bullets: [
      'Backed by runtime capability checks',
      'Consumes structured encounter payloads',
      'Does not block the guided learner flow',
    ],
    files: ['backend/server.py', 'src/agents/debriefApi.ts', 'src/agents/useAttendingDebrief.ts'],
  },
  {
    title: 'Demo EHR and triage helpers',
    subtitle: 'Backend extras, not core learner path',
    badge: 'DEMO',
    tone: 'var(--rose)',
    description:
      'The repository includes backend routes for demo EHR lookups and triage classification. These are support capabilities, not proof of a production clinical system.',
    bullets: [
      'Synthetic educational data only',
      'Separated from real credential handling',
      'Exposed through capability flags',
    ],
    files: ['backend/server.py', 'src/runtime/mode.ts'],
  },
  {
    title: 'Voice architecture',
    subtitle: 'Planned or experimental path',
    badge: 'PLANNED',
    tone: 'var(--cream)',
    description:
      'Voice-related files and token routes represent architecture work and experimentation. Learner-facing live voice is not part of the current shipped guided browser flow.',
    bullets: [
      'Backend token path can exist without frontend support',
      'Frontend only advertises live voice when both sides are usable',
      'Architecture notes are not runtime guarantees',
    ],
    files: ['backend/voice_agent.py', 'src/voice/conversation.ts', 'src/runtime/mode.ts'],
  },
];

function Card({ card }: { card: TopologyCard }) {
  return (
    <div
      className="plush"
      style={{
        background: card.tone,
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.08em', color: 'var(--ink-2)' }}>{card.badge}</div>
          <h3 style={{ margin: '6px 0 4px', fontSize: 22, lineHeight: 1.1 }}>{card.title}</h3>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>{card.subtitle}</div>
        </div>
      </div>

      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, fontWeight: 600, color: 'var(--ink)' }}>{card.description}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {card.bullets.map((bullet) => (
          <div key={bullet} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: 'var(--ink)',
                marginTop: 6,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{bullet}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {card.files.map((file) => (
          <code
            key={file}
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: '4px 8px',
              borderRadius: 10,
              border: '2px solid var(--line)',
              background: 'rgba(255,255,255,0.72)',
            }}
          >
            {file}
          </code>
        ))}
      </div>
    </div>
  );
}

function ConnectorLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        alignSelf: 'center',
        background: 'white',
        border: '3px solid var(--line)',
        borderRadius: 999,
        padding: '8px 14px',
        fontSize: 12,
        fontWeight: 900,
        letterSpacing: '.05em',
        color: 'var(--ink-2)',
      }}
    >
      {children}
    </div>
  );
}

export function AgentTopologyScreen() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top, rgba(255,239,214,0.95) 0%, rgba(255,248,239,1) 42%, rgba(245,235,226,1) 100%)',
      }}
    >
      <TopBar steps={['Home', 'Architecture']} here={1} />

      <div style={{ maxWidth: 1360, margin: '0 auto', padding: '28px 24px 56px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <section
          className="plush-lg"
          style={{
            background: 'linear-gradient(135deg, var(--paper), #fff7ee)',
            padding: 24,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 20,
            alignItems: 'flex-start',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ maxWidth: 820, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="chip butter" style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.08em' }}>
              PROTOTYPE ARCHITECTURE
            </div>
            <h1 style={{ margin: 0, fontSize: 36, lineHeight: 1.05 }}>Medlife grading and tooling topology</h1>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, fontWeight: 600, color: 'var(--ink)' }}>
              This view separates what learners can use right now from optional backend services and planned infrastructure. It is a product map, not proof that every service shown is live in the student experience today.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span className="chip" style={{ background: 'white' }}>Guided flow is shipped</span>
              <span className="chip" style={{ background: 'white' }}>AI debrief is optional</span>
              <span className="chip" style={{ background: 'white' }}>Live voice remains planned/experimental</span>
            </div>
          </div>

          <button
            type="button"
            className="btn-plush ghost"
            style={{ fontSize: 13, padding: '10px 14px' }}
            onClick={() => store.setScreen('home')}
          >
            Back Home
          </button>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 110px minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.1em', color: 'var(--ink-2)' }}>CURRENT PRODUCT BOUNDARIES</div>
            {LEFT_COLUMN.map((card) => (
              <Card key={card.title} card={card} />
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 52 }}>
            <ConnectorLabel>REQUEST</ConnectorLabel>
            <ConnectorLabel>RULES</ConnectorLabel>
            <ConnectorLabel>SAFE FALLBACK</ConnectorLabel>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.1em', color: 'var(--ink-2)' }}>OPTIONAL OR PLANNED SERVICES</div>
            {RIGHT_COLUMN.map((card) => (
              <Card key={card.title} card={card} />
            ))}
          </div>
        </section>

        <section
          className="plush"
          style={{
            background: 'var(--paper)',
            padding: 20,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
          }}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.08em', color: 'var(--ink-2)' }}>SHIPPED TODAY</div>
            <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5, fontWeight: 600 }}>
              Guided browser consultation, learner accounts, server-backed history and progress, local offline mode, rule-based assessment, and optional backend capability checks.
            </p>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.08em', color: 'var(--ink-2)' }}>OPTIONAL NOW</div>
            <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5, fontWeight: 600 }}>
              AI debrief, demo EHR lookup, triage helper, and voice-token backend routes when configured.
            </p>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.08em', color: 'var(--ink-2)' }}>NOT YET LEARNER-READY</div>
            <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5, fontWeight: 600 }}>
              Learner-facing live voice consultation, institution dashboards, and broader operational infrastructure.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
