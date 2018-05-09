module.exports = sort

function sort (a, b) {
  if (a.type !== b.type) return a.type.localeCompare(b.type)
  if (a.type === 'bucket') return a.key.localeCompare(b.key)
  return a.index - b.index
}
