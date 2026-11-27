import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { api, useVerifyStripeQuery, useCancelPaymentMutation } from '../store/api.js';
import { Empty, PageLoader } from '../components/ui.jsx';
import { errorMessage } from '../lib/format.js';

/** Stripe sends buyers back here. The payment is confirmed with Stripe on the server before anything is shown. */
export default function CheckoutReturn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const sessionId = params.get('session_id');
  const cancelled = params.get('cancelled');
  const { data, error } = useVerifyStripeQuery(sessionId, { skip: !sessionId });
  const [cancelPayment] = useCancelPaymentMutation();

  useEffect(() => {
    if (cancelled) cancelPayment(cancelled).finally(() => navigate('/checkout', { replace: true }));
  }, [cancelled]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (data?.paid) {
      dispatch(api.util.invalidateTags(['Cart', 'Orders', 'Search', 'Home']));
      navigate(`/account/orders/${data.orderId}?placed=1`, { replace: true });
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="page pt-16"><Empty title="The payment could not be confirmed" action={<Link to="/account/orders" className="btn-primary">Your orders</Link>}>{errorMessage(error)} If you were charged, the order appears in your orders within a minute.</Empty></div>;
  if (data && !data.paid) return <div className="page pt-16"><Empty title="Payment is still processing" action={<Link to={`/account/orders/${data.orderId}`} className="btn-primary">View the order</Link>}>Your bank has not confirmed the payment yet. This page updates on its own when you reload it.</Empty></div>;
  return <PageLoader label="Confirming your payment" />;
}
