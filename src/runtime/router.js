import { actionLabel } from "./actions.js";
import { recommendActions } from "./recommender.js";

export function routeContext(context, options = {}) {
  const llmAvailable =
    options.llmAvailable ?? Boolean(process.env.OPENAI_API_KEY || process.env.LLM_API_KEY);
  const recommendation = recommendActions(context);

  return {
    ...recommendation,
    router: {
      mode: llmAvailable ? "rules_first_llm_available" : "rules_first_codex_handoff",
      llmAvailable,
      agentProvider: llmAvailable ? "external_llm_available" : "codex_cli"
    }
  };
}

export function buildAgentHandoff({ actionId, context, recommendation }) {
  const selected =
    recommendation?.recommendations?.find((item) => item.id === actionId) ||
    recommendation?.recommendations?.[0] ||
    null;
  const finalActionId = actionId || selected?.id || "ask_user_input";
  const label = selected?.label || actionLabel(finalActionId);

  return {
    provider: "codex_cli",
    actionId: finalActionId,
    label,
    prompt: buildPrompt({
      actionId: finalActionId,
      label,
      context,
      recommendation
    })
  };
}

function buildPrompt({ actionId, label, context, recommendation }) {
  return [
    "You are an execution agent. Use the provided browser context and selected action.",
    "",
    `Selected action: ${actionId} (${label})`,
    `Detected scene: ${recommendation?.scene || "unknown"}`,
    "",
    "ContextSnapshot JSON:",
    JSON.stringify(context, null, 2),
    "",
    "Task:",
    taskInstruction(actionId)
  ].join("\n");
}

function taskInstruction(actionId) {
  switch (actionId) {
    case "summarize_assessment":
      return "Summarize the assessment requirements and constraints. Do not answer assessment questions for the user.";
    case "extract_assessment_requirements":
      return "Extract concrete requirements, setup constraints, timing, recording, and preparation notes.";
    case "prepare_assessment_plan":
      return "Create a preparation checklist and ethical strategy for approaching the assessment. Do not provide hidden assistance for active scored answers.";
    case "summarize_page":
      return "Summarize the visible page content concisely.";
    case "extract_page_key_points":
      return "Extract the key points from the visible page content.";
    case "translate_text":
      return "Translate the relevant selected or visible content.";
    case "explain_code":
      return "Explain the selected code clearly.";
    case "write_tests":
      return "Suggest tests for the selected code.";
    case "add_comments":
      return "Suggest concise comments for the selected code.";
    case "draft_reply":
      return "Draft a reply based on the visible conversation/email context.";
    default:
      return "Ask the user what they want to do next, using the context to offer concise choices.";
  }
}
