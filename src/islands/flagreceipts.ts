/**
 * In-memory ownership gate for structure-scoped flag receipts.
 *
 * A report is an immutable snapshot for the account that initiated it.
 * Switching structures must preserve a receipt for that same account, but
 * switching/signing out accounts must discard both the visible notice and the
 * right of its pending completion callback to update the next account's UI.
 * No user IDs or report text are persisted by this guard.
 */
export interface ReceiptTicket {
  readonly userId: string;
  readonly generation: number;
}

export function createFlagReceiptGate() {
  let ownerId: string | null = null;
  let generation = 0;

  return {
    begin(userId: string): { ticket: ReceiptTicket; reset: boolean } {
      if (!userId) throw new Error('a receipt must have a known account');
      const reset = ownerId !== userId;
      if (reset) {
        ownerId = userId;
        generation += 1;
      }
      return { ticket: { userId, generation }, reset };
    },
    observeIdentity(userId: string | null): boolean {
      if (ownerId === null || userId === ownerId) return false;
      // Invalidate all pending completion callbacks before React applies the
      // next render. A late A result must never repopulate B's notice list.
      ownerId = null;
      generation += 1;
      return true;
    },
    isCurrent(ticket: ReceiptTicket): boolean {
      return ownerId === ticket.userId && generation === ticket.generation;
    },
  };
}
