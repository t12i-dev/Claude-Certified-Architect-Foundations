# Claude Certified Architect – Foundations (CCAR-F) Prep

Hands-on exercises and notes while preparing for Anthropic's [Claude Certified Architect – Foundations](https://anthropic-partners.skilljar.com/claude-certified-architect-foundations-certification) certification.

## Courses

- [x] [Building with the Claude API](https://academy.claude.com/courses/building-with-the-claude-api) — `building-with-the-claude-api/`
- [ ] Claude Code in Action — `claude-code-in-action/`
- [ ] Introduction to Model Context Protocol — `intro-to-mcp/`

## Structure

Each course gets its own folder. Inside, scripts are numbered in the order the lessons introduce them, prefixed with the lesson topic:

```
building-with-the-claude-api/
├── venv/                          # not committed
├── .env                           # not committed — holds ANTHROPIC_API_KEY
├── .gitignore
├── 01_making_a_request.py
├── 02_multi_turn_conversations.py
├── 03_system_prompts.py
└── ...
```

## Setup

Each course folder has its own virtual environment.

```bash
cd building-with-the-claude-api
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file in the same folder (never committed):

```
ANTHROPIC_API_KEY=sk-ant-...
```

Run any exercise:

```bash
python 01_making_a_request.py
```

## Notes

Quick takeaways from each lesson go in `NOTES.md` inside the relevant course folder — mainly things that aren't obvious from the course video alone (edge cases, gotchas, how a concept maps to the exam guide's task statements).

## Exam reference

- [Exam Guide (PDF)](https://anthropic-partners.skilljar.com/claude-certified-architect-foundations-certification)
- Domains: Agentic Architecture & Orchestration · Claude Code Config & Workflows · Prompt Engineering & Structured Output · Tool Design & MCP · Context Management & Reliability
