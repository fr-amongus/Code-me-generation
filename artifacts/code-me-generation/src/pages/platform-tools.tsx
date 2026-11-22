import { useMemo, useState, type FormEvent, type ChangeEvent } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAdminAccessQueryKey, getGetAdminDashboardQueryKey, getGetAdminAutoCodeProposalQueryKey,
  getListAdminAutoCodeProposalsQueryKey, getListAdminFeaturesQueryKey, getListAutoCodeProposalsQueryKey,
  getGetAutoCodeProposalQueryKey, useClaimOwnerAdmin, useCreateAutoCodeProposal,
  useGetAdminAccess, useGetAdminDashboard, useGetAdminAutoCodeProposal, useGetAutoCodeProposal,
  useListAdminAutoCodeProposals, useListAdminFeatures, useListAutoCodeProposals,
  useLoginWithPassword, useRegisterAccount, useReadAdminAutoCodeProposalFile,
  useRequestAutoCodeUploadUrl, useReviewAdminAutoCodeProposal, useSendAutoCodeProposalMessage,
  useSubmitAutoCodeProposal, useUpdateAdminFeature, useGetCurrentAuthUser,
} from '@workspace/api-client-react';
import {
  Activity, ArrowLeft, ArrowRight, BadgeCheck, BarChart3, Check, ChevronRight, CircleAlert,
  Clock3, Code2, File, FileCode2, FileImage, FilePlus2, Files, LockKeyhole, MessageSquareText,
  Paperclip, Plus, RefreshCw, Send, Shield, Upload, UserRound, Users, X,
} from 'lucide-react';

const panel = 'rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.82)] shadow-[0_18px_48px_hsl(225_32%_3%/.12)]';
const field = 'w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background)/.76)] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] outline-none transition focus:border-[hsl(var(--primary)/.65)] focus:ring-2 focus:ring-[hsl(var(--primary)/.12)] placeholder:text-[hsl(var(--muted-foreground))]';
const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-semibold text-[hsl(var(--primary-foreground))] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45';
const quietButton = 'inline-flex items-center justify-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-sm text-[hsl(var(--foreground))] transition hover:border-[hsl(var(--primary)/.4)] hover:bg-[hsl(var(--secondary))] disabled:opacity-45';
const mutedText = 'text-[hsl(var(--muted-foreground))]';

function ErrorNotice({ message, retry }: { message: string; retry: () => void }) {
  return <div className="flex items-center justify-between gap-3 rounded-lg border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.08)] p-4 text-sm" role="alert" data-testid="notice-error">
    <span className="flex items-center gap-2 text-[hsl(var(--destructive))]"><CircleAlert className="size-4 shrink-0" />{message}</span>
    <button className={quietButton} onClick={retry} data-testid="button-retry"><RefreshCw className="size-3.5" /> Retry</button>
  </div>;
}

function AuthGate() {
  const qc = useQueryClient();
  const { data: session, isLoading } = useGetCurrentAuthUser();
  const login = useLoginWithPassword();
  const register = useRegisterAccount();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  if (isLoading) return <div className={`${panel} loading-sheen h-64`} aria-label="Checking sign in" data-testid="skeleton-auth" />;
  if (session?.user) return null;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('');
    const form = new FormData(event.currentTarget);
    const credentials = { username: String(form.get('username') ?? '').trim(), password: String(form.get('password') ?? '') };
    const request = mode === 'login' ? login.mutateAsync({ data: credentials }) : register.mutateAsync({ data: credentials });
    void request.then(() => qc.invalidateQueries()).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Sign in could not be completed.'));
  };
  return <section className={`${panel} mx-auto max-w-lg p-6 sm:p-8`} data-testid="auth-gate">
    <div className="mb-5 grid size-11 place-items-center rounded-xl bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]"><LockKeyhole className="size-5" /></div>
    <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[hsl(var(--primary))]">Account required</p>
    <h2 className="mt-2 text-2xl font-medium tracking-tight">Sign in to continue.</h2>
    <p className={`mt-2 text-sm leading-6 ${mutedText}`}>Auto-code proposals belong to your account. They stay separate from your generated projects.</p>
    <form className="mt-6 space-y-3" onSubmit={submit}>
      <label className="block text-xs font-medium">Username<input name="username" autoComplete="username" minLength={3} required className={`${field} mt-1.5`} data-testid="input-auth-username" /></label>
      <label className="block text-xs font-medium">Password<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required className={`${field} mt-1.5`} data-testid="input-auth-password" /></label>
      {error && <p className="text-sm text-[hsl(var(--destructive))]" role="alert" data-testid="text-auth-error">{error}</p>}
      <button className={`${primaryButton} w-full`} disabled={login.isPending || register.isPending} data-testid="button-auth-submit">{login.isPending || register.isPending ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
    </form>
    <button className="mt-4 text-sm text-[hsl(var(--primary))] hover:underline" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }} data-testid="button-auth-mode">
      {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
    </button>
  </section>;
}

export function AutoCodePage() {
  const qc = useQueryClient();
  const { data: session, isLoading: authLoading } = useGetCurrentAuthUser();
  const proposals = useListAutoCodeProposals({ query: { queryKey: getListAutoCodeProposalsQueryKey(), enabled: Boolean(session?.user) } });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const detail = useGetAutoCodeProposal(selectedId ?? 0, { query: { queryKey: getGetAutoCodeProposalQueryKey(selectedId ?? 0), enabled: Boolean(selectedId && session?.user) } });
  const create = useCreateAutoCodeProposal();
  const send = useSendAutoCodeProposalMessage();
  const submit = useSubmitAutoCodeProposal();
  const getUpload = useRequestAutoCodeUploadUrl();
  const [draft, setDraft] = useState('');
  const [uploadIds, setUploadIds] = useState<number[]>([]);
  const [uploadedNames, setUploadedNames] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const isDraft = detail.data?.status === 'draft';
  const refreshProposal = (id: number) => {
    setSelectedId(id);
    void qc.invalidateQueries({ queryKey: getListAutoCodeProposalsQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetAutoCodeProposalQueryKey(id) });
  };
  const onFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (uploadedNames.length + files.length > 5) { setError('A proposal can include up to five attachments.'); return; }
    setUploading(true); setError('');
    try {
      const ids: number[] = [];
      for (const file of files) {
        const ticket = await getUpload.mutateAsync({ data: { name: file.name, contentType: file.type || 'application/octet-stream', size: file.size } });
        const result = await fetch(ticket.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
        if (!result.ok) throw new Error(`Could not upload ${file.name}.`);
        ids.push(ticket.uploadId);
      }
      setUploadIds((old) => [...old, ...ids]);
      setUploadedNames((old) => [...old, ...files.map((file) => file.name)]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Upload failed. Please try again.'); }
    finally { setUploading(false); }
  };
  const sendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!draft.trim() || uploading) return;
    const message = draft.trim(); setError('');
    if (selectedId && isDraft) {
      send.mutate({ id: selectedId, data: { message, uploadIds } }, {
        onSuccess: (updated) => { setDraft(''); setUploadIds([]); setUploadedNames([]); refreshProposal(updated.id); },
        onError: (reason) => setError(reason instanceof Error ? reason.message : 'Message was not saved.'),
      });
    } else {
      create.mutate({ data: { message, uploadIds } }, {
        onSuccess: (created) => { setDraft(''); setUploadIds([]); setUploadedNames([]); refreshProposal(created.id); },
        onError: (reason) => setError(reason instanceof Error ? reason.message : 'Proposal was not created.'),
      });
    }
  };
  const onSubmitProposal = () => {
    if (!selectedId || !window.confirm('Send this proposal to the owner for review? You will no longer be able to edit its draft.')) return;
    submit.mutate({ id: selectedId }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getListAutoCodeProposalsQueryKey() }); void qc.invalidateQueries({ queryKey: getGetAutoCodeProposalQueryKey(selectedId) }); } });
  };
  if (authLoading || !session?.user) return <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8"><AuthGate /></main>;
  return <main className="mx-auto max-w-6xl px-5 pb-20 pt-9 sm:px-8">
    <header className="mb-8 studio-enter">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.2em] text-[hsl(var(--primary))]"><Code2 className="size-4" /> Platform feedback</div>
      <h1 className="mt-3 text-4xl font-medium tracking-[-.045em] sm:text-5xl">Auto-code</h1>
      <p className={`mt-3 max-w-2xl text-sm leading-6 ${mutedText}`}>Suggest an improvement to Code Me Generation. This is a separate conversation about the platform—not your generated project.</p>
    </header>
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      <aside className={`${panel} h-fit p-4`} aria-label="Your proposals">
        <div className="mb-4 flex items-center justify-between"><div><p className="font-mono text-[9px] uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))]">Your submissions</p><h2 className="mt-1 text-base font-semibold">Proposal shelf</h2></div><span className="grid size-8 place-items-center rounded-lg bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]"><MessageSquareText className="size-4" /></span></div>
        {proposals.isLoading ? <div className="loading-sheen h-24 rounded-lg bg-[hsl(var(--muted)/.55)]" data-testid="skeleton-proposals" /> : proposals.isError ? <button className="text-xs text-[hsl(var(--destructive))]" onClick={() => void proposals.refetch()} data-testid="button-retry-proposals">Could not load proposals. Retry</button> : (proposals.data?.proposals ?? []).length ? <div className="space-y-1.5">
          {proposals.data?.proposals.map((item) => <button key={item.id} onClick={() => refreshProposal(item.id)} className={`w-full rounded-lg border p-3 text-left transition ${selectedId === item.id ? 'border-[hsl(var(--primary)/.4)] bg-[hsl(var(--primary)/.07)]' : 'border-transparent hover:border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary)/.55)]'}`} data-testid={`proposal-row-${item.id}`}>
            <span className="block truncate text-sm font-medium">{item.title}</span><span className="mt-2 flex items-center justify-between text-[10px]"><StatusPill status={item.status} /><span className={mutedText}>v{item.latestVersion}</span></span>
          </button>)}
        </div> : <div className="rounded-lg border border-dashed border-[hsl(var(--border))] px-4 py-6 text-center"><FilePlus2 className="mx-auto size-5 text-[hsl(var(--primary))]" /><p className="mt-2 text-xs font-medium">Nothing on the shelf yet.</p><p className={`mt-1 text-[10px] leading-4 ${mutedText}`}>Start a conversation to shape your first idea.</p></div>}
        <button className={`${quietButton} mt-4 w-full`} onClick={() => { setSelectedId(null); setDraft(''); setError(''); }} data-testid="button-new-proposal"><Plus className="size-4" /> New proposal</button>
      </aside>
      <section className={`${panel} flex min-h-[620px] flex-col overflow-hidden`} data-testid="autocode-chat">
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-5 py-4">
          <div><p className="font-mono text-[9px] uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))]">Private workspace</p><h2 className="mt-1 text-base font-semibold">{detail.data?.title ?? (selectedId ? 'Loading proposal…' : 'New platform idea')}</h2></div>
          {detail.data && <div className="flex items-center gap-2"><StatusPill status={detail.data.status} />{isDraft && <button className="text-xs text-[hsl(var(--primary))] hover:underline" onClick={onSubmitProposal} disabled={submit.isPending} data-testid="button-submit-proposal">{submit.isPending ? 'Submitting…' : 'Submit for review'}<ArrowRight className="ml-1 inline size-3" /></button>}</div>}
        </div>
        {detail.isLoading && selectedId ? <div className="loading-sheen m-5 flex-1 rounded-lg bg-[hsl(var(--muted)/.45)]" data-testid="skeleton-chat" /> :
        <div className="flex-1 space-y-4 overflow-y-auto p-5" data-testid="proposal-messages">
          {!detail.data && <div className="mx-auto mt-12 max-w-md text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl border border-[hsl(var(--primary)/.2)] bg-[hsl(var(--primary)/.08)] text-[hsl(var(--primary))]"><MessageSquareText className="size-5" /></div><h3 className="mt-4 text-xl font-medium">What should work better?</h3><p className={`mt-2 text-sm leading-6 ${mutedText}`}>Describe the platform change you have in mind. Refine it here, then send the finished proposal to the owner.</p></div>}
          {detail.data?.messages.map((message) => <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`} data-testid={`message-${message.id}`}>
            <div className={`max-w-[86%] rounded-2xl px-4 py-3 ${message.role === 'user' ? 'rounded-br-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'rounded-bl-md border border-[hsl(var(--border))] bg-[hsl(var(--background)/.55)]'}`}><p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p><p className={`mt-2 font-mono text-[9px] ${message.role === 'user' ? 'opacity-65' : mutedText}`}>{message.role === 'user' ? 'You' : 'Auto-code'} · {new Date(message.createdAt).toLocaleString()}</p></div>
          </div>)}
          {detail.data?.versions.map((version) => <div key={version.id} className="mx-auto w-full max-w-lg rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background)/.38)] p-3" data-testid={`version-${version.version}`}><p className="font-mono text-[9px] uppercase tracking-[.15em] text-[hsl(var(--primary))]">Snapshot · v{version.version}</p><p className="mt-1 text-xs leading-5">{version.summary}</p></div>)}
        </div>}
        {error && <div className="mx-5 mb-2 text-xs text-[hsl(var(--destructive))]" role="alert" data-testid="text-autocode-error">{error}</div>}
        {isDraft !== false && <form onSubmit={sendMessage} className="border-t border-[hsl(var(--border))] p-4">
          {uploadedNames.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{uploadedNames.map((name, index) => <span key={`${name}-${index}`} className="flex items-center gap-1 rounded-md bg-[hsl(var(--secondary))] px-2 py-1 text-[10px]" data-testid={`uploaded-file-${index}`}><Paperclip className="size-3" />{name}<button type="button" aria-label={`Remove ${name}`} onClick={() => { setUploadedNames((old) => old.filter((_, i) => i !== index)); setUploadIds((old) => old.filter((_, i) => i !== index)); }}><X className="size-3" /></button></span>)}</div>}
          <textarea className={`${field} min-h-[100px] resize-y`} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={selectedId ? 'Continue refining this proposal…' : 'Describe an improvement for the platform…'} maxLength={12000} disabled={Boolean(selectedId && !isDraft)} data-testid="input-proposal-message" />
          <div className="mt-3 flex items-center justify-between gap-3"><div className="flex items-center gap-3"><label className={`${quietButton} cursor-pointer`}><Upload className="size-4" />{uploading ? 'Uploading…' : 'Attach files'}<input type="file" multiple className="sr-only" onChange={(event) => void onFiles(event)} disabled={uploading || Boolean(selectedId && !isDraft)} data-testid="input-proposal-files" /></label><span className={`text-[10px] ${mutedText}`}>Up to 5 · 10 MB each</span></div><button className={primaryButton} disabled={!draft.trim() || uploading || create.isPending || send.isPending || Boolean(selectedId && !isDraft)} data-testid="button-send-proposal-message"><Send className="size-3.5" />{create.isPending || send.isPending ? 'Saving…' : selectedId ? 'Continue draft' : 'Start proposal'}</button></div>
          {detail.data && !isDraft && <p className={`mt-3 text-xs ${mutedText}`}>This proposal is with the owner for review. The draft is now read-only.</p>}
        </form>}
      </section>
    </div>
  </main>;
}

function StatusPill({ status }: { status: string }) {
  const label: Record<string, string> = { draft: 'Draft', pending_review: 'In review', approved: 'Approved', rejected: 'Declined', applied: 'Applied' };
  const color: Record<string, string> = { draft: 'text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted)/.8)]', pending_review: 'text-amber-200 bg-amber-300/10', approved: 'text-[hsl(var(--primary))] bg-[hsl(var(--primary)/.1)]', rejected: 'text-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/.1)]', applied: 'text-cyan-200 bg-cyan-300/10' };
  return <span className={`rounded-full px-2 py-1 font-mono text-[9px] uppercase tracking-[.08em] ${color[status] ?? color.draft}`} data-testid={`status-${status}`}>{label[status] ?? status.replace('_', ' ')}</span>;
}

export function AdminPage() {
  const qc = useQueryClient();
  const access = useGetAdminAccess({ query: { queryKey: getGetAdminAccessQueryKey() } });
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');
  const dashboard = useGetAdminDashboard({ period }, { query: { queryKey: getGetAdminDashboardQueryKey({ period }), enabled: Boolean(access.data?.isOwnerAdmin) } });
  const features = useListAdminFeatures({ query: { queryKey: getListAdminFeaturesQueryKey(), enabled: Boolean(access.data?.isOwnerAdmin) } });
  const proposals = useListAdminAutoCodeProposals({ query: { queryKey: getListAdminAutoCodeProposalsQueryKey(), enabled: Boolean(access.data?.isOwnerAdmin) } });
  const claim = useClaimOwnerAdmin();
  const updateFeature = useUpdateAdminFeature();
  const [bootstrapError, setBootstrapError] = useState('');
  if (access.isLoading) return <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8"><div className={`${panel} loading-sheen h-72`} data-testid="skeleton-admin" /></main>;
  if (access.isError) return <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8"><ErrorNotice message="Admin access could not be checked." retry={() => void access.refetch()} /></main>;
  if (access.data?.bootstrapAvailable && !access.data.isOwnerAdmin) return <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
    <section className={`${panel} mx-auto max-w-xl p-7 sm:p-9`} data-testid="owner-bootstrap">
      <div className="grid size-12 place-items-center rounded-xl bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]"><Shield className="size-5" /></div><p className="mt-5 font-mono text-[10px] uppercase tracking-[.2em] text-[hsl(var(--primary))]">One-time setup</p><h1 className="mt-2 text-3xl font-medium tracking-tight">Claim platform ownership.</h1><p className={`mt-3 text-sm leading-6 ${mutedText}`}>Enter the bootstrap token supplied by your platform operator. It is sent only to the claim request.</p>
      <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); const token = String(new FormData(event.currentTarget).get('token') ?? ''); setBootstrapError(''); claim.mutate({ data: { token } }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getGetAdminAccessQueryKey() }); }, onError: (reason) => setBootstrapError(reason instanceof Error ? reason.message : 'Owner claim failed.'); }); }}>
        <label className="block text-xs font-medium">Bootstrap token<input type="password" name="token" autoComplete="off" minLength={32} maxLength={256} required className={`${field} mt-1.5 font-mono`} data-testid="input-bootstrap-token" /></label>
        {bootstrapError && <p className="text-sm text-[hsl(var(--destructive))]" role="alert" data-testid="text-bootstrap-error">{bootstrapError}</p>}
        <button className={primaryButton} disabled={claim.isPending} data-testid="button-claim-owner">{claim.isPending ? 'Claiming…' : 'Claim owner access'}<ArrowRight className="size-4" /></button>
      </form>
    </section>
  </main>;
  if (!access.data?.isOwnerAdmin) return <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8"><section className={`${panel} mx-auto max-w-xl p-8 text-center`} data-testid="admin-denied"><LockKeyhole className="mx-auto size-6 text-[hsl(var(--muted-foreground))]" /><h1 className="mt-4 text-2xl font-medium">Owner access only</h1><p className={`mt-2 text-sm ${mutedText}`}>The admin console is reserved for the platform owner.</p><Link className={`${quietButton} mt-5`} href="/">Return to generator</Link></section></main>;
  return <main className="mx-auto max-w-6xl px-5 pb-20 pt-9 sm:px-8">
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 studio-enter"><div><div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.2em] text-[hsl(var(--primary))]"><Activity className="size-4" /> Owner console</div><h1 className="mt-3 text-4xl font-medium tracking-[-.045em] sm:text-5xl">Platform pulse</h1><p className={`mt-2 text-sm ${mutedText}`}>A focused read on usage, access, and incoming ideas.</p></div><div className="flex rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1" role="group" aria-label="Usage period">{(['7d', '30d', '90d'] as const).map((value) => <button key={value} onClick={() => setPeriod(value)} className={`rounded-md px-3 py-1.5 font-mono text-[10px] transition ${period === value ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : mutedText}`} data-testid={`button-period-${value}`}>{value}</button>)}</div></header>
    {dashboard.isError && <ErrorNotice message="Usage data could not be loaded." retry={() => void dashboard.refetch()} />}
    {dashboard.isLoading ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className={`${panel} loading-sheen h-28`} /><div className={`${panel} loading-sheen h-28`} /><div className={`${panel} loading-sheen h-28`} /><div className={`${panel} loading-sheen h-28`} /></div> : dashboard.data && <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Usage summary">
      <Metric icon={Users} label="Accounts" value={dashboard.data.totalUsers.toLocaleString()} detail="all accounts" />
      <Metric icon={Activity} label="Tracked calls" value={dashboard.data.trackedCalls.toLocaleString()} detail={`last ${period}`} />
      <Metric icon={BarChart3} label="Reported tokens" value={dashboard.data.reportedTokens.toLocaleString()} detail={`${dashboard.data.tokenReportedCalls.toLocaleString()} calls with token data`} />
      <Metric icon={Clock3} label="Reporting coverage" value={dashboard.data.trackedCalls ? `${(dashboard.data.tokenReportedCalls / dashboard.data.trackedCalls * 100).toFixed(1)}%` : '—'} detail="calls with token counts" />
    </section>}
    <section className={`${panel} mt-6 overflow-hidden`} data-testid="usage-table">
      <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-5 py-4"><div><h2 className="font-semibold">Account activity</h2><p className={`mt-1 text-xs ${mutedText}`}>AI usage in the selected window</p></div><UserRound className="size-4 text-[hsl(var(--muted-foreground))]" /></div>
      {dashboard.data?.users.length ? <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead className={`font-mono text-[9px] uppercase tracking-[.12em] ${mutedText}`}><tr><th className="px-5 py-3">Account</th><th className="px-4 py-3">Joined</th><th className="px-4 py-3 text-right">Calls</th><th className="px-4 py-3 text-right">Call share</th><th className="px-4 py-3 text-right">Reported tokens</th><th className="px-5 py-3 text-right">Token share</th></tr></thead><tbody>{dashboard.data.users.map((user) => <tr key={user.id} className="border-t border-[hsl(var(--border)/.65)]" data-testid={`row-user-${user.id}`}><td className="px-5 py-3.5 font-medium">{user.username || 'Unnamed account'}<span className={`mt-1 block font-mono text-[9px] ${mutedText}`}>{user.id}</span></td><td className={`px-4 py-3.5 ${mutedText}`}>{new Date(user.createdAt).toLocaleDateString()}</td><td className="px-4 py-3.5 text-right font-mono">{user.calls.toLocaleString()}</td><td className={`px-4 py-3.5 text-right ${mutedText}`}>{user.callSharePercent.toFixed(1)}%</td><td className="px-4 py-3.5 text-right font-mono">{user.tokenCount.toLocaleString()}<span className={`block text-[9px] ${mutedText}`}>{user.tokenCallCount} reported calls</span></td><td className={`px-5 py-3.5 text-right ${mutedText}`}>{user.tokenSharePercent.toFixed(1)}%</td></tr>)}</tbody></table></div> : <div className={`px-5 py-9 text-center text-sm ${mutedText}`} data-testid="empty-usage">No usage recorded for this period.</div>}
    </section>
    <section className={`${panel} mt-6 p-5`} data-testid="feature-controls"><div className="mb-4"><h2 className="font-semibold">Feature audience</h2><p className={`mt-1 text-xs ${mutedText}`}>Choose whether each feature is available to everyone or owner accounts only.</p></div>
      {features.isLoading ? <div className="loading-sheen h-20 rounded-lg bg-[hsl(var(--muted)/.45)]" /> : features.isError ? <ErrorNotice message="Feature controls could not be loaded." retry={() => void features.refetch()} /> : features.data?.features.map((feature) => <div key={feature.key} className="flex flex-wrap items-center justify-between gap-3 border-t border-[hsl(var(--border)/.7)] py-3" data-testid={`feature-${feature.key}`}><div><p className="text-sm font-medium">{feature.label}</p><p className={`mt-0.5 font-mono text-[9px] ${mutedText}`}>{feature.key} · default {feature.defaultAudience}</p></div><select className={`${field} w-auto min-w-40 py-2 text-xs`} value={feature.audience} disabled={updateFeature.isPending} onChange={(event) => updateFeature.mutate({ key: feature.key, data: { audience: event.target.value as 'all' | 'admin' } }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getListAdminFeaturesQueryKey() }); } })} data-testid={`select-audience-${feature.key}`}><option value="all">Everyone</option><option value="admin">Owner only</option></select></div>)}
    </section>
    <section className={`${panel} mt-6 overflow-hidden`} data-testid="admin-proposals-list"><div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-5 py-4"><div><h2 className="font-semibold">Auto-code proposals</h2><p className={`mt-1 text-xs ${mutedText}`}>Review submitted platform improvements</p></div><Files className="size-4 text-[hsl(var(--primary))]" /></div>
      {proposals.isLoading ? <div className="loading-sheen h-20" /> : proposals.isError ? <div className="p-4"><ErrorNotice message="Proposals could not be loaded." retry={() => void proposals.refetch()} /></div> : proposals.data?.proposals.length ? proposals.data.proposals.map((item) => <Link key={item.id} href={`/admin/proposals/${item.id}`} className="flex items-center justify-between gap-4 border-b border-[hsl(var(--border)/.65)] px-5 py-4 transition hover:bg-[hsl(var(--secondary)/.38)]" data-testid={`admin-proposal-${item.id}`}><span className="min-w-0"><span className="block truncate text-sm font-medium">{item.title}</span><span className={`mt-1 block text-[10px] ${mutedText}`}>{item.ownerUsername ?? 'Account'} · updated {new Date(item.updatedAt).toLocaleDateString()}</span></span><span className="flex shrink-0 items-center gap-3"><StatusPill status={item.status} /><ChevronRight className="size-4 text-[hsl(var(--muted-foreground))]" /></span></Link>) : <p className={`px-5 py-8 text-center text-sm ${mutedText}`} data-testid="empty-admin-proposals">No platform proposals yet.</p>}
    </section>
  </main>;
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof Users; label: string; value: string; detail: string }) {
  return <article className={`${panel} p-4`} data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="flex items-center justify-between"><span className={`font-mono text-[9px] uppercase tracking-[.14em] ${mutedText}`}>{label}</span><Icon className="size-4 text-[hsl(var(--primary))]" /></div><p className="mt-4 text-2xl font-medium tracking-tight">{value}</p><p className={`mt-1 text-[10px] ${mutedText}`}>{detail}</p></article>;
}

export function AdminProposalPage() {
  const [, params] = useRoute('/admin/proposals/:id');
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const id = Number(params?.id);
  const access = useGetAdminAccess({ query: { queryKey: getGetAdminAccessQueryKey() } });
  const detail = useGetAdminAutoCodeProposal(id, { query: { queryKey: getGetAdminAutoCodeProposalQueryKey(id), enabled: Boolean(access.data?.isOwnerAdmin && Number.isFinite(id) && id > 0) } });
  const readFile = useReadAdminAutoCodeProposalFile();
  const review = useReviewAdminAutoCodeProposal();
  const [selectedPath, setSelectedPath] = useState('');
  const [note, setNote] = useState('');
  const [reviewError, setReviewError] = useState('');
  const selectedContent = readFile.data;
  const latest = detail.data?.versions.at(-1);
  if (access.isLoading) return <main className="mx-auto max-w-6xl px-5 py-10"><div className={`${panel} loading-sheen h-64`} data-testid="skeleton-review" /></main>;
  if (!access.data?.isOwnerAdmin) return <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8"><section className={`${panel} mx-auto max-w-xl p-8 text-center`} data-testid="review-denied"><Shield className="mx-auto size-6 text-[hsl(var(--destructive))]" /><h1 className="mt-4 text-2xl font-medium">Review access restricted</h1><p className={`mt-2 text-sm ${mutedText}`}>Proposal source and review materials are visible to the platform owner only.</p><Link href="/" className={`${quietButton} mt-5`}>Return to generator</Link></section></main>;
  if (detail.isLoading) return <main className="mx-auto max-w-6xl px-5 py-10"><div className={`${panel} loading-sheen h-96`} data-testid="skeleton-review-detail" /></main>;
  if (detail.isError || !detail.data) return <main className="mx-auto max-w-6xl px-5 py-10"><ErrorNotice message="This proposal could not be opened." retry={() => void detail.refetch()} /></main>;
  const changeReview = (decision: 'approve' | 'reject' | 'mark_applied') => {
    if (decision === 'reject' && !note.trim() && !window.confirm('Reject without a review note?')) return;
    review.mutate({ id, data: { decision, note: note.trim() || undefined } }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getGetAdminAutoCodeProposalQueryKey(id) }); void qc.invalidateQueries({ queryKey: getListAdminAutoCodeProposalsQueryKey() }); }, onError: (reason) => setReviewError(reason instanceof Error ? reason.message : 'Review could not be saved.') });
  };
  const openFile = (path: string) => { setSelectedPath(path); readFile.mutate({ data: { proposalId: id, path } }); };
  return <main className="mx-auto max-w-7xl px-5 pb-20 pt-7 sm:px-8">
    <Link href="/admin" className="inline-flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]" data-testid="link-admin-back"><ArrowLeft className="size-3.5" /> Owner console</Link>
    <header className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><StatusPill status={detail.data.status} /><span className={`font-mono text-[10px] ${mutedText}`}>Proposal #{detail.data.id} · {detail.data.ownerUsername ?? 'Unknown account'}</span></div><h1 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl" data-testid="proposal-title">{detail.data.title}</h1><p className={`mt-2 text-xs ${mutedText}`}>Created {new Date(detail.data.createdAt).toLocaleString()} · updated {new Date(detail.data.updatedAt).toLocaleString()}</p></div><div className="flex flex-wrap gap-2"><button className={quietButton} disabled={review.isPending} onClick={() => changeReview('approve')} data-testid="button-approve-proposal"><Check className="size-4" />Approve</button><button className={quietButton} disabled={review.isPending} onClick={() => changeReview('reject')} data-testid="button-reject-proposal"><X className="size-4" />Reject</button><button className={primaryButton} disabled={review.isPending} onClick={() => changeReview('mark_applied')} data-testid="button-mark-applied">{review.isPending ? 'Saving…' : 'Mark applied'}<BadgeCheck className="size-4" /></button></div></header>
    {reviewError && <p className="mt-3 text-xs text-[hsl(var(--destructive))]" role="alert" data-testid="text-review-error">{reviewError}</p>}
    {detail.data.reviewNote && <div className={`${panel} mt-5 p-4`} data-testid="review-note-existing"><p className="font-mono text-[9px] uppercase tracking-[.14em] text-[hsl(var(--primary))]">Previous review note</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{detail.data.reviewNote}</p></div>}
    <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <section className={`${panel} p-5`} data-testid="proposal-notes"><h2 className="font-semibold">Complete proposal notes</h2><pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-6 text-[hsl(var(--foreground)/.86)]">{detail.data.notesMarkdown || 'No additional notes.'}</pre></section>
        <section className={`${panel} overflow-hidden`} data-testid="proposal-file-review"><div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-5 py-4"><div><h2 className="font-semibold">Source snapshot</h2><p className={`mt-1 text-xs ${mutedText}`}>Every listed path is isolated from user projects.</p></div><FileCode2 className="size-4 text-[hsl(var(--primary))]" /></div>
          <div className="grid min-h-[420px] md:grid-cols-[240px_1fr]">
            <div className="border-b border-[hsl(var(--border))] p-3 md:border-b-0 md:border-r">{detail.data.files.map((file) => <button key={file.path} onClick={() => openFile(file.path)} className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition ${selectedPath === file.path ? 'bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]'}`} data-testid={`button-file-${file.path}`}><File className="size-3.5 shrink-0" /><span className="min-w-0 flex-1 truncate" title={file.path}>{file.path}</span><span className="font-mono text-[8px] uppercase">{file.action}</span></button>)}{!detail.data.files.length && <p className={`p-3 text-xs ${mutedText}`}>No source files in this snapshot.</p>}</div>
            <div className="min-w-0 p-4">{selectedContent ? <><div className="mb-3 flex items-center justify-between gap-3"><p className="truncate font-mono text-xs text-[hsl(var(--primary))]" data-testid="text-selected-file-path">{selectedContent.path}</p><span className="font-mono text-[9px] uppercase text-[hsl(var(--muted-foreground))]">{selectedContent.action}</span></div>{selectedContent.originalContent !== null && <details className="mb-3 rounded-lg border border-[hsl(var(--border))] p-3" open><summary className="cursor-pointer text-xs font-medium">Original content</summary><pre className="code-scroll mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-5 text-[hsl(var(--muted-foreground))]" data-testid="text-original-file">{selectedContent.originalContent}</pre></details>}<pre className="code-scroll max-h-[540px] overflow-auto rounded-lg bg-[hsl(var(--background))] p-4 font-mono text-[10px] leading-5 text-[hsl(var(--foreground)/.88)]" data-testid="text-file-content">{selectedContent.content}</pre></> : <div className="grid h-full min-h-64 place-items-center text-center"><div><Files className={`mx-auto size-7 ${mutedText}`} /><p className={`mt-3 text-xs ${mutedText}`}>{readFile.isPending ? 'Reading selected file…' : 'Select a path to inspect its full contents and original.'}</p></div></div>}</div>
          </div>
        </section>
        <section className={`${panel} p-5`} data-testid="file-change-lists"><h2 className="font-semibold">Latest change set <span className={`font-mono text-[10px] font-normal ${mutedText}`}>v{latest?.version ?? 1}</span></h2><p className={`mt-1 text-xs ${mutedText}`}>{latest?.summary ?? 'No change summary.'}</p><div className="mt-4 grid gap-4 sm:grid-cols-3">{[['Changed', latest?.changedFiles ?? [], 'text-amber-200'], ['Added', latest?.addedFiles ?? [], 'text-[hsl(var(--primary))]'], ['Deleted', latest?.deletedFiles ?? [], 'text-[hsl(var(--destructive))]']].map(([label, files, color]) => <div key={String(label)} className="rounded-lg border border-[hsl(var(--border))] p-3"><p className={`font-mono text-[9px] uppercase tracking-[.12em] ${color}`}>{label}</p>{(files as string[]).length ? <ul className="mt-2 space-y-1">{(files as string[]).map((path) => <li key={path} className="break-all font-mono text-[10px]">{path}</li>)}</ul> : <p className={`mt-2 text-[10px] ${mutedText}`}>None</p>}</div>)}</div></section>
        <section className={`${panel} p-5`} data-testid="static-preview"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Static HTML preview</h2><p className={`mt-1 text-xs ${mutedText}`}>Sandboxed with scripts disabled. This is a visual reference only.</p></div><span className="rounded-full border border-[hsl(var(--border))] px-2 py-1 font-mono text-[8px] uppercase text-[hsl(var(--muted-foreground))]">No scripts · isolated</span></div><iframe title="Static proposal preview (scripts disabled)" sandbox="" srcDoc={detail.data.previewHtml} className="h-[440px] w-full rounded-lg border border-[hsl(var(--border))] bg-white" data-testid="iframe-static-preview" /></section>
      </div>
      <aside className="space-y-5">
        <section className={`${panel} p-5`} data-testid="proposal-attachments"><div className="flex items-center gap-2"><Paperclip className="size-4 text-[hsl(var(--primary))]" /><h2 className="font-semibold">Attachments</h2></div>{detail.data.attachments.length ? <ul className="mt-4 space-y-2">{detail.data.attachments.map((attachment) => <li key={attachment.id} className="flex items-start gap-2 rounded-lg border border-[hsl(var(--border))] p-3" data-testid={`attachment-${attachment.id}`}><FileImage className="mt-0.5 size-4 shrink-0 text-[hsl(var(--muted-foreground))]" /><span className="min-w-0"><span className="block break-words text-xs font-medium">{attachment.name}</span><span className={`mt-1 block text-[9px] ${mutedText}`}>{attachment.contentType} · {(attachment.size / 1024).toFixed(1)} KB</span></span></li>)}</ul> : <p className={`mt-4 text-xs ${mutedText}`}>No attachments.</p>}</section>
        <section className={`${panel} p-5`} data-testid="review-note-form"><h2 className="font-semibold">Review note</h2><p className={`mt-1 text-xs leading-5 ${mutedText}`}>Optional context saved with your decision.</p><textarea className={`${field} mt-3 min-h-32 resize-y`} value={note} onChange={(event) => setNote(event.target.value)} maxLength={4000} placeholder="Write a clear, actionable note…" data-testid="input-review-note" /><p className={`mt-2 text-right font-mono text-[9px] ${mutedText}`}>{note.length}/4000</p></section>
        <section className={`${panel} p-5`} data-testid="proposal-history"><h2 className="font-semibold">Version history</h2><div className="mt-3 space-y-3">{detail.data.versions.map((version) => <div key={version.id} className="border-l border-[hsl(var(--border))] pl-3" data-testid={`history-version-${version.version}`}><p className="font-mono text-[9px] uppercase tracking-[.12em] text-[hsl(var(--primary))]">v{version.version}</p><p className="mt-1 text-xs leading-5">{version.summary}</p><p className={`mt-1 text-[9px] ${mutedText}`}>{new Date(version.createdAt).toLocaleString()}</p></div>)}</div></section>
      </aside>
    </div>
  </main>;
}

export function PlatformLoading() {
  return <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8"><div className={`${panel} loading-sheen h-72`}><span className="sr-only">Loading platform tools</span></div></div>;
}
