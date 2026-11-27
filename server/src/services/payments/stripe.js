import { config } from '../../config.js';
import { Order } from '../../models/index.js';

let client = null;
export async function stripe() {
  if (!config.stripeSecretKey) return null;
  if (!client) {
    const { default: Stripe } = await import('stripe');
    client = new Stripe(config.stripeSecretKey);
  }
  return client;
}

export async function start(order, user) {
  const api = await stripe();
  const session = await api.checkout.sessions.create({
    mode: 'payment',
    customer_email: user.email,
    client_reference_id: String(order._id),
    metadata: { orderId: String(order._id), orderNumber: order.number },
    // One line for the whole order keeps the Stripe total identical to ours, coupons and shipping included.
    line_items: [{
      quantity: 1,
      price_data: {
        currency: order.currency,
        unit_amount: order.total,
        product_data: { name: `Awning order ${order.number}`, description: order.items.map((l) => `${l.qty} x ${l.title}`).join(', ').slice(0, 480) },
      },
    }],
    // transfer_group ties the later per-shop transfers to this payment.
    payment_intent_data: { transfer_group: order.number, metadata: { orderId: String(order._id) } },
    success_url: `${config.clientUrl}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.clientUrl}/checkout/return?cancelled=${order._id}`,
  });
  order.payment.ref = session.id;
  await order.save();
  return { provider: 'stripe', url: session.url, orderId: String(order._id) };
}

/** Look a Checkout session up and report whether it is paid, with the charge id needed for transfers. */
export async function inspectSession(sessionId) {
  const api = await stripe();
  const session = await api.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent'] });
  const intent = session.payment_intent;
  const chargeRef = typeof intent === 'object' && intent ? (typeof intent.latest_charge === 'string' ? intent.latest_charge : intent.latest_charge?.id) : undefined;
  return { paid: session.payment_status === 'paid', orderId: session.metadata?.orderId || session.client_reference_id, chargeRef, sessionId: session.id };
}

/** Send one shop its share. source_transaction lets the transfer draw on this exact charge before it settles. */
export async function transfer(order, vo, vendor) {
  const account = vendor?.payout?.stripeAccountId;
  if (!account || !vendor.payout.stripeReady) return { status: 'pending', note: 'The shop has not finished Stripe onboarding yet.' };
  if (!order.payment.chargeRef) return { status: 'pending', note: 'The charge is not available yet.' };
  if (vo.vendorNet <= 0) return { status: 'none', note: 'Nothing to pay out.' };
  const api = await stripe();
  const tr = await api.transfers.create(
    { amount: vo.vendorNet, currency: order.currency, destination: account, source_transaction: order.payment.chargeRef, transfer_group: order.number, metadata: { orderId: String(order._id), parcelId: String(vo._id) } },
    { idempotencyKey: `transfer_${vo._id}` }
  );
  return { status: 'transferred', ref: tr.id };
}

export async function refund(order, vo) {
  const api = await stripe();
  if (vo.payout.status === 'transferred' && vo.payout.ref) {
    await api.transfers.createReversal(vo.payout.ref, {}, { idempotencyKey: `reversal_${vo._id}` });
  }
  const re = await api.refunds.create({ charge: order.payment.chargeRef, amount: vo.total, metadata: { orderId: String(order._id), parcelId: String(vo._id) } }, { idempotencyKey: `refund_${vo._id}` });
  return re.id;
}

/** Create (once) a connected Express account for a shop and return a hosted onboarding link. */
export async function onboardingLink(vendor, email) {
  const api = await stripe();
  if (!vendor.payout.stripeAccountId) {
    const account = await api.accounts.create({
      type: 'express', email, business_profile: { name: vendor.name, url: `${config.clientUrl}/shops/${vendor.slug}` },
      capabilities: { transfers: { requested: true } }, metadata: { vendorId: String(vendor._id) },
    });
    vendor.payout.stripeAccountId = account.id;
    await vendor.save();
  }
  const link = await api.accountLinks.create({
    account: vendor.payout.stripeAccountId, type: 'account_onboarding',
    refresh_url: `${config.clientUrl}/sell/payouts?stripe=refresh`, return_url: `${config.clientUrl}/sell/payouts?stripe=return`,
  });
  return link.url;
}

/** Ask Stripe whether the shop can receive transfers, and remember the answer. */
export async function refreshAccount(vendor) {
  if (!vendor.payout.stripeAccountId) return false;
  const api = await stripe();
  const account = await api.accounts.retrieve(vendor.payout.stripeAccountId);
  const ready = account.capabilities?.transfers === 'active';
  if (ready !== vendor.payout.stripeReady) {
    vendor.payout.stripeReady = ready;
    await vendor.save();
  }
  return ready;
}

/** Shops that connected after a sale: send the payouts that were waiting. */
export async function retryPending(vendor) {
  const orders = await Order.find({ 'payment.provider': 'stripe', 'payment.status': 'paid', vendorOrders: { $elemMatch: { vendor: vendor._id, 'payout.status': 'pending', status: { $ne: 'cancelled' } } } });
  let sent = 0;
  for (const order of orders) {
    for (const vo of order.vendorOrders) {
      if (String(vo.vendor) !== String(vendor._id) || vo.payout.status !== 'pending' || vo.status === 'cancelled') continue;
      const result = await transfer(order, vo, vendor);
      if (result.status === 'transferred') { vo.payout = { status: 'transferred', ref: result.ref, at: new Date(), note: '' }; sent += 1; }
    }
    await order.save();
  }
  return sent;
}
