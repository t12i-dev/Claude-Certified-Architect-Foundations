from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()
client = Anthropic()
model = "claude-sonnet-4-5-20250929"


def add_user_message(messages, text):
    messages.append({"role": "user", "content": text})


def add_assistant_message(messages, text):
    messages.append({"role": "assistant", "content": text})


def chat(messages):
    response = client.messages.create(
        model=model,
        max_tokens=1000,
        messages=messages,
    )
    return response.content[0].text


messages = []

add_user_message(messages, "Define quantum computing in one sentence")
answer = chat(messages)
print("Turn 1:", answer)

add_assistant_message(messages, answer)
add_user_message(messages, "Write another sentence")
final_answer = chat(messages)
print("Turn 2:", final_answer)

print("\n--- Full messages array sent in turn 2 ---")
for m in messages:
    print(m)