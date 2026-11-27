import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { MapPin, Plus, Trash2, Star } from 'lucide-react';
import { useUpdateProfileMutation, useChangePasswordMutation, useGetAddressesQuery, useAddAddressMutation, useUpdateAddressMutation, useDeleteAddressMutation } from '../../store/api.js';
import { selectUser, userUpdated } from '../../store/authSlice.js';
import { toast } from '../../store/uiSlice.js';
import { AddressForm } from '../Checkout.jsx';
import { Avatar, ErrorNote, Field, Modal, Spinner, StatusTag } from '../../components/ui.jsx';
import { errorMessage } from '../../lib/format.js';

const BLANK = { fullName: '', line1: '', line2: '', city: '', state: '', postalCode: '', country: '', phone: '' };

function Addresses() {
  const dispatch = useDispatch();
  const { data } = useGetAddressesQuery();
  const [add, addState] = useAddAddressMutation();
  const [update] = useUpdateAddressMutation();
  const [remove] = useDeleteAddressMutation();
  const [form, setForm] = useState(null);
  const errors = Object.fromEntries((addState.error?.data?.details || []).map((d) => [d.field, d.message]));
  const save = async () => {
    try { await add(form).unwrap(); setForm(null); dispatch(toast.success('Address saved.')); } catch { /* shown */ }
  };
  return (
    <section className="panel mt-6 p-6" id="addresses">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl">Addresses</h2>
        <button type="button" className="btn-outline btn-sm" onClick={() => { addState.reset(); setForm(BLANK); }}><Plus className="h-4 w-4" />Add address</button>
      </div>
      {data?.items.length ? (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {data.items.map((a) => (
            <li key={a.id} className="rounded-xl border border-line p-4 text-sm">
              <div className="flex items-start justify-between gap-2"><p className="font-semibold">{a.fullName}</p>{a.isDefault && <span className="tag bg-ink text-white">Default</span>}</div>
              <p className="mt-1 leading-snug text-ink-soft">{a.line1}{a.line2 && `, ${a.line2}`}<br />{a.city} {a.postalCode}, {a.country}</p>
              <div className="mt-3 flex gap-1">
                {!a.isDefault && <button type="button" className="btn-ghost btn-sm px-2" onClick={() => update({ id: a.id, isDefault: true })}><Star className="h-3.5 w-3.5" />Make default</button>}
                <button type="button" className="btn-ghost btn-sm px-2 text-ink-faint" onClick={() => remove(a.id)}><Trash2 className="h-3.5 w-3.5" />Remove</button>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="mt-3 flex items-center gap-2 text-sm text-ink-faint"><MapPin className="h-4 w-4" />No saved addresses. Addresses you use at checkout can be saved here.</p>}
      <Modal open={!!form} onClose={() => setForm(null)} title="New address" width="max-w-xl"
        footer={<><button type="button" className="btn-outline" onClick={() => setForm(null)}>Cancel</button><button type="button" className="btn-primary" onClick={save} disabled={addState.isLoading}>{addState.isLoading && <Spinner />}Save address</button></>}>
        {form && <AddressForm value={form} onChange={setForm} errors={errors} />}
      </Modal>
    </section>
  );
}

export default function Account() {
  const user = useSelector(selectUser);
  const dispatch = useDispatch();
  const [updateProfile, profileState] = useUpdateProfileMutation();
  const [changePassword, passwordState] = useChangePasswordMutation();
  const [name, setName] = useState(user.name);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });

  return (
    <div className="page max-w-3xl pt-10">
      <div className="flex items-center gap-4">
        <Avatar name={user.name} size={60} />
        <div><h1 className="text-5xl">Account</h1><p className="mt-1 flex items-center gap-2 text-sm text-ink-faint">{user.email}<StatusTag status={user.role} /></p></div>
      </div>
      {user.role !== 'admin' && <p className="mt-6 text-sm"><Link to="/account/orders" className="link">See your orders</Link></p>}

      <form className="panel mt-6 space-y-4 p-6" onSubmit={async (e) => { e.preventDefault(); try { const r = await updateProfile({ name }).unwrap(); dispatch(userUpdated(r.user)); dispatch(toast.success('Name saved.')); } catch { /* shown */ } }}>
        <h2 className="text-2xl">Profile</h2>
        <ErrorNote>{profileState.error && errorMessage(profileState.error)}</ErrorNote>
        <Field label="Full name"><input className="field" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <button type="submit" className="btn-primary" disabled={profileState.isLoading || name === user.name}>{profileState.isLoading && <Spinner />}Save</button>
      </form>

      {user.role !== 'admin' && <Addresses />}

      <form className="panel mt-6 space-y-4 p-6" onSubmit={async (e) => { e.preventDefault(); try { await changePassword(pw).unwrap(); setPw({ currentPassword: '', newPassword: '' }); dispatch(toast.success('Password changed.')); } catch { /* shown */ } }}>
        <h2 className="text-2xl">Password</h2>
        <ErrorNote>{passwordState.error && errorMessage(passwordState.error)}</ErrorNote>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Current password"><input className="field" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
          <Field label="New password" hint="At least 8 characters."><input className="field" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
        </div>
        <button type="submit" className="btn-primary" disabled={passwordState.isLoading}>{passwordState.isLoading && <Spinner />}Change password</button>
      </form>
    </div>
  );
}
