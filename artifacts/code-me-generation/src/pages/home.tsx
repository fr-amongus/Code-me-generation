import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  Code2,
  Copy,
  Download,
  FileCode2,
  Globe2,
  History,
  Layers3,
  Loader2,
  MessageCircle,
  Monitor,
  Pencil,
  Paperclip,
  Play,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tablet,
  TerminalSquare,
  Trash2,
  WandSparkles,
  Wrench,
  RefreshCw,
} from 'lucide-react';
import {
  getListProjectMessagesQueryKey,
  getListProjectsQueryKey,
  useCreateProject,
  useDeleteProject,
  useGenerateApplication,
  useListProjectMessages,
  useListProjects,
  useSendProjectMessage,
  useUpdateProject,
  type Project,
  type ProjectMessage,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@workspace/replit-auth-web';
import ProjectToolbox, { type ToolboxAiAction } from '@/components/project-toolbox';

type WorkspaceTab = 'preview' | 'code';
type OutputMode = 'single' | 'advanced';
type PreviewWidth = 'desktop' | 'tablet' | 'mobile';
type PreviewOrientation = 'portrait' | 'landscape';
type ConsoleEntry = { level: 'log' | 'warn' | 'error'; message: string; stack?: string; time: string };
type SecurityFinding = { id: string; severity: 'critical' | 'high' | 'medium' | 'low' | 'info'; title: string; message: string; line?: number; evidence?: string; remediation: string };
type SecurityReport = { scannedAt: string; score: number; findings: SecurityFinding[]; summary: Record<string, number> };

const starterPrompts = [
  {
    title: 'Tableau de bord SaaS',
    prompt: 'Un tableau de bord SaaS pour suivre les revenus, les utilisateurs actifs et les tâches de mon équipe.',
  },
  {
    title: 'Landing page produit',
    prompt: 'Une landing page éditoriale pour une application de prise de notes pour chercheurs, avec une démo interactive.',
  },
  {
    title: 'Suivi de projets',
    prompt: 'Un espace de suivi de projets avec des colonnes kanban, des filtres par priorité et une vue activité.',
  },
  {
    title: 'Portfolio créatif',
    prompt: 'Un portfolio créatif responsive pour un designer indépendant, avec projets filtrables, présentation personnelle et formulaire de contact.',
  },
  {
    title: 'Mini-jeu',
    prompt: 'Un mini-jeu de mémoire accessible avec cartes animées, score, chronomètre et bouton pour recommencer.',
  },
  {
    title: 'Prise de notes',
    prompt: 'Une application de prise de notes avec recherche, catégories, favoris, éditeur et sauvegarde locale dans le navigateur.',
  },
];

function getWorkspaceId() {
  const key = 'code-me-generation-workspace';
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const created = `workspace-${crypto.randomUUID()}`;
    window.localStorage.setItem(key, created);
    return created;
  } catch {
    return 'workspace-local';
  }
}

function getErrorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    if ('data' in error && typeof (error as { data?: unknown }).data === 'object') {
      const value = (error as { data?: { error?: unknown } }).data?.error;
      if (typeof value === 'string') return value;
    }
    if ('error' in error) {
      const value = (error as { error?: unknown }).error;
      if (typeof value === 'string') return value;
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Cette action n’a pas abouti. Vérifiez votre demande puis réessayez.';
}

function projectNameFromPrompt(value: string) {
  const name = value.split(/[.!?]/)[0].replace(/\s+/g, ' ').trim();
  return (name.slice(0, 56) || 'Nouveau projet').replace(/[,:;]+$/, '');
}

function instrumentPreviewHtml(html: string) {
  const bridge = `<script data-code-me-console>(function(){const send=(level,args,stack)=>{try{parent.postMessage({source:'code-me-preview',level,message:Array.from(args).map(v=>typeof v==='string'?v:JSON.stringify(v)).join(' '),stack:stack||''},'*')}catch(_){}};['log','info','debug'].forEach(k=>{const o=console[k];console[k]=function(){send('log',arguments);o.apply(console,arguments)}});['warn'].forEach(k=>{const o=console[k];console[k]=function(){send('warn',arguments);o.apply(console,arguments)}});['error'].forEach(k=>{const o=console[k];console[k]=function(){send('error',arguments);o.apply(console,arguments)}});window.addEventListener('error',e=>send('error',[e.message],e.error&&e.error.stack));window.addEventListener('unhandledrejection',e=>send('error',[String(e.reason)],e.reason&&e.reason.stack));})();<\/script>`;
  return html.replace(/<head[^>]*>/i, (match) => `${match}${bridge}`);
}

type Attachment = { name: string; type: string; content: string; size: number; objectPath?: string };

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Impossible de lire ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).slice(0, 240000));
    reader.onerror = () => reject(new Error(`Impossible de lire ${file.name}`));
    reader.readAsText(file);
  });
}

async function prepareAttachment(file: File): Promise<Attachment> {
  const isBinaryPreview = file.type.startsWith('image/') || file.type === 'application/pdf';
  return {
    name: file.name,
    type: file.type || 'application/octet-stream',
    content: isBinaryPreview ? await readFileAsDataUrl(file) : await readFileAsText(file),
    size: file.size,
  };
}

function AttachmentList({ attachments, onRemove }: { attachments: Attachment[]; onRemove: (index: number) => void }) {
  if (!attachments.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 border-t border-[hsl(var(--border)/.65)] px-3 py-2">
      {attachments.map((attachment, index) => (
        <button type="button" key={`${attachment.name}-${index}`} onClick={() => onRemove(index)} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-[hsl(var(--primary)/.25)] bg-[hsl(var(--primary)/.07)] px-2 py-1 text-[10px] text-[hsl(var(--primary))]" title="Retirer la pièce jointe">
          <Paperclip className="size-3 shrink-0" />
          <span className="max-w-[150px] truncate">{attachment.name}</span>
          <span className="text-[hsl(var(--muted-foreground))]">×</span>
        </button>
      ))}
    </div>
  );
}

function BrandMark() {
  return (
    <div className="flex items-center gap-3" data-testid="brand-code-me-generation">
      <div className="relative grid size-9 place-items-center rounded-[11px] border border-[hsl(var(--primary)/.35)] bg-[hsl(var(--primary)/.1)] shadow-[0_0_0_5px_hsl(var(--primary)/.035)]">
        <span className="absolute left-[10px] top-[9px] h-3.5 w-1 rounded-sm bg-[hsl(var(--primary))]" />
        <span className="absolute bottom-[9px] right-[10px] h-3.5 w-1 rounded-sm bg-[hsl(var(--accent))]" />
        <span className="absolute left-[15px] top-[15px] size-1.5 rounded-full bg-[hsl(var(--foreground))]" />
      </div>
      <div className="leading-none">
        <div className="text-[14px] font-semibold tracking-[-0.02em] text-[hsl(var(--foreground))]">Code Me</div>
        <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.22em] text-[hsl(var(--muted-foreground))]">Generation</div>
      </div>
    </div>
  );
}

function EmptyPreview({ onTryPrompt }: { onTryPrompt: (prompt: string) => void }) {
  return (
    <div className="flex min-h-[480px] flex-1 flex-col items-center justify-center px-5 py-16 text-center sm:min-h-[560px]">
      <div className="relative mb-7">
        <div className="absolute -inset-5 rounded-full bg-[hsl(var(--primary)/.05)] blur-2xl" />
        <div className="relative grid size-[74px] place-items-center rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[0_20px_50px_hsl(225_32%_3%/.35)]">
          <WandSparkles className="size-7 text-[hsl(var(--primary))]" strokeWidth={1.5} />
        </div>
      </div>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-[hsl(var(--primary))]">Atelier prêt</p>
      <h2 className="max-w-md text-[26px] font-medium tracking-[-0.04em] text-[hsl(var(--foreground))] sm:text-[31px]">
        Votre idée prend forme ici.
      </h2>
      <p className="mt-3 max-w-sm text-[13px] leading-6 text-[hsl(var(--muted-foreground))]">
        Créez un projet puis décrivez ce que vous voulez construire. Le résultat apparaîtra dans cet espace.
      </p>
      <button
        type="button"
        onClick={() => onTryPrompt(starterPrompts[0].prompt)}
        className="mt-7 inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.65)] px-4 py-2.5 text-[12px] font-medium text-[hsl(var(--foreground))] transition-all hover:-translate-y-0.5 hover:border-[hsl(var(--primary)/.45)] hover:bg-[hsl(var(--secondary))]"
        data-testid="button-try-starter-prompt"
      >
        <Sparkles className="size-3.5 text-[hsl(var(--primary))]" />
        Essayer un exemple
        <ArrowUpRight className="size-3.5 text-[hsl(var(--muted-foreground))]" />
      </button>
    </div>
  );
}

function LoadingPreview() {
  return (
    <div className="loading-sheen min-h-[480px] flex-1 bg-[hsl(var(--card)/.32)] p-5 sm:min-h-[560px] sm:p-8">
      <div className="mb-8 flex items-center justify-between">
        <div className="h-3 w-28 rounded-full bg-[hsl(var(--muted)/.8)]" />
        <div className="flex gap-2"><div className="size-7 rounded-md bg-[hsl(var(--muted)/.7)]" /><div className="size-7 rounded-md bg-[hsl(var(--muted)/.7)]" /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1.25fr_.75fr]">
        <div className="h-36 rounded-xl bg-[hsl(var(--muted)/.65)] sm:h-52" />
        <div className="h-36 rounded-xl bg-[hsl(var(--muted)/.5)] sm:h-52" />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="h-20 rounded-xl bg-[hsl(var(--muted)/.52)]" /><div className="h-20 rounded-xl bg-[hsl(var(--muted)/.52)]" /><div className="h-20 rounded-xl bg-[hsl(var(--muted)/.52)]" /></div>
      <div className="mt-8 h-3 w-2/3 rounded-full bg-[hsl(var(--muted)/.5)]" />
      <div className="mt-3 h-3 w-1/2 rounded-full bg-[hsl(var(--muted)/.4)]" />
    </div>
  );
}

function ProjectRow({
  project,
  active,
  renaming,
  renameValue,
  onSelect,
  onStartRename,
  onRenameChange,
  onRenameKeyDown,
  onDelete,
}: {
  project: Project;
  active: boolean;
  renaming: boolean;
  renameValue: string;
  onSelect: () => void;
  onStartRename: () => void;
  onRenameChange: (value: string) => void;
  onRenameKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onDelete: () => void;
}) {
  return (
    <div className={`group relative flex items-center gap-2 rounded-lg border px-2 py-2 transition-colors ${active ? 'border-[hsl(var(--primary)/.32)] bg-[hsl(var(--primary)/.08)]' : 'border-transparent hover:border-[hsl(var(--border))] hover:bg-[hsl(var(--card)/.65)]'}`}>
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 text-left" data-testid={`button-select-project-${project.id}`}>
        <span className={`size-1.5 shrink-0 rounded-full ${active ? 'bg-[hsl(var(--primary))] shadow-[0_0_8px_hsl(var(--primary)/.8)]' : 'bg-[hsl(var(--muted-foreground)/.6)]'}`} />
        {renaming ? (
          <input autoFocus value={renameValue} onChange={(event) => onRenameChange(event.target.value)} onKeyDown={onRenameKeyDown} onClick={(event) => event.stopPropagation()} className="min-w-0 w-full rounded border border-[hsl(var(--primary)/.4)] bg-[hsl(var(--background))] px-1.5 py-0.5 text-[11px] text-[hsl(var(--foreground))] outline-none" />
        ) : (
          <span className={`truncate text-[12px] ${active ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'}`}>{project.name}</span>
        )}
      </button>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button type="button" onClick={onStartRename} className="rounded p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]" aria-label={`Renommer ${project.name}`}><Pencil className="size-3" /></button>
        <button type="button" onClick={onDelete} className="rounded p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--destructive)/.12)] hover:text-[hsl(var(--destructive))]" aria-label={`Supprimer ${project.name}`}><Trash2 className="size-3" /></button>
      </div>
    </div>
  );
}

function ChatBubble({ message }: { message: ProjectMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && <div className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-[hsl(var(--accent)/.13)] text-[hsl(var(--accent))]"><Sparkles className="size-3.5" /></div>}
      <div className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2.5 text-[12px] leading-5 ${isUser ? 'rounded-br-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'rounded-bl-md border border-[hsl(var(--border))] bg-[hsl(var(--card)/.72)] text-[hsl(var(--foreground)/.86)]'}`}>
        {message.content}
      </div>
    </div>
  );
}

export default function Home() {
  const queryClient = useQueryClient();
  const { user, isLoading: isAuthLoading, isAuthenticated, login, logout } = useAuth();
  const workspaceId = useMemo(() => user?.id ?? getWorkspaceId(), [user?.id]);
  const [prompt, setPrompt] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('preview');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [generatedHtml, setGeneratedHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [promptAttachments, setPromptAttachments] = useState<Attachment[]>([]);
  const [attachmentError, setAttachmentError] = useState('');
  const [outputMode, setOutputMode] = useState<OutputMode>('single');
  const [previewWidth, setPreviewWidth] = useState<PreviewWidth>('desktop');
  const [previewOrientation, setPreviewOrientation] = useState<PreviewOrientation>('portrait');
  const [previewScale, setPreviewScale] = useState(100);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [previewError, setPreviewError] = useState('');
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [toolPanel, setToolPanel] = useState<'security' | 'shell' | 'toolbox' | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [securityReport, setSecurityReport] = useState<SecurityReport | null>(null);
  const [isFixingSecurity, setIsFixingSecurity] = useState(false);
  const [securityFixMessage, setSecurityFixMessage] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [shellCommand, setShellCommand] = useState('help');
  const [shellOutput, setShellOutput] = useState('Sélectionne une commande puis appuie sur Entrée.');
  const [isShellRunning, setIsShellRunning] = useState(false);
  const [versions, setVersions] = useState<Array<{ id: number; html: string; label: string; createdAt: string }>>([]);
  const [selectedVersionId, setSelectedVersionId] = useState('');

  const projectsQuery = useListProjects({ workspaceId });
  const activeProject = isAuthenticated ? projectsQuery.data?.find((project) => project.id === selectedProjectId) ?? null : null;
  const visibleProjects = isAuthenticated ? (projectsQuery.data ?? []) : [];
  const messagesQuery = useListProjectMessages(activeProject?.id ?? 0, {
    query: {
      queryKey: getListProjectMessagesQueryKey(activeProject?.id ?? 0),
      enabled: Boolean(activeProject),
    },
  });
  const generateMutation = useGenerateApplication();
  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject();
  const deleteMutation = useDeleteProject();
  const chatMutation = useSendProjectMessage();
  const error = generateMutation.error ?? createMutation.error ?? updateMutation.error ?? deleteMutation.error ?? chatMutation.error;
  const isPending = generateMutation.isPending || createMutation.isPending || updateMutation.isPending;
  const isChatPending = chatMutation.isPending;
  const currentHtml = activeProject?.html ?? generatedHtml;
  const hasResult = Boolean(currentHtml);
  const codeStats = useMemo(() => currentHtml ? { lines: currentHtml.split('\n').length, chars: currentHtml.length } : { lines: 0, chars: 0 }, [currentHtml]);
  const messages = messagesQuery.data ?? [];

  const handleAttachmentSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    const accepted = files.filter((file) => file.size <= 3_500_000);
    if (accepted.length !== files.length) setAttachmentError('Chaque pièce jointe doit faire moins de 3,5 Mo.');
    try {
      const prepared = await Promise.all(accepted.slice(0, 5).map(async (file) => {
        const item = await prepareAttachment(file);
        if (!isAuthenticated) return item;
        const upload = await fetch('/api/storage/uploads/request-url', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name, size: file.size, contentType: item.type }),
        });
        if (!upload.ok) return item;
        const payload = await upload.json() as { uploadURL: string; objectPath: string };
        const stored = await fetch(payload.uploadURL, { method: 'PUT', headers: { 'Content-Type': item.type }, body: file });
        return stored.ok ? { ...item, objectPath: payload.objectPath } : item;
      }));
      if (prepared.length) setPromptAttachments((current) => [...current, ...prepared].slice(0, 5));
      if (activeProject) {
        await Promise.all(prepared.filter((item): item is Attachment & { objectPath: string } => Boolean(item.objectPath)).map((item) =>
          fetch(`/api/projects/${activeProject.id}/attachments`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspaceId, name: item.name, type: item.type, size: item.size, objectPath: item.objectPath }),
          }),
        ));
      }
      if (prepared.length) setAttachmentError('');
    } catch (attachmentReadError) {
      setAttachmentError(attachmentReadError instanceof Error ? attachmentReadError.message : 'Impossible de lire la pièce jointe.');
    }
  };

  useEffect(() => {
    if (visibleProjects.length && (selectedProjectId === null || !visibleProjects.some((project) => project.id === selectedProjectId))) {
      setSelectedProjectId(visibleProjects[0].id);
      setGeneratedHtml(null);
    }
  }, [visibleProjects, selectedProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setGeneratedHtml(null);
    setPrompt(activeProject?.prompt ?? '');
    setChatInput('');
    setActiveTab('preview');
    setPreviewError('');
    setConsoleEntries([]);
    setToolPanel(null);
    setSecurityReport(null);
    setSecurityFixMessage('');
    setShellOutput('Sélectionne une commande puis appuie sur Entrée.');
    setVersions([]);
    setSelectedVersionId('');
  }, [selectedProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isAuthenticated) return;
    try {
      const pendingPrompt = window.sessionStorage.getItem('code-me-pending-prompt');
      if (pendingPrompt) {
        setPrompt(pendingPrompt);
        window.sessionStorage.removeItem('code-me-pending-prompt');
      }
    } catch {
      // Session storage can be unavailable in privacy-restricted browsers.
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandPaletteOpen(true);
        setCommandQuery('');
      }
      if (event.key === 'Escape') {
        setCommandPaletteOpen(false);
        setCommandQuery('');
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    if (!activeProject) return;
    let cancelled = false;
    fetch(`/api/projects/${activeProject.id}/versions?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then((response) => response.ok ? response.json() : [])
      .then((data) => { if (!cancelled) setVersions(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setVersions([]); });
    return () => { cancelled = true; };
  }, [activeProject?.id, workspaceId]);

  useEffect(() => {
    if (!activeProject) return;
    fetch(`/api/projects/${activeProject.id}/attachments?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then((response) => response.ok ? response.json() : [])
      .then((data) => {
        if (!Array.isArray(data) || data.length === 0) return;
        setPromptAttachments((current) => {
          const currentByPath = new Map(current.filter((item) => item.objectPath).map((item) => [item.objectPath, item]));
          return data.map((item: { name: string; type: string; size: number; objectPath: string }) =>
            currentByPath.get(item.objectPath) ?? { name: item.name, type: item.type, size: item.size, objectPath: item.objectPath, content: '' },
          );
        });
      })
      .catch(() => undefined);
  }, [activeProject?.id, workspaceId]);

  useEffect(() => {
    const iframe = document.querySelector<HTMLIFrameElement>('[data-testid="iframe-live-preview"]');
    if (!iframe) return;
    if (currentHtml && iframe.srcdoc !== instrumentPreviewHtml(currentHtml)) {
      iframe.srcdoc = instrumentPreviewHtml(currentHtml);
    }
    const widths: Record<PreviewWidth, string> = previewOrientation === 'portrait'
      ? { desktop: '100%', tablet: '768px', mobile: '390px' }
      : { desktop: '100%', tablet: '1024px', mobile: '844px' };
    iframe.style.maxWidth = widths[previewWidth];
    iframe.style.marginInline = previewWidth === 'desktop' ? '0' : 'auto';
    const scale = previewScale / 100;
    iframe.style.transform = scale === 1 ? '' : `scale(${scale})`;
    iframe.style.transformOrigin = 'top center';
    iframe.style.width = scale === 1 ? '100%' : `${100 / scale}%`;
  }, [previewWidth, previewOrientation, previewScale, currentHtml, activeTab, previewNonce]);

  useEffect(() => {
    const iframe = document.querySelector<HTMLIFrameElement>('[data-testid="iframe-live-preview"]');
    if (!iframe) return;
    const reportError = (event: Event) => {
      const detail = event instanceof ErrorEvent ? event.message : 'Une erreur JavaScript est survenue dans l’aperçu.';
      setPreviewError(detail || 'Une erreur JavaScript est survenue dans l’aperçu.');
    };
    iframe.addEventListener('error', reportError);
    return () => iframe.removeEventListener('error', reportError);
  }, [currentHtml, activeTab]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<{ source?: string; level?: ConsoleEntry['level']; message?: string; stack?: string }>) => {
      if (event.data?.source !== 'code-me-preview' || !event.data.message) return;
      const level = event.data.level === 'warn' || event.data.level === 'error' ? event.data.level : 'log';
      const entry: ConsoleEntry = {
        level,
        message: event.data.message ?? '',
        stack: event.data.stack,
        time: new Date().toLocaleTimeString('fr-FR'),
      };
      setConsoleEntries((current) => [...current, entry].slice(-100));
      if (level === 'error') setPreviewError(event.data.message);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const invalidateProjects = () => queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey({ workspaceId }) });

  const handleGenerate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length < 3 || isPending) return;
    if (!isAuthenticated) {
      try { window.sessionStorage.setItem('code-me-pending-prompt', trimmedPrompt); } catch { /* continue to login */ }
      login();
      return;
    }
    setActiveTab('preview');
    setCopied(false);
    generateMutation.mutate({ data: { prompt: trimmedPrompt, attachments: promptAttachments } }, {
      onSuccess: (result) => {
        setGeneratedHtml(result.html);
        if (activeProject) {
          updateMutation.mutate({ id: activeProject.id, data: { workspaceId, prompt: trimmedPrompt, html: result.html } }, { onSuccess: invalidateProjects });
        } else {
          createMutation.mutate({ data: { workspaceId, name: projectNameFromPrompt(trimmedPrompt), prompt: trimmedPrompt, html: result.html } }, {
            onSuccess: (project) => {
              setSelectedProjectId(project.id);
              invalidateProjects();
            },
          });
        }
      },
    });
  };

  const handleNewProject = () => {
    if (!isAuthenticated) {
      login();
      return;
    }
    createMutation.mutate({ data: { workspaceId, name: 'Nouveau projet', prompt: '', html: null } }, {
      onSuccess: (project) => {
        setSelectedProjectId(project.id);
        setPrompt('');
        setGeneratedHtml(null);
        invalidateProjects();
      },
    });
  };

  const handleRenameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') setRenamingId(null);
    if (event.key !== 'Enter' || !renamingId || !renameValue.trim()) return;
    updateMutation.mutate({ id: renamingId, data: { workspaceId, name: renameValue.trim() } }, {
      onSuccess: () => {
        setRenamingId(null);
        invalidateProjects();
      },
    });
  };

  const handleDelete = (project: Project) => {
    if (!window.confirm(`Supprimer « ${project.name} » et sa conversation ?`)) return;
    deleteMutation.mutate({ id: project.id, data: { workspaceId } }, {
      onSuccess: () => {
        if (selectedProjectId === project.id) setSelectedProjectId(null);
        invalidateProjects();
      },
    });
  };

  const handleSendChat = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = chatInput.trim();
    if (!isAuthenticated) {
      login();
      return;
    }
    if (!activeProject || !message || isChatPending) return;
    chatMutation.mutate({ projectId: activeProject.id, data: { workspaceId, message, attachments: promptAttachments } }, {
      onSuccess: (result) => {
        setChatInput('');
        setGeneratedHtml(null);
        queryClient.setQueryData<Project[]>(getListProjectsQueryKey({ workspaceId }), (previous) => previous?.map((project) => project.id === result.project.id ? result.project : project));
        queryClient.setQueryData<ProjectMessage[]>(getListProjectMessagesQueryKey(activeProject.id), (previous) => [...(previous ?? []), result.userMessage, result.assistantMessage]);
      },
    });
  };

  const handleCopy = async () => {
    if (!currentHtml) return;
    try {
      await navigator.clipboard.writeText(currentHtml);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { setCopied(false); }
  };

  const handleDownload = async () => {
    if (!currentHtml || isDownloading) return;
    setIsDownloading(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const projectName = (activeProject?.name || projectNameFromPrompt(prompt)).toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'generated-app';
      if (outputMode === 'advanced') {
        const styles = [...currentHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]).join('\n\n');
        const scripts = [...currentHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]).join('\n\n');
        const advancedHtml = currentHtml
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '<link rel="stylesheet" href="styles.css">')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '<script src="script.js"></script>');
        zip.file('index.html', advancedHtml);
        zip.file('styles.css', styles || '/* Styles générés */');
        zip.file('script.js', scripts || '// JavaScript généré');
      } else {
        zip.file('index.html', currentHtml);
      }
      zip.file('README.md', `# ${activeProject?.name || projectName}\n\nApplication générée avec Code Me Generation.\n\n## Brief original\n\n${activeProject?.prompt || prompt}\n`);
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${projectName}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } finally { setIsDownloading(false); }
  };

  const handleRestoreVersion = async (versionId = selectedVersionId) => {
    if (!activeProject || !versionId) return;
    const response = await fetch(`/api/projects/${activeProject.id}/versions/${versionId}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId }),
    });
    if (!response.ok) return;
    const restored = await response.json() as Project;
    setGeneratedHtml(null);
    queryClient.setQueryData<Project[]>(getListProjectsQueryKey({ workspaceId }), (previous) => previous?.map((project) => project.id === restored.id ? restored : project));
    setSelectedVersionId('');
    setPreviewError('');
  };

  const handleToolboxAiAction = (action: ToolboxAiAction) => {
    if (!activeProject || isChatPending) return;
    if (!isAuthenticated) {
      login();
      return;
    }
    const prompts: Record<ToolboxAiAction, string> = {
      explain: 'Explique précisément la structure actuelle de cette application, les zones importantes du HTML, du CSS et du JavaScript, ainsi que les choix d’accessibilité. Ne modifie pas le projet : donne uniquement une explication pédagogique.',
      refactor: 'Refactorise le projet actuel sans changer son apparence ni ses fonctionnalités. Sépare les responsabilités, réduis les répétitions et améliore la lisibilité. Vérifie que le résultat reste autonome et fonctionnel.',
      tests: 'Ajoute une stratégie de tests ciblés pour les interactions importantes du projet. Si le projet est autonome, ajoute des contrôles de test non destructifs et explique précisément ce qui est couvert.',
      accessibility: 'Améliore l’accessibilité du projet : structure sémantique, labels, navigation clavier, attributs ARIA utiles, textes alternatifs et responsive. Ne supprime aucune fonctionnalité.',
      performance: 'Optimise les performances du projet sans modifier son expérience visuelle : réduis les répétitions, limite les coûts JavaScript, optimise le rendu et conserve un HTML autonome.',
    };
    chatMutation.mutate({
      projectId: activeProject.id,
      data: { workspaceId, message: prompts[action], attachments: promptAttachments },
    }, {
      onSuccess: (result) => {
        queryClient.setQueryData<Project[]>(getListProjectsQueryKey({ workspaceId }), (previous) => previous?.map((project) => project.id === result.project.id ? result.project : project));
        queryClient.setQueryData<ProjectMessage[]>(getListProjectMessagesQueryKey(activeProject.id), (previous) => [...(previous ?? []), result.userMessage, result.assistantMessage]);
      },
    });
  };

  const handleFixPreview = () => {
    if (!isAuthenticated) {
      login();
      return;
    }
    if (!activeProject || (!previewError && !error) || isChatPending) return;
    const detectedError = previewError || getErrorMessage(error);
    const message = `Une erreur a été détectée dans le projet : "${detectedError}". Analyse le HTML actuel, corrige la cause sans supprimer les fonctionnalités existantes, puis explique précisément le correctif.`;
    chatMutation.mutate({ projectId: activeProject.id, data: { workspaceId, message, attachments: promptAttachments } }, {
      onSuccess: (result) => {
        setPreviewError('');
        queryClient.setQueryData<Project[]>(getListProjectsQueryKey({ workspaceId }), (previous) => previous?.map((project) => project.id === result.project.id ? result.project : project));
        queryClient.setQueryData<ProjectMessage[]>(getListProjectMessagesQueryKey(activeProject.id), (previous) => [...(previous ?? []), result.userMessage, result.assistantMessage]);
      },
    });
  };

  const handleFixSecurity = () => {
    if (!securityReport?.findings.length || isFixingSecurity || isChatPending) return;
    if (!isAuthenticated) {
      login();
      return;
    }
    const findings = securityReport.findings.slice(0, 16).map((finding) =>
      `- [${finding.severity}] ${finding.title}${finding.line ? ` (ligne ${finding.line})` : ''}: ${finding.message} Correction attendue: ${finding.remediation}`,
    ).join('\n');
    setIsFixingSecurity(true);
    setSecurityFixMessage('');
    chatMutation.mutate({
      projectId: activeProject?.id ?? 0,
      data: {
        workspaceId,
        message: `Corrige les constats du scan de sécurité ci-dessous dans le projet actuel. Vérifie chaque correction dans le HTML et conserve les fonctionnalités existantes. Explique ensuite les changements et la validation.\n\n${findings}`,
      },
    }, {
      onSuccess: (result) => {
        setSecurityReport(null);
        setSecurityFixMessage('Correction appliquée. Relance le scan pour vérifier le résultat.');
        setPreviewError('');
        queryClient.setQueryData<Project[]>(getListProjectsQueryKey({ workspaceId }), (previous) => previous?.map((project) => project.id === result.project.id ? result.project : project));
        queryClient.setQueryData<ProjectMessage[]>(getListProjectMessagesQueryKey(result.project.id), (previous) => [...(previous ?? []), result.userMessage, result.assistantMessage]);
      },
      onSettled: () => setIsFixingSecurity(false),
    });
  };

  const handleSecurityScan = async () => {
    if (!activeProject || isScanning) return;
    setToolPanel('security');
    setIsScanning(true);
    try {
      const response = await fetch(`/api/projects/${activeProject.id}/security-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });
      if (!response.ok) throw new Error('Le scan n’a pas pu être exécuté.');
      setSecurityReport(await response.json() as SecurityReport);
    } catch (scanError) {
      setSecurityReport({ scannedAt: new Date().toISOString(), score: 0, findings: [{ id: 'scan-error', severity: 'high', title: 'Scan indisponible', message: scanError instanceof Error ? scanError.message : 'Erreur inconnue', remediation: 'Réessaie dans quelques instants.' }], summary: { high: 1 } });
    } finally {
      setIsScanning(false);
    }
  };

  const handleShellCommand = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!activeProject || !shellCommand.trim() || isShellRunning) return;
    setToolPanel('shell');
    setIsShellRunning(true);
    try {
      const response = await fetch(`/api/projects/${activeProject.id}/shell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, command: shellCommand.trim() }),
      });
      const result = await response.json() as { output?: string; exitCode?: number };
      setShellOutput(`${result.output ?? 'Aucune sortie.'}${result.exitCode ? `\n\n[exit ${result.exitCode}]` : ''}`);
    } catch (shellError) {
      setShellOutput(shellError instanceof Error ? shellError.message : 'Le terminal est indisponible.');
    } finally {
      setIsShellRunning(false);
    }
  };

  const statusLabel = isPending ? 'Génération en cours' : isChatPending ? 'Amélioration en cours' : hasResult ? 'Application prête' : activeProject ? 'Projet vide' : 'Créez votre premier projet';

  return (
    <main className="min-h-[100dvh] bg-transparent text-[hsl(var(--foreground))]">
      <header className="flex h-[68px] items-center justify-between border-b border-[hsl(var(--border)/.75)] bg-[hsl(var(--background)/.72)] px-4 backdrop-blur-xl sm:px-7">
        <div className="flex items-center gap-7"><BrandMark /><div className="hidden h-5 w-px bg-[hsl(var(--border))] sm:block" /><div className="hidden items-center gap-2 text-[11px] text-[hsl(var(--muted-foreground))] sm:flex"><div className="size-1.5 rounded-full bg-[hsl(var(--primary))] shadow-[0_0_10px_hsl(var(--primary)/.7)]" /><span data-testid="status-workspace">Workspace personnel</span></div></div>
        <div className="flex items-center gap-2"><div className="hidden items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card)/.6)] px-3 py-1.5 font-mono text-[10px] text-[hsl(var(--muted-foreground))] sm:flex"><TerminalSquare className="size-3.5 text-[hsl(var(--accent))]" /> v0.5.0</div><button type="button" onClick={() => { setPrompt(activeProject?.prompt ?? ''); setChatInput(''); setActiveTab('preview'); }} className="group inline-flex items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-[11px] text-[hsl(var(--muted-foreground))] transition-colors hover:border-[hsl(var(--border))] hover:bg-[hsl(var(--card)/.6)] hover:text-[hsl(var(--foreground))]" data-testid="button-reset-header"><RotateCcw className="size-3.5 transition-transform group-hover:-rotate-45" /><span className="hidden sm:inline">Réinitialiser</span></button></div>
      </header>
       <div className="flex flex-wrap items-center gap-2 border-b border-[hsl(var(--border)/.65)] bg-[hsl(var(--background)/.35)] px-4 py-2.5 sm:px-7">
        <label htmlFor="context-attachments" className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card)/.45)] px-2.5 py-1.5 text-[10px] text-[hsl(var(--muted-foreground))] transition-colors hover:border-[hsl(var(--primary)/.45)] hover:text-[hsl(var(--foreground))]">
          <Paperclip className="size-3.5 text-[hsl(var(--primary))]" />
          Ajouter une image ou un fichier
          <input id="context-attachments" type="file" multiple accept="image/*,.pdf,.txt,.md,.json,.csv,.html,.css,.js" className="sr-only" onChange={handleAttachmentSelection} />
        </label>
        <AttachmentList attachments={promptAttachments} onRemove={(index) => setPromptAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
        <span className="text-[10px] text-[hsl(var(--muted-foreground))]">Le contexte sera transmis au générateur et à l’assistant.</span>
        {attachmentError && <span className="text-[10px] text-[hsl(var(--destructive))]">{attachmentError}</span>}
        <label className="ml-auto inline-flex items-center gap-1.5 text-[10px] text-[hsl(var(--muted-foreground))]">
          <span>Export</span>
          <select value={outputMode} onChange={(event) => setOutputMode(event.target.value as OutputMode)} className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-1.5 py-1 text-[10px] text-[hsl(var(--foreground))]">
            <option value="single">HTML seul</option>
            <option value="advanced">Projet avancé</option>
          </select>
        </label>
        <label className="inline-flex items-center gap-1.5 text-[10px] text-[hsl(var(--muted-foreground))]">
          <span>Aperçu</span>
          <select value={previewWidth} onChange={(event) => setPreviewWidth(event.target.value as PreviewWidth)} className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-1.5 py-1 text-[10px] text-[hsl(var(--foreground))]">
            <option value="desktop">Desktop</option>
            <option value="tablet">Tablette</option>
            <option value="mobile">Mobile</option>
          </select>
        </label>
        {activeProject && versions.length > 0 && <label className="inline-flex items-center gap-1.5 text-[10px] text-[hsl(var(--muted-foreground))]"><History className="size-3" /><select value={selectedVersionId} onChange={(event) => setSelectedVersionId(event.target.value)} className="max-w-[135px] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-1.5 py-1 text-[10px] text-[hsl(var(--foreground))]"><option value="">Versions</option>{versions.map((version) => <option key={version.id} value={version.id}>{version.label} · {new Date(version.createdAt).toLocaleDateString('fr-FR')}</option>)}</select><button type="button" onClick={handleRestoreVersion} disabled={!selectedVersionId} className="rounded-md border border-[hsl(var(--primary)/.3)] px-2 py-1 text-[10px] text-[hsl(var(--primary))] disabled:opacity-40">Restaurer</button></label>}
         {(previewError || error) && <div className="flex items-center gap-2 rounded-md border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.08)] px-2 py-1 text-[10px] text-[hsl(var(--destructive))]"><span className="max-w-[230px] truncate" title={previewError || getErrorMessage(error)}>{previewError ? `Erreur preview : ${previewError}` : getErrorMessage(error)}</span><button type="button" onClick={handleFixPreview} disabled={!activeProject || isChatPending} className="font-semibold underline">Réparer avec l’IA</button></div>}
         <button type="button" onClick={handleSecurityScan} disabled={!activeProject || isScanning} className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px] ${toolPanel === 'security' ? 'border-[hsl(var(--primary)/.45)] bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}><ShieldCheck className="size-3.5" />{isScanning ? 'Scan...' : 'Scan sécurité'}</button>
         <button type="button" onClick={() => setToolPanel((panel) => panel === 'shell' ? null : 'shell')} disabled={!activeProject} className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px] ${toolPanel === 'shell' ? 'border-[hsl(var(--accent)/.45)] bg-[hsl(var(--accent)/.1)] text-[hsl(var(--accent))]' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}><TerminalSquare className="size-3.5" />Shell</button>
         <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <>
              <span className="hidden text-[10px] text-[hsl(var(--muted-foreground))] sm:inline">{user?.firstName || user?.email || 'Compte connecté'}</span>
              <button type="button" onClick={logout} className="rounded-md border border-[hsl(var(--border))] px-2.5 py-1.5 text-[10px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">Se déconnecter</button>
            </>
          ) : (
             <button type="button" onClick={login} className="rounded-md border border-[hsl(var(--primary)/.35)] bg-[hsl(var(--primary)/.08)] px-2.5 py-1.5 text-[10px] font-medium text-[hsl(var(--primary))]">Créer un compte / Se connecter</button>
          )}
        </div>

       {!isAuthLoading && !isAuthenticated && <div className="border-b border-amber-300/20 bg-amber-300/[.06] px-4 py-3 sm:px-7" role="status" data-testid="banner-auth-required">
         <div className="mx-auto flex max-w-[1900px] flex-wrap items-center justify-between gap-3">
           <div className="flex items-start gap-2.5"><AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-200" /><div><p className="text-[11px] font-medium text-amber-100">Créez un compte pour conserver vos projets et votre code</p><p className="mt-1 text-[10px] leading-5 text-amber-100/65">La connexion est requise avant la création ou la sauvegarde. Le compte est créé automatiquement lors de votre première connexion.</p></div></div>
           <button type="button" onClick={login} className="rounded-lg border border-amber-200/30 bg-amber-200/10 px-3 py-2 text-[10px] font-semibold text-amber-100 hover:bg-amber-200/15">Créer un compte / Se connecter</button>
         </div>
       </div>}
      </div>

      {toolPanel && <section className="border-b border-[hsl(var(--border)/.65)] bg-[hsl(var(--background)/.55)] px-4 py-3 sm:px-7" data-testid={`panel-tool-${toolPanel}`}>
        {toolPanel === 'shell' ? <div className="mx-auto max-w-[1900px]">
          <div className="mb-2 flex items-center justify-between"><span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[hsl(var(--accent))]"><TerminalSquare className="size-3.5" /> Terminal projet</span><span className="text-[10px] text-[hsl(var(--muted-foreground))]">Mode sécurisé · pas de commande serveur arbitraire</span></div>
          <form onSubmit={handleShellCommand} className="flex gap-2"><span className="rounded-lg bg-[#090b12] px-3 py-2 font-mono text-[11px] text-[hsl(var(--primary))]">$</span><input value={shellCommand} onChange={(event) => setShellCommand(event.target.value)} list="shell-commands" className="min-w-0 flex-1 rounded-lg border border-[hsl(var(--border))] bg-[#090b12] px-3 py-2 font-mono text-[11px] text-slate-200 outline-none focus:border-[hsl(var(--accent)/.6)]" placeholder="help" /><datalist id="shell-commands">{['help', 'pwd', 'ls', 'cat index.html', 'head index.html', 'tail index.html', 'wc -l index.html', 'versions', 'security scan'].map((command) => <option key={command} value={command} />)}</datalist><button type="submit" disabled={isShellRunning} className="rounded-lg bg-[hsl(var(--accent))] px-3 py-2 text-[10px] font-semibold text-[hsl(var(--accent-foreground))] disabled:opacity-50">{isShellRunning ? '...' : 'Exécuter'}</button></form>
          <pre className="mt-2 max-h-52 overflow-auto rounded-lg border border-[hsl(var(--border)/.7)] bg-[#090b12] p-3 font-mono text-[10px] leading-5 text-slate-300 whitespace-pre-wrap">{shellOutput}</pre>
        </div> : <div className="mx-auto max-w-[1900px]">
          <div className="mb-2 flex items-center justify-between"><span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[hsl(var(--primary))]"><ShieldCheck className="size-3.5" /> Scan sécurité du projet</span>{securityReport && <span className={`font-mono text-[10px] ${securityReport.score >= 80 ? 'text-[hsl(var(--primary))]' : 'text-amber-300'}`}>Score {securityReport.score}/100 · {securityReport.findings.length} constat(s)</span>}</div>
           {!securityReport ? <div><p className="text-[11px] text-[hsl(var(--muted-foreground))]">Analyse le HTML, le JavaScript et les ressources externes de ce projet.</p>{securityFixMessage && <p className="mt-2 text-[10px] text-[hsl(var(--primary))]">{securityFixMessage}</p>}</div> : <div className="space-y-2">{securityReport.findings.length === 0 && <p className="text-[11px] text-[hsl(var(--primary))]">Aucun risque détecté dans les règles analysées.</p>}{securityReport.findings.map((finding) => <details key={finding.id} className="rounded-lg border border-[hsl(var(--border)/.7)] bg-[hsl(var(--card)/.45)] px-3 py-2"><summary className="cursor-pointer list-none text-[11px]"><span className={`mr-2 rounded px-1.5 py-0.5 text-[9px] uppercase ${finding.severity === 'critical' || finding.severity === 'high' ? 'bg-red-400/15 text-red-300' : finding.severity === 'medium' ? 'bg-amber-400/15 text-amber-200' : 'bg-slate-400/15 text-slate-300'}`}>{finding.severity}</span>{finding.title}{finding.line ? ` · ligne ${finding.line}` : ''}</summary><p className="mt-2 text-[10px] leading-5 text-[hsl(var(--muted-foreground))]">{finding.message}</p><p className="mt-1 text-[10px] leading-5 text-[hsl(var(--primary))]">Correction : {finding.remediation}</p>{finding.evidence && <code className="mt-1 block truncate text-[9px] text-slate-400">{finding.evidence}</code>}</details>)}{securityReport.findings.length > 0 && <button type="button" onClick={handleFixSecurity} disabled={isFixingSecurity || isChatPending} className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-[10px] font-semibold text-[hsl(var(--primary-foreground))] disabled:cursor-not-allowed disabled:opacity-50"><WandSparkles className="size-3.5" />{isFixingSecurity || isChatPending ? 'Correction en cours...' : 'Fixé avec l’IA'}</button>}</div>}
        </div>}
      </section>}

      {consoleEntries.length > 0 && <section className="border-b border-[hsl(var(--border)/.65)] bg-[#090b12] px-4 py-2.5 font-mono text-[10px] sm:px-7" data-testid="panel-preview-console">
        <div className="mb-2 flex items-center justify-between text-[hsl(var(--muted-foreground))]"><span className="inline-flex items-center gap-1.5"><TerminalSquare className="size-3.5 text-[hsl(var(--primary))]" /> Console preview <span className="rounded bg-[hsl(var(--secondary))] px-1.5 py-0.5">{consoleEntries.length}</span></span><button type="button" onClick={() => { setConsoleEntries([]); setPreviewError(''); }} className="hover:text-[hsl(var(--foreground))]">Effacer</button></div>
        <div className="max-h-36 space-y-1 overflow-y-auto">{consoleEntries.map((entry, index) => <details key={`${entry.time}-${index}`} open={entry.level === 'error'} className={entry.level === 'error' ? 'text-red-300' : entry.level === 'warn' ? 'text-amber-200' : 'text-slate-300'}><summary className="cursor-pointer list-none"><span className="mr-2 text-slate-500">{entry.time}</span><span className="mr-2 uppercase">{entry.level}</span>{entry.message}</summary>{entry.stack && <pre className="mt-1 whitespace-pre-wrap pl-16 text-[9px] text-red-200/80">{entry.stack}</pre>}</details>)}</div>
      </section>}

      <div className="mx-auto grid max-w-[1900px] grid-cols-1 lg:grid-cols-[238px_315px_minmax(0,1fr)_330px]">
        <aside className="border-b border-[hsl(var(--border)/.8)] bg-[hsl(var(--sidebar)/.7)] p-4 sm:p-6 lg:min-h-[calc(100dvh-68px)] lg:border-b-0 lg:border-r lg:p-5">
          <div className="mb-6 flex items-center justify-between"><div><p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[hsl(var(--muted-foreground))]">Workspace</p><h1 className="mt-1.5 text-[16px] font-medium tracking-[-0.04em]">Projets</h1></div><button type="button" onClick={handleNewProject} disabled={createMutation.isPending} className="grid size-8 place-items-center rounded-lg border border-[hsl(var(--primary)/.3)] bg-[hsl(var(--primary)/.09)] text-[hsl(var(--primary))] transition-colors hover:bg-[hsl(var(--primary)/.16)] disabled:opacity-50]" aria-label="Créer un projet" data-testid="button-new-project"><Plus className="size-4" /></button></div>
           {projectsQuery.isLoading && isAuthenticated ? <div className="space-y-2"><div className="pulse-line h-8 rounded-lg bg-[hsl(var(--muted)/.5)]" /><div className="pulse-line h-8 rounded-lg bg-[hsl(var(--muted)/.35)]" /></div> : visibleProjects.length ? <div className="space-y-1">{visibleProjects.map((project) => <ProjectRow key={project.id} project={project} active={project.id === selectedProjectId} renaming={project.id === renamingId} renameValue={renameValue} onSelect={() => setSelectedProjectId(project.id)} onStartRename={() => { setRenamingId(project.id); setRenameValue(project.name); }} onRenameChange={setRenameValue} onRenameKeyDown={handleRenameKeyDown} onDelete={() => handleDelete(project)} />)}</div> : <div className="rounded-xl border border-dashed border-[hsl(var(--border))] px-3 py-5 text-center"><Layers3 className="mx-auto size-5 text-[hsl(var(--muted-foreground))]" /><p className="mt-2 text-[11px] leading-5 text-[hsl(var(--muted-foreground))]">{isAuthenticated ? 'Aucun projet sauvegardé.' : 'Connectez-vous pour créer et conserver vos projets.'}</p><button type="button" onClick={handleNewProject} className="mt-3 text-[11px] font-medium text-[hsl(var(--primary))] hover:underline">{isAuthenticated ? 'Créer maintenant' : 'Créer un compte / Se connecter'}</button></div>}
          <div className="mt-8 border-t border-[hsl(var(--border)/.75)] pt-5"><p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Pistes de départ</p><div className="mt-3 space-y-1">{starterPrompts.map((starter) => <button type="button" key={starter.title} onClick={() => setPrompt(starter.prompt)} className="group flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[hsl(var(--card)/.75)]"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[hsl(var(--border))] group-hover:bg-[hsl(var(--primary))]" /><span className="text-[11px] leading-5 text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))]">{starter.title}</span></button>)}</div></div>
        </aside>

        <aside className="border-b border-[hsl(var(--border)/.8)] bg-[hsl(var(--sidebar)/.42)] p-4 sm:p-6 lg:min-h-[calc(100dvh-68px)] lg:border-b-0 lg:border-r lg:p-6">
          <div className="mb-7 flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--primary))]">01 / Brief</p><h2 className="mt-2 text-[20px] font-medium tracking-[-0.04em]">Décrire une app</h2></div><div className="grid size-8 place-items-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card)/.6)] text-[hsl(var(--muted-foreground))]"><MessageCircle className="size-4" /></div></div>
          <form onSubmit={handleGenerate}><label htmlFor="application-prompt" className="mb-2.5 block text-[11px] font-medium text-[hsl(var(--foreground)/.82)]">Votre demande</label><div className={`group relative rounded-xl border bg-[hsl(var(--background)/.55)] transition-colors ${error ? 'border-[hsl(var(--destructive)/.8)]' : 'border-[hsl(var(--border))] focus-within:border-[hsl(var(--primary)/.65)]'}`}><textarea id="application-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Décris l'application que tu souhaites créer (ex: un convertisseur de devises, une todo-list moderne, un mini-jeu Snake)..." rows={7} maxLength={10000} className="block w-full resize-none bg-transparent px-4 py-3.5 text-[13px] leading-6 text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground)/.75)]" data-testid="input-application-prompt" /><div className="flex items-center justify-between border-t border-[hsl(var(--border)/.65)] px-3.5 py-2.5"><span className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]" data-testid="text-prompt-character-count">{prompt.length.toLocaleString('fr-FR')} / 10 000</span><span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[hsl(var(--muted-foreground))]"><Sparkles className="size-3 text-[hsl(var(--accent))]" /> langage naturel</span></div></div>{error && <div className="mt-3 flex items-start gap-2 rounded-lg border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.08)] px-3 py-2.5 text-[11px] leading-5 text-[hsl(var(--destructive))]" role="alert"><AlertCircle className="mt-0.5 size-3.5 shrink-0" /><span>{getErrorMessage(error)}</span></div>}<button type="submit" disabled={prompt.trim().length < 3 || isPending} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-3 text-[12px] font-semibold text-[hsl(var(--primary-foreground))] shadow-[0_10px_25px_hsl(var(--primary)/.12)] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none" data-testid="button-generate-application">{isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-3.5 fill-current" />}{isPending ? 'Construction en cours...' : activeProject ? 'Regénérer le projet' : 'Générer l’application'}</button></form>
          <div className="mt-8 rounded-xl border border-[hsl(var(--border)/.75)] bg-[hsl(var(--card)/.45)] p-4"><div className="mb-3 flex items-center gap-2"><div className="grid size-6 place-items-center rounded-md bg-[hsl(var(--accent)/.12)] text-[hsl(var(--accent))]"><Layers3 className="size-3.5" /></div><span className="text-[11px] font-medium">Projet persistant</span></div><p className="text-[11px] leading-5 text-[hsl(var(--muted-foreground))]">Votre brief, votre HTML et chaque échange avec l’assistant restent liés au projet sélectionné.</p></div>
        </aside>

        <section className="min-w-0 p-4 sm:p-6 lg:p-7">
          <div className="studio-enter mb-5 flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--muted-foreground))]">02 / Workspace</p><h2 className="mt-2 text-[23px] font-medium tracking-[-0.045em] sm:text-[27px]">{activeProject?.name || 'Aperçu de votre application'}</h2></div><div className="flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card)/.48)] px-3 py-1.5 text-[10px] text-[hsl(var(--muted-foreground))]" data-testid="status-generation"><span className={`size-1.5 rounded-full ${isPending || isChatPending ? 'animate-pulse bg-[hsl(var(--chart-3))]' : hasResult ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted-foreground))]'}`} />{statusLabel}</div></div>
          <div className="studio-enter overflow-hidden rounded-2xl border border-[hsl(var(--border)/.9)] bg-[hsl(var(--card)/.68)] shadow-[0_24px_70px_hsl(225_32%_3%/.25)]"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--background)/.34)] px-3 py-2.5 sm:px-4"><div className="flex items-center gap-1 rounded-lg bg-[hsl(var(--secondary)/.7)] p-1"><button type="button" onClick={() => setActiveTab('preview')} className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-[11px] transition-all ${activeTab === 'preview' ? 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`} data-testid="tab-live-preview"><Monitor className="size-3.5" /> Aperçu <span className="text-[hsl(var(--primary))]">Live</span></button><button type="button" onClick={() => setActiveTab('code')} disabled={!hasResult} className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-[11px] transition-all disabled:cursor-not-allowed disabled:opacity-35 ${activeTab === 'code' ? 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`} data-testid="tab-source-code"><Code2 className="size-3.5" /> Code source</button></div>{hasResult && <div className="flex items-center gap-2"><span className="hidden font-mono text-[10px] text-[hsl(var(--muted-foreground))] sm:inline">{codeStats.lines} lignes · {codeStats.chars.toLocaleString('fr-FR')} car.</span><button type="button" onClick={handleCopy} className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] px-2.5 py-1.5 text-[10px] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]" data-testid="button-copy-source">{copied ? <Check className="size-3.5 text-[hsl(var(--primary))]" /> : <Copy className="size-3.5" />}{copied ? 'Copié' : 'Copier'}</button><button type="button" onClick={handleDownload} disabled={isDownloading} className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--primary)/.28)] bg-[hsl(var(--primary)/.08)] px-2.5 py-1.5 text-[10px] text-[hsl(var(--primary))] disabled:opacity-60" data-testid="button-download-project"><Download className={`size-3.5 ${isDownloading ? 'animate-bounce' : ''}`} />{isDownloading ? 'Préparation...' : 'Télécharger le ZIP'}</button></div>}</div><div className="preview-scroll flex min-h-[480px] flex-col sm:min-h-[560px]">{activeTab === 'preview' && (isPending || isChatPending ? <LoadingPreview /> : currentHtml ? <iframe title="Aperçu de l’application générée" srcDoc={currentHtml} sandbox="allow-scripts allow-forms allow-modals" className="min-h-[480px] w-full flex-1 border-0 bg-[#f8fafc] sm:min-h-[560px]" data-testid="iframe-live-preview" /> : <EmptyPreview onTryPrompt={setPrompt} />)}{activeTab === 'code' && currentHtml && <pre className="code-scroll min-h-[480px] flex-1 overflow-auto bg-[hsl(228_35%_7%/.72)] p-4 font-mono text-[11px] leading-[1.75] text-[hsl(210_27%_82%)] sm:min-h-[560px] sm:p-6" data-testid="content-source-code"><code>{currentHtml}</code></pre>}</div></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3 px-1 text-[10px] text-[hsl(var(--muted-foreground))]"><div className="flex items-center gap-2"><Globe2 className="size-3.5 text-[hsl(var(--primary)/.8)]" /><span>Le preview tourne dans un environnement isolé.</span></div>{hasResult && <div className="flex items-center gap-1.5 font-mono"><FileCode2 className="size-3.5" /> single-file output</div>}</div>
        </section>

        <aside className="flex min-h-[560px] flex-col border-t border-[hsl(var(--border)/.8)] bg-[hsl(var(--sidebar)/.48)] p-4 sm:p-6 lg:min-h-[calc(100dvh-68px)] lg:border-l lg:border-t-0 lg:p-5">
          <div className="mb-4 flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--accent))]">03 / Assistant</p><h2 className="mt-2 text-[19px] font-medium tracking-[-0.04em]">Améliorer le projet</h2></div><div className="grid size-8 place-items-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card)/.6)] text-[hsl(var(--accent))]"><Sparkles className="size-4" /></div></div>
          {!activeProject ? <div className="flex flex-1 flex-col items-center justify-center px-4 text-center"><MessageCircle className="size-7 text-[hsl(var(--muted-foreground))]" /><p className="mt-3 text-[12px] font-medium">Sélectionnez un projet</p><p className="mt-2 text-[11px] leading-5 text-[hsl(var(--muted-foreground))]">L’assistant pourra ensuite modifier votre application en gardant tout l’historique.</p></div> : <><div className="chat-scroll flex-1 space-y-4 overflow-y-auto pr-1">{messagesQuery.isLoading ? <div className="space-y-3"><div className="h-14 rounded-2xl bg-[hsl(var(--muted)/.4)]" /><div className="ml-auto h-12 w-4/5 rounded-2xl bg-[hsl(var(--muted)/.3)]" /></div> : messages.length ? messages.map((message) => <ChatBubble key={message.id} message={message} />) : <div className="rounded-xl border border-dashed border-[hsl(var(--border))] px-3 py-5 text-center"><Sparkles className="mx-auto size-5 text-[hsl(var(--accent))]" /><p className="mt-2 text-[11px] leading-5 text-[hsl(var(--muted-foreground))]">Demandez une modification, une nouvelle section ou une amélioration visuelle.</p></div>}{isChatPending && <div className="flex items-center gap-2 text-[11px] text-[hsl(var(--muted-foreground))]"><Loader2 className="size-3.5 animate-spin text-[hsl(var(--accent))]" /> Analyse du projet en cours...</div>}</div><form onSubmit={handleSendChat} className="mt-4 border-t border-[hsl(var(--border)/.8)] pt-4"><div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.55)] focus-within:border-[hsl(var(--accent)/.65)]"><textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Ex: ajoute un mode sombre et une animation d’entrée..." rows={3} maxLength={10000} disabled={isChatPending} className="block w-full resize-none bg-transparent px-3.5 py-3 text-[12px] leading-5 text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground)/.7)]" data-testid="input-project-chat" /><div className="flex items-center justify-between border-t border-[hsl(var(--border)/.65)] px-3 py-2"><span className="text-[10px] text-[hsl(var(--muted-foreground))]">L’historique est sauvegardé</span><button type="submit" disabled={!chatInput.trim() || isChatPending} className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--accent))] px-2.5 py-1.5 text-[10px] font-semibold text-[hsl(var(--accent-foreground))] disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-send-project-chat">{isChatPending ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />} Envoyer</button></div></div></form></>}
        </aside>
      </div>
    </main>
  );
}