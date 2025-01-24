const ethers = require('ethers'); 
const fs = require('fs');
const { logger } = require('./modules/logger.js')
const { getRandomInt, generateReqBody, sleep } = require('./modules/utils.js');
const { generateSignature } = require('./modules/signature.js');

const provider = new ethers.providers.JsonRpcProvider("https://rpc.blast.io");

async function loginBlast(reqBody, wallet) {
    try {
        const challenge = await reqBody.post("https://waitlist-api.prod.blast.io/v1/auth/wallet/challenge", {walletAddress: wallet.address});
        if(challenge.status !== 201) return {success: false, step: 'challenge', err: challenge};
        
        const challengeRes = challenge.data.challenge;
        const signature = await wallet.signMessage(challengeRes.message);

        const login = await reqBody.post("https://waitlist-api.prod.blast.io/v1/auth/wallet/login", JSON.stringify({
            walletAddress: wallet.address,
            signature: signature,
            message: challengeRes.message,
            hmac: challengeRes.hmac,
            expiresOn: challengeRes.expiresOn
        }));

        return {success: true, accessToken: login.data.accessToken};
    } catch(e) {return {success: false, err: e}}
}

async function associateToken(reqBody, extensionSigner, accessToken) {
    try {
        const sign = await generateSignature(extensionSigner, "POST", "https://foundation-api.prod.blast.io/v1/extension/waitlist-associate-token", {waitlistToken: accessToken}, "extension");
        if(!sign.success) return {success: false, err: sign.err};

        reqBody.defaults.headers['X-Blast-Signature'] = sign.signature;
        reqBody.defaults.headers['X-Blast-Public-Key'] = sign.publicKey;
        reqBody.defaults.headers['X-Blast-Timestamp'] = sign.timestamp;
        reqBody.defaults.headers['X-Blast-Client-Type'] = 'extension';

        const associate = await reqBody.post("https://foundation-api.prod.blast.io/v1/extension/waitlist-associate-token", {waitlistToken: accessToken});
        if(!associate.data.success) return {success: false, err: "Failed to associate token"};

        return {success: true};
    } catch(e) {return {success: false, err: e}}
}

async function claimDrop(reqBody, wallet) {
    try {
        const accessToken = await loginBlast(reqBody, wallet);
        if(!accessToken.success) return {success: false, err: accessToken.err};

        reqBody.defaults.headers['Cookie'] = 'accessToken=' + accessToken.accessToken;
        
        const claims = await reqBody.get(`https://waitlist-api.prod.blast.io/v1/airdrop/claims?walletAddress=${wallet.address}`);
        if(!claims.data.success) return {success: false, err: "Failed to get claims"};
        
        if(claims.data.totals.tokensClaimed !== "0.0") {
            logger.success(`[Already claimed] ${wallet.address}`);
            return {success: true, alreadyClaimed: true};
        }

        const extensionSigner = new ethers.Wallet.createRandom();
        const associate = await associateToken(reqBody, extensionSigner, accessToken.accessToken);
        if(!associate.success) return {success: false, err: associate.err};

        const claimTx = await reqBody.get("https://waitlist-api.prod.blast.io/v1/airdrop/claim-tx");
        if(!claimTx.data.success) return {success: false, err: "Failed to get claim tx"};

        const signer = wallet.connect(provider);
        const balance = await provider.getBalance(wallet.address);

        const transactionRequest = {
            to: claimTx.data.tx.to,
            data: claimTx.data.tx.data,
            gasLimit: 99039,
            maxFeePerGas: ethers.utils.parseUnits("0.015255237", "gwei"),
            maxPriorityFeePerGas: ethers.utils.parseUnits("0.000000001", "gwei"),
            type: 2
        };

        // Проверка баланса
        const maxCost = transactionRequest.maxFeePerGas.mul(transactionRequest.gasLimit);
        if(balance.lt(maxCost)) {
            return {success: false, err: `Insufficient ETH. Has: ${ethers.utils.formatEther(balance)}, Required: ${ethers.utils.formatEther(maxCost)}`};
        }

        const txResponse = await signer.sendTransaction(transactionRequest);
        const receipt = await txResponse.wait();

        return {success: true, hash: receipt.transactionHash};
    } catch(e) {
        // Если транзакция с низким газом
        if(e.code === 'REPLACEMENT_UNDERPRICED' && transactionRequest) {
            logger.warn(`Retrying with higher gas for ${wallet.address}`);
            transactionRequest.maxFeePerGas = transactionRequest.maxFeePerGas.mul(2);
            // Рекурсивный вызов с новыми параметрами
            return claimDrop(reqBody, wallet);
        }
        return {success: false, err: e}
    }
}

async function claimAirdrop() {
    const wallets = fs.readFileSync('./data/wallets.txt', 'utf8').split(/\r?\n/);
    const proxys = fs.readFileSync('./data/proxys.txt', 'utf8').split(/\r?\n/);

    logger.info(`Blast Season 2 Airdrop Claimer | Claiming ${wallets.length} accounts...`);

    for(let i = 0; i < wallets.length; i++) {
        const wallet = new ethers.Wallet(wallets[i]);
        const proxy = proxys.length == wallets.length ? proxys[i] : proxys[getRandomInt(0, proxys.length)];

        logger.info(`[${i+1}/${wallets.length}] | ${wallet.address} | Claiming airdrop...`);

        let reqBody = generateReqBody(proxy);
        reqBody.defaults.headers["authority"] = "waitlist-api.prod.blast.io";
        reqBody.defaults.headers["Origin"] = "https://blast.io"
        reqBody.defaults.headers["Referer"] = "https://blast.io/";

        const response = await claimDrop(reqBody, wallet);
        if(!response.success) { 
            logger.error(`[${i+1}/${wallets.length}] | ${wallet.address} | ${response.err}`); 
            continue; 
        }
        
        logger.success(`[${i+1}/${wallets.length}] | ${wallet.address} | Successfully claimed! Transaction hash: ${response.hash}`);
        
        await sleep(getRandomInt(3000, 5000));
    }

    logger.success(`Claimed ${wallets.length} accounts.`);
}

claimAirdrop();