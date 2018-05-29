# antani

A module to verify a joint account balance without leaking the individual users balances with minimum reliance on centralised hosts.

Also provides a mechanism for users to use their balances to vote on proposals.

## Usage

```js
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

#### `const keyPair = antani.tree.keyPair()`

Produces a valid ed25519 keypair encoded as base64.

#### `const buckets = antani.tree.buckets(balance)`

Splits a balance into an array of random buckets. Use this to anonymise the data written to the balance tree.

#### `balanceTree.bucket(key, cb)`

Lookup a bucket by public key in the balances file.

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

## Voting

#### `const ballot = antani.ballot('ballot.json)`

Create a new ballot.

(@emilbayes fill the rest of this in)

## License

MIT
