const test = require('tape')
const bucket = require('../lib/bucket')
const unif = require('secure-random-uniform')

test('bucketing sums to balance', function (assert) {
  for (var i = 0; i < 100000; i++) {
    const balance = unif(1000000) + 1
    const buckets = bucket(balance)
    const sum = buckets.reduce((s, b) => s + b, 0)
    if (buckets.some(b => b === 0)) assert.fail('Had empty bucket')
    if (balance !== sum) assert.fail('Did not sum to total balance')
  }

  assert.end()
})

test('small buckets', function (assert) {
  for (var i = 0; i < 100000; i++) {
    const balance = unif(10) + 1
    const buckets = bucket(balance)
    const sum = buckets.reduce((s, b) => s + b, 0)
    if (buckets.some(b => b === 0)) assert.fail('Had empty bucket')
    if (balance !== sum) assert.fail('Did not sum to total balance')
  }

  assert.end()
})
