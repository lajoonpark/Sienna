import Foundation

/// The AppleScript Sienna sends to Kaset. Kept as pure strings so it is unit tested; the verbs
/// come from Kaset's AppleScript docs (docs/applescript.md in sozercan/kaset).
public enum KasetScripts {

    static func tell(_ verb: String) -> String {
        "tell application \"Kaset\" to \(verb)"
    }

    /// The script for a command, or nil if Kaset cannot do it (it has no seek).
    public static func script(for command: PlayerCommand) -> String? {
        switch command {
        case .togglePlayPause: tell("playpause")
        case .next: tell("next track")
        case .previous: tell("previous track")
        case .like: tell("like track")
        case .setVolume(let volume): tell("set volume \(percent(volume))")
        case .seek: nil
        }
    }

    /// 0...1 as Kaset's whole-number 0...100.
    static func percent(_ volume: Double) -> Int {
        guard volume.isFinite else { return 0 }
        return Int((min(max(volume, 0), 1) * 100).rounded())
    }

    /// Plays video IDs in order. Returns nil if any ID is not a plain YouTube ID (they are
    /// spliced into the script, so this is the injection guard).
    public static func play(videoIds: [String]) -> String? {
        guard !videoIds.isEmpty, videoIds.allSatisfy(PinnedItem.isValidVideoId) else { return nil }
        if videoIds.count == 1 {
            return tell("play video \"\(videoIds[0])\"")
        }
        let list = videoIds.map { "\"\($0)\"" }.joined(separator: ", ")
        return tell("play videos {\(list)} starting at 1")
    }

    /// Asks for player info only if Kaset is already running, so polling now-playing never
    /// launches the app. Prints an empty string when it is not running.
    public static let playerInfo = """
    if application "Kaset" is running then
        tell application "Kaset" to get player info
    else
        return ""
    end if
    """
}
