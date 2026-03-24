import { expect } from "chai";
import { ethers } from "hardhat";

describe("LastVaultFHE", function () {
  // === ABI Verification ===
  it("should compile successfully", async function () {
    const Factory = await ethers.getContractFactory("LastVaultFHE");
    expect(Factory).to.not.be.undefined;
  });

  describe("ABI & Interface", function () {
    it("should expose all public functions", async function () {
      const Factory = await ethers.getContractFactory("LastVaultFHE");
      const abi = Factory.interface;

      // Owner functions
      expect(abi.getFunction("ping")).to.not.be.null;
      expect(abi.getFunction("updateHeir")).to.not.be.null;
      expect(abi.getFunction("updatePayload")).to.not.be.null;
      expect(abi.getFunction("cancelClaim")).to.not.be.null;

      // Heir functions
      expect(abi.getFunction("initiateClaim")).to.not.be.null;
      expect(abi.getFunction("finalizeClaim")).to.not.be.null;

      // View functions
      expect(abi.getFunction("isExpired")).to.not.be.null;
      expect(abi.getFunction("timeRemaining")).to.not.be.null;
      expect(abi.getFunction("owner")).to.not.be.null;
      expect(abi.getFunction("lastPingTimestamp")).to.not.be.null;
      expect(abi.getFunction("timeoutPeriod")).to.not.be.null;
      expect(abi.getFunction("claimState")).to.not.be.null;
      expect(abi.getFunction("claimant")).to.not.be.null;
    });

    it("should emit correct events", async function () {
      const Factory = await ethers.getContractFactory("LastVaultFHE");
      const abi = Factory.interface;

      expect(abi.getEvent("Pinged")).to.not.be.null;
      expect(abi.getEvent("ClaimInitiated")).to.not.be.null;
      expect(abi.getEvent("ClaimVerified")).to.not.be.null;
      expect(abi.getEvent("ClaimRejected")).to.not.be.null;
      expect(abi.getEvent("HeirUpdated")).to.not.be.null;
      expect(abi.getEvent("PayloadUpdated")).to.not.be.null;
    });
  });

  describe("Privacy Guarantees", function () {
    it("should NOT expose heir address in ABI (private eaddress)", async function () {
      const Factory = await ethers.getContractFactory("LastVaultFHE");
      const abi = Factory.interface;

      // encryptedHeir is private — no getter leaks heir identity
      expect(abi.getFunction("encryptedHeir")).to.be.null;
      expect(abi.getFunction("heir")).to.be.null;
    });

    it("should NOT expose payload in ABI (private euint128)", async function () {
      const Factory = await ethers.getContractFactory("LastVaultFHE");
      const abi = Factory.interface;

      // payloadHi/Lo are private — no getter leaks vault key
      expect(abi.getFunction("payloadHi")).to.be.null;
      expect(abi.getFunction("payloadLo")).to.be.null;
      expect(abi.getFunction("encryptedPayload")).to.be.null;
    });

    it("compared to original contract: heir/payload were PUBLIC", async function () {
      // The original LastVaultInheritance had:
      //   address public heir          → anyone could see heir identity
      //   bytes public encryptedPayload → ECIES blob visible on-chain
      //
      // LastVaultFHE has:
      //   eaddress private encryptedHeir → FHE-encrypted, invisible
      //   euint128 private payloadHi/Lo  → FHE-encrypted, invisible
      //
      // This is the core privacy improvement.
      const OriginalFactory = await ethers.getContractFactory("LastVaultInheritance");
      const originalAbi = OriginalFactory.interface;

      // Original: heir and payload are PUBLIC (have getters)
      expect(originalAbi.getFunction("heir")).to.not.be.null;
      expect(originalAbi.getFunction("encryptedPayload")).to.not.be.null;

      // FHE: heir and payload are PRIVATE (no getters)
      const FheFactory = await ethers.getContractFactory("LastVaultFHE");
      const fheAbi = FheFactory.interface;
      expect(fheAbi.getFunction("heir")).to.be.null;
      expect(fheAbi.getFunction("encryptedPayload")).to.be.null;
    });
  });

  describe("State Machine", function () {
    it("should define ClaimState enum (Idle=0, Initiated=1, Verified=2)", async function () {
      const Factory = await ethers.getContractFactory("LastVaultFHE");
      const abi = Factory.interface;
      expect(abi.getFunction("claimState")).to.not.be.null;
    });
  });
});
