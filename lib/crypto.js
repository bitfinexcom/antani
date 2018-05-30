const sodium = require('sodium-universal')
const uint64be = require('uint64be')

// Constants
exports.HASH_BYTES = 32
exports.SECRETKEY_BYTES = sodium.crypto_sign_SECRETKEYBYTES
exports.PUBLICKEY_BYTES = sodium.crypto_sign_PUBLICKEYBYTES
exports.SIGNATURE_BYTES = sodium.crypto_sign_BYTES

const SIG_BUF = Buffer.from(':')

// Buffers that are mixed in with different tree nodes as prefixes to prevent
// second preimage attack
const BUCKET_PREFIX_BUF = Buffer.from('bucket\n')
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

exports.signMessage = function (sk, message) {
  const signature = Buffer.alloc(exports.SIGNATURE_BYTES)
  sodium.crypto_sign_detached(signature, Buffer.from(message), Buffer.from(sk, 'base64'))
  return signature.toString('base64')
}

exports.verifyMessage = function (pk, message, sig) {
  return sodium.crypto_sign_verify_detached(
    Buffer.from(sig, 'base64'),
    Buffer.from(message),
    Buffer.from(pk, 'base64')
  )
}

exports.signBucket = function (sk, bucket) {
  const signature = Buffer.alloc(exports.SIGNATURE_BYTES)
  sodium.crypto_sign_detached(signature, Buffer.from(bucket.hash, 'base64'), Buffer.from(sk, 'base64'))
  return signature.toString('base64')
}

exports.verifyBucket = function (bucket) {
  const hash = exports.hashBucket(bucket)
  return sodium.crypto_sign_verify_detached(
    Buffer.from(bucket.signature, 'base64'),
    Buffer.from(hash, 'base64'),
    Buffer.from(bucket.key, 'base64')
  )
}

exports.hashBucket = function (node) {
  const buffers = [
    BUCKET_PREFIX_BUF,
    uint64be.encode(node.balance),
    Buffer.from(node.key, 'base64')
  ]

  const out = Buffer.alloc(exports.HASH_BYTES)
  sodium.crypto_generichash_batch(out, buffers)
  return out.toString('base64')
}

function voteBuffer (vote) {
  // Fixed-length don't need separators. For now we're just signing the whole
  // bucket, through not strictly required
  return Buffer.concat([
    Buffer.from(vote.key, 'base64'),
    Buffer.from(vote.signature, 'base64'), // this is the bucket signature
    Buffer.from(vote.hash, 'base64'),
    SIG_BUF,
    uint64be.encode(vote.index),
    SIG_BUF,
    uint64be.encode(vote.balance),
    SIG_BUF,
    Buffer.from(vote.vote)
  ])
}

exports.normalizeVote = function (vote) {
  return {
    key: vote.key,
    signature: vote.signature,
    hash: vote.hash,
    index: vote.index,
    balance: vote.balance,
    vote: vote.vote,
    voteSignature: vote.voteSignature
  }
}

exports.signVote = function (sk, vote) {
  const signature = Buffer.alloc(exports.SIGNATURE_BYTES)
  sodium.crypto_sign_detached(
    signature,
    voteBuffer(vote),
    Buffer.from(sk, 'base64')
  )

  return signature.toString('base64')
}

exports.verifyVote = function (vote) {
  return sodium.crypto_sign_verify_detached(
    Buffer.from(vote.voteSignature, 'base64'),
    voteBuffer(vote),
    Buffer.from(vote.key, 'base64')
  )
}

exports.receiptVote = function (sk, vote) {
  const signature = Buffer.alloc(exports.SIGNATURE_BYTES)
  sodium.crypto_sign_detached(
    signature,
    Buffer.concat([
      Buffer.from(vote.voteSignature, 'base64'),
      voteBuffer(vote)
    ]),
    Buffer.from(sk, 'base64')
  )

  return signature.toString('base64')
}

exports.hashParent = function (a, b) {
  if (a.index > b.index) return exports.hashParent(b, a)

  const buffers = [
    PARENT_PREFIX_BUF,
    uint64be.encode(a.balance + b.balance),
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

  var sum = 0

  for (var i = 0; i < peaks.length; i++) {
    const peak = peaks[i]
    sum += peak.balance
    buffers.push(uint64be.encode(peak.index))
    buffers.push(uint64be.encode(peak.balance))
    buffers.push(Buffer.from(peak.hash, 'base64'))
  }

  buffers[1] = uint64be.encode(sum)

  const out = Buffer.alloc(exports.HASH_BYTES)
  sodium.crypto_generichash_batch(out, buffers)
  return out.toString('base64')
}
