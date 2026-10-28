import { useEffect, useRef } from 'react';
import { Trophy } from 'lucide-react';

// A short promotion moment. Focus moves to its button, Escape closes it, and the new rank is announced as a status.
export default function Promotion({ rank, onClose }: { rank: string; onClose: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    button.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return <div className="promotion-backdrop">
    <section className="promotion" role="dialog" aria-modal="true" aria-labelledby="promotion-title">
      <span className="promotion-icon"><Trophy size={26} /></span>
      <p className="eyebrow">PROMOTION</p>
      <h2 id="promotion-title">You are now {rank}.</h2>
      <p role="status">Ranks come from mastered chapters, so this one was earned on the desks.</p>
      <button ref={button} className="primary-button" onClick={onClose}>Back to the desks</button>
    </section>
  </div>;
}
