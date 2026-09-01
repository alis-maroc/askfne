#!/bin/bash
# Test the chat API directly
curl -sS -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"كيف يتم تأسيس وتنظيم المكاتب الجهوية والإقليمية","conversationId":"test-fix"}' \
  2>&1 | head -100
