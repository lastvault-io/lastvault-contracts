import { expect } from "chai";
import { ethers } from "hardhat";

/**
 * CrossChainClaimRelay — Wave 5 cross-chain trigger relay
 *
 * Behavioural tests for the event-relay pattern that broadcasts a verified
 * claim from a source chain (FHE-enabled, e.g. Arbitrum Sepolia) to a
 * destination chain (high-liquidity, e.g. Base Sepolia).
 */

describe("CrossChainClaimRelay", function () {
  let relay: any;
  let owner: any, relayer1: any, relayer2: any, vault: any, claimant: any, other: any;

  beforeEach(async function () {
    [owner, relayer1, relayer2, vault, claimant, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("CrossChainClaimRelay");
    relay = await Factory.deploy();
    await relay.waitForDeployment();
  });

  describe("Deployment", function () {
    it("owner is the deployer", async function () {
      expect(await relay.owner()).to.equal(owner.address);
    });

    it("starts with zero relayers", async function () {
      expect(await relay.relayerCount()).to.equal(0);
    });

    it("starts with no verified claim", async function () {
      expect(await relay.isClaimVerified()).to.be.false;
      expect(await relay.latestVerified()).to.be.false;
    });
  });

  describe("Relayer management", function () {
    it("owner can add a relayer", async function () {
      await relay.addRelayer(relayer1.address);
      expect(await relay.relayers(relayer1.address)).to.be.true;
      expect(await relay.relayerCount()).to.equal(1);
    });

    it("rejects duplicate relayer registration", async function () {
      await relay.addRelayer(relayer1.address);
      await expect(relay.addRelayer(relayer1.address)).to.be.reverted;
    });

    it("rejects zero address as relayer", async function () {
      await expect(relay.addRelayer(ethers.ZeroAddress)).to.be.reverted;
    });

    it("rejects non-owner attempts to add relayer", async function () {
      await expect(
        relay.connect(other).addRelayer(relayer2.address)
      ).to.be.reverted;
    });

    it("owner can remove a relayer", async function () {
      await relay.addRelayer(relayer1.address);
      await relay.removeRelayer(relayer1.address);
      expect(await relay.relayers(relayer1.address)).to.be.false;
      expect(await relay.relayerCount()).to.equal(0);
    });

    it("rejects removing a non-relayer", async function () {
      await expect(
        relay.removeRelayer(other.address)
      ).to.be.reverted;
    });
  });

  describe("Source-chain signal emission", function () {
    it("emits ClaimVerifiedSignal with all expected fields", async function () {
      const tx = await relay.emitClaimVerified(vault.address, claimant.address);
      const receipt = await tx.wait();
      const event = receipt!.logs.find((l: any) => {
        try {
          const parsed = relay.interface.parseLog(l);
          return parsed?.name === "ClaimVerifiedSignal";
        } catch { return false; }
      });
      expect(event).to.not.be.undefined;
      const parsed = relay.interface.parseLog(event)!;
      expect(parsed.args.sourceVault).to.equal(vault.address);
      expect(parsed.args.claimant).to.equal(claimant.address);
    });

    it("rejects zero claimant", async function () {
      await expect(
        relay.emitClaimVerified(vault.address, ethers.ZeroAddress)
      ).to.be.reverted;
    });

    it("rejects zero vault", async function () {
      await expect(
        relay.emitClaimVerified(ethers.ZeroAddress, claimant.address)
      ).to.be.reverted;
    });
  });

  describe("Destination-chain ingestion", function () {
    const sourceChainId = 421614n; // Arbitrum Sepolia
    const sourceTxHash = ethers.id("source-tx");

    beforeEach(async function () {
      await relay.addRelayer(relayer1.address);
    });

    it("authorised relayer can ingest a signal", async function () {
      await relay
        .connect(relayer1)
        .ingestClaimSignal(sourceChainId, vault.address, claimant.address, sourceTxHash);
      expect(await relay.isClaimVerified()).to.be.true;
      expect(await relay.latestClaimantPlaintext()).to.equal(claimant.address);
    });

    it("owner can ingest directly (implicit relayer)", async function () {
      await relay.ingestClaimSignal(sourceChainId, vault.address, claimant.address, sourceTxHash);
      expect(await relay.isClaimVerified()).to.be.true;
    });

    it("rejects non-relayer ingest", async function () {
      await expect(
        relay
          .connect(other)
          .ingestClaimSignal(sourceChainId, vault.address, claimant.address, sourceTxHash)
      ).to.be.reverted;
    });

    it("populates per-vault mapping", async function () {
      await relay
        .connect(relayer1)
        .ingestClaimSignal(sourceChainId, vault.address, claimant.address, sourceTxHash);
      expect(await relay.isVaultClaimVerified(sourceChainId, vault.address)).to.be.true;
      expect(await relay.getVaultClaimant(sourceChainId, vault.address)).to.equal(claimant.address);
    });

    it("rejects zero claimant on ingest", async function () {
      await expect(
        relay
          .connect(relayer1)
          .ingestClaimSignal(sourceChainId, vault.address, ethers.ZeroAddress, sourceTxHash)
      ).to.be.reverted;
    });

    it("rejects zero vault on ingest", async function () {
      await expect(
        relay
          .connect(relayer1)
          .ingestClaimSignal(sourceChainId, ethers.ZeroAddress, claimant.address, sourceTxHash)
      ).to.be.reverted;
    });
  });

  describe("Replay protection", function () {
    const sourceChainId = 421614n;
    const sourceTxHash = ethers.id("replay-test");

    beforeEach(async function () {
      await relay.addRelayer(relayer1.address);
      await relay.addRelayer(relayer2.address);
    });

    it("second relayer attempting the same signal succeeds idempotently (no-op)", async function () {
      await relay
        .connect(relayer1)
        .ingestClaimSignal(sourceChainId, vault.address, claimant.address, sourceTxHash);

      // Second relayer with same parameters — should not revert, just no-op
      await relay
        .connect(relayer2)
        .ingestClaimSignal(sourceChainId, vault.address, claimant.address, sourceTxHash);

      // Verification state unchanged
      expect(await relay.isClaimVerified()).to.be.true;
      expect(await relay.latestClaimantPlaintext()).to.equal(claimant.address);
    });
  });

  describe("IInheritanceVerifier interface", function () {
    it("exposes isClaimVerified() returning bool", function () {
      expect(relay.interface.getFunction("isClaimVerified")).to.not.be.null;
    });

    it("exposes getVerifiedClaimant() returning eaddress (zero handle for cross-chain)", function () {
      expect(relay.interface.getFunction("getVerifiedClaimant")).to.not.be.null;
    });
  });

  describe("Ownership", function () {
    it("owner can transfer ownership", async function () {
      await relay.transferOwnership(other.address);
      expect(await relay.owner()).to.equal(other.address);
    });

    it("rejects zero address ownership transfer", async function () {
      await expect(
        relay.transferOwnership(ethers.ZeroAddress)
      ).to.be.reverted;
    });

    it("non-owner cannot transfer ownership", async function () {
      await expect(
        relay.connect(other).transferOwnership(other.address)
      ).to.be.reverted;
    });
  });
});
