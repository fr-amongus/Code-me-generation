export type SecuritySeverity = "critical" | "high" | "medium" | "low" | "info";

export type SecurityFinding = {
  id: string;
  severity: SecuritySeverity;
  title: string;
  message: string;
  line?: number;
  evidence?: string;
  remediation: string;
};

export function buildSecurityReport(findings: SecurityFinding[]) {
  const weight: Record<SecuritySeverity, number> = { critical: 30, high: 20, medium: 10, low: 5, info: 0 };
  const score = Math.max(0, 100 - findings.reduce((total, finding) => total + weight[finding.severity], 0));
  const summary = findings.reduce<Record<string, number>>((counts, finding) => {
    counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
    return counts;
  }, {});
  return { scannedAt: new Date().toISOString(), score, findings, summary };
}

function lineAt(source: string, index: number) {
  return source.slice(0, index).split("\n").length;
}

export function scanProjectHtml(html: string) {
  const findings: SecurityFinding[] = [];
  const add = (finding: Omit<SecurityFinding, "line">, index: number) => {
    findings.push({ ...finding, line: lineAt(html, index), evidence: html.slice(Math.max(0, index - 35), index + 110).replace(/\s+/g, " ").trim() });
  };

  const patterns: Array<[RegExp, Omit<SecurityFinding, "line" | "evidence">]> = [
    [/\beval\s*\(|new\s+Function\s*\(/i, { id: "dynamic-code", severity: "critical", title: "Code dynamique dangereux", message: "eval() ou Function() peut exécuter du contenu contrôlé par un utilisateur.", remediation: "Supprime le code dynamique et utilise des fonctions explicites avec des entrées validées." }],
    [/\b(?:innerHTML|outerHTML)\s*=/i, { id: "unsafe-html", severity: "high", title: "Injection HTML potentielle", message: "Une affectation directe de HTML peut introduire du script si la valeur n'est pas nettoyée.", remediation: "Utilise textContent ou nettoie la valeur avec une liste blanche avant insertion." }],
    [/\bdocument\.write\s*\(/i, { id: "document-write", severity: "high", title: "document.write détecté", message: "document.write peut écraser la page et créer une injection dans des contextes non maîtrisés.", remediation: "Remplace-le par une création DOM explicite et des valeurs échappées." }],
    [/postMessage\s*\([^)]*,\s*["']\*["']\s*\)/i, { id: "wildcard-postmessage", severity: "medium", title: "postMessage trop permissif", message: "Le message est envoyé à toutes les origines.", remediation: "Remplace * par l'origine exacte attendue et vérifie event.origin à la réception." }],
    [/<iframe\b(?![^>]*\bsandbox\b)[^>]*>/i, { id: "iframe-without-sandbox", severity: "medium", title: "Iframe sans sandbox", message: "Une iframe externe sans sandbox dispose de permissions trop larges.", remediation: "Ajoute sandbox avec uniquement les permissions nécessaires." }],
    [/<a\b[^>]*target=["']_blank["'](?![^>]*rel=["'][^"']*(?:noopener|noreferrer))/i, { id: "target-blank", severity: "low", title: "Lien target=_blank sans protection", message: "La page ouverte peut conserver une référence vers la page d'origine.", remediation: "Ajoute rel=\"noopener noreferrer\" à ce lien." }],
    [/https?:\/\//i, { id: "insecure-or-external-resource", severity: "low", title: "Ressource externe détectée", message: "Le projet référence une URL externe ; vérifie qu'elle utilise HTTPS et qu'elle est nécessaire.", remediation: "Privilégie HTTPS et évite les dépendances externes non indispensables." }],
  ];

  for (const [pattern, finding] of patterns) {
    const match = pattern.exec(html);
    if (match?.index !== undefined) add(finding, match.index);
  }

  if (!/<meta[^>]+charset=/i.test(html)) {
    findings.push({ id: "missing-charset", severity: "info", title: "Encodage non déclaré", message: "La page ne déclare pas explicitement son encodage.", remediation: "Ajoute <meta charset=\"utf-8\"> dans <head>." });
  }
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) {
    findings.push({ id: "missing-viewport", severity: "info", title: "Viewport absent", message: "La page ne déclare pas de viewport responsive.", remediation: "Ajoute la meta viewport pour un rendu mobile correct." });
  }

  return buildSecurityReport(findings);
}
