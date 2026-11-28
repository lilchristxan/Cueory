/**
 * Outside illustrations (Christian's decision, 2026-11-26): Servier Medical Art is the main source for lesson pictures.
 * Every file we host has one record in a manifest under /content/images: its Servier title, the page it came from, the
 * licence, the day it was downloaded, and what we changed. The unit test checks each hosted file against its record, so
 * a picture can never be added without one. Pure functions only, so they run in tests and at build time.
 */
export interface ImageRecord {
  file: string;
  title: string;
  sourcePage: string;
  downloadUrl: string;
  downloadDate: string;
  bytes: number;
  sha256: string;
  /** What we changed, in plain words; "none" for an untouched original. */
  changes: string;
}

export interface ImageManifest {
  id: string;
  /** `draft` until a lesson uses the set; `approved` once Christian has approved it for lessons. */
  status: 'draft' | 'approved';
  source: string;
  sourceUrl: string;
  licence: string;
  licenceUrl: string;
  /** Servier's own credit line for an unchanged image. */
  credit: string;
  /** Servier's own credit line for an image we changed (cropped, labelled, recoloured). */
  creditAdapted: string;
  /** Where the files are served from, starting and ending with "/". */
  folder: string;
  files: ImageRecord[];
}

const SERVIER = 'https://smart.servier.com/';

/** The credit to show under one picture: the "adapted" line whenever we changed it. */
export function creditFor(manifest: ImageManifest, record: ImageRecord): string {
  return record.changes.trim().toLowerCase() === 'none' ? manifest.credit : manifest.creditAdapted;
}

/** Every problem with a manifest, in plain words. `hosted` maps each hosted file name to its size and SHA-256. */
export function manifestProblems(manifest: ImageManifest, hosted: ReadonlyMap<string, { bytes: number; sha256: string }>): string[] {
  const problems: string[] = [];
  if (manifest.licence !== 'CC BY 4.0') problems.push(`${manifest.id}: the licence must be "CC BY 4.0"`);
  if (!manifest.sourceUrl.startsWith(SERVIER)) problems.push(`${manifest.id}: the source must be Servier's own site`);
  for (const line of [manifest.credit, manifest.creditAdapted]) {
    if (!line.includes('Servier Medical Art') || !line.includes('CC BY 4.0')) problems.push(`${manifest.id}: a credit line must name Servier Medical Art and CC BY 4.0`);
  }
  if (!/^\/[\w\-/]+\/$/.test(manifest.folder)) problems.push(`${manifest.id}: the folder must start and end with "/"`);
  const seen = new Set<string>();
  for (const record of manifest.files) {
    const where = `${manifest.id}/${record.file}`;
    if (seen.has(record.file)) problems.push(`${where}: listed twice`);
    seen.add(record.file);
    if (!record.title.trim()) problems.push(`${where}: needs its Servier title`);
    if (!record.sourcePage.startsWith(`${SERVIER}smart_image/`)) problems.push(`${where}: the source page must be the image's own page on Servier's site`);
    if (!record.downloadUrl.startsWith(`${SERVIER}wp-content/uploads/`)) problems.push(`${where}: the download link must be on Servier's site`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.downloadDate)) problems.push(`${where}: the download date must be YYYY-MM-DD`);
    if (!record.changes.trim()) problems.push(`${where}: say what we changed, or "none"`);
    const file = hosted.get(record.file);
    if (!file) problems.push(`${where}: the file is not hosted`);
    else if (file.sha256 !== record.sha256 || file.bytes !== record.bytes) {
      if (record.changes.trim().toLowerCase() === 'none') problems.push(`${where}: the hosted file differs from the download, but "changes" says none`);
    }
  }
  for (const name of hosted.keys()) if (!seen.has(name)) problems.push(`${manifest.id}/${name}: hosted without a record`);
  return problems;
}
