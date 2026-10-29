import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

// Settings. The install help and the offline status live here; the save-protection panels are added to this page too.
interface Props { onBack: () => void }

type Offline = 'checking' | 'ready' | 'pending' | 'unsupported';

export default function Settings({ onBack }: Props) {
  const [offline, setOffline] = useState<Offline>('checking');

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      setOffline('unsupported');
      return;
    }
    // The page is controlled once the worker has installed and claimed it. Before that, the status says so.
    setOffline(navigator.serviceWorker.controller ? 'ready' : 'pending');
  }, []);

  const offlineCopy = offline === 'ready'
    ? 'Available offline. A SQL screen you have opened is saved for offline use, so its editor and engine work without a connection.'
    : offline === 'pending'
      ? 'Saving the desk for offline use. Reload once this page has loaded. Then open a SQL screen once, so its editor and engine are saved too.'
      : offline === 'unsupported'
        ? 'This browser cannot save the desk for offline use.'
        : 'Checking offline use…';

  return <div className="chapter-main">
    <button className="text-button" onClick={onBack}><ArrowLeft size={15} />All desks</button>
    <header className="chapter-header">
      <p className="eyebrow">SETTINGS</p>
      <h1>Settings</h1>
    </header>
    <section className="practice-section" aria-labelledby="offline-title">
      <h2 id="offline-title">Offline use</h2>
      <p role="status">{offlineCopy}</p>
    </section>
    <section className="practice-section" aria-labelledby="install-title">
      <h2 id="install-title">Install on iPhone</h2>
      <ol className="install-steps">
        <li>Open this page in Safari.</li>
        <li>Tap the Share button.</li>
        <li>Choose Add to Home Screen, then tap Add.</li>
      </ol>
      <p>The Home Screen app opens full screen. Open a SQL screen once in it before you go offline, so the app saves its engine.</p>
    </section>
  </div>;
}
