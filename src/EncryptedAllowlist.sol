// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {FHE, eaddress, ebool, InEaddress, euint8} from "@fhenixprotocol/cofhe-contracts/FHE.sol";

/**
 * @title EncryptedAllowlist
 * @author Divara Technology Inc. (lastvault.io)
 * @notice Reusable primitive for encrypted access control on Fhenix.
 *
 * @dev Extracted from LastVaultFHE Wave 1-2 work and generalized as a building
 *      block for the Fhenix ecosystem. The same `FHE.eq(eaddress, eaddress)`
 *      pattern that powers private inheritance applies to any on-chain
 *      encrypted access control:
 *
 *        - Private DAO membership (vote without revealing identity)
 *        - Anonymous authorization (grant access without exposing grantee)
 *        - Encrypted KYC allowlists (regulator can verify without doxxing users)
 *        - Confidential whitelists for token sales / NFT mints
 *        - Private guild systems (membership hidden from competitors)
 *
 *      USAGE:
 *        1. Deploy `EncryptedAllowlist` (or inherit from `EncryptedAllowlistBase`)
 *        2. Owner adds encrypted addresses via `add(InEaddress)`
 *        3. Anyone calls `isAllowed(InEaddress)` — returns encrypted boolean
 *        4. Caller initiates threshold decryption to learn the result
 *
 *      KEY DESIGN POINT:
 *        Every membership check returns an encrypted boolean. There is no
 *        path that reveals "yes you're in" vs "no you're not" via revert
 *        messages, gas usage, or storage reads. The single ebool result
 *        is the only thing decryptable, and only by parties with permission.
 *
 *  Wave 3 deliverable for the Fhenix Privacy-by-Design Buildathon.
 */
library EncryptedAllowlist {
    /**
     * @dev The on-chain storage layout for an encrypted allowlist.
     *      Stored in caller's contract; this library operates on it.
     */
    struct List {
        eaddress[] entries;       // Encrypted addresses (invisible on-chain)
        uint256 count;            // Plaintext count is OK — knowing list SIZE
                                  // doesn't reveal membership
    }

    // ============ Mutators ============

    /**
     * @notice Add an encrypted address to the allowlist.
     * @dev The added address is encrypted client-side via @cofhe/sdk
     *      before being submitted. The contract never sees plaintext.
     */
    function add(List storage self, InEaddress calldata _addr) internal {
        eaddress encrypted = FHE.asEaddress(_addr);
        FHE.allowThis(encrypted);
        self.entries.push(encrypted);
        self.count = self.entries.length;
    }

    /**
     * @notice Replace an existing entry at the given index.
     */
    function replace(List storage self, uint256 idx, InEaddress calldata _addr) internal {
        require(idx < self.entries.length, "Allowlist: out of bounds");
        eaddress encrypted = FHE.asEaddress(_addr);
        FHE.allowThis(encrypted);
        self.entries[idx] = encrypted;
    }

    /**
     * @notice Remove an entry by swapping with the last and popping.
     * @dev Note: order changes. For an order-preserving remove, manage
     *      indices in caller contract.
     */
    function remove(List storage self, uint256 idx) internal {
        require(idx < self.entries.length, "Allowlist: out of bounds");
        uint256 last = self.entries.length - 1;
        if (idx != last) {
            self.entries[idx] = self.entries[last];
        }
        self.entries.pop();
        self.count = self.entries.length;
    }

    // ============ Queries ============

    /**
     * @notice Check if an encrypted address is in the allowlist.
     * @dev Returns an encrypted boolean. Decryption requires threshold
     *      network and ACL permission.
     *
     *      Implementation: OR-reduces FHE.eq() results across all entries.
     *      For a list of N members:
     *        result = eq(query, list[0]) OR eq(query, list[1]) OR ...
     *
     *      The result is true (encrypted) if and only if the query
     *      address matches one of the entries.
     */
    function isAllowed(List storage self, InEaddress calldata _query)
        internal
        returns (ebool)
    {
        require(self.entries.length > 0, "Allowlist: empty");

        eaddress queryEnc = FHE.asEaddress(_query);
        FHE.allowThis(queryEnc);

        // Initialize accumulator with first comparison
        ebool acc = FHE.eq(queryEnc, self.entries[0]);
        FHE.allowThis(acc);

        // OR-reduce: for each subsequent entry, OR the result in
        // (we use the identity: a OR b == NOT(NOT a AND NOT b))
        // since the FHE library may not expose `or` directly, we
        // compose it from `and` and `not`.
        for (uint256 i = 1; i < self.entries.length; i++) {
            ebool match_i = FHE.eq(queryEnc, self.entries[i]);
            FHE.allowThis(match_i);
            acc = _or(acc, match_i);
            FHE.allowThis(acc);
        }

        return acc;
    }

    /**
     * @notice Encrypted boolean OR — composed from AND + NOT.
     * @dev a OR b == NOT(NOT a AND NOT b)
     */
    function _or(ebool a, ebool b) private returns (ebool) {
        ebool notA = FHE.not(a);
        FHE.allowThis(notA);
        ebool notB = FHE.not(b);
        FHE.allowThis(notB);
        ebool bothFalse = FHE.and(notA, notB);
        FHE.allowThis(bothFalse);
        return FHE.not(bothFalse);
    }

    /**
     * @notice Get the size of the allowlist (plaintext is fine — size is not sensitive).
     */
    function size(List storage self) internal view returns (uint256) {
        return self.entries.length;
    }

    /**
     * @notice Get the encrypted entry at index — useful for caller contracts
     *         that want to compose more complex predicates.
     */
    function entryAt(List storage self, uint256 idx) internal view returns (eaddress) {
        require(idx < self.entries.length, "Allowlist: out of bounds");
        return self.entries[idx];
    }
}

/**
 * @title EncryptedAllowlistBase
 * @notice Convenience base contract that wraps the library with an Ownable pattern.
 *         Inherit from this to get a ready-to-use encrypted allowlist contract.
 */
abstract contract EncryptedAllowlistBase {
    using EncryptedAllowlist for EncryptedAllowlist.List;

    EncryptedAllowlist.List internal _list;
    address public allowlistOwner;

    event MemberAdded(uint256 indexed idx);
    event MemberRemoved(uint256 indexed idx);
    event MemberReplaced(uint256 indexed idx);

    modifier onlyAllowlistOwner() {
        require(msg.sender == allowlistOwner, "AllowlistBase: not owner");
        _;
    }

    constructor(address _owner) {
        allowlistOwner = _owner;
    }

    function addMember(InEaddress calldata _addr) external onlyAllowlistOwner {
        _list.add(_addr);
        emit MemberAdded(_list.count - 1);
    }

    function replaceMember(uint256 idx, InEaddress calldata _addr) external onlyAllowlistOwner {
        _list.replace(idx, _addr);
        emit MemberReplaced(idx);
    }

    function removeMember(uint256 idx) external onlyAllowlistOwner {
        _list.remove(idx);
        emit MemberRemoved(idx);
    }

    function memberCount() external view returns (uint256) {
        return _list.size();
    }

    /// @notice Check if `_query` is allowed. Returns encrypted boolean.
    ///         Caller must initiate threshold decryption to learn the result.
    function checkMembership(InEaddress calldata _query) external returns (ebool result) {
        result = _list.isAllowed(_query);
        FHE.allowPublic(result);
    }
}
