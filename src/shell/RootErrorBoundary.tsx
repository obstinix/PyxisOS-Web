import { Component, ErrorInfo, ReactNode } from 'react';
import { runtime } from '../core/system';
import { events } from '../core/events';

/** Last-resort recovery screen if the desktop shell itself throws. */
export class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    events.log('shell', `Desktop shell crashed: ${error.message}`, 'error');
    console.error(error, info.componentStack);
    void runtime.saveNow();
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="shutdown failure" role="alert">
        <h1>The desktop shell stopped unexpectedly</h1>
        <p className="mono">{this.state.error.message}</p>
        <p>Your files were saved. Restart the session, or erase stored data if the problem persists.</p>
        <div className="row gap-2">
          <button className="btn" onClick={() => location.reload()} autoFocus>
            Restart session
          </button>
          <button className="btn danger" onClick={() => void runtime.factoryReset()}>
            Erase stored data
          </button>
        </div>
      </div>
    );
  }
}
