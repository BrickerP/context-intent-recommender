export const ACTIONS = {
  ask_user_input: {
    id: "ask_user_input",
    label: "Ask what the user wants"
  },
  summarize_changes: {
    id: "summarize_changes",
    label: "Summarize PR changes"
  },
  write_review: {
    id: "write_review",
    label: "Draft a code review"
  },
  find_risks: {
    id: "find_risks",
    label: "Find potential risks"
  },
  summarize_video: {
    id: "summarize_video",
    label: "Summarize this video"
  },
  extract_timeline: {
    id: "extract_timeline",
    label: "Extract a video timeline"
  },
  list_key_points: {
    id: "list_key_points",
    label: "List key points"
  },
  continue_writing: {
    id: "continue_writing",
    label: "Continue writing"
  },
  polish_text: {
    id: "polish_text",
    label: "Polish current text"
  },
  rewrite_text: {
    id: "rewrite_text",
    label: "Rewrite current text"
  },
  draft_reply: {
    id: "draft_reply",
    label: "Draft a reply"
  },
  summarize_email: {
    id: "summarize_email",
    label: "Summarize this email"
  },
  translate_text: {
    id: "translate_text",
    label: "Translate current content"
  },
  summarize_conversation: {
    id: "summarize_conversation",
    label: "Summarize this conversation"
  },
  explain_code: {
    id: "explain_code",
    label: "Explain selected code"
  },
  write_tests: {
    id: "write_tests",
    label: "Write tests for selected code"
  },
  add_comments: {
    id: "add_comments",
    label: "Add comments to selected code"
  },
  summarize_page: {
    id: "summarize_page",
    label: "Summarize current page"
  },
  extract_page_key_points: {
    id: "extract_page_key_points",
    label: "Extract page key points"
  },
  summarize_assessment: {
    id: "summarize_assessment",
    label: "Summarize assessment requirements"
  },
  extract_assessment_requirements: {
    id: "extract_assessment_requirements",
    label: "Extract assessment constraints"
  },
  prepare_assessment_plan: {
    id: "prepare_assessment_plan",
    label: "Prepare an assessment plan"
  }
};

export const SCENE_ACTIONS = {
  github_pr: [
    ["summarize_changes", 0.97],
    ["write_review", 0.91],
    ["find_risks", 0.86]
  ],
  youtube_video: [
    ["summarize_video", 0.95],
    ["extract_timeline", 0.88],
    ["list_key_points", 0.82]
  ],
  document_editing: [
    ["continue_writing", 0.92],
    ["polish_text", 0.89],
    ["rewrite_text", 0.85]
  ],
  email_reading: [
    ["draft_reply", 0.93],
    ["summarize_email", 0.86],
    ["translate_text", 0.72]
  ],
  chat_thread: [
    ["draft_reply", 0.91],
    ["summarize_conversation", 0.83],
    ["translate_text", 0.72]
  ],
  code_selection: [
    ["explain_code", 0.95],
    ["write_tests", 0.86],
    ["add_comments", 0.77]
  ],
  content_page: [
    ["summarize_page", 0.82],
    ["extract_page_key_points", 0.74],
    ["translate_text", 0.55]
  ],
  assessment_page: [
    ["summarize_assessment", 0.93],
    ["extract_assessment_requirements", 0.9],
    ["prepare_assessment_plan", 0.84]
  ],
  generic_web_page: [
    ["summarize_page", 0.52],
    ["extract_page_key_points", 0.46],
    ["translate_text", 0.35]
  ],
  unknown: [["ask_user_input", 1]]
};

export const FALLBACK_ACTION = {
  ...ACTIONS.ask_user_input,
  confidence: 1,
  reasons: ["Context signals are too weak to recommend a reliable action"]
};

export function actionLabel(actionId) {
  return ACTIONS[actionId]?.label || actionId;
}
