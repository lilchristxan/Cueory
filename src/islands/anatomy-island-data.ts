import type { AnatomySystem } from './anatomylab';

/** Astro serializes props as tagged arrays. Name the system identifier by its purpose on that boundary. */
export type AnatomySystemProp = Omit<AnatomySystem, 'key'> & { systemId: string };

export function encodeAnatomySystem({ key, ...system }: AnatomySystem): AnatomySystemProp {
  return { ...system, systemId: key };
}

export function decodeAnatomySystem({ systemId, ...system }: AnatomySystemProp): AnatomySystem {
  return { ...system, key: systemId };
}
