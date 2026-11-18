import { useState, useEffect } from 'react';

export default function PWADiagnostic() {
  const [status, setStatus] = useState({});

  useEffect(() => {
    const checkPWA = async () => {
      const checks = {
        https: location.protocol === 'https:',
        swSupported: 'serviceWorker' in navigator,
        manifestSupported: 'getInstalledRelatedApps' in navigator,
        standalone: window.matchMedia('(display-mode: standalone)').matches,
        userAgent: navigator.userAgent.substring(0, 100),
        url: location.href,
        swRegistrations: [],
      };

      // Check service workers
      if ('serviceWorker' in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          checks.swRegistrations = registrations.map(r => ({
            scope: r.scope,
            active: !!r.active,
            status: r.active?.state || 'none'
          }));
        } catch (e) {
          checks.swRegistrations = [{ error: e.message }];
        }
      }

      // Check manifest
      try {
        const manifest = await fetch('/manifest.json').then(r => r.json());
        checks.manifest = {
          loaded: true,
          start_url: manifest.start_url,
          icons: manifest.icons?.length || 0,
          display: manifest.display
        };
      } catch (e) {
        checks.manifest = { loaded: false, error: e.message };
      }

      setStatus(checks);
    };

    checkPWA();
    const handleBeforeInstallPrompt = () => {
      setStatus((prev) => ({ ...prev, installPrompt: true }));
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const forceSWRegister = async () => {
    if ('serviceWorker' in navigator) {
      await navigator.serviceWorker.getRegistrations().then(regs => 
        Promise.all(regs.map(r => r.unregister()))
      );
      const reg = await navigator.serviceWorker.register('/sw.js');
      setStatus(prev => ({...prev, swRegistrations: [{scope: reg.scope, active: true}]}));
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-95 text-white p-6 z-[10000] overflow-auto">
      <h1 className="text-2xl font-bold mb-6 text-center">PWA Diagnostic</h1>
      
      <div className="space-y-4 max-w-2xl mx-auto">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><strong>HTTPS:</strong> <span className={status.https ? 'text-green-400' : 'text-red-400'}>{status.https ? '✅' : '❌'}</span></div>
          <div><strong>SW Supported:</strong> <span className={status.swSupported ? 'text-green-400' : 'text-red-400'}>{status.swSupported ? '✅' : '❌'}</span></div>
          <div><strong>Standalone:</strong> <span className={status.standalone ? 'text-green-400' : 'text-red-400'}>{status.standalone ? '✅' : '❌'}</span></div>
          <div><strong>Install Prompt:</strong> <span className={status.installPrompt ? 'text-green-400' : 'text-red-400'}>{status.installPrompt ? '✅' : '❌'}</span></div>
        </div>

        <div>
          <strong>URL:</strong> <span className="break-all">{status.url}</span>
        </div>

        <div>
          <strong>Manifest:</strong>
          {status.manifest?.loaded ? (
            <div className="ml-4 mt-2 space-y-1 text-xs">
              <div>Start URL: {status.manifest.start_url}</div>
              <div>Icons: {status.manifest.icons}</div>
              <div>Display: {status.manifest.display}</div>
            </div>
          ) : (
            <span className="text-red-400 ml-4">{status.manifest?.error}</span>
          )}
        </div>

        <div>
          <strong>Service Workers:</strong>
          {status.swRegistrations?.map((sw, i) => (
            <div key={i} className="ml-4 mt-1 text-xs">
              {sw.scope} - {sw.active ? `✅ ${sw.status}` : '❌ Inactive'}
            </div>
          ))}
        </div>

        <button
          onClick={forceSWRegister}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded mt-4"
        >
          🔄 Force Re-register SW
        </button>

        <button
          onClick={() => {
            localStorage.clear();
            caches.keys().then(keys => keys.forEach(key => caches.delete(key)));
            window.location.reload();
          }}
          className="w-full bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded mt-2"
        >
          🧹 Clear All Data & Reload
        </button>
      </div>
    </div>
  );
}
