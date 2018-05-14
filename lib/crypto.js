const sodium = require('sodium-universal')
const uint64be = require('uint64be')
const assert = require('nanoassert')
const pedersen = require('pedersen-commitment')

// Constants
exports.HASH_BYTES = 32
exports.SECRETKEY_BYTES = sodium.crypto_sign_SECRETKEYBYTES
exports.PUBLICKEY_BYTES = sodium.crypto_sign_PUBLICKEYBYTES
exports.SIGNATURE_BYTES = sodium.crypto_sign_BYTES

// Buffers that are mixed in with different tree nodes as prefixes to prevent
// second preimage attack
const LEAF_PREFIX_BUF = Buffer.from('leaf\n')
const PARENT_PREFIX_BUF = Buffer.from('parent\n')
const ROOT_PREFIX_BUF = Buffer.from('root\n')

exports.keygen = function () {
  const secretKey = Buffer.alloc(exports.SECRETKEY_BYTES)
  const key = Buffer.alloc(exports.PUBLICKEY_BYTES)

  sodium.crypto_sign_keypair(key, secretKey)

  return {
    secretKey: secretKey.toString('base64'),
    key: key.toString('base64')
  }
}

var H = Buffer.alloc(pedersen.PARAM_BYTES)
pedersen.nums(H, Buffer.from('btc eth xrp bch eos ltc ada xlm miota trx neo xmr dash'))

exports.H = H.toString('base64')
exports.commit = function (balance) {
  var commitment = Buffer.alloc(pedersen.COMMITMENT_BYTES)
  var decommitment = Buffer.alloc(pedersen.RBYTES)
  var x = Buffer.alloc(pedersen.DATA_BYTES)

  x.writeUIntLE(balance, 0, 6)

  pedersen.commit(commitment, decommitment, x, H)

  return [commitment.toString('base64'), decommitment.toString('base64')]
}

exports.sum = function (arr) {
  var sum = Buffer.from(arr[0], 'base64')

  for (var i = 1; i < arr.length; i++) {
    if (arr[i] == null) continue
    pedersen.accumulateCommitments(sum, Buffer.from(arr[i], 'base64'))
  }

  return sum.toString('base64')
}

exports.accDecommitments = function (a, b) {
  if (a == null) return b

  var acc = Buffer.from(a, 'base64')

  pedersen.accumulateDecommitments(acc, Buffer.from(b, 'base64'))

  return acc.toString('base64')
}

exports.verify = function (commitment, decommitment, balance) {
  var x = Buffer.alloc(pedersen.DATA_BYTES)

  x.writeUIntLE(balance, 0, 6)

  return pedersen.open(Buffer.from(commitment, 'base64'), Buffer.from(decommitment, 'base64'), x, H)
}

exports.hashLeaf = function (node) {
  const buffers = [
    LEAF_PREFIX_BUF,
    uint64be.encode(node.commitment),
    Buffer.from(node.key, 'base64')
  ]

  const out = Buffer.alloc(exports.HASH_BYTES)
  sodium.crypto_generichash_batch(out, buffers)
  return out.toString('base64')
}

exports.hashParent = function (a, b) {
  if (a.index > b.index) return exports.hashParent(b, a)

  const buffers = [
    PARENT_PREFIX_BUF,
    Buffer.from(exports.sum([a.commitment, b.commitment]), 'base64'),
    Buffer.from(a.hash, 'base64'),
    Buffer.from(b.hash, 'base64')
  ]

  const out = Buffer.alloc(exports.HASH_BYTES)
  sodium.crypto_generichash_batch(out, buffers)
  return out.toString('base64')
}

exports.hashRoot = function (peaks) {
  const buffers = [
    ROOT_PREFIX_BUF,
    null // placeholder for sum
  ]

  var sum = null

  for (var i = 0; i < peaks.length; i++) {
    const peak = peaks[i]
    sum = exports.sum([peak.commitment, sum])
    buffers.push(uint64be.encode(peak.index))
    buffers.push(Buffer.from(peak.commitment, 'base64'))
    buffers.push(Buffer.from(peak.hash, 'base64'))
  }

  buffers[1] = Buffer.from(sum, 'base64')

  const out = Buffer.alloc(exports.HASH_BYTES)
  sodium.crypto_generichash_batch(out, buffers)
  return out.toString('base64')
}
