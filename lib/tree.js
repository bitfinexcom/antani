const jsonkv = require('jsonkv')
const pump = require('pump')
const duplexify = require('duplexify')
const flat = require('flat-tree')
const cmp = require('compare')
const createTreeStream = require('./tree-stream')
const crypto = require('./crypto')
const bucket = require('./bucket')

module.exports = Tree

function Tree (name) {
  if (!(this instanceof Tree)) return new Tree(name)
  this.db = jsonkv(name, sortByKey)
}

Tree.createWriteStream = createWriteStream

Tree.keygen = function () {
  return crypto.keygen()
}

Tree.bucket = function (balance) {
  return bucket(balance)
}

Tree.prototype.verifyMessage = function (buckets, message, cb) {
  if (!buckets.length) throw new Error('Must pass one bucket at least')

  const sigs = message.signatures
  var error = null
  var missing = sigs.length

  for (let i = 0; i < buckets.length; i++) {
    this.bucket(buckets[i], function (err) {
      if (err) error = err
      else if (!crypto.verifyMessage(buckets[i], message.message, sigs[i])) error = new Error('Invalid signature at position ' + i)
      if (--missing) return
      cb(error)
    })
  }
}

Tree.prototype.signMessage = function (buckets, message, cb) {
  if (!buckets.length) throw new Error('Must pass one bucket at least')

  const sigs = new Array(buckets.length)
  var error = null
  var missing = sigs.length

  for (let i = 0; i < buckets.length; i++) {
    this.bucket(buckets[i].key, function (err, bucket) {
      if (err) error = err
      else sigs[i] = crypto.signMessage(buckets[i].secretKey, message)
      if (--missing) return
      if (error) return cb(error)
      cb(null, {message, signatures: sigs})
    })
  }
}

Tree.prototype.root = function (cb) {
  const self = this
  this.db.open(function (err) {
    if (err) return cb(err)
    self.db.getByIndex(self.db.length - 1, function (err, node) {
      if (err) return cb(err)
      if (!node) return cb(new Error('Root not found'))
      cb(null, node)
    })
  })
}

Tree.prototype.bucket = function (key, cb) {
  this.db.get({key}, {midpoint}, function (err, node) {
    if (err) return cb(err)
    if (!node) return cb(new Error('Bucket not found'))
    cb(null, node)
  })
}

Tree.prototype.vote = function (key, sk, vote, cb) {
  this.bucket(key, function (err, bucket) {
    if (err) return cb(err)

    bucket.vote = vote
    bucket.voteSignature = crypto.signVote(sk, bucket)

    return cb(null, bucket)
  })
}

Tree.prototype.node = function (index, cb) {
  this.db.getByIndex(index, function (err, node) {
    if (err) return cb(err)
    if (!node) return cb(new Error('Node not found'))
    cb(null, node)
  })
}

Tree.prototype.proof = function (key, cb) {
  const self = this

  const proof = {
    nodes: [],
    peaks: [],
    root: null
  }

  this.root(function (err, root) {
    if (err) return cb(err)

    proof.root = root

    const fullRoots = flat.fullRoots(root.index)
    var missing = fullRoots.length
    var error = null

    for (const peak of fullRoots) self.node(peak, onpeak)

    function onpeak (err, peak) {
      if (err) error = err
      else proof.peaks[fullRoots.indexOf(peak.index)] = peak
      if (--missing) return

      if (error) return cb(error)
      self.bucket(key, onbucket)
    }

    function onbucket (err, node) {
      if (err) return cb(err)
      if (!crypto.verifyBucket(node)) return cb(new Error('Bucket has invalid signature'))
      up(node)
    }

    function up (node) {
      if (err) return cb(err)

      const peakIndex = fullRoots.indexOf(node.index)

      if (peakIndex > -1) {
        proof.peaks[peakIndex] = node

        const index = proof.peaks.length
          ? flat.rightSpan(proof.peaks[proof.peaks.length - 1].index) + 2
          : 0

        const newRoot = {
          index,
          hash: null,
          balance: proof.peaks.map(node => node.balance).reduce((a, b) => a + b, 0)
        }

        newRoot.hash = crypto.hashRoot(proof.peaks)

        if (newRoot.hash !== root.hash) return cb(new Error('Checksum mismatch'))
        cb(null, proof)
        return
      }

      proof.nodes.push(node)

      self.node(flat.sibling(node.index), function (err, sibling) {
        if (err) return cb(err)

        const parent = {
          index: flat.parent(node.index),
          hash: null,
          balance: sibling.balance + node.balance
        }

        proof.nodes.push(sibling)
        parent.hash = crypto.hashParent(sibling, node)
        up(parent)
      })
    }
  })
}

function sortByKey (a, b) {
  if (!b.key) return 1
  if (!a.key) return -1
  return cmp(a.key, b.key)
}

function createWriteStream (name) {
  const sortedKeys = jsonkv.createWriteStream(name + '.sorted-keys')
  const stream = duplexify.obj()

  stream.setWritable(sortedKeys)
  stream.setReadable(false)

  stream.on('prefinish', function () {
    stream.cork()

    const tree = jsonkv(name + '.sorted-keys')

    pump(
      tree.createReadStream(),
      createTreeStream(),
      jsonkv.createWriteStream(name, (a, b) => a.index - b.index),
      function (err) {
        if (err) return stream.destroy(err)
        tree.destroy(function (err) {
          if (err) return stream.destroy(err)
          stream.uncork()
        })
      }
    )
  })

  return stream
}

function midpoint (btm, top) {
  const mid = Math.floor((top + btm) / 2)
  return mid & 1 ? mid - 1 : mid
}
