import { useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  Code2,
  Copy,
  Download,
  FileCode2,
  Globe2,
  Layers3,
  Loader2,
  Monitor,
  PanelLeft,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  TerminalSquare,
  WandSparkles,
} from 'lucide-react';
import { useGenerateApplication } from '@workspace/api-client-react';

type WorkspaceTab = 'preview' | 'code';

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
];

function getErrorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null && 'error' in error) {
    const value = (error as { error?: unknown }).error;
    if (typeof value === 'string') return value;
  }
  if (error instanceof Error && error.message) return error.message;
  return 'La génération n’a pas abouti. Vérifiez votre demande puis réessayez.';
}

function BrandMark() {
  return (
    <div className="flex items-center gap-3" data-testid="brand-code-me-generation">
      <div className="relative grid size-9 place-items-center rounded-[11px] border border-[hsl(var(--primary)/.35)] bg-[hsl(var(--primary)/.1)] shadow-[0_0_0_5px_hsl(var(--primary)/.035)]">
        <span className="absolute left-[10px] top-[9px] h-3.5 w-1 rounded-sm bg-[hsl(var(--primary))]" />
        <span className="absolute right-[10px] bottom-[9px] h-3.5 w-1 rounded-sm bg-[hsl(var(--accent))]" />
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
        Décrivez ce que vous voulez construire. Le résultat apparaîtra dans cet espace, sans détour.
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
        <div className="flex gap-2">
          <div className="size-7 rounded-md bg-[hsl(var(--muted)/.7)]" />
          <div className="size-7 rounded-md bg-[hsl(var(--muted)/.7)]" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1.25fr_.75fr]">
        <div className="h-36 rounded-xl bg-[hsl(var(--muted)/.65)] sm:h-52" />
        <div className="h-36 rounded-xl bg-[hsl(var(--muted)/.5)] sm:h-52" />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="h-20 rounded-xl bg-[hsl(var(--muted)/.52)]" />
        <div className="h-20 rounded-xl bg-[hsl(var(--muted)/.52)]" />
        <div className="h-20 rounded-xl bg-[hsl(var(--muted)/.52)]" />
      </div>
      <div className="mt-8 h-3 w-2/3 rounded-full bg-[hsl(var(--muted)/.5)]" />
      <div className="mt-3 h-3 w-1/2 rounded-full bg-[hsl(var(--muted)/.4)]" />
      <div className="mt-3 h-3 w-3/5 rounded-full bg-[hsl(var(--muted)/.4)]" />
    </div>
  );
}

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('preview');
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const { data, isPending, error, mutate, reset } = useGenerateApplication();
  const hasResult = Boolean(data?.html);
  const canGenerate = prompt.trim().length >= 3 && !isPending;
  const statusLabel = isPending ? 'Génération en cours' : hasResult ? 'Application prête' : 'En attente de votre idée';

  const codeStats = useMemo(() => {
    if (!data?.html) return { lines: 0, chars: 0 };
    return { lines: data.html.split('\n').length, chars: data.html.length };
  }, [data?.html]);

  const handleGenerate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canGenerate) return;
    setActiveTab('preview');
    setCopied(false);
    reset();
    mutate({ data: { prompt: prompt.trim() } });
  };

  const handleReset = () => {
    setPrompt('');
    setCopied(false);
    setActiveTab('preview');
    reset();
  };

  const handleCopy = async () => {
    if (!data?.html) return;
    try {
      await navigator.clipboard.writeText(data.html);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const handleDownload = async () => {
    if (!data?.html || isDownloading) return;

    setIsDownloading(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const projectName =
        prompt
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 48) || 'generated-app';

      zip.file('index.html', data.html);
      zip.file(
        'README.md',
        `# ${projectName}\n\nApplication générée avec Code Me Generation.\n\n## Lancer le projet\n\nOuvre simplement \`index.html\` dans ton navigateur. Le projet est autonome : le HTML, le CSS et le JavaScript sont regroupés dans un seul fichier.\n\n## Brief original\n\n${prompt.trim()}\n`,
      );

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${projectName}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-transparent text-[hsl(var(--foreground))]">
      <header className="flex h-[68px] items-center justify-between border-b border-[hsl(var(--border)/.75)] bg-[hsl(var(--background)/.72)] px-4 backdrop-blur-xl sm:px-7">
        <div className="flex items-center gap-7">
          <BrandMark />
          <div className="hidden h-5 w-px bg-[hsl(var(--border))] sm:block" />
          <div className="hidden items-center gap-2 text-[11px] text-[hsl(var(--muted-foreground))] sm:flex">
            <div className="size-1.5 rounded-full bg-[hsl(var(--primary))] shadow-[0_0_10px_hsl(var(--primary)/.7)]" />
            <span data-testid="status-workspace">Workspace personnel</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card)/.6)] px-3 py-1.5 font-mono text-[10px] text-[hsl(var(--muted-foreground))] sm:flex">
            <TerminalSquare className="size-3.5 text-[hsl(var(--accent))]" />
            v0.4.2
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="group inline-flex items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-[11px] text-[hsl(var(--muted-foreground))] transition-colors hover:border-[hsl(var(--border))] hover:bg-[hsl(var(--card)/.6)] hover:text-[hsl(var(--foreground))]"
            data-testid="button-reset-header"
          >
            <RotateCcw className="size-3.5 transition-transform group-hover:-rotate-45" />
            <span className="hidden sm:inline">Réinitialiser</span>
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1700px] grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="border-b border-[hsl(var(--border)/.8)] bg-[hsl(var(--sidebar)/.65)] p-4 sm:p-6 lg:min-h-[calc(100dvh-68px)] lg:border-b-0 lg:border-r lg:p-7">
          <div className="studio-enter">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--primary))]">01 / Brief</p>
                <h1 className="mt-2 text-[20px] font-medium tracking-[-0.04em]">Décrire une app</h1>
              </div>
              <div className="grid size-8 place-items-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card)/.6)] text-[hsl(var(--muted-foreground))]">
                <PanelLeft className="size-4" />
              </div>
            </div>
            <form onSubmit={handleGenerate}>
              <label htmlFor="application-prompt" className="mb-2.5 block text-[11px] font-medium text-[hsl(var(--foreground)/.82)]">
                Votre demande
              </label>
              <div className={`group relative rounded-xl border bg-[hsl(var(--background)/.55)] transition-colors ${error ? 'border-[hsl(var(--destructive)/.8)]' : 'border-[hsl(var(--border))] focus-within:border-[hsl(var(--primary)/.65)]'}`}>
                <textarea
                  id="application-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                   placeholder="Décris l'application que tu souhaites créer (ex: Un convertisseur de devises, une todo-list moderne, un mini-jeu Snake)..."
                  rows={7}
                  maxLength={10000}
                  className="block w-full resize-none bg-transparent px-4 py-3.5 text-[13px] leading-6 text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground)/.75)]"
                  data-testid="input-application-prompt"
                />
                <div className="flex items-center justify-between border-t border-[hsl(var(--border)/.65)] px-3.5 py-2.5">
                  <span className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]" data-testid="text-prompt-character-count">{prompt.length.toLocaleString('fr-FR')} / 10 000</span>
                  <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">
                    <Sparkles className="size-3 text-[hsl(var(--accent))]" /> langage naturel
                  </span>
                </div>
              </div>
              {error && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.08)] px-3 py-2.5 text-[11px] leading-5 text-[hsl(var(--destructive))]" role="alert" data-testid="status-generation-error">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                  <span>{getErrorMessage(error)}</span>
                </div>
              )}
              <button
                type="submit"
                disabled={!canGenerate}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-3 text-[12px] font-semibold text-[hsl(var(--primary-foreground))] shadow-[0_10px_25px_hsl(var(--primary)/.12)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_28px_hsl(var(--primary)/.2)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                data-testid="button-generate-application"
              >
                {isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-3.5 fill-current" />}
                {isPending ? 'Construction en cours...' : 'Générer l’application'}
              </button>
            </form>
          </div>

          <div className="studio-enter studio-delay-1 mt-9 border-t border-[hsl(var(--border)/.8)] pt-6">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Pistes de départ</p>
              <Plus className="size-3.5 text-[hsl(var(--muted-foreground))]" />
            </div>
            <div className="space-y-1.5">
              {starterPrompts.map((starter) => (
                <button
                  type="button"
                  key={starter.title}
                  onClick={() => setPrompt(starter.prompt)}
                  className="group flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-[hsl(var(--card)/.75)]"
                  data-testid={`button-starter-prompt-${starter.title.toLowerCase().replaceAll(' ', '-')}`}
                >
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[hsl(var(--border))] transition-colors group-hover:bg-[hsl(var(--primary))]" />
                  <span className="text-[12px] leading-5 text-[hsl(var(--muted-foreground))] transition-colors group-hover:text-[hsl(var(--foreground))]">{starter.title}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="studio-enter studio-delay-2 mt-8 rounded-xl border border-[hsl(var(--border)/.75)] bg-[hsl(var(--card)/.45)] p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="grid size-6 place-items-center rounded-md bg-[hsl(var(--accent)/.12)] text-[hsl(var(--accent))]"><Layers3 className="size-3.5" /></div>
              <span className="text-[11px] font-medium">Une sortie autonome</span>
            </div>
            <p className="text-[11px] leading-5 text-[hsl(var(--muted-foreground))]">HTML, CSS et JavaScript réunis dans un seul fichier prêt à explorer.</p>
          </div>
        </aside>

        <section className="min-w-0 p-4 sm:p-6 lg:p-7">
          <div className="studio-enter studio-delay-1 mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--muted-foreground))]">02 / Workspace</p>
              <h2 className="mt-2 text-[23px] font-medium tracking-[-0.045em] sm:text-[27px]">Aperçu de votre application</h2>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card)/.48)] px-3 py-1.5 text-[10px] text-[hsl(var(--muted-foreground))]" data-testid="status-generation">
              <span className={`size-1.5 rounded-full ${isPending ? 'animate-pulse bg-[hsl(var(--chart-3))]' : hasResult ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted-foreground))]'}`} />
              {statusLabel}
            </div>
          </div>

          <div className="studio-enter studio-delay-2 overflow-hidden rounded-2xl border border-[hsl(var(--border)/.9)] bg-[hsl(var(--card)/.68)] shadow-[0_24px_70px_hsl(225_32%_3%/.25)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--background)/.34)] px-3 py-2.5 sm:px-4">
              <div className="flex items-center gap-1 rounded-lg bg-[hsl(var(--secondary)/.7)] p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-[11px] transition-all ${activeTab === 'preview' ? 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}
                  data-testid="tab-live-preview"
                >
                  <Monitor className="size-3.5" /> Aperçu <span className="text-[hsl(var(--primary))]">Live</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('code')}
                  disabled={!hasResult}
                  className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-[11px] transition-all disabled:cursor-not-allowed disabled:opacity-35 ${activeTab === 'code' ? 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}
                  data-testid="tab-source-code"
                >
                  <Code2 className="size-3.5" /> Code source
                </button>
              </div>
              {hasResult && (
                <div className="flex items-center gap-2">
                  <span className="hidden font-mono text-[10px] text-[hsl(var(--muted-foreground))] sm:inline">{codeStats.lines} lignes · {codeStats.chars.toLocaleString('fr-FR')} car.</span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] px-2.5 py-1.5 text-[10px] text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]"
                    data-testid="button-copy-source"
                  >
                    {copied ? <Check className="size-3.5 text-[hsl(var(--primary))]" /> : <Copy className="size-3.5" />}
                    {copied ? 'Copié' : 'Copier'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--primary)/.28)] bg-[hsl(var(--primary)/.08)] px-2.5 py-1.5 text-[10px] text-[hsl(var(--primary))] transition-colors hover:bg-[hsl(var(--primary)/.14)] disabled:cursor-wait disabled:opacity-60"
                    data-testid="button-download-project"
                    aria-label="Télécharger le projet au format ZIP"
                  >
                    <Download className={`size-3.5 ${isDownloading ? 'animate-bounce' : ''}`} />
                    {isDownloading ? 'Préparation...' : 'Télécharger le ZIP'}
                  </button>
                </div>
              )}
            </div>

            <div className="preview-scroll flex min-h-[480px] flex-col sm:min-h-[560px]">
              {activeTab === 'preview' && (
                isPending ? <LoadingPreview /> : data?.html ? (
                  <iframe
                    title="Aperçu de l’application générée"
                    srcDoc={data.html}
                    sandbox="allow-scripts allow-forms allow-modals"
                    className="min-h-[480px] w-full flex-1 border-0 bg-[#f8fafc] sm:min-h-[560px]"
                    data-testid="iframe-live-preview"
                  />
                ) : <EmptyPreview onTryPrompt={setPrompt} />
              )}
              {activeTab === 'code' && data?.html && (
                <pre className="code-scroll min-h-[480px] flex-1 overflow-auto bg-[hsl(228_35%_7%/.72)] p-4 font-mono text-[11px] leading-[1.75] text-[hsl(210_27%_82%)] sm:min-h-[560px] sm:p-6" data-testid="content-source-code"><code>{data.html}</code></pre>
              )}
            </div>
          </div>

          <div className="studio-enter studio-delay-3 mt-4 flex flex-wrap items-center justify-between gap-3 px-1 text-[10px] text-[hsl(var(--muted-foreground))]">
            <div className="flex items-center gap-2">
              <Globe2 className="size-3.5 text-[hsl(var(--primary)/.8)]" />
              <span>Le preview tourne dans un environnement isolé.</span>
            </div>
            {hasResult && (
              <div className="flex items-center gap-1.5 font-mono">
                <FileCode2 className="size-3.5" /> single-file output
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}