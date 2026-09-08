// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice Minimal pons fee-escrow surface. pons credits a creator fee to an
/// escrow keyed by the recipient; the recipient itself must call claim().
interface IFeeEscrow {
    function claim() external;
    function claimToken(address token, uint256 amount) external;
    function balanceOf(address) external view returns (uint256);
}

/// @title WispVault
/// @notice Holds PRE-FUNDED tokenized NVIDIA (NVDA) and releases the exact reward
/// only against an admin-signed EIP-712 voucher. Nothing is minted — every payout
/// is a transfer of stock that already sat in the vault, so the on-chain balance is
/// honest proof of reserves for WISP providers and $WISP holders.
contract WispVault is EIP712, Ownable {
    IERC20 public immutable nvda;   // reward token (tokenized NVIDIA)
    address public signer;          // claim server key that co-signs approvals
    bool public paused;

    mapping(bytes32 => bool) public voucherUsed; // reward id => redeemed

    bytes32 public constant VOUCHER_TYPEHASH =
        keccak256("Reward(address to,uint256 amount,bytes32 id,uint256 deadline)");

    event Claimed(address indexed to, uint256 amount, bytes32 indexed id);
    event SignerSet(address indexed signer);
    event PausedSet(bool paused);

    constructor(address nvda_, address signer_)
        EIP712("WISP", "1")
        Ownable(msg.sender)
    {
        require(nvda_ != address(0), "nvda=0");
        require(signer_ != address(0), "signer=0");
        nvda = IERC20(nvda_);
        signer = signer_;
    }

    /// @notice Live proof of reserves: NVDA currently backing rewards.
    function reserves() external view returns (uint256) {
        return nvda.balanceOf(address(this));
    }

    // ---------------------------------------------------------------- claim ---

    /// @notice Redeem an approved reward. Anyone may relay the voucher, but the
    /// NVDA always goes to `to`. Single-use per `id`, expires at `deadline`.
    function claim(
        address to,
        uint256 amount,
        bytes32 id,
        uint256 deadline,
        bytes calldata sig
    ) external {
        require(!paused, "paused");
        require(block.timestamp <= deadline, "expired");
        require(!voucherUsed[id], "used");

        bytes32 structHash = keccak256(abi.encode(VOUCHER_TYPEHASH, to, amount, id, deadline));
        address rec = ECDSA.recover(_hashTypedDataV4(structHash), sig);
        require(rec == signer, "bad sig");

        voucherUsed[id] = true;
        require(nvda.transfer(to, amount), "transfer failed");
        emit Claimed(to, amount, id);
    }

    // ---------------------------------------------------------------- admin ---

    function setSigner(address s) external onlyOwner {
        require(s != address(0), "signer=0");
        signer = s;
        emit SignerSet(s);
    }

    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit PausedSet(p);
    }

    // ----------------------------------------------------------------- fees ---

    /// @notice Pull accrued NATIVE pons creator fees into this vault.
    function claimCreatorFees(address escrow) external onlyOwner {
        IFeeEscrow(escrow).claim();
    }

    /// @notice Pull accrued TOKEN-quoted pons creator fees (e.g. NVDA-paired) in.
    function claimCreatorFeesToken(address escrow, address token, uint256 amount) external onlyOwner {
        IFeeEscrow(escrow).claimToken(token, amount);
    }

    /// @notice How much creator fee this vault can currently claim from `escrow`.
    function pendingCreatorFees(address escrow) external view returns (uint256) {
        return IFeeEscrow(escrow).balanceOf(address(this));
    }

    receive() external payable {}
}
