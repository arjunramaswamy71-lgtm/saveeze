import { runCheck } from '@/lib/check';

// Injected into the tab only when you click savEEZE. Nothing runs on pages before that.
export default defineUnlistedScript(() => {
  (globalThis as unknown as { __saveezeCheck: () => ReturnType<typeof runCheck> }).__saveezeCheck = () =>
    runCheck(document, location.href);
});
