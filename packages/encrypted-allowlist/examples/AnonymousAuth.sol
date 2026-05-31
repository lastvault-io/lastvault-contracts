// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {FHE, InEaddress, ebool} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {EncryptedAllowlist} from "@lastvault.io/encrypted-allowlist/contracts/EncryptedAllowlist.sol";

/**
 * @title AnonymousAuth
 * @notice Example: Anonymous authorization for sensitive actions. Authorised
 *         agents are encrypted on-chain; only the threshold network knows
 *         whether a caller is on the list.
 *
 *         Common use case: an emergency-pause guardian where the guardian's
 *         identity must be hidden to prevent targeted attacks, but the
 *         contract still needs to verify they're authorised before
 *         executing the pause.
 */
contract AnonymousAuth {
    using EncryptedAllowlist for EncryptedAllowlist.List;

    EncryptedAllowlist.List private _agents;
    address public admin;

    bool public paused;
    uint256 public actionsTriggered;

    event PauseAttempted();
    event PauseConfirmed();
    event AgentAdded(uint256 idx);

    constructor(address _admin) {
        admin = _admin;
    }

    function addAgent(InEaddress calldata _addr) external {
        require(msg.sender == admin, "Auth: not admin");
        _agents.add(_addr);
        emit AgentAdded(_agents.size() - 1);
    }

    /**
     * @notice An authorised agent can request a pause. The contract verifies
     *         their membership encrypted, then publishes the result for
     *         threshold decryption.
     */
    function requestPause(InEaddress calldata _myAddress) external {
        require(!paused, "Auth: already paused");

        ebool isAgent = _agents.isAllowed(_myAddress);
        FHE.allowPublic(isAgent);

        emit PauseAttempted();
        // The actual pause is confirmed after threshold decryption — see
        // confirmPause(). This two-phase pattern hides whether the caller
        // is actually an agent from the public view.
    }

    function confirmPause(bool _authorized, bytes calldata /*_signature*/) external {
        require(_authorized, "Auth: not authorized");
        // Production: verify _signature via FHE.publishDecryptResult against
        // a stored compound ebool, similar to LastVault's claim flow.
        paused = true;
        actionsTriggered++;
        emit PauseConfirmed();
    }

    function unpause() external {
        require(msg.sender == admin, "Auth: not admin");
        paused = false;
    }
}
