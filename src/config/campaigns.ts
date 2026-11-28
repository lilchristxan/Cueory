/**
 * Campaign links (Christian, 2026-11-27): one short address per place Cueory is shared, such as cueory.app/from/tiktok.
 * Each is a small page that is counted by the cookieless page-visit statistics already on the site and then sends the
 * visitor to the home page. Cloudflare Web Analytics does not read campaign tags in a link's query string, so the
 * source is the address itself. To add a source, add a line here (lower-case letters, digits and hyphens only) and a
 * JavaScript budget line for its page in tests/unit/build-output.test.ts.
 */
export const campaignSources = ['tiktok', 'instagram', 'youtube', 'flyer', 'email', 'friend'] as const;

export type CampaignSource = (typeof campaignSources)[number];

/** Where every campaign link ends up. */
export const CAMPAIGN_DESTINATION = '/';

export function isCampaignSource(value: string): value is CampaignSource {
  return (campaignSources as readonly string[]).includes(value);
}
