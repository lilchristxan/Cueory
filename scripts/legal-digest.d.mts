export function normalizeLegalSource(source: string): string;
export function manifestText(manifest: unknown): string;
export function legalDigest(source: string, manifest?: unknown): string;
export function isCalendarDate(value: unknown): boolean;
export function todayUtc(now?: Date): string;
export function isApproved(
  approval: { date: string; digest: string } | undefined, source: string, manifest?: unknown, today?: string,
): boolean;
export const ALLOWED_MINIMUM_AGES: readonly string[];
export function visibleText(html: string, options?: { attributes?: boolean }): string;
export function squeezed(text: string): string;
