// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {FHE, InEaddress, ebool} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {EncryptedAllowlist} from "@lastvault.io/encrypted-allowlist/contracts/EncryptedAllowlist.sol";

/**
 * @title PrivateDAO
 * @notice Example: A private DAO where membership is encrypted on-chain.
 *         Members can call `voteAnonymously` — the contract verifies they
 *         are members without revealing which member voted.
 */
contract PrivateDAO {
    using EncryptedAllowlist for EncryptedAllowlist.List;

    EncryptedAllowlist.List private _members;
    address public admin;

    uint256 public yesVotes;
    uint256 public noVotes;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    uint256 public currentProposal;

    event MemberAdded(uint256 idx);
    event ProposalVoted(uint256 indexed proposalId, bool support);

    constructor(address _admin) {
        admin = _admin;
    }

    function addMember(InEaddress calldata _addr) external {
        require(msg.sender == admin, "DAO: not admin");
        _members.add(_addr);
        emit MemberAdded(_members.size() - 1);
    }

    /**
     * @notice Members vote by submitting their encrypted address.
     *         The contract verifies membership via FHE.eq OR-reduce.
     *         The result is an encrypted boolean — only after threshold
     *         decryption does the actual vote count.
     *
     * @dev In production, you'd want to:
     *      - Track per-address voting in a way that doesn't break privacy
     *        (e.g. encrypted ballot ID)
     *      - Gate finalisation by threshold decryption of the membership ebool
     */
    function voteAnonymously(InEaddress calldata _myAddress, bool _support) external {
        require(!hasVoted[currentProposal][msg.sender], "DAO: already voted");

        ebool isMember = _members.isAllowed(_myAddress);
        FHE.allowPublic(isMember);
        // In production, finalise the vote tally only after threshold decryption
        // of isMember confirms the caller is a member.

        hasVoted[currentProposal][msg.sender] = true;
        if (_support) {
            yesVotes++;
        } else {
            noVotes++;
        }
        emit ProposalVoted(currentProposal, _support);
    }

    function startNewProposal() external {
        require(msg.sender == admin, "DAO: not admin");
        currentProposal++;
        yesVotes = 0;
        noVotes = 0;
    }
}
