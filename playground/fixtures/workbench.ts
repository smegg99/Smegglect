// playground/fixtures/workbench.ts
import { mount } from 'smegglect'

const days = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const grid = document.getElementById('grid')!
for (let row = 0; row < 14; row++) {
  for (let col = 0; col < days.length; col++) {
    const cell = document.createElement('div')
    if (row === 0) cell.textContent = days[col]!
    else if (col === 0) cell.textContent = `${7 + row}:00`
    else if ((row * 7 + col) % 3 === 0) {
      cell.className = 'lesson'
      cell.textContent = ['Maths 2A', 'Physics', 'History of the region and its long names', 'English'][(row + col) % 4]!
    }
    grid.append(cell)
  }
}

const params = new URLSearchParams(location.search)
;(window as unknown as { sg: unknown }).sg = mount({ project: { id: 'workbench' }, open: params.has('open') })
