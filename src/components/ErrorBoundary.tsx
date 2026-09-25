import { Component, type ErrorInfo, type ReactNode } from 'react'
import './ErrorBoundary.css'

type Props = {
  children: ReactNode
}

type State = {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  copied: boolean
}

/**
 * Render hatalarında beyaz ekran yerine kullanıcı dostu kurtarma ekranı sunar.
 * Hata detayını kopyalama ve yeniden deneme imkanı tanır.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false,
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })
    console.error('Kritik render hatası yakalandı:', error, errorInfo)
  }

  private handleCopy = async (): Promise<void> => {
    const { error, errorInfo } = this.state
    const text = [
      `Hata: ${error?.name ?? 'Error'}: ${error?.message ?? 'Bilinmeyen hata'}`,
      error?.stack ? `\nStack:\n${error.stack}` : '',
      errorInfo?.componentStack ? `\nBileşen Ağacı:\n${errorInfo.componentStack}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      this.setState({ copied: true })
      setTimeout(() => this.setState({ copied: false }), 2500)
    } catch (err) {
      console.error('Panoya kopyalanamadı:', err)
    }
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null, copied: false })
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children
    }

    const { error, errorInfo, copied } = this.state

    return (
      <div className="error-boundary-screen" role="alert">
        <div className="error-boundary-card">
          <div className="error-boundary-icon" aria-hidden="true">
            ⚠️
          </div>
          <h1 className="error-boundary-title">Bir şeyler ters gitti</h1>
          <p className="error-boundary-message">
            Beklenmeyen bir arayüz hatası oluştu. Yeniden deneyebilir veya hata detayını kopyalayabilirsiniz.
          </p>

          <div className="error-boundary-details">
            <div className="error-boundary-error-text">
              <strong>{error?.name || 'Hata'}:</strong> {error?.message || 'Bilinmeyen hata'}
            </div>
            {error?.stack && (
              <pre className="error-boundary-stack">{error.stack}</pre>
            )}
            {errorInfo?.componentStack && (
              <pre className="error-boundary-stack">{errorInfo.componentStack}</pre>
            )}
          </div>

          <div className="error-boundary-actions">
            <button
              type="button"
              className="button button--primary"
              onClick={this.handleRetry}
            >
              Yeniden Dene
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={this.handleCopy}
            >
              {copied ? 'Kopyalandı ✓' : 'Hata Detayını Kopyala'}
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={this.handleReload}
            >
              Sayfayı Yenile
            </button>
          </div>
        </div>
      </div>
    )
  }
}
