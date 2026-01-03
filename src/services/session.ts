import Conf from 'conf';
import type { GeneratedCommand, VerificationResult } from '../types.js';

interface CommandHistory {
  query: string;
  command: string;
  explanation: string;
  confidence: number;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  timestamp: number;
  cwd: string;
}

interface Session {
  sessionId: string;
  terminalId: string;
  startTime: number;
  lastActivity: number;
  history: CommandHistory[];
  currentCwd: string;
}

class SessionManager {
  private config: Conf<{ sessions: Record<string, Session> }>;
  private currentSessionId: string | null = null;
  private readonly SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours
  private terminalId: string;

  constructor() {
    this.config = new Conf({
      projectName: 'llmd-sessions',
      defaults: { sessions: {} }
    });
    
    // Generate terminal ID based on environment
    this.terminalId = this.getTerminalId();
    
    // Clean up expired sessions on startup
    this.cleanupExpiredSessions();
    
    // Try to find or create session for current terminal
    this.initializeSession();
  }

  private getTerminalId(): string {
    // Use a combination of factors to identify the terminal session
    // TTY device is unique per terminal on Unix systems
    const tty = process.stdout.isTTY ? (process.stdout as any).fd : 'notty';
    
    // Use parent PID (shell process) as a more stable identifier
    const ppid = process.ppid || process.pid;
    
    // Combine with session leader if available (Unix)
    const setsid = process.env.TERM_SESSION_ID || 
                   process.env.WINDOWID ||
                   process.env.TERM_PROGRAM_VERSION ||
                   '';
    
    return `term_${ppid}_${tty}_${setsid}`.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  private initializeSession(): void {
    const sessions = this.config.get('sessions', {});
    
    // Find existing session for this terminal
    const existingSession = Object.values(sessions).find(
      s => s.terminalId === this.terminalId && 
           Date.now() - s.lastActivity < this.SESSION_TIMEOUT
    );

    if (existingSession) {
      this.currentSessionId = existingSession.sessionId;
      // Update last activity
      existingSession.lastActivity = Date.now();
      existingSession.currentCwd = process.cwd();
      sessions[existingSession.sessionId] = existingSession;
      this.config.set('sessions', sessions);
    } else {
      // Create new session
      this.startSession(process.cwd());
    }
  }

  getCurrentSession(): Session | null {
    if (!this.currentSessionId) {
      this.initializeSession();
    }

    const sessions = this.config.get('sessions', {});
    const session = this.currentSessionId ? sessions[this.currentSessionId] : null;

    if (!session) {
      this.currentSessionId = null;
      this.initializeSession();
      return this.currentSessionId ? sessions[this.currentSessionId] : null;
    }

    // Check if session expired
    if (Date.now() - session.lastActivity > this.SESSION_TIMEOUT) {
      this.endSession();
      this.initializeSession();
      const updatedSessions = this.config.get('sessions', {});
      return this.currentSessionId ? updatedSessions[this.currentSessionId] : null;
    }

    return session;
  }

  startSession(cwd: string): Session {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const session: Session = {
      sessionId,
      terminalId: this.terminalId,
      startTime: Date.now(),
      lastActivity: Date.now(),
      history: [],
      currentCwd: cwd
    };

    this.currentSessionId = sessionId;
    const sessions = this.config.get('sessions', {});
    sessions[sessionId] = session;
    this.config.set('sessions', sessions);

    return session;
  }

  addCommand(
    query: string,
    generated: GeneratedCommand,
    verification: VerificationResult,
    executionResult?: { exitCode: number; stdout?: string; stderr?: string },
    cwd?: string
  ): void {
    const session = this.getCurrentSession();
    if (!session) return;

    // Limit stdout/stderr size to avoid bloating storage
    const maxOutputSize = 500;
    const truncate = (str?: string) => {
      if (!str) return undefined;
      return str.length > maxOutputSize 
        ? str.substring(0, maxOutputSize) + '...(truncated)' 
        : str;
    };

    session.history.push({
      query,
      command: generated.command,
      explanation: generated.explanation,
      confidence: verification.confidence,
      exitCode: executionResult?.exitCode,
      stdout: truncate(executionResult?.stdout),
      stderr: truncate(executionResult?.stderr),
      timestamp: Date.now(),
      cwd: cwd || process.cwd()
    });

    // Limit history size
    if (session.history.length > 20) {
      session.history = session.history.slice(-20);
    }

    session.lastActivity = Date.now();
    session.currentCwd = cwd || process.cwd();

    const sessions = this.config.get('sessions', {});
    sessions[session.sessionId] = session;
    this.config.set('sessions', sessions);
  }

  getContextSummary(maxHistory: number = 5): string {
    const session = this.getCurrentSession();
    if (!session || session.history.length === 0) {
      return '';
    }

    const recentHistory = session.history.slice(-maxHistory);
    const contextLines = recentHistory.map((h, idx) => {
      const status = h.exitCode === undefined ? '' : (h.exitCode === 0 ? '✓' : '✗');
      const result = h.exitCode !== undefined 
        ? `Result: ${status} (exit code: ${h.exitCode})`
        : 'Not executed';
      return `${idx + 1}. Query: "${h.query}"\n   Command: ${h.command}\n   ${result}`;
    });

    return `\nPrevious commands in this session:\n${contextLines.join('\n\n')}\n`;
  }

  getHistory(): CommandHistory[] {
    const session = this.getCurrentSession();
    return session?.history || [];
  }

  endSession(): void {
    if (this.currentSessionId) {
      const sessions = this.config.get('sessions', {});
      delete sessions[this.currentSessionId];
      this.config.set('sessions', sessions);
      this.currentSessionId = null;
    }
  }

  cleanupExpiredSessions(): void {
    const sessions = this.config.get('sessions', {});
    const now = Date.now();
    const active: Record<string, Session> = {};

    for (const [id, session] of Object.entries(sessions)) {
      if (now - session.lastActivity <= this.SESSION_TIMEOUT) {
        active[id] = session;
      }
    }

    this.config.set('sessions', active);
  }

  clearAllSessions(): void {
    this.config.set('sessions', {});
    this.currentSessionId = null;
  }
}

export const sessionManager = new SessionManager();

