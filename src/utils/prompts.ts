import type { ShellContext } from '../types.js';
import { toolsConfigManager } from '../config/tools.js';
import { sessionManager } from '../services/session.js';

export function getSystemPrompt(context: ShellContext, includeHistory: boolean = true): string {
  // Get available tools if scanned
  const tools = toolsConfigManager.getAvailableTools();
  let toolsSection = '';
  
  if (tools.length > 0) {
    // Group by category for a concise prompt
    const byCategory: Record<string, string[]> = {};
    for (const tool of tools) {
      const cat = tool.description || 'Other';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(tool.name);
    }
    
    const toolLines = Object.entries(byCategory)
      .map(([cat, names]) => `  ${cat}: ${names.join(', ')}`)
      .join('\n');
    
    toolsSection = `\nAvailable CLI tools on this system:\n${toolLines}\n\nPrefer using these available tools in your commands.`;
  }

  // Get session context if available
  const historyContext = includeHistory ? sessionManager.getContextSummary(3) : '';

  return `You are a shell command generator. Convert the user's natural language request into a shell command.
${historyContext}
Environment:
- OS: ${context.os}
- Shell: ${context.shell}
- CWD: ${context.cwd}
${toolsSection}
IMPORTANT: The "command" value must be a RAW, EXECUTABLE shell command. Do NOT include:
- Backticks or markdown formatting
- $ or # prefixes
- Comments
- Line breaks (use ; or && for multiple commands)

If the user asks a conversational question that doesn't require a shell command (like "who are you", "what can you do", "hello"), respond with an echo command that provides the answer. For example:
- "who are you" -> echo "I am llmd, a shell command generator that translates natural language into shell commands."
- "hello" -> echo "Hello! I can help you generate shell commands. Just describe what you want to do."

Respond with ONLY this JSON (no other text):
{"command": "<executable command here>", "explanation": "<brief description>"}`;
}

export function getVerificationPrompt(command: string, query: string, context: ShellContext): string {
  return `You are a shell command verification expert. Analyze if the following command correctly fulfills the user's request.

User's request: "${query}"
Generated command: ${command}

Current environment:
- Operating System: ${context.os}
- Shell: ${context.shell}
- Current Directory: ${context.cwd}

CRITICAL: Verify the command format is valid:
1. Is it a single, executable shell command?
2. Does it contain NO markdown formatting, backticks, or $ prefixes?
3. Is it syntactically correct for ${context.shell} on ${context.os}?
4. Can it be executed directly without modification?

Analyze the command and respond STRICTLY in valid JSON format with NO additional text:
{
  "confidence": <0-100 integer representing how confident you are the command is correct>,
  "isCorrect": <true if the command fulfills the request AND is in valid format, false otherwise>,
  "issues": ["list of any issues or concerns with the command, including format issues"],
  "suggestedQuestions": ["questions to ask the user if clarification is needed"]
}

Consider:
1. Does the command match the user's intent?
2. Is the command syntactically correct?
3. Is the command in the correct format (no markdown, no extra formatting)?
4. Are there any missing flags or options?
5. Could the command cause unintended side effects?`;
}

export const PROVIDER_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
  groq: ['openai/gpt-oss-120b', 'moonshotai/kimi-k2-instruct-0905', 'llama-3.3-70b-versatile'],
  gemini: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  openrouter: ['anthropic/claude-sonnet-4-20250514', 'openai/gpt-4o', 'google/gemini-2.0-flash-exp']
};

