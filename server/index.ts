import { resolve } from 'node:path'
import { createLocalServer } from './http'

const configuredPort = process.env.VESLUMA_PORT ?? '4317'
if (!/^\d+$/.test(configuredPort) || Number(configuredPort) < 1 || Number(configuredPort) > 65535) {
  console.error('VESLUMA_PORT must be an integer from 1 to 65535.')
  process.exitCode = 1
} else {
  let local: ReturnType<typeof createLocalServer> | undefined
  try {
    local = createLocalServer({
      dbPath: resolve(process.env.VESLUMA_DB_PATH || '.local-data/vesluma.sqlite'),
      distDir: resolve('dist'),
      port: Number(configuredPort),
    })
    const started = await local.start()
    console.log(`Vesluma local validation: ${started.url}`)
    console.log('SQLite is persistent. Local spaces are test identities, not production authentication.')
    const stop = () => { void local?.close().then(() => { process.exitCode = 0 }).catch(() => { process.exitCode = 1 }) }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
  } catch {
    await local?.close().catch(() => {})
    console.error('Could not start the local server. Check the selected port, database access and schema compatibility.')
    process.exitCode = 1
  }
}
