import json
import re
from pathlib import Path

temp_step_path = Path("c:/Users/amd/hermes/temp_step.json")
bot_path = Path("c:/Users/amd/hermes/telegram-flow-news-bot.mjs")

step = json.loads(temp_step_path.read_text(encoding="utf-8"))
content = step.get("content", "")

# content format:
# 1: #!/usr/bin/env node
# 2: ...
# Let's extract line by line.
lines = content.splitlines()
code_lines = []
for line in lines:
    # Match pattern "<line_number>: <code_content>"
    # Note: the line number might be followed by colon and a space
    # e.g., "1: #!/usr/bin/env node"
    match = re.match(r"^\s*(\d+):\s*(.*)$", line)
    if match:
        code_lines.append(match.group(2))

original_800 = "\n".join(code_lines)
print(f"Extracted {len(code_lines)} lines.")

# Write extracted lines to a test file to verify
Path("extracted_800.js").write_text(original_800, encoding="utf-8")
print("Saved to extracted_800.js")

# Now, read the current bot file
current_bot_content = bot_path.read_text(encoding="utf-8")

# Find the split point: "async function codexPrompt"
split_str = "async function codexPrompt"
split_idx = current_bot_content.find(split_str)

if split_idx != -1:
    print(f"Found '{split_str}' in current bot file at index {split_idx}")
    remaining_bot = current_bot_content[split_idx:]
    
    # We want to combine the original first 800 lines (up to codexPrompt) with the remaining bot file.
    # Let's find codexPrompt in original_800.
    orig_split_idx = original_800.find(split_str)
    if orig_split_idx != -1:
        print(f"Found '{split_str}' in original_800 at index {orig_split_idx}")
        clean_original = original_800[:orig_split_idx]
        
        # Combine
        restored_content = clean_original + remaining_bot
        
        # Backup current bot file
        bot_path.rename(bot_path.with_name("telegram-flow-news-bot.mjs.broken"))
        
        # Write restored
        bot_path.write_text(restored_content, encoding="utf-8")
        print("SUCCESSFULLY RESTORED telegram-flow-news-bot.mjs!")
    else:
        print(f"Could not find '{split_str}' in original_800. Let's dump original_800 lines to see what's wrong.")
        # Sometimes regex match might have failed on some lines due to linebreaks inside strings, etc.
        # Let's print some lines of original_800.
        print("\n".join(code_lines[:20]))
else:
    print(f"Could not find '{split_str}' in current bot file.")
