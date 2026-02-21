/**
 * Process management utilities to prevent memory leaks and hanging processes
 */

import { spawn, ChildProcess, SpawnOptions } from 'child_process';
import { EventEmitter } from 'events';

/**
 * Track running processes to prevent leaks
 */
class ProcessManager extends EventEmitter {
  private processes = new Map<string, ChildProcess>();
  private timeouts = new Map<string, NodeJS.Timeout>();

  /**
   * Spawn a managed process with automatic cleanup
   */
  spawn(
    command: string,
    args: string[] = [],
    options: SpawnOptions & { 
      timeoutMs?: number,
      id?: string 
    } = {}
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    const { timeoutMs = 300000, id = `${Date.now()}-${Math.random()}`, ...spawnOptions } = options;

    return new Promise((resolve, reject) => {
      console.info(`Starting process ${id}: ${command} ${args.join(' ')}`);

      const process = spawn(command, args, {
        stdio: 'pipe',
        ...spawnOptions
      });

      // Track the process
      this.processes.set(id, process);

      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('error', (error) => {
        this.cleanup(id);
        reject(new Error(`Process failed to start: ${error.message}`));
      });

      process.on('exit', (code, signal) => {
        this.cleanup(id);
        
        if (signal) {
          reject(new Error(`Process killed with signal: ${signal}`));
        } else {
          console.info(`Process ${id} completed with code ${code}`);
          resolve({ stdout, stderr, code: code || 0 });
        }
      });

      // Set timeout
      const timeout = setTimeout(() => {
        console.warn(`Process ${id} timed out after ${timeoutMs}ms, killing...`);
        this.kill(id, 'SIGKILL');
        reject(new Error(`Process timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.timeouts.set(id, timeout);
    });
  }

  /**
   * Kill a specific process
   */
  kill(id: string, signal: NodeJS.Signals = 'SIGTERM'): boolean {
    const process = this.processes.get(id);
    if (!process) return false;

    console.info(`Killing process ${id} with signal ${signal}`);
    return process.kill(signal);
  }

  /**
   * Get information about running processes
   */
  getRunningProcesses(): Array<{ id: string; pid?: number; command: string }> {
    const running: Array<{ id: string; pid?: number; command: string }> = [];
    
    this.processes.forEach((process, id) => {
      if (!process.killed) {
        running.push({
          id,
          pid: process.pid,
          command: process.spawnargs.join(' ')
        });
      }
    });
    
    return running;
  }

  /**
   * Kill all running processes
   */
  killAll(signal: NodeJS.Signals = 'SIGTERM'): void {
    console.info(`Killing all processes with signal ${signal}`);
    
    this.processes.forEach((process, id) => {
      if (!process.killed) {
        this.kill(id, signal);
      }
    });
  }

  /**
   * Clean up process tracking
   */
  private cleanup(id: string): void {
    this.processes.delete(id);
    
    const timeout = this.timeouts.get(id);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(id);
    }
  }

  /**
   * Force cleanup of stale processes
   */
  forceCleanup(): void {
    const staleIds: string[] = [];
    
    this.processes.forEach((process, id) => {
      if (process.killed || process.exitCode !== null) {
        staleIds.push(id);
      }
    });
    
    staleIds.forEach(id => this.cleanup(id));
  }
}

// Global process manager instance
export const processManager = new ProcessManager();

/**
 * Graceful shutdown handler
 */
process.on('SIGTERM', () => {
  console.info('Received SIGTERM, cleaning up processes...');
  processManager.killAll('SIGTERM');
  setTimeout(() => {
    processManager.killAll('SIGKILL');
    process.exit(0);
  }, 5000);
});

process.on('SIGINT', () => {
  console.info('Received SIGINT, cleaning up processes...');
  processManager.killAll('SIGTERM');
  setTimeout(() => {
    processManager.killAll('SIGKILL');
    process.exit(0);
  }, 5000);
});

// Periodic cleanup of stale processes
setInterval(() => {
  processManager.forceCleanup();
}, 30000);

/**
 * Convenience wrapper for FFmpeg processes
 */
export async function runFFmpeg(
  args: string[],
  options: { 
    timeoutMs?: number,
    cwd?: string,
    id?: string 
  } = {}
): Promise<{ stdout: string; stderr: string; code: number }> {
  const { timeoutMs = 300000, cwd, id } = options;
  
  return processManager.spawn('ffmpeg', args, {
    timeoutMs,
    cwd,
    id: id || `ffmpeg-${Date.now()}`
  });
}

/**
 * Convenience wrapper for FFprobe processes
 */
export async function runFFprobe(
  args: string[],
  options: { 
    timeoutMs?: number,
    cwd?: string,
    id?: string 
  } = {}
): Promise<{ stdout: string; stderr: string; code: number }> {
  const { timeoutMs = 60000, cwd, id } = options;
  
  return processManager.spawn('ffprobe', args, {
    timeoutMs,
    cwd,
    id: id || `ffprobe-${Date.now()}`
  });
}