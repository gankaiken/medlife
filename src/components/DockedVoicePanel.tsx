import { useEffect, useRef, useState } from 'react';
import { POLYCLINIC_BED_INDEX } from '../game/store';
import { getExistingConversation } from '../voice/conversationStore';
import type { ConversationStatus, SubtitleEvent } from '../voice/conversation';

interface Props {
  patientName: string;
  patientLabel: string;
}

export function DockedVoicePanel({ patientName, patientLabel }: Props) {
  const [status, setStatus] = useState<ConversationStatus>('uninitialized');
  const [subtitle, setSubtitle] = useState<SubtitleEvent>({ who: 'patient', text: '...' });

  useEffect(() => {
    let disposed = false;
    let attempt = 0;
    let stopMessages: (() => void) | null = null;

    const tryAttach = () => {
      if (disposed) return;
      const conv = getExistingConversation(POLYCLINIC_BED_INDEX);
      if (!conv) {
        if (attempt++ < 20) window.setTimeout(tryAttach, 100);
        return;
      }
      setStatus(conv.getStatus());
      const msgs = conv.getMessages();
      const last = [...msgs].reverse().find((m) => m.role === 'assistant' || m.role === 'user');
      if (last) {
        setSubtitle({ who: last.role === 'user' ? 'you' : 'patient', text: last.content });
      }
      stopMessages = conv.subscribeMessages((all) => {
        const lastMsg = [...all].reverse().find((m) => m.role === 'assistant' || m.role === 'user');
        if (lastMsg) {
          setSubtitle({ who: lastMsg.role === 'user' ? 'you' : 'patient', text: lastMsg.content });
        }
      });
    };

    tryAttach();

    const tick = window.setInterval(() => {
      if (disposed) return;
      const conv = getExistingConversation(POLYCLINIC_BED_INDEX);
      if (conv) setStatus(conv.getStatus());
    }, 500);

    return () => {
      disposed = true;
      window.clearInterval(tick);
      stopMessages?.();
    };
  }, []);

  const firstName = patientName.split(' ')[0];
  const statusLabel =
    status === 'thinking' ? 'Thinking'
    : status === 'speaking' ? `${firstName} speaking`
    : status === 'loading' ? 'Preparing'
    : status === 'ready' ? 'Connected'
    : 'Offline';

  const live = status === 'listening' || status === 'speaking' || status === 'thinking' || status === 'ready';
  const statusColor =
    status === 'speaking' ? 'var(--peach-deep)'
    : status === 'listening' ? 'var(--mint-deep)'
    : status === 'thinking' ? 'var(--butter-deep)'
    : live ? 'var(--mint-deep)' : 'rgba(255,255,255,0.48)';

  const showSubtitle = !!subtitle.text && subtitle.text !== '...';
  const speakerLabel = subtitle.who === 'you' ? 'You' : firstName;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [subtitle.text]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 60,
        width: 312,
        background: 'linear-gradient(180deg, rgba(12,29,38,0.88), rgba(22,53,65,0.8))',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 24,
        boxShadow: '0 22px 46px rgba(10, 24, 32, 0.32)',
        padding: '14px 16px',
        fontFamily: 'Manrope, system-ui, sans-serif',
        color: 'white',
        backdropFilter: 'blur(16px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 900 }}>
          {patientName}
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.62)', marginLeft: 6, fontWeight: 700 }}>
            {patientLabel}
          </span>
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 9,
            letterSpacing: '0.12em',
            color: statusColor,
            textTransform: 'uppercase',
            fontWeight: 900,
            whiteSpace: 'nowrap',
            padding: '4px 8px',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <span
            className={live ? 'breathe' : undefined}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: statusColor,
              display: 'inline-block',
            }}
          />
          {statusLabel}
        </div>
      </div>

      <div
        ref={scrollRef}
        style={{
          fontStyle: showSubtitle ? 'italic' : 'normal',
          fontSize: 12,
          lineHeight: 1.5,
          color: showSubtitle ? 'white' : 'rgba(255,255,255,0.58)',
          fontWeight: 600,
          maxHeight: 130,
          overflowY: 'auto',
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 18,
          padding: '10px 12px',
        }}
      >
        {showSubtitle ? (
          <>
            <div
              style={{
                fontSize: 9,
                fontWeight: 800,
                color: 'rgba(255,255,255,0.6)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                marginBottom: 4,
                fontStyle: 'normal',
              }}
            >
              {speakerLabel}
            </div>
            "{subtitle.text}"
          </>
        ) : (
          'Guided or AI text mode. Use the chart workspace to keep the patient conversation moving.'
        )}
      </div>
    </div>
  );
}
