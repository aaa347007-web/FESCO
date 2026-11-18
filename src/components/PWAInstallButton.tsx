import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'card';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'compact' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    if (variant === 'card') {
      return (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span className="font-medium">Installed on this device as an App</span>
        </div>
      );
    }
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={
          variant === 'card'
            ? 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 active:scale-[0.99] whitespace-nowrap shrink-0'
            : 'inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 whitespace-nowrap shrink-0'
        }
      >
        <Download className="h-4 w-4" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS || variant === 'card') {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className={
            variant === 'card'
              ? 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 whitespace-nowrap shrink-0'
              : 'inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 whitespace-nowrap shrink-0'
          }
        >
          <Smartphone className="h-4 w-4" />
          <span>Install on Phone</span>
        </button>

        {showGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900">Install FESCO Bill Manager</h3>
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  aria-label="Close install instructions"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {isIOS ? (
                <ol className="mt-3 space-y-2 text-sm text-slate-600">
                  <li>1. Tap the <strong>Share</strong> icon in Safari toolbar.</li>
                  <li>2. Scroll down and select <strong>Add to Home Screen</strong>.</li>
                  <li>3. Tap <strong>Add</strong> to use it full-screen.</li>
                </ol>
              ) : (
                <ol className="mt-3 space-y-2 text-sm text-slate-600">
                  <li>1. Open your browser menu (three dots in Chrome/Android).</li>
                  <li>2. Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
                  <li>3. Launch directly from your Android home screen.</li>
                </ol>
              )}
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="mt-5 min-h-[44px] w-full rounded-xl bg-blue-700 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
