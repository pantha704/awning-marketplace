import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { Plus, Tag, Pencil, Trash2 } from 'lucide-react';
import { toast } from '../../store/uiSlice.js';
import { Confirm, Empty, ErrorNote, Field, Modal, Skeleton, Spinner, StatusTag } from '../../components/ui.jsx';
import { money, dateLabel, errorMessage } from '../../lib/format.js';

const toMajor = (m) => (m ? String(m / 100) : '');
const toMinor = (v) => Math.round(Number(v || 0) * 100);
const toDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const BLANK = { code: '', description: '', type: 'percent', value: '10', minSubtotal: '', maxDiscount: '', expiresAt: '', usageLimit: '', perCustomerLimit: '1', active: true };

export const describeCoupon = (c) => `${c.type === 'percent' ? `${c.value}% off` : `${money(c.value)} off`}${c.minSubtotal ? ` over ${money(c.minSubtotal)}` : ''}${c.type === 'percent' && c.maxDiscount ? `, up to ${money(c.maxDiscount)}` : ''}`;

/** Shared by shops (coupons valid on their own products) and admins (valid across the marketplace). */
export function CouponManager({ title, intro, list, save, remove }) {
  const dispatch = useDispatch();
  const { data, isLoading } = list;
  const [saveCoupon, saveState] = save;
  const [deleteCoupon, deleteState] = remove;
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const open = (c) => {
    saveState.reset();
    setForm(c ? { id: c.id, code: c.code, description: c.description, type: c.type, value: c.type === 'fixed' ? toMajor(c.value) : String(c.value), minSubtotal: toMajor(c.minSubtotal), maxDiscount: toMajor(c.maxDiscount), expiresAt: toDate(c.expiresAt), usageLimit: c.usageLimit ? String(c.usageLimit) : '', perCustomerLimit: String(c.perCustomerLimit), active: c.active } : BLANK);
  };
  const submit = async () => {
    try {
      await saveCoupon({
        ...(form.id && { id: form.id }), code: form.code, description: form.description, type: form.type,
        value: form.type === 'fixed' ? toMinor(form.value) : Number(form.value), minSubtotal: toMinor(form.minSubtotal), maxDiscount: form.type === 'percent' ? toMinor(form.maxDiscount) : 0,
        expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).toISOString() : null, usageLimit: Number(form.usageLimit || 0), perCustomerLimit: Number(form.perCustomerLimit || 0), active: form.active,
      }).unwrap();
      setForm(null);
      dispatch(toast.success('Coupon saved.'));
    } catch { /* shown */ }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const fieldError = (n) => saveState.error?.data?.details?.find((d) => d.field === n)?.message;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-3xl">{title}</h2><p className="mt-1 text-sm text-ink-soft">{intro}</p></div>
        <button type="button" className="btn-primary" onClick={() => open(null)}><Plus className="h-4 w-4" />New coupon</button>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-36 rounded-panel" />)}
        {data?.items.map((c) => {
          const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
          return (
            <article key={c.id} className="relative overflow-hidden rounded-panel border border-dashed border-line-strong bg-white p-5">
              <span className="absolute -left-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-paper ring-1 ring-line-strong" aria-hidden="true" />
              <span className="absolute -right-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-paper ring-1 ring-line-strong" aria-hidden="true" />
              <div className="flex items-start justify-between gap-2">
                <p className="sign text-2xl tracking-wider">{c.code}</p>
                {!c.active ? <StatusTag status="archived">Off</StatusTag> : expired ? <StatusTag status="expired">Expired</StatusTag> : <StatusTag status="active">Live</StatusTag>}
              </div>
              <p className="mt-1 text-sm font-semibold">{describeCoupon(c)}</p>
              {c.vendorName && <p className="text-xs text-ink-faint">Only at {c.vendorName}</p>}
              <p className="mt-2 text-xs text-ink-faint">Used {c.usedCount}{c.usageLimit ? ` of ${c.usageLimit}` : ''} times{c.expiresAt && `, ends ${dateLabel(c.expiresAt)}`}</p>
              <div className="mt-3 flex gap-1">
                <button type="button" className="btn-ghost btn-sm px-2" onClick={() => open(c)}><Pencil className="h-3.5 w-3.5" />Edit</button>
                <button type="button" className="btn-ghost btn-sm px-2 text-ink-faint" onClick={() => setConfirm(c)}><Trash2 className="h-3.5 w-3.5" />Delete</button>
              </div>
            </article>
          );
        })}
      </div>
      {data?.items.length === 0 && <Empty icon={Tag} title="No coupons yet">Create a code customers can type at checkout.</Empty>}

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? `Edit ${form.code}` : 'New coupon'} width="max-w-xl"
        footer={<><button type="button" className="btn-outline" onClick={() => setForm(null)}>Cancel</button><button type="button" className="btn-primary" onClick={submit} disabled={saveState.isLoading}>{saveState.isLoading && <Spinner />}Save coupon</button></>}>
        {form && (
          <div className="space-y-4">
            <ErrorNote>{saveState.error && !saveState.error.data?.details && errorMessage(saveState.error)}</ErrorNote>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Code" error={fieldError('code')} hint="Letters and digits, 3 to 24."><input className="field uppercase tracking-wider" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} /></Field>
              <Field label="Type"><select className="field" value={form.type} onChange={set('type')}><option value="percent">Percentage off</option><option value="fixed">Fixed amount off</option></select></Field>
              <Field label={form.type === 'percent' ? 'Percent off' : 'Amount off'} error={fieldError('value')}><input className="field tabular" inputMode="decimal" value={form.value} onChange={set('value')} /></Field>
              <Field label="Minimum spend" hint="Optional"><input className="field tabular" inputMode="decimal" value={form.minSubtotal} onChange={set('minSubtotal')} placeholder="0" /></Field>
              {form.type === 'percent' && <Field label="Maximum discount" hint="Optional cap"><input className="field tabular" inputMode="decimal" value={form.maxDiscount} onChange={set('maxDiscount')} placeholder="No cap" /></Field>}
              <Field label="Ends on" hint="Optional"><input className="field" type="date" value={form.expiresAt} onChange={set('expiresAt')} /></Field>
              <Field label="Total uses" hint="Empty for unlimited"><input className="field tabular" type="number" min="0" value={form.usageLimit} onChange={set('usageLimit')} /></Field>
              <Field label="Uses per customer" hint="0 for unlimited"><input className="field tabular" type="number" min="0" value={form.perCustomerLimit} onChange={set('perCustomerLimit')} /></Field>
            </div>
            <Field label="Description" hint="Shown to the customer when the code is applied."><input className="field" value={form.description} onChange={set('description')} /></Field>
            <label className="flex items-center gap-2.5 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#17181C]" checked={form.active} onChange={set('active')} />Active</label>
          </div>
        )}
      </Modal>
      <Confirm open={!!confirm} onClose={() => setConfirm(null)} busy={deleteState.isLoading} title={`Delete ${confirm?.code}?`} confirmLabel="Delete"
        onConfirm={async () => { await deleteCoupon(confirm.id); setConfirm(null); }}>Customers will no longer be able to use this code. Past orders keep their discount.</Confirm>
    </div>
  );
}
