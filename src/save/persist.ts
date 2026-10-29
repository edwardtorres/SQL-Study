// Asks the browser to keep this site's storage instead of clearing it under pressure. The browser decides; the answer is shown
// in Settings as it stands, not as a promise.
export type Persistence = 'granted' | 'not-granted' | 'unsupported';

export async function requestPersistence(): Promise<Persistence> {
  if (!navigator.storage?.persist) return 'unsupported';
  try {
    return (await navigator.storage.persist()) ? 'granted' : 'not-granted';
  } catch {
    return 'unsupported';
  }
}

export async function currentPersistence(): Promise<Persistence> {
  if (!navigator.storage?.persisted) return 'unsupported';
  try {
    return (await navigator.storage.persisted()) ? 'granted' : 'not-granted';
  } catch {
    return 'unsupported';
  }
}
