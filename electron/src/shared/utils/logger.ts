/**
 * Logger utility for consistent logging with prefixes
 * Handles EPIPE errors gracefully in packaged apps without terminals
 */
export class Logger {
  constructor(private prefix: string) {}

  log(...args: any[]): void {
    try {
      console.log(`[${this.prefix}]`, ...args)
    } catch (error: any) {
      // Ignore EPIPE errors (broken pipe) in packaged apps
      if (error?.code !== 'EPIPE') throw error
    }
  }

  error(...args: any[]): void {
    try {
      console.error(`[${this.prefix}]`, ...args)
    } catch (error: any) {
      // Ignore EPIPE errors (broken pipe) in packaged apps
      if (error?.code !== 'EPIPE') throw error
    }
  }

  warn(...args: any[]): void {
    try {
      console.warn(`[${this.prefix}]`, ...args)
    } catch (error: any) {
      // Ignore EPIPE errors (broken pipe) in packaged apps
      if (error?.code !== 'EPIPE') throw error
    }
  }

  debug(...args: any[]): void {
    try {
      console.debug(`[${this.prefix}]`, ...args)
    } catch (error: any) {
      // Ignore EPIPE errors (broken pipe) in packaged apps
      if (error?.code !== 'EPIPE') throw error
    }
  }
}
