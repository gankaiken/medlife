import { Doodle, TopBar } from './primitives';
import { store } from '../game/store';

interface DoorProps {
  label: string;
  sub: string;
  color: string;
  doorColor: string;
  available?: boolean;
  locked?: boolean;
  tags?: string[];
  onOpen?: () => void;
}

function Door({ label, sub, color, doorColor, available, locked, tags = [], onOpen }: DoorProps) {
  return (
    <div
      className={available ? 'tap' : ''}
      onClick={available ? onOpen : undefined}
      style={{
        width: 260,
        position: 'relative',
        filter: locked ? 'grayscale(0.28) brightness(0.98)' : 'none',
      }}
    >
      <div
        style={{
          background: color,
          border: '4px solid var(--line)',
          borderRadius: '32px 32px 6px 6px',
          padding: 14,
          boxShadow: 'var(--plush)',
        }}
      >
        <div
          style={{
            position: 'relative',
            height: 320,
            background: `linear-gradient(180deg, ${doorColor} 0%, rgba(255,255,255,0.92) 100%)`,
            border: '4px solid var(--line)',
            borderRadius: '24px 24px 4px 4px',
            padding: 16,
          }}
        >
          <div
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, #d9eef7 100%)',
              border: '4px solid var(--line)',
              borderRadius: 18,
              height: 110,
              marginBottom: 16,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 56%)',
              }}
            />
            {available && (
              <div
                style={{ position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center' }}
                className="floaty"
              >
                <Doodle kind="cross" size={30} color="#4f8ea0" />
              </div>
            )}
            {locked && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    background: 'white',
                    border: '3px solid var(--line)',
                    borderRadius: '50%',
                    width: 50,
                    height: 50,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: 'var(--plush-tiny)',
                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24">
                    <path
                      d="M 6 11 V 8 a 6 6 0 0 1 12 0 v 3"
                      stroke="var(--line)"
                      strokeWidth="3"
                      fill="none"
                      strokeLinecap="round"
                    />
                    <rect
                      x="4"
                      y="11"
                      width="16"
                      height="11"
                      rx="3"
                      fill="var(--butter)"
                      stroke="var(--line)"
                      strokeWidth="3"
                    />
                  </svg>
                </div>
              </div>
            )}
          </div>

          <div
            style={{
              background: 'white',
              border: '4px solid var(--line)',
              borderRadius: 14,
              padding: '10px 12px',
              textAlign: 'center',
              boxShadow: 'var(--plush-tiny)',
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 18, color: 'var(--ink)' }}>{label}</div>
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--ink-2)', marginTop: 2 }}>{sub}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
        {tags.map((t, i) => (
          <span key={i} className={`chip ${available ? 'mint' : ''}`}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function Plant({ flip = false }: { flip?: boolean }) {
  return (
    <svg width="80" height="100" viewBox="0 0 80 100" style={{ transform: flip ? 'scaleX(-1)' : 'none' }}>
      <path d="M 40 70 Q 30 40 16 28" stroke="var(--line)" strokeWidth="3" fill="none" />
      <path d="M 40 70 Q 50 44 64 32" stroke="var(--line)" strokeWidth="3" fill="none" />
      <ellipse cx="18" cy="26" rx="14" ry="9" fill="#5FCFA0" stroke="var(--line)" strokeWidth="3" transform="rotate(-30 18 26)" />
      <ellipse cx="62" cy="32" rx="14" ry="9" fill="#A8E5C8" stroke="var(--line)" strokeWidth="3" transform="rotate(30 62 32)" />
      <ellipse cx="40" cy="14" rx="14" ry="10" fill="#5FCFA0" stroke="var(--line)" strokeWidth="3" />
      <path d="M 22 70 L 58 70 L 54 96 H 26 Z" fill="#c8d8de" stroke="var(--line)" strokeWidth="3.5" />
      <ellipse cx="40" cy="70" rx="18" ry="5" fill="#3A2417" />
    </svg>
  );
}

export function ModeSelectScreen() {
  return (
    <div className="screen" style={{ background: 'var(--cream)' }}>
      <TopBar here={0} showProfile />

      <div style={{ position: 'relative', height: 'calc(100vh - 67px)' }}>
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          viewBox="0 0 1200 700"
          preserveAspectRatio="none"
        >
          <defs>
            <pattern id="floortile" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
              <rect width="80" height="80" fill="#eaf1f3" />
              <path d="M 0 80 L 80 0" stroke="#d1dde1" strokeWidth="2" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="1200" height="380" fill="#eef7f9" />
          <rect x="0" y="370" width="1200" height="14" fill="#b9d4dc" stroke="var(--line)" strokeWidth="3" />
          <path
            d="M 0 700 L 1200 700 L 900 384 L 300 384 Z"
            fill="url(#floortile)"
            stroke="var(--line)"
            strokeWidth="4"
          />
          <line x1="600" y1="384" x2="0" y2="700" stroke="#bfd1d7" strokeWidth="2" strokeDasharray="6 8" />
          <line x1="600" y1="384" x2="1200" y2="700" stroke="#bfd1d7" strokeWidth="2" strokeDasharray="6 8" />
        </svg>

        <div
          style={{
            position: 'absolute',
            top: 44,
            left: 0,
            right: 0,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 900, color: 'var(--ink-3)' }}>
            Clinical training pathways
          </div>
          <h1 style={{ fontSize: 44, margin: '10px 0 6px', lineHeight: 1.05 }}>
            Choose the kind of practice you want today.
          </h1>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-2)' }}>
            Start with outpatient reasoning, then grow into diagnostics, emergency, and procedural tracks.
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            top: 190,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            gap: 60,
            padding: '0 80px',
          }}
        >
          <Door
            label="Polyclinics"
            sub="Outpatient clerkship practice"
            color="var(--mint)"
            doorColor="#d6efe8"
            available
            tags={['Open now', 'History + plan', 'Student friendly']}
            onOpen={() => store.setScreen('gpRoom')}
          />
          <Door
            label="Diagnostics"
            sub="Lab, imaging, escalation"
            color="var(--sky)"
            doorColor="#d8ecf8"
            locked
            tags={['Coming soon']}
          />
          <Door
            label="Emergency"
            sub="Triage and resus flow"
            color="var(--rose)"
            doorColor="#f5d3da"
            locked
            tags={['Coming soon']}
          />
        </div>

        <div style={{ position: 'absolute', bottom: 30, left: 60 }} className="wobble">
          <Doodle kind="pill" size={58} />
        </div>
        <div style={{ position: 'absolute', bottom: 60, right: 80 }} className="floaty">
          <Doodle kind="stetho" size={60} color="var(--mint-deep)" />
        </div>

        <div style={{ position: 'absolute', bottom: 24, left: 200 }}>
          <Plant />
        </div>
        <div style={{ position: 'absolute', bottom: 24, right: 220 }}>
          <Plant flip />
        </div>
      </div>
    </div>
  );
}
