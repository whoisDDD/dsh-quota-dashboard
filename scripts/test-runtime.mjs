// Exercise published DSH components, without contacting provider APIs or reading real keys.
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { Context } from '@deepseek-ai/cordis'
import { WebServer } from '@deepseek-ai/dsh-host-webserver'

const require = createRequire(import.meta.url)
const styles = []
function bundle(path) {
  let registration
  const sandbox = {
    console, window: { __ModuleLoader__: { load(r) { registration = r } } },
    document: {
      createElement() {
        const tag = { removed: false, remove() { this.removed = true } }
        styles.push(tag)
        return tag
      },
      head: { append() {} },
    },
  }
  vm.runInNewContext(readFileSync(path, 'utf8'), sandbox)
  return registration.factory(require)
}
const renderer = bundle(require.resolve('@deepseek-ai/dsh-client-ui-renderer/client'))
const dashboard = bundle(new URL('../client.js', import.meta.url))
const ctx = new Context()
try {
  await ctx.plugin(renderer.SlotRegistry)
  const slots = ctx.slots
  let plugin = ctx.plugin(dashboard)
  await plugin
  assert.equal(slots.entries('sidebar.footer.action').length, 0)
  const owner = {
    inject: ['slots'],
    apply(c) {
      c.slots.register({ name: 'root', children: {
        'sidebar.footer.action': { kind: 'list', scope: 'root' },
      } }, () => null)
    },
  }
  let sidebar = ctx.plugin(owner)
  await sidebar
  assert.equal(slots.entries('sidebar.footer.action').length, 1)
  await sidebar.dispose()
  assert.equal(slots.entries('sidebar.footer.action').length, 0)
  sidebar = ctx.plugin(owner)
  await sidebar
  assert.equal(slots.entries('sidebar.footer.action').length, 1)
  await plugin.dispose()
  assert.equal(slots.entries('sidebar.footer.action').length, 0)
  assert.ok(styles.at(-1).removed)
  plugin = ctx.plugin(dashboard)
  await plugin
  assert.equal(slots.entries('sidebar.footer.action').length, 1, 'same module can reactivate')
  const other = new Context()
  try {
    await other.plugin(renderer.SlotRegistry)
    await other.plugin(owner)
    await other.plugin(dashboard)
    assert.equal(other.slots.entries('sidebar.footer.action').length, 1, 'independent Cordis trees')
  } finally { await other.fiber.dispose() }
  console.log('✓ published DSH slots: delayed declaration, owner reload, plugin reload, independent contexts, cleanup')
} finally { await ctx.fiber.dispose() }

const home = mkdtempSync(join(tmpdir(), 'quota-runtime-'))
process.env.DSH_HOME = home
process.env.DSH_QUOTA_STATE_PATH = join(home, 'keys.json')
const host = await import('../index.js')
const hostCtx = new Context()
try {
  // Use the actual route registry without binding a port.
  const server = new WebServer(hostCtx, { host: '127.0.0.1', port: 0 })
  let plugin = hostCtx.plugin(host)
  await plugin
  const response = () => ({ writeHead(code) { this.code = code }, end(body) { this.body = body } })
  const route = server.exact.get('/dsh-quota-dashboard/config')
  assert.ok(route)
  const res = response()
  await route.handler({ method: 'GET' }, res)
  assert.equal(res.code, 200)
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(JSON.parse(res.body).version, pkg.version)
  assert.equal(server.exact.size, 4)
  await plugin.dispose()
  assert.equal(server.exact.size, 0)
  plugin = hostCtx.plugin(host)
  await plugin
  assert.equal(server.exact.size, 4)
  console.log('✓ published DSH WebServer: route registration, config response, unload and reload')
} finally {
  await hostCtx.fiber.dispose()
  rmSync(home, { recursive: true, force: true })
}

