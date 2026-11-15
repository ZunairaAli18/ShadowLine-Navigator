"use client";

import { Component, type ReactNode } from "react";

/** Catches WebGL / three.js start-up failures so the caller can fall back to a 2D view. */
export class GlBoundary extends Component<{ onError: (message: string) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(e: unknown) {
    this.props.onError(e instanceof Error ? e.message : "3D couldn't start on this device.");
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
