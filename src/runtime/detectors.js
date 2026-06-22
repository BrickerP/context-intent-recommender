import { SCENE_ACTIONS } from "./actions.js";
import {
  clamp,
  includesAny,
  looksLikeCode,
  normalizeText,
  safeUrl,
  textClass
} from "./textSignals.js";

const EDITOR_APPS = ["vscode", "cursor", "xcode", "jetbrains", "intellij"];
const CHAT_APPS = ["slack", "discord", "teams", "wechat", "telegram", "lark"];
const MAIL_APPS = ["mail", "gmail", "outlook"];
const EMAIL_THREAD_CUES = [
  "from:",
  "to:",
  "subject:",
  "reply",
  "forward",
  "compose",
  "hi ",
  "hello ",
  "best,",
  "regards,",
  "thanks,"
];
const ASSESSMENT_CUES = [
  "assessment",
  "questions",
  "expected time",
  "before you begin",
  "audio & video",
  "screenshare",
  "scored",
  "candidate/tests",
  "practice assessment",
  "take-home"
];

export function normalizeContext(rawContext = {}) {
  const selectedText = normalizeText(rawContext.selectedText);
  const visibleContentSummary = normalizeText(rawContext.visibleContentSummary);
  const pageTitle = normalizeText(rawContext.pageTitle ?? rawContext.title);

  return {
    app: normalizeText(rawContext.app || "unknown").toLowerCase(),
    pageTitle,
    url: normalizeText(rawContext.url),
    hasSelection: Boolean(rawContext.hasSelection || selectedText),
    selectedText,
    selectionTextClass:
      rawContext.selectionTextClass || textClass(selectedText),
    isEditing: Boolean(rawContext.isEditing),
    visibleContentSummary,
    semanticHints: rawContext.semanticHints || null,
    sourceMeta: rawContext.sourceMeta || {}
  };
}

export function validateContext(context) {
  const missingFields = [];
  if (!context.app || context.app === "unknown") missingFields.push("app");
  if (!context.url) missingFields.push("url");
  if (!context.pageTitle) missingFields.push("pageTitle");
  if (!context.hasSelection && !context.visibleContentSummary) {
    missingFields.push("contentSignal");
  }

  let signalScore = 0;
  if (context.app && context.app !== "unknown") signalScore += 0.12;
  if (context.url) signalScore += 0.16;
  if (context.pageTitle) signalScore += 0.14;
  if (context.hasSelection) signalScore += 0.24;
  if (context.isEditing) signalScore += 0.14;
  if (context.visibleContentSummary.length >= 60) signalScore += 0.2;

  return {
    valid: missingFields.length < 4,
    missingFields,
    signalScore: clamp(signalScore),
    hasStrongUserLocalSignal: context.hasSelection || context.isEditing
  };
}

export function detectScene(rawContext) {
  const context = normalizeContext(rawContext);
  const url = safeUrl(context.url);
  const host = url?.hostname.replace(/^www\./, "") || "";
  const path = url?.pathname || "";
  const haystack = `${context.app} ${context.pageTitle} ${host} ${path} ${context.visibleContentSummary}`;

  const semanticScene = sceneFromSemanticHint(context);
  if (semanticScene) return semanticScene;

  if (
    context.hasSelection &&
    (context.selectionTextClass === "code" ||
      looksLikeCode(context.selectedText) ||
      EDITOR_APPS.some((app) => context.app.includes(app)))
  ) {
    return {
      scene: "code_selection",
      confidence: context.selectedText.length >= 30 ? 0.93 : 0.82,
      evidence: [
        "Selected text exists",
        "Selected text or application looks code-related"
      ]
    };
  }

  if (host === "github.com" && /\/pull\/\d+/.test(path)) {
    return {
      scene: "github_pr",
      confidence: 0.96,
      evidence: ["URL matches a GitHub pull request path"]
    };
  }

  if (host === "youtube.com" && path === "/watch") {
    return {
      scene: "youtube_video",
      confidence: 0.94,
      evidence: ["URL matches a YouTube watch page"]
    };
  }

  if (host === "youtu.be") {
    return {
      scene: "youtube_video",
      confidence: 0.91,
      evidence: ["URL matches a YouTube short link"]
    };
  }

  if (host === "docs.google.com" && path.includes("/document/")) {
    return {
      scene: "document_editing",
      confidence: context.isEditing ? 0.92 : 0.84,
      evidence: [
        "URL matches a Google Docs document",
        context.isEditing ? "Current focus is editable" : "No editable focus detected"
      ]
    };
  }

  const assessmentScore = countCueHits(haystack, ASSESSMENT_CUES);
  if (
    path.includes("/candidate/tests/") ||
    host.includes("meritfirst") ||
    assessmentScore >= 3
  ) {
    return {
      scene: "assessment_page",
      confidence: path.includes("/candidate/tests/") || host.includes("meritfirst") ? 0.91 : 0.82,
      evidence: ["Page contains assessment or test-flow signals"]
    };
  }

  if (
    host === "mail.google.com" ||
    MAIL_APPS.includes(context.app) ||
    hasEmailEvidence({ host, path, haystack })
  ) {
    return {
      scene: "email_reading",
      confidence: host === "mail.google.com" ? 0.88 : 0.76,
      evidence: ["App, URL, or page text looks email-related"]
    };
  }

  if (
    CHAT_APPS.some((app) => context.app.includes(app)) ||
    includesAny(haystack, ["thread", "channel", "message", "chat", "聊天", "群聊"])
  ) {
    return {
      scene: "chat_thread",
      confidence: 0.82,
      evidence: ["App, title, or summary looks like a chat thread"]
    };
  }

  if (
    context.visibleContentSummary.length >= 240 &&
    includesAny(haystack, [
      "article",
      "report",
      "blog",
      "news",
      "newsletter",
      "简报",
      "报告",
      "资讯"
    ])
  ) {
    return {
      scene: "content_page",
      confidence: context.hasSelection ? 0.76 : 0.68,
      evidence: ["Page summary contains article or report signals"]
    };
  }

  if (host || context.pageTitle || context.visibleContentSummary) {
    return {
      scene: "generic_web_page",
      confidence: context.hasSelection ? 0.58 : 0.46,
      evidence: [
        "Web page metadata exists",
        "No high-confidence scene rule matched"
      ]
    };
  }

  return {
    scene: "unknown",
    confidence: 0.2,
    evidence: ["Too few context fields are available"]
  };
}

function sceneFromSemanticHint(context) {
  const hint = context.semanticHints;
  if (!hint?.scene || !SCENE_ACTIONS[hint.scene]) return null;

  const confidence = clamp(Number(hint.confidence ?? 0), 0, 0.88);
  if (confidence < 0.6) return null;

  return {
    scene: hint.scene,
    confidence,
    evidence: [
      ...(Array.isArray(hint.evidence) ? hint.evidence.slice(0, 3) : []),
      "Backend semantic hint supplied a controlled scene"
    ]
  };
}

function hasEmailEvidence({ host, path, haystack }) {
  const lowerHost = host.toLowerCase();
  const lowerPath = path.toLowerCase();
  const lowerText = haystack.toLowerCase();

  const webmailHost =
    lowerHost.includes("outlook.") ||
    lowerHost.includes("office.com") ||
    lowerHost.includes("proton.me") ||
    lowerHost.includes("mail.") ||
    lowerHost.endsWith(".mail");
  const routeCue =
    lowerPath.includes("inbox") ||
    lowerPath.includes("compose") ||
    lowerPath.includes("mail");
  const explicitMailCue = includesAny(lowerText, ["email", "邮件", "收件箱"]);
  const threadCueCount = countCueHits(lowerText, EMAIL_THREAD_CUES);

  return (
    webmailHost ||
    (explicitMailCue && threadCueCount >= 1) ||
    (routeCue && threadCueCount >= 2)
  );
}

function countCueHits(text, cues) {
  const lower = normalizeText(text).toLowerCase();
  return cues.reduce(
    (count, cue) => count + (lower.includes(cue.toLowerCase()) ? 1 : 0),
    0
  );
}
