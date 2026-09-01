import { useMemo, useState, type ComponentType } from 'react';
import {
  Accessibility,
  ArchiveRestore,
  BarChart3,
  Braces,
  Check,
  ChevronRight,
  Clock3,
  Code2,
  ExternalLink,
  FileCode2,
  FileImage,
  FileJson,
  FileText,
  Gauge,
  History,
  Info,
  Layers3,
  Lightbulb,
  ListChecks,
  LockKeyhole,
  Minus,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  X,
  Zap,
} from 'lucide-react';

export type ToolboxAttachment = {
  name: string;
  type: string;
  size: number;
  objectPath?: string;
  content: string;
};

export type ToolboxVersion = {
  id: string | number;
  html: string;
  label: string;
  createdAt: string;
};

export type ToolboxAiAction = 'explain' | 'refactor' | 'tests' | 'accessibility' | 'performance';
export type ToolboxTab = 'files' | 'history' | 'quality' | 'assets' | 'ai';

export type ProjectToolboxProps = {
  currentHtml: string | null;
  attachments: ToolboxAttachment[];
  versions: ToolboxVersion[];
  selectedVersionId: string | number | null;
  onSelectVersion: (versionId: string | number) => void;
  onRestoreVersion: (versionId: string | number) => void;
  onAiAction: (action: ToolboxAiAction) => void;
  onClose: () => void;
};

type FileEntry = {
  name: string;
  kind: 'html' | 'css' | 'js';
  content: string;
  lines: number;
  size: number;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
};

type QualityFinding = {
  id: string;
  title: string;
  detail: string;
  severity: 'réussi' | 'attention' | 'critique';
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
};

const tabs: Array<{ id: ToolboxTab; label: string; icon: ComponentType<{ className?: string; strokeWidth?: number }> }> = [
  { id: 'files', label: 'Fichiers', icon: Layers3 },
  { id: 'history', label: 'Historique', icon: History },
  { id: 'quality', label: 'Qualité', icon: ShieldCheck },
  { id: 'assets', label: 'Ressources', icon: FileImage },
  { id: 'ai', label: 'Actions IA', icon: Sparkles },
];

const aiActions: Array<{
  id: ToolboxAiAction;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  tone: string;
}> = [
  {
    id: 'explain',
    title: 'Expliquer le code',
    description: 'Obtenir une lecture claire des choix et de la structure.',
    icon: Lightbulb,
    tone: 'text-[hsl(var(--chart-3))] bg-[hsl(var(--chart-3)/.1)] border-[hsl(var(--chart-3)/.22)]',
  },
  {
    id: 'refactor',
    title: 'Refactoriser',
    description: 'Rendre le code plus lisible, modulaire et maintenable.',
    icon: Braces,
    tone: 'text-[hsl(var(--primary))] bg-[hsl(var(--primary)/.1)] border-[hsl(var(--primary)/.22)]',
  },
  {
    id: 'tests',
    title: 'Ajouter des tests',
    description: 'Couvrir les interactions importantes avec des tests ciblés.',
    icon: ListChecks,
    tone: 'text-[hsl(var(--chart-4))] bg-[hsl(var(--chart-4)/.1)] border-[hsl(var(--chart-4)/.22)]',
  },
  {
    id: 'accessibility',
    title: 'Améliorer l’accessibilité',
    description: 'Corriger les contrastes, labels et comportements clavier.',
    icon: Accessibility,
    tone: 'text-[hsl(var(--accent))] bg-[hsl(var(--accent)/.1)] border-[hsl(var(--accent)/.22)]',
  },
  {
    id: 'performance',
    title: 'Optimiser les performances',
    description: 'Repérer les coûts inutiles et accélérer le rendu.',
    icon: Zap,
    tone: 'text-[hsl(var(--chart-3))] bg-[hsl(var(--chart-3)/.1)] border-[hsl(var(--chart-3)/.22)]',
  },
];

function countLines(value: string) {
  return value ? value.split(/\r?\n/).length : 0;
}

function extractBlocks(html: string, tag: 'style' | 'script') {
  const matches = Array.from(html.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi')));
  return matches.map((match) => match[1].trim()).filter(Boolean).join('\n\n');
}

function deriveFiles(html: string | null): FileEntry[] {
  const source = html ?? '';
  const styles = extractBlocks(source, 'style');
  const scripts = extractBlocks(source, 'script');
  const indexHtml = source
    ? source.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/\n{3,}/g, '\n\n').trim()
    : '';

  return [
    { name: 'index.html', kind: 'html', content: indexHtml, lines: countLines(indexHtml), size: indexHtml.length, icon: FileCode2 },
    { name: 'styles.css', kind: 'css', content: styles, lines: countLines(styles), size: styles.length, icon: FileText },
    { name: 'script.js', kind: 'js', content: scripts, lines: countLines(scripts), size: scripts.length, icon: TerminalSquare },
  ];
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes > 10240 ? 0 : 1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    .format(date)
    .replace('.', '');
}

function readableType(type: string, name: string) {
  if (type.includes('svg') || name.toLowerCase().endsWith('.svg')) return 'SVG';
  if (type.includes('image')) return type.split('/')[1]?.toUpperCase() || 'IMAGE';
  if (type.includes('pdf')) return 'PDF';
  if (type.includes('json')) return 'JSON';
  return type.split('/')[1]?.toUpperCase() || 'FICHIER';
}

function getAttachmentIcon(type: string, name: string) {
  if (type.includes('image') || /\.(png|jpe?g|gif|svg|webp)$/i.test(name)) return FileImage;
  if (type.includes('json') || name.toLowerCase().endsWith('.json')) return FileJson;
  return FileText;
}

function scoreQuality(html: string | null): { score: number; findings: QualityFinding[] } {
  const source = html ?? '';
  const hasHtml = Boolean(source.trim());
  const hasLang = /<html[^>]+lang\s*=\s*["'][^"']+["']/i.test(source);
  const hasTitle = /<title[^>]*>[\s\S]*?<\/title>/i.test(source);
  const images = Array.from(source.matchAll(/<img\b[^>]*>/gi));
  const missingAlt = images.filter(([image]) => !/\balt\s*=/i.test(image)).length;
  const hasViewport = /<meta[^>]+name\s*=\s*["']viewport["']/i.test(source);
  const inlineHandlers = (source.match(/\bon(?:click|change|submit|load|mouseover)\s*=/gi) ?? []).length;
  const scriptCount = (source.match(/<script\b/gi) ?? []).length;
  const styleCount = (source.match(/<style\b/gi) ?? []).length;
  const findings: QualityFinding[] = [
    {
      id: 'document',
      title: hasTitle ? 'Titre de document détecté' : 'Titre de document manquant',
      detail: hasTitle ? 'La page expose un titre utile aux onglets et lecteurs d’écran.' : 'Ajoutez une balise <title> descriptive dans le document.',
      severity: hasTitle ? 'réussi' : 'critique',
      icon: hasTitle ? Check : Info,
    },
    {
      id: 'language',
      title: hasLang ? 'Langue du document définie' : 'Langue du document à préciser',
      detail: hasLang ? 'L’attribut lang aide les technologies d’assistance à choisir la bonne prononciation.' : 'Ajoutez lang à la balise html pour clarifier la langue principale.',
      severity: hasLang ? 'réussi' : 'attention',
      icon: hasLang ? Check : Accessibility,
    },
    {
      id: 'images',
      title: missingAlt ? `${missingAlt} image${missingAlt > 1 ? 's' : ''} sans texte alternatif` : 'Images avec texte alternatif',
      detail: missingAlt ? 'Les images informatives devraient décrire leur contenu avec alt.' : 'Chaque image possède un attribut alt explicite.',
      severity: missingAlt ? 'attention' : 'réussi',
      icon: missingAlt ? Accessibility : Check,
    },
    {
      id: 'viewport',
      title: hasViewport ? 'Viewport responsive présent' : 'Viewport responsive absent',
      detail: hasViewport ? 'La page peut adapter sa largeur aux écrans mobiles.' : 'Ajoutez la meta viewport pour éviter un rendu mobile compressé.',
      severity: hasViewport ? 'réussi' : 'attention',
      icon: hasViewport ? Check : Gauge,
    },
    {
      id: 'handlers',
      title: inlineHandlers ? `${inlineHandlers} gestionnaire${inlineHandlers > 1 ? 's' : ''} inline détecté${inlineHandlers > 1 ? 's' : ''}` : 'Pas de gestionnaire inline',
      detail: inlineHandlers ? 'Séparez les comportements du balisage pour faciliter les tests et la maintenance.' : 'Les interactions semblent séparées du markup.',
      severity: inlineHandlers ? 'attention' : 'réussi',
      icon: inlineHandlers ? Code2 : Check,
    },
    {
      id: 'weight',
      title: source.length > 120000 ? 'Document volumineux' : 'Poids du document maîtrisé',
      detail: source.length > 120000 ? 'Le HTML dépasse 120 Ko ; pensez à réduire les répétitions et styles inline.' : `${formatBytes(source.length)} de HTML analysé localement.`,
      severity: source.length > 120000 ? 'attention' : 'réussi',
      icon: source.length > 120000 ? Gauge : Zap,
    },
    {
      id: 'bundles',
      title: `${scriptCount} script${scriptCount > 1 ? 's' : ''} et ${styleCount} bloc${styleCount > 1 ? 's' : ''} de style`,
      detail: 'Indicateur de structure pour repérer rapidement les zones à factoriser.',
      severity: scriptCount > 4 || styleCount > 4 ? 'attention' : 'réussi',
      icon: BarChart3,
    },
  ];
  if (!hasHtml) return { score: 0, findings: findings.slice(0, 0) };
  const critical = findings.filter((finding) => finding.severity === 'critique').length;
  const attention = findings.filter((finding) => finding.severity === 'attention').length;
  return { score: Math.max(0, Math.min(100, 100 - critical * 18 - attention * 7)), findings };
}

function getComparison(currentHtml: string | null, version: ToolboxVersion | undefined) {
  const current = currentHtml ?? '';
  const before = version?.html ?? '';
  const currentLines = current ? current.split(/\r?\n/) : [];
  const beforeLines = before ? before.split(/\r?\n/) : [];
  const beforeSet = new Set(beforeLines.map((line) => line.trim()).filter(Boolean));
  const currentSet = new Set(currentLines.map((line) => line.trim()).filter(Boolean));
  const additions = currentLines.filter((line) => line.trim() && !beforeSet.has(line.trim())).length;
  const removals = beforeLines.filter((line) => line.trim() && !currentSet.has(line.trim())).length;
  return {
    beforeLines: beforeLines.length,
    currentLines: currentLines.length,
    additions,
    removals,
    changed: Boolean(version) && before !== current,
  };
}

function EmptyState({ icon: Icon, title, detail, testId }: { icon: ComponentType<{ className?: string; strokeWidth?: number }>; title: string; detail: string; testId: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--background)/.35)] px-5 py-12 text-center" data-testid={testId}>
      <div className="mb-3 grid size-10 place-items-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.55)] text-[hsl(var(--muted-foreground))]">
        <Icon className="size-4" strokeWidth={1.6} />
      </div>
      <p className="text-[12px] font-medium text-[hsl(var(--foreground))]">{title}</p>
      <p className="mt-1 max-w-[250px] text-[11px] leading-5 text-[hsl(var(--muted-foreground))]">{detail}</p>
    </div>
  );
}

function SectionHeading({ eyebrow, title, detail, testId }: { eyebrow: string; title: string; detail: string; testId: string }) {
  return (
    <div className="mb-4" data-testid={testId}>
      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[hsl(var(--primary))]">{eyebrow}</p>
      <h3 className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-[hsl(var(--foreground))]">{title}</h3>
      <p className="mt-1 text-[11px] leading-5 text-[hsl(var(--muted-foreground))]">{detail}</p>
    </div>
  );
}

function severityClasses(severity: QualityFinding['severity']) {
  if (severity === 'réussi') return 'border-[hsl(var(--primary)/.2)] bg-[hsl(var(--primary)/.06)] text-[hsl(var(--primary))]';
  if (severity === 'critique') return 'border-[hsl(var(--destructive)/.24)] bg-[hsl(var(--destructive)/.07)] text-[hsl(var(--destructive))]';
  return 'border-[hsl(var(--chart-3)/.24)] bg-[hsl(var(--chart-3)/.07)] text-[hsl(var(--chart-3))]';
}

export default function ProjectToolbox({
  currentHtml,
  attachments,
  versions,
  selectedVersionId,
  onSelectVersion,
  onRestoreVersion,
  onAiAction,
  onClose,
}: ProjectToolboxProps) {
  const [activeTab, setActiveTab] = useState<ToolboxTab>('files');
  const [qualityReport, setQualityReport] = useState<{ score: number; findings: QualityFinding[] } | null>(null);

  const files = useMemo(() => deriveFiles(currentHtml), [currentHtml]);
  const currentQuality = useMemo(() => scoreQuality(currentHtml), [currentHtml]);
  const selectedVersion = useMemo(
    () => versions.find((version) => String(version.id) === String(selectedVersionId)),
    [selectedVersionId, versions],
  );
  const comparison = useMemo(() => getComparison(currentHtml, selectedVersion), [currentHtml, selectedVersion]);
  const report = qualityReport ?? currentQuality;
  const criticalCount = report.findings.filter((finding) => finding.severity === 'critique').length;
  const attentionCount = report.findings.filter((finding) => finding.severity === 'attention').length;

  const runQualityScan = () => setQualityReport(scoreQuality(currentHtml));

  const openAttachment = (attachment: ToolboxAttachment) => {
    const target = attachment.objectPath ? `/api/storage${attachment.objectPath}` : attachment.content;
    if (!target) return;
    if (attachment.objectPath || attachment.content.startsWith('data:') || attachment.content.startsWith('http')) {
      window.open(target, '_blank', 'noopener,noreferrer');
      return;
    }
    const url = `data:${attachment.type || 'text/plain'};charset=utf-8,${encodeURIComponent(attachment.content)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <aside className="flex min-h-0 w-full flex-col overflow-hidden border border-[hsl(var(--border))] bg-[hsl(var(--card)/.96)] shadow-[0_24px_70px_hsl(225_32%_3%/.4)] xl:max-w-[390px]" data-testid="project-toolbox">
      <header className="flex shrink-0 items-start justify-between border-b border-[hsl(var(--border)/.8)] px-4 py-3.5" data-testid="toolbox-header">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-[hsl(var(--primary)/.25)] bg-[hsl(var(--primary)/.08)] text-[hsl(var(--primary))]">
            <TerminalSquare className="size-4" strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[13px] font-semibold text-[hsl(var(--foreground))]" data-testid="text-toolbox-title">Boîte à outils</h2>
              <span className="rounded-full border border-[hsl(var(--primary)/.22)] bg-[hsl(var(--primary)/.07)] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-[hsl(var(--primary))]" data-testid="status-local-analysis">local</span>
            </div>
            <p className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]" data-testid="text-toolbox-subtitle">Inspecter, améliorer, valider</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1.5 text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]" aria-label="Fermer la boîte à outils" data-testid="button-close-toolbox">
          <X className="size-4" />
        </button>
      </header>

      <nav className="grid shrink-0 grid-cols-5 gap-0.5 border-b border-[hsl(var(--border)/.8)] bg-[hsl(var(--background)/.35)] p-1.5" aria-label="Sections de la boîte à outils" data-testid="toolbox-tabs">
        {tabs.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              type="button"
              key={id}
              onClick={() => setActiveTab(id)}
              className={`group relative flex min-w-0 flex-col items-center gap-1 rounded-md px-1 py-2 text-[9px] transition-colors ${active ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary)/.55)] hover:text-[hsl(var(--foreground))]'}`}
              aria-selected={active}
              role="tab"
              data-testid={`tab-toolbox-${id}`}
            >
              <Icon className={`size-3.5 ${active ? 'text-[hsl(var(--primary))]' : ''}`} strokeWidth={active ? 2 : 1.7} />
              <span className="truncate">{label}</span>
              {active && <span className="absolute inset-x-2 -bottom-[7px] h-px bg-[hsl(var(--primary))]" />}
            </button>
          );
        })}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto p-4" data-testid={`toolbox-panel-${activeTab}`}>
        {activeTab === 'files' && (
          <section data-testid="section-files">
            <SectionHeading eyebrow="Structure générée" title="Fichiers du projet" detail="Vue déduite du HTML actuel, sans modifier votre source." testId="heading-files" />
            <div className="mb-4 grid grid-cols-3 gap-2" data-testid="file-summary">
              <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background)/.32)] px-2.5 py-2">
                <p className="font-mono text-[9px] uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">Total</p>
                <p className="mt-1 text-[15px] font-semibold text-[hsl(var(--foreground))]" data-testid="text-file-count">{currentHtml ? '3' : '0'}</p>
              </div>
              <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background)/.32)] px-2.5 py-2">
                <p className="font-mono text-[9px] uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">Lignes</p>
                <p className="mt-1 text-[15px] font-semibold text-[hsl(var(--foreground))]" data-testid="text-total-lines">{currentHtml ? countLines(currentHtml) : '—'}</p>
              </div>
              <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background)/.32)] px-2.5 py-2">
                <p className="font-mono text-[9px] uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">Taille</p>
                <p className="mt-1 text-[15px] font-semibold text-[hsl(var(--foreground))]" data-testid="text-html-size">{currentHtml ? formatBytes(currentHtml.length) : '—'}</p>
              </div>
            </div>
            {!currentHtml ? (
              <EmptyState icon={FileCode2} title="Aucun fichier pour le moment" detail="Générez une première page pour voir sa structure ici." testId="empty-files" />
            ) : (
              <div className="space-y-2" data-testid="file-list">
                {files.map((file) => {
                  const Icon = file.icon;
                  return (
                    <div key={file.name} className="group flex items-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.32)] px-3 py-3 transition-colors hover:border-[hsl(var(--primary)/.25)]" data-testid={`file-row-${file.kind}`}>
                      <div className={`grid size-8 shrink-0 place-items-center rounded-lg ${file.kind === 'html' ? 'bg-[hsl(var(--chart-4)/.1)] text-[hsl(var(--chart-4))]' : file.kind === 'css' ? 'bg-[hsl(var(--accent)/.1)] text-[hsl(var(--accent))]' : 'bg-[hsl(var(--chart-3)/.1)] text-[hsl(var(--chart-3))]'}`}>
                        <Icon className="size-4" strokeWidth={1.7} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[11px] text-[hsl(var(--foreground))]" data-testid={`text-file-name-${file.kind}`}>{file.name}</p>
                        <p className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]" data-testid={`text-file-meta-${file.kind}`}>{file.lines} lignes <span className="mx-1 text-[hsl(var(--border))]">·</span> {formatBytes(file.size)}</p>
                      </div>
                      <ChevronRight className="size-3.5 text-[hsl(var(--muted-foreground)/.5)] transition-transform group-hover:translate-x-0.5" />
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-[hsl(var(--border)/.7)] bg-[hsl(var(--secondary)/.25)] px-3 py-2.5" data-testid="files-note">
              <Info className="mt-0.5 size-3.5 shrink-0 text-[hsl(var(--muted-foreground))]" />
              <p className="text-[10px] leading-4 text-[hsl(var(--muted-foreground))]">Les blocs CSS et JavaScript intégrés sont comptés séparément pour préparer un export en fichiers autonomes.</p>
            </div>
          </section>
        )}

        {activeTab === 'history' && (
          <section data-testid="section-history">
            <SectionHeading eyebrow="Mémoire du projet" title="Versions" detail="Comparez les étapes puis revenez à une version précédente." testId="heading-history" />
            {!versions.length ? (
              <EmptyState icon={History} title="Historique vide" detail="Les versions apparaîtront après vos premières générations." testId="empty-history" />
            ) : (
              <>
                <div className="space-y-2" data-testid="version-list">
                  {versions.map((version, index) => {
                    const isSelected = String(version.id) === String(selectedVersionId);
                    const isCurrent = index === 0 && !selectedVersionId;
                    return (
                      <button
                        type="button"
                        key={version.id}
                        onClick={() => onSelectVersion(version.id)}
                        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${isSelected ? 'border-[hsl(var(--primary)/.4)] bg-[hsl(var(--primary)/.08)]' : 'border-[hsl(var(--border))] bg-[hsl(var(--background)/.3)] hover:border-[hsl(var(--primary)/.25)] hover:bg-[hsl(var(--secondary)/.48)]'}`}
                        aria-pressed={isSelected}
                        data-testid={`button-select-version-${version.id}`}
                      >
                        <div className={`relative grid size-7 shrink-0 place-items-center rounded-full border ${isSelected ? 'border-[hsl(var(--primary)/.45)] bg-[hsl(var(--primary)/.12)] text-[hsl(var(--primary))]' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]'}`}>
                          {isCurrent ? <Check className="size-3.5" /> : <Clock3 className="size-3.5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-[11px] font-medium text-[hsl(var(--foreground))]" data-testid={`text-version-label-${version.id}`}>{version.label}</p>
                            {isCurrent && <span className="shrink-0 rounded-full bg-[hsl(var(--primary)/.1)] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[.1em] text-[hsl(var(--primary))]">actuelle</span>}
                          </div>
                          <p className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]" data-testid={`text-version-date-${version.id}`}>{formatDate(version.createdAt)} <span className="mx-1 text-[hsl(var(--border))]">·</span> {countLines(version.html)} lignes</p>
                        </div>
                        <ChevronRight className={`size-3.5 shrink-0 ${isSelected ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground)/.5)]'}`} />
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.34)] p-3.5" data-testid="version-comparison">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-[.16em] text-[hsl(var(--primary))]">Comparaison</p>
                      <p className="mt-1 text-[12px] font-medium text-[hsl(var(--foreground))]" data-testid="text-comparison-title">{selectedVersion ? `Actuelle ↔ ${selectedVersion.label}` : 'Sélectionnez une version'}</p>
                    </div>
                    <div className={`rounded-full px-2 py-1 font-mono text-[9px] ${comparison.changed ? 'bg-[hsl(var(--chart-3)/.1)] text-[hsl(var(--chart-3))]' : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]'}`} data-testid="status-comparison">{comparison.changed ? 'modifiée' : 'aucun écart'}</div>
                  </div>
                  {selectedVersion ? (
                    <div className="grid grid-cols-3 gap-2" data-testid="comparison-metrics">
                      <div className="rounded-lg bg-[hsl(var(--secondary)/.55)] px-2 py-2"><p className="text-[10px] text-[hsl(var(--muted-foreground))]">Ajouts</p><p className="mt-1 font-mono text-[12px] text-[hsl(var(--primary))]" data-testid="text-comparison-additions"><span className="mr-0.5">+</span>{comparison.additions}</p></div>
                      <div className="rounded-lg bg-[hsl(var(--secondary)/.55)] px-2 py-2"><p className="text-[10px] text-[hsl(var(--muted-foreground))]">Retraits</p><p className="mt-1 font-mono text-[12px] text-[hsl(var(--destructive))]" data-testid="text-comparison-removals"><span className="mr-0.5">−</span>{comparison.removals}</p></div>
                      <div className="rounded-lg bg-[hsl(var(--secondary)/.55)] px-2 py-2"><p className="text-[10px] text-[hsl(var(--muted-foreground))]">Lignes</p><p className="mt-1 font-mono text-[12px] text-[hsl(var(--foreground))]" data-testid="text-comparison-lines">{comparison.beforeLines} → {comparison.currentLines}</p></div>
                    </div>
                  ) : (
                    <p className="text-[11px] leading-5 text-[hsl(var(--muted-foreground))]" data-testid="text-comparison-empty">Choisissez une version dans la liste pour afficher son évolution face au HTML actuel.</p>
                  )}
                  <button type="button" disabled={!selectedVersion} onClick={() => selectedVersion && onRestoreVersion(selectedVersion.id)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.65)] px-3 py-2 text-[11px] font-medium text-[hsl(var(--foreground))] transition-colors hover:border-[hsl(var(--primary)/.35)] hover:bg-[hsl(var(--secondary))] disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-restore-version">
                    <ArchiveRestore className="size-3.5" />
                    Restaurer cette version
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {activeTab === 'quality' && (
          <section data-testid="section-quality">
            <SectionHeading eyebrow="Contrôle local" title="Rapport de qualité" detail="Des heuristiques rapides, calculées directement dans votre navigateur." testId="heading-quality" />
            <div className="relative mb-4 overflow-hidden rounded-xl border border-[hsl(var(--primary)/.22)] bg-[linear-gradient(135deg,hsl(var(--primary)/.11),hsl(var(--card)/.65))] p-4" data-testid="quality-score-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">Score global</p>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="font-mono text-[32px] font-bold tracking-[-.08em] text-[hsl(var(--foreground))]" data-testid="text-quality-score">{report.score}</span>
                    <span className="font-mono text-[11px] text-[hsl(var(--muted-foreground))]">/100</span>
                  </div>
                </div>
                <div className="grid size-[58px] place-items-center rounded-full border-4 border-[hsl(var(--primary)/.22)] border-t-[hsl(var(--primary))] text-[hsl(var(--primary))]">
                  <ShieldCheck className="size-5" strokeWidth={1.7} />
                </div>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[hsl(var(--background)/.65)]" aria-label={`Score de qualité ${report.score} sur 100`} data-testid="quality-score-bar">
                <div className="h-full rounded-full bg-[hsl(var(--primary))] transition-[width]" style={{ width: `${report.score}%` }} />
              </div>
              <div className="mt-3 flex gap-3 font-mono text-[9px]" data-testid="quality-summary">
                <span className="text-[hsl(var(--destructive))]">{criticalCount} critique{criticalCount > 1 ? 's' : ''}</span>
                <span className="text-[hsl(var(--chart-3))]">{attentionCount} attention{attentionCount > 1 ? 's' : ''}</span>
                <span className="text-[hsl(var(--primary))]">{report.findings.length - criticalCount - attentionCount} réussi{report.findings.length - criticalCount - attentionCount > 1 ? 's' : ''}</span>
              </div>
            </div>
            {!currentHtml ? (
              <EmptyState icon={ShieldCheck} title="Rapport en attente" detail="Le rapport apparaîtra dès qu’un HTML sera disponible." testId="empty-quality" />
            ) : (
              <>
                <div className="space-y-2" data-testid="quality-findings">
                  {report.findings.map((finding) => {
                    const Icon = finding.icon;
                    return (
                      <div key={finding.id} className="flex gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.3)] p-3" data-testid={`quality-finding-${finding.id}`}>
                        <div className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border ${severityClasses(finding.severity)}`}><Icon className="size-3.5" strokeWidth={1.8} /></div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <p className="text-[11px] font-medium text-[hsl(var(--foreground))]">{finding.title}</p>
                            <span className={`font-mono text-[8px] uppercase tracking-[.1em] ${severityClasses(finding.severity).split(' ').filter((className) => className.startsWith('text-')).join(' ')}`}>{finding.severity}</span>
                          </div>
                          <p className="mt-1 text-[10px] leading-4 text-[hsl(var(--muted-foreground))]">{finding.detail}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button type="button" onClick={runQualityScan} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.65)] px-3 py-2.5 text-[11px] font-medium text-[hsl(var(--foreground))] transition-colors hover:border-[hsl(var(--primary)/.35)] hover:bg-[hsl(var(--secondary))]" data-testid="button-rerun-quality">
                  <RotateCcw className="size-3.5" />
                  Relancer l’analyse
                </button>
              </>
            )}
          </section>
        )}

        {activeTab === 'assets' && (
          <section data-testid="section-assets">
            <SectionHeading eyebrow="Fichiers joints" title="Ressources du projet" detail="Les pièces jointes disponibles pour votre génération." testId="heading-assets" />
            {!attachments.length ? (
              <EmptyState icon={FileImage} title="Aucune ressource" detail="Ajoutez des fichiers depuis la zone de génération pour les retrouver ici." testId="empty-assets" />
            ) : (
              <div className="space-y-2" data-testid="attachment-list">
                {attachments.map((attachment, index) => {
                  const Icon = getAttachmentIcon(attachment.type, attachment.name);
                  const isImage = attachment.type.startsWith('image/') || /\.(png|jpe?g|gif|svg|webp)$/i.test(attachment.name);
                  const preview = isImage && (attachment.content.startsWith('data:') || attachment.objectPath);
                  return (
                    <div key={`${attachment.name}-${index}`} className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.3)]" data-testid={`asset-card-${index}`}>
                      {preview && <div className="h-24 overflow-hidden border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.4)]"><img src={attachment.objectPath || attachment.content} alt={`Aperçu de ${attachment.name}`} className="h-full w-full object-cover" data-testid={`img-asset-preview-${index}`} /></div>}
                      <div className="flex items-center gap-3 px-3 py-3">
                        <div className="grid size-8 shrink-0 place-items-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.55)] text-[hsl(var(--accent))]"><Icon className="size-4" strokeWidth={1.7} /></div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-medium text-[hsl(var(--foreground))]" data-testid={`text-asset-name-${index}`}>{attachment.name}</p>
                          <p className="mt-1 font-mono text-[9px] uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]" data-testid={`text-asset-meta-${index}`}>{readableType(attachment.type, attachment.name)} <span className="mx-1 text-[hsl(var(--border))]">·</span> {formatBytes(attachment.size)}</p>
                        </div>
                        <button type="button" onClick={() => openAttachment(attachment)} className="grid size-7 shrink-0 place-items-center rounded-md border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] transition-colors hover:border-[hsl(var(--primary)/.35)] hover:text-[hsl(var(--primary))]" aria-label={`Ouvrir ${attachment.name}`} data-testid={`button-open-asset-${index}`}>
                          <ExternalLink className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {activeTab === 'ai' && (
          <section data-testid="section-ai-actions">
            <SectionHeading eyebrow="Copilote de code" title="Actions ciblées" detail="Lancez une intention précise sur le HTML actuel. Le parent gère le traitement." testId="heading-ai-actions" />
            {!currentHtml ? (
              <EmptyState icon={Sparkles} title="Action indisponible" detail="Générez du code avant de demander une amélioration ciblée." testId="empty-ai-actions" />
            ) : (
              <div className="space-y-2" data-testid="ai-action-list">
                {aiActions.map(({ id, title, description, icon: Icon, tone }) => (
                  <button type="button" key={id} onClick={() => onAiAction(id)} className="group flex w-full items-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.28)] p-3 text-left transition-all hover:-translate-y-0.5 hover:border-[hsl(var(--primary)/.3)] hover:bg-[hsl(var(--secondary)/.48)]" data-testid={`button-ai-action-${id}`}>
                    <div className={`grid size-9 shrink-0 place-items-center rounded-lg border ${tone}`}><Icon className="size-4" strokeWidth={1.7} /></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-[hsl(var(--foreground))]">{title}</p>
                      <p className="mt-1 text-[10px] leading-4 text-[hsl(var(--muted-foreground))]">{description}</p>
                    </div>
                    <Play className="size-3.5 shrink-0 text-[hsl(var(--muted-foreground)/.6)] transition-transform group-hover:translate-x-0.5 group-hover:text-[hsl(var(--primary))]" />
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4 rounded-xl border border-[hsl(var(--accent)/.2)] bg-[hsl(var(--accent)/.06)] p-3" data-testid="ai-actions-note">
              <div className="flex gap-2">
                <LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-[hsl(var(--accent))]" />
               <p className="text-[10px] leading-4 text-[hsl(var(--muted-foreground))]">Les actions sont proposées à titre d’aide. Vérifiez toujours le résultat dans l’aperçu avant de conserver la modification.</p>
              </div>
            </div>
          </section>
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-between border-t border-[hsl(var(--border)/.8)] bg-[hsl(var(--background)/.28)] px-4 py-2.5" data-testid="toolbox-footer">
        <div className="flex items-center gap-1.5 text-[9px] text-[hsl(var(--muted-foreground))]" data-testid="status-toolbox-footer">
          <span className={`size-1.5 rounded-full ${currentHtml ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted-foreground)/.6)]'}`} />
          {currentHtml ? 'HTML disponible' : 'En attente de HTML'}
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[9px] text-[hsl(var(--muted-foreground))]" data-testid="text-toolbox-footnote">
          <Code2 className="size-3" />
          analyse locale
        </div>
      </footer>
    </aside>
  );
}