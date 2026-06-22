import assert from "node:assert/strict";
import test from "node:test";
import { recommendActions } from "../src/runtime/recommender.js";
import { buildAgentHandoff, routeContext } from "../src/runtime/router.js";

const contexts = {
  githubPr: {
    app: "chrome",
    url: "https://github.com/acme/web/pull/123",
    pageTitle: "Fix auth redirect by alice · Pull Request #123 · acme/web",
    hasSelection: false,
    isEditing: false,
    visibleContentSummary:
      "Conversation Commits Checks Files changed Review changes diff package auth redirect tests"
  },
  appmiaoda: {
    app: "chrome",
    url: "https://app-cibbijwju0aq.appmiaoda.com/",
    pageTitle: "AI行业资讯简报应用",
    hasSelection: false,
    isEditing: false,
    visibleContentSummary:
      "AI行业每日简报应用，自动抓取AI资讯并通过大模型生成每日简报，支持查看历史简报和手动触发抓取，采用React+Tailwind CSS+Supabase技术栈构建。"
  },
  codeSelection: {
    app: "vscode",
    url: "",
    pageTitle: "recommender.js",
    hasSelection: true,
    selectedText:
      "export function add(a, b) {\n  if (typeof a !== 'number') throw new Error('bad input');\n  return a + b;\n}",
    isEditing: true,
    visibleContentSummary: "function add selected in editor"
  },
  contentPage: {
    app: "chrome",
    url: "https://news.example.com/ai/weekly-report",
    pageTitle: "AI Weekly Report: Model releases and infrastructure trends",
    hasSelection: false,
    isEditing: false,
    visibleContentSummary:
      "This weekly AI report covers model release news, developer platform updates, infrastructure spending, open-source model benchmarks, and enterprise adoption trends. The article explains how inference costs changed this month, why several teams moved workloads to specialized accelerators, and what product leaders should watch in the next quarter. It also includes a newsletter-style summary of funding, regulation, and research paper highlights."
  },
  meritFirst: {
    app: "chrome",
    url: "https://www.meritfirst.us/candidate/tests/0a446564-7943-4d3f-85cb-20617549f8a9",
    pageTitle:
      "MeritFirst Software Engineer Assessment (we're hiring for this!) - MeritFirst",
    hasSelection: false,
    isEditing: false,
    visibleContentSummary:
      "Discover Inbox My Assessments My Profile Share Profile Feedback Toggle theme L MeritFirst MeritFirst Software Engineer Assessment (we're hiring for this!) Questions 3 Expected Time 90 minutes Before You Begin Warning Recording begins immediately after you start the assessment. Read questions fully before answering. Setup Use a laptop or desktop with stable WiFi in a quiet place. No phones or tablets. Practice First time? We highly recommend the practice assessment here. Preparation Treat this like a live interview. Have your pitch ready and be prepared for take-home style questions. Assessment Requirements Audio & Video Screenshare OFFICIAL Standardized MeritFirst Assessment Scored and maintained by MeritFirst."
  },
  semanticHintEmail: {
    app: "chrome",
    url: "https://internal.example.com/t/100",
    pageTitle: "Follow up from Dana",
    hasSelection: false,
    isEditing: false,
    visibleContentSummary:
      "Hi, just checking whether you had a chance to review the agreement. Regards, Dana",
    semanticHints: {
      scene: "email_reading",
      confidence: 0.78,
      evidence: ["LLM/classifier judged the visible content as an email-like thread"]
    }
  }
};

test("recommends PR review actions for GitHub PR pages", () => {
  const result = recommendActions(contexts.githubPr);

  assert.equal(result.scene, "github_pr");
  assert.equal(result.fallback, false);
  assert.deepEqual(
    result.recommendations.map((item) => item.id),
    ["summarize_changes", "write_review", "find_risks"]
  );
});

test("falls back for appmiaoda page when only generic page metadata is present", () => {
  const result = recommendActions(contexts.appmiaoda);

  assert.equal(result.scene, "generic_web_page");
  assert.equal(result.fallback, true);
  assert.equal(result.recommendations[0].id, "ask_user_input");
  assert.match(result.recommendations[0].reasons.join(" "), /No high-confidence scene rule matched/);
});

test("detects code selection from editor selection text", () => {
  const result = recommendActions(contexts.codeSelection);

  assert.equal(result.scene, "code_selection");
  assert.equal(result.fallback, false);
  assert.equal(result.recommendations[0].id, "explain_code");
});

test("recommends summary actions for long content pages", () => {
  const result = recommendActions(contexts.contentPage);

  assert.equal(result.scene, "content_page");
  assert.equal(result.fallback, false);
  assert.equal(result.recommendations[0].id, "summarize_page");
});

test("does not classify assessment dashboards as email just because nav says inbox", () => {
  const result = recommendActions(contexts.meritFirst);

  assert.equal(result.scene, "assessment_page");
  assert.equal(result.fallback, false);
  assert.deepEqual(
    result.recommendations.map((item) => item.id),
    [
      "summarize_assessment",
      "extract_assessment_requirements",
      "prepare_assessment_plan"
    ]
  );
});

test("uses constrained semantic hints for ambiguous backend cases", () => {
  const result = recommendActions(contexts.semanticHintEmail);

  assert.equal(result.scene, "email_reading");
  assert.equal(result.fallback, false);
  assert.equal(result.recommendations[0].id, "draft_reply");
});

test("falls back when core context fields are mostly missing", () => {
  const result = recommendActions({
    app: "chrome",
    hasSelection: false,
    isEditing: false
  });

  assert.equal(result.fallback, true);
  assert.equal(result.recommendations[0].id, "ask_user_input");
});

test("router includes local codex handoff mode when no LLM key is provided", () => {
  const result = routeContext(contexts.meritFirst, { llmAvailable: false });

  assert.equal(result.router.mode, "rules_first_codex_handoff");
  assert.equal(result.router.agentProvider, "codex_cli");
});

test("builds an agent handoff prompt for a selected action", () => {
  const recommendation = routeContext(contexts.meritFirst, { llmAvailable: false });
  const handoff = buildAgentHandoff({
    actionId: "summarize_assessment",
    context: contexts.meritFirst,
    recommendation
  });

  assert.equal(handoff.provider, "codex_cli");
  assert.equal(handoff.actionId, "summarize_assessment");
  assert.match(handoff.prompt, /ContextSnapshot JSON/);
  assert.match(handoff.prompt, /Do not answer assessment questions/);
});
