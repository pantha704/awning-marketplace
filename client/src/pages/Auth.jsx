import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import clsx from 'clsx';
import { ShoppingBag, Store } from 'lucide-react';
import { useLoginMutation, useRegisterMutation } from '../store/api.js';
import { selectUser, signedIn } from '../store/authSlice.js';
import { toast } from '../store/uiSlice.js';
import { ErrorNote, Field, Spinner } from '../components/ui.jsx';
import { errorMessage } from '../lib/format.js';

const DEMO_PASSWORD = 'awning123';
const DEMO = [
  { label: 'Customer', email: 'sam@awning.test', note: 'Has orders in every state and a cart waiting' },
  { label: 'Shop owner', email: 'maya@awning.test', note: 'Runs Kettle & Crumb, with sales and orders to ship' },
  { label: 'Admin', email: 'admin@awning.test', note: 'Analytics, shop approvals, coupons' },
];
export const homeFor = (user) => (user.role === 'vendor' ? '/sell' : user.role === 'admin' ? '/admin' : '/');

function Shell({ title, lead, children, footer }) {
  return (
    <div className="page grid max-w-5xl gap-10 pt-10 lg:grid-cols-[1fr_22rem] lg:pt-14">
      <div className="mx-auto w-full max-w-md lg:mx-0">
        <h1 className="text-5xl">{title}</h1>
        {lead && <p className="mt-2 text-ink-soft">{lead}</p>}
        <div className="mt-8">{children}</div>
        {footer && <p className="mt-6 text-sm text-ink-soft">{footer}</p>}
      </div>
      <aside className="hidden overflow-hidden rounded-panel bg-night text-white lg:block">
        <div className="awning" aria-hidden="true" />
        <div className="p-7">
          <p className="sign text-3xl leading-tight">One cart. Many shops. One payment.</p>
          <p className="mt-3 text-sm leading-relaxed text-white/65">Your cart follows you: anything you added before signing in is waiting in your account.</p>
        </div>
      </aside>
    </div>
  );
}

export function Login() {
  const user = useSelector(selectUser);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [login, { isLoading, error }] = useLoginMutation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [pending, setPending] = useState('');
  const from = location.state?.from;
  if (user && !isLoading) return <Navigate to={from?.pathname || homeFor(user)} replace />;

  const submit = async (credentials) => {
    try {
      const session = await login(credentials).unwrap();
      dispatch(signedIn(session));
      navigate(from ? `${from.pathname}${from.search || ''}` : homeFor(session.user), { replace: true });
    } catch { /* shown */ } finally { setPending(''); }
  };
  return (
    <Shell title="Sign in" lead={location.state?.reason || 'Welcome back.'} footer={<>New to Awning? <Link to="/register" state={location.state} className="link">Create an account</Link></>}>
      <form onSubmit={(e) => { e.preventDefault(); submit(form); }} className="space-y-4" noValidate>
        <ErrorNote>{error && errorMessage(error)}</ErrorNote>
        <Field label="Email"><input className="field h-11" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Password"><input className="field h-11" type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <button type="submit" className="btn-primary btn-lg w-full" disabled={isLoading}>{isLoading && !pending && <Spinner />}Sign in</button>
      </form>
      <div className="mt-8 rounded-panel border border-line bg-white p-4">
        <p className="text-sm font-semibold">Try a demo account</p>
        <p className="mt-0.5 text-xs text-ink-faint">Available once the demo data is loaded. Password for all: {DEMO_PASSWORD}</p>
        <div className="mt-3 grid gap-2">
          {DEMO.map((d) => (
            <button key={d.email} type="button" disabled={isLoading} onClick={() => { setPending(d.email); submit({ email: d.email, password: DEMO_PASSWORD }); }}
              className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5 text-left transition-colors duration-100 hover:border-ink disabled:opacity-60">
              <span className="w-24 shrink-0 text-sm font-semibold">{d.label}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-ink-faint">{d.note}</span>
              {pending === d.email && <Spinner className="text-brand" />}
            </button>
          ))}
        </div>
      </div>
    </Shell>
  );
}

export function Register() {
  const user = useSelector(selectUser);
  const [params] = useSearchParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [register, { isLoading, error }] = useRegisterMutation();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: params.get('role') === 'vendor' ? 'vendor' : 'customer' });
  const fieldError = (name) => error?.data?.details?.find((d) => d.field === name)?.message;
  if (user && !isLoading) return <Navigate to={homeFor(user)} replace />;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try {
      const session = await register(form).unwrap();
      dispatch(signedIn(session));
      dispatch(toast.success(`Welcome to Awning, ${session.user.name.split(' ')[0]}.`));
      const from = location.state?.from;
      navigate(session.user.role === 'vendor' ? '/sell' : from ? from.pathname : '/', { replace: true });
    } catch { /* shown */ }
  };
  const roles = [
    { value: 'customer', label: 'I want to shop', icon: ShoppingBag, note: 'Buy from any shop, track every parcel' },
    { value: 'vendor', label: 'I want to sell', icon: Store, note: 'Open a shop and get paid for each sale' },
  ];
  return (
    <Shell title="Create your account" lead="It takes a minute. No card needed." footer={<>Already have an account? <Link to="/login" state={location.state} className="link">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <ErrorNote>{error && !error.data?.details && errorMessage(error)}</ErrorNote>
        <fieldset>
          <legend className="label">What brings you here?</legend>
          <div className="grid grid-cols-2 gap-2.5">
            {roles.map((r) => (
              <label key={r.value} className={clsx('cursor-pointer rounded-xl border p-3.5 transition-colors duration-100', form.role === r.value ? 'border-ink bg-white ring-2 ring-ink/10' : 'border-line-strong bg-white/60 hover:border-ink')}>
                <input type="radio" name="role" value={r.value} checked={form.role === r.value} onChange={set('role')} className="sr-only" />
                <r.icon className={clsx('h-5 w-5', form.role === r.value ? 'text-brand' : 'text-ink-faint')} aria-hidden="true" />
                <span className="mt-2 block text-sm font-semibold">{r.label}</span>
                <span className="mt-0.5 block text-xs leading-snug text-ink-faint">{r.note}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Full name" error={fieldError('name')}><input className="field h-11" autoComplete="name" value={form.name} onChange={set('name')} /></Field>
        <Field label="Email" error={fieldError('email')}><input className="field h-11" type="email" autoComplete="email" value={form.email} onChange={set('email')} /></Field>
        <Field label="Password" error={fieldError('password')} hint="At least 8 characters."><input className="field h-11" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} /></Field>
        <button type="submit" className="btn-primary btn-lg w-full" disabled={isLoading}>{isLoading && <Spinner />}Create account</button>
      </form>
    </Shell>
  );
}

export function NotFound() {
  return (
    <div className="page grid min-h-[55vh] place-items-center pt-10 text-center">
      <div>
        <div className="awning mx-auto w-56" aria-hidden="true" />
        <h1 className="mt-6 text-5xl">This shop is closed</h1>
        <p className="mx-auto mt-2 max-w-md text-ink-soft">The page you were looking for is not on the street. The link may be old or mistyped.</p>
        <Link to="/" className="btn-primary mt-6">Back to the high street</Link>
      </div>
    </div>
  );
}
