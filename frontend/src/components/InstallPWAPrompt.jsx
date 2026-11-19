import { useState, useEffect } from 'react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { X } from 'lucide-react'; // If you have lucide-react, otherwise use any icon

export default function InstallPWAPrompt() {
  const { isInstallable, promptInstall } = useInstallPrompt();
  const [showPrompt, setShowPrompt] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if user already dismissed the prompt
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      setIsDismissed(true);
      return;
    }

    // Show prompt after 5 seconds if installable
    if (isInstallable && !isDismissed) {
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [isInstallable, isDismissed]);

  const handleInstall = async () => {
    const accepted = await promptInstall();
    if (accepted) {
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-install-dismissed', 'true');
    setIsDismissed(true);
  };

  const handleLater = () => {
    setShowPrompt(false);
    // Don't set dismissed flag, so it can show again later
  };

  if (!showPrompt || !isInstallable) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 md:bottom-4 md:left-4 md:right-auto md:max-w-sm">
      <div className="bg-white rounded-lg shadow-2xl border border-gray-200 p-4 relative">
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
          aria-label="Close"
        >
          <X size={20} />
        </button>
        
        <div className="flex items-start gap-3">
          <img 
            src="/images/brains-logo.png"
            alt="Appointment Scheduler"
            className="w-12 h-12 rounded-lg object-contain"
          />
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 mb-1">
              Install Our App
            </h3>
            <p className="text-sm text-gray-600 mb-3">
              Get quick access to book appointments and manage your health!
            </p>
            
            <div className="flex gap-2">
              <button
                onClick={handleInstall}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Install
              </button>
              <button
                onClick={handleLater}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
