import { build } from 'esbuild'
import { spawn } from 'node:child_process'

const test = process.argv.includes('--test')
const entries = test
  ? { 'server.test': 'server/server.test.ts' }
  : { server: 'server/index.ts', 'local-server': 'server/http.ts' }
await build({
  entryPoints: entries, outdir: '.local-build', outExtension: { '.js': '.mjs' },
  bundle: true, platform: 'node', format: 'esm', target: 'node24', logLevel: 'warning',
})
if (test) {
  const child = spawn(process.execPath, ['--test', '.local-build/server.test.mjs'], { stdio: 'inherit' })
  child.on('error', error => { console.error(error.message); process.exitCode = 1 })
  child.on('exit', code => { process.exitCode = code ?? 1 })
}
