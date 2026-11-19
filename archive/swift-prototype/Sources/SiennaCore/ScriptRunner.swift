import Foundation

/// Runs the two kinds of external commands Sienna needs. A protocol so the Kaset backend can
/// be tested with a fake on any platform.
public protocol ScriptRunner: Sendable {
    /// Runs AppleScript source and returns what it printed (trailing newline trimmed).
    func osascript(_ source: String) async throws -> String
    /// Runs a shortcut from the Shortcuts app by name.
    func runShortcut(_ name: String) async throws
}

public struct ScriptError: Error, Equatable, Sendable {
    public var status: Int32
    public var message: String
}

/// Real runner: `/usr/bin/osascript` and `/usr/bin/shortcuts`. Arguments are passed as an
/// argv array, never through a shell, so shortcut names cannot inject commands.
public struct ProcessScriptRunner: ScriptRunner {
    public init() {}

    public func osascript(_ source: String) async throws -> String {
        try await run("/usr/bin/osascript", ["-e", source])
    }

    public func runShortcut(_ name: String) async throws {
        _ = try await run("/usr/bin/shortcuts", ["run", name])
    }

    private func run(_ path: String, _ arguments: [String]) async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.global().async {
                let process = Process()
                process.executableURL = URL(fileURLWithPath: path)
                process.arguments = arguments
                let out = Pipe(), err = Pipe()
                process.standardOutput = out
                process.standardError = err
                do {
                    try process.run()
                } catch {
                    continuation.resume(throwing: error)
                    return
                }
                // Drain both pipes at the same time, and before waiting: if one were read to the
                // end first, a child that filled the other would block on it forever.
                var errData = Data()
                let errDone = DispatchSemaphore(value: 0)
                DispatchQueue.global().async {
                    errData = err.fileHandleForReading.readDataToEndOfFile()
                    errDone.signal()
                }
                let outData = out.fileHandleForReading.readDataToEndOfFile()
                errDone.wait()
                process.waitUntilExit()
                if process.terminationStatus == 0 {
                    let text = String(decoding: outData, as: UTF8.self)
                    continuation.resume(returning: text.trimmingCharacters(in: .whitespacesAndNewlines))
                } else {
                    let text = String(decoding: errData, as: UTF8.self)
                    continuation.resume(throwing: ScriptError(
                        status: process.terminationStatus,
                        message: text.trimmingCharacters(in: .whitespacesAndNewlines)
                    ))
                }
            }
        }
    }
}
