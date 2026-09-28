from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()
client = Anthropic()
model = "claude-sonnet-4-5-20250929"

def add_user_message(messages, text):
    messages.append({"role": "user", "content": text})

def chat(messages, system=None, temperature=1.0):
    params = {
        "model": model,
        "max_tokens": 1000,
        "messages": messages,
        # `temperature` was removed from the SDK 1.x method signature, but
        # claude-sonnet-4-5 still honors it server-side, so pass it through
        # extra_body instead of as a direct keyword argument.
        "extra_body": {"temperature": temperature},
    }
    if system:
        params["system"] = system
    response = client.messages.create(**params)
    return response.content[0].text

prompt = "Write a one-sentence movie idea."

for temp in (0.0, 1.0):
    print(f"\n=== temperature = {temp} ===")
    for i in range(3):
        messages = []
        add_user_message(messages, prompt)
        print(f"Run {i + 1}:", chat(messages, temperature=temp))
