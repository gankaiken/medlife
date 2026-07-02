import { useSyncExternalStore } from 'react';

export interface Interactable {
  id: string;
  position: [number, number, number];
  radius: number;
  prompt: string;
  kind: 'desk' | 'bed' | 'triage';
  bedIndex?: number;
}

class InteractionBus {
  private items = new Map<string, Interactable>();
  private activeId: string | null = null;
  private listeners = new Set<() => void>();

  register(item: Interactable): void {
    this.items.set(item.id, item);
    this.emit();
  }

  unregister(id: string): void {
    this.items.delete(id);
    if (this.activeId === id) this.activeId = null;
    this.emit();
  }

  getAll(): Interactable[] {
    return Array.from(this.items.values());
  }

  getActive(): Interactable | null {
    return this.activeId ? this.items.get(this.activeId) ?? null : null;
  }

  setActive(id: string | null): void {
    if (this.activeId === id) return;
    this.activeId = id;
    this.emit();
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    for (const cb of this.listeners) cb();
  }
}

export const interactionBus = new InteractionBus();

export function useActiveInteractable(): Interactable | null {
  return useSyncExternalStore(
    (cb) => interactionBus.subscribe(cb),
    () => interactionBus.getActive(),
    () => interactionBus.getActive(),
  );
}
