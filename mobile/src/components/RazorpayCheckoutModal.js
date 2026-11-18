import React, { useMemo } from 'react';
import { Modal, View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';

/**
 * Opens Razorpay Checkout inside a WebView (works with Expo Go).
 * onResult({ type: 'success'|'dismiss'|'failed', ... })
 */
export const RazorpayCheckoutModal = ({
  visible,
  checkout,
  onResult,
  onClose,
}) => {
  const html = useMemo(() => {
    if (!checkout?.keyId || !checkout?.orderId) return '';

    const options = {
      key: checkout.keyId,
      amount: checkout.amount,
      currency: checkout.currency || 'INR',
      name: 'Brains Hospital',
      description: `Consultation — ${checkout.doctorName || 'Doctor'}`,
      order_id: checkout.orderId,
      prefill: {
        name: checkout.patientName || '',
        email: checkout.patientEmail || '',
        contact: checkout.patientPhone || '',
      },
      theme: { color: '#2B84ED' },
    };

    const optionsJson = JSON.stringify(options);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <style>
    body { font-family: -apple-system, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; background:#F7FAFF; color:#1A1C1E; }
  </style>
</head>
<body>
  <p>Opening secure payment…</p>
  <script>
    (function () {
      var options = ${optionsJson};
      options.handler = function (response) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'success',
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature
        }));
      };
      options.modal = {
        ondismiss: function () {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'dismiss' }));
        }
      };
      var rzp = new Razorpay(options);
      rzp.on('payment.failed', function (response) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'failed',
          error: (response && response.error) || { description: 'Payment failed' }
        }));
      });
      rzp.open();
    })();
  </script>
</body>
</html>`;
  }, [checkout]);

  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      onResult?.(data);
    } catch {
      onResult?.({ type: 'failed', error: { description: 'Invalid payment response' } });
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {!html ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#2B84ED" />
            <Text style={styles.loadingText}>Preparing payment…</Text>
          </View>
        ) : (
          <WebView
            originWhitelist={['*']}
            source={{ html, baseUrl: 'https://api.razorpay.com' }}
            onMessage={handleMessage}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loading}>
                <ActivityIndicator size="large" color="#2B84ED" />
              </View>
            )}
          />
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: { color: '#60646C', fontSize: 14 },
});
