import Foundation

/// Drives Kaset through its AppleScript interface and the Shortcuts app.
///
/// Kaset has no way to list your library, so this backend can only start things you name
/// (video IDs, or a shortcut). See `PinnedItem`.
public final class KasetBackend: MusicBackend {
    private let runner: ScriptRunner

    public init(runner: ScriptRunner = ProcessScriptRunner()) {
        self.runner = runner
    }

    /// Kaset's AppleScript has no seek command, so the record cannot scrub through it.
    public var canSeek: Bool { false }

    public func nowPlaying() async -> NowPlaying {
        guard let text = try? await runner.osascript(KasetScripts.playerInfo) else { return .idle }
        return KasetPlayerInfo.nowPlaying(fromJSON: text)
    }

    public func send(_ command: PlayerCommand) async {
        guard let script = KasetScripts.script(for: command) else { return }
        do {
            _ = try await runner.osascript(script)
        } catch {
            siennaLog("Sienna: Kaset command \(command) failed: \(error)")
        }
    }

    public func open(_ item: PinnedItem) async {
        do {
            switch item.action {
            case .songs(let ids)?:
                if let script = KasetScripts.play(videoIds: ids) { _ = try await runner.osascript(script) }
            case .shortcut(let name)?:
                try await runner.runShortcut(name)
            case nil:
                break
            }
        } catch {
            siennaLog("Sienna: could not open \"\(item.title)\": \(error)")
        }
    }
}
