const { sha256 } = require('js-sha256');
const ethers = require('ethers');

const uc = function(t) {
    return sha256.create().update(t).digest('');
};

function M(t, e) {
    if (t instanceof Uint8Array)
        return !1 ? new Uint8Array(t) : t;
    if (typeof t == "string" && t.match(/^0x([0-9a-f][0-9a-f])*$/i)) {
        const r = new Uint8Array((t.length - 2) / 2);
        let s = 2;
        for (let i = 0; i < r.length; i++)
            r[i] = parseInt(t.substring(s, s + 2), 16),
            s += 2;
        return r
    }
}

function Ge(t) {
    const e = M(t, "data");
    return H(uc(e))
}

function ge(t) {
    return "0x" + t.map(e=>H(e).substring(2)).join("")
}
const xi = "0123456789abcdef";
function H(t) {
    let e = M(t);
    if(!e) e = t;
    let n = "0x";
    for (let r = 0; r < e.length; r++) {
        const s = e[r];
        n += xi[(s & 240) >> 4] + xi[s & 15]
    }
    return n
}

function Oe(t, e) {
    e != null && (Aa(e),
    t = t.normalize(e));
    let n = [];
    for (let r = 0; r < t.length; r++) {
        const s = t.charCodeAt(r);
        if (s < 128)
            n.push(s);
        else if (s < 2048)
            n.push(s >> 6 | 192),
            n.push(s & 63 | 128);
        else if ((s & 64512) == 55296) {
            r++;
            const i = t.charCodeAt(r);
            const a = 65536 + ((s & 1023) << 10) + (i & 1023);
            n.push(a >> 18 | 240),
            n.push(a >> 12 & 63 | 128),
            n.push(a >> 6 & 63 | 128),
            n.push(a & 63 | 128)
        } else
            n.push(s >> 12 | 224),
            n.push(s >> 6 & 63 | 128),
            n.push(s & 63 | 128)
    }
    return new Uint8Array(n)
}

async function generateSignature(wallet, method, url, body, device) {
    try {

        const s = Math.floor(Date.now() / 1e3).toString()
        const j = body? JSON.stringify(body) : '';
        const a = Ge(ge([Oe(s), new Uint8Array([10]), Oe(device), new Uint8Array([10]), Oe(method), new Uint8Array([10]), Oe(url), new Uint8Array([10]), Oe(j)]))
        const {r: c, s: o} = ethers.utils.splitSignature(await wallet._signingKey().signDigest(a))
        const f = ge([c, o])

        return { success: true, signature: f, publicKey: wallet.publicKey, timestamp: s };

    } catch(e) {return {success: false, err: e}}
}

module.exports = { generateSignature }