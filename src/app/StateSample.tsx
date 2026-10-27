import { CheckCircle2, XCircle } from 'lucide-react';
import type { StatePreview } from '../engine/protocol';
import ResultsTable from '../components/ResultsTable';

// The sample view of a write ticket: each trusted check's rows, then each constraint test's outcome.
export default function StateSample({ state }: { state: StatePreview }) {
  return <div className="state-sample">
    {state.learnerError && <div className="query-error" role="alert"><XCircle size={18} /><span>{state.learnerError}</span></div>}
    {state.checks.map((check) => <figure key={check.id} className="state-check">
      <figcaption>{check.label}</figcaption>
      {check.result ? <ResultsTable result={check.result} label={check.label} /> : <p className="query-error" role="alert">{check.error}</p>}
    </figure>)}
    {state.tests.length > 0 && <ul className="state-tests" aria-label="Constraint tests">
      {state.tests.map((test) => <li key={test.name} className={test.passed ? 'test-passed' : 'test-failed'}>
        {test.passed ? <CheckCircle2 size={15} /> : <XCircle size={15} />}<span><strong>{test.name}</strong> {test.message}</span>
      </li>)}
    </ul>}
  </div>;
}
