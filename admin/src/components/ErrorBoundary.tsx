import { Component, type ErrorInfo, type ReactNode } from "react";

// App-wide error boundary. Without this, any render-time exception (e.g. a
// Radix <Select.Item value="">, a bad map over malformed data) unmounts the
// whole React tree and the operator just sees a blank white screen with no way
// back. This catches it, logs to the console for debugging, and shows a
// recoverable fallback instead.
interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface for debugging; a real logger/Sentry hook could go here.
    console.error("Admin UI crashed:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full rounded-lg border bg-card p-6 text-center space-y-4">
          <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            The page hit an unexpected error. Your data is safe — nothing was lost. Try going
            back, or reload the app.
          </p>
          {error.message && (
            <pre className="text-left text-xs bg-muted rounded p-2 overflow-x-auto text-muted-foreground">
              {error.message}
            </pre>
          )}
          <div className="flex justify-center gap-2">
            <button
              onClick={this.handleReset}
              className="px-4 py-2 text-sm rounded-md border hover:bg-muted transition-colors"
            >
              Go back
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Reload app
            </button>
          </div>
        </div>
      </div>
    );
  }
}
