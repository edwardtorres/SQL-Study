import { lazy, Suspense, useCallback, useState } from 'react';
import { ChevronRight, Leaf, LoaderCircle, Sparkles, ShieldCheck, Table2 } from 'lucide-react';
import { curriculum, openChapterCount } from '../data';
import { items } from '../data/catalog';
import type { Challenge } from '../core/types';
import { emptyProgress, restoreSave, SAVE_KEY, type LessonProgress, type SaveV2, type TicketProgress } from '../save/progress';
import { ChapterView, HomeView, lessonSectionIds } from './Chapters';
import { partLabel, summarizeChapter } from './model';

const Workspace = lazy(() => import('./Workspace'));
const LessonView = lazy(() => import('./LessonView'));
const Scratchpad = lazy(() => import('./Scratchpad'));

type View =
  | { name: 'home' }
  | { name: 'chapter'; chapterId: number }
  | { name: 'lesson'; chapterId: number }
  | { name: 'item'; itemId: string }
  | { name: 'scratch' };

function initialState() {
  try { return restoreSave(localStorage.getItem(SAVE_KEY)); }
  catch { return { ...restoreSave(null), writable: false }; }
}
const chapterOf = (id: number) => curriculum.find((chapter) => chapter.id === id);
const shelf = (chapterId: number) => items.filter((item) => item.chapterId === chapterId);

export default function App() {
  const [restored] = useState(initialState);
  const [save, setSave] = useState<SaveV2>(restored.save);
  const [view, setView] = useState<View>({ name: 'home' });
  const [saveFailed, setSaveFailed] = useState(!restored.writable);
  const persist = useCallback((next: SaveV2) => {
    if (!restored.writable) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(next)); }
    catch { setSaveFailed(true); }
  }, [restored.writable]);
  const updateTicket = useCallback((id: string, update: (previous: TicketProgress) => TicketProgress) => {
    setSave((previous) => {
      const item = items.find((candidate) => candidate.id === id);
      const next = { ...previous, tickets: { ...previous.tickets, [id]: update(previous.tickets[id] ?? emptyProgress(item?.starterSql)) } };
      persist(next);
      return next;
    });
  }, [persist]);
  const answerLesson = useCallback((sectionId: string, progress: LessonProgress) => {
    setSave((previous) => {
      const next = { ...previous, lessons: { ...previous.lessons, [sectionId]: progress } };
      persist(next);
      return next;
    });
  }, [persist]);
  const openItem = (item: Challenge) => {
    const next = { ...save, activeTicket: item.id };
    setSave(next);
    persist(next);
    setView({ name: 'item', itemId: item.id });
    window.scrollTo({ top: 0 });
  };
  const go = (next: View) => {
    setView(next);
    window.scrollTo({ top: 0 });
  };
  const xp = Object.values(save.tickets).reduce((sum, ticket) => sum + ticket.xp, 0);
  const current = view.name === 'chapter' || view.name === 'lesson' ? chapterOf(view.chapterId) : undefined;
  const item = view.name === 'item' ? items.find((candidate) => candidate.id === view.itemId) : undefined;
  const crumb = view.name === 'home' ? 'Chapters'
    : view.name === 'scratch' ? 'Scratchpad'
      : view.name === 'item' && item ? `Chapter ${item.chapterId} · ${item.title}`
        : current ? `Chapter ${current.id}${view.name === 'lesson' ? ' · Lesson' : ''}` : 'Chapters';
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to main content</a>
      <aside className="rail" aria-label="Data desk navigation">
        <button className="brand" onClick={() => { go({ name: 'home' }); }} title="Return to chapters">
          <span className="brand-symbol"><Leaf size={24} strokeWidth={1.7} /></span>
          <span>LARKSPUR <span className="brand-small">FREIGHT</span></span>
        </button>
        <div className="rail-divider" />
        <span className="rail-eyebrow">THE DATA DESK</span>
        <nav aria-label="Chapters" className="chapter-nav">
          {curriculum.slice(0, openChapterCount).map((chapter) => {
            const summary = summarizeChapter(items, save, chapter.id, lessonSectionIds(chapter.id));
            return <button key={chapter.id} className={`nav-button ${current?.id === chapter.id ? 'is-current' : ''}`} aria-current={current?.id === chapter.id ? 'page' : undefined} onClick={() => { go({ name: 'chapter', chapterId: chapter.id }); }}>
              <span>{chapter.id}. {chapter.title}</span><span className="nav-count">{summary.passed}/{summary.graded}</span>
            </button>;
          })}
        </nav>
        <button className={`nav-button ${view.name === 'scratch' ? 'is-current' : ''}`} onClick={() => { go({ name: 'scratch' }); }}><Table2 size={18} /> Scratchpad</button>
        <div className="rail-shift">
          <span className="rail-eyebrow">YOUR SHIFT</span>
          <div className="shift-heading"><span>Make yourself useful.</span><Sparkles size={18} /></div>
          <p>{xp} XP earned in this browser.</p>
        </div>
        <div className="rail-bottom"><ShieldCheck size={16} /><span>Practice data. Real PostgreSQL.<br /><small>All companies and people are fictional.</small></span></div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">WORKSPACE <ChevronRight size={14} /><span>{crumb}</span></div>
          <div className="topbar-right"><span className="step-badge">STEP 2 · LESSONS</span><span className="xp"><Sparkles size={15} />{xp} XP</span><span className="avatar" aria-label="Your intern profile">YOU</span></div>
        </header>
        <main id="main" className={view.name === 'item' || view.name === 'scratch' ? 'workspace-main' : 'board-main'}>
          {saveFailed && <p role="alert" className="save-warning">{restored.status === 'future' ? 'Your save belongs to a newer app version. This session will not overwrite it.' : restored.status === 'corrupt' ? 'Your saved progress could not be read. The original is preserved; this session continues without saving.' : 'Progress could not be saved on this browser. Keep this tab open to retain this session.'}</p>}
          <Suspense fallback={<div className="loading-card" role="status"><LoaderCircle className="spin" /> Opening the desk…</div>}>
            {view.name === 'home' && <HomeView chapters={curriculum.slice(0, openChapterCount)} items={items} save={save} onChapter={(chapterId) => { go({ name: 'chapter', chapterId }); }} onScratch={() => { go({ name: 'scratch' }); }} onItem={openItem} />}
            {view.name === 'chapter' && current && <ChapterView chapter={current} items={items} save={save} onLesson={() => { go({ name: 'lesson', chapterId: current.id }); }} onItem={openItem} onScratch={() => { go({ name: 'scratch' }); }} onBack={() => { go({ name: 'home' }); }} />}
            {view.name === 'lesson' && current && <LessonView chapter={current} lessonProgress={save.lessons} onAnswer={answerLesson} onBack={() => { go({ name: 'chapter', chapterId: current.id }); }} onPractice={() => { go({ name: 'chapter', chapterId: current.id }); }} />}
            {view.name === 'scratch' && <Scratchpad onBack={() => { go({ name: 'home' }); }} />}
            {view.name === 'item' && item && <Workspace
              key={item.id}
              challenge={item}
              code={`CH${item.chapterId} · ${shelf(item.chapterId).indexOf(item) + 1}`}
              partLabel={partLabel(item, items)}
              backLabel={chapterOf(item.chapterId) ? `Chapter ${item.chapterId}` : 'Chapters'}
              progress={save.tickets[item.id] ?? emptyProgress(item.starterSql)}
              update={(fn) => { updateTicket(item.id, fn); }}
              onBack={() => { go(chapterOf(item.chapterId) ? { name: 'chapter', chapterId: item.chapterId } : { name: 'home' }); }}
            />}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
