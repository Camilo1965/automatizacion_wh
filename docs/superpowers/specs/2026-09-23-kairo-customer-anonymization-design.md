# KAIRO Customer Profile Anonymization Design

## Problem

KAIRO now stores a customer profile that contains a normalized phone number and display name. The existing confirmed data-subject anonymization flow redacts order, message, and conversation PII, but does not clear the new customer profile. A profile therefore remains directly identifiable after the operation reports the related data as anonymized.

## Decision

Extend only the existing explicit customer data-subject anonymization operation. Keep the customer UUID as the stable internal reference, but clear the profile's display name and normalized phone, reset marketing consent to `unknown` with all evidence fields null, and mark the profile for review so it cannot be resolved as an active identity. Allow a null normalized phone and retain uniqueness for non-null normalized phones. Anonymize linked orders and conversations by customer ID as well as legacy unlinked records matching the submitted phone; preserve operational records and relationships while applying the existing redaction behavior.

The feature does not introduce automatic retention durations, a new scheduled execution class, Ads exports, consent changes, profile merges, or deletion of operational order/conversation history. Automatic retention remains governed by existing human-approved policies and the execution gate.

## Boundaries and behavior

- The profile lookup is by a valid existing normalized phone; no free-form identity resolution is added.
- Every order and conversation linked to the profile is included even if its stored phone no longer matches the profile phone.
- Unlinked historical rows continue to be found by the submitted phone and redacted using existing logic.
- After anonymization, the stable customer ID can still organize non-identifying history, but the profile cannot match a future inbound phone and does not claim consent.
- Customer directory and detail contracts represent an anonymized phone as `null` and render a neutral unavailable label.
- The PII inventory documents the customer profile fields and clarifies that scheduled customer-profile retention has no approved duration until a human approves one.

## Verification

Use a real PostgreSQL integration test that creates a profile and linked order/conversation records, runs the existing anonymization operation, then verifies the profile has no direct identity or consent evidence, the operational records remain linked, their direct PII is redacted, and a later resolution of the former phone creates or resolves only a new active profile. Run focused privacy/customer tests, typechecks, full verification, and a read-only aggregate reconciliation on the isolated test database.
