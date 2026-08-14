import { writeFile } from "node:fs/promises";

const USERNAME = "Zeno-cc";
const API_ROOT = "https://api.github.com";
const OUTPUT = new URL("../assets/profile-dashboard.svg", import.meta.url);
const FONT = "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const API_TOKEN = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;

const COLORS = {
  ink: "#f5f8fb",
  muted: "#9fb1c4",
  faint: "#71849a",
  border: "#8ea5bc",
  teal: "#31c8c2",
  tealSoft: "#7de0d5",
  amber: "#f3b55b",
  blue: "#6ea8fe",
  panel: "#07101c",
  backgroundStart: "#0a1220",
  backgroundEnd: "#17283a",
};

const LANGUAGE_COLORS = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  Swift: "#F05138",
  Vue: "#41B883",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Java: "#b07219",
  Shell: "#89e051",
  Jupyter: "#DA5B0B",
};

const EVENT_LABELS = new Map([
  ["PushEvent", "Pushes"],
  ["PullRequestEvent", "Pull requests"],
  ["IssuesEvent", "Issues"],
  ["WatchEvent", "Stars / watches"],
  ["CreateEvent", "Created"],
  ["ReleaseEvent", "Releases"],
  ["ForkEvent", "Forks"],
]);

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function shorten(value, maxLength) {
  const text = String(value ?? "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDateInShanghai() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function daysSince(date) {
  const timestamp = Date.parse(date);
  if (!Number.isFinite(timestamp)) return "—";
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

async function getJson(path) {
  const response = await fetch(`${API_ROOT}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Zeno-cc-profile-dashboard",
      ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} for ${path}`);
  }
  return response.json();
}

function svgText(parts, value, x, y, options = {}) {
  const {
    fill = COLORS.ink,
    size = 16,
    weight = 400,
    family = FONT,
    anchor = "start",
    letterSpacing = 0,
  } = options;
  parts.push(
    `<text x="${x}" y="${y}" fill="${fill}" font-family="${family}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${letterSpacing}">${escapeXml(value)}</text>`,
  );
}

function svgRect(parts, x, y, width, height, options = {}) {
  const {
    fill = "none",
    stroke = "none",
    strokeOpacity = 1,
    radius = 0,
  } = options;
  parts.push(
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-opacity="${strokeOpacity}"/>`,
  );
}

function svgLine(parts, x1, y1, x2, y2, options = {}) {
  const { stroke = COLORS.border, opacity = 1, width = 1 } = options;
  parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="${width}"/>`);
}

function panel(parts, x, y, width, height, title, subtitle) {
  svgRect(parts, x, y, width, height, {
    fill: COLORS.panel,
    stroke: COLORS.border,
    strokeOpacity: 0.28,
    radius: 16,
  });
  svgText(parts, title, x + 28, y + 38, {
    fill: COLORS.tealSoft,
    size: 14,
    weight: 700,
    family: MONO,
    letterSpacing: 1.8,
  });
  svgText(parts, subtitle, x + 28, y + 62, {
    fill: COLORS.muted,
    size: 12,
    family: MONO,
  });
}

function colorForLanguage(name, index) {
  return LANGUAGE_COLORS[name] ?? [COLORS.teal, COLORS.amber, COLORS.blue, "#b98cff", "#f17c9a"][index % 5];
}

function normalizeLanguages(repositories, languageMaps) {
  const totals = new Map();
  for (const languages of languageMaps) {
    for (const [name, bytes] of Object.entries(languages)) {
      totals.set(name, (totals.get(name) ?? 0) + bytes);
    }
  }
  if (totals.size > 0) {
    const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const top = rows.slice(0, 5);
    const rest = rows.slice(5).reduce((sum, [, bytes]) => sum + bytes, 0);
    if (rest > 0) top.push(["Other", rest]);
    const total = top.reduce((sum, [, bytes]) => sum + bytes, 0);
    return {
      mode: "language bytes",
      rows: top.map(([name, bytes]) => ({ name, value: bytes, share: bytes / total })),
    };
  }

  const primary = new Map();
  for (const repository of repositories) {
    if (repository.language) primary.set(repository.language, (primary.get(repository.language) ?? 0) + 1);
  }
  const rows = [...primary.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const total = rows.reduce((sum, [, count]) => sum + count, 0) || 1;
  return {
    mode: "detected primary language",
    rows: rows.map(([name, value]) => ({ name, value, share: value / total })),
  };
}

function renderDashboard({ user, repositories, languages, events, generatedDate }) {
  const owned = repositories.filter((repository) => !repository.fork);
  const forks = repositories.filter((repository) => repository.fork);
  const publicStars = repositories.reduce((sum, repository) => sum + repository.stargazers_count, 0);
  const topStars = owned
    .filter((repository) => repository.name !== USERNAME)
    .sort((a, b) => b.stargazers_count - a.stargazers_count || Date.parse(b.pushed_at) - Date.parse(a.pushed_at))
    .slice(0, 4);
  const recentProjects = owned
    .filter((repository) => repository.name !== USERNAME && !["-", "----"].includes(repository.name))
    .sort((a, b) => Date.parse(b.pushed_at) - Date.parse(a.pushed_at))
    .slice(0, 4);
  const activity = new Map();
  for (const event of events) {
    const label = EVENT_LABELS.get(event.type) ?? "Other";
    activity.set(label, (activity.get(label) ?? 0) + 1);
  }
  const activityRows = [...activity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const languageRows = languages.rows;
  const parts = [];

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 820" role="img" aria-labelledby="title desc">`);
  parts.push(`<title id="title">Zeno-cc public GitHub snapshot</title>`);
  parts.push(`<desc id="desc">A daily dashboard of public repositories, language footprint, repository mix, public activity, and recently updated projects.</desc>`);
  parts.push(`<defs><linearGradient id="background" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${COLORS.backgroundStart}"/><stop offset="1" stop-color="${COLORS.backgroundEnd}"/></linearGradient><pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="${COLORS.border}" stroke-opacity="0.1"/></pattern><linearGradient id="accent" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${COLORS.teal}"/><stop offset="1" stop-color="${COLORS.amber}"/></linearGradient></defs>`);
  svgRect(parts, 0, 0, 1200, 820, { fill: "url(#background)", radius: 22 });
  svgRect(parts, 1, 1, 1198, 818, { fill: "url(#grid)", stroke: COLORS.border, strokeOpacity: 0.28, radius: 21 });

  svgText(parts, "PUBLIC GITHUB SNAPSHOT", 56, 54, { fill: COLORS.tealSoft, size: 17, weight: 700, family: MONO, letterSpacing: 3 });
  svgText(parts, USERNAME, 1144, 54, { fill: COLORS.muted, size: 14, family: MONO, anchor: "end", letterSpacing: 1.5 });
  svgText(parts, `refreshed ${generatedDate} · public API`, 1144, 76, { fill: COLORS.faint, size: 11, family: MONO, anchor: "end" });

  const cards = [
    ["PUBLIC REPOS", repositories.length, "visible repositories"],
    ["OWNED PROJECTS", owned.length, "non-fork repositories"],
    ["TOTAL STARS", publicStars, "across public repos"],
    ["FOLLOWERS", user.followers, "public profile"],
  ];
  cards.forEach(([label, value, note], index) => {
    const x = 56 + index * 276;
    svgRect(parts, x, 94, 260, 94, { fill: COLORS.panel, stroke: COLORS.border, strokeOpacity: 0.28, radius: 14 });
    svgText(parts, label, x + 20, 122, { fill: COLORS.muted, size: 11, weight: 700, family: MONO, letterSpacing: 1.4 });
    svgText(parts, formatNumber(value), x + 20, 160, { fill: COLORS.ink, size: 30, weight: 700 });
    svgText(parts, note, x + 240, 160, { fill: COLORS.faint, size: 10, family: MONO, anchor: "end" });
  });

  panel(parts, 56, 214, 532, 250, "LANGUAGE FOOTPRINT", `owned public repositories · ${languages.mode}`);
  if (languageRows.length === 0) {
    svgText(parts, "No language data returned", 84, 310, { fill: COLORS.muted, size: 14 });
  } else {
    languageRows.forEach((row, index) => {
      const y = 292 + index * 29;
      const color = colorForLanguage(row.name, index);
      svgText(parts, shorten(row.name, 17), 84, y + 5, { fill: COLORS.ink, size: 13, weight: 600 });
      svgRect(parts, 222, y - 8, 268, 14, { fill: "#1b2a3b", radius: 7 });
      svgRect(parts, 222, y - 8, Math.max(8, 268 * row.share), 14, { fill: color, radius: 7 });
      svgText(parts, `${Math.round(row.share * 100)}%`, 520, y + 5, { fill: COLORS.muted, size: 12, family: MONO, anchor: "end" });
    });
  }

  panel(parts, 612, 214, 532, 250, "REPOSITORY MIX", "public repositories only · owned vs forked");
  const totalRepositories = Math.max(repositories.length, 1);
  const ownedWidth = 468 * (owned.length / totalRepositories);
  svgRect(parts, 644, 286, 468, 22, { fill: "#1b2a3b", radius: 11 });
  svgRect(parts, 644, 286, Math.max(0, ownedWidth), 22, { fill: "url(#accent)", radius: 11 });
  svgText(parts, `OWNED ${owned.length}`, 644, 337, { fill: COLORS.tealSoft, size: 12, weight: 700, family: MONO });
  svgText(parts, `FORKS ${forks.length}`, 1112, 337, { fill: COLORS.muted, size: 12, weight: 700, family: MONO, anchor: "end" });
  svgText(parts, "TOP STARS", 644, 374, { fill: COLORS.faint, size: 11, weight: 700, family: MONO, letterSpacing: 1.5 });
  const maxStars = Math.max(1, ...topStars.map((repository) => repository.stargazers_count));
  topStars.slice(0, 3).forEach((repository, index) => {
    const y = 398 + index * 21;
    svgText(parts, shorten(repository.name, 18), 644, y + 4, { fill: COLORS.ink, size: 12 });
    svgRect(parts, 820, y - 7, 220, 10, { fill: "#1b2a3b", radius: 5 });
    svgRect(parts, 820, y - 7, Math.max(8, 220 * (repository.stargazers_count / maxStars)), 10, { fill: index === 0 ? COLORS.amber : COLORS.teal, radius: 5 });
    svgText(parts, `${repository.stargazers_count}★`, 1112, y + 4, { fill: COLORS.muted, size: 11, family: MONO, anchor: "end" });
  });

  panel(parts, 56, 490, 532, 250, "PUBLIC ACTIVITY", `${events.length ? "latest public events" : "no recent public events"} · GitHub window`);
  if (activityRows.length === 0) {
    svgText(parts, "No public events returned", 84, 590, { fill: COLORS.muted, size: 14 });
  } else {
    const maxActivity = Math.max(1, ...activityRows.map(([, count]) => count));
    activityRows.forEach(([label, count], index) => {
      const y = 566 + index * 29;
      svgText(parts, shorten(label, 18), 84, y + 4, { fill: COLORS.ink, size: 12 });
      svgRect(parts, 222, y - 7, 268, 12, { fill: "#1b2a3b", radius: 6 });
      svgRect(parts, 222, y - 7, Math.max(8, 268 * (count / maxActivity)), 12, { fill: index === 0 ? COLORS.teal : COLORS.blue, radius: 6 });
      svgText(parts, formatNumber(count), 520, y + 4, { fill: COLORS.muted, size: 11, family: MONO, anchor: "end" });
    });
  }

  panel(parts, 612, 490, 532, 250, "PROJECT PULSE", "recently updated owned repositories");
  if (recentProjects.length === 0) {
    svgText(parts, "No public projects returned", 644, 590, { fill: COLORS.muted, size: 14 });
  } else {
    recentProjects.forEach((repository, index) => {
      const y = 580 + index * 36;
      if (index > 0) svgLine(parts, 644, y - 20, 1112, y - 20, { stroke: COLORS.border, opacity: 0.14 });
      svgText(parts, shorten(repository.name, 23), 644, y, { fill: COLORS.ink, size: 13, weight: 600 });
      svgText(parts, shorten(repository.language ?? "mixed / undocumented", 24), 644, y + 18, { fill: COLORS.faint, size: 10, family: MONO });
      svgText(parts, `${daysSince(repository.pushed_at)} · ${repository.stargazers_count}★`, 1112, y + 9, { fill: COLORS.muted, size: 11, family: MONO, anchor: "end" });
    });
  }

  svgText(parts, "PUBLIC ONLY · SOURCE: api.github.com · generated by scripts/build-profile-dashboard.mjs", 56, 784, { fill: COLORS.faint, size: 11, family: MONO });
  svgText(parts, generatedDate, 1144, 784, { fill: COLORS.faint, size: 11, family: MONO, anchor: "end" });
  parts.push("</svg>");
  return parts.join("\n");
}

const generatedDate = formatDateInShanghai();
const [user, repositories, events] = await Promise.all([
  getJson(`/users/${USERNAME}`),
  getJson(`/users/${USERNAME}/repos?per_page=100&sort=updated`),
  getJson(`/users/${USERNAME}/events/public?per_page=100`),
]);
const publicRepositories = repositories.filter((repository) => !repository.private);
const ownedRepositories = publicRepositories.filter((repository) => !repository.fork);
const languageMaps = await Promise.all(
  ownedRepositories.map((repository) => getJson(`/repos/${repository.full_name}/languages`)),
);
const languageData = normalizeLanguages(ownedRepositories, languageMaps);
const svg = renderDashboard({
  user,
  repositories: publicRepositories,
  languages: languageData,
  events,
  generatedDate,
});
await writeFile(OUTPUT, svg, "utf8");
console.log(`Updated ${OUTPUT.pathname} from ${publicRepositories.length} public repositories and ${events.length} public events.`);