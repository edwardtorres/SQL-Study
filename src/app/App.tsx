import { lazy, Suspense, useCallback, useState } from 'react';
import { ArrowRight, Boxes, Check, ChevronRight, ClipboardList, Database, Leaf, LoaderCircle, Route, ShieldCheck, Sparkles, Terminal, Trophy } from 'lucide-react';
import { challenges, companyName } from '../data';
import type { Challenge } from '../core/types';
import { emptyProgress, restoreSave, SAVE_KEY, type SaveV1, type TicketProgress } from '../save/progress';

const Workspace = lazy(() => import('./Workspace'));
function initialState() {
  try { return restoreSave(localStorage.getItem(SAVE_KEY)); }
  catch { return { ...restoreSave(null), writable: false }; }
}
const ticketCodes = ['JF-001', 'JF-002', 'JF-003'];
const ticketIcons = [Boxes, Database, Route];
const levels = ['First query', 'Find the bug', 'Window functions'];
export default function App() {
  const [restored] = useState(initialState);
  const [save, setSave] = useState<SaveV1>(restored.save);
  // Start at the board so restoring a draft never loads the engine before a SQL screen opens.
  const [active, setActive] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(!restored.writable);
  const persist = useCallback((next: SaveV1) => {
    if (!restored.writable) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(next)); }
    catch { setSaveFailed(true); }
  }, [restored.writable]);
  const updateTicket = useCallback((id: string, update: (previous: TicketProgress) => TicketProgress) => {
    setSave((previous) => {
      const next = { ...previous, tickets: { ...previous.tickets, [id]: update(previous.tickets[id] ?? emptyProgress(challenges.find((ticket) => ticket.id === id)?.starterSql)) } };
      persist(next);
      return next;
    });
  }, [persist]);
  const open = (challenge: Challenge) => {
    const next = { ...save, activeTicket: challenge.id };
    setSave(next);
    persist(next);
    setActive(challenge.id);
    window.scrollTo({ top: 0 });
  };
  const completed = challenges.filter((ticket) => save.tickets[ticket.id]?.passed).length;
  const xp = Object.values(save.tickets).reduce((sum, ticket) => sum + ticket.xp, 0);
  const challenge = challenges.find((ticket) => ticket.id === active);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to main content</a>
      <aside className="rail" aria-label="Data desk navigation">
        <button className="brand" onClick={() => { setActive(null); }} title="Return to ticket board">
          <span className="brand-symbol"><Leaf size={24} strokeWidth={1.7} /></span>
          <span>LARKSPUR <span className="brand-small">FREIGHT</span></span>
        </button>
        <div className="rail-divider" />
        <span className="rail-eyebrow">THE DATA DESK</span>
        <button className={`nav-button ${!challenge ? 'is-current' : ''}`} onClick={() => { setActive(null); }}><ClipboardList size={18} /> Ticket board <span className="nav-count">3</span></button>
        <div className="rail-shift">
          <span className="rail-eyebrow">YOUR FIRST SHIFT</span>
          <div className="shift-heading"><span>Make yourself useful.</span><Sparkles size={18} /></div>
          <p>Small queries. Real problems.<br />One ticket at a time.</p>
          <div className="shift-progress" role="progressbar" aria-label="Tickets passed" aria-valuenow={completed} aria-valuemin={0} aria-valuemax={3}><span style={{ width: `${completed / 3 * 100}%` }} /></div>
          <span className="rail-caption">{completed} / 3 tickets passed</span>
        </div>
        <div className="rail-bottom"><ShieldCheck size={16} /><span>Practice data. Real PostgreSQL.<br /><small>All companies and people are fictional.</small></span></div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">WORKSPACE <ChevronRight size={14} /><span>{challenge ? ticketCodes[challenges.indexOf(challenge)] : 'Ticket board'}</span></div>
          <div className="topbar-right"><span className="step-badge">STEP 1 · FIELD TEST</span><span className="xp"><Sparkles size={15} />{xp} XP</span><span className="avatar" aria-label="Your intern profile">YOU</span></div>
        </header>
        <main id="main" className={challenge ? 'workspace-main' : 'board-main'}>
          {saveFailed && <p role="alert" className="save-warning">{restored.status === 'future' ? 'Your save belongs to a newer app version. This session will not overwrite it.' : restored.status === 'corrupt' ? 'Your saved progress could not be read. The original is preserved; this session continues without saving.' : 'Progress could not be saved on this browser. Keep this tab open to retain this session.'}</p>}
          {challenge ? (
            <Suspense fallback={<div className="loading-card" role="status"><LoaderCircle className="spin" /> Opening your SQL workspace…</div>}>
              <Workspace key={challenge.id} challenge={challenge} code={ticketCodes[challenges.indexOf(challenge)]!} progress={save.tickets[challenge.id] ?? emptyProgress(challenge.starterSql)} update={(fn) => { updateTicket(challenge.id, fn); }} onBack={() => { setActive(null); }} />
            </Suspense>
          ) : <>
            <div className="board-intro"><div><p className="eyebrow"><span className="status-dot" /> DISPATCH IS OPEN</p><h1>Your first day.<br /><span>Your first real queries.</span></h1><p className="intro-copy">Welcome to the data desk at {companyName}. Your colleagues have a few things that need figuring out.</p></div><div className="desk-illustration" aria-hidden="true"><div className="illustration-orbit orbit-a" /><div className="illustration-orbit orbit-b" /><div className="parcel parcel-back"><Route size={38} strokeWidth={1} /></div><div className="parcel parcel-front"><Database size={44} strokeWidth={1.2} /><span>HANDLE WITH SQL</span></div><span className="float-tag"><Check size={13} /> Ready for dispatch</span></div></div>
            <div className="shift-note"><span className="note-icon"><Terminal size={19} /></span><p><strong>No experience required.</strong> Open a ticket for a short briefing, an editable example, and a real SQL workspace. Hints are always available.</p><span className="note-number">01 / 03</span></div>
            <div className="section-heading"><div><p className="eyebrow">INCOMING WORK</p><h2>Pick up a ticket</h2></div><span className="section-meta">3 sample tickets · work at your pace</span></div>
            <div className="ticket-grid">{challenges.map((ticket, index) => {
              const Icon = ticketIcons[index]!;
              const passed = save.tickets[ticket.id]?.passed;
              return <article className="ticket-card" key={ticket.id}>
                <div className="ticket-card-top"><span className={`ticket-icon tone-${index}`}><Icon size={23} strokeWidth={1.6} /></span><span className={`ticket-badge ${passed ? 'passed-badge' : ''}`}>{passed ? <><Check size={12} /> Passed</> : levels[index]}</span></div>
                <span className="ticket-code">{ticketCodes[index]}</span><h3>{ticket.title}</h3><p>{ticket.summary}</p>
                <div className="colleague"><span className="colleague-avatar">{ticket.colleague.split(' ').map((part) => part[0]).join('')}</span><span><strong>{ticket.colleague}</strong><small>{ticket.colleagueRole}</small></span></div>
                <button className="ticket-open" onClick={() => { open(ticket); }}>{passed ? 'Revisit ticket' : save.tickets[ticket.id]?.draft ? 'Continue ticket' : 'Open ticket'}<ArrowRight size={17} /></button>
              </article>;
            })}</div>
            <div className="board-footer"><span><ShieldCheck size={15} />{saveFailed ? 'Saving unavailable' : 'Progress stays in this browser'}</span><span><Trophy size={15} />Pass all three to finish this practice shift</span></div>
          </>}
        </main>
      </div>
    </div>
  );
}
