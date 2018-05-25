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

module.exports = Voter

function Voter (filename) {
  if (!(this instanceof Voter)) return new Voter(filename)
  events.EventEmitter.call(this)

  const self = this

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

util.inherits(Voter, events.EventEmitter)

Voter.prototype._ready = function (cb) {
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

Voter.prototype.has = function (index) {
  return this.bitfield.get(index)
}

Voter.prototype.push = function (vote, cb) {
  const self = this

  this.ready(function (err) {
    if (err) return cb(err)
    self.lock(function (release) {
      if (self.finalized) return release(cb, new Error('Voting finalized'))
      if (!self.bitfield.set(vote.index, true)) return release(cb, new Error('Already voted'))
      const preamble = self.offset ? ',' : '['
      const data = Buffer.from(preamble + JSON.stringify(vote))

      self.storage.write(self.offset, data, function (err) {
        if (err) return release(cb, err)
        self.offset += data.length
        release(cb, null)
      })
    })
  })
}

Voter.prototype.finalize = function (cb) {
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
