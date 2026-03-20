// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/LastVaultInheritance.sol";

contract LastVaultInheritanceTest is Test {
    LastVaultInheritance public vault;

    address owner = address(0x1);
    address heir = address(0x2);
    address attacker = address(0x3);
    uint256 timeout = 90 days;
    bytes payload = hex"deadbeef1234567890abcdef";

    function setUp() public {
        vault = new LastVaultInheritance(owner, heir, timeout, payload);
    }

    // ===== DEPLOYMENT =====

    function test_InitialState() public view {
        assertEq(vault.owner(), owner);
        assertEq(vault.heir(), heir);
        assertEq(vault.timeoutPeriod(), timeout);
        assertEq(vault.encryptedPayload(), payload);
        assertEq(vault.lastPingTimestamp(), block.timestamp);
    }

    function test_RevertOnZeroOwner() public {
        vm.expectRevert("LastVault: Invalid owner address");
        new LastVaultInheritance(address(0), heir, timeout, payload);
    }

    function test_RevertOnZeroHeir() public {
        vm.expectRevert("LastVault: Invalid heir address");
        new LastVaultInheritance(owner, address(0), timeout, payload);
    }

    function test_RevertOnZeroTimeout() public {
        vm.expectRevert("LastVault: Timeout must be > 0");
        new LastVaultInheritance(owner, heir, 0, payload);
    }

    // ===== PING =====

    function test_PingResetsTimestamp() public {
        vm.warp(block.timestamp + 7 days);
        vm.prank(owner);
        vault.ping();
        assertEq(vault.lastPingTimestamp(), block.timestamp);
    }

    function test_PingEmitsEvent() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit LastVaultInheritance.Pinged(owner, block.timestamp);
        vault.ping();
    }

    function test_PingRevertsForNonOwner() public {
        vm.prank(attacker);
        vm.expectRevert("LastVault: Not the owner");
        vault.ping();
    }

    function test_PingRevertsForHeir() public {
        vm.prank(heir);
        vm.expectRevert("LastVault: Not the owner");
        vault.ping();
    }

    // ===== SET HEIR =====

    function test_SetHeirChangesHeir() public {
        address newHeir = address(0x4);
        vm.prank(owner);
        vault.setHeir(newHeir);
        assertEq(vault.heir(), newHeir);
    }

    function test_SetHeirEmitsEvent() public {
        address newHeir = address(0x4);
        vm.prank(owner);
        vm.expectEmit(true, true, false, false);
        emit LastVaultInheritance.HeirChanged(heir, newHeir);
        vault.setHeir(newHeir);
    }

    function test_SetHeirRevertsForNonOwner() public {
        vm.prank(attacker);
        vm.expectRevert("LastVault: Not the owner");
        vault.setHeir(address(0x4));
    }

    function test_SetHeirRevertsForZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert("LastVault: Invalid heir address");
        vault.setHeir(address(0));
    }

    // ===== UPDATE PAYLOAD =====

    function test_UpdatePayload() public {
        bytes memory newPayload = hex"cafebabe";
        vm.prank(owner);
        vault.updatePayload(newPayload);
        assertEq(vault.encryptedPayload(), newPayload);
    }

    function test_UpdatePayloadResetsPing() public {
        vm.warp(block.timestamp + 30 days);
        bytes memory newPayload = hex"cafebabe";
        vm.prank(owner);
        vault.updatePayload(newPayload);
        assertEq(vault.lastPingTimestamp(), block.timestamp);
    }

    function test_UpdatePayloadRevertsForNonOwner() public {
        vm.prank(attacker);
        vm.expectRevert("LastVault: Not the owner");
        vault.updatePayload(hex"cafebabe");
    }

    // ===== CLAIM =====

    function test_ClaimAfterTimeout() public {
        vm.warp(block.timestamp + timeout + 1);
        vm.prank(heir);
        bytes memory result = vault.claim();
        assertEq(result, payload);
    }

    function test_ClaimEmitsEvent() public {
        vm.warp(block.timestamp + timeout + 1);
        vm.prank(heir);
        vm.expectEmit(true, false, false, false);
        emit LastVaultInheritance.SecretClaimed(heir);
        vault.claim();
    }

    function test_ClaimRevertsBeforeTimeout() public {
        vm.warp(block.timestamp + timeout - 1);
        vm.prank(heir);
        vm.expectRevert("LastVault: Owner is still alive (timeout not reached)");
        vault.claim();
    }

    function test_ClaimRevertsAtExactTimeout() public {
        vm.warp(block.timestamp + timeout);
        vm.prank(heir);
        vm.expectRevert("LastVault: Owner is still alive (timeout not reached)");
        vault.claim();
    }

    function test_ClaimRevertsForNonHeir() public {
        vm.warp(block.timestamp + timeout + 1);
        vm.prank(attacker);
        vm.expectRevert("LastVault: Not the designated heir");
        vault.claim();
    }

    function test_ClaimRevertsForOwner() public {
        vm.warp(block.timestamp + timeout + 1);
        vm.prank(owner);
        vm.expectRevert("LastVault: Not the designated heir");
        vault.claim();
    }

    // ===== PING RESETS CLAIM WINDOW =====

    function test_PingResetsClaimWindow() public {
        // Fast forward 80 days (10 days before timeout)
        vm.warp(block.timestamp + 80 days);
        vm.prank(owner);
        vault.ping();

        // Fast forward another 80 days (still within new timeout)
        vm.warp(block.timestamp + 80 days);
        vm.prank(heir);
        vm.expectRevert("LastVault: Owner is still alive (timeout not reached)");
        vault.claim();

        // Fast forward past timeout from last ping
        vm.warp(block.timestamp + 11 days);
        vm.prank(heir);
        bytes memory result = vault.claim();
        assertEq(result, payload);
    }

    // ===== MULTIPLE CLAIMS =====

    function test_HeirCanClaimMultipleTimes() public {
        vm.warp(block.timestamp + timeout + 1);
        vm.prank(heir);
        vault.claim();

        // Heir can call claim again (read-only, no state change)
        vm.prank(heir);
        bytes memory result = vault.claim();
        assertEq(result, payload);
    }

    // ===== HEIR CHANGE + CLAIM =====

    function test_NewHeirCanClaimAfterChange() public {
        address newHeir = address(0x4);
        vm.prank(owner);
        vault.setHeir(newHeir);

        vm.warp(block.timestamp + timeout + 1);

        // Old heir cannot claim
        vm.prank(heir);
        vm.expectRevert("LastVault: Not the designated heir");
        vault.claim();

        // New heir can claim
        vm.prank(newHeir);
        bytes memory result = vault.claim();
        assertEq(result, payload);
    }
}
