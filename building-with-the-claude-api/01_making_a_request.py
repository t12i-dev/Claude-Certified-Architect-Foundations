from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

client = Anthropic()

model = "claude-sonnet-4-5"

response = client.messages.create(
    model=model,
    max_tokens=1000,
    messages=[
        {
            "role": "user",
            "content": "What is quantum computing?"
        }
    ]
)

print(response.content[0].text)      # message
print(response.usage)        # input/output tokens
print(response.stop_reason)  # end_turn / max_tokens / tool_use