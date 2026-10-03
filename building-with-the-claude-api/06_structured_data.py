import json

from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()
client = Anthropic()
model = "claude-sonnet-4-5-20250929"


def add_user_message(messages, text):
    messages.append({"role": "user", "content": text})


def add_assistant_message(messages, text):
    messages.append({"role": "assistant", "content": text})


def chat(messages, system=None, stop_sequences=None):
    params = {
        "model": model,
        "max_tokens": 1000,
        "messages": messages,
    }
    # The API rejects None values, so only include optional params when set
    if system:
        params["system"] = system
    if stop_sequences:
        params["stop_sequences"] = stop_sequences

    response = client.messages.create(**params)
    print("stop_reason:", response.stop_reason)
    print("stop_sequence:", response.stop_sequence)
    return response.content[0].text


prompt = "Generate a very short EventBridge rule as JSON"

# --- 1. Default behavior: markdown fence + commentary ---
messages = []
add_user_message(messages, prompt)
print("=== Default response ===")
print(chat(messages))

# --- 2. Prefill + stop sequence: raw JSON only ---
messages = []
add_user_message(messages, prompt)
# Prefill must NOT end with whitespace/newline or the API returns a 400
add_assistant_message(messages, "```json")

print("\n=== Prefill + stop_sequences ===")
text = chat(messages, stop_sequences=["```"])
print(repr(text))  # note the leading/trailing newlines

# --- 3. Parse it: strip whitespace, then json.loads ---
data = json.loads(text.strip())
print("\nParsed OK, top-level keys:", list(data.keys()))