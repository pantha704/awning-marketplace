/** Load Razorpay Checkout on demand and resolve with the signed payment, or reject if the buyer closes it. */
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(window.Razorpay);
    script.onerror = () => reject(new Error('Razorpay Checkout could not be loaded. Check your connection.'));
    document.head.appendChild(script);
  });
}

export async function openRazorpay(payment, { onDismiss } = {}) {
  const Razorpay = await loadRazorpay();
  return new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      key: payment.keyId, order_id: payment.razorpayOrderId, amount: payment.amount, currency: payment.currency,
      name: payment.name, description: payment.description, prefill: payment.prefill, theme: { color: '#D4402B' },
      handler: (res) => resolve(res),
      modal: { ondismiss: () => { onDismiss?.(); reject(new Error('dismissed')); } },
    });
    rzp.on('payment.failed', (res) => reject(new Error(res.error?.description || 'The payment failed.')));
    rzp.open();
  });
}
