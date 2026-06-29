import { Component } from 'react';

/** Catches render errors in a single admin section without crashing the whole app. */
export default class SectionErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(`[${this.props.name || 'section'}]`, error, info);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="adm-panel" style={{ padding: 24, background: '#fef2f2', borderRadius: 12, border: '1px solid #fecaca' }}>
          <h3 style={{ margin: '0 0 8px', color: '#991b1b' }}>{this.props.title || 'Something went wrong'}</h3>
          <p style={{ margin: '0 0 16px', color: '#7f1d1d', fontSize: 14 }}>{error.message || 'This section failed to load.'}</p>
          <button
            type="button"
            className="adm-btn-red adm-btn--sm"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
