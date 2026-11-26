/**
 * Where a student goes to sign in again before deleting their account. Kept apart from deleteaccount.ts so the account
 * page's first script can build the link without loading the list of every storage key (deleteaccount.ts imports it
 * for the clean-up after deletion, and that list pulls in a dozen game and study modules).
 */
export const DELETE_RETURN_PATH = '/account#delete';

export function reauthHref(returnTo: string = DELETE_RETURN_PATH): string {
  return '/signin?next=' + encodeURIComponent(returnTo);
}
