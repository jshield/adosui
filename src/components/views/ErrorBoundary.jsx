import React from "react";
import { T } from "../../lib/theme";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 16,
            color: T.red,
            fontSize: 12,
            background: "rgba(248,113,113,0.05)",
            borderRadius: 6,
            border: `1px solid rgba(248,113,113,0.2)`,
            margin: 8,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {this.props.label || "Component"} error
          </div>
          <div style={{ color: T.muted, fontSize: 11 }}>
            {this.state.error?.message || "An unexpected error occurred."}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: 8,
              background: "none",
              border: `1px solid ${T.dim}`,
              color: T.muted,
              fontSize: 10,
              padding: "3px 10px",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
