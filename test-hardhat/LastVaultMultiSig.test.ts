import { expect } from "chai";
import { ethers } from "hardhat";
import { LastVaultMultiSig } from "../typechain-types";

describe("LastVaultMultiSig", function () {
  const TIMEOUT = 90 * 24 * 60 * 60; // 90 days
  const PAYLOAD = ethers.toUtf8Bytes("encrypted-master-key-placeholder");

  async function deployFixture(threshold = 2) {
    const [deployer, signer1, signer2, signer3, heir, outsider] =
      await ethers.getSigners();

    const factory = await ethers.getContractFactory("LastVaultMultiSig");
    const contract = await factory.deploy(
      [signer1.address, signer2.address, signer3.address],
      threshold,
      heir.address,
      TIMEOUT,
      PAYLOAD
    );

    return { contract, deployer, signer1, signer2, signer3, heir, outsider };
  }

  describe("Deployment", function () {
    it("should deploy with correct state", async function () {
      const { contract, signer1, signer2, signer3, heir } =
        await deployFixture();

      expect(await contract.requiredApprovals()).to.equal(2);
      expect(await contract.heir()).to.equal(heir.address);
      expect(await contract.timeoutPeriod()).to.equal(TIMEOUT);
      expect(await contract.getSignerCount()).to.equal(3);
      expect(await contract.isSigner(signer1.address)).to.be.true;
      expect(await contract.isSigner(signer2.address)).to.be.true;
      expect(await contract.isSigner(signer3.address)).to.be.true;
      expect(await contract.currentPingEpoch()).to.equal(0);
    });

    it("should revert if threshold > signer count", async function () {
      const [, s1, s2, , heir] = await ethers.getSigners();
      const factory = await ethers.getContractFactory("LastVaultMultiSig");
      await expect(
        factory.deploy([s1.address, s2.address], 3, heir.address, TIMEOUT, PAYLOAD)
      ).to.be.revertedWith("LastVault: Threshold exceeds signer count");
    });

    it("should revert if threshold is 0", async function () {
      const [, s1, , , heir] = await ethers.getSigners();
      const factory = await ethers.getContractFactory("LastVaultMultiSig");
      await expect(
        factory.deploy([s1.address], 0, heir.address, TIMEOUT, PAYLOAD)
      ).to.be.revertedWith("LastVault: Threshold must be > 0");
    });

    it("should revert if no signers", async function () {
      const [, , , , heir] = await ethers.getSigners();
      const factory = await ethers.getContractFactory("LastVaultMultiSig");
      await expect(
        factory.deploy([], 1, heir.address, TIMEOUT, PAYLOAD)
      ).to.be.revertedWith("LastVault: No signers");
    });

    it("should revert on duplicate signers", async function () {
      const [, s1, , , heir] = await ethers.getSigners();
      const factory = await ethers.getContractFactory("LastVaultMultiSig");
      await expect(
        factory.deploy([s1.address, s1.address], 1, heir.address, TIMEOUT, PAYLOAD)
      ).to.be.revertedWith("LastVault: Duplicate signer");
    });

    it("should revert on zero address signer", async function () {
      const [, s1, , , heir] = await ethers.getSigners();
      const factory = await ethers.getContractFactory("LastVaultMultiSig");
      await expect(
        factory.deploy(
          [s1.address, ethers.ZeroAddress],
          1,
          heir.address,
          TIMEOUT,
          PAYLOAD
        )
      ).to.be.revertedWith("LastVault: Zero address signer");
    });

    it("should revert if timeout < 1 day", async function () {
      const [, s1, , , heir] = await ethers.getSigners();
      const factory = await ethers.getContractFactory("LastVaultMultiSig");
      await expect(
        factory.deploy([s1.address], 1, heir.address, 3600, PAYLOAD) // 1 hour
      ).to.be.revertedWith("LastVault: Timeout must be >= 1 day");
    });
  });

  describe("Ping Approval", function () {
    it("should record signer approval", async function () {
      const { contract, signer1 } = await deployFixture();

      await contract.connect(signer1).approvePing();

      expect(await contract.hasSignerApproved(0, signer1.address)).to.be.true;
      const [count, required] = await contract.getApprovalStatus(0);
      expect(count).to.equal(1);
      expect(required).to.equal(2);
    });

    it("should NOT reset timer with single approval (2-of-3)", async function () {
      const { contract, signer1 } = await deployFixture();
      const pingBefore = await contract.lastPingTimestamp();

      // Advance time
      await ethers.provider.send("evm_increaseTime", [3600]);
      await ethers.provider.send("evm_mine", []);

      await contract.connect(signer1).approvePing();

      // Timer should NOT have reset (still need 1 more approval)
      expect(await contract.lastPingTimestamp()).to.equal(pingBefore);
      expect(await contract.currentPingEpoch()).to.equal(0);
    });

    it("should reset timer when threshold reached", async function () {
      const { contract, signer1, signer2 } = await deployFixture();

      await contract.connect(signer1).approvePing();
      const tx = await contract.connect(signer2).approvePing();
      const receipt = await tx.wait();

      // Timer reset + epoch incremented
      expect(await contract.currentPingEpoch()).to.equal(1);

      // Check events
      const block = await ethers.provider.getBlock(receipt!.blockNumber);
      expect(await contract.lastPingTimestamp()).to.equal(block!.timestamp);
    });

    it("should revert if non-signer tries to approve", async function () {
      const { contract, outsider } = await deployFixture();
      await expect(
        contract.connect(outsider).approvePing()
      ).to.be.revertedWith("LastVault: Not a signer");
    });

    it("should revert if signer approves same epoch twice", async function () {
      const { contract, signer1 } = await deployFixture();
      await contract.connect(signer1).approvePing();
      await expect(
        contract.connect(signer1).approvePing()
      ).to.be.revertedWith("LastVault: Already approved this epoch");
    });

    it("should allow signer to approve new epoch after ping", async function () {
      const { contract, signer1, signer2 } = await deployFixture();

      // Epoch 0: approve
      await contract.connect(signer1).approvePing();
      await contract.connect(signer2).approvePing();
      expect(await contract.currentPingEpoch()).to.equal(1);

      // Epoch 1: same signers can approve again
      await contract.connect(signer1).approvePing();
      expect(await contract.hasSignerApproved(1, signer1.address)).to.be.true;
    });

    it("should work with 1-of-1 (single signer)", async function () {
      const [, s1, , , heir] = await ethers.getSigners();
      const factory = await ethers.getContractFactory("LastVaultMultiSig");
      const contract = await factory.deploy(
        [s1.address],
        1,
        heir.address,
        TIMEOUT,
        PAYLOAD
      );

      await contract.connect(s1).approvePing();
      expect(await contract.currentPingEpoch()).to.equal(1);
    });

    it("should work with 3-of-3 (all must approve)", async function () {
      const { contract, signer1, signer2, signer3 } = await deployFixture(3);

      await contract.connect(signer1).approvePing();
      expect(await contract.currentPingEpoch()).to.equal(0);

      await contract.connect(signer2).approvePing();
      expect(await contract.currentPingEpoch()).to.equal(0);

      await contract.connect(signer3).approvePing();
      expect(await contract.currentPingEpoch()).to.equal(1);
    });
  });

  describe("Claim", function () {
    it("should allow heir to claim after timeout", async function () {
      const { contract, heir } = await deployFixture();

      // Fast-forward past timeout
      await ethers.provider.send("evm_increaseTime", [TIMEOUT + 1]);
      await ethers.provider.send("evm_mine", []);

      expect(await contract.isExpired()).to.be.true;

      const tx = await contract.connect(heir).claim();
      await expect(tx).to.emit(contract, "SecretClaimed").withArgs(heir.address);
    });

    it("should revert if timeout not reached", async function () {
      const { contract, heir } = await deployFixture();
      await expect(
        contract.connect(heir).claim()
      ).to.be.revertedWith("LastVault: Signers are still active (timeout not reached)");
    });

    it("should revert if non-heir tries to claim", async function () {
      const { contract, outsider } = await deployFixture();
      await ethers.provider.send("evm_increaseTime", [TIMEOUT + 1]);
      await ethers.provider.send("evm_mine", []);

      await expect(
        contract.connect(outsider).claim()
      ).to.be.revertedWith("LastVault: Not the designated heir");
    });

    it("should block claim after successful ping", async function () {
      const { contract, signer1, signer2, heir } = await deployFixture();

      // Almost expired
      await ethers.provider.send("evm_increaseTime", [TIMEOUT - 100]);
      await ethers.provider.send("evm_mine", []);

      // Signers ping — resets timer
      await contract.connect(signer1).approvePing();
      await contract.connect(signer2).approvePing();

      // Heir tries to claim — should fail (timer was reset)
      await expect(
        contract.connect(heir).claim()
      ).to.be.revertedWith("LastVault: Signers are still active (timeout not reached)");
    });
  });

  describe("View Functions", function () {
    it("isExpired should return false initially", async function () {
      const { contract } = await deployFixture();
      expect(await contract.isExpired()).to.be.false;
    });

    it("timeRemaining should decrease over time", async function () {
      const { contract } = await deployFixture();
      const remaining1 = await contract.timeRemaining();

      await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
      await ethers.provider.send("evm_mine", []);

      const remaining2 = await contract.timeRemaining();
      expect(remaining2).to.be.lt(remaining1);
    });

    it("timeRemaining should be 0 after timeout", async function () {
      const { contract } = await deployFixture();
      await ethers.provider.send("evm_increaseTime", [TIMEOUT + 1]);
      await ethers.provider.send("evm_mine", []);
      expect(await contract.timeRemaining()).to.equal(0);
    });

    it("getSigners should return all signers", async function () {
      const { contract, signer1, signer2, signer3 } = await deployFixture();
      const s = await contract.getSigners();
      expect(s).to.deep.equal([signer1.address, signer2.address, signer3.address]);
    });
  });
});
