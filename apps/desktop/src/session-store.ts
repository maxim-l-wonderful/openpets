import type { OpenPetsReaction, OpenPetsSessionStatus } from "./local-ipc-protocol.js";

/**
 * Multi-session board state.
 *
 * Each coding session maps to one lease (one MCP client process). The store
 * holds one card per active default-pet session, keyed by leaseId, and the
 * default pet renders them as a stacked board. Cards are created on first
 * sighting (a say/react/session.update from a default-target lease) and removed
 * when the lease is released, expires, or its client process dies.
 *
 * Pure data + a change callback; the Electron layer wires removal to lease
 * lifecycle and re-renders on change.
 */

export interface SessionCard {
  readonly leaseId: string;
  /** Stable 1-based display order, assigned on first sighting. */
  readonly ordinal: number;
  /** Session title; falls back to `Session ${ordinal}` in the renderer when unset. */
  readonly name?: string;
  readonly status: OpenPetsSessionStatus;
  /** Current activity line. */
  readonly message?: string;
  /** A question awaiting the user; only surfaced while status is "waiting". */
  readonly question?: string;
  readonly updatedAt: number;
}

export interface SessionPatch {
  readonly name?: string;
  readonly status?: OpenPetsSessionStatus;
  readonly message?: string;
  readonly question?: string;
}

/** Map a pet reaction to the closest session lifecycle status. */
export function reactionToSessionStatus(reaction: OpenPetsReaction | undefined): OpenPetsSessionStatus | undefined {
  switch (reaction) {
    case "thinking":
    case "working":
    case "editing":
    case "running":
    case "testing":
      return "in_progress";
    case "waiting":
      return "waiting";
    case "success":
    case "celebrating":
      return "done";
    case "error":
      return "error";
    case "idle":
    case "waving":
      return "idle";
    default:
      return undefined;
  }
}

export class SessionStore {
  readonly #cards = new Map<string, SessionCard>();
  #nextOrdinal = 1;
  readonly #now: () => number;
  readonly #onChange: () => void;

  constructor(options: { readonly onChange?: () => void; readonly now?: () => number } = {}) {
    this.#onChange = options.onChange ?? (() => {});
    this.#now = options.now ?? Date.now;
  }

  /** Create or merge a card for a lease. Returns true if anything changed. */
  upsert(leaseId: string, patch: SessionPatch): boolean {
    const existing = this.#cards.get(leaseId);
    const status = patch.status ?? existing?.status ?? "in_progress";
    // A question only makes sense while waiting: clear it when a non-waiting
    // status arrives (unless this same patch supplies a fresh question).
    const question = patch.question
      ?? (patch.status !== undefined && patch.status !== "waiting" ? undefined : existing?.question);
    const next: SessionCard = {
      leaseId,
      ordinal: existing?.ordinal ?? this.#nextOrdinal++,
      name: patch.name ?? existing?.name,
      status,
      message: patch.message ?? existing?.message,
      question,
      updatedAt: this.#now(),
    };
    if (existing && existing.name === next.name && existing.status === next.status && existing.message === next.message && existing.question === next.question) {
      return false;
    }
    this.#cards.set(leaseId, next);
    this.#onChange();
    return true;
  }

  remove(leaseId: string): boolean {
    if (!this.#cards.delete(leaseId)) return false;
    this.#onChange();
    return true;
  }

  has(leaseId: string): boolean {
    return this.#cards.has(leaseId);
  }

  size(): number {
    return this.#cards.size;
  }

  /** Cards in stable display order (oldest first). */
  getBoard(): readonly SessionCard[] {
    return [...this.#cards.values()].sort((a, b) => a.ordinal - b.ordinal);
  }

  clear(): void {
    if (this.#cards.size === 0) return;
    this.#cards.clear();
    this.#onChange();
  }
}
