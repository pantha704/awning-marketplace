import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { CircleCheck } from 'lucide-react';
import { useApplyShopMutation, api } from '../../store/api.js';
import { toast } from '../../store/uiSlice.js';
import { ErrorNote, Field, Spinner } from '../../components/ui.jsx';
import { errorMessage } from '../../lib/format.js';

export const SHOP_COLORS = ['#D4402B', '#2F6690', '#31572C', '#A23B72', '#E09F3E', '#2A9D8F', '#5E548E', '#17181C'];

export function ColorPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Awning colour">
      {SHOP_COLORS.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={c} onClick={() => onChange(c)}
          className="h-9 w-9 rounded-full ring-offset-2 transition-shadow" style={{ background: c, boxShadow: value === c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : undefined }} />
      ))}
    </div>
  );
}

/** Step one of selling: describe the shop. An admin approves it before products go public. */
export default function ApplyShop() {
  const dispatch = useDispatch();
  const [apply, { isLoading, error }] = useApplyShopMutation();
  const [form, setForm] = useState({ name: '', tagline: '', description: '', location: '', color: SHOP_COLORS[0] });
  const fieldError = (n) => error?.data?.details?.find((d) => d.field === n)?.message;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try { await apply(form).unwrap(); dispatch(api.util.invalidateTags(['Me'])); dispatch(toast.success('Application sent. You can start adding products now.')); } catch { /* shown */ }
  };
  return (
    <div className="page grid max-w-5xl gap-10 pt-10 lg:grid-cols-[1fr_20rem]">
      <form onSubmit={submit} className="space-y-5" noValidate>
        <div>
          <h1 className="text-5xl">Open your shop</h1>
          <p className="mt-2 text-ink-soft">Tell customers who you are. The marketplace team reviews every new shop before it opens.</p>
        </div>
        <ErrorNote>{error && !error.data?.details && errorMessage(error)}</ErrorNote>
        <Field label="Shop name" error={fieldError('name')}><input className="field h-11" value={form.name} onChange={set('name')} placeholder="For example: Kettle & Crumb" /></Field>
        <Field label="Tagline" hint="One line under your name."><input className="field h-11" maxLength={120} value={form.tagline} onChange={set('tagline')} placeholder="Things for slow mornings" /></Field>
        <Field label="What do you sell?" error={fieldError('description')} hint="At least 30 characters. This appears on your shopfront."><textarea className="field min-h-32" value={form.description} onChange={set('description')} /></Field>
        <Field label="Where are you based?"><input className="field h-11" value={form.location} onChange={set('location')} placeholder="City, country" /></Field>
        <div><span className="label">Awning colour</span><ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} /></div>
        <button type="submit" className="btn-buy btn-lg" disabled={isLoading}>{isLoading && <Spinner />}Send application</button>
      </form>
      <aside className="space-y-4">
        <div className="overflow-hidden rounded-panel border border-line bg-white">
          <div className="awning" style={{ '--awning': form.color }} aria-hidden="true" />
          <div className="p-4"><p className="sign text-2xl">{form.name || 'Your shop'}</p><p className="mt-1 text-sm text-ink-soft">{form.tagline || 'Your tagline'}</p></div>
        </div>
        <ol className="space-y-3 text-sm text-ink-soft">
          {['Send this application.', 'Add products while you wait.', 'Once approved, put products on sale.', 'Connect a payout account to get paid.'].map((t) => <li key={t} className="flex gap-2.5"><CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-go" aria-hidden="true" />{t}</li>)}
        </ol>
      </aside>
    </div>
  );
}
