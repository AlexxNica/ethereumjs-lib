const ecdsa = require('secp256k1'),
  utils = require('./utils.js');

/**
 * @method verifySignature
 * @return {Boolean}
 */
exports.verifySignature = function() {
  var msgHash = this.hash(false);

  var sig = Buffer.concat([this.r, utils.pad256(this.s)], 64);

  this._senderPubKey = ecdsa.recoverCompact(msgHash, sig, utils.bufferToInt(this.v) - 27);
  if (this._senderPubKey && this._senderPubKey.toString('hex') !== '') {
    return true;
  } else {
    return false;
  }
};

/**
 * sign a transaction with a given a private key
 * @method sign
 * @param {Buffer} privateKey
 */
exports.sign = function(privateKey) {
  var msgHash = this.hash(false),
    sig = ecdsa.signCompact(privateKey, msgHash);

  this.r = sig.r;
  this.s = sig.s;
  this.v = sig.recoveryId + 27;
};

/**
 * gets the senders public key
 * @method getSenderPublicKey
 * @return {Buffer}
 */
exports.getSenderPublicKey = function() {

  if (!this._senderPubKey) {
    this.verifySignature();
  }

  return this._senderPubKey;
};
