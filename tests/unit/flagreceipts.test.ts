import { describe, expect, it } from 'vitest';
import { createFlagReceiptGate } from '../../src/islands/flagreceipts';

describe('account-owned anatomy report notices', () => {
  it('keeps the same account receipt valid across selection and system changes', () => {
    const gate = createFlagReceiptGate();
    const first = gate.begin('account-A');
    expect(first.reset).toBe(true);
    expect(gate.isCurrent(first.ticket)).toBe(true);
    expect(gate.observeIdentity('account-A')).toBe(false);
    const next = gate.begin('account-A');
    expect(next.reset).toBe(false);
    expect(gate.isCurrent(first.ticket)).toBe(true);
    expect(gate.isCurrent(next.ticket)).toBe(true);
  });

  it('discards A notices on an A to B switch and ignores a late completion', () => {
    const gate = createFlagReceiptGate();
    const old = gate.begin('account-A').ticket;
    expect(gate.observeIdentity('account-B')).toBe(true);
    expect(gate.isCurrent(old)).toBe(false);
    const current = gate.begin('account-B');
    expect(current.reset).toBe(true);
    expect(gate.isCurrent(current.ticket)).toBe(true);
    expect(gate.isCurrent(old)).toBe(false);
  });

  it('invalidates old receipts on sign-out and does not revive them on A to B to A', () => {
    const gate = createFlagReceiptGate();
    const first = gate.begin('account-A').ticket;
    expect(gate.observeIdentity(null)).toBe(true);
    expect(gate.isCurrent(first)).toBe(false);
    const second = gate.begin('account-A').ticket;
    expect(gate.isCurrent(second)).toBe(true);
    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.observeIdentity('account-B')).toBe(true);
    expect(gate.observeIdentity('account-A')).toBe(false);
    expect(gate.isCurrent(second)).toBe(false);
  });

  it('does not accept empty account IDs or clear notices on an unrelated initial session', () => {
    const gate = createFlagReceiptGate();
    expect(gate.observeIdentity('account-B')).toBe(false);
    expect(() => gate.begin('')).toThrow('known account');
    const ticket = gate.begin('account-B').ticket;
    expect(gate.observeIdentity('account-B')).toBe(false);
    expect(gate.isCurrent(ticket)).toBe(true);
  });
});
