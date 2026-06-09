import { Component, type ErrorInfo, type ReactNode } from "react";

interface OptionalSectionBoundaryProps {
  children: ReactNode;
  label: string;
}

interface OptionalSectionBoundaryState {
  hasError: boolean;
}

export class OptionalSectionBoundary extends Component<OptionalSectionBoundaryProps, OptionalSectionBoundaryState> {
  state: OptionalSectionBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("optional_title_section_failed", this.props.label, error.message, info.componentStack);
  }

  componentDidUpdate(previousProps: OptionalSectionBoundaryProps) {
    if (previousProps.label !== this.props.label && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="optional-section-fallback">
          <p>{this.props.label} is unavailable right now.</p>
        </section>
      );
    }

    return this.props.children;
  }
}
