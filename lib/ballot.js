const bitfield = require('sparse-bitfield')
const raf = require('random-access-file')
const createStream = require('random-access-stream')
const through = require('through2')
const JSONStream = require('JSONStream')
const thunky = require('thunky')
const mutexify = require('mutexify')
const pump = require('pump')
const events = require('events')
const util = require('util')
const crypto = require('./crypto')

module.exports = Ballot

function Ballot (filename, keypair, tree, candidates) {
  if (!(this instanceof Ballot)) return new Ballot(filename, keypair, tree, candidates)
  events.EventEmitter.call(this)

  const self = this

  this.tree = tree
  this.keypair = keypair
  this.candidates = candidates

  this.finalized = false
  this.offset = 0
  this.bitfield = bitfield()
  this.storage = raf(filename)
  this.lock = mutexify()
  this.ready = thunky(this._ready.bind(this))
  this.ready(onready)

  function onready (err) {
    if (err) self.emit('error', err)
    else self.emit('ready')
  }
}

Ballot.keygen = function () {
  return crypto.keygen()
}

util.inherits(Ballot, events.EventEmitter)

Ballot.prototype._ready = function (cb) {
  const self = this
  const rs = createStream(this.storage)
  pump(rs, JSONStream.parse('*'), through.obj(write), done)

  function write (data, enc, cb) {
    if (!self.bitfield.set(data.index, true)) return cb(new Error('Double vote'))
    self.offset += JSON.stringify(data).length + 1
    cb(null)
  }

  function done (err) {
    if (err && err.message === 'Double vote') return cb(err)
    self.storage.read(self.offset, 1, function (_, buf) {
      if (buf && buf[0] === ']'.charCodeAt(0)) {
        self.finalized = true
      }
      cb(null)
    })
  }
}

Ballot.prototype.has = function (index) {
  return this.bitfield.get(index)
}

Ballot.prototype.push = function (vote, cb) {
  const self = this

  self.verifyVote(vote, function (err) {
    if (err) return cb(err)

    self.ready(function (err) {
      if (err) return cb(err)
      self.lock(function (release) {
        if (self.finalized) return release(cb, new Error('Voting finalized'))
        if (!self.bitfield.set(vote.index, true)) return release(cb, new Error('Already voted'))
        const preamble = self.offset ? ',' : '['
        const data = Buffer.from(preamble + JSON.stringify(vote))

        const receipt = crypto.receiptVote(self.keypair.secretKey, vote)

        self.storage.write(self.offset, data, function (err) {
          if (err) return release(cb, err)
          self.offset += data.length
          release(cb, receipt)
        })
      })
    })
  })
}

Ballot.prototype.verifyVote = function (data, cb) {
  if (data.key == null) return process.nextTick(cb, new Error('Missing key'))
  if (data.signature == null) return process.nextTick(cb, new Error('Missing signature'))
  if (data.voteSignature == null) return process.nextTick(cb, new Error('Missing voteSignature'))
  if (data.balance == null) return process.nextTick(cb, new Error('Missing balance'))
  if (this.candidates.indexOf(data.vote) == -1) return process.nextTick(cb, new Error('Invalid vote candidate'))
  if (crypto.verifyVote(data) == false) return process.nextTick(cb, new Error('Invalid signature'))

  this.tree.bucket(data.key, function (err, bucket) {
    if (err) return cb(err)

    // implicitly bucket.key === data.key
    if (bucket.index !== data.index) return cb(new Error('Invalid index'))
    if (bucket.hash !== data.hash) return cb(new Error('Invalid index'))
    if (bucket.signature !== data.signature) return cb(new Error('Invalid index'))
    if (bucket.balance !== data.balance) return cb(new Error('Invalid balance'))
    return cb(null)
  })
}

Ballot.prototype.finalize = function (cb) {
  const self = this
  this.ready(function (err) {
    if (err) return cb(err)
    self.lock(function (release) {
      if (self.finalized) return cb(null)
      self.storage.write(self.offset, Buffer.from(']'), function (err) {
        if (err) return release(cb, err)
        self.offset++
        self.finalized = true
        release(cb, null)
      })
    })
  })
}
