<p align="center"><img src="assets/banner.png" alt="WISP — rent your internet, get paid in NVDA" width="100%"></p>

# WISP — Wireless Internet Stock Provider

Share your spare internet bandwidth, and earn real tokenized **NVIDIA (NVDA)** on Robinhood Chain.

WISP is a bandwidth-sharing network. Providers run a lightweight client that relays traffic
for paying buyers (AI data teams, market researchers, ad verifiers) from their own connection.
You earn by the gigabyte you actually serve, plus an availability baseline for staying online.

This repository holds the **provider CLI** and the **reward vault contract** so you can read
exactly what runs on your machine and how rewards are paid out.

---

## Quick start

Any always-on machine works — a spare laptop, a mini-PC, a home server, or a VPS.
Only **Python 3.8+** is required (standard library only, nothing to `pip install`).

**Option A — clone the repo**

```bash
git clone https://github.com/WispNodes/wisp.git
cd wisp
python3 relay_client.py --wallet 0xYourWallet --ip residential
```

**Option B — download just the client**

```bash
curl -sL https://raw.githubusercontent.com/WispNodes/wisp/main/relay_client.py -o wisp-relay.py
python3 wisp-relay.py --wallet 0xYourWallet --ip residential
```

> Once the site is live you can also grab it from `https://wispnodes.net/relay_client.py`.

That's it. Your region is auto-detected from your connection; leave the terminal running to
stay online and earn. Stop any time with `Ctrl-C`.

**Requirement:** hold **250,000 $WISP** in the wallet you register with — this unlocks node
operation on-chain and sets your reward tier.

### Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--wallet` | — | your Robinhood Chain wallet (where rewards accrue) |
| `--ip` | `residential` | connection type: `residential`, `mobile`, `datacenter` |
| `--geo` | auto | region code (auto-detected from your IP if omitted) |
| `--tier` | `1` | your $WISP hold tier multiplier |
| `--ref` | — | referrer's wallet |
| `--coordinator` | official endpoint | override the coordinator URL |

---

## What the client actually does

- Registers your node, then long-polls for fetch jobs.
- For each job, it performs the HTTP request **from your own connection** and returns the
  response plus a real byte count. The coordinator meters those bytes and credits your node.
- It shares **bandwidth only** — never your files, device, or personal activity.
- Requests to private, internal, loopback, or link-local addresses are blocked, non-HTTP
  schemes are rejected, and response size is capped.

You can stop any time by closing the process.

---

## Rewards & claiming

Rewards accrue off-chain as you serve bandwidth and are claimed on-chain via an
admin-signed voucher. Claiming transfers real tokenized **NVDA** from the reward vault
directly to your wallet — you connect a wallet only to claim, and never hand over custody.

### `contracts/WispVault.sol`

The vault holds **pre-funded** NVDA and releases the exact reward only against a valid
EIP-712 voucher. Nothing is minted — every payout is a transfer of stock that already sits
in the vault, so its on-chain balance is honest **proof of reserves**. The vault is
non-custodial for providers and includes full owner recovery paths so no asset is ever stuck.

Build/inspect the contracts:

```bash
cd contracts
forge install OpenZeppelin/openzeppelin-contracts foundry-rs/forge-std
forge build
```

---


## Deployed contracts

On Robinhood Chain (chain id 4663):

| Contract | Address |
|----------|---------|
| WispVault | `0x1D66287b61E1D169ea52ebf103ED0b71CF69B807` |
| NVDA (reward token) | `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC` |

The vault holds pre-funded NVDA and its balance is public, on-chain proof of reserves.

## Links

- Site: https://wispnodes.net
- Docs: https://wispnodes.net/docs

## License

MIT — see [LICENSE](LICENSE).
