const flat = require('flat-tree')
const through = require('through2')
const crypto = require('./crypto')

module.exports = createTreeStream

function createTreeStream () {
  const roots = []
  var buckets = 0

  return through.obj(write, flush)

  function flush (cb) {
    const root = {
      type: 'root',
      index: 2 * buckets,
      hash: null,
      balance: roots.map(node => node.balance).reduce((a, b) => a + b, 0)
    }

    root.hash = crypto.hashRoot(roots)
    cb(null, root)
  }

  function write (data, enc, cb) {
    const index = 2 * buckets++

    const bucket = {
      type: 'node',
      index,
      hash: null,
      balance: data.balance,
      key: data.key,
      signature: null
    }

    bucket.hash = crypto.hashBucket(bucket)
    bucket.signature = crypto.signBucket(data.secretKey, bucket)

    roots.push(bucket)

    var node = bucket
    this.push(node)

    this.push({
      type: 'key',
      index,
      key: data.key
    })

    while (roots.length > 1) {
      const left = roots[roots.length - 2]
      const right = roots[roots.length - 1]

      const leftParent = flat.parent(left.index)
      const rightParent = flat.parent(right.index)

      if (leftParent !== rightParent) break

      roots.pop()
      roots[roots.length - 1] = node = {
        type: 'node',
        index: leftParent,
        hash: crypto.hashParent(left, right),
        balance: left.balance + right.balance
      }

      this.push(node)
    }

    cb(null)
  }
}
