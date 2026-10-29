// Registers the offline worker in production builds. A new version waits until the learner asks for it, so a deploy never reloads
// the page in the middle of a query. Development builds never register a worker, so a cache cannot hide an edit.
export type ApplyUpdate = () => void;

export function registerOfflineWorker(onUpdateReady: (apply: ApplyUpdate) => void): () => void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return () => undefined;
  const container = navigator.serviceWorker;
  // A page that already had a worker reloads once when a new one takes over. A first install does not reload.
  const hadController = container.controller !== null;
  let reloading = false;
  const onControllerChange = () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  };
  container.addEventListener('controllerchange', onControllerChange);

  const register = async () => {
    const registration = await container.register('/sw.js');
    const offer = () => {
      const waiting = registration.waiting;
      if (waiting && hadController) onUpdateReady(() => { waiting.postMessage('SKIP_WAITING'); });
    };
    offer();
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      installing?.addEventListener('statechange', () => { if (installing.state === 'installed') offer(); });
    });
  };
  const start = () => { void register().catch(() => undefined); };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });

  return () => { container.removeEventListener('controllerchange', onControllerChange); };
}
