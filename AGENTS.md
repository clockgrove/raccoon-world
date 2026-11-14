# Raccoon World agent rules

Raccoon World is a public repository: one world built on the Clockgrove platform. These rules apply to every contributor, human or agent.

## Public repository

- Never commit secrets, credentials, tokens, personal data or anything private. Model keys come from the environment.
- If a task seems to need something private, stop and ask in the issue.

## Scope

- **World-specific only.** Engine, runtime, contract and tool changes belong in [clockgrove/clockgrove](https://github.com/clockgrove/clockgrove) or [clockgrove/assetforge](https://github.com/clockgrove/assetforge), not here. If world content needs a platform change, open an issue there.
- **The world's look is governed by its style bible and reference images.** Read them before any art or UI work.
- **Every asset carries provenance.** Generated art is MIT as Clockgrove work and is tagged AI-generated (IPTC Digital Source Type). Approval is human.
- **Media goes in Git LFS:** `.gitattributes` decides what's stored there.
- **Never imitate a specific existing game, studio or living artist.** Describe the look in plain visual terms.

## Dependencies

- **Use an existing SDK or library before writing your own.** For a protocol, a file format, a codec or a provider's API, look first for the official SDK, then for a maintained library whose licence this repository can take. Hand-written protocol code falls behind its standard, and every line of it is ours to maintain.
- **Write it yourself only when nothing fits:** no library exists, its licence doesn't fit, it brings an unwanted install script or native binary, or the output must be byte-for-byte deterministic. Record the exception as an ADR in `docs/adr/`: what you looked at and why it didn't fit.
- **Name the choice in the pull request:** the SDK or library you chose, or the recorded exception that applies. A reviewer treats unrecorded hand-written protocol, format or codec code as a finding.
