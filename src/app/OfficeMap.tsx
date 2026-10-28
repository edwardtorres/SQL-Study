import { useRef, type ReactNode } from 'react';
import { ArrowRight, Database, Download, Sparkles, Table2, Upload } from 'lucide-react';
import type { Chapter } from '../data/curriculum';
import type { ItemMeta } from '../data/itemIndex';
import { BADGES, currentStreak, DESK_LABEL, deskStatus, entryLevelReady, levelOf, rankOf, readinessAll, totalXp } from '../game/rules';
import type { SaveV3 } from '../save/progress';
import './office.css';

const DESK_NOTE: Record<string, string> = {
  open: 'Ready to start. Read the lesson first, or test out with the boss.',
  'in-progress': 'Keep going: finish the lesson and the tickets, then the boss.',
  mastered: 'Mastered. Every boss part has passed.',
  'tested-out': 'Mastered by test-out. The boss passed without the lessons.',
};

// The first part of a chapter's boss, which a test-out opens directly.
const firstBossPart = (items: readonly ItemMeta[], chapterId: number): ItemMeta | undefined => items.find((item) => item.chapterId === chapterId && item.bossGroup !== undefined);

export default function OfficeMap({ items, save, today, chapters, notice, canImport, onChapter, onBossTestOut, onScratch, onExport, onImport }: {
  items: readonly ItemMeta[]; save: SaveV3; today: string; chapters: readonly Chapter[]; notice: ReactNode; canImport: boolean;
  onChapter: (chapterId: number) => void; onBossTestOut: (item: ItemMeta) => void; onScratch: () => void; onExport: () => void; onImport: (file: File) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const xp = totalXp(save);
  const level = levelOf(xp);
  const streak = currentStreak(save.streak, today);
  const readiness = readinessAll(items, save);
  const readyCount = readiness.filter((row) => row.ready).length;
  const rank = rankOf(save);
  return <>
    <section className="office-intro" aria-labelledby="office-title">
      <p className="eyebrow"><span className="status-dot" /> LARKSPUR FREIGHT · OFFICE</p>
      <h1 id="office-title">Your desks</h1>
      <p className="intro-copy">Master a chapter to open the next desk. Each boss ticket has every part pass before the chapter counts.</p>
    </section>
    <section className="office-strip" aria-label="Your standing">
      <div className="office-stat"><small>Rank</small><strong>{rank}</strong></div>
      <div className="office-stat"><small>Level {level.level} · {xp} XP</small><div className="level-bar" role="progressbar" aria-label="Progress to the next level" aria-valuemin={0} aria-valuemax={level.span} aria-valuenow={level.into}><span style={{ width: `${level.into / level.span * 100}%` }} /></div></div>
      <div className="office-stat"><small>Daily streak</small><strong>{streak === 0 ? 'No streak today' : `${streak} ${streak === 1 ? 'day' : 'days'}`}</strong><small>Pass 3 different items in a day.</small></div>
      <div className="office-stat"><small>Readiness</small><strong>{entryLevelReady(readiness) ? 'Entry-level ready' : `${readyCount} of ${readiness.length} ready`}</strong></div>
    </section>
    <div className="section-heading"><div><p className="eyebrow">THE OFFICE</p><h2>Chapters in order</h2></div></div>
    <ol className="desk-list" aria-label="Chapter desks">{chapters.map((chapter) => {
      const status = deskStatus(items, save, chapter.id);
      const locked = status === 'locked';
      const boss = firstBossPart(items, chapter.id);
      const note = locked ? `Master chapter ${chapter.id - 1} to open this desk.` : DESK_NOTE[status];
      return <li key={chapter.id} className={`desk is-${status}`}>
        <div className="desk-title"><p className="ticket-code">DESK {chapter.id}</p><h3>{chapter.title}</h3></div>
        <span className={`desk-status status-${status}`}>{DESK_LABEL[status]}</span>
        <p id={`desk-note-${chapter.id}`}>{note}</p>
        <div className="desk-actions">
          {locked
            ? <button className="secondary-button" disabled aria-describedby={`desk-note-${chapter.id}`}>Locked</button>
            : <button className="primary-button" onClick={() => { onChapter(chapter.id); }}>Open chapter {chapter.id}<ArrowRight size={15} /></button>}
          {status === 'open' && boss && <button className="secondary-button" onClick={() => { onBossTestOut(boss); }}>Boss test-out</button>}
        </div>
      </li>;
    })}</ol>
    <section className="badge-panel" aria-labelledby="badges-title">
      <div className="section-heading"><div><p className="eyebrow">BADGES</p><h2 id="badges-title">Milestones</h2></div><span className="section-meta">{Object.keys(save.badges).length} of {BADGES.length} earned</span></div>
      <ul className="badge-list">{BADGES.map((badge) => {
        const earned = save.badges[badge.id] !== undefined;
        return <li key={badge.id} className={`badge ${earned ? 'is-earned' : ''}`}><span>{badge.title}</span><small>{earned ? 'Earned' : 'Not yet'}</small></li>;
      })}</ul>
    </section>
    <section className="readiness-panel" aria-labelledby="readiness-title">
      <div className="section-heading"><div><p className="eyebrow">READINESS</p><h2 id="readiness-title">Thirteen competencies</h2></div><span className="section-meta">From first passes on independent tickets and boss parts</span></div>
      <ul className="readiness-list">{readiness.map((row) => {
        const title = chapters.find((chapter) => chapter.id === row.chapterId)?.title ?? `Chapter ${row.chapterId}`;
        return <li key={row.chapterId} className="readiness-row">
          <span>{title}</span>
          {row.score === null
            ? <span className="muted">Not enough data · {row.scored} of 5 scored</span>
            : <span className={row.ready ? 'readiness-ready' : ''}>{Math.round(row.score * 100)}% {row.ready ? '· ready' : ''}</span>}
        </li>;
      })}</ul>
      <p className="table-caption">Ready means a score of 80% or more over your last 10 scored first passes. Hinted passes count half. Reveals count nothing.</p>
    </section>
    <section className="office-footer" aria-label="Progress file">
      <div className="footer-actions">
        <button className="secondary-button" onClick={onExport}><Download size={15} />Export progress</button>
        <button className="secondary-button" disabled={!canImport} onClick={() => { fileInput.current?.click(); }}><Upload size={15} />Import progress</button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onImport(file); }} />
      </div>
      {!canImport && <p className="table-caption">Import is off while the saved copy is unreadable or from a newer version.</p>}
      {notice}
    </section>
    <div className="section-heading"><div><p className="eyebrow">TOOLS</p><h2>Other desk tools</h2></div></div>
    <div className="desk-list">
      <div className="desk is-open"><div className="desk-title"><p className="ticket-code">SCRATCHPAD</p><h3>Free query</h3></div><span className="desk-status status-open">Not graded</span><p>Run any read-only query against the visible sample. Nothing is graded, and nothing is saved.</p><div className="desk-actions"><button className="secondary-button" onClick={onScratch}><Table2 size={16} />Open scratchpad<ArrowRight size={15} /></button></div></div>
    </div>
    <div className="board-footer"><span><Sparkles size={15} />Progress stays in this browser</span><span><Database size={15} />Export to keep a copy</span></div>
  </>;
}
