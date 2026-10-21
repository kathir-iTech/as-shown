"use client";
import { Component, type ReactNode } from "react";
export class StudioErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    console.error(JSON.stringify({ event: "studio-render-error" }));
  }
  render() {
    return this.state.failed ? (
      <section className="empty-record">
        <h1>The studio needs a fresh view.</h1>
        <p>
          Your exported records remain available. Reload the page to reopen
          saved local work.
        </p>
        <button
          className="button primary"
          onClick={() => window.location.reload()}
        >
          Reopen the studio
        </button>
      </section>
    ) : (
      this.props.children
    );
  }
}
