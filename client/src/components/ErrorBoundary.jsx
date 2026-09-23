import { Component } from 'react';
import { OctagonAlert } from 'lucide-react';
import { Button } from './ui/Button.jsx';

/*
 * Last line of defence: a rendering fault becomes a comic panel rather
 * than a white screen.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[UI FAULT]', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="panel-raised relative mt-4 max-w-md p-6">
          <span className="caption-red absolute -top-4 left-4">Uh-oh!</span>
          <div className="flex items-start gap-3 pt-2">
            <OctagonAlert className="mt-0.5 h-6 w-6 shrink-0 text-red" strokeWidth={2.5} aria-hidden />
            <div>
              <h2 className="font-display text-3xl uppercase leading-none tracking-comic">This panel tore</h2>
              <p className="mt-2 text-base text-ink-soft">Something in this part of the page failed to draw. The rest of the book is fine.</p>
              <pre className="mt-3 max-h-32 overflow-auto border-2 border-ink bg-paper p-2 font-mono text-[0.7rem] text-ink-soft">{String(this.state.error?.message || this.state.error)}</pre>
              <div className="mt-4 flex gap-2">
                <Button size="sm" onClick={() => this.setState({ error: null })}>
                  Redraw
                </Button>
                <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
                  Reload
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
