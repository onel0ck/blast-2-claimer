const ethers = require('ethers');
const fs = require('fs');
const { logger } = require('./modules/logger.js')
const { getRandomInt, generateReqBody, sleep } = require('./modules/utils.js');

const { generateSignature } = require('./modules/signature.js');

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

async function checkSecret(reqBody, clientSigner) {
    try {
        const sign = await generateSignature(clientSigner, "POST", "https://foundation-api.prod.blast.io/v1/device/sync", {resync: false}, "device");
        if(!sign.success) return {success: false, err: sign.err};

        reqBody.defaults.headers['X-Blast-Signature'] = sign.signature;
        reqBody.defaults.headers['X-Blast-Public-Key'] = sign.publicKey;
        reqBody.defaults.headers['X-Blast-Timestamp'] = sign.timestamp;
        reqBody.defaults.headers['X-Blast-Client-Type'] = 'device';

        const words = await reqBody.post("https://foundation-api.prod.blast.io/v1/device/sync", {resync: false});

        return {success: true, secret: words.data.pin};
    } catch(e) {return {success: false, err: e}}
}

async function loginFoundation(reqBody, wallet) {
    try {
        const challenge = await reqBody.post("https://foundation-api.prod.blast.io/v1/auth/wallet/challenge", {walletAddress: wallet.address});
        if(challenge.status !== 201) return {success: false, step: 'challenge', err: challenge};
        
        const challengeRes = challenge.data.challenge;
        const signature = await wallet.signMessage(challengeRes.message);

        const login = await reqBody.post("https://foundation-api.prod.blast.io/v1/auth/wallet/login", JSON.stringify({
            walletAddress: wallet.address,
            signature: signature,
            message: challengeRes.message,
            hmac: challengeRes.hmac,
            expiresOn: challengeRes.expiresOn
        }));

        return {success: true, accessToken: login.data.accessToken};
    } catch(e) {return {success: false, err: e}}
}

async function associateToken(reqBody, clientSigner, foundationToken) {
    try {

        const sign = await generateSignature(clientSigner, "POST", "https://foundation-api.prod.blast.io/v1/extension/associate-token", {blastFoundationToken: foundationToken}, "extension");
        if(!sign.success) return {success: false, err: sign.err};

        reqBody.defaults.headers['X-Blast-Signature'] = sign.signature;
        reqBody.defaults.headers['X-Blast-Public-Key'] = sign.publicKey;
        reqBody.defaults.headers['X-Blast-Timestamp'] = sign.timestamp;
        reqBody.defaults.headers['X-Blast-Client-Type'] = 'extension';

        const associate = await reqBody.post("https://foundation-api.prod.blast.io/v1/extension/associate-token", {blastFoundationToken: foundationToken});

        return {success: true};
    } catch(e) {return {success: false, err: e}}
}

async function confirmDevice(reqBody, clientSigner, secret) {
    try {
        const sign = await generateSignature(clientSigner, "POST", "https://foundation-api.prod.blast.io/v1/extension/confirm-device", {pin: secret}, "extension");

        reqBody.defaults.headers['X-Blast-Signature'] = sign.signature;
        reqBody.defaults.headers['X-Blast-Public-Key'] = sign.publicKey;
        reqBody.defaults.headers['X-Blast-Timestamp'] = sign.timestamp;
        reqBody.defaults.headers['X-Blast-Client-Type'] = 'extension';

        const confirm = await reqBody.post("https://foundation-api.prod.blast.io/v1/extension/confirm-device", {pin: secret});

        return {success: true};
    } catch(e) {return {success: false, err: e}}
}

async function claimTokens(reqBody, clientSigner) {
    try {
        const sign = await generateSignature(clientSigner, "GET", "https://foundation-api.prod.blast.io/v1/common/claims", "", "device");

        reqBody.defaults.headers['X-Blast-Signature'] = sign.signature;
        reqBody.defaults.headers['X-Blast-Public-Key'] = sign.publicKey;
        reqBody.defaults.headers['X-Blast-Timestamp'] = sign.timestamp;
        reqBody.defaults.headers['X-Blast-Client-Type'] = 'device';

        let tokens = await reqBody.get("https://foundation-api.prod.blast.io/v1/common/claims");
        tokens.data.claims[0].requireImported = true;

        const claimSig = await generateSignature(clientSigner, "POST", "https://foundation-api.prod.blast.io/v1/device/claim", {claims: tokens.data.claims}, "device");

        reqBody.defaults.headers['X-Blast-Signature'] = claimSig.signature;
        reqBody.defaults.headers['X-Blast-Public-Key'] = claimSig.publicKey;
        reqBody.defaults.headers['X-Blast-Timestamp'] = claimSig.timestamp;
        reqBody.defaults.headers['X-Blast-Client-Type'] = 'device';

        const claim = await reqBody.post("https://foundation-api.prod.blast.io/v1/device/claim", {claims: tokens.data.claims});

        return {success: true};
    } catch(e) {return {success: false, err: e}}
}

async function claimDrop(reqBody, wallet) {
    try {
        const accessToken = await loginBlast(reqBody, wallet);
        if(!accessToken.success) return {success: false, err: accessToken.err};

        reqBody.defaults.headers['Cookie'] = 'accessToken=' + accessToken.accessToken;
        reqBody.defaults.headers['Accept-Encoding'] = 'application/json';

        const foundationAccessToken = await loginFoundation(reqBody, wallet);
        if(!foundationAccessToken.success) return {success: false, err: foundationAccessToken.err};

        reqBody.defaults.headers['Cookie'] = `foundationAccessToken=${foundationAccessToken.accessToken}; accessToken=${accessToken.accessToken}`;

        const foundationSigner = new ethers.Wallet.createRandom();

        const addToken = await associateToken(reqBody, foundationSigner, foundationAccessToken.accessToken);
        if(!addToken.success) return {success: false, err: addToken.err};

        const appSigner = new ethers.Wallet.createRandom();

        const secret = await checkSecret(reqBody, appSigner);
        if(!secret.success) return {success: false, err: secret.err};

        const confirm = await confirmDevice(reqBody, foundationSigner, secret.secret);
        if(!confirm.success) return {success: false, err: confirm.err};

        const claim = await claimTokens(reqBody, appSigner);
        if(!claim.success) return {success: false, err: claim.err};

        return {success: true};
    } catch(e) {return {success: false, err: e}}
}

async function claimAirdrop() {
    try {
        const wallets = fs.readFileSync('./data/wallets.txt', 'utf8').split('\n');
        const proxys = fs.readFileSync('./data/proxys.txt', 'utf8').split('\n');

        for(let i = 0; i < wallets.length; i++) {
            await sleep(5000 * i)
            const wallet = new ethers.Wallet(wallets[i]);

            const proxy = proxys.length == wallets.length ? proxys[i] : proxys[getRandomInt(0, proxys.length)];

            logger.info(`[${i+1}/${wallets.length}] | ${wallet.address} | Claiming airdrop...`);

            let reqBody = generateReqBody(proxy);
            reqBody.defaults.headers["authority"] = "foundation-api.prod.blast.io";
            reqBody.defaults.headers["Origin"] = "https://airdrop.blast.io"
            reqBody.defaults.headers["Referer"] = "https://airdrop.blast.io";
    
            const response = await claimDrop(reqBody, wallet);
            if(!response.success) { logger.error(`[${i+1}/${wallets.length}] | ${wallet.address} | ${response.err}`); return; }
            
            logger.success(`[${i+1}/${wallets.length}] | ${wallet.address} | Successfully claimed tokens!`);
        }

        logger.success(`Claimed ${wallets.length} accounts.`);
    } catch(e) {return {success: false, err: e}}
}

claimAirdrop();