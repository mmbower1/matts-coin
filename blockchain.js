const sha256 = require("sha256");
const { v4: uuidv4 } = require("uuid");
const currentServer = process.argv[3];
console.log(currentServer);

// constructor
function Blockchain() {
  this.chain = [];
  this.pendingTransactions = [];
  this.currentServer = currentServer;
  this.networkServers = [];
  // genesis block - the very 1st block that starts the chain
  this.createNewBlock(100, "0", "0");
}

// create a pending block before its mined into a newly minted block
Blockchain.prototype.createNewBlock = function (nonce, prevBlockHash, hash) {
  const newBlock = {
    index: this.chain.length + 1,
    transactions: this.pendingTransactions,
    nonce, // proof of work number when a new block is created
    hash, // data from the new block
    prevBlockHash, // data from previous block
    timestamp: Date.now(),
  };
  this.pendingTransactions = [];
  this.chain.push(newBlock);
  return newBlock;
};

// get the last block
Blockchain.prototype.getLastBlock = function () {
  return this.chain[this.chain.length - 1];
};

// hash a block
Blockchain.prototype.hashBlock = function (
  prevBlockHash,
  currentBlockData,
  nonce
) {
  const dataAsString =
    prevBlockHash + nonce.toString() + JSON.stringify(currentBlockData);
  const hash = sha256(dataAsString);
  return hash;
};

// repeatedly hashes the prev and current block data hash params
// in a nonce until the hash starts with '0000'
Blockchain.prototype.proofOfWork = function (prevBlockHash, currentBlockData) {
  let nonce = 0;
  let hash = this.hashBlock(prevBlockHash, currentBlockData, nonce);
  while (hash.substring(0, 4) !== "0000") {
    nonce++;
    hash = this.hashBlock(prevBlockHash, currentBlockData, nonce);
  }
  return nonce;
};

// create a new transaction
Blockchain.prototype.createNewTransaction = function (
  amount,
  sender,
  recipient
) {
  const newTransaction = {
    amount: amount,
    sender: sender,
    recipient: recipient,
    transactionID: uuidv4().split("-").join(""),
  };
  return newTransaction;
};

Blockchain.prototype.addTransactionToPending = function (transactionObj) {
  this.pendingTransactions.push(transactionObj);
  return this.getLastBlock()["index"] + 1;
};

// makes sure blockchain is valid and same length on all server networks
Blockchain.prototype.chainIsValid = function (blockchain) {
  let validChain = true;
  for (var i = 1; i < blockchain.length; i++) {
    const currentBlock = blockchain[i];
    const prevBlock = blockchain[i - 1];
    const blockHash = this.hashBlock(
      prevBlock["hash"],
      {
        transactions: currentBlock["transactions"],
        index: currentBlock["index"],
      },
      currentBlock["nonce"]
    );
    if (blockHash.substring(0, 4) !== "0000") validChain = false;
    if (currentBlock["prevBlockHash"] !== prevBlock["hash"]) validChain = false;
  }
  const genesisBlock = blockchain[0];
  const correctNonce = genesisBlock["nonce"] === 100;
  const correctPrevBlockHash = genesisBlock["prevBlockHash"] === "0";
  const correctHash = genesisBlock["hash"] === "0";
  const correctTransactions = genesisBlock["transactions"].length === 0;
  if (
    !correctNonce ||
    !correctPrevBlockHash ||
    !correctHash ||
    !correctTransactions
  ) {
    validChain = false;
  }
  return validChain;
};

Blockchain.prototype.getBlock = function (blockHash) {
  let correctBlock = null;
  this.chain.forEach((block) => {
    if (block.hash === blockHash) correctBlock = block;
  });
  return correctBlock;
};

Blockchain.prototype.getTransaction = function (transactionID) {
  let correctTransaction = null;
  let correctBlock = null;
  this.chain.forEach((block) => {
    block.transactions.forEach((transaction) => {
      if (transaction.transactionID === transactionID) {
        correctTransaction = transaction;
        correctBlock = block;
      }
    });
  });
  return { transaction: correctTransaction, block: correctBlock };
};

Blockchain.prototype.getAddress = function (address) {
  const addressTransactions = [];
  this.chain.forEach((block) => {
    block.transactions.forEach((transaction) => {
      if (transaction.sender === address || transaction.recipient === address) {
        addressTransactions.push(transaction);
      }
    });
  });
  let balance = 0;
  addressTransactions.forEach((transaction) => {
    if (transaction.recipient === address) {
      balance += transaction.amount;
    } else if (transaction.sender === address) {
      balance -= transaction.amount;
    }
  });
  return {
    addressTransactions: addressTransactions,
    addressBalance: balance,
  };
};

module.exports = Blockchain;
