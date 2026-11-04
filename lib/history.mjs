import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { normalizeWhitespace } from "./shared.mjs";

const execFileAsync = promisify(execFile);
const termHistoryCacheVersion = 3;

async function readJsonIfExists(targetPath) {
  try {
    return JSON.parse(await fs.readFile(targetPath, "utf8"));
  } catch {
    return null;
  }
}

async function getGitHead(repoDir) {
  const { stdout } = await execFileAsync("git", ["-C", repoDir, "rev-parse", "HEAD"], {
    maxBuffer: 1024 * 1024
  });
  return stdout.trim();
}

function escapeRegExp(value = "") {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractIssueRefs(subject = "") {
  return [...new Set((subject.match(/(?:Issue\s+#\d+|#\d+)/g) || []).map((value) => value.replace(/^Issue\s+/, "")))];
}

function parseOboQuotedValue(line = "") {
  const match = line.match(/"((?:[^"\\]|\\.)*)"/);
  return match ? match[1] : "";
}

function parseDefXrefs(line = "") {
  const match = line.match(/\[([^\]]*)\]/);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((item) => normalizeWhitespace(item))
    .filter(Boolean);
}

function parseOboTermState(fileContent, termId) {
  const blocks = fileContent.split(/\n\[Term\]\n/).slice(1);
  let block = "";
  for (const candidate of blocks) {
    if (new RegExp(`(?:^|\\n)id: ${escapeRegExp(termId)}(?:\\n|$)`, "m").test(candidate)) {
      block = candidate;
      break;
    }
  }
  if (!block) return null;

  const lines = block.split(/\r?\n/);
  const state = {
    id: termId,
    label: "",
    definition: "",
    definitionXrefs: [],
    comments: [],
    parents: [],
    synonyms: [],
    subsets: [],
    xrefs: [],
    altIds: [],
    isObsolete: false,
    replacedBy: []
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("name: ")) {
      state.label = normalizeWhitespace(line.slice(6));
    } else if (line.startsWith("def: ")) {
      state.definition = parseOboQuotedValue(line);
      state.definitionXrefs = parseDefXrefs(line);
    } else if (line.startsWith("comment: ")) {
      state.comments.push(normalizeWhitespace(line.slice(9)));
    } else if (line.startsWith("is_a: ")) {
      state.parents.push((line.match(/^is_a:\s+(SO:\d+)/) || [])[1] || normalizeWhitespace(line.slice(6)).split(/\s+/)[0]);
    } else if (line.startsWith("synonym: ")) {
      const value = parseOboQuotedValue(line);
      const scope = (line.match(/"\s+([A-Z_]+)\s+\[/) || [])[1] || "RELATED";
      if (value) {
        state.synonyms.push({ scope: scope.toLowerCase(), value });
      }
    } else if (line.startsWith("subset: ")) {
      state.subsets.push(normalizeWhitespace(line.slice(8)));
    } else if (line.startsWith("xref: ")) {
      state.xrefs.push(normalizeWhitespace(line.slice(6).replace(/\s+".*$/, "")));
    } else if (line.startsWith("alt_id: ")) {
      state.altIds.push(normalizeWhitespace(line.slice(8)));
    } else if (line.startsWith("is_obsolete: ")) {
      state.isObsolete = /true/i.test(line.slice(13));
    } else if (line.startsWith("replaced_by: ")) {
      state.replacedBy.push(normalizeWhitespace(line.slice(13)).split(/\s+/)[0]);
    }
  }

  state.parents = [...new Set(state.parents.filter(Boolean))].sort();
  state.synonyms = [...new Map(state.synonyms.map((entry) => [`${entry.scope}|${entry.value}`, entry])).values()].sort((a, b) =>
    `${a.scope}|${a.value}`.localeCompare(`${b.scope}|${b.value}`)
  );
  state.subsets = [...new Set(state.subsets.filter(Boolean))].sort();
  state.xrefs = [...new Set(state.xrefs.filter(Boolean))].sort();
  state.altIds = [...new Set(state.altIds.filter(Boolean))].sort();
  state.comments = [...new Set(state.comments.filter(Boolean))];
  state.replacedBy = [...new Set(state.replacedBy.filter(Boolean))].sort();

  return state;
}

function diffSet(before, after) {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: after.filter((value) => !beforeSet.has(value)),
    removed: before.filter((value) => !afterSet.has(value))
  };
}

function createEvent({ type, date, commit, subject, summary, details = [] }) {
  return {
    type,
    date,
    commit,
    shortHash: commit.slice(0, 7),
    subject,
    summary,
    details,
    issueRefs: extractIssueRefs(subject)
  };
}

function buildSemanticEvents(previousState, currentState, commitMeta) {
  const events = [];

  if (!previousState && currentState) {
    const details = [];
    if (currentState.label) details.push(`Initial label: ${currentState.label}`);
    if (currentState.definition) details.push("Initial definition captured.");
    if (currentState.parents.length) details.push(`Initial parent${currentState.parents.length === 1 ? "" : "s"}: ${currentState.parents.join(", ")}`);
    events.push(
      createEvent({
        type: "created",
        date: commitMeta.date,
        commit: commitMeta.hash,
        subject: commitMeta.subject,
        summary: "Term introduced into the editable ontology history",
        details
      })
    );
    return events;
  }

  if (!previousState || !currentState) {
    return events;
  }

  if (previousState.label !== currentState.label) {
    events.push(
      createEvent({
        type: "label_changed",
        date: commitMeta.date,
        commit: commitMeta.hash,
        subject: commitMeta.subject,
        summary: `Label changed from ${previousState.label || "none"} to ${currentState.label || "none"}`,
        details: previousState.label && currentState.label ? [`Before: ${previousState.label}`, `After: ${currentState.label}`] : []
      })
    );
  }

  if (previousState.definition !== currentState.definition) {
    events.push(
      createEvent({
        type: "definition_changed",
        date: commitMeta.date,
        commit: commitMeta.hash,
        subject: commitMeta.subject,
        summary: "Definition updated",
        details: [
          previousState.definition ? `Before: ${previousState.definition}` : "Before: no definition recorded",
          currentState.definition ? `After: ${currentState.definition}` : "After: definition removed"
        ]
      })
    );
  }

  const parentDiff = diffSet(previousState.parents, currentState.parents);
  for (const parent of parentDiff.added) {
    events.push(createEvent({ type: "parent_added", date: commitMeta.date, commit: commitMeta.hash, subject: commitMeta.subject, summary: `Parent added: ${parent}` }));
  }
  for (const parent of parentDiff.removed) {
    events.push(createEvent({ type: "parent_removed", date: commitMeta.date, commit: commitMeta.hash, subject: commitMeta.subject, summary: `Parent removed: ${parent}` }));
  }

  const synonymKey = (entry) => `${entry.scope}|${entry.value}`;
  const synonymDiff = diffSet(previousState.synonyms.map(synonymKey), currentState.synonyms.map(synonymKey));
  for (const token of synonymDiff.added) {
    const [scope, value] = token.split("|");
    events.push(createEvent({ type: "synonym_added", date: commitMeta.date, commit: commitMeta.hash, subject: commitMeta.subject, summary: `Synonym added: ${value}`, details: [`Scope: ${scope}`] }));
  }
  for (const token of synonymDiff.removed) {
    const [scope, value] = token.split("|");
    events.push(createEvent({ type: "synonym_removed", date: commitMeta.date, commit: commitMeta.hash, subject: commitMeta.subject, summary: `Synonym removed: ${value}`, details: [`Scope: ${scope}`] }));
  }

  const subsetDiff = diffSet(previousState.subsets, currentState.subsets);
  for (const subset of subsetDiff.added) {
    events.push(createEvent({ type: "subset_added", date: commitMeta.date, commit: commitMeta.hash, subject: commitMeta.subject, summary: `Subset added: ${subset}` }));
  }
  for (const subset of subsetDiff.removed) {
    events.push(createEvent({ type: "subset_removed", date: commitMeta.date, commit: commitMeta.hash, subject: commitMeta.subject, summary: `Subset removed: ${subset}` }));
  }

  const xrefDiff = diffSet(previousState.xrefs, currentState.xrefs);
  for (const xref of xrefDiff.added) {
    events.push(createEvent({ type: "xref_added", date: commitMeta.date, commit: commitMeta.hash, subject: commitMeta.subject, summary: `Cross reference added: ${xref}` }));
  }
  for (const xref of xrefDiff.removed) {
    events.push(createEvent({ type: "xref_removed", date: commitMeta.date, commit: commitMeta.hash, subject: commitMeta.subject, summary: `Cross reference removed: ${xref}` }));
  }

  const altIdDiff = diffSet(previousState.altIds, currentState.altIds);
  for (const altId of altIdDiff.added) {
    events.push(createEvent({ type: "alt_id_added", date: commitMeta.date, commit: commitMeta.hash, subject: commitMeta.subject, summary: `Alternate ID added: ${altId}` }));
  }
  for (const altId of altIdDiff.removed) {
    events.push(createEvent({ type: "alt_id_removed", date: commitMeta.date, commit: commitMeta.hash, subject: commitMeta.subject, summary: `Alternate ID removed: ${altId}` }));
  }

  if (!previousState.isObsolete && currentState.isObsolete) {
    events.push(createEvent({ type: "obsoleted", date: commitMeta.date, commit: commitMeta.hash, subject: commitMeta.subject, summary: "Term marked obsolete" }));
  } else if (previousState.isObsolete && !currentState.isObsolete) {
    events.push(createEvent({ type: "restored", date: commitMeta.date, commit: commitMeta.hash, subject: commitMeta.subject, summary: "Term restored from obsolete status" }));
  }

  const replacedDiff = diffSet(previousState.replacedBy, currentState.replacedBy);
  for (const replacement of replacedDiff.added) {
    events.push(createEvent({ type: "replacement_added", date: commitMeta.date, commit: commitMeta.hash, subject: commitMeta.subject, summary: `Replacement guidance added: ${replacement}` }));
  }
  for (const replacement of replacedDiff.removed) {
    events.push(createEvent({ type: "replacement_removed", date: commitMeta.date, commit: commitMeta.hash, subject: commitMeta.subject, summary: `Replacement guidance removed: ${replacement}` }));
  }

  if (!events.length) {
    events.push(createEvent({ type: "edited", date: commitMeta.date, commit: commitMeta.hash, subject: commitMeta.subject, summary: "Term stanza touched in repository history" }));
  }

  return events;
}

async function getOboFileAtCommit(commitHash, fileCache, repoDir) {
  if (fileCache.has(commitHash)) {
    return fileCache.get(commitHash);
  }

  const candidates = ["so-edit.obo", "so.obo"];
  for (const candidate of candidates) {
    try {
      const { stdout } = await execFileAsync("git", ["-C", repoDir, "show", `${commitHash}:${candidate}`], {
        maxBuffer: 1024 * 1024 * 32
      });
      fileCache.set(commitHash, stdout);
      return stdout;
    } catch {
      continue;
    }
  }

  fileCache.set(commitHash, null);
  return null;
}

async function collectTermHistory({ termIds, repoDir, cacheDir }) {
  await fs.mkdir(cacheDir, { recursive: true });
  const cachePath = path.join(cacheDir, "term-history.json");
  const repoHead = await getGitHead(repoDir);
  const cached = await readJsonIfExists(cachePath);
  if (cached?.repoHead === repoHead && cached?.cacheVersion === termHistoryCacheVersion && cached?.history) {
    return cached.history;
  }

  const history = {};
  const concurrency = Math.max(4, Math.min(12, os.cpus().length || 4));
  let index = 0;
  const fileCache = new Map();

  async function worker() {
    while (index < termIds.length) {
      const currentIndex = index++;
      const termId = termIds[currentIndex];
      const range = `/^id: ${termId}$/,/^$/`;
      try {
        const { stdout } = await execFileAsync(
          "git",
          ["-C", repoDir, "log", "-L", `${range}:so-edit.obo`, "--no-patch", "--format=%H%x09%ad%x09%s", "--date=short"],
          { maxBuffer: 1024 * 1024 * 4 }
        );

        const entries = stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [hash, date, ...subjectParts] = line.split("\t");
            const subject = subjectParts.join("\t").trim();
            return {
              hash,
              shortHash: hash.slice(0, 7),
              date,
              subject,
              issueRefs: extractIssueRefs(subject)
            };
          });

        const orderedEntries = [...entries].reverse();
        let previousState = null;
        const semanticEvents = [];

        for (const entry of orderedEntries) {
          const fileContent = await getOboFileAtCommit(entry.hash, fileCache, repoDir);
          const currentState = fileContent ? parseOboTermState(fileContent, termId) : null;
          semanticEvents.push(...buildSemanticEvents(previousState, currentState, entry));
          previousState = currentState;
        }

        history[termId] = {
          firstSeen: entries.length ? entries[entries.length - 1] : null,
          mostRecent: entries.length ? entries[0] : null,
          entries: entries.slice(0, 6),
          semanticEvents: semanticEvents.reverse().slice(0, 24)
        };
      } catch {
        history[termId] = {
          firstSeen: null,
          mostRecent: null,
          entries: [],
          semanticEvents: []
        };
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  await fs.writeFile(cachePath, JSON.stringify({ cacheVersion: termHistoryCacheVersion, repoHead, history }));
  return history;
}

export { collectTermHistory, termHistoryCacheVersion };
