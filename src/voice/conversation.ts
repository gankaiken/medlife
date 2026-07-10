import type { PatientCase } from '../game/types';
import type { ChatMessage } from './claude';

export type ConversationStatus =
  | 'uninitialized'
  | 'loading'
  | 'ready'
  | 'listening'
  | 'thinking'
  | 'speaking';

export interface SubtitleEvent {
  who: 'patient' | 'you';
  text: string;
}

interface ConversationListeners {
  onStatus?: (status: ConversationStatus) => void;
  onProgress?: (message: string) => void;
  onSubtitle?: (subtitle: SubtitleEvent) => void;
  onError?: (message: string) => void;
}

export class PatientConversation {
  private status: ConversationStatus = 'uninitialized';
  private listeners: ConversationListeners | null = null;
  private messages: ChatMessage[] = [];
  private subscribers = new Set<(messages: ReadonlyArray<ChatMessage>) => void>();

  constructor(private readonly patient: PatientCase) {}

  setListeners(listeners: ConversationListeners | null): void {
    this.listeners = listeners;
  }

  getStatus(): ConversationStatus {
    return this.status;
  }

  getMessages(): ReadonlyArray<ChatMessage> {
    return this.messages;
  }

  subscribeMessages(cb: (messages: ReadonlyArray<ChatMessage>) => void): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  async init(): Promise<void> {
    if (this.status !== 'uninitialized') return;
    this.setStatus('loading');
    this.listeners?.onProgress?.('Starting guided scripted session');
    await Promise.resolve();
    this.messages = [
      {
        role: 'assistant',
        content: `Hi doctor, I am ${this.patient.name.split(' ')[0]}. ${this.patient.chiefComplaint}`,
      },
    ];
    this.emitMessages();
    this.listeners?.onSubtitle?.({ who: 'patient', text: this.messages[0].content });
    this.setStatus('ready');
  }

  addGuidedExchange(question: string, answer: string): void {
    this.messages = [
      ...this.messages,
      { role: 'user', content: question },
      { role: 'assistant', content: answer },
    ];
    this.emitMessages();
    this.listeners?.onSubtitle?.({ who: 'patient', text: answer });
    this.setStatus('ready');
  }

  async sayFarewell(): Promise<void> {
    this.setStatus('speaking');
    const farewell = 'Thank you, doctor.';
    this.messages = [...this.messages, { role: 'assistant', content: farewell }];
    this.emitMessages();
    this.listeners?.onSubtitle?.({ who: 'patient', text: farewell });
    await Promise.resolve();
    this.setStatus('ready');
  }

  dispose(): void {
    this.subscribers.clear();
    this.listeners = null;
    this.status = 'uninitialized';
  }

  private setStatus(next: ConversationStatus): void {
    this.status = next;
    this.listeners?.onStatus?.(next);
  }

  private emitMessages(): void {
    for (const cb of this.subscribers) cb(this.messages);
  }
}
