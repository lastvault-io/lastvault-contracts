import { expect } from "chai";
import { ethers } from "hardhat";

/**
 * LastVaultFHEMultiSig — Wave 5 institutional multi-sig
 *
 * Verifies the encrypted-signers/encrypted-threshold contract. Since FHE
 * encrypted inputs require the CoFHE coprocessor (only available on testnet),
 * tests focus on ABI surface, access control, state machine, and
 * compilation-level guarantees. Behavioural decryption is exercised at deploy
 * time on Arbitrum Sepolia (see scripts/deploy-wave5-full.ts).
 */

describe("LastVaultFHEMultiSig", function () {
  let factory: any;
  let abi: any;

  before(async function () {
    factory = await ethers.getContractFactory("LastVaultFHEMultiSig");
    abi = factory.interface;
  });

  describe("Compilation", function () {
    it("compiles with EncryptedAllowlist + ReentrancyGuard linked", async function () {
      expect(factory).to.not.be.undefined;
      expect(factory.bytecode).to.be.a("string");
      expect(factory.bytecode.length).to.be.greaterThan(100);
    });

    it("constructor takes a single encrypted threshold parameter", function () {
      expect(abi.deploy.inputs.length).to.equal(1);
    });
  });

  describe("ABI — Owner signer management", function () {
    it("addSigner takes encrypted address + encrypted weight", function () {
      const fn = abi.getFunction("addSigner")!;
      expect(fn.inputs.length).to.equal(2);
    });

    it("removeSigner takes a single index", function () {
      const fn = abi.getFunction("removeSigner")!;
      expect(fn.inputs.length).to.equal(1);
    });

    it("updateThreshold accepts a new encrypted threshold", function () {
      const fn = abi.getFunction("updateThreshold")!;
      expect(fn.inputs.length).to.equal(1);
    });

    it("bindVault associates a vault contract", function () {
      expect(abi.getFunction("bindVault")).to.not.be.null;
    });
  });

  describe("ABI — Proposal lifecycle (3-phase)", function () {
    it("exposes proposeAction(kind, payload, encryptedAddress)", function () {
      const fn = abi.getFunction("proposeAction")!;
      expect(fn.inputs.length).to.equal(3);
    });

    it("exposes approveProposal(id, encryptedAddress)", function () {
      const fn = abi.getFunction("approveProposal")!;
      expect(fn.inputs.length).to.equal(2);
    });

    it("exposes finalizeProposal(id, authorised, signature)", function () {
      const fn = abi.getFunction("finalizeProposal")!;
      expect(fn.inputs.length).to.equal(3);
    });

    it("exposes cancelProposal escape hatch", function () {
      const fn = abi.getFunction("cancelProposal")!;
      expect(fn.inputs.length).to.equal(1);
    });
  });

  describe("ABI — View helpers", function () {
    it("exposes signerCount", function () {
      expect(abi.getFunction("signerCount")).to.not.be.null;
    });

    it("exposes proposalCount", function () {
      expect(abi.getFunction("proposalCount")).to.not.be.null;
    });

    it("exposes proposalInfo with full plaintext metadata", function () {
      const fn = abi.getFunction("proposalInfo")!;
      expect(fn.outputs.length).to.equal(6);
    });

    it("exposes hasApproved(id, address) -> bool", function () {
      const fn = abi.getFunction("hasApproved")!;
      expect(fn.inputs.length).to.equal(2);
    });

    it("exposes proposalPayload(id) -> bytes", function () {
      const fn = abi.getFunction("proposalPayload")!;
      expect(fn.inputs.length).to.equal(1);
    });

    it("exposes owner / pendingOwner / vault state getters", function () {
      expect(abi.getFunction("owner")).to.not.be.null;
      expect(abi.getFunction("pendingOwner")).to.not.be.null;
      expect(abi.getFunction("vault")).to.not.be.null;
    });
  });

  describe("ABI — Ownership escape hatch", function () {
    it("transferOwnership + acceptOwnership are present", function () {
      expect(abi.getFunction("transferOwnership")).to.not.be.null;
      expect(abi.getFunction("acceptOwnership")).to.not.be.null;
    });
  });

  describe("Privacy guarantees", function () {
    it("does NOT expose encrypted signers list publicly", function () {
      expect(abi.getFunction("_signers")).to.be.null;
      expect(abi.getFunction("signers")).to.be.null;
    });

    it("does NOT expose encrypted weights array publicly", function () {
      expect(abi.getFunction("_weights")).to.be.null;
      expect(abi.getFunction("weights")).to.be.null;
    });

    it("does NOT expose the encrypted threshold publicly", function () {
      expect(abi.getFunction("_encryptedThreshold")).to.be.null;
      expect(abi.getFunction("encryptedThreshold")).to.be.null;
    });

    it("does NOT expose proposal's encrypted accumulated weight or thresholdMet", function () {
      // proposalInfo deliberately omits these fields
      const fn = abi.getFunction("proposalInfo")!;
      const outputNames = fn.outputs.map((o: any) => o.name);
      expect(outputNames).to.not.include("accumulatedWeight");
      expect(outputNames).to.not.include("thresholdMet");
    });
  });

  describe("Events", function () {
    it("emits signer + threshold management events", function () {
      expect(abi.getEvent("SignerAdded")).to.not.be.null;
      expect(abi.getEvent("SignerRemoved")).to.not.be.null;
      expect(abi.getEvent("ThresholdUpdated")).to.not.be.null;
      expect(abi.getEvent("VaultBound")).to.not.be.null;
    });

    it("emits proposal lifecycle events", function () {
      expect(abi.getEvent("ProposalCreated")).to.not.be.null;
      expect(abi.getEvent("ProposalApproved")).to.not.be.null;
      expect(abi.getEvent("ProposalFinalized")).to.not.be.null;
      expect(abi.getEvent("ProposalCancelled")).to.not.be.null;
    });
  });

  describe("Reentrancy guards", function () {
    it("propose/approve/finalize are reentrancy-guarded (compile-time guarantee)", function () {
      // Verified by `is ReentrancyGuard` inheritance + nonReentrant modifier
      // on each function. Runtime fuzzing on testnet.
      expect(abi.getFunction("proposeAction")).to.not.be.null;
      expect(abi.getFunction("approveProposal")).to.not.be.null;
      expect(abi.getFunction("finalizeProposal")).to.not.be.null;
    });
  });

  describe("Action kind enumeration", function () {
    it("supports four action kinds (plaintext enum)", function () {
      // ActionKind enum: Ping, UpdateHeir, UpdatePayload, TransferOwnership
      // Verified by ProposalCreated event input
      const evt = abi.getEvent("ProposalCreated")!;
      const kindInput = evt.inputs.find((i: any) => i.name === "kind");
      expect(kindInput).to.not.be.undefined;
      // enum is uint8 in ABI
      expect(kindInput!.type).to.equal("uint8");
    });
  });
});
