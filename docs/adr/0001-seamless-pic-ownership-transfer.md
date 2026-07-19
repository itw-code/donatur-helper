# 1. Seamless PIC Ownership Transfer via Token Association

When transferring campaign ownership to a new PIC, we expire the old PIC token and issue a new token with its `CreatedBy` field set to the new PIC's WhatsApp number. This lets the new PIC manage the campaign seamlessly without a database change.

## Context
Each campaign is authenticated via a PIC token stored in the `Tokens` sheet. The Member dashboard dynamically queries campaigns the user can manage by filtering active tokens where `CreatedBy` matches the user's WhatsApp number. 

## Decision
Instead of adding a new `PIC_WhatsApp` column to the `Campaigns` sheet (which would require updating multiple database schemas and serialization methods), we transfer campaign ownership by:
1. Setting the old PIC token status to `Expired`.
2. Appending a new `PIC` token to the `Tokens` sheet, linked to the Campaign ID, with `CreatedBy` set to the new PIC's WhatsApp number.

This leverages our existing token-based authorization structure while achieving a seamless user experience.
