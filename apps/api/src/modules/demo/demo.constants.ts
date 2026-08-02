// Fixed identity for the public "try it before you sign up" sandbox account.
// A single shared account (not one per visitor) keeps this simple — every
// click of the "Demo" button on the landing page resets it back to a clean,
// canned state via DemoService.resetAndSeed() before handing out access, so
// the small risk of two people clicking "Demo" in the same instant and
// briefly seeing each other's clicks is an acceptable tradeoff for a sandbox
// with no real data in it.
export const DEMO_CLERK_ID = 'demo-account';
export const DEMO_EMAIL = 'demo@apcomp.us';
export const DEMO_NAME = 'Demo Account';
