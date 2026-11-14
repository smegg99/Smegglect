// playground/fixtures/dense.ts
import * as smegglect from 'smegglect'

const grid = document.getElementById('grid')!
const frag = document.createDocumentFragment()
for (let i = 0; i < 3000; i++) {
  const cell = document.createElement('div')
  cell.className = 'cell'
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = `Item ${i}`
  cell.append(b)
  frag.append(cell)
}
grid.append(frag)
;(window as unknown as { smegglect: typeof smegglect }).smegglect = smegglect
