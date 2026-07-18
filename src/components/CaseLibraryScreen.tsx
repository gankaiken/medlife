import { useMemo, useState } from 'react';
import { PatientFace, TopBar } from './primitives';
import { CASES, CONDITION_COLORS, type Case } from '../data/cases';
import { getLearnerCase } from '../data/learnerCases';
import { CLINIC_IDS, CLINIC_LABELS, type ClinicId } from '../game/clinic';
import { store, useTweaks } from '../game/store';
import { useAuth } from '../runtime/AuthProvider';

interface CaseCardProps {
  c: Case;
  delay?: number;
  avatarStyle: ReturnType<typeof useTweaks>['avatarStyle'];
}

function CaseCard({ c, delay = 0, avatarStyle }: CaseCardProps) {
  const bg = CONDITION_COLORS[c.cond] ?? 'var(--butter)';
  const governanceTone = c.status === 'approved' ? 'mint' : 'butter';

  return (
    <div
      className="tap popin"
      onClick={() => store.selectCase(c.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          store.selectCase(c.id);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open case ${c.name}`}
      data-testid={`case-card-${c.id}`}
      style={{ animationDelay: `${delay}s`, position: 'relative' }}
    >
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 18,
          zIndex: 2,
          background: bg,
          border: '2px solid var(--line)',
          borderRadius: 999,
          padding: '5px 12px',
          fontWeight: 800,
          fontSize: 11,
          boxShadow: '0 8px 18px rgba(11, 30, 40, 0.1)',
        }}
      >
        {c.cond}
      </div>

      <div
        className="case-card-premium"
        style={{
          padding: 18,
          position: 'relative',
          overflow: 'hidden',
          color: 'var(--line)',
          minHeight: 320,
        }}
      >
        {c.attempted && c.score && (
          <div
            style={{
              position: 'absolute',
              top: 18,
              right: 18,
              background: 'rgba(12,29,38,0.92)',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 999,
              padding: '4px 10px',
              fontWeight: 900,
              fontSize: 11,
            }}
          >
            {c.score}
          </div>
        )}

        <div
          style={{
            background: `linear-gradient(180deg, ${bg}, rgba(255,255,255,0.86))`,
            borderRadius: 20,
            border: '1px solid rgba(22,53,65,0.12)',
            height: 160,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            marginBottom: 14,
            overflow: 'hidden',
            position: 'relative',
            boxShadow: 'inset 0 -28px 48px rgba(255,255,255,0.34)',
          }}
        >
          <div style={{ marginBottom: -8 }} className="floaty">
            <PatientFace
              name={c.name}
              style={avatarStyle}
              skin={c.skin}
              hair={c.hair}
              size={124}
              mood={c.mood}
              accessory={c.accessory}
            />
          </div>
        </div>

        <div style={{ fontWeight: 900, fontSize: 18, lineHeight: 1.1 }}>{c.name}</div>
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--ink-2)', margin: '6px 0 8px' }}>
          {c.age} · {c.sex}
        </div>
        <div style={{ fontSize: 13, minHeight: 40, lineHeight: 1.45, fontWeight: 600, color: 'var(--ink-2)' }}>
          "{c.complaint}"
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
          {c.tags.slice(0, 2).map((t) => (
            <span key={t} className="chip" style={{ fontSize: 11, padding: '3px 9px' }}>
              {t}
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {c.status && (
            <span
              className={`chip ${governanceTone}`}
              style={{ fontSize: 11, padding: '3px 9px' }}
              data-testid={`case-status-${c.id}`}
            >
              {c.status.replace(/_/g, ' ')}
            </span>
          )}
          {c.approvalStatus && (
            <span
              className="chip"
              style={{ fontSize: 11, padding: '3px 9px' }}
              data-testid={`case-approval-${c.id}`}
            >
              {c.approvalStatus.replace(/_/g, ' ')}
            </span>
          )}
        </div>

        {c.reviewBanner && (
          <div
            style={{ marginTop: 10, fontSize: 11, fontWeight: 800, lineHeight: 1.4, color: 'var(--ink-2)' }}
            data-testid={`case-review-banner-${c.id}`}
          >
            {c.reviewBanner}
          </div>
        )}

        <div style={{ marginTop: 12, fontSize: 12, fontWeight: 800, color: 'var(--teal-700)' }}>
          Guideline · {c.guideline}
        </div>
      </div>
    </div>
  );
}

type ClinicFilter = ClinicId | 'all' | 'red-flag';

const LEARNER_STAGE_ORDER = [
  'pre_clinical_foundation',
  'transition_to_clinical_learning',
  'early_clinical',
  'core_clinical_rotation',
  'pre_intern_preparation',
] as const;

function stageAllowsCase(
  learnerStage: (typeof LEARNER_STAGE_ORDER)[number],
  candidateStage: string,
) {
  const normalizedLearnerStage = learnerStage === 'transition_to_clinical_learning'
    ? 'early_clinical'
    : learnerStage;
  const learnerIndex = LEARNER_STAGE_ORDER.indexOf(normalizedLearnerStage);
  const candidateIndex = LEARNER_STAGE_ORDER.indexOf(candidateStage as (typeof LEARNER_STAGE_ORDER)[number]);
  if (learnerIndex < 0 || candidateIndex < 0) return true;
  return candidateIndex <= learnerIndex;
}

const CLINIC_ICON: Record<ClinicId, string> = {
  'all-specialties': '🏥',
  'internal-medicine': '🩺',
  cardiology: '❤️',
  neurology: '🧠',
  neurosurgery: '🧠',
  dermatology: '🩹',
  endocrinology: '🧪',
  gastroenterology: '🫓',
  pulmonology: '🫁',
  nephrology: '💧',
  rheumatology: '🦴',
  hematology: '🩸',
  oncology: '🎗️',
  'infectious-disease': '🦠',
  'allergy-immunology': '🌿',
  psychiatry: '💬',
  obgyn: '🌸',
  urology: '💧',
  ophthalmology: '👁️',
  ent: '👂',
  orthopedics: '🦴',
  pmr: '🏃',
  pediatrics: '🧸',
  'general-surgery': '🔪',
  'cardiothoracic-vascular-surgery': '🫀',
};

export function CaseLibraryScreen() {
  const tweaks = useTweaks();
  const { preferences } = useAuth();
  const [filter, setFilter] = useState<ClinicFilter>('all');

  const grouped = useMemo(() => {
    const map = new Map<ClinicId, Case[]>();
    for (const id of CLINIC_IDS) {
      if (id === 'all-specialties') continue;
      map.set(id, []);
    }
    for (const c of CASES) {
      const list = map.get(c.clinic);
      if (list) list.push(c);
    }
    return map;
  }, []);

  const visibleGroups = useMemo<Array<[ClinicId, Case[]]>>(() => {
    const matchesStage = (item: Case) => {
      const detail = getLearnerCase(item.id);
      return !detail || stageAllowsCase(preferences.learner_stage, detail.pilotReadiness.candidateStage);
    };
    if (filter === 'red-flag') {
      const out: Array<[ClinicId, Case[]]> = [];
      for (const [clinic, list] of grouped) {
        const reds = list.filter((c) => matchesStage(c) && c.tags.some((t) => t.toLowerCase().includes('red flag')));
        if (reds.length) out.push([clinic, reds]);
      }
      return out;
    }
    if (filter === 'all') {
      return Array.from(grouped.entries())
        .map(([clinic, list]) => [clinic, list.filter(matchesStage)] as [ClinicId, Case[]])
        .filter(([, list]) => list.length > 0);
    }
    const list = (grouped.get(filter as ClinicId) ?? []).filter(matchesStage);
    return list.length ? [[filter as ClinicId, list]] : [];
  }, [grouped, filter, preferences.learner_stage]);

  const totalVisible = visibleGroups.reduce((n, [, list]) => n + list.length, 0);

  const shuffle = () => {
    const pool = visibleGroups.flatMap(([, list]) => list);
    const fallback = pool.length > 0 ? pool : CASES;
    const pick = fallback[Math.floor(Math.random() * fallback.length)];
    store.selectCase(pick.id);
  };

  const clinicChips: Array<{ id: ClinicFilter; label: string; icon?: string }> = [
    { id: 'all', label: 'All clinics', icon: '🏥' },
    { id: 'red-flag', label: 'Red-flag only', icon: '🚩' },
    ...CLINIC_IDS.filter((id) => id !== 'all-specialties' && (grouped.get(id)?.length ?? 0) > 0).map(
      (id) => ({ id: id as ClinicFilter, label: CLINIC_LABELS[id], icon: CLINIC_ICON[id] }),
    ),
  ];

  return (
    <div className="screen platform-screen">
      <TopBar here={2} steps={['Polyclinic', 'GP', 'Case']} />

      <div className="platform-container">
        <div
          className="platform-hero"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              type="button"
              className="btn-plush ghost"
              style={{ fontSize: 14, padding: '10px 18px' }}
              onClick={() => store.setScreen('gpRoom')}
              title="Back to the GP room"
            >
              Back
            </button>
            <div>
              <div className="platform-label">Case selection</div>
              <h1 className="platform-title" style={{ fontSize: 42, marginBottom: 4 }}>Pick a patient</h1>
              <div style={{ fontWeight: 600, color: 'rgba(255,255,255,0.78)', fontSize: 14 }}>
                Cases are grouped by polyclinic so you can move from broad practice into focused specialty revision fast.
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn-plush mint"
            style={{ fontSize: 16, padding: '12px 22px', whiteSpace: 'nowrap' }}
            onClick={shuffle}
          >
            Shuffle ({totalVisible})
          </button>
        </div>

        <div
          style={{
            padding: '18px 0 6px',
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <span className="chip butter">Stage: {preferences.learner_stage.replace(/_/g, ' ')}</span>
          {clinicChips.map((chip) => (
            <span
              key={chip.id}
              className={`chip ${filter === chip.id ? 'butter' : ''}`}
              style={{ cursor: 'pointer' }}
              onClick={() => setFilter(chip.id)}
            >
              {chip.icon ? `${chip.icon} ` : ''}
              {chip.label}
            </span>
          ))}
        </div>

        <div style={{ padding: '18px 0 28px', display: 'flex', flexDirection: 'column', gap: 28 }}>
          {visibleGroups.map(([clinic, list]) => (
            <section key={clinic}>
              <div
                className="section-heading"
                style={{
                  paddingBottom: 10,
                  borderBottom: '1px solid rgba(22,53,65,0.12)',
                  marginBottom: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{CLINIC_ICON[clinic] ?? '🏥'}</span>
                  <h2 style={{ fontSize: 24, margin: 0, letterSpacing: '-0.02em' }}>
                    {CLINIC_LABELS[clinic]}
                  </h2>
                </div>
                <span className="chip" style={{ fontSize: 11 }}>
                  {list.length} case{list.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="case-grid">
                {list.map((c, i) => (
                  <CaseCard key={c.id} c={c} delay={(i % 8) * 0.04} avatarStyle={tweaks.avatarStyle} />
                ))}
              </div>
            </section>
          ))}

          {visibleGroups.length === 0 && (
            <div
              className="glass-card"
              style={{ padding: 24, textAlign: 'center', color: 'var(--ink-2)', fontWeight: 700 }}
            >
              No cases match this filter. Try another clinic chip.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
