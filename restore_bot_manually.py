import sys
from pathlib import Path

bot_path = Path("c:/Users/amd/hermes/telegram-flow-news-bot.mjs")
content = bot_path.read_text(encoding="utf-8")

# 1. 잘려나간 openRouterReply 닫기와 strategyConstrainedPrompt 선언 추가
target_start = '            "Answer the user\'s message directly and naturally.",'
target_end = '    "USER REQUEST:",'

start_idx = content.find(target_start)
if start_idx == -1:
    print("Cannot find target_start in file.")
    sys.exit(1)

end_idx = content.find(target_end, start_idx)
if end_idx == -1:
    print("Cannot find target_end after target_start in file.")
    sys.exit(1)

# target_start의 끝 위치
replace_start = start_idx + len(target_start)

# 교체될 중간 텍스트
middle_patch = """
          ],
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.choices?.[0]?.message?.content) {
        throw new Error(`OpenRouter failed: ${json.error?.message || response.statusText}`);
      }
      return json.choices[0].message.content.trim();
    }

    function strategyConstrainedPrompt(originalText, plan, evaluation) {
      return [
"""

patched_content = content[:replace_start] + middle_patch + content[end_idx:]

# 2. evaluateStrategyPlan 및 기타 헬퍼 함수들을 적합한 위치에 삽입
# prepareGenericExecutionText 함수 끝에 붙여넣는다.
insertion_anchor = "return strategyConstrainedPrompt(text, plan, evaluation);\n}"
anchor_idx = patched_content.find(insertion_anchor)

if anchor_idx == -1:
    print("Cannot find prepareGenericExecutionText end anchor.")
    sys.exit(1)

insert_pos = anchor_idx + len(insertion_anchor)

helpers_code = """

function parseJsonObjectFromText(text) {
  const trimmed = String(text || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\\{[\\s\\S]*\\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function heuristicStrategyPlan(text) {
  const lower = String(text || "").toLowerCase();
  const koreanStockScan = /(kospi|kosdaq|\\uCF54\\uC2A4\\uD53C|\\uCF54\\uC2A4\\uB2E5|\\uD55C\\uAD6D\\s*\\uC8FC\\uC2DD|\\uC885\\uBAA9)/i.test(text)
    && /(2026|\\uC62C\\uD574|ytd|\\uC5F0\\uCD08|\\uC0C1\\uC2B9\\uB960|\\uC218\\uC775\\uB960|top|10)/i.test(text);
  if (koreanStockScan) {
    return {
      task_type: "market_data_scan",
      goal: text,
      tools: ["web", "python"],
      estimated_runtime_sec: 240,
      risk: "slow_full_market_scan",
      first_action: "probe one Naver Finance endpoint or ranked page before full scan",
      fallback: "return partial top candidates with source notes if complete market coverage is too slow",
    };
  }
  if (/install|npm|pip|playwright|browser|scrape|crawl|download|all|entire/.test(lower)) {
    return {
      task_type: "generic_local_execution",
      goal: text,
      tools: ["shell"],
      estimated_runtime_sec: 120,
      risk: "medium",
      first_action: "inspect existing files and run a small probe before broad execution",
      fallback: "report partial findings and next command",
    };
  }
  return {
    task_type: "generic_answer",
    goal: text,
    tools: [],
    estimated_runtime_sec: 30,
    risk: "low",
    first_action: "answer directly or inspect local context if needed",
    fallback: "ask for clarification only if required",
  };
}

function isDestructiveRequest(text, plan) {
  const lowerText = String(text || "").toLowerCase();
  const lowerPlanGoal = String(plan?.goal || "").toLowerCase();
  const lowerPlanRisk = String(plan?.risk || "").toLowerCase();
  const lowerFirstAction = String(plan?.first_action || "").toLowerCase();
  
  const destructiveKeywords = /\\b(rm|del|rmdir|remove|delete|kill|format|format-volume|terminate|wipe|erase)\\b/i;
  const destructiveKorean = /(삭제|제거|포맷|강제\\s*종료|죽이기|지우기|지워)/;
  
  if (destructiveKeywords.test(lowerText) || destructiveKorean.test(lowerText)) {
    return true;
  }
  if (destructiveKeywords.test(lowerPlanGoal) || destructiveKorean.test(lowerPlanGoal)) {
    return true;
  }
  if (destructiveKeywords.test(lowerFirstAction) || destructiveKorean.test(lowerFirstAction)) {
    return true;
  }
  if (lowerPlanRisk.includes("unsafe") || lowerPlanRisk.includes("destructive") || lowerPlanRisk.includes("unsafe_command")) {
    return true;
  }
  
  return false;
}

function evaluateStrategyPlan(plan) {
  const constraints = [];
  let allowed = true;
  
  if (!plan) {
    return { allowed: true, constraints: ["No plan generated. Proceed with caution."] };
  }
  
  const risk = String(plan.risk || "low").toLowerCase();
  const runtime = Number(plan.estimated_runtime_sec || 0);
  const tools = plan.tools || [];
  
  if (risk === "unsafe" || risk.includes("destructive") || risk.includes("unsafe_command")) {
    allowed = false;
    constraints.push("Destructive risk detected. Awaiting explicit user approval before execution.");
  }
  if (runtime > 180) {
    constraints.push(`High runtime warning: estimated ${runtime}s. Optimize steps to avoid timeouts.`);
  }
  if (tools.includes("shell") || tools.includes("powershell") || tools.includes("python")) {
    constraints.push("Local execution requested. Do not run destructive commands (rm, del, format, kill) without user approval.");
  }
  
  return { allowed, constraints };
}

async function buildStrategyPlan(text, message) {
  if (process.env.HERMES_STRATEGY_GATE_DISABLED === "1") return null;
  const key = await readFile(OPENROUTER_KEY_FILE, "utf8").then((value) => value.trim()).catch(() => "");
  if (!key) return heuristicStrategyPlan(text);

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost/hermes-telegram",
      "X-Title": "Hermes Telegram Strategy Gate",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        {
          role: "system",
          content: [
            "You are a strategy gate for a local Telegram coding agent.",
            "Return only a compact JSON object.",
            "Do not solve the task. Plan the execution risk.",
            "Schema keys: task_type, goal, tools, estimated_runtime_sec, risk, first_action, fallback.",
            "Risk should be one of low, medium, slow_full_scan, unsafe, needs_clarification.",
          ].join(" "),
        },
        { role: "user", content: String(text || "").slice(0, 2000) },
      ],
      temperature: 0.1,
      max_tokens: 500,
    }),
  });
  const json = await response.json();
  const content = json.choices?.[0]?.message?.content;
  if (!response.ok || !content) return heuristicStrategyPlan(text);
  return parseJsonObjectFromText(content) || heuristicStrategyPlan(text);
}
"""

final_content = patched_content[:insert_pos] + helpers_code + patched_content[insert_pos:]

bot_path.write_text(final_content, encoding="utf-8")
print("Stitched and restored bot file successfully!")
