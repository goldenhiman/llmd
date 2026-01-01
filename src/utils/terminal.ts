import os from 'node:os';
import { spawn } from 'node:child_process';
import type { ShellContext } from '../types.js';

export function getShellContext(): ShellContext {
  const shell = process.env.SHELL || (process.platform === 'win32' ? 'cmd.exe' : '/bin/sh');
  
  return {
    cwd: process.cwd(),
    shell: shell.split('/').pop() || shell,
    os: `${os.platform()} ${os.release()}`
  };
}

export function executeCommand(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const shell = process.platform === 'win32' ? 'cmd.exe' : process.env.SHELL || '/bin/sh';
    const shellArgs = process.platform === 'win32' ? ['/c', command] : ['-c', command];

    const child = spawn(shell, shellArgs, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['inherit', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
      process.stdout.write(data);
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
      process.stderr.write(data);
    });

    child.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 0
      });
    });

    child.on('error', (err) => {
      resolve({
        stdout,
        stderr: err.message,
        exitCode: 1
      });
    });
  });
}

