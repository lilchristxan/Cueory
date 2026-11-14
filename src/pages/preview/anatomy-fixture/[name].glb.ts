/**
 * The anatomy lab's test model (Task 178): /preview/anatomy-fixture/fixture.glb, built in code by
 * tests/fixtures/anatomyfixture.ts. Only builds that may show drafts write it; the live site's build writes no file here
 * (the same gate as the page, src/islands/anatomylab.ts).
 */
import type { APIRoute } from 'astro';
import { draftsAllowed } from '../../../islands/anatomylab';
import { fixtureGlb } from '../../../../tests/fixtures/anatomyfixture';

export function getStaticPaths() {
  const env = { WORKERS_CI: process.env.WORKERS_CI, WORKERS_CI_BRANCH: process.env.WORKERS_CI_BRANCH,
    CUEORY_ANATOMY_DRAFTS: process.env.CUEORY_ANATOMY_DRAFTS,
    GITHUB_REF: process.env.GITHUB_REF,
    GITHUB_BASE_REF: process.env.GITHUB_BASE_REF,
    GITHUB_EVENT_NAME: process.env.GITHUB_EVENT_NAME,
  };
  return draftsAllowed(env) ? [{ params: { name: 'fixture' } }] : [];
}

export const GET: APIRoute = () =>
  new Response(fixtureGlb(), { headers: { 'Content-Type': 'model/gltf-binary' } });
