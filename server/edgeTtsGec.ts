// SPDX-License-Identifier: LGPL-3.0-or-later
// Ported from edge-tts 7.3.1's edge_tts/drm.py:
// https://github.com/rany2/edge-tts (LGPL-3.0-or-later).
// Microsoft uses this non-standard SHA-256/CS64 combination for v2 tokens.

export const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
export const CHROMIUM_FULL_VERSION = '143.0.3650.75';
export const SEC_MS_GEC_VERSION = `2-${CHROMIUM_FULL_VERSION}`;

const SHA256_INITIAL = [
  0x6a09e667n, 0xbb67ae85n, 0x3c6ef372n, 0xa54ff53an,
  0x510e527fn, 0x9b05688cn, 0x1f83d9abn, 0x5be0cd19n
];
const SHA256_STATE = [
  0xfd9fbea2n, 0x91243ce7n, 0xbe499094n, 0xcd2e1e0an,
  0x6c006f49n, 0x04bd35abn, 0xfeb0a7e4n, 0x03effbd2n
];
const SHA256_SCHEDULE = [
  0xeb24bf9en, 0x1558691fn, 0xa0c09ee2n, 0x0cfa32ban,
  0xa622ee8cn, 0xd1dd9491n, 0xc0dd25a0n, 0xf9e70ab6n,
  0xf0c31573n, 0x7058ce4en, 0x7188e606n, 0x00e5ab33n,
  0xd258b060n, 0x72766564n
];
const SHA256_ROUND_CONSTANTS = [
  0x428a2f98n, 0x71374491n, 0xb5c0fbcfn, 0xe9b5dba5n,
  0x3956c25bn, 0x59f111f1n, 0x923f82a4n, 0xab1c5ed5n,
  0xd807aa98n, 0x12835b01n, 0x243185ben, 0x550c7dc3n,
  0x72be5d74n, 0x80deb1fen, 0x9bdc06a7n, 0xc19bf174n,
  0xe49b69c1n, 0xefbe4786n, 0x0fc19dc6n, 0x240ca1ccn,
  0x2de92c6fn, 0x4a7484aan, 0x5cb0a9dcn, 0x76f988dan,
  0x983e5152n, 0xa831c66dn, 0xb00327c8n, 0xbf597fc7n,
  0xc6e00bf3n, 0xd5a79147n, 0x06ca6351n, 0x14292967n,
  0x27b70a85n, 0x2e1b2138n, 0x4d2c6dfcn, 0x53380d13n,
  0x650a7354n, 0x766a0abbn, 0x81c2c92en, 0x92722c85n,
  0xa2bfe8a1n, 0xa81a664bn, 0xc24b8b70n, 0xc76c51a3n,
  0xd192e819n, 0xd6990624n, 0xf40e3585n, 0x106aa070n,
  0x19a4c116n, 0x1e376c08n, 0x2748774cn, 0x34b0bcb5n,
  0x391c0cb3n, 0x4ed8aa4an, 0x5b9cca4fn, 0x682e6ff3n,
  0x748f82een, 0x78a5636fn, 0x84c87814n, 0x8cc70208n,
  0x90befffan, 0xa4506cebn, 0xbef9a3f7n, 0xc67178f2n
];
const CS64_COEFFICIENTS: Array<[bigint, bigint]> = [
  [0xe82e91b1n, 0xb32700d0n], [0x44de24c6n, 0x88dff51dn],
  [0x3beb65bcn, 0x29514038n], [0xc89c5933n, 0xb328cbdfn],
  [0x8d1ec211n, 0xd405b4d5n], [0x314ef5d5n, 0x26e55f3cn],
  [0xe92491b1n, 0x607801c6n], [0xf0a5b9d5n, 0x82b2c1fbn],
  [0x06064cf3n, 0xfa51a3dan], [0xda79fa60n, 0x207cc464n],
  [0xbed20560n, 0x3c3c74f3n], [0x89f9c9f8n, 0xd2d14b61n],
  [0x35fa38c6n, 0xbb04a2c1n], [0xcb49e3c6n, 0xc5626167n]
];

const u32 = (value: bigint) => BigInt.asUintN(32, value);
const rotr = (value: bigint, bits: bigint) => u32((value >> bits) | (value << (32n - bits)));
const rol16 = (value: bigint) => u32((u32(value) << 16n) | (u32(value) >> 16n));
const sigma0 = (value: bigint) => u32(rotr(value, 7n) ^ rotr(value, 18n) ^ (value >> 3n));
const sigma1 = (value: bigint) => u32(rotr(value, 17n) ^ rotr(value, 19n) ^ (value >> 10n));

const sha256Rounds = (state: bigint[], words: bigint[], firstRound = 0) => {
  let [a, b, c, d, e, f, g, h] = state;
  const constants = [...SHA256_ROUND_CONSTANTS];
  if (firstRound === 14) constants[14] = 0xc9dc06a7n;

  for (let index = firstRound; index < 64; index += 1) {
    const bigSigma1 = rotr(e, 6n) ^ rotr(e, 11n) ^ rotr(e, 25n);
    const choose = g ^ (e & (f ^ g));
    const t1 = h + bigSigma1 + choose + constants[index] + words[index];
    const bigSigma0 = rotr(a, 2n) ^ rotr(a, 13n) ^ rotr(a, 22n);
    const majority = (a & b) | (c & (a | b));
    const t2 = bigSigma0 + majority;
    [a, b, c, d, e, f, g, h] = [u32(t1 + t2), a, b, c, u32(d + t1), e, f, g];
  }
  return [a, b, c, d, e, f, g, h];
};

const expandSha256Schedule = (words: bigint[], firstWord = 16) => {
  for (let index = firstWord; index < 64; index += 1) {
    words.push(u32(sigma1(words[index - 2]) + words[index - 7] + sigma0(words[index - 15]) + words[index - 16]));
  }
};

const readBigEndianWord = (data: Buffer, offset: number) => BigInt(data.readUInt32BE(offset));

const sha256Init = (data: Buffer) => {
  const words = Array<bigint>(14).fill(0n);
  words.push(BigInt(`0x${data.subarray(0, 3).toString('hex')}`));
  words.push(readBigEndianWord(data, 3));
  for (let index = 16; index < 30; index += 1) {
    let value = SHA256_SCHEDULE[index - 16];
    if (index - 2 >= 14) {
      value += index === 16 ? sigma1(words[index - 2]) ^ 0x000b92c0n : sigma1(words[index - 2]);
    }
    if (index - 7 >= 14) value += words[index - 7];
    if (index - 15 >= 14) {
      value += index === 29 ? sigma0(words[index - 15]) ^ 0x059c0b80n : sigma0(words[index - 15]);
    }
    words.push(u32(value));
  }
  words.push(u32(sigma1(words[28]) + words[23] + sigma0(words[15]) + words[14] + 0xc9dc06a7n - SHA256_ROUND_CONSTANTS[14]));
  expandSha256Schedule(words, 31);
  const working = sha256Rounds(SHA256_STATE, words, 14);
  return working.map((value, index) => u32(value + SHA256_INITIAL[index]));
};

const sha256Digest = (data: Buffer) => {
  if (data.length < 7) throw new Error('Token salt must contain at least seven bytes');
  const length = 57 + data.length;
  const zeroCount = ((55 - length) % 64 + 64) % 64;
  const bitLength = BigInt(length * 8);
  const lengthBytes = Buffer.alloc(8);
  lengthBytes.writeBigUInt64BE(bitLength);
  const padded = Buffer.concat([data.subarray(7), Buffer.from([0x80]), Buffer.alloc(zeroCount), lengthBytes]);
  let state = sha256Init(data.subarray(0, 7));

  for (let offset = 0; offset < padded.length; offset += 64) {
    const words = Array.from({ length: 16 }, (_, index) => readBigEndianWord(padded, offset + index * 4));
    expandSha256Schedule(words);
    const working = sha256Rounds(state, words);
    state = working.map((value, index) => u32(value + state[index]));
  }

  const result = Buffer.alloc(32);
  state.forEach((value, index) => result.writeUInt32BE(Number(value), index * 4));
  return result;
};

const wordsLe4Even = (data: Buffer) => {
  const padded = Buffer.concat([data, Buffer.alloc((4 - data.length % 4) % 4)]);
  const words = Array.from({ length: padded.length / 4 }, (_, index) => BigInt(padded.readUInt32LE(index * 4)));
  if (words.length % 2) words.push(0n);
  return words;
};

const cs64Digest = (data: Buffer, digest: Buffer): [bigint, bigint] => {
  const keyA = BigInt(digest.readUInt32LE(0)) | 1n;
  const keyB = BigInt(digest.readUInt32LE(4)) | 1n;
  const factors = [u32(keyA * 0x82893933n), u32(keyB * 0x82893933n)];
  const terms = CS64_COEFFICIENTS.map(([coefficient], index) => u32(coefficient * factors[index % 2]));
  const offsets = CS64_COEFFICIENTS.map(([, offset]) => offset);

  wordsLe4Even(Buffer.concat([Buffer.from([0]), data])).forEach((word, index) => {
    let term = word * (index % 2 === 0 ? keyA : keyB);
    let offset = rol16(word) * (index % 2 === 0 ? 0xef0569fbn : 0xc31713dbn);
    if (index === 0) {
      term += 0xf2f90b1an * factors[0];
      offset += 0x0b1a0000n;
    }
    terms.push(u32(term));
    offsets.push(u32(offset));
  });

  let swapAcc = 0n;
  let swapLast = 0n;
  let state = 0n;
  let acc = 0n;
  for (let index = 0; index < terms.length; index += 2) {
    const [x, y] = [terms[index], terms[index + 1]];
    let t = rol16(u32(offsets[index] + x));
    let q = u32(t * 0x76f50f34n);
    swapAcc += u32(rol16(q) * 0xc3efea97n + q);
    t = rol16(u32(offsets[index + 1] + y));
    q = u32(t * 0x1881ce3cn);
    swapLast = u32(rol16(q) * 0x35bd1ec9n + q);
    swapAcc = u32(swapAcc + swapLast);

    state = u32(state * keyA + x);
    state = u32(rol16(state) * 0xcf98b111n);
    state = u32(rol16(state) * 0x87085b9fn);
    state = u32(rol16(state) * 0x12ceb96dn);
    state = u32(rol16(state) * 0x257e1d83n);
    acc += state;
    t = u32(state * keyB + y);
    t = u32(rol16(t) * 0xa27416f5n);
    t = u32(rol16(t) * 0xd38396ffn);
    state = u32(rol16(u32(rol16(t) * 0x7c932b89n)) * 0xbfa49f69n);
    acc = u32(acc + state);
  }
  return [swapLast ^ state, swapAcc ^ acc];
};

const littleEndianHex = (words: [bigint, bigint]) => {
  const output = Buffer.alloc(8);
  output.writeUInt32LE(Number(words[0]), 0);
  output.writeUInt32LE(Number(words[1]), 4);
  return output.toString('hex').toUpperCase();
};

export const generateSecMsGecV2 = (unixTimestamp = Date.now() / 1000) => {
  const bucket = BigInt(Math.floor((unixTimestamp + 11644473600) / 300)) * 300n;
  const ticks = bucket * 10_000_000n;
  const data = Buffer.from(`${ticks}${TRUSTED_CLIENT_TOKEN}`, 'ascii');
  const digest = sha256Digest(data);
  return `${littleEndianHex(cs64Digest(data, digest))}-${digest.toString('hex').toUpperCase()}`;
};
