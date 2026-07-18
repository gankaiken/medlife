import { useEffect } from 'react';
import { DoodleScatter } from './primitives';
import { store } from '../game/store';

export function SplashScreen() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        store.beginFromSplash();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className="screen platform-screen"
      onClick={() => store.beginFromSplash()}
      style={{ position: 'relative', cursor: 'pointer' }}
    >
      <DoodleScatter
        items={[
          { kind: 'cloud', x: 70, y: 84, size: 100, color: '#fff' },
          { kind: 'cloud', x: 760, y: 126, size: 126, color: '#fff' },
          { kind: 'sparkle', x: 180, y: 218, size: 28, color: 'var(--butter)' },
          { kind: 'sparkle', x: '82%', y: 210, size: 22, color: 'var(--mint)' },
          { kind: 'pill', x: 140, y: 580, size: 54, anim: 'wobble' },
          { kind: 'cross', x: '86%', y: 560, size: 42, color: 'var(--mint-deep)', anim: 'drift' },
          { kind: 'stetho', x: '8%', y: 470, size: 50, color: 'var(--teal-700)', anim: 'floaty' },
        ]}
      />

      <div
        style={{ position: 'absolute', top: 54, left: '50%', transform: 'translateX(-50%)' }}
        className="floaty"
      >
        <svg width="144" height="144" viewBox="0 0 144 144">
          <circle cx="72" cy="72" r="52" fill="rgba(255,255,255,0.6)" />
          <circle cx="72" cy="72" r="36" fill="var(--sky)" stroke="var(--line)" strokeWidth="4" />
          <path d="M 48 72 H 96" stroke="var(--line)" strokeWidth="4" />
          <path d="M 72 48 V 96" stroke="var(--line)" strokeWidth="4" />
          <circle cx="72" cy="72" r="10" fill="white" stroke="var(--line)" strokeWidth="3" />
        </svg>
      </div>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
          padding: '0 24px',
        }}
      >
        <div className="popin" style={{ animationDelay: '.05s' }}>
          <div
            style={{
              fontFamily: '"Space Grotesk", "Manrope", sans-serif',
              fontWeight: 900,
              fontSize: 140,
              lineHeight: 0.92,
              letterSpacing: '-0.04em',
              color: 'var(--paper)',
              WebkitTextStroke: '4px var(--line)',
              paintOrder: 'stroke fill',
              textShadow: '0 10px 0 rgba(31, 54, 46, 0.24)',
              textAlign: 'center',
            }}
          >
            med<span style={{ color: 'var(--butter)' }}>life</span>
          </div>
        </div>

        <div
          className="popin"
          style={{
            animationDelay: '.15s',
            fontSize: 21,
            fontWeight: 800,
            color: 'var(--ink)',
            background: 'rgba(252, 250, 245, 0.94)',
            padding: '12px 24px',
            border: '3px solid var(--line)',
            borderRadius: 'var(--r-pill)',
            boxShadow: 'var(--plush-tiny)',
            textAlign: 'center',
            maxWidth: 760,
          }}
        >
          Clinical training for med students: take histories, order tests, defend decisions, and debrief like it is exam day.
        </div>

        <div
          className="popin"
          style={{
            animationDelay: '.22s',
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          <span className="chip mint">OSCE-style practice</span>
          <span className="chip">Case-based reasoning</span>
          <span className="chip butter">AI debrief</span>
        </div>

        <div className="popin breathe" style={{ animationDelay: '.3s', marginTop: 20 }}>
          <button
            type="button"
            className="btn-plush primary"
            style={{ fontSize: 22, padding: '18px 38px' }}
            onClick={(e) => {
              e.stopPropagation();
              store.beginFromSplash();
            }}
            data-testid="enter-training-floor"
          >
            Enter training floor
          </button>
        </div>

        <div
          className="popin"
          style={{
            animationDelay: '.45s',
            fontSize: 13,
            color: 'var(--ink-2)',
            fontWeight: 700,
            marginTop: 8,
          }}
        >
          press{' '}
          <span
            style={{
              background: 'white',
              padding: '2px 10px',
              border: '2.5px solid var(--line)',
              borderRadius: 8,
              boxShadow: '0 2px 0 var(--line)',
            }}
          >
            space
          </span>{' '}
          to continue
        </div>
      </div>

      <svg
        style={{ position: 'absolute', bottom: -2, left: 0, width: '100%' }}
        viewBox="0 0 1200 120"
        preserveAspectRatio="none"
      >
        <path
          d="M 0 60 Q 300 0 600 50 T 1200 50 V 120 H 0 Z"
          fill="var(--mint)"
          stroke="var(--line)"
          strokeWidth="4"
        />
      </svg>
    </div>
  );
}
