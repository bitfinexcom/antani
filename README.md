## Antani

Antani is a library containing two cryptographic data structures.

A balance tree that allows you to write a series of signed account balances to a merkle tree. This tree is summing up each
individual balance to a root that can be used to verify the solvancy of all balances combined. To avoid leaking metadata
about each individual balance there is also a series of functions to split each balance into randomized smaller ones.
We call each of these anonymised balances for buckets.

For each person whose balances you want to add to the balance tree, you distribute the set of key pairs used to sign
each bucket. The user can use these key pairs to verify that they exist in the balance tree and that all the buckets
they own add up to their user balance. They can also use them to prove to other people that they actually own a bucket
by signing a message with the secret key in the keypair.

In addition to the balances tree a ballot/voting data structure is included. This data structure allows you to create a
poll based on an array of options and have buckets associated with a balances file vote on an option weighted with their bucket balance.

Read more about Antani's purpose on [Bitfinex's BIP 001](https://github.com/bitfinexcom/bip/blob/master/proposals/001.md).

## Usage

```js
const antani = require('antani')

const ws = antani.tree.createWriteStream('balances.json')

const keypair = antani.tree.keygen()
ws.write({
  key: keypair.key,
  secretKey: keypair.secretKey,
  balance: 42
})

// ... write a ton more

ws.end(function () {
  const tree = antani.tree('balances.json')

  tree.root(console.log) // prints the root of the merkle tree
})
```

## API

## Merkle Balances Tree

#### `const writeStream = antani.tree.createWriteStream(filename)`

Create a new balances data structure. A merkle tree will be stored in `filename` as
valid JSON but white space padded to support efficient lookups.

Expects a stream of buckets looking like this

```
{
  balance: aBalance,
  key: anEd25519PublicKey,
  secretKey: correspondingSecretKey
}
```

See `antani.tree.keyPair()` with info on how to generate the keypairs.

Written to it. The final JSON file will contain these buckets (minus the secretKeys) and a signature for each, as
well as a merkle tree that be used to sum all of the together.

#### `const balanceTree = antani.tree(filename)`

Create a new balance tree. Filename should be one of the files produced above.

#### `const keyPair = antani.tree.keygen()`

Produces a valid ed25519 keypair encoded as base64.

#### `const buckets = antani.tree.buckets(balance)`

Splits a balance into an array of random buckets. Use this to anonymise the data written to the balance tree.

#### `balanceTree.bucket(key, cb)`

Lookup a bucket by public key in the balances file.

#### `balanceTree.vote(key, secretKey, vote, cb)`

Use bucket identified by `key` and sign a vote with choice `vote`. This can
be `.push`ed to `antani.ballot`.

#### `balanceTree.node(index, cb)`

Lookup a merkle tree node ([flat-tree](https://github.com/mafintosh/flat-tree) indexed) in the balances file.

#### `balanceTree.root(cb)`

Lookup the merkle root. The hash stored here will verify the entire merkle tree so you want to sign that yourself
so people can trust the balances file

#### `balanceTree.proof(key, cb)`

Looks up a bucket by key and verifies it contents by

1. Verifying it's signature
1. Rebuilding it's merkle parent nodes until it hits the root.
1. Verifies that the hash of the root is the same as the hash stored in the root node.

This proof is returned in the callback as well as an array of all the nodes needed to verify it.

If it does not verify it will return an error instead.

#### `balanceTree.signMessage(buckets, message, cb)`

Sign a generic text message using the buckets you pass in.

The buckets will be verified that they are in the tree before signing and will return an error if not.
You must pass at least one bucket. A bucket looks like this:

```js
{
  key: pubKeyInBase64,
  secretKey: secKeyInBase64
}
```

The object returned looks like this:

```
{
  message: 'the message',
  signatures: [arrayOfBase64Sigs]
}
```

#### `balanceTree.verifyMessage(buckets, signedMessage, cb)`

Verify a signed message produced above. `buckets` should just be an array of public keys in base64.
When verifying it will check that the public keys are indeed in the tree as well as verifying the message itself.

Returns null if everything is good and an error if not.

## Voting

#### `const ballot = antani.ballot(filename, keypair, tree, candidates)`

Create a new ballot. Takes the following arguments:

* `filename` for where to store the log of votes.
* `keypair` used to sign incoming votes so voters can get a receipt. Use `antani.ballot.keygen()` to produce a key pair
* `tree` must be a `antani.tree` used to lookup incoming votes to check their validity.
* `candidates` must be an array of strings for validating votes

#### `ballot.push(vote, cb)`

Cast a vote and commit it to the ballot log. If successful `cb` will get a
receipt for proving that a vote was committed to the log. Note that each
bucket from `antani.tree` can only vote once.

Vote must look like (can be produced with `antani.tree`s `.vote`):

```
{
  // These are all from the bucket
  key: …,
  signature: …,
  hash: …,
  index: …,
  balance: …,
  // these are special vote properties
  vote: …,
  voteSignature: …
}
```

The receipt looks like:

```
{
  receipt: 'base64 encoded signature'
  vote: {
    // above object
  }
}
```

#### `ballot.verifyVote(vote, cb)`

Check that `vote` is valid, calling `cb` with an error if anything is invalid.
`ballot.push` will call this function before committing any votes to the log.


#### `ballot.tally(cb)`

Tally the votes after `.finalize` has been called. Will error if any votes
contain a `.vote` that is not in the list `candidates`. Calls `cb` with the
counts where each vote is weighted by it's balance.

#### `ballot.finalize(cb)`

End the vote log so it can be tallied.

## License

MIT
