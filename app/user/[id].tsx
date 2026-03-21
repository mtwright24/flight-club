// Route used for viewing another user's profile from search results.
// Delegate to the main tabbed profile screen, which knows how to
// handle both /profile (self) and /user/[id] (other user) variants.
export { default } from '../(tabs)/profile';
