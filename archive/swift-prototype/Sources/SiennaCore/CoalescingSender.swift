import Foundation

/// Sends the newest value and drops the ones it was too busy to send. Dragging the volume knob
/// makes dozens of values a second, and each one is a process launch (`osascript`); this keeps
/// one in flight and always finishes on the latest value.
public actor CoalescingSender<Value: Sendable> {
    private var pending: Value?
    private var running = false
    private let send: @Sendable (Value) async -> Void

    public init(send: @escaping @Sendable (Value) async -> Void) {
        self.send = send
    }

    public func submit(_ value: Value) async {
        pending = value
        guard !running else { return }
        running = true
        while let next = pending {
            pending = nil
            await send(next)
        }
        running = false
    }
}
