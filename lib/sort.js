var cmp = require('correct-compare')
module.exports = sort

function sort (a, b) {
  if (a.type !== b.type) return cmp(a.type, b.type)
  if (a.type === 'key') return cmp(a.key, b.key)
  return a.index - b.index
}
