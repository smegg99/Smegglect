// fixtures/wails/frontend/src/smegglect.ts
// Desktop-only mount options; imported by the Smegglect plugin only in dev and debug builds.
import { bindingSave } from 'smegglect/wails'
import { Save } from '../bindings/smegglect/fixtures/wails/services/exportservice'

export default () => ({ save: bindingSave((name, data) => Save(name, data)) })
