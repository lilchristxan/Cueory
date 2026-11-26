import '../styles/sharedialog.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { untilNextPuzzle } from './pulse';
import { inertOutside, lockPageScroll } from './gameresults';
import {
  browserDownloadEnvironment,
  canCopyImage,
  canSendMessage,
  canShareStickerFile,
  copySticker,
  downloadSticker,
  shareMenuItems,
  shareSticker,
  type SharePayload,
} from './vialosharing';
import { formatCountdown } from './vialosticker';
import { DIALOG_TAB_STOPS, trapTarget, type ShareGame, type ShareSticker } from './sharedialogmodel';

/*
  The completion dialog (Christian's design, 25 Nov 2026), shared by the daily games. It opens over the play area when a
  game ends, dims the board behind it, and is a modal dialog: focus moves in and stays in, Escape closes it, and focus
  goes back to the game's own "share" button. It always uses the Daytime look, in Evening too (.always-daytime).
  Nothing leaves the page until a button is pressed.
*/

export interface ShareDialogProps {
  game: ShareGame;
  open: boolean;
  onClose: () => void;
  /** Read out once when the dialog opens: the result in words. */
  description: string;
  payload: SharePayload;
  /** Draws the stickers. Called again whenever `stickersKey` changes (for example once the sign-in check resolves). */
  makeStickers: () => Promise<ShareSticker[]>;
  stickersKey: string;
}

const PREVIEW_SCALE = 0.5;
const X_PATH = 'M18.244 3.5h3.128l-6.834 7.812L22.5 20.5h-6.29l-4.928-6.443L5.64 20.5H2.51l7.31-8.356L2 3.5h6.45l4.454 5.888L18.244 3.5z';
const FACEBOOK_PATH = 'M15 3h-2.5A3.5 3.5 0 0 0 9 6.5V9H6.5v3.5H9V21h3.5v-8.5H15L15.5 9h-3V6.8c0-.5.3-.8.8-.8H15z';
const MESSAGE_PATH = 'M4 5h16v11H9l-5 4z';
const SAVE_PATH = 'M12 4v11m0 0-4-4m4 4 4-4M5 20h14';
const COPY_PATH = 'M9 9h10v11H9zM5 15V4h10';

function Icon({ path, filled }: { path: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

export default function ShareDialog({ game, open, onClose, description, payload, makeStickers, stickersKey }: ShareDialogProps) {
  const [stickers, setStickers] = useState<ShareSticker[]>([]);
  const [chosen, setChosen] = useState<string | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState('');
  const [left, setLeft] = useState(() => formatCountdown(untilNextPuzzle(new Date())));
  const [fileShare, setFileShare] = useState<boolean | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const previews = useRef(new Map<string, HTMLCanvasElement>());
  const scrim = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);
  const shareButton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const wasOpen = useRef(false);

  const nav: Navigator | undefined = typeof navigator === 'undefined' ? undefined : navigator;
  const current = stickers.find((s) => s.id === chosen) ?? stickers[0];
  const file = current?.file ?? null;
  const id = game.game;

  // Draw the stickers (again if the stats change). The dialog stays mounted while closed, so reopening is instant.
  useEffect(() => {
    let live = true;
    void makeStickers().then(
      (made) => {
        if (!live) return;
        setStickers(made);
        setFailed(made.length === 0 || made.every((s) => !s.file));
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [makeStickers, stickersKey]);

  // Previews are the same canvases, scaled down.
  useEffect(() => {
    for (const sticker of stickers) {
      const target = previews.current.get(sticker.id);
      if (!target) continue;
      const ctx = target.getContext('2d')!;
      ctx.clearRect(0, 0, target.width, target.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(sticker.canvas, 0, 0, target.width, target.height);
    }
  }, [stickers]);

  useEffect(() => {
    setFileShare(canShareStickerFile(nav, new File([new Uint8Array(1)], 'share.png', { type: 'image/png' })));
  }, [nav]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setLeft(formatCountdown(untilNextPuzzle(new Date()))), 1000);
    setLeft(formatCountdown(untilNextPuzzle(new Date())));
    return () => window.clearInterval(timer);
  }, [open]);

  // Modal: the page behind is inert and cannot scroll; focus moves in, is trapped, and goes back when it closes.
  useEffect(() => {
    if (!open || !scrim.current) return;
    wasOpen.current = true;
    const restoreInert = inertOutside(scrim.current, document.body);
    const restoreScroll = lockPageScroll(document.documentElement, document.body, window);
    card.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const stops = [...(card.current?.querySelectorAll<HTMLElement>(DIALOG_TAB_STOPS) ?? [])].filter((el) => el.offsetParent !== null);
      const to = trapTarget(stops.length, stops.indexOf(document.activeElement as HTMLElement), event.shiftKey);
      if (to !== undefined) {
        event.preventDefault();
        stops[to]!.focus();
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      restoreScroll();
      restoreInert();
      setMenuOpen(false);
    };
  }, [open, onClose]);

  const closeMenu = useCallback((focusButton: boolean) => {
    setMenuOpen(false);
    if (focusButton) shareButton.current?.focus();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !shareButton.current?.contains(target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen) menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [menuOpen]);

  const save = useCallback(() => {
    if (!file) return false;
    downloadSticker(file, browserDownloadEnvironment());
    return true;
  }, [file]);

  const preparing = 'the sticker is still being drawn. try again in a moment.';
  const onSave = () => setStatus(save() ? 'saved. check your downloads or photos.' : preparing);

  const onCopy = async () => {
    if (!file) return setStatus(preparing);
    const outcome = await copySticker(nav?.clipboard, typeof ClipboardItem === 'undefined' ? undefined : ClipboardItem, file);
    if (outcome === 'copied') setStatus('copied. paste it into a message or a story.');
    else {
      save();
      setStatus("this browser can't copy pictures, so the sticker was saved instead.");
    }
  };

  const onShare = async () => {
    if (!file) return setStatus(preparing);
    if (!fileShare) {
      setMenuOpen((now) => !now);
      return;
    }
    const outcome = await shareSticker(nav!, file, payload);
    if (outcome === 'shared') setStatus('shared.');
    else if (outcome === 'cancelled') setStatus('');
    else setStatus("sharing didn't open here. try save or copy instead.");
  };

  const onMenuKey = (event: React.KeyboardEvent<HTMLUListElement>) => {
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      event.preventDefault();
      items[(i + items.length) % items.length]?.focus();
    };
    if (event.key === 'ArrowDown') go(at + 1);
    else if (event.key === 'ArrowUp') go(at - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(items.length - 1);
    else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
    } else if (event.key === 'Tab') setMenuOpen(false);
  };

  const canMessage = canSendMessage({
    userAgent: nav?.userAgent ?? '',
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
    mobile: (nav as (Navigator & { userAgentData?: { mobile?: boolean } }) | undefined)?.userAgentData?.mobile,
  });
  const items = useMemo(() => shareMenuItems(payload, canMessage), [payload, canMessage]);
  const x = items.find((i) => i.id === 'x');
  const facebook = items.find((i) => i.id === 'facebook');
  const message = items.find((i) => i.id === 'message');
  const disabled = !file;

  // Portalled to <body>: no ancestor's transform, filter or overflow can change what "fixed" and "covers the page" mean.
  return createPortal(
    <div
      ref={scrim}
      className="share-dialog-scrim"
      hidden={!open}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      data-testid="share-dialog-scrim"
    >
      <section
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-label={game.title}
        aria-describedby={`share-dialog-description-${id}`}
        tabIndex={-1}
        className={`share-dialog share-dialog-${id} always-daytime`}
        data-testid="share-dialog"
      >
        <img className="share-dialog-corner share-dialog-corner-top" src={game.cornerSrc} alt="" aria-hidden="true" width="48" height="48" />
        <img className="share-dialog-corner share-dialog-corner-bottom" src={game.cornerSrc} alt="" aria-hidden="true" width="48" height="48" />
        <button type="button" className="share-dialog-close" aria-label="close" onClick={onClose} data-testid="share-dialog-close">
          <span aria-hidden="true">×</span>
        </button>
        <img className="share-dialog-wordmark" src={game.wordmarkSrc} alt={game.wordmarkAlt} />

        <p id={`share-dialog-description-${id}`} className="sr-only" data-testid="share-dialog-description">{description}</p>

        <fieldset className="share-dialog-picker" aria-label="choose sticker style">
          {stickers.map((sticker) => (
            <button
              key={sticker.id}
              type="button"
              className="share-dialog-option"
              aria-pressed={current?.id === sticker.id}
              aria-label={sticker.label}
              data-testid={`share-dialog-option-${sticker.id}`}
              onClick={() => setChosen(sticker.id)}
            >
              <canvas
                ref={(el) => {
                  if (el) previews.current.set(sticker.id, el);
                  else previews.current.delete(sticker.id);
                }}
                width={sticker.width * PREVIEW_SCALE}
                height={sticker.height * PREVIEW_SCALE}
                aria-hidden="true"
                data-testid={`share-dialog-preview-${sticker.id}`}
              />
              <span className="share-dialog-tick" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                selected
              </span>
            </button>
          ))}
        </fieldset>

        <div className="share-dialog-actions">
          <button
            ref={shareButton}
            type="button"
            className="share-dialog-button share-dialog-primary"
            disabled={disabled}
            aria-haspopup={fileShare === false ? 'menu' : undefined}
            aria-expanded={fileShare === false ? menuOpen : undefined}
            onClick={() => void onShare()}
            data-testid="share-dialog-share"
          >
            share
          </button>
          {menuOpen && fileShare === false && (
            <ul ref={menu} role="menu" aria-label="share the sticker" className="share-dialog-menu" onKeyDown={onMenuKey} data-testid="share-dialog-menu">
              <li role="none">
                <a role="menuitem" tabIndex={-1} className="share-dialog-menu-item" href={x?.kind === 'link' ? x.href : undefined} target="_blank" rel="noopener noreferrer" aria-label="share on x (opens in a new tab)" onClick={() => closeMenu(false)}>
                  <Icon path={X_PATH} filled />
                  share on x
                </a>
              </li>
              <li role="none">
                <a role="menuitem" tabIndex={-1} className="share-dialog-menu-item" href={facebook?.kind === 'link' ? facebook.href : undefined} target="_blank" rel="noopener noreferrer" aria-label="share on facebook (opens in a new tab)" onClick={() => closeMenu(false)}>
                  <Icon path={FACEBOOK_PATH} filled />
                  share on facebook
                </a>
              </li>
              {message?.kind === 'sms' && (
                <li role="none">
                  <a role="menuitem" tabIndex={-1} className="share-dialog-menu-item" href={message.href} onClick={() => closeMenu(false)}>
                    <Icon path={MESSAGE_PATH} />
                    send a message
                  </a>
                </li>
              )}
              <li role="none">
                <button type="button" role="menuitem" tabIndex={-1} className="share-dialog-menu-item" onClick={() => { closeMenu(true); onSave(); }}>
                  <Icon path={SAVE_PATH} />
                  save
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" tabIndex={-1} className="share-dialog-menu-item" onClick={() => { closeMenu(true); void onCopy(); }}>
                  <Icon path={COPY_PATH} />
                  copy
                </button>
              </li>
            </ul>
          )}
          <button type="button" className="share-dialog-button share-dialog-secondary" disabled={disabled} onClick={onSave} data-testid="share-dialog-save">
            save to gallery
          </button>
          <button type="button" className="share-dialog-button share-dialog-secondary" disabled={disabled} onClick={() => void onCopy()} data-testid="share-dialog-copy" data-can-copy={canCopyImage(nav?.clipboard, typeof ClipboardItem === 'undefined' ? undefined : ClipboardItem)}>
            copy sticker
          </button>
        </div>

        <p className="share-dialog-status" role="status" aria-live="polite" data-testid="share-dialog-status">
          {failed ? "the sticker couldn't be drawn in this browser. your result is still shown on the page." : status}
        </p>
        <p className="share-dialog-countdown" data-testid="share-dialog-countdown">
          {game.countdownLabel} {left}
        </p>
      </section>
    </div>,
    document.body,
  );
}
