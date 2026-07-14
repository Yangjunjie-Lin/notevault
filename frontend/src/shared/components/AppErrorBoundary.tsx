import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  onReload?: () => void
}

type State = {
  failed: boolean
}

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Keep the fallback local. Note content and authentication data are never logged here.
  }

  private reload = () => {
    if (this.props.onReload) this.props.onReload()
    else window.location.reload()
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="nv-fatal" aria-labelledby="nv-fatal-title">
          <div className="nv-panel nv-fatal-panel">
            <h1 id="nv-fatal-title">NoteVault could not display this page</h1>
            <p>Your notes were not changed. Reload the application to try again.</p>
            <button type="button" className="btn btn-primary" onClick={this.reload}>
              Reload NoteVault
            </button>
          </div>
        </main>
      )
    }

    return this.props.children
  }
}
