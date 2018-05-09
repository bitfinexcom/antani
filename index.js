const jsonkv = require('jsonkv')
const pumpify = require('pumpify')
const createTreeStream = require('./lib/tree-stream')
const sort = require('./lib/sort')

module.exports = Tree

function Tree (name) {
  if (!(this instanceof Tree)) return new Tree(name)
  this.db = jsonkv(name, sort)
}

Tree.createWriteStream = createWriteStream

Tree.prototype.root = function (cb) {
  this.db.get({type: 'root'}, cb)
}

Tree.prototype.bucket = function (key, cb) {
  this.db.get({type: 'bucket', key}, cb)
}

Tree.prototype.parent = function (index, cb) {
  this.db.get({type: 'parent', index}, cb)
}

function createWriteStream (name) {
  return pumpify.obj(createTreeStream(), jsonkv.createWriteStream(name, sort))
}
