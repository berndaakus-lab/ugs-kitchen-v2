import { Component } from 'react'

// Without this, any unexpected error unmounts the whole app and staff see a
// blank screen. Show what happened and a way back instead.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[pos] screen crashed', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-[100dvh] items-center justify-center p-4">
        <div className="card w-full max-w-md space-y-3 text-center">
          <h1 className="text-xl font-black">Something went wrong</h1>
          <p className="text-sm text-gray-600">Reload the screen to continue. If it keeps happening, send this message to support:</p>
          <pre className="whitespace-pre-wrap break-words rounded-xl bg-brand-muted p-3 text-left text-xs">{String(this.state.error?.message || this.state.error)}</pre>
          <button className="btn-primary w-full" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    )
  }
}
