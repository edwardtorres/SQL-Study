import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { ChevronRight, Leaf, LoaderCircle, Settings as SettingsIcon, Sparkles, ShieldCheck, Table2 } from 'lucide-react';
import { curriculum, reviewSampleIdFor } from '../data';
import { itemIndex, itemMetaById, type ItemMeta } from '../data/itemIndex';
import { loadItem } from '../data/items/loader';
import type { Challenge } from '../core/types';
import { applySubmission, deskStatus, isOpen, localDay, rankOf, readinessAll, revealSolution, takeHint, totalXp, type GradeResult } from '../game/rules';
import { dailyReviewSet, needsReviewSet, weakSpots, type ReviewPool } from '../game/review';
import { emptyProgress, restoreSave, SAVE_KEY, type LessonProgress, type SaveV5, type TicketProgress } from '../save/progress';
import { exportSave, importSave } from '../save/transfer';
import { ChapterView, lessonSectionIds } from './Chapters';
import OfficeMap from './OfficeMap';
import Promotion from './Promotion';
import { partLabel, summarizeChapter } from './model';
import { registerOfflineWorker, type ApplyUpdate } from '../pwa/register';

const Workspace = lazy(() => import('./Workspace'));
const LessonView = lazy(() => import('./LessonView'));
const Scratchpad = lazy(() => import('./Scratchpad'));
const Review = lazy(() => import('./Review'));
const WeakSpots = lazy(() => import('./WeakSpots'));
const Interview = lazy(() => import('./Interview'));
const Settings = lazy(() => import('./Settings'));

type View =
  | { name: 'home' }
  | { name: 'chapter'; chapterId: number }
  | { name: 'lesson'; chapterId: number }
  // review is set when the ticket is opened from a review page: its re-solve runs on that review sample.
  | { name: 'item'; itemId: string; review: { sampleId: string } | null }
  | { name: 'daily' }
  | { name: 'needs'; chapterId: number }
  | { name: 'weak' }
  | { name: 'interview' }
  | { name: 'scratch' }
  | { name: 'settings' };

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

function initialState() {
  try { return restoreSave(localStorage.getItem(SAVE_KEY), itemIndex); }
  catch { return { ...restoreSave(null, itemIndex), writable: false }; }
}
const chapterOf = (id: number) => curriculum.find((chapter) => chapter.id === id);
const chapterIds = curriculum.map((chapter) => chapter.id);
const poolOf = (save: SaveV5): ReviewPool => ({ items: itemIndex, isOpen: (chapterId) => isOpen(save, chapterId) });

export default function App() {
  const [restored] = useState(initialState);
  const [save, setSave] = useState<SaveV5>(restored.save);
  const [view, setView] = useState<View>({ name: 'home' });
  const review = view.name === 'item' ? view.review : null;
  const [saveFailed, setSaveFailed] = useState(!restored.writable);
  const [promotion, setPromotion] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<SaveV5 | null>(null);
  const [notice, setNotice] = useState<{ tone: 'status' | 'alert'; text: string } | null>(null);
  // A waiting offline worker offers a reload. The learner decides when, so a deploy never interrupts a query.
  const [applyUpdate, setApplyUpdate] = useState<ApplyUpdate | null>(null);

  useEffect(() => {
    return registerOfflineWorker((apply) => { setApplyUpdate(() => apply); });
  }, []);
  const persist = useCallback((next: SaveV5) => {
    if (!restored.writable) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(next)); }
    catch { setSaveFailed(true); }
  }, [restored.writable]);
  // Every change that depends on the current save goes through commit, so the state and the stored copy stay together.
  const commit = useCallback((next: SaveV5) => {
    setSave(next);
    persist(next);
  }, [persist]);
  const updateTicket = useCallback((id: string, update: (previous: TicketProgress) => TicketProgress) => {
    setSave((previous) => {
      const item = itemMetaById(id);
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
  const closePromotion = useCallback(() => { setPromotion(null); }, []);
  const openItem = (item: ItemMeta, reviewing = false) => {
    const next = { ...save, activeTicket: item.id };
    commit(next);
    // A review re-solve names its sample now, so the sample stays the same for the whole visit.
    setView({ name: 'item', itemId: item.id, review: reviewing ? { sampleId: reviewSampleIdFor(save.tickets[item.id]?.attempts ?? 0) } : null });
    window.scrollTo({ top: 0 });
  };
  const go = (next: View) => {
    setView(next);
    window.scrollTo({ top: 0 });
  };
  // Grading applies the rules to the save as it is now. The result carries the XP, the badges and any promotion.
  // A review attempt is graded as a review, and a reveal counts only when the ticket's solution was revealed.
  const grade = (item: ItemMeta, referenceSql: string, submission: { passed: boolean; sql: string; tag: string | null; hinted: boolean }): GradeResult => {
    const at = Date.now();
    const reviewing = review !== null;
    const result = applySubmission(save, itemIndex, item, referenceSql, {
      passed: submission.passed, sql: submission.sql, at, day: localDay(at, zone()), tag: submission.tag,
      reviewing, hinted: submission.hinted, revealed: reviewing && (save.tickets[item.id]?.solutionRevealed ?? false),
    });
    commit(result.save);
    if (result.promoted) setPromotion(result.promoted);
    return result;
  };
  const exportProgress = () => {
    const url = URL.createObjectURL(new Blob([exportSave(save)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'larkspur-progress.json';
    link.click();
    window.setTimeout(() => { URL.revokeObjectURL(url); }, 1_000);
    setNotice({ tone: 'status', text: 'Progress exported. Keep the file somewhere safe.' });
  };
  const importProgress = async (file: File) => {
    try {
      const result = importSave(await file.text(), itemIndex);
      if (result.ok) { setPendingImport(result.save); setNotice(null); }
      else { setPendingImport(null); setNotice({ tone: 'alert', text: result.reason }); }
    } catch {
      setPendingImport(null);
      setNotice({ tone: 'alert', text: 'That file could not be read. Your progress is unchanged.' });
    }
  };
  const confirmImport = () => {
    if (!pendingImport) return;
    commit(pendingImport);
    setPendingImport(null);
    setNotice({ tone: 'status', text: 'Progress replaced from the file.' });
  };
  const today = localDay(Date.now(), zone());
  // The Daily Review set is saved the first time its page shows each day, so a reload does not reshuffle it.
  useEffect(() => {
    if (view.name !== 'daily' || save.dailyReview?.day === today) return;
    const weakest = weakSpots(save, readinessAll(save, chapterIds)).competencies.map((row) => row.chapterId);
    commit({ ...save, dailyReview: { day: today, itemIds: dailyReviewSet(save, today, weakest, poolOf(save)) } });
  }, [commit, save, today, view.name]);
  const xp = totalXp(save);
  const rank = rankOf(save);
  const current = view.name === 'chapter' || view.name === 'lesson' ? chapterOf(view.chapterId) : undefined;
  const meta = view.name === 'item' ? itemMetaById(view.itemId) : undefined;
  // The ticket's full definition loads with its chapter; the view shows a loading card until it arrives.
  const [loaded, setLoaded] = useState<Challenge | null>(null);
  const itemId = view.name === 'item' ? view.itemId : undefined;
  useEffect(() => {
    if (itemId === undefined) return;
    let cancelled = false;
    loadItem(itemId).then((found) => { if (!cancelled) setLoaded(found); }).catch(() => { if (!cancelled) setLoaded(null); });
    return () => { cancelled = true; };
  }, [itemId]);
  const item = itemId !== undefined && loaded?.id === itemId ? loaded : undefined;
  const crumb = view.name === 'home' ? 'Office'
    : view.name === 'scratch' ? 'Scratchpad'
      : view.name === 'daily' ? 'Daily Review'
        : view.name === 'weak' ? 'Weak Spots'
          : view.name === 'interview' ? 'Interview'
          : view.name === 'settings' ? 'Settings'
          : view.name === 'needs' ? `Needs review · Chapter ${view.chapterId}`
      : view.name === 'item' && meta ? `Chapter ${meta.chapterId} · ${meta.title}`
        : current ? `Chapter ${current.id}${view.name === 'lesson' ? ' · Lesson' : ''}` : 'Office';
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to main content</a>
      <aside className="rail" aria-label="Data desk navigation">
        <button className="brand" onClick={() => { go({ name: 'home' }); }} title="Return to the office">
          <span className="brand-symbol"><Leaf size={24} strokeWidth={1.7} /></span>
          <span>LARKSPUR <span className="brand-small">FREIGHT</span></span>
        </button>
        <div className="rail-divider" />
        <span className="rail-eyebrow">THE DATA DESK</span>
        <nav aria-label="Chapters" className="chapter-nav">
          {curriculum.map((chapter) => {
            const status = deskStatus(itemIndex, save, chapter.id);
            const summary = summarizeChapter(itemIndex, save, chapter.id, lessonSectionIds(chapter.id));
            return <button key={chapter.id} className={`nav-button ${current?.id === chapter.id ? 'is-current' : ''}`} aria-current={current?.id === chapter.id ? 'page' : undefined} disabled={status === 'locked'} onClick={() => { go({ name: 'chapter', chapterId: chapter.id }); }}>
              <span>{chapter.id}. {chapter.title}</span><span className="nav-count">{status === 'locked' ? 'Locked' : `${summary.passed}/${summary.graded}`}</span>
            </button>;
          })}
        </nav>
        <button className={`nav-button ${view.name === 'scratch' ? 'is-current' : ''}`} onClick={() => { go({ name: 'scratch' }); }}><Table2 size={18} /> Scratchpad</button>
        <button className={`nav-button settings-nav ${view.name === 'settings' ? 'is-current' : ''}`} aria-label="Settings" onClick={() => { go({ name: 'settings' }); }}><SettingsIcon size={18} /><span className="nav-label"> Settings</span></button>
        <div className="rail-shift">
          <span className="rail-eyebrow">YOUR SHIFT</span>
          <div className="shift-heading"><span>Make yourself useful.</span><Sparkles size={18} /></div>
          <p>{rank} · {xp} XP in this browser.</p>
        </div>
        <div className="rail-bottom"><ShieldCheck size={16} /><span>Practice data. Real PostgreSQL.<br /><small>All companies and people are fictional.</small></span></div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">WORKSPACE <ChevronRight size={14} /><span>{crumb}</span></div>
          <div className="topbar-right"><span className="rank-pill">{rank}</span><span className="xp"><Sparkles size={15} />{xp} XP</span><span className="avatar" aria-label="Your intern profile">YOU</span></div>
        </header>
        <main id="main" className={view.name === 'item' || view.name === 'scratch' ? 'workspace-main' : 'board-main'}>
          {saveFailed && <p role="alert" className="save-warning">{restored.status === 'future' ? 'Your save belongs to a newer app version. This session will not overwrite it.' : restored.status === 'corrupt' ? 'Your saved progress could not be read. The original is preserved; this session continues without saving.' : 'Progress could not be saved on this browser. Keep this tab open to retain this session.'}</p>}
          {applyUpdate && <section className="update-banner" aria-label="Update available">
            <p>A new version of the desk is ready. Your progress is saved, so reloading is safe.</p>
            <button className="primary-button" onClick={applyUpdate}>Reload to update</button>
          </section>}
          <Suspense fallback={<div className="loading-card" role="status"><LoaderCircle className="spin" /> Opening the desk…</div>}>
            {view.name === 'home' && <OfficeMap
              items={itemIndex} save={save} today={today} chapters={curriculum} canImport={restored.writable} onScratch={() => { go({ name: 'scratch' }); }}
              onDaily={() => { go({ name: 'daily' }); }} onWeak={() => { go({ name: 'weak' }); }} onNeeds={(chapterId) => { go({ name: 'needs', chapterId }); }}
              onInterview={() => { go({ name: 'interview' }); }}
              onChapter={(chapterId) => { go({ name: 'chapter', chapterId }); }} onBossTestOut={openItem} onExport={exportProgress} onImport={(file) => { void importProgress(file); }}
              notice={<>
                {pendingImport && <section className="import-confirm" aria-labelledby="import-title">
                  <h2 id="import-title">Replace this browser’s progress?</h2>
                  <p>The file holds {totalXp(pendingImport)} XP and {Object.keys(pendingImport.chapters).length} mastered chapters. Your current progress is replaced by it.</p>
                  <div className="button-row"><button className="primary-button" onClick={confirmImport}>Replace progress</button><button className="secondary-button" onClick={() => { setPendingImport(null); }}>Keep current progress</button></div>
                </section>}
                {notice && <p role={notice.tone} className={notice.tone === 'alert' ? 'query-error' : 'table-caption'}>{notice.text}</p>}
              </>}
            />}
            {view.name === 'chapter' && current && <ChapterView chapter={current} items={itemIndex} save={save} onLesson={() => { go({ name: 'lesson', chapterId: current.id }); }} onItem={openItem} onScratch={() => { go({ name: 'scratch' }); }} onBack={() => { go({ name: 'home' }); }} />}
            {view.name === 'lesson' && current && <LessonView chapter={current} lessonProgress={save.lessons} onAnswer={answerLesson} onBack={() => { go({ name: 'chapter', chapterId: current.id }); }} onPractice={() => { go({ name: 'chapter', chapterId: current.id }); }} />}
            {view.name === 'scratch' && <Scratchpad onBack={() => { go({ name: 'home' }); }} />}
            {view.name === 'settings' && <Settings onBack={() => { go({ name: 'home' }); }} />}
            {view.name === 'daily' && <Review mode="daily" items={itemIndex} save={save} ids={save.dailyReview?.day === today ? save.dailyReview.itemIds : []} chapterTitle={undefined} onOpen={(item) => { openItem(item, true); }} onBack={() => { go({ name: 'home' }); }} />}
            {view.name === 'needs' && <Review mode="needs" items={itemIndex} save={save} ids={needsReviewSet(save, view.chapterId, poolOf(save))} chapterTitle={chapterOf(view.chapterId)?.title} onOpen={(item) => { openItem(item, true); }} onBack={() => { go({ name: 'home' }); }} />}
            {view.name === 'interview' && <Interview save={save} items={itemIndex} today={today} commit={commit} setDraft={(id, draft) => { updateTicket(id, (previous) => ({ ...previous, draft })); }} onBack={() => { go({ name: 'home' }); }} />}
            {view.name === 'weak' && <WeakSpots items={itemIndex} save={save} scores={readinessAll(save, chapterIds)} chapterTitle={(chapterId) => chapterOf(chapterId)?.title ?? `Chapter ${chapterId}`} onOpen={(item) => { openItem(item); }} onLesson={(chapterId) => { go({ name: 'lesson', chapterId }); }} onBack={() => { go({ name: 'home' }); }} />}
            {view.name === 'item' && meta && !item && <div className="loading-card" role="status"><LoaderCircle className="spin" /> Opening the ticket…</div>}
            {view.name === 'item' && meta && item && <Workspace
              key={item.id}
              challenge={item}
              code={`CH${meta.chapterId} · ${itemIndex.filter((candidate) => candidate.chapterId === meta.chapterId).findIndex((candidate) => candidate.id === meta.id) + 1}`}
              partLabel={partLabel(meta, itemIndex)}
              backLabel={chapterOf(meta.chapterId) ? `Chapter ${meta.chapterId}` : 'Office'}
              progress={save.tickets[item.id] ?? emptyProgress(item.starterSql)}
              setDraft={(draft) => { updateTicket(item.id, (previous) => ({ ...previous, draft })); }}
              review={review}
              grade={(passed, sql, tag, hinted) => grade(meta, item.referenceSql, { passed, sql, tag, hinted })}
              onHint={() => { commit(takeHint(save, item.id)); }}
              onReveal={() => { const at = Date.now(); commit(revealSolution(save, meta, at, localDay(at, zone()))); }}
              onBack={() => { go(chapterOf(meta.chapterId) ? { name: 'chapter', chapterId: meta.chapterId } : { name: 'home' }); }}
            />}
          </Suspense>
        </main>
      </div>
      {promotion && <Promotion rank={promotion} onClose={closePromotion} />}
    </div>
  );
}
