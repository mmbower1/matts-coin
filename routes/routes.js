const { Router } = require("express");
const router = Router();

const Blockchain = require("../blockchain.js");
const mattsCoin = new Blockchain();
const { v4: uuidv4 } = require("uuid");
const nodeAddress = uuidv4().split("-").join("");
const rp = require("request-promise");

// get entire blockchain
router.get("/blockchain", (req, res) => {
  res.send(mattsCoin);
  console.log(mattsCoin);
});

// create a new transaction
router.post("/transaction", (req, res) => {
  const newTransaction = req.body;
  const blockIndex = mattsCoin.addTransactionToPending(newTransaction);
  res.json({ msg: `Transaction will be added in block ${blockIndex}` });
});

// create new transaction and broadcast to all servers
router.post("/transaction/broadcast", (req, res) => {
  const requestPromises = [];
  const newTransaction = mattsCoin.createNewTransaction(
    req.body.amount,
    req.body.sender,
    req.body.recipient
  );
  mattsCoin.addTransactionToPending(newTransaction);
  mattsCoin.networkServers.forEach((networkServer) => {
    const requestOptions = {
      uri: networkServer + "/transaction",
      method: "POST",
      body: newTransaction,
      json: true,
    };
    requestPromises.push(rp(requestOptions));
  });
  Promise.all(requestPromises).then((data) => {
    res.json({ msg: "Transaction created and broadcasted successfully" });
  });
});

// mine a block to all servers on network
router.get("/mine", (req, res) => {
  const requestPromises = [];
  const lastBlock = mattsCoin.getLastBlock();
  const prevBlockHash = lastBlock["hash"];
  const currentBlockData = {
    transactions: mattsCoin.pendingTransactions,
    index: lastBlock["index"] + 1,
  };
  const nonce = mattsCoin.proofOfWork(prevBlockHash, currentBlockData);
  const blockHash = mattsCoin.hashBlock(prevBlockHash, currentBlockData, nonce);
  const newBlock = mattsCoin.createNewBlock(nonce, prevBlockHash, blockHash);
  mattsCoin.networkServers.forEach((networkServer) => {
    const requestOptions = {
      uri: networkServer + "/receive-new-block",
      method: "POST",
      body: { newBlock: newBlock },
      json: true,
    };
    requestPromises.push(rp(requestOptions));
  });
  Promise.all(requestPromises)
    .then((data) => {
      // send mining reward to entire network
      const requestOptions = {
        uri: mattsCoin.currentServer + "/transaction/broadcast",
        method: "POST",
        body: { amount: 3.125, sender: "00", recipient: nodeAddress },
        json: true,
      };
      return rp(requestOptions);
    })
    .then((data) => {
      res.json({
        msg: "New block mined and broadcasted successfully.",
        block: newBlock,
      });
    });
});

// register a server with the network
router.post("/register-server", (req, res) => {
  const newServerUrl = req.body.newServerUrl;
  const serverNotPresent = mattsCoin.networkServers.indexOf(newServerUrl) == -1;
  const notCurrentServer = mattsCoin.currentServer !== newServerUrl;
  // if new server doesnt already exist, create the new server
  if (serverNotPresent && notCurrentServer) {
    mattsCoin.networkServers.push(newServerUrl);
  }
  res.json({ msg: "New server registered successfully with server" });
});

// register multiple servers at once
router.post("/register-servers-bulk", (req, res) => {
  const allNetworkServers = req.body.allNetworkServers;
  allNetworkServers.forEach((networkServer) => {
    const serverNotPresent =
      mattsCoin.networkServers.indexOf(networkServer) == -1;
    const notCurrentServer = mattsCoin.currentServer !== networkServer;
    if (serverNotPresent && notCurrentServer) {
      mattsCoin.networkServers.push(networkServer);
    }
  });
  res.json({ msg: "Bulk registration successful" });
});

// create a decentralized network of server nodes and add more to it
router.post("/register-and-broadcast-server", (req, res) => {
  const registerServersPromises = [];
  const newServerUrl = req.body.newServerUrl;
  if (mattsCoin.networkServers.indexOf(newServerUrl) == -1) {
    mattsCoin.networkServers.push(newServerUrl);
  }
  // broadcast new server to the rest of the servers
  mattsCoin.networkServers.forEach((networkServer) => {
    const requestOptions = {
      uri: networkServer + "/register-server",
      method: "POST",
      body: { newServerUrl: newServerUrl },
      json: true,
    };
    registerServersPromises.push(rp(requestOptions));
  });
  Promise.all(registerServersPromises)
    .then((data) => {
      const bulkRegisterOptions = {
        uri: newServerUrl + "/register-servers-bulk",
        method: "POST",
        body: {
          allNetworkServers: [
            ...mattsCoin.networkServers,
            mattsCoin.currentServer,
          ],
        },
        json: true,
      };
      return rp(bulkRegisterOptions);
    })
    .then((data) =>
      res.json({ msg: "New server registered with network successfully" })
    );
});

// receive a new block and broadcast to all network servers
router.post("/receive-new-block", (req, res) => {
  const newBlock = req.body.newBlock;
  const lastBlock = mattsCoin.getLastBlock();
  const correctHash = lastBlock.hash === newBlock.prevBlockHash;
  const correctIndex = lastBlock["index"] + 1 === newBlock["index"];
  if (correctHash && correctIndex) {
    mattsCoin.chain.push(newBlock);
    mattsCoin.pendingTransactions = [];
    res.json({
      msg: "New block received and accepted to the network",
      newBlock: newBlock,
    });
  } else {
    res.json({ msg: "New block rejected", newBlock: newBlock });
  }
});

// make sure all data is accurate on each server
router.get("/consensus", (req, res) => {
  const requestPromises = [];
  mattsCoin.networkServers.forEach((networkServer) => {
    const requestOptions = {
      uri: networkServer + "/blockchain",
      method: "GET",
      json: true,
    };
    requestPromises.push(rp(requestOptions));
  });
  Promise.all(requestPromises).then((blockchains) => {
    const currentChainLength = mattsCoin.chain.length;
    let maxChainLength = currentChainLength;
    let newLongestChain = null;
    let newPendingTransactions = null;
    blockchains.forEach((blockchain) => {
      if (blockchain.chain.length > maxChainLength) {
        maxChainLength = blockchain.chain.length;
        newLongestChain = blockchain.chain;
        newPendingTransactions = blockchain.pendingTransactions;
      }
    });
    if (
      !newLongestChain ||
      (newLongestChain && !mattsCoin.chainIsValid(newLongestChain))
    ) {
      res.json({
        msg: "This server chain has not been updated.",
        chain: mattsCoin.chain,
      });
    } else {
      mattsCoin.chain = newLongestChain;
      mattsCoin.pendingTransactions = newPendingTransactions;
      res.json({
        msg: "This server chain has been updated",
        chain: mattsCoin.chain,
      });
    }
  });
});

// retreive a specific block with its block hash
router.get("/block/:blockHash", (req, res) => {
  const blockHash = req.params.blockHash;
  const correctBlock = mattsCoin.getBlock(blockHash);
  res.json({ block: correctBlock });
});

router.get("/transaction/:transactionID", (req, res) => {
  const transactionID = req.params.transactionID;
  const transactionData = mattsCoin.getTransaction(transactionID);
  res.json({
    transaction: transactionData.transaction,
    block: transactionData.block,
  });
});

router.get("/address/:address", (req, res) => {
  const address = req.params.address;
  const addressData = mattsCoin.getAddress(address);
  res.json({ addressData: addressData });
});

// frontend html
router.get("/block-explorer", (req, res) => {
  res.sendFile("../client/index.html", { root: __dirname });
});

module.exports = router;
