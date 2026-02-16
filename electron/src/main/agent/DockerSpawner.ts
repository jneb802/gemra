import { spawn, ChildProcess } from 'child_process'
import { Logger } from '../../shared/utils/logger'

/**
 * Options for spawning a process in Docker
 */
export interface DockerSpawnOptions {
  /** Docker image name (e.g., 'gemra-claude:latest') */
  imageName: string
  /** Host working directory to mount as /workspace */
  workingDir: string
  /** Path to Claude CLI on host (will be mounted in container) */
  cliPath: string
  /** Environment variables to pass to container */
  env?: Record<string, string>
  /** Additional Docker run flags */
  additionalFlags?: string[]
}

/**
 * Options passed from Claude Agent SDK
 */
export interface SDKSpawnOptions {
  /** Command to execute (e.g., 'node') */
  command: string
  /** Arguments to pass to command */
  args: string[]
  /** Working directory */
  cwd?: string
  /** Environment variables */
  env: Record<string, string | undefined>
  /** Abort signal for cancellation */
  signal: AbortSignal
}

/**
 * Spawns the Claude CLI process inside a Docker container
 *
 * This function wraps the normal CLI spawn in a docker run command,
 * mounting the working directory and CLI executable into the container.
 *
 * The returned ChildProcess satisfies the SDK's SpawnedProcess interface.
 */
export function spawnDockerProcess(
  sdkOptions: SDKSpawnOptions,
  dockerOptions: DockerSpawnOptions
): ChildProcess {
  const logger = new Logger('DockerSpawner')

  // Build docker run command
  const dockerArgs: string[] = [
    'run',
    '-i', // Interactive (stdin)
    '--rm', // Auto-remove container on exit

    // Mount working directory
    '-v', `${dockerOptions.workingDir}:/workspace`,
    '-w', '/workspace',

    // Mount CLI executable (read-only)
    '-v', `${dockerOptions.cliPath}:/cli.js:ro`,

    // Network access (host mode for simplicity)
    '--network', 'host',

    // Add host.docker.internal for LiteLLM and other host services
    '--add-host', 'host.docker.internal:host-gateway',
  ]

  // Add environment variables
  const envVars = { ...sdkOptions.env, ...dockerOptions.env }
  for (const [key, value] of Object.entries(envVars)) {
    if (value !== undefined && value !== '') {
      dockerArgs.push('-e', `${key}=${value}`)
    }
  }

  // Add any additional Docker flags
  if (dockerOptions.additionalFlags) {
    dockerArgs.push(...dockerOptions.additionalFlags)
  }

  // Add image name
  dockerArgs.push(dockerOptions.imageName)

  // Add command and arguments
  dockerArgs.push(sdkOptions.command) // 'node'
  dockerArgs.push('/cli.js') // CLI path inside container
  dockerArgs.push(...sdkOptions.args) // SDK arguments

  logger.log('Spawning Docker container:', 'docker', dockerArgs.slice(0, 10).join(' '), '...')

  // Spawn Docker process
  const dockerProcess = spawn('docker', dockerArgs, {
    stdio: ['pipe', 'pipe', 'inherit'], // stdin/stdout piped, stderr to console
    signal: sdkOptions.signal,
  })

  // Log process lifecycle
  dockerProcess.on('spawn', () => {
    logger.log('Docker container spawned successfully')
  })

  dockerProcess.on('error', (error) => {
    logger.error('Docker process error:', error)
  })

  dockerProcess.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      logger.error(`Docker container exited with code ${code}`)
    } else if (signal) {
      logger.log(`Docker container killed with signal ${signal}`)
    } else {
      logger.log('Docker container exited normally')
    }
  })

  return dockerProcess
}

/**
 * Check if Docker is installed
 */
async function checkDockerInstalled(): Promise<{ installed: boolean; error?: string }> {
  return new Promise((resolve) => {
    const checkProcess = spawn('docker', ['--version'], { stdio: 'ignore' })

    checkProcess.on('error', (error) => {
      resolve({
        installed: false,
        error: 'Docker not installed. Please install Docker Desktop or OrbStack.',
      })
    })

    checkProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ installed: true })
      } else {
        resolve({
          installed: false,
          error: 'Docker command failed.',
        })
      }
    })
  })
}

/**
 * Check if Docker daemon is running
 */
async function checkDockerDaemonRunning(): Promise<{ running: boolean; error?: string }> {
  return new Promise((resolve) => {
    const checkProcess = spawn('docker', ['info'], { stdio: 'pipe' })

    let stderr = ''

    checkProcess.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    checkProcess.on('error', (error) => {
      resolve({
        running: false,
        error: 'Docker daemon is not running.',
      })
    })

    checkProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ running: true })
      } else {
        // Parse error message to provide better guidance
        let errorMessage = 'Docker daemon is not running.'

        if (stderr.includes('Cannot connect to the Docker daemon')) {
          if (stderr.includes('orbstack')) {
            errorMessage = 'OrbStack is not running. Please start OrbStack from your Applications folder.'
          } else if (stderr.includes('docker.sock')) {
            errorMessage = 'Docker Desktop is not running. Please start Docker Desktop from your Applications folder.'
          } else {
            errorMessage = 'Docker daemon is not running. Please start Docker Desktop or OrbStack.'
          }
        }

        resolve({
          running: false,
          error: errorMessage,
        })
      }
    })
  })
}

/**
 * Check if Docker is available and running on the system
 */
export async function checkDockerAvailable(): Promise<{ available: boolean; error?: string }> {
  // First check if Docker is installed
  const installed = await checkDockerInstalled()
  if (!installed.installed) {
    return { available: false, error: installed.error }
  }

  // Then check if daemon is running
  const daemonRunning = await checkDockerDaemonRunning()
  if (!daemonRunning.running) {
    return { available: false, error: daemonRunning.error }
  }

  return { available: true }
}
