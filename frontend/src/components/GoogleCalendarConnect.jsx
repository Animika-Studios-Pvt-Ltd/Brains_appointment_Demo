import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, Loader2, CheckCircle2 } from 'lucide-react';

const GoogleCalendarConnect = ({ onConnect }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      setError(null);

      const token = localStorage.getItem('token');

      if (!token) {
        setError('Please log in to connect your calendar');
        setIsConnecting(false);
        return;
      }

      console.log('🔗 Requesting Google Calendar auth URL...');

      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/google/auth`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();
      console.log('📋 Response:', data);

      if (!data.success) {
        throw new Error(data.message || 'Failed to get authorization URL');
      }

      if (!data.data?.authUrl) {
        throw new Error('No authorization URL received');
      }

      console.log('✅ Opening OAuth window...');

      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const popup = window.open(
        data.data.authUrl,
        'Google Calendar Authorization',
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
      );

      if (!popup || popup.closed) {
        throw new Error('Popup blocked! Please allow popups for this site.');
      }

      let pollInterval = null;
      let checkClosed = null;

      const cleanup = () => {
        if (pollInterval) clearInterval(pollInterval);
        if (checkClosed) clearInterval(checkClosed);
        window.removeEventListener('message', messageHandler);
      };

      const messageHandler = (event) => {
        if (event.data?.type === 'CALENDAR_CONNECTED') {
          console.log('✅ Calendar connected successfully via message!');
          cleanup();
          if (popup && !popup.closed) {
            try {
              popup.close();
            } catch (e) {
              console.warn('Could not close popup:', e);
            }
          }
          setIsConnecting(false);

          if (onConnect) onConnect();
        } else if (event.data?.type === 'CALENDAR_ERROR') {
          console.error('❌ Calendar error via message:', event.data.error);
          cleanup();
          if (popup && !popup.closed) {
            try {
              popup.close();
            } catch (e) {
              console.warn('Could not close popup:', e);
            }
          }
          setError('Calendar connection was cancelled or failed');
          setIsConnecting(false);
        }
      };

      window.addEventListener('message', messageHandler);

      // 1. Poll the backend status API in case COOP blocks postMessage
      pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(
            `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/google/status`,
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            }
          );
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (statusData.success && statusData.data?.isConnected) {
              console.log('✅ Calendar connected successfully (detected via polling)!');
              cleanup();
              if (popup && !popup.closed) {
                try {
                  popup.close();
                } catch (e) {
                  // Ignore
                }
              }
              setIsConnecting(false);
              if (onConnect) onConnect();
            }
          }
        } catch (pollErr) {
          console.warn('Error polling calendar status:', pollErr);
        }
      }, 2000);

      // 2. Check if the popup was closed
      checkClosed = setInterval(() => {
        try {
          if (!popup || popup.closed) {
            setTimeout(async () => {
              cleanup();
              setIsConnecting(false);
              
              // Do one final status check to see if it connected right before closing
              try {
                const finalRes = await fetch(
                  `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/google/status`,
                  {
                    method: 'GET',
                    headers: {
                      'Authorization': `Bearer ${token}`,
                      'Content-Type': 'application/json',
                    },
                  }
                );
                if (finalRes.ok) {
                  const finalData = await finalRes.json();
                  if (finalData.success && finalData.data?.isConnected) {
                    if (onConnect) onConnect();
                  }
                }
              } catch (e) {}
            }, 2000);
          }
        } catch (e) {
          // Cross-origin policies might throw errors when accessing popup properties.
          // We catch this to prevent the app from crashing.
        }
      }, 1000);

    } catch (err) {
      console.error('❌ Error connecting calendar:', err);
      setError(err.message || 'Failed to connect calendar');
      setIsConnecting(false);
    }
  };

  return (
    <div className="flex flex-col items-center sm:items-end gap-3">
      {error && (
        <div className="p-3 bg-red-50 border-l-4 border-red-500 rounded-xl text-left max-w-xs sm:max-w-sm">
          <p className="text-xs text-red-800 font-medium">
            {error}
          </p>
        </div>
      )}

      <Button
        onClick={handleConnect}
        disabled={isConnecting}
        className="bg-[#013473] border-2 border-[#013473] text-white hover:bg-white hover:text-[#134e97] hover:border-white rounded-full px-6 py-2.5 font-body text-xs shadow-md hover:shadow-lg transition-all duration-300 hover:scale-102 disabled:opacity-50 whitespace-nowrap flex items-center justify-center gap-2"
      >
        {isConnecting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Connecting...
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Connect Calendar
          </>
        )}
      </Button>
    </div>
  );
};

export default GoogleCalendarConnect;
