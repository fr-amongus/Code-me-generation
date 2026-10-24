import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListProjectSecretsQueryKey,
  useCreateProjectSecret,
  useDeleteProjectSecret,
  useListProjectSecrets,
  useRevealProjectSecret,
  useUpdateProjectSecret,
  type ProjectSecret,
} from '@workspace/api-client-react';
import { AlertCircle, Eye, EyeOff, KeyRound, Loader2, LockKeyhole, Pencil, Plus, ShieldCheck, Trash2, X } from 'lucide-react';

export type ProjectSecretManagerProps = {
  projectId: number | null;
  className?: string;
};

type Editor = { mode: 'create' } | { mode: 'edit'; secret: ProjectSecret } | null;

function readableError(error: unknown) {
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const message = (error as { data?: { error?: unknown } }).data?.error;
    if (typeof message === 'string') return message;
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Cette opération a échoué. Vérifiez les champs et réessayez.';
}

function isNameCollision(message: string) {
  return /already exists|duplicate|unique|collision|déjà|existe|duplicate key/i.test(message);
}

export function ProjectSecretManager({ projectId, className = '' }: ProjectSecretManagerProps) {
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<Editor>(null);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [formError, setFormError] = useState('');
  const [revealed, setRevealed] = useState<Record<number, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<ProjectSecret | null>(null);
  const safeProjectId = projectId ?? 0;
  const secretsQuery = useListProjectSecrets(safeProjectId, {
    query: { queryKey: getListProjectSecretsQueryKey(safeProjectId), enabled: projectId !== null },
  });
  const createSecret = useCreateProjectSecret();
  const updateSecret = useUpdateProjectSecret();
  const deleteSecret = useDeleteProjectSecret();
  const revealSecret = useRevealProjectSecret();
  const busy = createSecret.isPending || updateSecret.isPending || deleteSecret.isPending;

  useEffect(() => {
    setEditor(null);
    setName('');
    setValue('');
    setFormError('');
    setRevealed({});
    setDeleteTarget(null);
  }, [projectId]);

  const clearEditor = () => {
    setEditor(null);
    setName('');
    setValue('');
    setFormError('');
  };

  const openCreate = () => {
    setName('');
    setValue('');
    setFormError('');
    setEditor({ mode: 'create' });
  };

  const openEdit = (secret: ProjectSecret) => {
    setName(secret.name);
    setValue('');
    setFormError('');
    setEditor({ mode: 'edit', secret });
  };

  const submitEditor = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (projectId === null || !name.trim()) return;
    setFormError('');
    const onError = (error: unknown) => {
      const message = readableError(error);
      setFormError(editor?.mode === 'create' && isNameCollision(message)
        ? 'Ce nom est déjà utilisé dans ce projet. Choisissez un libellé différent, par exemple API_TOKEN_PROD.'
        : message);
    };
    if (editor?.mode === 'create') {
      if (!value) {
        setFormError('Saisissez une valeur pour créer ce secret.');
        return;
      }
      createSecret.mutate({ projectId, data: { name: name.trim(), value } }, {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: getListProjectSecretsQueryKey(projectId) });
          clearEditor();
        },
        onError,
      });
    } else if (editor?.mode === 'edit') {
      const data = { name: name.trim(), ...(value ? { value } : {}) };
      updateSecret.mutate({ projectId, secretId: editor.secret.id, data }, {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: getListProjectSecretsQueryKey(projectId) });
          setRevealed((current) => {
            const next = { ...current };
            delete next[editor.secret.id];
            return next;
          });
          clearEditor();
        },
        onError,
      });
    }
  };

  const toggleReveal = (secret: ProjectSecret) => {
    if (revealed[secret.id] !== undefined) {
      setRevealed((current) => {
        const next = { ...current };
        delete next[secret.id];
        return next;
      });
      return;
    }
    if (projectId === null || revealSecret.isPending) return;
    revealSecret.mutate({ projectId, secretId: secret.id }, {
      onSuccess: (result) => setRevealed((current) => ({ ...current, [secret.id]: result.value })),
      onError: (error) => setFormError(readableError(error)),
    });
  };

  const confirmDelete = () => {
    if (projectId === null || !deleteTarget) return;
    deleteSecret.mutate({ projectId, secretId: deleteTarget.id }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListProjectSecretsQueryKey(projectId) });
        setRevealed((current) => {
          const next = { ...current };
          delete next[deleteTarget.id];
          return next;
        });
        setDeleteTarget(null);
      },
      onError: (error) => setFormError(readableError(error)),
    });
  };

  const secrets = secretsQuery.data ?? [];

  return (
    <section className={`overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.72)] ${className}`} aria-label="Secrets du projet" data-testid="project-secret-manager">
      <header className="flex items-center justify-between gap-3 border-b border-[hsl(var(--border)/.8)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-[hsl(var(--primary)/.2)] bg-[hsl(var(--primary)/.08)] text-[hsl(var(--primary))]"><KeyRound className="size-3.5" /></span>
          <div className="min-w-0">
            <h2 className="text-[12px] font-semibold text-[hsl(var(--foreground))]">Coffre de secrets</h2>
            <p className="mt-0.5 text-[9px] text-[hsl(var(--muted-foreground))]">Privés à ce projet · jamais affichés par défaut</p>
          </div>
        </div>
        <button type="button" onClick={openCreate} disabled={projectId === null} className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[hsl(var(--primary)/.26)] bg-[hsl(var(--primary)/.08)] px-2.5 text-[10px] font-medium text-[hsl(var(--primary))] transition-colors hover:bg-[hsl(var(--primary)/.14)] disabled:opacity-40" data-testid="button-create-project-secret">
          <Plus className="size-3" /> Ajouter
        </button>
      </header>

      <div className="p-3">
        {projectId === null ? (
          <div className="rounded-xl border border-dashed border-[hsl(var(--border))] px-4 py-6 text-center">
            <LockKeyhole className="mx-auto size-5 text-[hsl(var(--muted-foreground))]" />
            <p className="mt-2 text-[11px] font-medium text-[hsl(var(--foreground))]">Le coffre apparaît avec le projet.</p>
            <p className="mt-1 text-[10px] leading-4 text-[hsl(var(--muted-foreground))]">Chaque projet possède ses propres identifiants privés.</p>
          </div>
        ) : secretsQuery.isLoading ? (
          <div className="space-y-2" aria-label="Chargement du coffre"><div className="loading-sheen h-12 rounded-lg bg-[hsl(var(--muted)/.48)]" /><div className="loading-sheen h-12 rounded-lg bg-[hsl(var(--muted)/.36)]" /></div>
        ) : secretsQuery.isError ? (
          <div role="alert" className="rounded-xl border border-[hsl(var(--destructive)/.25)] bg-[hsl(var(--destructive)/.06)] p-3 text-[10px] text-[hsl(var(--foreground))]">
            <p className="flex items-center gap-2"><AlertCircle className="size-3.5 text-[hsl(var(--destructive))]" />Le coffre n’a pas pu être chargé.</p>
            <button type="button" onClick={() => void secretsQuery.refetch()} className="mt-2 underline underline-offset-2">Réessayer</button>
          </div>
        ) : secrets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[hsl(var(--border))] px-4 py-6 text-center">
            <ShieldCheck className="mx-auto size-5 text-[hsl(var(--primary))]" />
            <p className="mt-2 text-[11px] font-medium text-[hsl(var(--foreground))]">Aucun secret enregistré.</p>
            <p className="mt-1 text-[10px] leading-4 text-[hsl(var(--muted-foreground))]">Ajoutez une clé d’API ou un identifiant requis par votre application.</p>
            <button type="button" onClick={openCreate} className="mt-3 text-[10px] font-medium text-[hsl(var(--primary))] underline underline-offset-4">Ajouter le premier secret</button>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {secrets.map((secret) => (
              <li key={secret.id} className="rounded-xl border border-[hsl(var(--border)/.85)] bg-[hsl(var(--background)/.3)] p-3" data-testid={`project-secret-${secret.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[10px] font-semibold tracking-[.02em] text-[hsl(var(--foreground))]">{secret.name}</p>
                    <p className="mt-1 font-mono text-[10px] tracking-[.16em] text-[hsl(var(--muted-foreground))]">{revealed[secret.id] ?? '••••••••••••••••'}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button type="button" onClick={() => toggleReveal(secret)} disabled={revealSecret.isPending} aria-label={revealed[secret.id] !== undefined ? `Masquer ${secret.name}` : `Révéler ${secret.name}`}
                      className="grid size-8 place-items-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))] disabled:opacity-50" data-testid={`button-reveal-secret-${secret.id}`}>
                      {revealed[secret.id] !== undefined ? <EyeOff className="size-3.5" /> : revealSecret.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
                    </button>
                    <button type="button" onClick={() => openEdit(secret)} aria-label={`Modifier ${secret.name}`} className="grid size-8 place-items-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]" data-testid={`button-edit-secret-${secret.id}`}><Pencil className="size-3.5" /></button>
                    <button type="button" onClick={() => { setDeleteTarget(secret); setFormError(''); }} aria-label={`Supprimer ${secret.name}`} className="grid size-8 place-items-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--destructive)/.12)] hover:text-[hsl(var(--destructive))]" data-testid={`button-delete-secret-${secret.id}`}><Trash2 className="size-3.5" /></button>
                  </div>
                </div>
                {revealed[secret.id] !== undefined && <p className="mt-2 text-[9px] leading-4 text-[hsl(var(--accent))]" role="status">Visible uniquement dans cette session. Cliquez sur l’œil pour masquer.</p>}
              </li>
            ))}
          </ul>
        )}
        {formError && !editor && <p role="alert" className="mt-2 flex items-start gap-2 rounded-lg border border-[hsl(var(--destructive)/.25)] bg-[hsl(var(--destructive)/.06)] px-3 py-2 text-[10px] leading-4 text-[hsl(var(--destructive))]"><AlertCircle className="mt-0.5 size-3 shrink-0" />{formError}</p>}
      </div>

      {editor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[hsl(225_32%_3%/.72)] p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) clearEditor(); }}>
          <form onSubmit={submitEditor} role="dialog" aria-modal="true" aria-labelledby="secret-editor-title" className="w-full max-w-md rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-[0_24px_80px_hsl(225_32%_2%/.65)]">
            <div className="flex items-start justify-between gap-3">
              <div><p className="font-mono text-[9px] uppercase tracking-[.16em] text-[hsl(var(--primary))]">Coffre privé</p><h3 id="secret-editor-title" className="mt-1 text-[16px] font-medium tracking-[-.02em] text-[hsl(var(--foreground))]">{editor.mode === 'create' ? 'Ajouter un secret' : 'Modifier le secret'}</h3></div>
              <button type="button" onClick={clearEditor} aria-label="Fermer" className="grid size-8 place-items-center rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]" data-testid="button-close-secret-editor"><X className="size-4" /></button>
            </div>
            <label className="mt-5 block text-[10px] font-medium text-[hsl(var(--muted-foreground))]">
              Libellé
              <input autoFocus required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex. API_TOKEN_PROD"
                className="mt-1.5 h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background)/.62)] px-3 font-mono text-[11px] text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary)/.55)] focus:ring-2 focus:ring-[hsl(var(--primary)/.14)]" data-testid="input-secret-name" />
            </label>
            <label className="mt-3 block text-[10px] font-medium text-[hsl(var(--muted-foreground))]">
              Valeur {editor.mode === 'edit' && <span className="font-normal">(facultatif, laisser vide pour conserver)</span>}
              <input type="password" autoComplete="new-password" required={editor.mode === 'create'} maxLength={10000} value={value} onChange={(event) => setValue(event.target.value)}
                placeholder={editor.mode === 'edit' ? 'Saisir pour remplacer la valeur' : 'Saisir la valeur à conserver'} className="mt-1.5 h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background)/.62)] px-3 text-[11px] text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary)/.55)] focus:ring-2 focus:ring-[hsl(var(--primary)/.14)]" data-testid="input-secret-value" />
            </label>
            <p className="mt-2 text-[9px] leading-4 text-[hsl(var(--muted-foreground))]">La valeur n’est jamais incluse dans la liste du coffre. Elle ne peut être consultée qu’avec l’action Révéler.</p>
            {formError && <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-[hsl(var(--destructive)/.25)] bg-[hsl(var(--destructive)/.06)] px-3 py-2 text-[10px] leading-4 text-[hsl(var(--destructive))]"><AlertCircle className="mt-0.5 size-3 shrink-0" />{formError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={clearEditor} disabled={busy} className="min-h-9 rounded-lg border border-[hsl(var(--border))] px-3 text-[10px] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] disabled:opacity-50">Fermer</button>
              <button type="submit" disabled={busy || !name.trim() || (editor.mode === 'create' && !value)} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 text-[10px] font-semibold text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-45" data-testid="button-save-secret">
                {busy && <Loader2 className="size-3 animate-spin" />}{editor.mode === 'create' ? 'Créer le secret' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[hsl(225_32%_3%/.72)] p-4 backdrop-blur-sm" role="presentation">
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-secret-title" aria-describedby="delete-secret-description" className="w-full max-w-sm rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-[0_24px_80px_hsl(225_32%_2%/.65)]">
            <h3 id="delete-secret-title" className="text-[14px] font-semibold text-[hsl(var(--foreground))]">Supprimer ce secret ?</h3>
            <p id="delete-secret-description" className="mt-2 text-[11px] leading-5 text-[hsl(var(--muted-foreground))]"><span className="font-mono text-[hsl(var(--foreground))]">{deleteTarget.name}</span> sera supprimé de ce projet. Cette action est définitive.</p>
            {formError && <p role="alert" className="mt-3 text-[10px] text-[hsl(var(--destructive))]">{formError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleteSecret.isPending} className="min-h-9 rounded-lg border border-[hsl(var(--border))] px-3 text-[10px] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]">Garder</button>
              <button type="button" onClick={confirmDelete} disabled={deleteSecret.isPending} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[hsl(var(--destructive))] px-3 text-[10px] font-semibold text-[hsl(var(--destructive-foreground))] hover:opacity-90 disabled:opacity-50" data-testid="button-confirm-delete-secret">
                {deleteSecret.isPending ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />} Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default ProjectSecretManager;
