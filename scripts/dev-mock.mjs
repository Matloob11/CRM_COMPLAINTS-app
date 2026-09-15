/** Starts the dev server with the in-browser mock backend enabled, portably. */
import { spawn } from 'node:child_process'

const child = spawn('npx', ['vite', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, VITE_MOCK: '1' },
})
child.on('exit', (code) => process.exit(code ?? 0))
