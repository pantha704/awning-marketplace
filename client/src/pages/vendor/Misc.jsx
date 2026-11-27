import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { MessageSquareText, ImageUp } from 'lucide-react';
import { useGetVendorCouponsQuery, useSaveVendorCouponMutation, useDeleteVendorCouponMutation, useGetVendorReviewsQuery, useReplyReviewMutation, useUpdateShopMutation, useUploadLogoMutation } from '../../store/api.js';
import { toast } from '../../store/uiSlice.js';
import { CouponManager } from './Coupons.jsx';
import { ColorPicker } from './Apply.jsx';
import { Stars, ShopMark } from '../../components/bits.jsx';
import { Empty, ErrorNote, Field, Skeleton, Spinner } from '../../components/ui.jsx';
import { dateLabel, errorMessage, assetUrl } from '../../lib/format.js';

export function VendorCoupons() {
  const { shop } = useOutletContext();
  return <CouponManager title="Coupons" intro={`Codes that take money off products from ${shop.name}. The discount comes out of your share, before commission.`}
    list={useGetVendorCouponsQuery()} save={useSaveVendorCouponMutation()} remove={useDeleteVendorCouponMutation()} />;
}

function ReplyBox({ review }) {
  const dispatch = useDispatch();
  const [reply, state] = useReplyReviewMutation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(review.reply?.body || '');
  if (!open) return <button type="button" className="btn-ghost btn-sm mt-2 px-2" onClick={() => setOpen(true)}>{review.reply ? 'Edit reply' : 'Reply'}</button>;
  return (
    <form className="mt-3 space-y-2" onSubmit={async (e) => { e.preventDefault(); try { await reply({ id: review.id, body: text }).unwrap(); setOpen(false); dispatch(toast.success('Reply posted.')); } catch (err) { dispatch(toast.error(errorMessage(err))); } }}>
      <textarea className="field min-h-20" value={text} onChange={(e) => setText(e.target.value)} placeholder="Thank the customer, or explain what you will do." autoFocus />
      <div className="flex gap-2"><button type="submit" className="btn-primary btn-sm" disabled={state.isLoading}>{state.isLoading && <Spinner />}Post reply</button><button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button></div>
    </form>
  );
}

export function VendorReviews() {
  const { data, isLoading } = useGetVendorReviewsQuery();
  return (
    <div>
      <h2 className="text-3xl">Reviews</h2>
      <p className="mt-1 text-sm text-ink-soft">Every review comes from a delivered order. A short, kind reply helps the next shopper decide.</p>
      <ul className="mt-6 space-y-3">
        {isLoading && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-28 rounded-panel" />)}
        {data?.items.map((r) => (
          <li key={r.id} className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><Stars value={r.rating} size={14} />{r.product && <Link to={`/p/${r.product.slug}`} className="text-xs font-semibold text-ink-soft hover:underline">{r.product.title}</Link>}</div>
            {r.title && <p className="mt-2 font-semibold">{r.title}</p>}
            {r.body && <p className="mt-1 text-sm leading-relaxed text-ink-soft">{r.body}</p>}
            <p className="mt-2 text-xs text-ink-faint">{r.authorName}, {dateLabel(r.createdAt)}</p>
            {r.reply && <div className="mt-3 border-l-[3px] border-brand pl-3 text-sm"><p className="text-xs font-semibold">Your reply</p><p className="text-ink-soft">{r.reply.body}</p></div>}
            <ReplyBox review={r} />
          </li>
        ))}
      </ul>
      {data?.items.length === 0 && <Empty icon={MessageSquareText} title="No reviews yet">Customers can review a product once their order is delivered.</Empty>}
    </div>
  );
}

export function VendorSettings() {
  const { shop } = useOutletContext();
  const dispatch = useDispatch();
  const [update, state] = useUpdateShopMutation();
  const [uploadLogo, logoState] = useUploadLogoMutation();
  const [form, setForm] = useState({ name: shop.name, tagline: shop.tagline, description: shop.description, location: shop.location, contactEmail: shop.contactEmail, color: shop.color });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const fieldError = (n) => state.error?.data?.details?.find((d) => d.field === n)?.message;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <form className="panel space-y-4 p-6" onSubmit={async (e) => { e.preventDefault(); try { await update(form).unwrap(); dispatch(toast.success('Shop updated.')); } catch { /* shown */ } }}>
        <h2 className="text-3xl">Shop settings</h2>
        <ErrorNote>{state.error && !state.error.data?.details && errorMessage(state.error)}</ErrorNote>
        <Field label="Shop name" error={fieldError('name')}><input className="field" value={form.name} onChange={set('name')} /></Field>
        <Field label="Tagline"><input className="field" maxLength={120} value={form.tagline} onChange={set('tagline')} /></Field>
        <Field label="Description" error={fieldError('description')}><textarea className="field min-h-32" value={form.description} onChange={set('description')} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Location"><input className="field" value={form.location} onChange={set('location')} /></Field>
          <Field label="Contact email" error={fieldError('contactEmail')}><input className="field" type="email" value={form.contactEmail} onChange={set('contactEmail')} /></Field>
        </div>
        <div><span className="label">Awning colour</span><ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} /></div>
        <button type="submit" className="btn-primary" disabled={state.isLoading}>{state.isLoading && <Spinner />}Save</button>
      </form>
      <aside className="space-y-4">
        <div className="overflow-hidden rounded-panel border border-line bg-white">
          <div className="awning" style={{ '--awning': form.color }} aria-hidden="true" />
          <div className="flex items-center gap-3 p-4">
            {shop.logoUrl ? <img src={assetUrl(shop.logoUrl)} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <ShopMark color={form.color} size={48} />}
            <div><p className="sign text-xl">{form.name}</p><p className="text-xs text-ink-soft">{form.tagline}</p></div>
          </div>
        </div>
        <label className="btn-outline w-full cursor-pointer">
          {logoState.isLoading ? <Spinner /> : <ImageUp className="h-4 w-4" />}{shop.logoUrl ? 'Replace logo' : 'Upload a logo'}
          <input type="file" accept=".jpg,.jpeg,.png,.webp" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { try { await uploadLogo(f).unwrap(); dispatch(toast.success('Logo updated.')); } catch (err) { dispatch(toast.error(errorMessage(err))); } } }} />
        </label>
        <p className="text-xs text-ink-faint">Commission on your sales: <b>{shop.effectiveCommission}%</b>. Set by the marketplace.</p>
      </aside>
    </div>
  );
}
