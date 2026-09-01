<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Conversation Routing Integrity

- Diagnose channel failures at the state-machine and data-contract level. Do not patch only the user-reported example when the same routing path can affect other questions.
- A free-form user question must clear stale menu, guided-question, office-clarification, and pending-ticket state before knowledge retrieval or AI generation.
- Never let a previous menu selection, office lookup, or ticket confirmation constrain or redirect an unrelated global question.
- For official contacts and structured organizational data, return verified records only; ambiguity must request clarification and must never expose a guessed contact.
