import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches render/effect errors in the subtree and shows a fallback instead of
 * letting React unmount the whole tree (which produced a blank white screen).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught render error:', error, info.componentStack);
  }

  private handleReload = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
            <h1 className="text-lg font-semibold text-gray-900">Something went wrong</h1>
            <p className="text-sm text-gray-500 mt-2">
              An unexpected error occurred while rendering this page.
            </p>
            {this.state.error?.message && (
              <p className="text-xs text-gray-400 mt-3 font-mono break-words">
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={this.handleReload}
              className="mt-6 inline-flex items-center justify-center px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
