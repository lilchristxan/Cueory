import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FlagForm from './FlagForm';
import { currentFlagItem, onFlagItem, type FlagItem } from './flagitem';
import { makeFlagSend, sendReportWithReceipt, watchFlagSession, type FlagClient, type FlagSessionWatch, type LoadFlagClient } from './flagconnect';
import type { FlagReport } from './flag';
import type { SendResult } from './flagsend';
import { getSupabase } from './supabaseclient';

interface Props {
  page: string;
  itemId?: string;
  itemVersionId?: string;
  variant?: 'text' | 'icon';
  /** Optional public study context, stored in the report comment rather than UUID-only item fields. */
  context?: string;
  /** The parent keeps the completion receipt visible when this structure is deselected. */
  onReportStart?: (context: string) => (result: SendResult) => void;
}

/** Contextual anatomy reports must never inherit a question selected elsewhere on the page. */
export function flagItemForContext(
  context: string | undefined,
  published: FlagItem | undefined,
  itemId: string | undefined,
  itemVersionId: string | undefined,
): { itemId?: string; itemVersionId?: string } {
  if (context) return {};
  return published ?? { itemId, itemVersionId };
}

/** The page's shared client. With accounts off it is null and the Supabase package is never downloaded. */
const loadShared: LoadFlagClient = () => getSupabase() as unknown as Promise<FlagClient | null>;

/**
 * Mounts FlagForm on the page (Task 171). Signed-in state comes from the browser's real session, checked once the
 * browser is idle (like the account corner) and again every time the student opens the form. Once the client has
 * loaded, a sign-in or sign-out in this tab or another one updates the form too, so it is never stuck on the first answer.
 */
export default function FlagMount({ page, itemId, itemVersionId, variant, context, onReportStart }: Props) {
  // Retain the actual account identity, not just a signed-in boolean:
  // account A -> B is a real change even when both are authenticated.
  const [session, setSession] = useState<{ signedIn: boolean; userId: string | null } | null>(null);
  // Pages whose items load in the browser (the real questions) publish the current one; it wins over the fixed props.
  const [published, setPublished] = useState<FlagItem | undefined>(currentFlagItem);
  useEffect(() => { setPublished(currentFlagItem()); return onFlagItem(setPublished); }, []);
  const watch = useRef<FlagSessionWatch | null>(null);
  const sendingUserId = session?.userId ?? null;
  // The sender is captured by the form at Send time. A slow client load can
  // never retarget an older draft to a newly signed-in account.
  const send = useMemo(() => makeFlagSend(loadShared, sendingUserId), [sendingUserId]);
  const sendWithReceipt = useCallback(
    (report: FlagReport) => sendReportWithReceipt(send, report, context, onReportStart),
    [send, context, onReportStart],
  );
  const check = useCallback(() => watch.current?.check(), []);

  useEffect(() => {
    const current = watchFlagSession(loadShared, (signedIn, userId) =>
      setSession({ signedIn, userId }),
    );
    watch.current = current;
    let cancelIdle: () => void;
    if ('requestIdleCallback' in window) {
      const handle = window.requestIdleCallback(() => current.check(), { timeout: 2500 });
      cancelIdle = () => window.cancelIdleCallback(handle);
    } else {
      const timer = setTimeout(() => current.check(), 100);
      cancelIdle = () => clearTimeout(timer);
    }
    return () => {
      cancelIdle();
      current.stop();
      if (watch.current === current) watch.current = null;
    };
  }, []);

  const scopedItem = flagItemForContext(context, published, itemId, itemVersionId);
  return (
    <FlagForm
      page={page}
      itemId={scopedItem.itemId}
      itemVersionId={scopedItem.itemVersionId}
      signedIn={session?.signedIn ?? null}
      userId={sendingUserId}
      send={sendWithReceipt}
      onOpen={check}
      variant={variant}
      context={context}
    />
  );
}
