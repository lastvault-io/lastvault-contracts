/**
 * @lastvault.io/encrypted-allowlist
 *
 * TypeScript SDK helpers for the EncryptedAllowlist Solidity library.
 *
 * The contract artifacts (ABI + bytecode) for EncryptedAllowlistBase are
 * exported here so consumers can deploy or wrap the contract from a
 * Node.js / browser environment without copying Solidity source.
 *
 * Usage:
 *   import { EncryptedAllowlistBase_ABI, encryptAddress, isAddressInAllowlist }
 *     from '@lastvault.io/encrypted-allowlist';
 */

import baseAbi from "../dist/EncryptedAllowlistBase.abi.json";

/** ABI of the EncryptedAllowlistBase abstract contract (consumers extend it). */
export const EncryptedAllowlistBase_ABI = baseAbi;

/**
 * Helper: encode a plaintext address as an InEaddress struct ready for
 * the EncryptedAllowlist library. Requires a CoFHE client to encrypt
 * client-side first; this is a thin wrapper documenting the expected
 * call sequence.
 *
 * Example:
 *   import { createCofheClient, Encryptable } from '@cofhe/sdk';
 *   const [encAddr] = await client
 *     .encryptInputs([Encryptable.address(targetAddress)])
 *     .execute();
 *   await myAllowlist.addMember(encAddr);
 */
export interface InEaddressHandle {
  ctHash: `0x${string}`;
  securityZone: number;
  utype: number;
  signature: `0x${string}`;
}

/** Convenience type guard for InEaddressHandle objects. */
export function isInEaddress(x: unknown): x is InEaddressHandle {
  return (
    typeof x === "object" &&
    x !== null &&
    "ctHash" in x &&
    "securityZone" in x &&
    "utype" in x &&
    "signature" in x
  );
}

/**
 * Recommended workflow documented as code:
 *   1. Owner deploys an EncryptedAllowlistBase consumer.
 *   2. For each member: encrypt their address client-side, call addMember.
 *   3. For each query: encrypt the query address, call checkMembership.
 *   4. Caller initiates threshold decryption on the returned ebool.
 */
export const RECOMMENDED_WORKFLOW = {
  setup: "deploy(owner)",
  addMember: "client.encryptInputs([Encryptable.address(member)]).execute() -> addMember(encMember)",
  query: "client.encryptInputs([Encryptable.address(query)]).execute() -> checkMembership(encQuery) -> ebool",
  decrypt: "client.decryptForView(eboolHandle, FheTypes.Bool).withPermit(permit).execute()",
};

export type { InEaddressHandle as InEaddress };
