The provided ShopFlow repository is an existing production-style application.

Implement customer order cancellation while preserving the existing architecture and conventions.

Do not redesign the system unless a change is strictly required to implement the feature correctly.

FUNCTIONAL REQUIREMENTS

A customer must be able to cancel an order that has not been shipped.

Cancellation must:

1. Require a non-empty cancellation reason.
2. Reject a reason longer than 200 characters.
3. Change the order status to CANCELLED.
4. Store cancelledAt.
5. Store cancellationReason.
6. Restore inventory exactly once.
7. Send or record a cancellation notification.
8. Reject cancellation of SHIPPED orders.
9. Safely handle repeated cancellation requests without restoring inventory twice.
10. Be exposed through the existing full-stack user interface.
11. Include automated tests.

Preserve existing functionality.

Respect existing architectural boundaries and coding conventions wherever reasonably possible.

Do not perform unrelated refactoring.
Do not add unrelated functionality.
