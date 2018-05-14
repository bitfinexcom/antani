const flat = require('flat-tree')
const through = require('through2')
const crypto = require('./crypto')

module.exports = createTreeStream

function createTreeStream () {
  const roots = []
  var leaves = 0
  var decommitment = null
  var balance = 0
  var decommitments = through.obj()
  var s = through.obj(write, flush)
  s.decommitments = decommitments
  return s

  function flush (cb) {
    const root = {
      type: 'root',
      index: 2 * leaves,
      hash: null,
      commitment: crypto.sum(roots.map(node => node.commitment)),
      decommitment: decommitment,
      balance: balance
    }

    root.hash = crypto.hashRoot(roots)
    cb(null, root)
  }

  function write (data, enc, cb) {
    const index = 2 * leaves++

    var [commitment, leafDecommitment] = crypto.commit(data.balance)
    decommitments.push(leafDecommitment)

    const leaf = {
      type: 'node',
      index,
      hash: null,
      commitment: commitment,
      key: data.key
    }

    balance += data.balance

    decommitment = crypto.accDecommitments(decommitment, leafDecommitment)

    leaf.hash = crypto.hashBucket(leaf)

    roots.push(leaf)

    var node = leaf
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
        commitment: crypto.sum([left.commitment, right.commitment])
      }

      this.push(node)
    }

    cb(null)
  }
}
