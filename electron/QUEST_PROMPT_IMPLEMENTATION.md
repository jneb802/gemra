# Quest Prompt System Implementation

## Overview

This document describes the complete implementation of the quest prompt system for handling interactive questions from Claude Code agents. The system reuses the existing slash command menu UI pattern to present question options to users.

## Architecture

```
Agent sends question
       ↓
Main Process (IPC Event)
       ↓
Renderer receives 'claude:quest-prompt'
       ↓
useClaudeAgent creates quest message
       ↓
MessageItem renders QuestPrompt component
       ↓
User selects answer
       ↓
respondToQuest handler
       ↓
Main Process forwards response to agent
       ↓
Agent continues execution
```

## Implementation Details

### 1. Shared Types (`src/shared/types.ts`)

Added quest prompt data structures:

```typescript
export interface QuestOption {
  label: string
  value: string
  description?: string
}

export interface QuestPrompt {
  id: string
  question: string
  header: string // Short label for UI badge
  description?: string
  answerType: 'text' | 'select' | 'multiselect' | 'confirm'
  options?: QuestOption[]
  required?: boolean
  multiSelect?: boolean
}
```

Extended `ClaudeMessage` interface:

```typescript
export interface ClaudeMessage {
  // ... existing fields
  questPrompt?: QuestPrompt  // If this message is a question
  questResponse?: string | string[]  // User's answer
}
```

### 2. IPC Channels (`src/preload/index.ts`)

Added two new IPC methods:

**Invoke (Renderer → Main):**
- `respondToQuest(agentId, questId, response)` - Send user's answer to agent

**Listener (Main → Renderer):**
- `onQuestPrompt(callback)` - Receive quest prompt from agent

### 3. QuestPrompt Component (`src/renderer/components/claude/QuestPrompt.tsx`)

Reusable component for rendering interactive questions with four modes:

#### Text Input Mode
- Textarea for free-form text responses
- Cmd+Enter or Submit button to send
- Optional required field validation

#### Select Mode
- List of options using MenuItem component
- Keyboard navigation (↑↓ arrows, Enter to select)
- Single selection, submits immediately

#### Multiselect Mode
- Checkbox-style list with ☑/☐ indicators
- Space/Enter to toggle selections
- Submit button shows selection count

#### Confirm Mode
- Yes/No button pair
- Simple binary confirmation

**Key Features:**
- Auto-focus for keyboard interaction
- Loading state during submission
- Required field validation
- Consistent with slash command menu UI

### 4. MessageItem Integration (`src/renderer/components/claude/MessageItem.tsx`)

Extended message rendering to detect and display quest prompts:

```typescript
// Check if message is a quest prompt
const isQuestPrompt = !!message.questPrompt
const isQuestAnswered = !!message.questResponse

// Render quest prompt UI
{isQuestPrompt && message.questPrompt && !isQuestAnswered && onRespondToQuest && (
  <QuestPrompt
    questPrompt={message.questPrompt}
    onRespond={(response) => onRespondToQuest(message.id, response)}
    isLoading={false}
  />
)}

// Show answered response
{isQuestPrompt && isQuestAnswered && (
  <div className="quest-response">
    <div className="quest-response-label">Response:</div>
    <div className="quest-response-value">
      {Array.isArray(message.questResponse)
        ? message.questResponse.join(', ')
        : message.questResponse}
    </div>
  </div>
)}
```

### 5. useClaudeAgent Hook (`src/renderer/components/claude/hooks/useClaudeAgent.ts`)

Added quest prompt handling:

**IPC Listener:**
```typescript
const unlistenQuestPrompt = window.electron.claude.onQuestPrompt((data) => {
  if (data.agentId !== currentAgentIdRef.current) return

  // Create a message with the quest prompt
  addMessage(data.agentId, {
    id: data.questId,
    role: 'assistant',
    content: data.prompt.question || '',
    questPrompt: data.prompt,
    metadata: { isComplete: false },
    timestamp: Date.now()
  })
})
```

**Response Handler:**
```typescript
const handleQuestResponse = useCallback(
  async (questId: string, response: string | string[]) => {
    const activeAgentId = currentAgentIdRef.current
    if (!activeAgentId) return

    // Update message with response
    updateMessage(activeAgentId, questId, {
      questResponse: response,
      metadata: { isComplete: true }
    })

    // Send response to agent
    await window.electron.claude.respondToQuest(activeAgentId, questId, response)
  },
  [updateMessage, agentStatusActions]
)
```

**Exported API:**
```typescript
return {
  // ... existing
  respondToQuest: handleQuestResponse,
}
```

### 6. MessageList Passthrough (`src/renderer/components/claude/MessageList.tsx`)

Simple prop drilling to pass response handler:

```typescript
interface MessageListProps {
  // ... existing
  onRespondToQuest?: (questId: string, response: string | string[]) => void
}

const rowProps: MessageItemProps = {
  messages,
  currentTurnMetadata,
  onRespondToQuest,
}
```

### 7. ClaudeChat Integration (`src/renderer/components/claude/ClaudeChat.tsx`)

Connect quest handler to MessageList:

```typescript
<MessageList
  messages={messages}
  isStreaming={agent.agentStatus.type === 'streaming'}
  currentTurnMetadata={agent.currentTurnMetadata}
  onRespondToQuest={agent.respondToQuest}
/>
```

### 8. Main Process IPC Handler (`src/main/ipc/claude.ts`)

#### Event Forwarding
Added quest prompt event forwarding in `forwardAgentEvents`:

```typescript
agent.on('questPrompt', (data: { questId: string; prompt: any }) => {
  logger.log(`Agent ${agentId} quest prompt:`, data.questId)
  safeSend(mainWindow, 'claude:quest-prompt', {
    agentId,
    questId: data.questId,
    prompt: data.prompt
  })
})
```

#### Response Handler
Added IPC handler for quest responses:

```typescript
createIpcHandler('claude:respond-quest', async (
  agentId: string,
  questId: string,
  response: string | string[]
) => {
  logger.log(`Quest response for agent ${agentId}, quest ${questId}:`, response)

  const agent = getAgentOrThrow(agentId)

  // Format response for agent
  const formattedResponse = Array.isArray(response)
    ? `Selected: ${response.join(', ')}`
    : response

  await agent.sendPrompt(formattedResponse)

  return { success: true }
})
```

### 9. CSS Styling (`src/renderer/index.css`)

Added comprehensive styling for quest prompts:

**Key Classes:**
- `.quest-prompt` - Main container with focus outline
- `.quest-badge` - Header badge showing question type
- `.quest-question` - Primary question text
- `.quest-description` - Optional explanatory text
- `.quest-textarea` - Text input field
- `.quest-options-list` - Option list container
- `.quest-submit-btn` - Primary action button
- `.quest-buttons` - Confirm mode button row
- `.quest-response` - Display answered response

**Design Principles:**
- Consistent with existing slash command menu styling
- Clear visual hierarchy (badge → question → description → options)
- Keyboard-focused navigation hints
- Disabled states for buttons
- Blue left border on quest messages for visual distinction

## Usage Example

When the agent needs to ask a question, it emits a `questPrompt` event:

```typescript
// Agent SDK (conceptual - actual implementation may vary)
agent.emit('questPrompt', {
  questId: 'q-12345',
  prompt: {
    id: 'q-12345',
    question: 'Which authentication method should we use?',
    header: 'Auth Method',
    description: 'Choose the authentication approach for your API',
    answerType: 'select',
    options: [
      {
        label: 'OAuth 2.0',
        value: 'oauth',
        description: 'Industry standard, secure, supports third-party'
      },
      {
        label: 'JWT Tokens',
        value: 'jwt',
        description: 'Stateless, simple, good for microservices'
      },
      {
        label: 'Session Cookies',
        value: 'session',
        description: 'Simple, secure, traditional approach'
      }
    ]
  }
})
```

The UI will display:

```
┌────────────────────────────────────────┐
│ 🤖 Assistant                           │
├────────────────────────────────────────┤
│ [AUTH METHOD]                          │
│                                        │
│ Which authentication method should     │
│ we use?                                │
│                                        │
│ Choose the authentication approach     │
│ for your API                           │
│                                        │
│ ┌────────────────────────────────────┐ │
│ │ ✓ OAuth 2.0                        │ │
│ │   Industry standard, secure...     │ │
│ │                                    │ │
│ │   JWT Tokens                       │ │
│ │   Stateless, simple...             │ │
│ │                                    │ │
│ │   Session Cookies                  │ │
│ │   Simple, secure...                │ │
│ └────────────────────────────────────┘ │
│ ↑↓: navigate | Enter: select          │
└────────────────────────────────────────┘
```

After user selects "OAuth 2.0", the message updates to show:

```
┌────────────────────────────────────────┐
│ 🤖 Assistant                           │
├────────────────────────────────────────┤
│ [AUTH METHOD]                          │
│                                        │
│ Which authentication method should     │
│ we use?                                │
│                                        │
│ ┌────────────────────────────────────┐ │
│ │ Response:                          │ │
│ │ oauth                              │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

## Agent SDK Integration Notes

**Current Implementation:**
The quest response handler currently forwards the response as a regular message to the agent. This works for basic question/answer flows.

**Future Enhancement:**
If the Claude Agent SDK provides a dedicated method for quest responses (e.g., `agent.respondToQuestion(questId, response)`), update the handler in `src/main/ipc/claude.ts`:

```typescript
// Replace sendPrompt with dedicated method
await agent.respondToQuestion(questId, response)
```

**Event Listening:**
The main process needs to listen for `questPrompt` events from the agent. Ensure `ClaudeAgent` class emits this event when the agent asks a question.

## Testing Checklist

- [ ] Text input mode with required validation
- [ ] Select mode with keyboard navigation
- [ ] Multiselect mode with checkboxes
- [ ] Confirm mode with Yes/No buttons
- [ ] Response persists after submission
- [ ] Multiple quest prompts in same conversation
- [ ] Quest prompt during agent streaming
- [ ] Quest prompt styling matches slash commands
- [ ] Keyboard shortcuts work (arrows, Enter, Space)
- [ ] Loading state during submission
- [ ] Error handling for failed submissions

## Files Modified

1. `src/shared/types.ts` - Quest prompt type definitions
2. `src/preload/index.ts` - IPC channel exposures
3. `src/renderer/components/claude/QuestPrompt.tsx` - New component
4. `src/renderer/components/claude/MessageItem.tsx` - Quest rendering
5. `src/renderer/components/claude/MessageList.tsx` - Prop passthrough
6. `src/renderer/components/claude/ClaudeChat.tsx` - Handler connection
7. `src/renderer/components/claude/hooks/useClaudeAgent.ts` - Quest logic
8. `src/main/ipc/claude.ts` - IPC handlers
9. `src/renderer/index.css` - Quest styles

## Next Steps

1. **Test with Real Agent:** Once Claude Agent SDK supports quest prompts, test with actual agent questions
2. **Add Analytics:** Track quest prompt usage and response patterns
3. **Accessibility:** Add ARIA labels and keyboard shortcuts documentation
4. **Mobile Support:** If needed, optimize for mobile/tablet layouts
5. **Localization:** Add i18n support for quest prompt UI text
6. **Timeout Handling:** Add expiration for unanswered quest prompts
7. **History:** Allow users to view previous quest responses in session

## References

- Slash Command Menu: `src/renderer/components/claude/SlashCommandMenu.tsx`
- MenuItem Component: `src/renderer/components/common/MenuItem.tsx`
- Agent Status Hook: `src/renderer/components/claude/hooks/useAgentStatus.ts`
