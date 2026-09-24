type BrowserDependency = {
  id: string;
  globals: RegExp[];
  script: string;
  matchesExistingScript: RegExp;
};

const BROWSER_DEPENDENCIES: BrowserDependency[] = [
  {
    id: "three",
    globals: [/\bTHREE\s*\./i, /\bnew\s+THREE\b/i, /\bOrbitControls\b/i],
    script: "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js",
    matchesExistingScript: /three(?:\.min)?\.js/i,
  },
  {
    id: "three-orbit-controls",
    globals: [/\bOrbitControls\b/i],
    script: "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/examples/js/controls/OrbitControls.js",
    matchesExistingScript: /OrbitControls\.js/i,
  },
  {
    id: "chartjs",
    globals: [/\bnew\s+Chart\s*\(/i, /\bChart\s*\(/i],
    script: "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js",
    matchesExistingScript: /chart(?:\.umd)?(?:\.min)?\.js/i,
  },
  {
    id: "p5",
    globals: [/\bcreateCanvas\s*\(/i, /\bnew\s+p5\s*\(/i],
    script: "https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.11.1/p5.min.js",
    matchesExistingScript: /p5(?:\.min)?\.js/i,
  },
  {
    id: "matter",
    globals: [/\bMatter\./i],
    script: "https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.20.0/matter.min.js",
    matchesExistingScript: /matter(?:\.min)?\.js/i,
  },
];

function insertScriptsInHead(html: string, scripts: string[]) {
  if (!scripts.length) return html;
  const tags = scripts.map((src) => `<script src="${src}" crossorigin="anonymous"></script>`).join("");
  const head = html.match(/<head\b[^>]*>/i);
  if (head) return html.replace(head[0], `${head[0]}${tags}`);

  const doctypeEnd = html.match(/<!doctype[^>]*>/i);
  const insertion = `<head>${tags}</head>`;
  return doctypeEnd
    ? html.replace(doctypeEnd[0], `${doctypeEnd[0]}${insertion}`)
    : `${insertion}${html}`;
}

export function ensureBrowserDependencies(html: string) {
  if (!html.trim()) return html;
  const scriptsToAdd = BROWSER_DEPENDENCIES
    .filter((dependency) => dependency.globals.some((pattern) => pattern.test(html)))
    .filter((dependency) => !dependency.matchesExistingScript.test(html))
    .map((dependency) => dependency.script);

  return insertScriptsInHead(html, scriptsToAdd);
}