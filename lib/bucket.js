const cmp = require('correct-compare')
const unif = require('secure-random-uniform')

module.exports = bucket
function bucket (balance) {
  if (balance === 1) return [1]

  var N = Math.cbrt(balance)|0
  N += unif((N / 10)|0 + 1)

  const cuts = [0, balance]

  for (var i = 0; i < N;) {
    const c = unif(balance)
    if (cuts.includes(c)) continue
    cuts.push(c)
    i++
  }

  cuts.sort(cmp)

  const buckets = new Array(cuts.length - 1)
  for (var i = 0; i < buckets.length; i++) {
    buckets[i] = cuts[i + 1] - cuts[i]
  }

  return buckets
}
