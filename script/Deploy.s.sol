// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/LastVaultInheritance.sol";

contract DeployLastVault is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address ownerAddr = vm.envAddress("OWNER_ADDRESS");
        address heirAddr = vm.envAddress("HEIR_ADDRESS");
        uint256 timeoutSeconds = vm.envOr("TIMEOUT_SECONDS", uint256(7776000)); // default 90 days
        bytes memory payload = vm.envBytes("ENCRYPTED_PAYLOAD");

        vm.startBroadcast(deployerPrivateKey);

        LastVaultInheritance vault = new LastVaultInheritance(
            ownerAddr,
            heirAddr,
            timeoutSeconds,
            payload
        );

        console.log("LastVaultInheritance deployed at:", address(vault));
        console.log("Owner:", ownerAddr);
        console.log("Heir:", heirAddr);
        console.log("Timeout:", timeoutSeconds, "seconds");

        vm.stopBroadcast();
    }
}
