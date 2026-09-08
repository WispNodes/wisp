// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/WispVault.sol";

/// Deploys WispVault on Robinhood Chain. NEVER verified on the explorer.
/// env: PRIVATE_KEY (deployer/owner), NVDA (reward token), SIGNER (claim key addr)
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        // tokenized NVIDIA (NVDA) on Robinhood Chain (override via env if needed)
        address nvda = vm.envOr("NVDA", address(0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC));
        address signer = vm.envAddress("SIGNER");

        vm.startBroadcast(pk);
        WispVault vault = new WispVault(nvda, signer);
        vm.stopBroadcast();

        console2.log("WispVault:", address(vault));
        console2.log("NVDA:", nvda);
        console2.log("signer:", signer);
    }
}
