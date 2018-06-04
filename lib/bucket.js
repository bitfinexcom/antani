const cmp = require('compare')
const unif = require('secure-random-uniform')

module.exports = bucket
function bucket (balance) {
  const sign = Math.sign(balance)
  balance = Math.abs(balance)
  if (balance <= 1) return [sign * balance]

  // N is the number of buckets, which is defined as the cube root of the
  // balance. This function does not plateau in the same manner as the log
  var N = Math.cbrt(balance)|0
  // Add a random number of extra buckets so:
  // N ~ U(⌊cbrt(balance)⌋, ⌊1.1*⌊cbrt(balance)⌋⌋)
  N += unif((N / 10)|0 + 1)

  // We then create N intervals by taking uniform samples from the range
  // [0, balance), which will be used as cut points of the total balance
  // We discard cuts that are already made to ensure that we do not have empty
  // intervals.

  // Include the endpoints of the original interval
  const cuts = [0, balance]

  for (var i = 0; i < N;) {
    const c = unif(balance)
    // Discard here to ensure unique cuts
    if (cuts.includes(c)) continue
    cuts.push(c)
    i++
  }

  // Sort the cuts so creating the intervals is a trivial loop
  cuts.sort(cmp)

  const buckets = new Array(cuts.length - 1)
  for (var i = 0; i < buckets.length; i++) {
    buckets[i] = cuts[i + 1] - cuts[i]
  }

  for (var i = 0; i < buckets.length; i++) {
    buckets[i] *= sign
  }

  // ∑buckets === balance
  return buckets
}
