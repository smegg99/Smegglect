// fixtures/wails/frontend/src/smegglect.ts
// Desktop-only mount options; imported by the Smegglect plugin only in dev and debug builds.
// The window's origin (wails://) is not one the broker admits, so bridge calls go through the Go side.
import { bindingBridge, bindingSave } from 'smegglect/wails'
import { Bridge } from '../bindings/smegglect/fixtures/wails/services/bridgeservice'
import { Save } from '../bindings/smegglect/fixtures/wails/services/exportservice'

export default () => ({
  save: bindingSave((name, data) => Save(name, data)),
  bridge: { label: 'Desk', via: bindingBridge(request => Bridge(request)) },
})
