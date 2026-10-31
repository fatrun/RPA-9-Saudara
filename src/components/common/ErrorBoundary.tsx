import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught runtime error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    // Bersihkan service worker registrations dan reload
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const r of regs) r.unregister();
      });
    }
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-rpaGreen-950 via-rpaGreen-900 to-slate-950 text-slate-100 font-sans">
          <div className="w-full max-w-lg bg-surface-card/95 backdrop-blur-xl rounded-ios-lg p-6 sm:p-8 shadow-ios-modal border border-cream-border/60 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-bordo-100 text-bordo flex items-center justify-center mb-4 shadow-sm border border-bordo-300">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <h1 className="text-xl font-bold text-rpaGreen-900 mb-1">
              RPA 9 SAUDARA
            </h1>
            <p className="text-sm font-semibold text-bordo-800 mb-3">
              Terjadi Kendala Memuat Tampilan
            </p>
            <p className="text-xs text-slate-600 mb-5 leading-relaxed">
              Sistem mendeteksi kendala pada antarmuka web. Jangan khawatir, data operasional Anda di server tetap aman.
            </p>

            {this.state.error && (
              <div className="text-left bg-slate-900/90 text-slate-200 p-3 rounded-ios-sm font-mono text-[11px] mb-5 overflow-auto max-h-36 border border-slate-700">
                <p className="font-bold text-red-400 mb-1">{this.state.error.name}: {this.state.error.message}</p>
                {this.state.errorInfo?.componentStack && (
                  <pre className="text-slate-400 text-[10px] whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack.slice(0, 300)}...
                  </pre>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-rpaGreen hover:bg-rpaGreen-600 text-cream font-semibold text-xs tracking-wide transition-all shadow-md flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Muat Ulang Aplikasi
              </button>
              <button
                type="button"
                onClick={() => {
                  window.location.href = '/';
                }}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs tracking-wide transition-all flex items-center justify-center gap-2"
              >
                <Home className="w-4 h-4" /> Ke Beranda
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
