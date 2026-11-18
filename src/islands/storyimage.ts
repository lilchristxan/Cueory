/**
 * The story-card renderer, split out of share.ts so it loads only when a visitor taps share (createStoryFile imports it
 * on demand). Behaviour is unchanged: share.ts still owns the timeout, the fallbacks and the text fitting.
 */
import { fitStoryText, type StoryImageInput } from './share';

function image(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const asset = new Image();
    asset.onload = () => resolve(asset);
    asset.onerror = () => reject(new Error('image could not be loaded'));
    asset.src = url;
  });
}

/** Draws the 1080×1920 story card. The caller bounds this whole renderer with one timeout. */
export async function renderStoryFile(input: StoryImageInput): Promise<File | null> {
    const tokens = getComputedStyle(document.documentElement);
    const number = (name: string) => Number.parseFloat(tokens.getPropertyValue(name));
    const page = tokens.getPropertyValue('--color-page').trim();
    const ink = tokens.getPropertyValue('--color-ink').trim();
    const soft = tokens.getPropertyValue('--color-ink-soft').trim();
    const bodyFont = tokens.getPropertyValue('--font-body').trim();
    const displayFont = tokens.getPropertyValue('--font-display').trim();
    const displayWeight = number('--share-story-display-weight');
    const emphasisWeight = number('--share-story-emphasis-weight');
    const siteWeight = number('--share-story-site-weight');
    const width = number('--share-story-width');
    const height = number('--share-story-height');
    const logoWidth = number('--share-story-logo-width');
    const values = [
      width, height, logoWidth, number('--share-story-logo-top'), number('--share-story-label-y'),
      number('--share-story-result-y'), number('--share-story-challenge-y'), number('--share-story-site-y'),
      number('--share-story-label-size'), number('--share-story-result-size'),
      number('--share-story-result-min-size'), number('--share-story-result-max-width'),
      number('--share-story-result-line-height'), number('--share-story-result-max-lines'),
      number('--share-story-challenge-size'), number('--share-story-site-size'),
      number('--share-story-dark-logo'),
      displayWeight, emphasisWeight, siteWeight,
    ];
    const resultSize = number('--share-story-result-size');
    const resultMinSize = number('--share-story-result-min-size');
    const resultMaxWidth = number('--share-story-result-max-width');
    const resultLineHeight = number('--share-story-result-line-height');
    const resultMaxLines = number('--share-story-result-max-lines');
    if (!page || !ink || !soft || !bodyFont || !displayFont || values.some((value) => !Number.isFinite(value))
      || resultMinSize <= 0 || resultMinSize > resultSize || resultMaxWidth <= 0 || resultLineHeight <= 0
      || !Number.isInteger(resultMaxLines) || resultMaxLines < 1
      || [displayWeight, emphasisWeight, siteWeight].some((weight) => !Number.isInteger(weight) || weight < 100 || weight > 900)) return null;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;

    await document.fonts.ready;
    const resultLayout = fitStoryText(input.result, {
      maxWidth: resultMaxWidth,
      maxLines: resultMaxLines,
      startSize: resultSize,
      minSize: resultMinSize,
      lineHeightRatio: resultLineHeight,
      measure: (text, fontSize) => {
        context.font = `${displayWeight} ${fontSize}px ${displayFont}`;
        return context.measureText(text).width;
      },
    });
    if (!resultLayout) return null;

    context.fillStyle = page;
    context.fillRect(0, 0, width, height);

    // Match the logo ink to the active page palette: Espresso on Ivory, Ivory on Charcoal.
    const logoPath = number('--share-story-dark-logo') === 1 ? '/brand/v1/logo-full-dark-960.png' : '/brand/v1/logo-full-light-960.png';
    const logo = await image(logoPath);
    const logoHeight = (logo.height * logoWidth) / logo.width;
    context.drawImage(logo, (width - logoWidth) / 2, number('--share-story-logo-top'), logoWidth, logoHeight);

    if (input.wordmarkPath) {
      const wordmark = await image(input.wordmarkPath);
      const wordmarkWidth = logoWidth;
      const wordmarkHeight = (wordmark.height * wordmarkWidth) / wordmark.width;
      context.drawImage(wordmark, (width - wordmarkWidth) / 2, number('--share-story-logo-top') + logoHeight * 2, wordmarkWidth, wordmarkHeight);
    }

    context.textAlign = 'center';
    context.fillStyle = soft;
    context.font = `${emphasisWeight} ${number('--share-story-label-size')}px ${bodyFont}`;
    context.fillText(`today's ${input.name} · ${input.date}`, width / 2, number('--share-story-label-y'));

    context.fillStyle = ink;
    context.font = `${displayWeight} ${resultLayout.fontSize}px ${displayFont}`;
    const resultY = number('--share-story-result-y');
    const firstResultY = resultY - ((resultLayout.lines.length - 1) * resultLayout.lineHeight) / 2;
    resultLayout.lines.forEach((line, index) => {
      context.fillText(line, width / 2, firstResultY + index * resultLayout.lineHeight);
    });

    context.font = `${emphasisWeight} ${number('--share-story-challenge-size')}px ${bodyFont}`;
    context.fillText('can you beat me?', width / 2, number('--share-story-challenge-y'));
    context.fillStyle = soft;
    context.font = `${siteWeight} ${number('--share-story-site-size')}px ${bodyFont}`;
    context.fillText('cueory.app', width / 2, number('--share-story-site-y'));

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    return blob ? new File([blob], `cueory-${input.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-story.png`, { type: 'image/png' }) : null;
}
