const axios = require('axios-https-proxy-fix');
const { SocksProxyAgent } = require('socks-proxy-agent');

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function sleep (ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function generateReqBody(proxy) {

    // const proxyParts = proxy.split(':');
    // const proxyData = { protocol: 'https', host: proxyParts[2], port: proxyParts[3], auth: {username: proxyParts[0], password: proxyParts[1]} };

    const reqBody = axios.create({
        "headers": {
            "Accept": "*/*",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "accept-language": "bg",
            "Content-Type": "application/json",
            "sec-ch-ua": "\"Not_A Brand\";v=\"8\", \"Chromium\";v=\"120\", \"Google Chrome\";v=\"120\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"Windows\"",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-site",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        "timeout": 30000,
        // proxy: proxyData,
        httpsAgent: new SocksProxyAgent(proxy),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
    });

    return reqBody;
}

module.exports = { getRandomInt, sleep, generateReqBody }