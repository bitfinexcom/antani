const sodium = require('sodium-universal')
const int64be = require('int64be')
const uint64be = require('uint64be')
const assert = require('nanoassert')

const b64len = (x) => (x * 4 / 3 + 3) & ~3

// Constants
exports.HASH_BYTES = 32
exports.HASH_LEN = b64len(exports.HASH_BYTES)
exports.SECRETKEY_BYTES = sodium.crypto_sign_SECRETKEYBYTES
exports.SECRETKEY_LEN = b64len(exports.SECRETKEY_BYTES)
exports.PUBLICKEY_BYTES = sodium.crypto_sign_PUBLICKEYBYTES
exports.PUBLICKEY_LEN = b64len(exports.PUBLICKEY_BYTES)
exports.SIGNATURE_BYTES = sodium.crypto_sign_BYTES
exports.SIGNATURE_LEN = b64len(exports.SIGNATURE_BYTES)

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
  assert(typeof sk === 'string', 'sk must be a string')
  assert(sk.length === exports.SECRETKEY_LEN, 'sk must be SECRETKEY_LEN long')
  assert(typeof message === 'string', 'message must be a string')

  const signature = Buffer.alloc(exports.SIGNATURE_BYTES)
  sodium.crypto_sign_detached(signature, Buffer.from(message), Buffer.from(sk, 'base64'))
  return signature.toString('base64')
}

exports.verifyMessage = function (pk, message, sig) {
  assert(typeof sk === 'string', 'sk must be a string')
  assert(sk.length === exports.SECRETKEY_LEN, 'sk must be SECRETKEY_LEN long')
  assert(typeof message === 'string', 'message must be a string')
  assert(typeof sig === 'string', 'sig must be a string')
  assert(sig.length === exports.SIGNATURE_LEN, 'sig must be SIGNATURE_LEN long')

  return sodium.crypto_sign_verify_detached(
    Buffer.from(sig, 'base64'),
    Buffer.from(message),
    Buffer.from(pk, 'base64')
  )
}

exports.signBucket = function (sk, bucket) {
  assert(typeof sk === 'string', 'sk must be a string')
  assert(sk.length === exports.SECRETKEY_LEN, 'sk must be SECRETKEY_LEN long')
  assert(typeof bucket.hash === 'string', 'bucket.hash must be a string')
  assert(bucket.hash.length === exports.HASH_LEN, 'bucket.hash must be HASH_LEN long')

  const signature = Buffer.alloc(exports.SIGNATURE_BYTES)
  sodium.crypto_sign_detached(signature, Buffer.from(bucket.hash, 'base64'), Buffer.from(sk, 'base64'))
  return signature.toString('base64')
}

exports.verifyBucket = function (bucket) {
  assert(typeof bucket.signature === 'string', 'bucket.signature must be a string')
  assert(bucket.signature.length === exports.SIGNATURE_LEN, 'bucket.signature must be SIGNATURE_LEN long')
  assert(typeof bucket.key === 'string', 'bucket.key must be a string')
  assert(bucket.key.length === exports.PUBLICKEY_LEN, 'bucket.key must be PUBLICKEY_LEN long')

  const hash = exports.hashBucket(bucket)
  return sodium.crypto_sign_verify_detached(
    Buffer.from(bucket.signature, 'base64'),
    Buffer.from(hash, 'base64'),
    Buffer.from(bucket.key, 'base64')
  )
}

exports.hashBucket = function (bucket) {
  assert(Number.isSafeInteger(bucket.balance), 'bucket.balance must be safe integer')
  assert(typeof bucket.key === 'string', 'bucket.key must be a string')
  assert(bucket.key.length === exports.PUBLICKEY_LEN, 'bucket.key must be PUBLICKEY_LEN long')

  const buffers = [
    BUCKET_PREFIX_BUF,
    int64be.encode(bucket.balance),
    Buffer.from(bucket.key, 'base64')
  ]

  const out = Buffer.alloc(exports.HASH_BYTES)
  sodium.crypto_generichash_batch(out, buffers)
  return out.toString('base64')
}

function voteBuffer (vote) {
  assert(typeof vote.key === 'string', 'vote.key must be a string')
  assert(vote.key.length === exports.PUBLICKEY_LEN, 'vote.key must be PUBLICKEY_LEN long')
  assert(typeof vote.signature === 'string', 'vote.signature must be a string')
  assert(vote.signature.length === exports.SIGNATURE_LEN, 'vote.signature must be SIGNATURE_LEN long')
  assert(typeof vote.hash === 'string', 'vote.hash must be a string')
  assert(vote.hash.length === exports.HASH_LEN, 'vote.hash must be HASH_LEN long')
  assert(vote.index >= 0)
  assert(Number.isSafeInteger(vote.index))
  assert(Number.isSafeInteger(vote.balance))
  assert(typeof vote.vote === 'string', 'vote.vote must be a string')

  // Fixed-length don't need separators. For now we're just signing the whole
  // bucket, through not strictly required
  return Buffer.concat([
    Buffer.from(vote.key, 'base64'),
    Buffer.from(vote.signature, 'base64'), // this is the bucket signature
    Buffer.from(vote.hash, 'base64'),
    SIG_BUF,
    uint64be.encode(vote.index),
    SIG_BUF,
    int64be.encode(vote.balance),
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
  assert(typeof sk === 'string', 'sk must be a string')
  assert(sk.length === exports.SECRETKEY_LEN, 'sk must be SECRETKEY_LEN long')

  const signature = Buffer.alloc(exports.SIGNATURE_BYTES)
  sodium.crypto_sign_detached(
    signature,
    voteBuffer(vote),
    Buffer.from(sk, 'base64')
  )

  return signature.toString('base64')
}

exports.verifyVote = function (vote) {
  assert(typeof vote.voteSignature === 'string', 'vote.voteSignature must be a string')
  assert(vote.voteSignature.length === exports.SIGNATURE_LEN, 'vote.voteSignature must be SIGNATURE_LEN long')
  assert(typeof vote.key === 'string', 'vote.key must be a string')
  assert(vote.key.length === exports.PUBLICKEY_LEN, 'vote.key must be PUBLICKEY_LEN long')

  return sodium.crypto_sign_verify_detached(
    Buffer.from(vote.voteSignature, 'base64'),
    voteBuffer(vote),
    Buffer.from(vote.key, 'base64')
  )
}

exports.receiptVote = function (sk, vote) {
  assert(typeof sk === 'string', 'sk must be a string')
  assert(sk.length === exports.SECRETKEY_LEN, 'sk must be SECRETKEY_LEN long')
  assert(typeof vote.voteSignature === 'string', 'vote.voteSignature must be a string')
  assert(vote.voteSignature.length === exports.SIGNATURE_LEN, 'vote.voteSignature must be SIGNATURE_LEN long')

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

  assert(Number.isSafeInteger(a.balance + b.balance), 'sum of balances must be safe integer')
  assert(typeof a.hash === 'string', 'a.hash must be a string')
  assert(a.hash.length === exports.HASH_LEN, 'a.hash must be HASH_LEN long')
  assert(typeof b.hash === 'string', 'b.hash must be a string')
  assert(b.hash.length === exports.HASH_LEN, 'b.hash must be HASH_LEN long')

  const buffers = [
    PARENT_PREFIX_BUF,
    int64be.encode(a.balance + b.balance),
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
    buffers.push(int64be.encode(peak.balance))
    buffers.push(Buffer.from(peak.hash, 'base64'))
  }

  assert(Number.isSafeInteger(sum), 'sum of peaks must be safe integer')

  buffers[1] = int64be.encode(sum)

  const out = Buffer.alloc(exports.HASH_BYTES)
  sodium.crypto_generichash_batch(out, buffers)
  return out.toString('base64')
}
