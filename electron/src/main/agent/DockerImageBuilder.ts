import { spawn } from 'child_process'
import { EventEmitter } from 'events'
import { Logger } from '../../shared/utils/logger'

/**
 * Manages Docker image building for Claude containers
 */
export class DockerImageBuilder extends EventEmitter {
  private logger = new Logger('DockerImageBuilder')

  /**
   * Check if a Docker image exists locally
   */
  async imageExists(tag: string): Promise<boolean> {
    return new Promise((resolve) => {
      const inspectProcess = spawn('docker', ['image', 'inspect', tag], {
        stdio: 'ignore',
      })

      inspectProcess.on('error', () => {
        resolve(false)
      })

      inspectProcess.on('close', (code) => {
        resolve(code === 0)
      })
    })
  }

  /**
   * Build a Docker image from a Dockerfile
   *
   * @param dockerfilePath - Path to Dockerfile (e.g., 'Dockerfile.claude')
   * @param tag - Image tag (e.g., 'gemra-claude:latest')
   * @param context - Build context directory
   *
   * Emits 'progress' events with build output
   */
  async buildImage(
    dockerfilePath: string,
    tag: string,
    context: string
  ): Promise<void> {
    this.logger.log(`Building Docker image: ${tag}`)

    return new Promise((resolve, reject) => {
      const buildProcess = spawn(
        'docker',
        ['build', '-t', tag, '-f', dockerfilePath, context],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      )

      // Forward build output
      buildProcess.stdout.on('data', (data) => {
        const output = data.toString()
        this.emit('progress', output)
        this.logger.log(output.trim())
      })

      buildProcess.stderr.on('data', (data) => {
        const output = data.toString()
        this.emit('progress', output)
        this.logger.log(output.trim())
      })

      buildProcess.on('error', (error) => {
        this.logger.error('Build process error:', error)
        reject(error)
      })

      buildProcess.on('close', (code) => {
        if (code === 0) {
          this.logger.log(`Image ${tag} built successfully`)
          resolve()
        } else {
          const error = new Error(`Docker build failed with exit code ${code}`)
          this.logger.error(error.message)
          reject(error)
        }
      })
    })
  }

  /**
   * Ensure an image exists, building it if necessary
   *
   * @returns true if image exists or was built, false if build failed
   */
  async ensureImage(
    tag: string,
    dockerfilePath: string,
    context: string
  ): Promise<{ success: boolean; error?: string; built?: boolean }> {
    try {
      // Check if image already exists
      const exists = await this.imageExists(tag)

      if (exists) {
        this.logger.log(`Image ${tag} already exists`)
        return { success: true, built: false }
      }

      // Build the image
      this.logger.log(`Image ${tag} not found, building...`)
      await this.buildImage(dockerfilePath, tag, context)

      return { success: true, built: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error('Failed to ensure image:', errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * List all local Docker images with a specific prefix
   */
  async listImages(prefix?: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const args = ['image', 'ls', '--format', '{{.Repository}}:{{.Tag}}']
      if (prefix) {
        args.push('--filter', `reference=${prefix}*`)
      }

      const listProcess = spawn('docker', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let output = ''

      listProcess.stdout.on('data', (data) => {
        output += data.toString()
      })

      listProcess.on('close', (code) => {
        if (code === 0) {
          const images = output
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
          resolve(images)
        } else {
          reject(new Error(`Failed to list images (exit code ${code})`))
        }
      })

      listProcess.on('error', reject)
    })
  }
}
