import { ACTIONS, FALLBACK_ACTION, SCENE_ACTIONS } from "./actions.js";
import { detectScene, normalizeContext, validateContext } from "./detectors.js";
import { clamp, includesAny } from "./textSignals.js";

const DEFAULT_THRESHOLDS = {
  minSceneConfidence: 0.58,
  minTopActionConfidence: 0.6
};

export function recommendActions(rawContext, options = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) };
  const context = normalizeContext(rawContext);
  const quality = validateContext(context);
  const sceneResult = detectScene(context);
  const candidates = rankActions(context, sceneResult);
  const shouldFallback = needsFallback({
    context,
    quality,
    sceneResult,
    candidates,
    thresholds
  });

  if (shouldFallback) {
    return {
      scene: sceneResult.scene,
      sceneConfidence: round(sceneResult.confidence),
      fallback: true,
      recommendations: [
        {
          ...FALLBACK_ACTION,
          reasons: [
            ...FALLBACK_ACTION.reasons,
            ...sceneResult.evidence,
            ...missingContextReasons(quality)
          ]
        }
      ],
      explanation: {
        quality,
        sceneEvidence: sceneResult.evidence,
        decision: "fallback"
      }
    };
  }

  return {
    scene: sceneResult.scene,
    sceneConfidence: round(sceneResult.confidence),
    fallback: false,
    recommendations: candidates.slice(0, 3),
    explanation: {
      quality,
      sceneEvidence: sceneResult.evidence,
      decision: "recommend"
    }
  };
}

function rankActions(context, sceneResult) {
  const sceneActions = SCENE_ACTIONS[sceneResult.scene] || SCENE_ACTIONS.unknown;

  return sceneActions
    .map(([actionId, prior]) => {
      const action = ACTIONS[actionId];
      const boost = actionBoost(actionId, context);
      const confidence = clamp(
        sceneResult.confidence * 0.62 + prior * 0.28 + boost,
        0,
        0.99
      );
      return {
        ...action,
        confidence: round(confidence),
        reasons: buildReasons(actionId, context, sceneResult, boost)
      };
    })
    .sort((a, b) => b.confidence - a.confidence);
}

function actionBoost(actionId, context) {
  let boost = 0;
  const text = `${context.pageTitle} ${context.visibleContentSummary} ${context.selectedText}`;

  if (context.hasSelection) {
    if (
      [
        "explain_code",
        "write_tests",
        "add_comments",
        "rewrite_text",
        "polish_text",
        "translate_text"
      ].includes(actionId)
    ) {
      boost += 0.08;
    }
  }

  if (context.isEditing) {
    if (["continue_writing", "polish_text", "rewrite_text", "draft_reply"].includes(actionId)) {
      boost += 0.08;
    }
  }

  if (includesAny(text, ["diff", "files changed", "review", "pull request", "代码审查"])) {
    if (["write_review", "find_risks", "summarize_changes"].includes(actionId)) {
      boost += 0.05;
    }
  }

  if (includesAny(text, ["translate", "翻译", "英文", "中文"])) {
    if (actionId === "translate_text") boost += 0.08;
  }

  if (includesAny(text, ["test", "spec", "测试"])) {
    if (actionId === "write_tests") boost += 0.06;
  }

  return boost;
}

function buildReasons(actionId, context, sceneResult, boost) {
  const reasons = [...sceneResult.evidence];
  if (context.hasSelection) reasons.push("Selected text is present");
  if (context.isEditing) reasons.push("The user is currently editing");
  if (boost > 0) reasons.push("Context keywords raised this action's priority");
  reasons.push(`Action ${actionId} is a candidate for the ${sceneResult.scene} scene`);
  return Array.from(new Set(reasons));
}

function needsFallback({ quality, sceneResult, candidates, thresholds }) {
  const [top] = candidates;

  if (!quality.valid) return true;
  if (sceneResult.scene === "unknown") return true;
  if (sceneResult.scene === "generic_web_page" && !quality.hasStrongUserLocalSignal) {
    return true;
  }
  if (sceneResult.confidence < thresholds.minSceneConfidence) return true;
  if (!top || top.confidence < thresholds.minTopActionConfidence) return true;
  return false;
}

function missingContextReasons(quality) {
  if (quality.missingFields.length === 0) return [];
  return [`Missing or weak fields: ${quality.missingFields.join(", ")}`];
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
