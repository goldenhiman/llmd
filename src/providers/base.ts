import type { LLMProvider, GeneratedCommand, VerificationResult, ShellContext, ProviderConfig, ProviderName } from '../types.js';
import { getSystemPrompt, getVerificationPrompt } from '../utils/prompts.js';

export abstract class BaseLLMProvider implements LLMProvider {
  abstract name: ProviderName;
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  abstract chat(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<string>;

  async generateCommand(query: string, context: ShellContext): Promise<GeneratedCommand> {
    const systemPrompt = getSystemPrompt(context);
    
    const response = await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query }
    ]);

    // Use robust extraction that handles various response formats
    const result = this.extractCommand(response);
    
    if (!result.command) {
      throw new Error('Failed to extract a valid command from the response');
    }
    
    return result;
  }

  async verifyCommand(command: string, query: string, context: ShellContext): Promise<VerificationResult> {
    const verificationPrompt = getVerificationPrompt(command, query, context);
    
    const response = await this.chat([
      { role: 'system', content: 'You are a shell command verification expert. Respond STRICTLY in valid JSON format only. Do not include any text before or after the JSON object. The response must be parseable JSON.' },
      { role: 'user', content: verificationPrompt }
    ]);

    try {
      const parsed = this.parseJSON(response);
      return {
        confidence: Math.min(100, Math.max(0, Number(parsed.confidence) || 50)),
        isCorrect: Boolean(parsed.isCorrect ?? true),
        issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [],
        suggestedQuestions: Array.isArray(parsed.suggestedQuestions) ? parsed.suggestedQuestions.map(String) : []
      };
    } catch {
      // Default to moderate confidence if parsing fails
      return {
        confidence: 60,
        isCorrect: true,
        issues: ['Could not fully verify command'],
        suggestedQuestions: []
      };
    }
  }

  protected parseJSON(text: string): Record<string, unknown> {
    // Clean up the text first
    let cleanText = text.trim();
    
    // Remove markdown code blocks wrapper
    const codeBlockMatch = cleanText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      cleanText = codeBlockMatch[1].trim();
    }
    
    // Try to find and parse JSON object
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[0];
      const parsed = JSON.parse(jsonStr);
      return parsed;
    }
    
    throw new Error('No valid JSON found in response');
  }

  /**
   * Extracts just the command from any response format.
   * Handles JSON strings, markdown, and raw commands.
   */
  protected extractCommand(response: string): { command: string; explanation: string } {
    const trimmed = response.trim();
    
    // First, try to parse as JSON and extract the command field
    try {
      const parsed = this.parseJSON(trimmed);
      if (parsed.command && typeof parsed.command === 'string') {
        return {
          command: this.sanitizeCommand(parsed.command),
          explanation: String(parsed.explanation || '')
        };
      }
    } catch {
      // JSON parsing failed, try other extraction methods
    }

    // Check if response looks like a JSON object with command field - extract it manually
    const commandMatch = trimmed.match(/"command"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (commandMatch) {
      // Unescape JSON string
      const rawCommand = commandMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
      
      const explanationMatch = trimmed.match(/"explanation"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const explanation = explanationMatch 
        ? explanationMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
        : '';
      
      return {
        command: this.sanitizeCommand(rawCommand),
        explanation
      };
    }

    // Fallback: treat the whole response as a command after sanitization
    return {
      command: this.sanitizeCommand(trimmed),
      explanation: 'Generated command'
    };
  }

  /**
   * Sanitizes a command string to ensure it's in a valid, executable format.
   * Removes markdown formatting, shell prefixes, and extra whitespace.
   */
  protected sanitizeCommand(command: string): string {
    if (!command) {
      return '';
    }

    let sanitized = command.trim();

    // If the command still looks like JSON, try to extract the command field
    if (sanitized.startsWith('{') && sanitized.includes('"command"')) {
      const match = sanitized.match(/"command"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (match) {
        sanitized = match[1]
          .replace(/\\n/g, ' ')
          .replace(/\\t/g, ' ')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
      }
    }

    // Remove markdown code blocks (```bash, ```sh, ```, etc.)
    sanitized = sanitized.replace(/```[\w]*\s*/g, '');
    sanitized = sanitized.replace(/```/g, '');

    // Remove shell prompt prefixes ($, #, >, etc.) at the start of lines
    sanitized = sanitized.replace(/^[$#>]\s*/gm, '');

    // Remove any remaining backticks
    sanitized = sanitized.replace(/`/g, '');

    // Normalize whitespace - replace newlines and multiple spaces with single space
    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    return sanitized;
  }
}

