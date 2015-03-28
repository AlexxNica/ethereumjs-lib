const async = require('async');
const BN = require('bn.js');
const Account = require('../account');
const utils = require('ethereumjs-util');
const assert = require('assert');

/**
 * runs a CALL operation
 * @method runCall
 * @param opts
 * @param opts.account {Account}
 * @param opts.block {Block}
 * @param opts.caller {Buffer}
 * @param opts.code {Buffer} this is for CALLCODE where the code to load is different than the code from the to account.
 * @param opts.data {Buffer}
 * @param opts.gasLimit {Bignum}
 * @param opts.gasPrice {Bignum}
 * @param opts.origin {Buffer} []
 * @param opts.to {Buffer}
 * @param opts.value {Bignum}
 */
module.exports = function(opts, cb) {
  var self = this;
  var fromAccount = opts.account;
  var toAccount;
  var data;
  var code = opts.code;
  var compiled = false; //is the code compiled or not?
  var vmResults = {};
  var createdAddress;
  var gasUsed = new BN(0);

  this.trie.checkpoint();
  this.cache.checkpoint();

  //set default values
  if (!opts.value) {
    opts.value = new BN(0);
  }

  if (!opts.to || opts.caller.toString('hex') !== opts.to.toString('hex')) {
    fromAccount.balance = new Buffer((new BN(fromAccount.balance).sub(opts.value)).toArray());
  }

  function getToAccount(cb2) {
    //get receiver's account
    if (!opts.to) {
      //creating a contract if no `to`
      code = opts.data;
      createdAddress = opts.to = utils.generateAddress(opts.caller, fromAccount.nonce);
      toAccount = new Account();
      cb2(null, toAccount);
    } else {
      //else load the to account
      data = opts.data;
      self.trie.get(opts.to, function(err, account) {

        toAccount = new Account(account);

        var c = self.cache.get(opts.to);
        assert(toAccount.balance.toString('hex') === c.balance.toString('hex'))
        assert(toAccount.nonce.toString('hex') === c.nonce.toString('hex'))
        assert(toAccount.codeHash.toString('hex') === c.codeHash.toString('hex'))
        assert(toAccount.stateRoot.toString('hex') === c.stateRoot.toString('hex'))

        cb2(err);
      });
    }
  }

  function loadCode(cb2) {
    //loads the contract's code if the account is a contract
    if ((!code && toAccount.isContract()) || toAccount.isPrecompiled(opts.to)) {
      toAccount.getCode(self.trie, opts.to, function(err, c, comp) {
        compiled = comp;
        code = c;
        cb2(err);
      });
    } else {
      cb2();
    }
  }

  function runCode(cb2) {
    //add the amount sent to the `to` account
    if (opts.caller.toString('hex') !== opts.to.toString('hex')) {
      toAccount.balance = new Buffer(new BN(toAccount.balance)
        .add(opts.value)
        .toArray());
    }

    if (code) {
      var oldStateRoot = toAccount.stateRoot;
      var oldBalace = toAccount.balance;
      var oldNonce = toAccount.nonce;
      var runCodeOpts = {
        code: code,
        data: data,
        gasLimit: opts.gasLimit,
        gasPrice: opts.gasPrice,
        account: toAccount,
        address: opts.to,
        origin: opts.origin,
        caller: opts.caller,
        value: opts.value,
        block: opts.block,
        depth: opts.depth
      };
      var codeRunner = compiled ? self.runJIT : self.runCode;

      //run Code through vm
      codeRunner.call(self, runCodeOpts, function(err, results) {

        toAccount = results.account;
        vmResults = results;

        if (results.exceptionErr) {
          results.account.stateRoot = oldStateRoot;
          results.account.balance = oldBalace;
          results.account.nonce = oldNonce;

          if (!opts.to || opts.caller.toString('hex') !== opts.to.toString('hex')) {
            fromAccount.balance = new Buffer((new BN(fromAccount.balance).add(opts.value)).toArray());
          }
  
          toAccount.balance = new Buffer(new BN(toAccount.balance)
            .sub(opts.value)
            .toArray());

        }

        if (createdAddress) {
          //TODO:
          var returnFee = results.gasUsed.add(new BN(results.returnValue.length * 200));
          if (returnFee.cmp(opts.gasLimit) <= 0) {
            results.gasUsed = returnFee;
          } else {
            results.returnValue = new Buffer([]);
          }
        }

        gasUsed = results.gasUsed;

        if (results.exceptionErr) {
          self.cache.revert();
          self.trie.revert(cb2);
        } else {
          self.cache.commit();
          self.trie.commit(cb2);
        }
      });
    } else {
      cb2();
    }
  }

  function saveCode(cb2) {
    //store code for a new contract
    if (!vmResults.exceptionErr && createdAddress && vmResults.returnValue.toString() !== '') {
      toAccount.storeCode(self.trie, vmResults.returnValue, cb2);
    } else {
      cb2();
    }
  }

  function saveToAccount(cb2) {
    //save the to account
    self.cache.put(opts.to, toAccount);
    self.trie.put(opts.to, toAccount.serialize(), cb2);
  }

  async.series([
      //save the current account. We need to do this becase we could be calling recursivly
      function(done){
        self.cache.put(opts.caller, opts.account);
        self.trie.put(opts.caller, opts.account.serialize(), done);
      },
      getToAccount,
      loadCode,
      runCode,
      function(done){
        if(vmResults.exceptionErr){
          self.cache.put(opts.caller, opts.account);
          self.trie.put(opts.caller, opts.account.serialize(), done); 
        }else{
          done();
        }
      },
      saveCode,
      saveToAccount
    ],
    function(err) {
      var results = {
        gasUsed: gasUsed,
        fromAccount: fromAccount,
        toAccount: toAccount,
        createdAddress: createdAddress,
        vm: vmResults
      };

      if (results.vm.exception === undefined) {
         results.vm.exception = 1;
       }

      cb(err, results);
    });
};
