from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()
client = Anthropic()
model = "claude-sonnet-4-5-20250929"


def add_user_message(messages, text):
    messages.append({"role": "user", "content": text})

def add_assistant_message(messages, text):
    messages.append({"role": "assistant", "content": text})

def chat(messages, system=None):
    params = {
        "model": model,
        "max_tokens": 1000,
        "messages": messages,
    }
    if system:  # API không nhận system=None
        params["system"] = system
    response = client.messages.create(**params)
    return response.content[0].text

system_prompt = """
You are a patient math tutor.
Do not directly answer a student's questions.
Guide them to a solution step by step.
"""

question = "How do I solve 5x + 2 = 3 for x?"

# 1: Without system prompt
messages = []
add_user_message(messages, question)
print("=== Without system prompt ===")
print(chat(messages))

# 2: wthout system prompt
messages = []
add_user_message(messages, question)
print("\n=== With system prompt ===")
print(chat(messages, system=system_prompt))
