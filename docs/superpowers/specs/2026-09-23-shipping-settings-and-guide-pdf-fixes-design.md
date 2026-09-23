# Shipping Settings Authorization and Guide PDF Recovery

## Goal

Keep shipping configuration under owner control and prevent a downloaded shipping-guide PDF from becoming unavailable when PostgreSQL commits its reference but the client loses the acknowledgment.

## Design

- Add an owner-only `shipping:manage` capability. Preserve `shipping:operate` for both owners and operators so operators can continue quoting, selecting, and retrieving guides.
- Require `shipping:manage` only for mutations of global and municipal shipping policy, including legacy carrier rules. Continue to require `shipping:operate` for operational reads and actions.
- If attaching a stored PDF to a guide job throws, read the job again before cleanup. If the saved key is present, treat the attachment as committed. If a different key won a race, delete only the unreferenced new object and return the winner. If no key is referenced, delete the new object and rethrow the attach error. If the database cannot be read, preserve the object rather than risk deleting a referenced PDF.

## Verification

- Test that operators retain operational shipping access but receive 403 for global and municipal policy writes; owners retain those writes.
- Test attach errors both when the database committed the object key and when it did not; only delete the object when a successful database read confirms it is unreferenced.
- Run the API tests and the full project verification before merging.
