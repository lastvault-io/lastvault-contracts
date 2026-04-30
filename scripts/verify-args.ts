/**
 * Constructor arguments for LastVaultFHE verification on Arbiscan.
 *
 * Usage:
 *   npx hardhat verify --network arbitrumSepolia \
 *     --constructor-args scripts/verify-args.ts \
 *     <DEPLOYED_ADDRESS>
 *
 * Note: the encrypted values (InEaddress, InEuint128, InEuint64, InEuint8)
 * are structs with { data, securityZone, utype, signature } fields.
 * Arbiscan verification typically cannot match these exactly because
 * the ciphertext varies per encryption. If verification fails due to
 * constructor args mismatch, that's expected with FHE contracts —
 * the bytecode is still readable on-chain.
 */

const timeoutSeconds = parseInt(process.env.TIMEOUT_SECONDS || "7776000");

// Placeholder structs — real deploy values are saved in the deployment receipt
// (the JSON output from encrypt-and-deploy.ts). Use those if re-verifying.
const emptyEncrypted = {
  ctHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
  securityZone: 0,
  utype: 0,
  signature: "0x",
};

module.exports = [
  timeoutSeconds,
  emptyEncrypted,  // _encryptedHeir (InEaddress)
  emptyEncrypted,  // _payloadHi (InEuint128)
  emptyEncrypted,  // _payloadLo (InEuint128)
  emptyEncrypted,  // _encryptedTimeout (InEuint64)
  emptyEncrypted,  // _maxAttempts (InEuint8)
];
