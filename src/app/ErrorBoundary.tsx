import { Component, type ReactNode } from 'react';
import { SAVE_KEY } from '../save/format';

// The top-level safety net. It reads no app state, and it exports the stored save as it is, without parsing it, so a bug in the
// app cannot block the one thing a learner needs after a crash: a copy of their progress.
interface Props { children: ReactNode }
interface State { failed: boolean; notice: string }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, notice: '' };

  static getDerivedStateFromError(): State {
    return { failed: true, notice: '' };
  }

  exportRaw = (): void => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw === null) {
        this.setState({ notice: 'No saved progress was found in this browser.' });
        return;
      }
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'larkspur-progress-raw.json';
      link.click();
      window.setTimeout(() => { URL.revokeObjectURL(url); }, 1_000);
    } catch {
      this.setState({ notice: 'This browser would not let the desk read its saved progress.' });
    }
  };

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return <main id="main" className="crash-page">
      <p className="eyebrow">LARKSPUR SQL DESK</p>
      <h1>The desk stopped</h1>
      <p className="intro-copy">Something went wrong while showing the desk. Your progress is still saved in this browser. Export a copy of the raw save first if you want one, then reload.</p>
      {this.state.notice && <p role="status" className="query-error">{this.state.notice}</p>}
      <div className="button-row">
        <button className="secondary-button" onClick={this.exportRaw}>Export raw save</button>
        <button className="primary-button" onClick={() => { window.location.reload(); }}>Reload the desk</button>
      </div>
    </main>;
  }
}
