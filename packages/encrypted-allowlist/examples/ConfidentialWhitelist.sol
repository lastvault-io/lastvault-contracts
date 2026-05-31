// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {FHE, InEaddress, ebool} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {EncryptedAllowlistBase} from "@lastvault.io/encrypted-allowlist/contracts/EncryptedAllowlistBase.sol";

/**
 * @title ConfidentialWhitelist
 * @notice Example: A token-sale whitelist where eligible addresses are
 *         hidden on-chain. Useful for high-value or privacy-sensitive
 *         sales (allowlists are commonly leaked and abused).
 *
 *         Inherits from EncryptedAllowlistBase to get add/remove/replace
 *         + checkMembership for free.
 */
contract ConfidentialWhitelist is EncryptedAllowlistBase {
    uint256 public salePrice;
    mapping(address => uint256) public allocations;
    uint256 public remainingAllocation;

    event PurchaseAttempted(address indexed buyer);
    event PurchaseExecuted(address indexed buyer, uint256 amount);

    constructor(address _owner, uint256 _salePrice, uint256 _totalAllocation)
        EncryptedAllowlistBase(_owner)
    {
        salePrice = _salePrice;
        remainingAllocation = _totalAllocation;
    }

    /**
     * @notice Eligible addresses can attempt to purchase. The contract
     *         verifies eligibility via the encrypted allowlist; downstream
     *         settlement is gated by threshold decryption.
     *
     * @dev For a full implementation, allocation tracking would also be
     *      encrypted (using euint128 per-buyer) so the public can't
     *      enumerate who bought how much.
     */
    function attemptPurchase(InEaddress calldata _myAddress, uint256 _amount) external payable {
        require(msg.value >= _amount * salePrice, "Whitelist: underpaid");
        require(_amount <= remainingAllocation, "Whitelist: over allocation");

        ebool isEligible = this.checkMembership(_myAddress);
        // Publish for threshold network — settlement happens on a follow-up
        // tx after isEligible is decrypted as true.
        FHE.allowPublic(isEligible);

        emit PurchaseAttempted(msg.sender);
    }

    function executePurchaseAfterVerification(uint256 _amount) external {
        // In a real implementation, this would verify the published
        // decryption result via FHE.publishDecryptResult on isEligible.
        allocations[msg.sender] += _amount;
        remainingAllocation -= _amount;
        emit PurchaseExecuted(msg.sender, _amount);
    }
}
