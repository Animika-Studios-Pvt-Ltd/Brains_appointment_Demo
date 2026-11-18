import { useState, useEffect } from 'react';

export function useInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [debugInfo, setDebugInfo] = useState('Initializing...');

  useEffect(() => {
    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                         window.navigator.standalone === true;
    
    if (isStandalone) {
      setDebugInfo('Already installed as PWA');
      return;
    }

    // Check if it's Android Chrome
    const isAndroid = /Android/i.test(navigator.userAgent);
    const isChrome = /Chrome/i.test(navigator.userAgent) && !/Edge|Edg/i.test(navigator.userAgent);
    
    setDebugInfo(`Android: ${isAndroid}, Chrome: ${isChrome}`);

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
      setIsInstallable(true);
      setDebugInfo('Install prompt available!');
    };

    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setIsInstallable(false);
      setDebugInfo('App installed successfully!');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Set timeout to check if event fired
    setTimeout(() => {
      if (!installPrompt) {
        setDebugInfo('No install prompt detected after 3s');
      }
    }, 3000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [installPrompt]);

  const promptInstall = async () => {
    if (!installPrompt) {
      setDebugInfo('No install prompt available');
      return false;
    }
    
    try {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      
      setDebugInfo(`User ${outcome} the install`);
      
      if (outcome === 'accepted') {
        setInstallPrompt(null);
        setIsInstallable(false);
      }
      
      return outcome === 'accepted';
    } catch (error) {
      setDebugInfo(`Error: ${error.message}`);
      return false;
    }
  };

  return { isInstallable, promptInstall, debugInfo };
}
