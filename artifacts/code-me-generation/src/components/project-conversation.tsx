import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetPendingProjectInteractionQueryKey,
  getListProjectMessagesQueryKey,
  getListProjectSecretsQueryKey,
  useCancelProjectInteraction,
  useGetPendingProjectInteraction,
  useListProjectMessages,
  useListProjectSecrets,
  useRespondToProjectInteraction,
  useSendProjectMessage,
  type Project,
  type ProjectChatResult,
  type ProjectInteraction,
  type ProjectMessage,
} from '@workspace/api-client-react';
import { AlertCircle, Check, CircleHelp, Loader2, LockKeyhole, Send, Sparkles, X } from 'lucide-react';

export type ProjectConversationProps = {
  projectId: number | null;
  workspaceId: string;
  isAuthenticated: boolean;
  attachments?: Array<{ name: string; type: string; content: string; objectPath?: string }>;
  onCreateProjectFromMessage: (message: string) => Promise<Project>;
  onProjectChanged?: (project: Project) => void;
  onRequireAuth: (message: string) => void;
  onBeforeAiAction?: () => boolean;
  onBusyChange?: (busy: boolean) => void;
  onPendingInteractionChange?: (pending: boolean) => void;
  onChatError?: (error: unknown) => void;
  onMessageAction?: (action: 'reflect' | 'edit' | 'copy' | 'regenerate' | 'details', message: ProjectMessage) => { message: string; tone?: 'success' | 'neutral' | 'warning' } | undefined;
  renderMessage?: (message: ProjectMessage, onAction: NonNullable<ProjectConversationProps['onMessageAction']>) => ReactNode;
  aiCooldownActive?: boolean;
  aiCooldownLabel?: string;
  className?: string;
};

function errorText(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const data = (error as { data?: { error?: unknown } }).data;
    if (typeof data?.error === 'string') return data.error;
  }
  return 'Cette action n’a pas abouti. Réessayez.';
}

function appendMessages(existing: ProjectMessage[] | undefined, ...incoming: ProjectMessage[]) {
  const byId = new Map((existing ?? []).map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));
  return [...byId.values()].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function InteractionCard({
  interaction,
  busy,
  aiDisabled,
  secretNameCollision,
  secretNamesLoading,
  secretNamesError,
  onRetrySecretNames,
  onRespond,
  onCancel,
}: {
  interaction: ProjectInteraction;
  busy: boolean;
  aiDisabled: boolean;
  secretNameCollision: boolean;
  secretNamesLoading: boolean;
  secretNamesError: boolean;
  onRetrySecretNames: () => void;
  onRespond: (payload: { choiceIds?: string[]; text?: string; secretValue?: string; confirmOverwrite?: boolean }) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [clarification, setClarification] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const secret = interaction.answerMode === 'secret';
  const isChoice = interaction.answerMode === 'single_choice' || interaction.answerMode === 'multiple_choice';
  const toggleOption = (id: string) => {
    setSelected((current) => interaction.answerMode === 'single_choice'
      ? (current.includes(id) ? [] : [id])
      : (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  };
  const submit = async () => {
    if (secret) {
      if (!secretValue || secretNamesLoading || secretNamesError) return;
      if (secretNameCollision && !confirmOverwrite) return;
      const succeeded = await onRespond({
        secretValue,
        ...(secretNameCollision ? { confirmOverwrite: true } : {}),
      });
      if (succeeded) {
        setSecretValue('');
        setConfirmOverwrite(false);
      }
      return;
    }
    const text = clarification.trim();
    if (!selected.length && !text && interaction.answerMode !== 'text') return;
    const succeeded = await onRespond({
      ...(selected.length ? { choiceIds: selected } : {}),
      ...(text ? { text } : {}),
    });
    if (succeeded) {
      setSelected([]);
      setClarification('');
    }
  };

  return (
    <section className="rounded-xl border border-[hsl(var(--accent)/.3)] bg-[hsl(var(--accent)/.07)] p-3.5 shadow-[0_12px_30px_hsl(225_32%_3%/.18)]" aria-label="Interaction en attente" data-testid={`pending-interaction-${interaction.id}`}>
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-[hsl(var(--accent)/.14)] text-[hsl(var(--accent))]">
          {secret ? <LockKeyhole className="size-3.5" /> : <CircleHelp className="size-3.5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[hsl(var(--accent))]">
            {secret ? 'Accès requis' : interaction.kind === 'proposal' ? 'Proposition à valider' : 'Précision demandée'}
          </p>
          <h3 className="mt-1 text-[13px] font-medium leading-5 text-[hsl(var(--foreground))]">{interaction.prompt}</h3>
          {secret && interaction.secretName && <p className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">Secret du projet · {interaction.secretName}</p>}
        </div>
      </div>

      {isChoice && interaction.options.length > 0 && (
        <div className="mt-3 grid gap-1.5 sm:grid-cols-2" role={interaction.answerMode === 'single_choice' ? 'radiogroup' : 'group'} aria-label="Choix de réponse">
          {interaction.options.map((option) => {
            const active = selected.includes(option.id);
            return (
              <button key={option.id} type="button" onClick={() => toggleOption(option.id)} aria-pressed={active}
                className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-left text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary)/.55)] ${active ? 'border-[hsl(var(--primary)/.45)] bg-[hsl(var(--primary)/.1)] text-[hsl(var(--foreground))]' : 'border-[hsl(var(--border))] bg-[hsl(var(--background)/.45)] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}
                data-testid={`interaction-option-${option.id}`}>
                <span className={`grid size-4 shrink-0 place-items-center border ${interaction.answerMode === 'single_choice' ? 'rounded-full' : 'rounded'} ${active ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border-[hsl(var(--input))]'}`}>
                  {active && <Check className="size-2.5" />}
                </span>
                {option.label}
              </button>
            );
          })}
        </div>
      )}

      {secret ? (
        <>
          <label className="mt-3 block text-[10px] font-medium text-[hsl(var(--muted-foreground))]">
            Valeur du secret
            <input type="password" autoComplete="new-password" value={secretValue} onChange={(event) => setSecretValue(event.target.value)}
              className="mt-1.5 h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background)/.72)] px-3 text-[12px] text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary)/.55)] focus:ring-2 focus:ring-[hsl(var(--primary)/.15)]"
              placeholder="Saisir la valeur" data-testid="input-interaction-secret" />
            <span className="mt-1 block font-normal">La valeur est transmise de façon privée et n’est pas affichée dans la conversation.</span>
          </label>
          {secretNameCollision && (
            <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/[.06] p-3">
              {secretNamesLoading ? (
                <p className="flex items-center gap-2 text-[10px] text-[hsl(var(--muted-foreground))]"><Loader2 className="size-3 animate-spin" />Vérification du coffre…</p>
              ) : secretNamesError ? (
                <p className="text-[10px] leading-4 text-[hsl(var(--muted-foreground))]">
                  Impossible de vérifier si ce secret existe déjà. <button type="button" onClick={onRetrySecretNames} className="text-[hsl(var(--primary))] underline underline-offset-2">Réessayer</button>
                </p>
              ) : (
                <label className="flex cursor-pointer items-start gap-2.5 text-[10px] leading-4 text-[hsl(var(--foreground))]">
                  <input type="checkbox" checked={confirmOverwrite} onChange={(event) => setConfirmOverwrite(event.target.checked)}
                    className="mt-0.5 size-3.5 accent-[hsl(var(--primary))]" data-testid="checkbox-confirm-secret-overwrite" />
                  <span>Je confirme le remplacement du secret existant <strong className="font-mono">{interaction.secretName}</strong> dans ce projet.</span>
                </label>
              )}
            </div>
          )}
        </>
      ) : (
        <label className="mt-3 block text-[10px] font-medium text-[hsl(var(--muted-foreground))]">
          Ajouter une précision <span className="font-normal">(facultatif)</span>
          <textarea value={clarification} onChange={(event) => setClarification(event.target.value)} rows={2}
            className="mt-1.5 w-full resize-y rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background)/.72)] px-3 py-2 text-[11px] leading-5 text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary)/.55)] focus:ring-2 focus:ring-[hsl(var(--primary)/.15)]"
            placeholder={interaction.answerMode === 'text' ? 'Votre réponse…' : 'Un détail utile pour affiner la réponse…'} data-testid="input-interaction-clarification" />
        </label>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[hsl(var(--border))] px-3 text-[10px] font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--secondary))] disabled:opacity-50" data-testid="button-cancel-interaction">
          <X className="size-3" /> Annuler
        </button>
        <button type="button" onClick={() => void submit()} disabled={busy || aiDisabled || (secret ? !secretValue || secretNamesLoading || secretNamesError || (secretNameCollision && !confirmOverwrite) : interaction.answerMode !== 'text' && !selected.length && !clarification.trim())}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-3.5 text-[10px] font-semibold text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45" data-testid="button-submit-interaction">
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />} Envoyer
        </button>
      </div>
    </section>
  );
}

export function ProjectConversation({
  projectId,
  workspaceId,
  isAuthenticated,
  attachments = [],
  onCreateProjectFromMessage,
  onProjectChanged,
  onRequireAuth,
  onBeforeAiAction,
  onBusyChange,
  onPendingInteractionChange,
  onChatError,
  onMessageAction,
  renderMessage,
  aiCooldownActive = false,
  aiCooldownLabel = '',
  className = '',
}: ProjectConversationProps) {
  const queryClient = useQueryClient();
  const [activeProjectId, setActiveProjectId] = useState<number | null>(projectId);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const previousProjectId = useRef(projectId);
  const resolvedId = projectId ?? activeProjectId;
  const messageKey = resolvedId === null ? undefined : getListProjectMessagesQueryKey(resolvedId);
  const pendingKey = resolvedId === null ? undefined : getGetPendingProjectInteractionQueryKey(resolvedId);
  const messagesQuery = useListProjectMessages(resolvedId ?? 0, {
    query: { queryKey: getListProjectMessagesQueryKey(resolvedId ?? 0), enabled: resolvedId !== null },
  });
  const secretsQuery = useListProjectSecrets(resolvedId ?? 0, {
    query: { queryKey: getListProjectSecretsQueryKey(resolvedId ?? 0), enabled: resolvedId !== null },
  });
  const pendingQuery = useGetPendingProjectInteraction(resolvedId ?? 0, {
    query: { queryKey: getGetPendingProjectInteractionQueryKey(resolvedId ?? 0), enabled: resolvedId !== null },
  });
  const sendMutation = useSendProjectMessage();
  const respondMutation = useRespondToProjectInteraction();
  const cancelMutation = useCancelProjectInteraction();
  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);
  const pendingInteraction = pendingQuery.data?.interaction;
  const interaction = pendingInteraction?.status === 'waiting' ? pendingInteraction : null;
  const processingInteraction = pendingInteraction?.status === 'processing' ? pendingInteraction : null;
  const blockingInteraction = interaction !== null || processingInteraction !== null;
  const pendingCheckBlocked = resolvedId !== null && (pendingQuery.isLoading || pendingQuery.isError);
  const isBusy = sendMutation.isPending || respondMutation.isPending || cancelMutation.isPending || creatingProject;
  const composerBlocked = isBusy || blockingInteraction || pendingCheckBlocked || aiCooldownActive;
  const secretNameCollision = Boolean(
    interaction?.answerMode === 'secret'
      && interaction.secretName
      && secretsQuery.data?.some((secret) => secret.name.trim().toLowerCase() === interaction.secretName?.trim().toLowerCase()),
  );

  useEffect(() => {
    setActiveProjectId(projectId);
    if (projectId === null || (previousProjectId.current !== null && projectId !== previousProjectId.current)) {
      setDraft('');
    }
    previousProjectId.current = projectId;
  }, [projectId]);
  useEffect(() => {
    onBusyChange?.(isBusy);
  }, [isBusy, onBusyChange]);
  useEffect(() => {
    onPendingInteractionChange?.(blockingInteraction || pendingCheckBlocked);
  }, [blockingInteraction, onPendingInteractionChange, pendingCheckBlocked]);
  useEffect(() => {
    if (!isAuthenticated) return;
    try {
      const pendingPrompt = window.sessionStorage.getItem('code-me-pending-prompt');
      if (pendingPrompt) {
        setDraft(pendingPrompt);
        window.sessionStorage.removeItem('code-me-pending-prompt');
      }
    } catch {
      // Session storage can be unavailable in privacy-restricted browsers.
    }
  }, [isAuthenticated]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, interaction?.id]);

  const syncResult = (result: ProjectChatResult, id: number) => {
    const messagesKey = getListProjectMessagesQueryKey(id);
    queryClient.setQueryData<ProjectMessage[]>(messagesKey, (previous) => appendMessages(previous, result.userMessage, result.assistantMessage));
    queryClient.setQueryData(getGetPendingProjectInteractionQueryKey(id), { interaction: result.interaction });
    onProjectChanged?.(result.project);
  };

  const submitMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || composerBlocked) return;
    setError('');
    if (!isAuthenticated) {
      onRequireAuth(message);
      return;
    }
    if (onBeforeAiAction && !onBeforeAiAction()) return;
    const chatData = {
      workspaceId,
      message,
      ...(attachments.length ? { attachments } : {}),
    };
    if (resolvedId === null) {
      setCreatingProject(true);
      try {
        const project = await onCreateProjectFromMessage(message);
        setActiveProjectId(project.id);
        onProjectChanged?.(project);
        const result = await sendMutation.mutateAsync({
          projectId: project.id,
          data: chatData,
        });
        syncResult(result, project.id);
        setDraft('');
      } catch (cause) {
        setError(errorText(cause));
        onChatError?.(cause);
      } finally {
        setCreatingProject(false);
      }
      return;
    }
    try {
      const result = await sendMutation.mutateAsync({ projectId: resolvedId, data: chatData });
      syncResult(result, resolvedId);
      setDraft('');
    } catch (cause) {
      setError(errorText(cause));
      onChatError?.(cause);
    }
  };

  const respond = async (payload: { choiceIds?: string[]; text?: string; secretValue?: string; confirmOverwrite?: boolean }) => {
    if (resolvedId === null || !interaction) return false;
    if (onBeforeAiAction && !onBeforeAiAction()) return false;
    setError('');
    try {
      const result = await respondMutation.mutateAsync({ projectId: resolvedId, interactionId: interaction.id, data: payload });
      syncResult(result, resolvedId);
      return true;
    } catch (cause) {
      setError(errorText(cause));
      onChatError?.(cause);
      return false;
    }
  };

  const cancelInteraction = () => {
    if (resolvedId === null || !interaction) return;
    setError('');
    cancelMutation.mutate({ projectId: resolvedId, interactionId: interaction.id, data: {} }, {
      onSuccess: (result) => {
        if (messageKey) queryClient.setQueryData<ProjectMessage[]>(messageKey, (previous) => appendMessages(previous, result.userMessage));
        if (pendingKey) queryClient.setQueryData(pendingKey, { interaction: null });
      },
      onError: (cause) => setError(errorText(cause)),
    });
  };

  return (
    <section className={`flex min-h-[440px] min-w-0 flex-col overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.72)] ${className}`} aria-label="Conversation du projet" data-testid="project-conversation">
      <header className="flex items-center justify-between border-b border-[hsl(var(--border)/.8)] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-lg border border-[hsl(var(--primary)/.2)] bg-[hsl(var(--primary)/.08)] text-[hsl(var(--primary))]"><Sparkles className="size-3.5" /></span>
          <div>
            <h2 className="text-[12px] font-semibold text-[hsl(var(--foreground))]">Conversation du projet</h2>
            <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">{resolvedId === null ? 'Nouvelle création' : `${messages.length} messages enregistrés`}</p>
          </div>
        </div>
        {interaction && <span className="rounded-full border border-[hsl(var(--accent)/.25)] bg-[hsl(var(--accent)/.09)] px-2 py-1 font-mono text-[8px] uppercase tracking-[.1em] text-[hsl(var(--accent))]">Réponse attendue</span>}
        {processingInteraction && <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--primary)/.25)] bg-[hsl(var(--primary)/.08)] px-2 py-1 font-mono text-[8px] uppercase tracking-[.1em] text-[hsl(var(--primary))]"><Loader2 className="size-3 animate-spin" />En cours</span>}
      </header>

      <div className="chat-scroll min-h-[180px] flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
        {resolvedId === null && (
          <div className="mx-auto flex max-w-xs flex-col items-center py-8 text-center">
            <span className="grid size-10 place-items-center rounded-xl border border-[hsl(var(--primary)/.2)] bg-[hsl(var(--primary)/.07)] text-[hsl(var(--primary))]"><Sparkles className="size-4" /></span>
            <p className="mt-3 text-[12px] font-medium text-[hsl(var(--foreground))]">Un projet commence par une idée.</p>
            <p className="mt-1 text-[10px] leading-5 text-[hsl(var(--muted-foreground))]">Décrivez ce que vous souhaitez construire. Cette conversation restera liée au projet.</p>
          </div>
        )}
        {resolvedId !== null && messagesQuery.isLoading && <div className="space-y-3" aria-label="Chargement des messages"><div className="loading-sheen h-14 rounded-xl bg-[hsl(var(--muted)/.5)]" /><div className="loading-sheen ml-auto h-12 w-4/5 rounded-xl bg-[hsl(var(--muted)/.4)]" /></div>}
        {resolvedId !== null && messagesQuery.isError && (
          <div className="rounded-xl border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.06)] p-3 text-[11px] text-[hsl(var(--foreground))]" role="alert">
            <p className="flex items-center gap-2"><AlertCircle className="size-3.5 text-[hsl(var(--destructive))]" />Impossible de charger la conversation.</p>
            <button type="button" onClick={() => void messagesQuery.refetch()} className="mt-2 underline underline-offset-2">Réessayer</button>
          </div>
        )}
        {resolvedId !== null && !messagesQuery.isLoading && !messagesQuery.isError && messages.length === 0 && (
          <p className="py-8 text-center text-[10px] text-[hsl(var(--muted-foreground))]">Le fil du projet apparaîtra ici.</p>
        )}
        {messages.map((message) => {
          if (renderMessage && onMessageAction) {
            return <Fragment key={message.id}>{renderMessage(message, onMessageAction)}</Fragment>;
          }
          const userMessage = message.role === 'user';
          return <article key={message.id} className={`flex gap-2 ${userMessage ? 'justify-end' : 'justify-start'}`} data-testid={`message-${message.id}`}>
            {!userMessage && <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-[hsl(var(--accent)/.13)] text-[hsl(var(--accent))]"><Sparkles className="size-3" /></span>}
            <div className={`max-w-[88%] ${userMessage ? 'rounded-2xl rounded-br-sm bg-[hsl(var(--primary))] px-3 py-2.5 text-[hsl(var(--primary-foreground))]' : 'rounded-2xl rounded-bl-sm border border-[hsl(var(--border))] bg-[hsl(var(--background)/.45)] px-3 py-2.5 text-[hsl(var(--foreground)/.9)]'}`}>
              <p className="whitespace-pre-wrap text-[11px] leading-[1.65]">{message.content}</p>
              <time className={`mt-1.5 block font-mono text-[8px] ${userMessage ? 'text-[hsl(var(--primary-foreground)/.7)]' : 'text-[hsl(var(--muted-foreground))]'}`} dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</time>
            </div>
          </article>;
        })}
        {sendMutation.isPending && <div className="flex items-center gap-2 text-[10px] text-[hsl(var(--muted-foreground))]"><Loader2 className="size-3 animate-spin" /> L’assistant prépare une réponse…</div>}
        {pendingQuery.isError && resolvedId !== null && <div role="alert" className="text-[10px] text-[hsl(var(--destructive))]">Impossible de vérifier les demandes en attente. <button type="button" onClick={() => void pendingQuery.refetch()} className="underline">Réessayer</button></div>}
        <div ref={bottomRef} />
      </div>

      <div className="space-y-2.5 border-t border-[hsl(var(--border)/.75)] bg-[hsl(var(--background)/.28)] p-3">
        {pendingCheckBlocked && !pendingQuery.isError && <p role="status" className="flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card)/.55)] px-3 py-2 text-[10px] text-[hsl(var(--muted-foreground))]"><Loader2 className="size-3 animate-spin" />Vérification des demandes en attente avant de reprendre…</p>}
        {processingInteraction && <div role="status" className="flex items-center gap-2 rounded-lg border border-[hsl(var(--primary)/.22)] bg-[hsl(var(--primary)/.06)] px-3 py-2.5 text-[10px] text-[hsl(var(--primary))]"><Loader2 className="size-3.5 animate-spin" /><span><strong className="font-medium">Réponse en cours de traitement.</strong> Vous pourrez reprendre la conversation dès qu’elle sera prête.</span></div>}
        {interaction && <InteractionCard
          key={interaction.id}
          interaction={interaction}
          busy={respondMutation.isPending || cancelMutation.isPending}
          aiDisabled={aiCooldownActive}
          secretNameCollision={secretNameCollision}
          secretNamesLoading={Boolean(interaction.answerMode === 'secret' && secretsQuery.isLoading)}
          secretNamesError={Boolean(interaction.answerMode === 'secret' && secretsQuery.isError)}
          onRetrySecretNames={() => void secretsQuery.refetch()}
          onRespond={respond}
          onCancel={cancelInteraction}
        />}
        {error && <p role="alert" className="flex items-start gap-2 rounded-lg border border-[hsl(var(--destructive)/.25)] bg-[hsl(var(--destructive)/.07)] px-3 py-2 text-[10px] leading-4 text-[hsl(var(--destructive))]"><AlertCircle className="mt-0.5 size-3 shrink-0" />{error}</p>}
        <form onSubmit={submitMessage} className="relative">
          <label htmlFor="project-message-input" className="sr-only">Votre message au projet</label>
          <textarea id="project-message-input" value={draft} onChange={(event) => setDraft(event.target.value)} rows={2} disabled={composerBlocked}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}
            placeholder={aiCooldownActive ? aiCooldownLabel : processingInteraction ? 'Une réponse est en cours de traitement…' : interaction ? 'Répondez à la demande ci-dessus pour continuer…' : pendingCheckBlocked ? 'Vérification de la conversation en cours…' : 'Décrivez une nouvelle idée ou une amélioration…'}
            className="w-full resize-y rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--card))] py-3 pl-3 pr-12 text-[11px] leading-5 text-[hsl(var(--foreground))] outline-none transition-colors placeholder:text-[hsl(var(--muted-foreground)/.75)] focus:border-[hsl(var(--primary)/.5)] focus:ring-2 focus:ring-[hsl(var(--primary)/.1)] disabled:cursor-not-allowed disabled:opacity-55"
            data-testid="input-project-message" />
          <button type="submit" disabled={!draft.trim() || composerBlocked} aria-label="Envoyer le message"
            className="absolute bottom-2.5 right-2 grid size-8 place-items-center rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
            data-testid="button-send-project-message">
            {isBusy || pendingCheckBlocked || processingInteraction ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          </button>
          <p className="mt-1.5 px-1 text-[9px] text-[hsl(var(--muted-foreground))]">Entrée pour envoyer · Maj+Entrée pour un saut de ligne</p>
        </form>
      </div>
    </section>
  );
}

export default ProjectConversation;
