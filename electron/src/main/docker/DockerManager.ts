import { exec } from 'child_process'
import { promisify } from 'util'
import * as crypto from 'crypto'
import * as path from 'path'
import * as fs from 'fs/promises'

const execAsync = promisify(exec)

export interface DockerCheckResult {
  available: boolean
  error?: string
}

export interface BuildResult {
  success: boolean
  imageName?: string
  error?: string
}

export class DockerManager {
  private imageCache: Map<string, string> = new Map()

  /**
   * Check if Docker is installed and available
   */
  async isDockerAvailable(): Promise<DockerCheckResult> {
    try {
      await execAsync('docker --version')
      return { available: true }
    } catch (error) {
      return {
        available: false,
        error: 'Docker not found. Please install Docker Desktop and ensure it is running.',
      }
    }
  }

  /**
   * Check if a Docker image exists locally
   */
  async imageExists(imageName: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`docker image inspect ${imageName}`)
      return stdout.trim().length > 0
    } catch (error) {
      return false
    }
  }

  /**
   * Generate a deterministic image tag based on working directory
   */
  private generateImageTag(workingDir: string): string {
    const hash = crypto
      .createHash('md5')
      .update(workingDir)
      .digest('hex')
      .substring(0, 12)
    return `gemra-workspace-${hash}`
  }

  /**
   * Build Docker image from Dockerfile in working directory if needed
   * Returns the image tag to use
   */
  async buildImageIfNeeded(workingDir: string): Promise<BuildResult> {
    // Check cache first
    const cachedTag = this.imageCache.get(workingDir)
    if (cachedTag) {
      const exists = await this.imageExists(cachedTag)
      if (exists) {
        console.log(`[DockerManager] Using cached image: ${cachedTag}`)
        return { success: true, imageName: cachedTag }
      }
    }

    // Check if Dockerfile exists
    const dockerfilePath = path.join(workingDir, 'Dockerfile')
    try {
      await fs.access(dockerfilePath)
    } catch (error) {
      return {
        success: false,
        error: `Dockerfile not found in ${workingDir}. Please create a Dockerfile to use Docker mode.`,
      }
    }

    // Generate image tag
    const imageTag = this.generateImageTag(workingDir)

    // Check if image already exists (from previous session)
    const exists = await this.imageExists(imageTag)
    if (exists) {
      console.log(`[DockerManager] Image already exists: ${imageTag}`)
      this.imageCache.set(workingDir, imageTag)
      return { success: true, imageName: imageTag }
    }

    // Build the image
    console.log(`[DockerManager] Building Docker image: ${imageTag}`)
    console.log(`[DockerManager] Building from: ${dockerfilePath}`)

    try {
      const { stdout, stderr } = await execAsync(
        `docker build -t ${imageTag} "${workingDir}"`,
        {
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer for build output
        }
      )

      if (stdout) {
        console.log(`[DockerManager] Build output:\n${stdout}`)
      }
      if (stderr) {
        console.log(`[DockerManager] Build stderr:\n${stderr}`)
      }

      console.log(`[DockerManager] Successfully built image: ${imageTag}`)
      this.imageCache.set(workingDir, imageTag)
      return { success: true, imageName: imageTag }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      console.error(`[DockerManager] Build failed:`, errorMessage)
      return {
        success: false,
        error: `Docker build failed: ${errorMessage}`,
      }
    }
  }

  /**
   * Clean up unused Docker images (optional utility)
   */
  async cleanupImages(): Promise<void> {
    try {
      // Remove dangling images
      await execAsync('docker image prune -f')
      console.log('[DockerManager] Cleaned up dangling images')
    } catch (error) {
      console.error('[DockerManager] Cleanup failed:', error)
    }
  }
}
