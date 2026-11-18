import { useState, useEffect } from 'react';

export default function IOSInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(iOS);

    const standalone = window.navigator.standalone === true || 
                       window.matchMedia('(display-mode: standalone)').matches;
    setIsStandalone(standalone);

    const dismissed = localStorage.getItem('ios-install-dismissed');
    const dismissedTime = localStorage.getItem('ios-install-dismissed-time');
    
    // Re-show after 7 days
    if (dismissed && dismissedTime) {
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - parseInt(dismissedTime) > sevenDays) {
        localStorage.removeItem('ios-install-dismissed');
        localStorage.removeItem('ios-install-dismissed-time');
      } else {
        return;
      }
    }

    if (iOS && !standalone && !dismissed) {
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('ios-install-dismissed', 'true');
    localStorage.setItem('ios-install-dismissed-time', Date.now().toString());
  };

  const handleInstall = () => {
    // Show browser's native instruction (just alert or do nothing)
    alert(
    'How to Install:\n\n' +
    '1. Tap the Share button at the bottom of Safari\n\n' +
    '2. Scroll down and tap "Add to Home Screen"\n\n' +
    '3. Tap "Add" to confirm\n\n' +
    'The app will then appear on your home screen!'
  );
  handleDismiss();
  };

  if (!showPrompt || !isIOS || isStandalone) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] p-4 md:bottom-4 md:left-4 md:right-auto md:max-w-sm animate-slide-up">
      <div className="bg-white rounded-lg shadow-2xl border border-gray-200 p-5 relative">
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
        
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <h3 className="font-bold text-gray-900 text-lg mb-1">
              Install Our App
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Get quick access to appointments!
            </p>
            
            <div className="flex gap-2">
              <button
                onClick={handleInstall}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all"
              >
                Show Me How
              </button>
              <button
                onClick={handleDismiss}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
