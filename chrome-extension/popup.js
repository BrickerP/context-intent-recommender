const DEFAULT_RUNTIME_URL = "http://127.0.0.1:8787/context";

const refreshButton = document.querySelector("#refresh");
const runtimeInput = document.querySelector("#runtime-url");
const statusNode = document.querySelector("#status");
const actionsNode = document.querySelector("#actions");
const contextNode = document.querySelector("#context");
const resultNode = document.querySelector("#result");

runtimeInput.value =
  localStorage.getItem("context-runtime-url") || DEFAULT_RUNTIME_URL;

refreshButton.addEventListener("click", () => {
  void collectAndRecommend();
});

runtimeInput.addEventListener("change", () => {
  localStorage.setItem("context-runtime-url", runtimeInput.value.trim());
});

void collectAndRecommend();

async function collectAndRecommend() {
  setStatus("Collecting current page context");
  actionsNode.replaceChildren();
  contextNode.textContent = "";
  resultNode.textContent = "";

  try {
    const context = await collectActiveTabContext();
    contextNode.textContent = JSON.stringify(context, null, 2);

    setStatus("Requesting local runtime");
    const result = await requestRecommendation(runtimeInput.value.trim(), context);
    resultNode.textContent = JSON.stringify(result, null, 2);
    renderActions(result);
    setStatus(
      result.fallback
        ? "Context is weak; ask the user what they need"
        : "Recommended actions generated"
    );
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function collectActiveTabContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("No active tab found");
  }

  const [injection] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: collectContextFromPage
  });

  const pageContext = injection?.result;
  if (!pageContext) {
    throw new Error("The current page did not return context");
  }

  return {
    app: "chrome",
    url: pageContext.url || tab.url || "",
    pageTitle: pageContext.pageTitle || tab.title || "",
    hasSelection: Boolean(pageContext.selectedText),
    selectedText: pageContext.selectedText || "",
    selectionTextClass: pageContext.selectionTextClass || "empty",
    isEditing: Boolean(pageContext.isEditing),
    visibleContentSummary: pageContext.visibleContentSummary || "",
    sourceMeta: {
      source: "chrome_extension",
      timestamp: Date.now(),
      visibleTextCharCount: (pageContext.visibleContentSummary || "").length,
      selectedTextCharCount: (pageContext.selectedText || "").length
    }
  };
}

async function requestRecommendation(runtimeUrl, context) {
  const response = await fetch(runtimeUrl || DEFAULT_RUNTIME_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(context)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`runtime returned ${response.status}: ${text}`);
  }

  return JSON.parse(text);
}

function renderActions(result) {
  actionsNode.replaceChildren();
  for (const recommendation of result.recommendations || []) {
    const item = document.createElement("li");
    const title = document.createElement("div");
    title.className = "action-title";

    const label = document.createElement("span");
    label.textContent = recommendation.label || recommendation.id;
    const confidence = document.createElement("span");
    confidence.textContent = String(recommendation.confidence ?? "");

    title.append(label, confidence);
    item.append(title);

    const reasons = document.createElement("ul");
    reasons.className = "reasons";
    for (const reason of recommendation.reasons || []) {
      const reasonItem = document.createElement("li");
      reasonItem.textContent = reason;
      reasons.append(reasonItem);
    }
    item.append(reasons);
    actionsNode.append(item);
  }
}

function setStatus(message, isError = false) {
  statusNode.textContent = message;
  statusNode.classList.toggle("error", isError);
}

function collectContextFromPage() {
  const MAX_SELECTION_CHARS = 4000;
  const MAX_VISIBLE_CHARS = 1200;

  const selectedText = truncate(readSelectedText(), MAX_SELECTION_CHARS);
  const visibleContentSummary = truncate(readVisibleText(), MAX_VISIBLE_CHARS);

  return {
    url: location.href,
    pageTitle: document.title,
    selectedText,
    selectionTextClass: classifyText(selectedText),
    isEditing: isEditableElement(document.activeElement),
    visibleContentSummary
  };

  function readSelectedText() {
    const fieldSelection = readFieldSelection(document.activeElement);
    if (fieldSelection) return fieldSelection;
    return String(window.getSelection?.().toString() || "").trim();
  }

  function readFieldSelection(element) {
    if (!element) return "";
    const value = element.value;
    if (typeof value !== "string") return "";
    if (
      typeof element.selectionStart !== "number" ||
      typeof element.selectionEnd !== "number" ||
      element.selectionStart === element.selectionEnd
    ) {
      return "";
    }
    return value.slice(element.selectionStart, element.selectionEnd).trim();
  }

  function isEditableElement(element) {
    if (!element) return false;
    const tagName = String(element.tagName || "").toLowerCase();
    const role = element.getAttribute?.("role")?.toLowerCase();
    return (
      tagName === "textarea" ||
      tagName === "input" ||
      element.isContentEditable === true ||
      role === "textbox" ||
      element.getAttribute?.("contenteditable") === "true"
    );
  }

  function readVisibleText() {
    const walker = document.createTreeWalker(
      document.body || document.documentElement,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const text = normalize(node.nodeValue);
          if (!text) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent || !isVisibleElement(parent)) {
            return NodeFilter.FILTER_REJECT;
          }
          return isTextNodeInViewport(node)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        }
      }
    );

    const parts = [];
    let total = 0;
    while (walker.nextNode() && total < MAX_VISIBLE_CHARS) {
      const text = normalize(walker.currentNode.nodeValue);
      parts.push(text);
      total += text.length + 1;
    }
    return normalize(parts.join(" "));
  }

  function isVisibleElement(element) {
    const style = window.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) === 0
    ) {
      return false;
    }
    const tagName = element.tagName.toLowerCase();
    return !["script", "style", "noscript", "svg"].includes(tagName);
  }

  function isTextNodeInViewport(node) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = Array.from(range.getClientRects());
    range.detach();
    return rects.some(
      (rect) =>
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom >= 0 &&
        rect.right >= 0 &&
        rect.top <= window.innerHeight &&
        rect.left <= window.innerWidth
    );
  }

  function classifyText(text) {
    const value = String(text || "");
    if (!value.trim()) return "empty";
    if (looksLikeCode(value)) return "code";
    if (/[a-zA-Z\u4e00-\u9fa5]/.test(value)) return "natural_language";
    return "mixed";
  }

  function looksLikeCode(text) {
    const keywordHits = [
      "function",
      "const",
      "let",
      "return",
      "class",
      "import",
      "export",
      "async",
      "def",
      "interface"
    ].filter((keyword) => text.includes(keyword)).length;
    const syntaxMarks = (text.match(/[{}()[\];=<>]/g) || []).length;
    const lineCount = text.split(/\r?\n/).filter(Boolean).length;
    return keywordHits >= 2 || (keywordHits >= 1 && syntaxMarks >= 4) || lineCount >= 3;
  }

  function truncate(text, maxChars) {
    const value = normalize(text);
    return value.length <= maxChars ? value : `${value.slice(0, maxChars - 1)}…`;
  }

  function normalize(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }
}
