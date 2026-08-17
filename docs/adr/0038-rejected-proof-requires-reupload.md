# Require re-upload after rejected proof

**Status:** accepted

When a PIC rejects a submitted Bukti Transfer, the Donor enters a distinct “Bukti Transfer perlu diperbaiki” state and must be able to upload a replacement. The state must remain distinguishable from no proof submitted and from proof awaiting review; if the current data contract cannot represent that distinction, the missing representation becomes a separate backend requirement rather than a frontend inference.
