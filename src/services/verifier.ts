import { configManager } from '../config/manager.js';
import { llmService } from './llm.js';
import type { VerificationResult } from '../types.js';

export interface VerificationOutcome {
  passed: boolean;
  result: VerificationResult;
  needsClarification: boolean;
  isInformationalResponse: boolean;
  extractedMessage?: string;
}

export async function verifyCommand(command: string, query: string): Promise<VerificationOutcome> {
  const threshold = configManager.getConfidenceThreshold();
  
  const result = await llmService.verifyCommand(command, query);
  
  const passed = result.confidence >= threshold && result.isCorrect;
  const needsClarification = !passed && (result.suggestedQuestions?.length ?? 0) > 0;

  // Check if this is an informational response (echo command that's just a reply)
  const infoCheck = await checkIfInformationalResponse(command, query);

  return {
    passed,
    result,
    needsClarification,
    isInformationalResponse: infoCheck.isInformational,
    extractedMessage: infoCheck.message
  };
}

/**
 * Uses AI to check if a command is just an informational response
 * (e.g., echo "I am a shell command generator" in response to "who are you")
 */
async function checkIfInformationalResponse(command: string, query: string): Promise<{ isInformational: boolean; message?: string }> {
  // Quick regex pre-check to avoid unnecessary API calls
  const trimmed = command.trim();
  const looksLikeEcho = /^(echo|printf)\s+/.test(trimmed);
  
  if (!looksLikeEcho) {
    return { isInformational: false };
  }

  try {
    const result = await llmService.checkInformationalResponse(command, query);
    return result;
  } catch {
    // Fallback to simple regex extraction if AI check fails
    const echoMatch = trimmed.match(/^echo\s+["'](.+)["']\s*$/);
    if (echoMatch) {
      return { isInformational: true, message: echoMatch[1] };
    }
    return { isInformational: false };
  }
}

export function formatVerificationIssues(result: VerificationResult): string[] {
  const messages: string[] = [];

  if (result.issues && result.issues.length > 0) {
    messages.push(...result.issues.map(issue => `• ${issue}`));
  }

  return messages;
}

export function formatSuggestedQuestions(result: VerificationResult): string[] {
  if (!result.suggestedQuestions || result.suggestedQuestions.length === 0) {
    return [];
  }

  return result.suggestedQuestions.map((q, i) => `${i + 1}. ${q}`);
}

