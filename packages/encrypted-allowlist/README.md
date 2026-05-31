# @lastvault.io/encrypted-allowlist

> The first reusable encrypted access-control primitive for **Fhenix CoFHE**.

`EncryptedAllowlist` lets a smart contract answer **"is this address allowed?"** using only encrypted data, with no plaintext identity ever appearing on-chain.

This package extracts the proven primitive from the [LastVault FHE Private Inheritance Suite](https://github.com/lastvault-io/lastvault-contracts) and packages it for reuse across the Fhenix ecosystem.

---

## Use cases

- **Private DAO membership** — vote without revealing your identity
- **Anonymous authorization** — grant access without exposing the grantee
- **Encrypted KYC allowlists** — regulator verifies eligibility without doxxing users
- **Confidential token-sale whitelists** — eligibility hidden from competitors
- **Hidden guild rosters** — membership invisible to outside observers

Anywhere you'd put a plaintext `mapping(address => bool) public allowlist`, you can now use an encrypted equivalent that reveals nothing on-chain.

---

## Install

```bash
npm install @lastvault.io/encrypted-allowlist @fhenixprotocol/cofhe-contracts
```

Or with Foundry:

```bash
forge install lastvault-io/lastvault-contracts
```

---

## Use as a library

```solidity
pragma solidity ^0.8.25;

import {EncryptedAllowlist} from "@lastvault.io/encrypted-allowlist/contracts/EncryptedAllowlist.sol";
import {FHE, InEaddress, ebool} from "@fhenixprotocol/cofhe-contracts/FHE.sol";

contract MyPrivateDAO {
    using EncryptedAllowlist for EncryptedAllowlist.List;

    EncryptedAllowlist.List private _members;
    address public admin;

    constructor(address _admin) {
        admin = _admin;
    }

    function addMember(InEaddress calldata _addr) external {
        require(msg.sender == admin, "DAO: not admin");
        _members.add(_addr);
    }

    /// @notice Returns an encrypted boolean. Decrypt via the threshold network.
    function isMember(InEaddress calldata _query) external returns (ebool) {
        return _members.isAllowed(_query);
    }
}
```

## Use as an inheritable base contract

The package also ships an `EncryptedAllowlistBase` abstract contract with an ownership pattern baked in:

```solidity
import {EncryptedAllowlistBase} from "@lastvault.io/encrypted-allowlist/contracts/EncryptedAllowlistBase.sol";

contract MyPrivateGuild is EncryptedAllowlistBase {
    constructor(address _owner) EncryptedAllowlistBase(_owner) {}
}
```

Now `MyPrivateGuild` already has `addMember`, `removeMember`, `replaceMember`, `memberCount`, and `checkMembership` — all encrypted.

---

## How it works

The core operation is an **encrypted OR-reduction** over `FHE.eq` results:

```
isAllowed(query) ==
    eq(query, member[0]) OR
    eq(query, member[1]) OR
    ...
    eq(query, member[N-1])
```

Because Fhenix exposes `FHE.and` and `FHE.not` but not `or` directly, the library composes OR via De Morgan's law:

```
a OR b == NOT(NOT(a) AND NOT(b))
```

The result is a single encrypted boolean. No plaintext member identity is ever materialised on-chain. A failed membership check leaks **nothing** about which member the query was compared against.

---

## Gas costs (testnet, Arbitrum Sepolia)

| Members in list | Approximate gas per `isAllowed` |
|-----------------|--------------------------------:|
| 1               | ~85k                            |
| 10              | ~520k                           |
| 50              | ~2.4M                           |
| 100             | ~4.7M                           |

Gas scales linearly with list size (one `FHE.eq` per member). For lists larger than 200 entries, consider splitting into multiple allowlists and composing the boolean results.

---

## Privacy properties

✅ **Member identities** are never revealed on-chain (stored as `eaddress`).
✅ **Failed checks** are indistinguishable from successful ones until decrypted.
✅ **List size is public** (acceptable — knowing "there are 5 members" doesn't help an attacker who can't see WHO).
✅ **Decryption is gated** by the threshold network and per-recipient `FHE.allow` permits.

❌ **Insertion order** is observable on-chain (the index at which a member was added). If this matters for your use case, batch-add members in a single transaction.

---

## Origin

`EncryptedAllowlist` was extracted from the **LastVault FHE Private Inheritance Suite**, where it powers:

- Multi-heir membership checks (`LastVaultMultiHeir`)
- Institutional multi-sig signer verification (`LastVaultFHEMultiSig`)
- Confidential escrow beneficiary verification (`ConfidentialEscrow`)
- Auditor permit selection (`SelectiveDisclosure`)

All four contracts are live on Arbitrum Sepolia and use this same `EncryptedAllowlist` codebase. Production usage is the best test.

---

## License

MIT — see [LICENSE](./LICENSE).

---

## Links

- 🔗 Main repo: [lastvault-io/lastvault-contracts](https://github.com/lastvault-io/lastvault-contracts)
- 🌐 Live demo: [lastvault.io/fhenix](https://lastvault.io/fhenix)
- 🐦 Twitter: [@LastVault_io](https://x.com/LastVault_io)
- 📚 Fhenix CoFHE docs: [cofhe-docs.fhenix.zone](https://cofhe-docs.fhenix.zone)
