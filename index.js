const jsonkv = require('jsonkv')
const pumpify = require('pumpify')
const flat = require('flat-tree')
const createTreeStream = require('./lib/tree-stream')
const sort = require('./lib/sort')
const crypto = require('./lib/crypto')

module.exports = Tree

function Tree (name) {
  if (!(this instanceof Tree)) return new Tree(name)
  this.db = jsonkv(name, sort)
}

Tree.createWriteStream = createWriteStream

Tree.prototype.root = function (cb) {
  this.db.get({type: 'root'}, function (err, node) {
    if (err) return cb(err)
    if (!node) return cb(new Error('Root not found'))
    cb(null, node)
  })
}

Tree.prototype.bucket = function (key, cb) {
  const self = this
  this.db.get({type: 'key', key}, function (err, node) {
    if (err) return cb(err)
    if (!node) return cb(new Error('Bucket not found'))
    self.node(node.index, cb)
  })
}

Tree.prototype.node = function (index, cb) {
  this.db.get({type: 'node', index}, function (err, node) {
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
          type: 'root',
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
          type: 'node',
          index: flat.parent(node.index),
          hash: null,
          balance: sibling.balance + node.balance
        }

        parent.hash = crypto.hashParent(sibling, node)
        up(parent)
      })
    }
  })
}

function createWriteStream (name) {
  return pumpify.obj(createTreeStream(), jsonkv.createWriteStream(name, sort))
}
