import { Component } from 'react';

/**
 * Top-level error boundary. Without one, any render-time exception unmounts the
 * whole React tree and the user sees a blank white page. This catches it,
 * shows a recoverable fallback, and is the natural hook point for wiring an
 * error-tracking service (Sentry, etc.) — see componentDidCatch below.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Report to your monitoring service here once configured, e.g.:
    //   Sentry.captureException(error, { extra: info });
    console.error('Uncaught error:', error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.assign('/');
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
          <div className="text-center max-w-sm">
            <h1 className="text-xl font-bold text-white mb-2">Something went wrong</h1>
            <p className="text-gray-400 text-sm mb-6">
              An unexpected error occurred. Try reloading the app.
            </p>
            <button
              onClick={this.handleReload}
              className="px-5 py-3 bg-green-500 hover:bg-green-400 text-black font-bold rounded-lg transition"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
