#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_RUNTIME_URL = "http://127.0.0.1:8787";
const ACTION_IDS = [
  "ask_user_input",
  "summarize_changes",
  "write_review",
  "find_risks",
  "summarize_video",
  "extract_timeline",
  "list_key_points",
  "continue_writing",
  "polish_text",
  "rewrite_text",
  "draft_reply",
  "summarize_email",
  "translate_text",
  "summarize_conversation",
  "explain_code",
  "write_tests",
  "add_comments",
  "summarize_page",
  "extract_page_key_points",
  "summarize_assessment",
  "extract_assessment_requirements",
  "prepare_assessment_plan"
];
const args = parseArgs(process.argv.slice(2));
const command = args._[0] || "show";
const runtimeUrl = stripTrailingSlash(args.runtimeUrl || DEFAULT_RUNTIME_URL);

try {
  if (args.help || command === "help") {
    printUsage();
  } else if (command === "show") {
    const payload = await getJson(`${runtimeUrl}/context`);
    const recommendation = args.router
      ? (await getJson(`${runtimeUrl}/recommend`))
      : runCodexRecommendation(payload.context);
    const showPayload = { ...payload, recommendation };
    if (args.json) printJson(showPayload);
    else printRecommendations(showPayload);
  } else if (command === "context") {
    printJson(await getJson(`${runtimeUrl}/context`));
  } else if (command === "agent") {
    const actionId = args._[1];
    const suffix = actionId ? `?actionId=${encodeURIComponent(actionId)}` : "";
    const payload = await getJson(`${runtimeUrl}/agent${suffix}`);
    if (args.json) {
      printJson(payload);
    } else {
      printAgentHandoff(payload);
    }
    if (args.run) runCodex(payload.handoff.prompt);
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function getJson(url) {
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(
      `Runtime request failed. Start it with "npm run runtime". ${error.message}`
    );
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Runtime returned ${response.status}: ${text}`);
  }
  return JSON.parse(text);
}

function printRecommendations(payload) {
  const recommendation = payload.recommendation;
  console.log(`Scene: ${recommendation.scene} (${recommendation.sceneConfidence})`);
  console.log(`Fallback: ${recommendation.fallback}`);
  console.log(`Router: ${recommendation.router?.mode || "codex_agent"}`);
  console.log(`Context: ${payload.context.pageTitle || payload.context.url}`);
  console.log("");
  recommendation.recommendations.forEach((item, index) => {
    console.log(`${index + 1}. ${item.label} [${item.id}] ${item.confidence}`);
    for (const reason of item.reasons || []) {
      console.log(`   - ${reason}`);
    }
  });
  console.log("");
  console.log("Run agent handoff:");
  console.log(`  frontend agent ${recommendation.recommendations[0]?.id || ""}`);
}

function printAgentHandoff(payload) {
  console.log(`Provider: ${payload.handoff.provider}`);
  console.log(`Action: ${payload.handoff.label} [${payload.handoff.actionId}]`);
  console.log("");
  console.log(payload.handoff.prompt);
  console.log("");
  console.log("Execute with local Codex CLI:");
  console.log(`  frontend agent ${payload.handoff.actionId} --run`);
}

function runCodex(prompt) {
  const result = spawnSync("codex", ["exec", prompt], {
    stdio: "inherit"
  });
  if (result.error) {
    throw new Error(`Failed to run codex CLI: ${result.error.message}`);
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function runCodexRecommendation(context) {
  const dir = mkdtempSync(join(tmpdir(), "context-agent-"));
  const outputFile = join(dir, "recommendation.json");
  const prompt = buildRecommendationPrompt(context);
  const result = spawnSync(
    "codex",
    [
      "exec",
      "--cd",
      process.cwd(),
      "--skip-git-repo-check",
      "--output-schema",
      "schemas/agent-recommendation.schema.json",
      "--output-last-message",
      outputFile,
      prompt
    ],
    {
      encoding: "utf8"
    }
  );

  if (result.error || result.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    const message = result.error?.message || result.stderr || result.stdout || "unknown error";
    throw new Error(`Codex agent recommendation failed. Use --router for fallback router. ${message}`);
  }

  try {
    const parsed = JSON.parse(readFileSync(outputFile, "utf8"));
    return {
      ...parsed,
      router: {
        mode: "codex_agent",
        agentProvider: "codex_cli"
      }
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function buildRecommendationPrompt(context) {
  return [
    "You are the recommendation router for a context-aware frontend agent.",
    "Given the ContextSnapshot JSON, return the best 1-3 actions.",
    "Use only these action ids:",
    ACTION_IDS.join(", "),
    "",
    "Rules:",
    "- scene must be one of: github_pr, youtube_video, document_editing, email_reading, chat_thread, code_selection, content_page, assessment_page, generic_web_page, unknown.",
    "- Do not overfit to weak navigation words such as Inbox if the page is not actually email.",
    "- If context is weak or generic, return fallback=true and ask_user_input.",
    "- Prefer actions that match the user's current page, selection, and editing state.",
    "- Keep reasons evidence-based and grounded in the provided context.",
    "- Return only JSON matching the schema.",
    "",
    "ContextSnapshot JSON:",
    JSON.stringify(context, null, 2)
  ].join("\n");
}

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--run") {
      parsed.run = true;
      continue;
    }
    if (arg === "--router") {
      parsed.router = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const key = toCamelCase(arg.slice(2));
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      parsed[key] = value;
      index += 1;
      continue;
    }
    parsed._.push(arg);
  }
  return parsed;
}

function printUsage() {
  console.log(`Usage:
  frontend show [--json] [--runtime-url http://127.0.0.1:8787]
  frontend show --router [--json] [--runtime-url http://127.0.0.1:8787]
  frontend context [--runtime-url http://127.0.0.1:8787]
  frontend agent [actionId] [--json] [--run] [--runtime-url http://127.0.0.1:8787]

Flow:
  1. npm run runtime
  2. Click the Chrome extension refresh button on a page
  3. frontend show
  4. frontend agent <actionId>

Notes:
  frontend show uses local Codex CLI by default.
  frontend show --router uses the deterministic fallback router.`);
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function stripTrailingSlash(value) {
  return String(value).replace(/\/+$/, "");
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}
