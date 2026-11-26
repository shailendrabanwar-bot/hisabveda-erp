import React, { ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';
import { clearUserLocalData, getActiveStorageUserId } from '../../utils/storage';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  confirmReset: boolean;
}

export class ErrorBoundary extends (React.Component as any) {
  constructor(props: Props) {
    super(props);
    (this as any).state = {
      hasError: false,
      error: null,
      confirmReset: false
    };
  }

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error, confirmReset: false };
  }

  public componentDidCatch(error: Error, errorInfo: any) {
    console.error('Uncaught error in React Component Tree:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleRequestReset = () => {
    (this as any).setState({ confirmReset: true });
  };

  private handleConfirmResetCache = () => {
    try {
      const uid = getActiveStorageUserId();
      if (uid) clearUserLocalData(uid);
      localStorage.removeItem('apex_accounting_data_v2');
    } catch (e) {
      console.error(e);
    }
    window.location.reload();
  };

  public render() {
    const state = (this as any).state as State;
    if (state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-slate-100 font-sans">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center justify-center mx-auto text-rose-400">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white">सिस्टम सुरक्षा पुनर्प्राप्ति (Recovery Mode)</h2>
              <p className="text-xs text-slate-400">
                एक अप्रत्याशित समस्या के कारण स्क्रीन क्रैश होने से रोक दी गई है।
              </p>
            </div>

            {state.error && (
              <div className="text-left bg-slate-950 p-3 rounded-lg border border-slate-800 text-[11px] font-mono text-rose-300 max-h-28 overflow-y-auto break-all">
                {state.error.toString()}
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={this.handleReload}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>पुनः लोड करें (Reload Application)</span>
              </button>

              {!state.confirmReset ? (
                <button
                  onClick={this.handleRequestReset}
                  className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2 px-4 rounded-xl text-xs transition cursor-pointer border border-slate-700"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>कैश साफ़ करें व पुनः लोड करें (Reset & Reload)</span>
                </button>
              ) : (
                <div className="bg-rose-950/50 border border-rose-500/40 rounded-xl p-3 space-y-2 text-xs">
                  <p className="text-rose-200 font-semibold">
                    क्या आप वाकई लोकल कैश साफ़ करके डिफ़ॉल्ट डेटा पर रीलोड करना चाहते हैं?
                  </p>
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={() => (this as any).setState({ confirmReset: false })}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-semibold cursor-pointer"
                    >
                      रद्द करें
                    </button>
                    <button
                      onClick={this.handleConfirmResetCache}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold cursor-pointer"
                    >
                      हाँ, रीसेट व रीलोड करें
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
