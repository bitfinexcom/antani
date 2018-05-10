const sodium = require('sodium-universal')
const uint64be = require('uint64be')

exports.signBucket = function (bucket) {
  // TODO: @emilbayes sign the hash or something
  return 'deadbeef'
}

exports.verifyBucket = function (bucket) {
  // TODO: @emilbayes
  return bucket.signature === 'deadbeef'
}

exports.hashBucket = function (node) {
  const buffers = [
    Buffer.from('bucket\n'),
    uint64be.encode(node.balance),
    Buffer.from(node.key, 'hex')
  ]

  const out = Buffer.alloc(32)
  sodium.crypto_generichash(out, Buffer.concat(buffers))
  return out.toString('hex')
}

exports.hashParent = function (a, b) {
  if (a.index > b.index) return exports.hashParent(b, a)

  const buffers = [
    Buffer.from('parent\n'),
    uint64be.encode(a.balance + b.balance),
    Buffer.from(a.hash, 'hex'),
    Buffer.from(b.hash, 'hex')
  ]

  const out = Buffer.alloc(32)
  sodium.crypto_generichash(out, Buffer.concat(buffers))
  return out.toString('hex')
}

exports.hashRoot = function (peaks) {
  const buffers = [
    Buffer.from('root\n'),
    null // placeholder for sum
  ]

  var sum = 0

  for (var i = 0; i < peaks.length; i++) {
    const peak = peaks[i]
    sum += peak.balance
    buffers.push(uint64be.encode(peak.index))
    buffers.push(uint64be.encode(peak.balance))
    buffers.push(Buffer.from(peak.hash, 'hex'))
  }

  buffers[1] = uint64be.encode(sum)

  const out = Buffer.alloc(32)
  sodium.crypto_generichash(out, Buffer.concat(buffers))
  return out.toString('hex')
}
