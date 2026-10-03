# When you enable streaming, Claude sends back several types of events:
# - MessageStart - A new message is being sent
# - ContentBlockStart - Start of a new block containing text, tool use, or other content
# - ContentBlockDelta - Chunks of the actual generated text
# - ContentBlockStop - The current content block has been completed
# - MessageDelta - The current message is complete
# - MessageStop - End of information about the current message

from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()
client = Anthropic()
model = "claude-sonnet-4-5-20250929"


def add_user_message(messages, text):
    messages.append({"role": "user", "content": text})


def add_assistant_message(messages, content):
    messages.append({"role": "assistant", "content": content})
    
# --- 1. Raw events: see each event type as it arrives ---
messages = []
add_assistant_message(messages, "Write a 1 sentence description of a fake database")

print("=== Raw event stream ===")
raw_stream = client.messages.create(
    model=model,
    max_tokens=200,
    messages=messages,
    stream=True
)

for event in raw_stream:
    print(event.type) 

# --- 2. Simplified text streaming + get the final assembled message ---
print("\n=== Simplified text stream ===")
with client.messages.stream(
    model=model,
    max_tokens=200,
    messages=messages,
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)

    final_message = stream.get_final_message()

print("\n\n--- stop_reason:", final_message.stop_reason)
print("--- usage:", final_message.usage)

# final_message.content can still be appended like a normal response
add_assistant_message(messages, final_message.content)
print("\n--- messages array after appending ---")
for m in messages:
    print(m)